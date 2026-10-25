import rfModel from '../../api/model/rf.json';

export const RF = rfModel;
export const DEFAULT_THRESHOLD = RF.meta?.threshold ?? 0.5463;

/**
 * Traversal pohon keputusan Random Forest yang telah di-export dari scikit-learn.
 */
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
        while (left[n] !== -1) {
            n = x[feature[n]] <= threshold[n] ? left[n] : right[n];
        }
        sum += leaf_p1[n];
    }
    return sum / RF.trees.length;
}

export function getModelMeta() {
    return RF.meta;
}
