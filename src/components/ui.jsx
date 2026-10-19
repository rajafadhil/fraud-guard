export function Card({ title, right, children, className = '' }) {
    return (
        <section className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
            {(title || right) && (
                <header className="mb-3 flex items-center justify-between gap-2">
                    {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h2>}
                    {right}
                </header>
            )}
            {children}
        </section>
    );
}

export function Kpi({ label, value, sub, tone = 'default' }) {
    const tones = {
        default: 'text-slate-900 dark:text-slate-100',
        danger: 'text-rose-600 dark:text-rose-400',
        ok: 'text-emerald-600 dark:text-emerald-400',
    };
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
            {sub && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
        </div>
    );
}

export function Badge({ kind, children }) {
    const cls = {
        fraud: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
        ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
        muted: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    }[kind];
    return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

export function Spinner() {
    return <div className="flex justify-center p-10"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" /></div>;
}

export function CMGrid({ tn, fp, fn, tp }) {
    const cell = 'rounded p-3 text-center';
    return (
        <div className="grid grid-cols-3 gap-1 text-sm">
            <div />
            <div className="p-2 text-center text-xs text-slate-500">Pred Legit</div>
            <div className="p-2 text-center text-xs text-slate-500">Pred Fraud</div>
            <div className="p-2 text-xs text-slate-500">Actual Legit</div>
            <div className={`${cell} bg-emerald-50 dark:bg-emerald-950/40`}>TN {tn?.toLocaleString()}</div>
            <div className={`${cell} bg-rose-50 dark:bg-rose-950/40`}>FP {fp?.toLocaleString()}</div>
            <div className="p-2 text-xs text-slate-500">Actual Fraud</div>
            <div className={`${cell} bg-amber-50 dark:bg-amber-950/40`}>FN {fn?.toLocaleString()}</div>
            <div className={`${cell} bg-emerald-50 dark:bg-emerald-950/40`}>TP {tp?.toLocaleString()}</div>
        </div>
    );
}

export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
export const fmtMoney = (x) => `$${Number(x ?? 0).toFixed(2)}`;
export const fmtPct = (x, d = 1) => (x == null || Number.isNaN(x) ? '—' : `${(x * 100).toFixed(d)}%`);