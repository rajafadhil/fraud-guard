import { createClient } from '@supabase/supabase-js';
import rfModel from './model/rf.json';

export const RF = rfModel;
export const PAGE_SIZES = [10, 50, 100, 200];
export const DEFAULT_THRESHOLD = RF.meta?.threshold ?? 0.5463;

export const sb = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export function dbGuard(res) {
  if (!sb) { send(res, { error: 'SUPABASE_URL / SUPABASE_SERVICE_KEY belum diset di env Vercel' }, 500); return false; }
  return true;
}

export function send(res, body, status = 200) {
  res.setHeader('cache-control', 'no-store');
  res.status(status).json(body);
}

export function modelReady() {
  return Array.isArray(RF.trees) && RF.trees.length > 0;
}

/** Mirror persis traversal DecisionTree sklearn: kiri jika x[f] <= threshold. */
export function predictProba(features) {
  const med = RF.imputer_medians;
  const x = new Array(med.length);
  for (let i = 0; i < med.length; i++) {
    const v = features[i];
    x[i] = v === null || v === undefined || Number.isNaN(v) ? med[i] : v;
  }
  let sum = 0;
  for (const t of RF.trees) {
    let n = 0;
    const { left, right, feature, threshold, leaf_p1 } = t;
    while (left[n] !== -1) n = x[feature[n]] <= threshold[n] ? left[n] : right[n];
    sum += leaf_p1[n];
  }
  return sum / RF.trees.length;
}