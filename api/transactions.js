import { sb, dbGuard, send, PAGE_SIZES } from './_lib.js';

export default async function handler(req, res) {
    if (!dbGuard(res)) return;
    const q = req.query ?? {};
    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    let pageSize = parseInt(q.pageSize ?? '50', 10);
    if (!PAGE_SIZES.includes(pageSize)) pageSize = 50;
    const filter = ['all', 'flagged', 'legit'].includes(q.filter) ? q.filter : 'all';

    let query = sb.from('transactions')
        .select('id, source_idx, ingested_at, txn_time, amount, prob, flagged, actual_class', { count: 'exact' });
    if (filter === 'flagged') query = query.eq('flagged', true);
    if (filter === 'legit') query = query.eq('flagged', false);
    query = q.sort === 'prob'
        ? query.order('prob', { ascending: false }).order('id', { ascending: false })
        : query.order('ingested_at', { ascending: false }).order('id', { ascending: false });

    const from = (page - 1) * pageSize;
    const { data: rows, count, error } = await query.range(from, from + pageSize - 1);
    if (error) return send(res, { error: error.message }, 500);
    const total = count ?? 0;
    return send(res, { rows: rows ?? [], total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) });
}