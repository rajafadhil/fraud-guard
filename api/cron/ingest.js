import { sb, dbGuard, predictProba, send, modelReady, DEFAULT_THRESHOLD } from '../_lib.js';

export default async function handler(req, res) {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers['authorization'] || '';
    if (!secret || auth !== `Bearer ${secret}`) return send(res, { error: 'unauthorized' }, 401);
    if (!modelReady()) return send(res, { error: 'model belum di-export (scripts/export_rf.py)' }, 500);
    if (!dbGuard(res)) return;

    const { data: stateRow, error: e1 } = await sb.from('ingest_state')
        .select('cursor, rows_ingested').eq('id', 1).maybeSingle();
    if (e1) return send(res, { error: e1.message }, 500);
    const cursor = stateRow?.cursor ?? 0;

    const { data: rows, error: e2 } = await sb.from('stream_source')
        .select('idx, features, actual_class')
        .gte('idx', cursor).order('idx', { ascending: true }).limit(100);
    if (e2) return send(res, { error: e2.message }, 500);
    if (!rows?.length) return send(res, { ok: true, ingested: 0, cursor, done: true });

    const payload = rows.map((r) => {
        const prob = predictProba(r.features);
        return {
            source_idx: r.idx,
            txn_time: r.features[0],
            amount: r.features[r.features.length - 1],
            prob: Math.round(prob * 1e6) / 1e6,
            flagged: prob >= DEFAULT_THRESHOLD,
            actual_class: r.actual_class,
        };
    });

    const { error: e3 } = await sb.from('transactions')
        .upsert(payload, { onConflict: 'source_idx', ignoreDuplicates: true });
    if (e3) return send(res, { error: e3.message }, 500);

    const next = rows[rows.length - 1].idx + 1;
    const { error: e4 } = await sb.from('ingest_state').update({
        cursor: next,
        rows_ingested: (stateRow?.rows_ingested ?? 0) + rows.length,
        last_run: new Date().toISOString(),
    }).eq('id', 1);
    if (e4) return send(res, { error: e4.message }, 500);

    return send(res, { ok: true, ingested: rows.length, flagged: payload.filter((p) => p.flagged).length, cursor: next });
}