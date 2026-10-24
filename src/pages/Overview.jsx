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
        const s = await api.stats();
        setData(s);
    }, []);
    useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

    if (err) return <Card title="Error"><p className="text-sm text-rose-500">{err} — sudah set DATABASE_URL di Vercel?</p></Card>;
    if (!data) return <Spinner />;

    const s = data.summary ?? {};
    const st = data.state ?? {};
    const total = s.total ?? 0, flagged = s.flagged ?? 0;
    const prec = (s.tp ?? 0) + (s.fp ?? 0) > 0 ? s.tp / (s.tp + s.fp) : null;
    const rec = (s.tp ?? 0) + (s.fn ?? 0) > 0 ? s.tp / (s.tp + s.fn) : null;
    const progress = data.stream_total ? Math.min(100, ((st.cursor ?? 0) / data.stream_total) * 100) : 0;
    const hourly = data.hourly.map((h) => ({ label: String(h.hour).slice(11, 16), flagged: h.flagged, legit: h.n - h.flagged }));
    const hist = data.hist.map((b) => ({ label: `${(b.bucket - 1) * 5}–${b.bucket * 5}%`, n: b.n }));
    const donut = [{ name: 'Flagged', value: flagged }, { name: 'Legit', value: total - flagged }];

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Ingested" value={total.toLocaleString()} sub={`cursor ${st.cursor ?? 0}`} />
                <Kpi label="Flagged fraud" value={flagged.toLocaleString()} tone="danger" sub={`rate ${fmtPct(total ? flagged / total : null, 2)}`} />
                <Kpi label="Live precision" value={fmtPct(prec)} sub="on labeled rows" />
                <Kpi label="Live recall" value={fmtPct(rec)} sub="on labeled rows" />
                <Kpi label="Actual fraud seen" value={(s.labeled ? (s.tp ?? 0) + (s.fn ?? 0) : 0).toLocaleString()} />
                <Kpi label="Avg probability" value={s.avg_prob == null ? '—' : Number(s.avg_prob).toFixed(4)} />
                <Kpi label="Last ingest" value={fmtDate(s.last_ingested)} sub={st.last_run ? `cron ${fmtDate(st.last_run)}` : undefined} />
                <Kpi label="Stream progress" value={`${progress.toFixed(1)}%`} sub={`${data.stream_total.toLocaleString()} row tersedia`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card title="Ingestion per hour (last 72)" className="lg:col-span-2">
                    <div className="h-56">
                        <ResponsiveContainer>
                            <BarChart data={hourly}>
                                <CartesianGrid stroke="#64748b" strokeOpacity={0.2} vertical={false} />
                                <XAxis dataKey="label" tick={TICK} interval="preserveStartEnd" />
                                <YAxis tick={TICK} allowDecimals={false} />
                                <Tooltip />
                                <Bar dataKey="legit" stackId="a" fill="#64748b" name="Legit" />
                                <Bar dataKey="flagged" stackId="a" fill="#f43f5e" name="Flagged" />
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
                    <CMGrid tn={s.tn ?? 0} fp={s.fp ?? 0} fn={s.fn ?? 0} tp={s.tp ?? 0} />
                    <p className="mt-2 text-xs text-slate-500">Dihitung dari row stream yang punya label asli.</p>
                </Card>
                <Card title="Pipeline status">
                    <dl className="space-y-1 text-sm">
                        <div className="flex justify-between"><dt className="text-slate-500">Cursor</dt><dd className="tabular-nums">{st.cursor ?? 0}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Rows ingested</dt><dd className="tabular-nums">{(st.rows_ingested ?? 0).toLocaleString()}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Last run</dt><dd>{fmtDate(st.last_run)}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Schedule</dt><dd>0 * * * * (100 row/jam)</dd></div>
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