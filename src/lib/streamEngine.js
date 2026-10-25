import { predictProba, DEFAULT_THRESHOLD, getModelMeta } from './model.js';

const DB_NAME = 'FraudGuardDB';
const DB_VERSION = 1;
const STORE_NAME = 'transactions';

export const TOTAL_CHUNKS = 284; // chunk_0000.json s/d chunk_0283.json
export const CHUNK_SIZE = 1000;
export const HOUR_MS = 3600_000; // 1 jam = 3.600.000 ms
export const STREAM_TOTAL = 283726; // total baris stream dari creditcard.csv
const STATE_KEY = 'fraudguard_stream_state';

// Inisialisasi IndexedDB
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'source_idx' });
                store.createIndex('ingested_at', 'ingested_at', { unique: false });
                store.createIndex('prob', 'prob', { unique: false });
                store.createIndex('flagged', 'flagged', { unique: false });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export function getStreamState() {
    try {
        const raw = localStorage.getItem(STATE_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* abaikan */ }
    return null;
}

export function saveStreamState(state) {
    try {
        localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch { /* abaikan */ }
}

export async function clearAllTransactions() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function saveTransactionsBatch(rows) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const row of rows) {
            store.put(row);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getAllTransactions() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Fetch 1 file chunk JSON dari public/stream/chunk_XXXX.json
 */
async function fetchChunk(chunkIdx) {
    const fileName = `chunk_${String(chunkIdx).padStart(4, '0')}.json`;
    const res = await fetch(`/stream/${fileName}`);
    if (!res.ok) throw new Error(`Gagal membaca ${fileName}: HTTP ${res.status}`);
    const data = await res.json();
    return data.rows || [];
}

/**
 * Logika Ingestion:
 * - 1 chunk di-ingest per 1 jam.
 * - Batch 0 langsung di-ingest saat inisialisasi awal.
 * - Jika sudah mencapai chunk terakhir (chunk 283), otomatis di-refresh & diulang dari awal (chunk 0).
 */
export async function ingestDueBatches() {
    let state = getStreamState();
    const now = Date.now();

    if (!state || !state.stream_start) {
        state = {
            stream_start: now,
            cursor: 0,
            rows_ingested: 0,
            last_run: null,
        };
    }

    // Jika cursor sudah melebihi jumlah chunk total, ulangi dari awal
    if (state.cursor >= TOTAL_CHUNKS) {
        await resetStream();
        state = getStreamState();
    }

    // Hitung berapa batch yang sudah jatuh tempo:
    // Batch 0 langsung jatuh tempo (+1), batch berikutnya tiap kelipatan 1 jam (HOUR_MS)
    const elapsedMs = Math.max(0, now - state.stream_start);
    const dueTotal = Math.floor(elapsedMs / HOUR_MS) + 1;

    // Jika dueTotal sudah melebihi total chunk (artinya stream 284 jam sudah lewat), ulangi dari awal
    if (dueTotal > TOTAL_CHUNKS) {
        await resetStream();
        return ingestDueBatches();
    }

    const cursor = state.cursor ?? 0;
    const due = Math.max(0, dueTotal - cursor);

    if (due === 0) {
        return {
            ok: true,
            ingested: 0,
            cursor,
            due_total: dueTotal,
            next_in_ms: HOUR_MS - (elapsedMs % HOUR_MS),
        };
    }

    let newlyIngested = 0;
    let nextCursor = cursor;

    for (let c = cursor; c < Math.min(cursor + due, TOTAL_CHUNKS); c++) {
        const rawRows = await fetchChunk(c);
        if (!rawRows || rawRows.length === 0) break;

        const batchTime = new Date(state.stream_start + c * HOUR_MS).toISOString();

        const payload = rawRows.map((row) => {
            const prob = predictProba(row.features);
            return {
                id: row.idx + 1,
                source_idx: row.idx,
                txn_time: row.features[0],
                amount: row.features[row.features.length - 1],
                prob: Math.round(prob * 1e6) / 1e6,
                flagged: prob >= DEFAULT_THRESHOLD,
                actual_class: row.actual_class,
                ingested_at: batchTime,
            };
        });

        await saveTransactionsBatch(payload);
        newlyIngested += payload.length;
        nextCursor = c + 1;
    }

    const updatedState = {
        stream_start: state.stream_start,
        cursor: nextCursor,
        rows_ingested: (state.rows_ingested ?? 0) + newlyIngested,
        last_run: new Date().toISOString(),
    };
    saveStreamState(updatedState);

    return {
        ok: true,
        ingested: newlyIngested,
        cursor: nextCursor,
        due_total: dueTotal,
        next_in_ms: HOUR_MS - (elapsedMs % HOUR_MS),
    };
}

/**
 * Simulasi: Memajukan waktu 1 jam secara instan (untuk demo/pengujian)
 */
export async function advanceHour() {
    let state = getStreamState();
    if (!state || !state.stream_start) {
        await ingestDueBatches();
        state = getStreamState();
    }

    // Geser stream_start mundur 1 jam agar batch berikutnya langsung jatuh tempo
    state.stream_start = state.stream_start - HOUR_MS;
    saveStreamState(state);

    return ingestDueBatches();
}

/**
 * Reset dan ulangi stream dari awal (chunk 0)
 */
export async function resetStream() {
    await clearAllTransactions();
    const state = {
        stream_start: Date.now(),
        cursor: 0,
        rows_ingested: 0,
        last_run: null,
    };
    saveStreamState(state);
    return state;
}

/**
 * Mengambil ringkasan metrik statistik untuk halaman Overview
 */
export async function getStats() {
    const data = await getAllTransactions();
    const state = getStreamState() || { cursor: 0, rows_ingested: 0, last_run: null, stream_start: Date.now() };
    const total = data.length;

    const elapsedMs = Math.max(0, Date.now() - (state.stream_start || Date.now()));
    const nextInMs = Math.max(0, HOUR_MS - (elapsedMs % HOUR_MS));

    if (total === 0) {
        return {
            total: 0, flagged: 0, legit: 0,
            tp: 0, fp: 0, tn: 0, fn: 0,
            precision: 0, recall: 0, f1: 0,
            amountTotal: 0, amountAvg: 0, amountMax: 0,
            hourly: [],
            probBuckets: Array(10).fill(0),
            cursor: state.cursor ?? 0,
            rows_ingested: state.rows_ingested ?? 0,
            last_run: state.last_run ?? null,
            stream_total: STREAM_TOTAL,
            threshold: DEFAULT_THRESHOLD,
            next_in_ms: nextInMs,
        };
    }

    let flagged = 0;
    let tp = 0, fp = 0, tn = 0, fn = 0;
    let amountTotal = 0, amountMax = 0;
    const hourlyMap = new Map();
    const probBuckets = Array(10).fill(0);

    for (const r of data) {
        if (r.flagged) flagged++;

        const pred = r.flagged ? 1 : 0;
        const actual = r.actual_class ?? 0;
        if (pred === 1 && actual === 1) tp++;
        else if (pred === 1 && actual === 0) fp++;
        else if (pred === 0 && actual === 0) tn++;
        else fn++;

        const amt = Number(r.amount) || 0;
        amountTotal += amt;
        if (amt > amountMax) amountMax = amt;

        if (r.ingested_at) {
            const h = new Date(r.ingested_at).toISOString().slice(0, 13) + ':00';
            hourlyMap.set(h, (hourlyMap.get(h) || 0) + 1);
        }

        const p = Number(r.prob) || 0;
        const bin = Math.min(9, Math.floor(p * 10));
        probBuckets[bin]++;
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    const hourly = Array.from(hourlyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([hour, count]) => ({ hour, count }));

    return {
        total,
        flagged,
        legit: total - flagged,
        tp, fp, tn, fn,
        precision: Math.round(precision * 10000) / 10000,
        recall: Math.round(recall * 10000) / 10000,
        f1: Math.round(f1 * 10000) / 10000,
        amountTotal: Math.round(amountTotal * 100) / 100,
        amountAvg: total > 0 ? Math.round((amountTotal / total) * 100) / 100 : 0,
        amountMax: Math.round(amountMax * 100) / 100,
        hourly,
        probBuckets,
        cursor: state.cursor ?? 0,
        rows_ingested: state.rows_ingested ?? total,
        last_run: state.last_run ?? null,
        stream_total: STREAM_TOTAL,
        threshold: DEFAULT_THRESHOLD,
        next_in_ms: nextInMs,
    };
}

/**
 * Mengambil transaksi dengan filter, sort, dan paginasi untuk halaman Transactions
 */
export async function getTransactions(params = {}) {
    let rows = await getAllTransactions();

    const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
    const pageSize = Math.max(1, parseInt(params.pageSize ?? '50', 10) || 50);
    const filter = params.filter ?? 'all';
    const sort = params.sort ?? 'recent';

    if (filter === 'flagged') {
        rows = rows.filter((r) => r.flagged);
    } else if (filter === 'legit') {
        rows = rows.filter((r) => !r.flagged);
    }

    if (sort === 'prob') {
        rows.sort((a, b) => b.prob - a.prob || b.source_idx - a.source_idx);
    } else {
        // recent: urutkan dari yang paling baru di-ingest
        rows.sort((a, b) => b.source_idx - a.source_idx);
    }

    const total = rows.length;
    const from = (page - 1) * pageSize;
    const paginatedRows = rows.slice(from, from + pageSize);

    return {
        rows: paginatedRows,
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
}

export { getModelMeta };
