import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api.js';
import { Card, CMGrid, Kpi, Spinner, fmtDate, fmtPct } from '../components/ui.jsx';

const TICK = { fill: '#94a3b8', fontSize: 11 };

function fmtCountdown(ms) {
    if (!ms || ms <= 0) return 'sebentar lagi';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
}

export default function Overview() {
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);
    const [loadingAction, setLoadingAction] = useState(false);

    const load = useCallback(async () => {
        try {
            await api.ingest();
            const stats = await api.stats();
            setData(stats);
            setErr(null);
        } catch (e) {
            setErr(e.message);
        }
    }, []);

    useEffect(() => {
        load();
        const t = setInterval(load, 30000); // refresh & cek stream setiap 30 detik
        return () => clearInterval(t);
    }, [load]);

    const handleAdvanceHour = async () => {
        try {
            setLoadingAction(true);
            await api.advanceHour();
            await load();
        } catch (e) {
            setErr(e.message);
        } finally {
            setLoadingAction(false);
        }
    };

    const handleReset = async () => {
        if (!window.confirm('Reset stream ke awal (chunk 0)?')) return;
        try {
            setLoadingAction(true);
            await api.reset();
            await load();
        } catch (e) {
            setErr(e.message);
        } finally {
            setLoadingAction(false);
        }
    };

    if (err) return <Card title="Error"><p className="text-sm text-rose-500">{err}</p></Card>;
    if (!data) return <Spinner />;

    // Normalisasi respons dari streamEngine
    const total = data.total ?? 0;
    const flagged = data.flagged ?? 0;
    const tp = data.tp ?? 0, fp = data.fp ?? 0, fn = data.fn ?? 0, tn = data.tn ?? 0;
    const precision = data.precision ?? null;
    const recall = data.recall ?? null;
    const cursor = data.cursor ?? 0;
    const rowsIngested = data.rows_ingested ?? 0;
    const lastRun = data.last_run ?? null;
    const streamTotal = data.stream_total ?? 283726;
    const nextInMs = data.next_in_ms ?? 0;

    const hourly = Array.isArray(data.hourly)
        ? data.hourly.map((h) => ({ label: String(h.hour ?? '').slice(11, 16), n: h.count ?? h.n ?? 0 }))
        : [];

    const hist = Array.isArray(data.probBuckets)
        ? data.probBuckets.map((n, i) => ({ label: `${i * 10}–${(i + 1) * 10}%`, n: n ?? 0 }))
        : [];

    const donut = [
        { name: 'Flagged', value: flagged },
        { name: 'Legit', value: Math.max(0, total - flagged) },
    ];
    const progress = streamTotal > 0 ? Math.min(100, (rowsIngested / streamTotal) * 100) : 0;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Ingested" value={total.toLocaleString()} sub={`batch ${cursor} / 284`} />
                <Kpi label="Flagged fraud" value={flagged.toLocaleString()} tone="danger"
                    sub={`rate ${fmtPct(total ? flagged / total : null, 2)}`} />
                <Kpi label="Live precision" value={fmtPct(precision)} sub="on labeled rows" />
                <Kpi label="Live recall" value={fmtPct(recall)} sub="on labeled rows" />
                <Kpi label="Actual fraud seen" value={(tp + fn).toLocaleString()} />
                <Kpi label="Avg amount" value={data.amountAvg == null ? '—' : `$${Number(data.amountAvg).toFixed(2)}`} />
                <Kpi label="Last ingest" value={fmtDate(lastRun)} />
                <Kpi label="Stream progress" value={`${progress.toFixed(2)}%`} sub={`${streamTotal.toLocaleString()} row total`} />
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
                        <div className="flex justify-between"><dt className="text-slate-500">Cursor</dt><dd className="tabular-nums font-semibold">{cursor} / 284 chunks</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Rows ingested</dt><dd className="tabular-nums">{rowsIngested.toLocaleString()}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Next batch</dt><dd className="tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">~{fmtCountdown(nextInMs)}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Last run</dt><dd>{fmtDate(lastRun)}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Schedule</dt><dd>1000 row / jam (auto-loop)</dd></div>
                    </dl>
                    <div className="mt-3 h-2 rounded bg-slate-200 dark:bg-slate-800">
                        <div className="h-2 rounded bg-emerald-500" style={{ width: `${progress}%` }} />
                    </div>
                    
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                            onClick={load}
                            disabled={loadingAction}
                            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 transition"
                        >
                            Refresh
                        </button>
                        <button
                            onClick={handleAdvanceHour}
                            disabled={loadingAction}
                            title="Simulasikan 1 jam berlalu dan ingest batch berikutnya langsung"
                            className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 transition disabled:opacity-50"
                        >
                            {loadingAction ? 'Loading...' : '+1 Jam (Simulasi)'}
                        </button>
                        <button
                            onClick={handleReset}
                            disabled={loadingAction}
                            title="Reset stream kembali ke chunk 0"
                            className="rounded-lg border border-rose-300 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/40 transition"
                        >
                            Reset
                        </button>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">Stream murni lokal (public/stream). Jika mencapai chunk 283, otomatis berulang dari awal.</p>
                </Card>
            </div>
        </div>
    );
}