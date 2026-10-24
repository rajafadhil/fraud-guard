import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api.js';
import { Card, CMGrid, Kpi, Spinner, fmtDate, fmtPct } from '../components/ui.jsx';

const TICK = { fill: '#94a3b8', fontSize: 11 };

export default function Overview() {
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);

    const load = useCallback(async () => {
        try { await fetch('/api/ingest', { method: 'POST' }); } catch { /* abaikan */ }
        try {
            setData(await api.stats());
            setErr(null);
        } catch (e) {
            setErr(e.message);
        }
    }, []);

    useEffect(() => {
        load();
        const t = setInterval(load, 60000);
        return () => clearInterval(t);
    }, [load]);

    if (err) return <Card title="Error"><p className="text-sm text-rose-500">{err}</p></Card>;
    if (!data) return <Spinner />;

    // ===== normalisasi respons (bentuk flat dari api/stats.js) =====
    const total = data.total ?? 0;
    const flagged = data.flagged ?? 0;
    const tp = data.tp ?? 0, fp = data.fp ?? 0, fn = data.fn ?? 0, tn = data.tn ?? 0;
    const precision = data.precision ?? null;
    const recall = data.recall ?? null;
    const cursor = data.cursor ?? 0;
    const rowsIngested = data.rows_ingested ?? 0;
    const lastRun = data.last_run ?? null;
    const streamTotal = data.stream_total ?? 0;

    const hourly = Array.isArray(data.hourly)
        ? data.hourly.map((h) => ({ label: String(h.hour ?? '').slice(11, 16), n: h.count ?? h.n ?? 0 }))
        : [];

    const hist = Array.isArray(data.probBuckets)
        ? data.probBuckets.map((n, i) => ({ label: `${i * 10}–${(i + 1) * 10}%`, n: n ?? 0 }))
        : (Array.isArray(data.hist)
            ? data.hist.map((b) => ({ label: `${(b.bucket - 1) * 5}–${b.bucket * 5}%`, n: b.n ?? 0 }))
            : []);

    const donut = [
        { name: 'Flagged', value: flagged },
        { name: 'Legit', value: Math.max(0, total - flagged) },
    ];
    const progress = streamTotal > 0 ? Math.min(100, ((total || rowsIngested) / streamTotal) * 100) : 0;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Ingested" value={total.toLocaleString()} sub={`batch ${cursor}`} />
                <Kpi label="Flagged fraud" value={flagged.toLocaleString()} tone="danger"
                    sub={`rate ${fmtPct(total ? flagged / total : null, 2)}`} />
                <Kpi label="Live precision" value={fmtPct(precision)} sub="on labeled rows" />
                <Kpi label="Live recall" value={fmtPct(recall)} sub="on labeled rows" />
                <Kpi label="Actual fraud seen" value={(tp + fn).toLocaleString()} />
                <Kpi label="Avg amount" value={data.amountAvg == null ? '—' : `$${Number(data.amountAvg).toFixed(2)}`} />
                <Kpi label="Last ingest" value={fmtDate(lastRun)} />
                <Kpi label="Stream progress" value={`${progress.toFixed(1)}%`} sub={`${streamTotal.toLocaleString()} row tersedia`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card title="Ingestion per hour" className="lg:col-span-2">
                    <div className="h-56">
                        <ResponsiveContainer>
                            <BarChart data={hourly}>
                                <CartesianGrid stroke="#64748b" strokeOpacity={0.2} vertical={false} />
                                <XAxis dataKey="label" tick={TICK} interval="preserveStartEnd" />
                                <YAxis tick={TICK} allowDecimals={false} />
                                <Tooltip />
                                <Bar dataKey="n" fill="#6366f1" name="Transactions" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
                <Card title="Flagged vs legit">
                    <div className="h-56">
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={donut} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                                    {donut.map((_, i) => <Cell key={i} fill={i === 0 ? '#f43f5e' : '#94a3b8'} />)}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card title="Probability distribution">
                    <div className="h-52">
                        <ResponsiveContainer>
                            <BarChart data={hist}>
                                <CartesianGrid stroke="#64748b" strokeOpacity={0.2} vertical={false} />
                                <XAxis dataKey="label" tick={TICK} interval={1} />
                                <YAxis tick={TICK} allowDecimals={false} />
                                <Tooltip />
                                <Bar dataKey="n" fill="#6366f1" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
                <Card title="Live confusion matrix (labeled rows)">
                    <CMGrid tn={tn} fp={fp} fn={fn} tp={tp} />
                    <p className="mt-2 text-xs text-slate-500">Dihitung dari row stream yang punya label asli.</p>
                </Card>
                <Card title="Pipeline status">
                    <dl className="space-y-1 text-sm">
                        <div className="flex justify-between"><dt className="text-slate-500">Cursor</dt><dd className="tabular-nums">{cursor}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Rows ingested</dt><dd className="tabular-nums">{rowsIngested.toLocaleString()}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Last run</dt><dd>{fmtDate(lastRun)}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Schedule</dt><dd>pseudo-cron (1000 row/jam)</dd></div>
                    </dl>
                    <div className="mt-3 h-2 rounded bg-slate-200 dark:bg-slate-800">
                        <div className="h-2 rounded bg-emerald-500" style={{ width: `${progress}%` }} />
                    </div>
                    <button onClick={load} className="mt-3 rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-700">Refresh</button>
                </Card>
            </div>
        </div>
    );
}