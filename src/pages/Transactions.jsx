import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Badge, Card, Spinner, fmtDate, fmtMoney } from '../components/ui.jsx';

const PAGE_SIZES = [10, 50, 100, 200];

export default function Transactions() {
    const [params, setParams] = useState({ page: 1, pageSize: 50, filter: 'all', sort: 'recent' });
    const [thr, setThr] = useState(0.5463);
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => { api.meta().then((m) => setThr(m.threshold)).catch(() => { }); }, []);
    useEffect(() => {
        setData(null);
        api.transactions(params).then(setData).catch((e) => setErr(e.message));
    }, [params]);

    const set = (patch) => setParams((p) => ({ ...p, page: 1, ...patch }));

    return (
        <Card title="Transactions" right={
            <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-1">filter
                    <select value={params.filter} onChange={(e) => set({ filter: e.target.value })}
                        className="rounded border border-slate-300 bg-transparent px-1 py-0.5 dark:border-slate-700">
                        <option value="all">all</option><option value="flagged">flagged</option><option value="legit">legit</option>
                    </select>
                </label>
                <label className="flex items-center gap-1">sort
                    <select value={params.sort} onChange={(e) => set({ sort: e.target.value })}
                        className="rounded border border-slate-300 bg-transparent px-1 py-0.5 dark:border-slate-700">
                        <option value="recent">newest</option><option value="prob">prob ↓</option>
                    </select>
                </label>
                <label className="flex items-center gap-1">threshold
                    <input type="range" min="0.05" max="0.95" step="0.005" value={thr}
                        onChange={(e) => setThr(parseFloat(e.target.value))} className="w-24" />
                    <span className="tabular-nums">{thr.toFixed(3)}</span>
                </label>
            </div>
        }>
            <p className="mb-2 text-xs text-slate-500">Slider threshold hanya melabeli ulang halaman ini (client-side); kolom ingest tersimpan dengan threshold default 0.5463.</p>
            {err && <p className="text-sm text-rose-500">{err}</p>}
            {!data && !err ? <Spinner /> : (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                                    <th className="py-2 pr-3">#</th><th className="py-2 pr-3">Ingested</th>
                                    <th className="py-2 pr-3">Time</th><th className="py-2 pr-3">Amount</th>
                                    <th className="py-2 pr-3">P(fraud)</th><th className="py-2 pr-3">Flag</th><th className="py-2">Actual</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(data.rows ?? []).map((r) => {
                                    const flaggedUi = r.prob >= thr;
                                    return (
                                        <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800/60">
                                            <td className="py-2 pr-3 tabular-nums text-slate-500">{r.id}</td>
                                            <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.ingested_at)}</td>
                                            <td className="py-2 pr-3 tabular-nums">{Number(r.txn_time).toFixed(0)}s</td>
                                            <td className="py-2 pr-3 tabular-nums">{fmtMoney(r.amount)}</td>
                                            <td className="py-2 pr-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-1.5 w-16 rounded bg-slate-200 dark:bg-slate-700">
                                                        <div className="h-1.5 rounded bg-rose-500" style={{ width: `${Math.min(100, r.prob * 100)}%` }} />
                                                    </div>
                                                    <span className="tabular-nums">{(r.prob * 100).toFixed(1)}%</span>
                                                </div>
                                            </td>
                                            <td className="py-2 pr-3">{flaggedUi ? <Badge kind="fraud">FLAGGED</Badge> : <Badge kind="ok">LEGIT</Badge>}</td>
                                            <td className="py-2">{r.actual_class == null ? <span className="text-slate-400">—</span>
                                                : r.actual_class === 1 ? <Badge kind="fraud">FRAUD</Badge> : <Badge kind="muted">legit</Badge>}</td>
                                        </tr>
                                    );
                                })}
                                {(data.rows ?? []).length === 0 && (
                                    <tr><td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                                        Belum ada transaksi — trigger cron manual atau tunggu jadwal per jam.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <footer className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                        <label className="flex items-center gap-1">rows/page
                            <select value={params.pageSize} onChange={(e) => set({ pageSize: parseInt(e.target.value, 10) })}
                                className="rounded border border-slate-300 bg-transparent px-1 py-0.5 dark:border-slate-700">
                                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </label>
                        <span className="text-slate-500">Page {data.page} / {data.pageCount} · {data.total.toLocaleString()} rows</span>
                        <div className="ml-auto flex gap-1">
                            <button disabled={params.page <= 1} onClick={() => setParams((p) => ({ ...p, page: p.page - 1 }))}
                                className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-slate-700">Prev</button>
                            <button disabled={params.page >= data.pageCount} onClick={() => setParams((p) => ({ ...p, page: p.page + 1 }))}
                                className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-slate-700">Next</button>
                        </div>
                    </footer>
                </>
            )}
        </Card>
    );
}