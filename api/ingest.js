import { sb, dbGuard, predictProba, send, modelReady, DEFAULT_THRESHOLD } from './_lib.js';

const CHUNK_SIZE    = 1000;  // isi 1 file chunk_XXXX.json
const ROWS_PER_HOUR = 1000;  // kecepatan stream: 1000 row/jam
const HOUR_MS       = 3600_000;

async function fetchChunk(base, chunkIdx, cache) {
  if (cache.c === chunkIdx) return cache.rows;
  const r = await fetch(`${base}/stream/chunk_${String(chunkIdx).padStart(4, '0')}.json`);
  if (!r.ok) return null;
  const data = await r.json();
  cache.c = chunkIdx;
  cache.rows = data.rows || [];
  return cache.rows;
}

async function getRowsForBatch(base, batchIdx, rowsPerBatch, chunkSize, cache) {
  const startIdx = batchIdx * rowsPerBatch;
  const targetIdx = startIdx + rowsPerBatch;
  let currIdx = startIdx;
  const rows = [];

  while (currIdx < targetIdx) {
    const c = Math.floor(currIdx / chunkSize);
    const off = currIdx % chunkSize;
    const chunkRows = await fetchChunk(base, c, cache);
    if (!chunkRows || chunkRows.length === 0 || off >= chunkRows.length) {
      break;
    }
    const take = Math.min(targetIdx - currIdx, chunkRows.length - off);
    rows.push(...chunkRows.slice(off, off + take));
    currIdx += take;
    if (chunkRows.length < chunkSize) break;
  }
  return rows;
}

export default async function handler(req, res) {
  if (!modelReady()) return send(res, { error: 'model belum di-export' }, 500);
  if (!dbGuard(res)) return;

  const MAX_CATCHUP = parseInt(process.env.INGEST_MAX_CATCHUP || '6', 10);
  const { data: state, error: stateErr } = await sb.from('ingest_state').select('*').eq('id', 1).maybeSingle();
  if (stateErr || !state) return send(res, { error: 'ingest_state kosong atau error - jalankan schema.sql' }, 500);

  if (state.is_done) {
    return send(res, { ok: true, ingested: 0, cursor: state.cursor, done: true, note: 'stream sudah selesai' });
  }

  const cursor = state.cursor ?? 0;   // indeks BATCH (bukan indeks chunk!)
  let start = state.stream_start;
  if (!start) {
    start = new Date().toISOString();
    await sb.from('ingest_state').update({ stream_start: start }).eq('id', 1);
  }

  // Batch 0 langsung jatuh tempo saat inisialisasi (+1 agar dashboard tidak menunggu 1 jam pertama)
  const dueTotal = Math.floor((Date.now() - new Date(start).getTime()) / HOUR_MS) + 1;
  const due = Math.min(Math.max(0, dueTotal - cursor), MAX_CATCHUP);
  if (due === 0) return send(res, { ok: true, ingested: 0, cursor, due_total: dueTotal });

  const base = process.env.STREAM_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || `http://localhost:${process.env.PORT || 3000}`;

  let ingested = 0, flagged = 0, next = cursor, done = false;
  let cache = { c: -1, rows: null };

  for (let b = cursor; b < cursor + due; b++) {
    const rows = await getRowsForBatch(base, b, ROWS_PER_HOUR, CHUNK_SIZE, cache);
    if (!rows || rows.length === 0) {
      done = true;
      break;
    }

    const payload = rows.map((row) => {
      const prob = predictProba(row.features);
      return {
        source_idx: row.idx,
        txn_time: row.features[0],
        amount: row.features[row.features.length - 1],
        prob: Math.round(prob * 1e6) / 1e6,
        flagged: prob >= DEFAULT_THRESHOLD,
        actual_class: row.actual_class,
      };
    });

    const { error } = await sb.from('transactions')
      .upsert(payload, { onConflict: 'source_idx', ignoreDuplicates: true });

    if (error) {
      // Simpan progress parsial jika batch sebelumnya berhasil
      if (next > cursor) {
        await sb.from('ingest_state').update({
          cursor: next,
          rows_ingested: (state.rows_ingested ?? 0) + ingested,
          last_run: new Date().toISOString(),
        }).eq('id', 1);
      }
      return send(res, { error: error.message, cursor: b, partially_ingested: ingested }, 500);
    }

    ingested += payload.length;
    flagged += payload.filter((p) => p.flagged).length;
    next = b + 1;
  }

  const isDone = done || Boolean(state.is_done);
  await sb.from('ingest_state').update({
    cursor: next,
    rows_ingested: (state.rows_ingested ?? 0) + ingested,
    last_run: new Date().toISOString(),
    is_done: isDone,
  }).eq('id', 1);

  return send(res, { ok: true, ingested, flagged, cursor: next, due_total: dueTotal, done: isDone });
}