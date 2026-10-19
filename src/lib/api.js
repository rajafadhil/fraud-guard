async function fetchJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    return r.json();
}
export const api = {
    stats: () => fetchJSON('/api/stats'),
    meta: () => fetchJSON('/api/model-meta'),
    transactions: (p) => fetchJSON(`/api/transactions?${new URLSearchParams(p)}`),
};