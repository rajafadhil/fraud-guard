import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api.js';
import { Card, CMGrid, Kpi, Spinner, fmtPct } from '../components/ui.jsx';

export default function ModelPage() {
    const [m, setM] = useState(null);
    const [err, setErr] = useState(null);
    useEffect(() => { api.meta().then(setM).catch((e) => setErr(e.message)); }, []);
    if (err) return <Card title="Error"><p className="text-sm text-rose-500">{err}</p></Card>;
    if (!m) return <Spinner />;
    const t = m.test ?? {};

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Kpi label="AP (AUPRC)" value={t.ap} tone="ok" />
                <Kpi label="ROC-AUC" value={t.roc_auc} />
                <Kpi label="Precision" value={fmtPct(t.precision)} />
                <Kpi label="Recall" value={fmtPct(t.recall)} sub={`Wilson 95% CI ${fmtPct(t.wilson_lo)}–${fmtPct(t.wilson_hi)}`} />
                <Kpi label="F1" value={t.f1} sub={`FP ${t.fp} · FN ${t.fn}`} tone="danger" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Pipeline & hyperparameters">
                    <ol className="list-decimal space-y-1 pl-5 text-sm">
                        {m.pipeline?.map((p) => <li key={p} className="font-mono text-xs">{p}</li>)}
                    </ol>
                    <dl className="mt-3 space-y-1 text-sm">
                        <div className="flex justify-between"><dt className="text-slate-500">Threshold alert</dt><dd className="tabular-nums">{m.threshold}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">sklearn (training)</dt><dd className="font-mono text-xs">{m.sklearn_version}</dd></div>
                    </dl>
                    <p className="mt-2 text-xs text-slate-500">{m.threshold_note}</p>
                </Card>
                <Card title="Confusion matrix — test set">
                    <CMGrid tn={t.tn} fp={t.fp} fn={t.fn} tp={t.tp} />
                </Card>
            </div>

            <Card title="Model comparison (test, threshold 0.5 kecuali RF terpilih)">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
                            {['Model', 'AP', 'ROC-AUC', 'Precision', 'Recall', 'F1', 'FP', 'FN'].map((h) => <th key={h} className="py-2 pr-4">{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {m.comparison?.map((r) => (
                                <tr key={r.model} className="border-b border-slate-100 dark:border-slate-800/60">
                                    <td className="py-2 pr-4 font-medium">{r.model}</td>
                                    <td className="py-2 pr-4 tabular-nums">{r.ap}</td><td className="py-2 pr-4 tabular-nums">{r.roc_auc}</td>
                                    <td className="py-2 pr-4 tabular-nums">{r.precision}</td><td className="py-2 pr-4 tabular-nums">{r.recall}</td>
                                    <td className="py-2 pr-4 tabular-nums">{r.f1}</td><td className="py-2 pr-4 tabular-nums">{r.fp}</td>
                                    <td className="py-2 pr-4 tabular-nums">{r.fn}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Card title="Top-12 feature importance (impurity)">
                <div className="h-72">
                    <ResponsiveContainer>
                        <BarChart data={m.importances} layout="vertical" margin={{ left: 8 }}>
                            <CartesianGrid stroke="#64748b" strokeOpacity={0.2} horizontal={false} />
                            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                            <YAxis type="category" dataKey="feature" width={44} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                            <Tooltip />
                            <Bar dataKey="importance" fill="#4c72b0" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            <Card title="Notes & disclaimer">
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                    {m.notes?.map((n) => <li key={n}>{n}</li>)}
                </ul>
            </Card>
        </div>
    );
}