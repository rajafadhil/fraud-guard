import { sb, dbGuard, predictProba, send, modelReady, DEFAULT_THRESHOLD } from './_lib.js';

const CHUNK_SIZE    = 1000;  // isi 1 file chunk_XXXX.json
const ROWS_PER_HOUR = 1000;   // kecepatan stream: 100 row/jam
const HOUR_MS       = 3600_000;

export default async function handler(req, res) {
  if (!modelReady()) return send(res, { error: 'model belum di-export' }, 500);
  if (!dbGuard(res)) return;

  const MAX_CATCHUP = parseInt(process.env.INGEST_MAX_CATCHUP || '6', 10);
  const state = await sb.from('ingest_state').select('*').eq('id', 1).maybeSingle();
  if (!state) return send(res, { error: 'ingest_state kosong - jalankan schema.sql' }, 500);

  const cursor = state.cursor ?? 0;   // indeks BATCH (bukan indeks chunk!)
  let start = state.stream_start;
  if (!start) {
    start = new Date().toISOString();
    await sb.from('ingest_state').update({ stream_start: start }).eq('id', 1);
    return send(res, { ok: true, ingested: 0, cursor, stream_start: start,
                       note: 'batch pertama jatuh tempo 1 jam lagi' });
  }

  const dueTotal = Math.floor((Date.now() - new Date(start).getTime()) / HOUR_MS);
  const due = Math.min(Math.max(0, dueTotal - cursor), MAX_CATCHUP);
  if (due === 0) return send(res, { ok: true, ingested: 0, cursor, due_total: dueTotal });

  const base = process.env.STREAM_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || `http://localhost:${process.env.PORT || 3000}`;

  let ingested = 0, flagged = 0, next = cursor, done = false;
  let cache = { c: -1, rows: null };   // cache chunk agar tidak fetch ulang dalam 1 panggilan

  for (let b = cursor; b < cursor + due; b++) {
    const c   = Math.floor((b * ROWS_PER_HOUR) / CHUNK_SIZE);   // file chunk ke-c
    const off = (b * ROWS_PER_HOUR) % CHUNK_SIZE;               // offset di dalam chunk
    if (cache.c !== c) {
      const r = await fetch(`${base}/stream/chunk_${String(c).padStart(4, '0')}.json`);
      if (!r.ok) { next = dueTotal; done = true; break; }       // stream habis
      cache = { c, rows: (await r.json()).rows };
    }
    const rows = cache.rows.slice(off, off + ROWS_PER_HOUR);
    if (rows.length === 0) { next = dueTotal; done = true; break; }

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
    if (error) return send(res, { error: error.message, cursor: b }, 500);
    ingested += payload.length;
    flagged += payload.filter((p) => p.flagged).length;
    next = b + 1;
  }

  await sb.from('ingest_state').update({
    cursor: next,
    rows_ingested: (state.rows_ingested ?? 0) + ingested,
    last_run: new Date().toISOString(),
  }).eq('id', 1);
  return send(res, { ok: true, ingested, flagged, cursor: next, due_total: dueTotal, done });
}