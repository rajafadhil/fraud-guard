import * as streamEngine from './streamEngine.js';

export const api = {
    stats: () => streamEngine.getStats(),
    meta: () => Promise.resolve(streamEngine.getModelMeta()),
    transactions: (p) => streamEngine.getTransactions(p),
    ingest: () => streamEngine.ingestDueBatches(),
    advanceHour: () => streamEngine.advanceHour(),
    reset: () => streamEngine.resetStream(),
};