import { sb, dbGuard, send } from './_lib.js';

export default async function handler(_req, res) {
    if (!dbGuard(res)) return;
    const [r1, r2, r3, r4, r5] = await Promise.all([
        sb.from('v_stats_summary').select('*').maybeSingle(),
        sb.from('v_stats_hourly').select('*').order('hour', { ascending: false }).limit(72),
        sb.from('v_prob_hist').select('*').order('bucket', { ascending: true }),
        sb.from('ingest_state').select('cursor, last_run, rows_ingested').eq('id', 1).maybeSingle(),
        sb.from('v_stream_total').select('total').maybeSingle(),
    ]);
    const err = r1.error || r2.error || r3.error || r4.error || r5.error;
    if (err) return send(res, { error: err.message }, 500);
    return send(res, {
        summary: r1.data ?? {},
        hourly: (r2.data ?? []).slice().reverse(),
        hist: r3.data ?? [],
        state: r4.data ?? {},
        stream_total: r5.data?.total ?? 0,
    });
}