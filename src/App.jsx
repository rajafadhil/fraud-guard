import { useState } from 'react';
import Overview from './pages/Overview.jsx';
import Transactions from './pages/Transactions.jsx';
import ModelPage from './pages/ModelPage.jsx';

const TABS = [['overview', 'Overview'], ['transactions', 'Transactions'], ['model', 'Model & Methodology']];

export default function App() {
    const [tab, setTab] = useState('overview');
    const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

    const toggleTheme = () => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle('dark', next);
        localStorage.setItem('fg-theme', next ? 'dark' : 'light');
    };

    return (
        <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <svg viewBox="0 0 24 24" className="h-6 w-6 text-emerald-500" fill="currentColor">
                            <path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" />
                        </svg>
                        <div>
                            <h1 className="text-lg font-bold leading-tight">FraudGuard</h1>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">Credit-card fraud monitoring · Random Forest</p>
                        </div>
                    </div>
                    <nav className="ml-auto flex items-center gap-1">
                        {TABS.map(([id, label]) => (
                            <button key={id} onClick={() => setTab(id)}
                                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === id
                                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                                    : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                                {label}
                            </button>
                        ))}
                        <button onClick={toggleTheme} title="Toggle theme"
                            className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700">
                            {dark ? '☀️' : '🌙'}
                        </button>
                    </nav>
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-4 py-6">
                {tab === 'overview' && <Overview />}
                {tab === 'transactions' && <Transactions />}
                {tab === 'model' && <ModelPage />}
            </main>
            <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-slate-500 dark:text-slate-400">
                FraudGuard · demo monitoring dashboard · model: RF pipeline (sklearn) · threshold 0.5463 · data: PCA features (V1–V28)
            </footer>
        </div>
    );
}