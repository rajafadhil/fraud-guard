import { RF, send, modelReady } from './_lib.js';
export default async function handler(_req, res) {
    if (!modelReady()) return send(res, { error: 'model belum di-export' }, 500);
    return send(res, RF.meta);
}