import { sb, dbGuard, send, DEFAULT_THRESHOLD } from './_lib.js';

export default async function handler(req, res) {
    if (!dbGuard(res)) return;

    try {
        // ===== 1) Ambil stats dari tabel transactions =====
        const { data: rows, error } = await sb
            .from('transactions')
            .select('flagged, actual_class, prob, amount, ingested_at');

        if (error) return send(res, { error: 'DB error: ' + error.message }, 500);
        const data = rows ?? [];
        const total = data.length;

        // ===== 2) Jika belum ada data sama sekali, return zero-state =====
        if (total === 0) {
            return send(res, {
                total: 0, flagged: 0, legit: 0,
                tp: 0, fp: 0, tn: 0, fn: 0,
                precision: 0, recall: 0, f1: 0,
                amountTotal: 0, amountAvg: 0, amountMax: 0,
                hourly: [],
                probBuckets: Array(10).fill(0),
                cursor: 0, rows_ingested: 0, last_run: null,
                // TOTAL STREAM STATIS (dari EDA notebook: 283,726 row)
                stream_total: parseInt(process.env.STREAM_TOTAL || '283726', 10),
                threshold: DEFAULT_THRESHOLD,
            });
        }

        // ===== 3) Hitung metrik =====
        const flagged = data.filter(r => r.flagged).length;
        const legit = total - flagged;

        let tp = 0, fp = 0, tn = 0, fn = 0;
        let amountTotal = 0, amountMax = 0;
        const hourlyMap = new Map();
        const probBuckets = Array(10).fill(0);

        for (const r of data) {
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
        const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

        const hourly = Array.from(hourlyMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([hour, count]) => ({ hour, count }));

        // ===== 4) Ambil state ingest =====
        const { data: state } = await sb
            .from('ingest_state').select('*').eq('id', 1).maybeSingle();

        return send(res, {
            total, flagged, legit,
            tp, fp, tn, fn,
            precision: Math.round(precision * 10000) / 10000,
            recall: Math.round(recall * 10000) / 10000,
            f1: Math.round(f1 * 10000) / 10000,
            amountTotal: Math.round(amountTotal * 100) / 100,
            amountAvg: total > 0 ? Math.round((amountTotal / total) * 100) / 100 : 0,
            amountMax: Math.round(amountMax * 100) / 100,
            hourly,
            probBuckets,
            cursor: state?.cursor ?? 0,
            rows_ingested: state?.rows_ingested ?? 0,
            last_run: state?.last_run ?? null,
            is_done: Boolean(state?.is_done),
            // TOTAL STREAM STATIS (dari EDA notebook: 283,726 row)
            stream_total: parseInt(process.env.STREAM_TOTAL || '283726', 10),
            threshold: DEFAULT_THRESHOLD,
        });
    } catch (e) {
        return send(res, { error: String(e?.message || e), stack: String(e?.stack || '') }, 500);
    }
}