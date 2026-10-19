#!/usr/bin/env python3
"""Export Pipeline RF -> api/model/rf.json untuk inference Node + parity check."""
import argparse, json, os, sys
import joblib, numpy as np, pandas as pd, sklearn

FEATURE_NAMES = [
    'Time', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9',
    'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17', 'V18', 'V19',
    'V20', 'V21', 'V22', 'V23', 'V24', 'V25', 'V26', 'V27', 'V28', 'Amount'
]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='model/best_credit_card_fraud_rf.joblib')
    ap.add_argument('--csv', default='data/creditcard.csv')
    ap.add_argument('--out', default='api/model/rf.json')
    a = ap.parse_args()

    pipe = joblib.load(a.model)
    clf, imp = pipe.named_steps['clf'], pipe.named_steps['imputer']
    order = FEATURE_NAMES
    trees = []
    for est in clf.estimators_:
        t = est.tree_
        leaf = t.children_left == -1
        vals = t.value[:, 0, :]
        p1 = np.where(leaf, vals[:, 1] / np.maximum(vals.sum(axis=1), 1e-12), 0.0)
        trees.append({
            'feature': t.feature.tolist(),
            'threshold': [round(float(x), 12) for x in t.threshold],
            'left': t.children_left.tolist(),
            'right': t.children_right.tolist(),
            'leaf_p1': [round(float(x), 9) for x in p1],
        })

    imp_series = pd.Series(clf.feature_importances_, index=order).nlargest(12)
    meta = {
        'app': 'FraudGuard',
        'model': 'Random Forest (Pipeline: imputer -> clf)',
        'sklearn_version': sklearn.__version__,
        'pipeline': ["SimpleImputer(strategy='median')",
                     "RandomForestClassifier(n_estimators=150, min_samples_leaf=2, "
                     "class_weight='balanced_subsample', random_state=42)"],
        'hyperparams': {'n_estimators': 150, 'min_samples_leaf': 2,
                        'class_weight': 'balanced_subsample', 'random_state': 42},
        'threshold': 0.5463,
        'threshold_note': 'Dipilih di validation: recall >= 0.80 dengan precision maksimum '
                          '(P 0.9286 / R 0.8298 di validation).',
        'feature_order': order,
        'importances': [{'feature': f, 'importance': round(float(v), 5)}
                        for f, v in imp_series.items()],
        'test': {'ap': 0.8149, 'roc_auc': 0.9338, 'precision': 0.9714, 'recall': 0.7158,
                 'f1': 0.8242, 'tn': 56649, 'fp': 2, 'fn': 27, 'tp': 68,
                 'wilson_lo': 0.61809, 'wilson_hi': 0.79672},
        'validation': {'ap': 0.8742, 'roc_auc': 0.9554, 'precision_at_05': 0.9186,
                       'recall_at_05': 0.8404, 'f1_at_05': 0.8778,
                       'precision_at_thr': 0.9286, 'recall_at_thr': 0.8298},
        'comparison': [
            {'model': 'Random Forest',        'ap': 0.8149, 'roc_auc': 0.9338, 'precision': 0.9714, 'recall': 0.7158, 'f1': 0.8242, 'fp': 2,    'fn': 27},
            {'model': 'Gradient Boosting',    'ap': 0.7143, 'roc_auc': 0.9427, 'precision': 0.3949, 'recall': 0.8105, 'f1': 0.5310, 'fp': 118,  'fn': 18},
            {'model': 'Logistic Regression',  'ap': 0.6865, 'roc_auc': 0.9646, 'precision': 0.0508, 'recall': 0.8737, 'f1': 0.0961, 'fp': 1550, 'fn': 12},
            {'model': 'Decision Tree',        'ap': 0.5626, 'roc_auc': 0.8988, 'precision': 0.1545, 'recall': 0.8000, 'f1': 0.2589, 'fp': 416,  'fn': 19},
        ],
        'notes': [
            'Fitur V1-V28 adalah komponen PCA (anonim) - importance bukan hubungan kausal.',
            'Accuracy tidak informatif pada data imbalance (fraud 0.17%); gunakan AP/AUPRC & jumlah alert.',
            'Label actual pada stream simulasi memungkinkan metrik live actual-vs-predicted.',
        ],
    }
    rf = {'placeholder': False, 'feature_order': order,
          'imputer_medians': [float(m) for m in imp.statistics_],
          'n_trees': len(trees), 'trees': trees, 'meta': meta}

    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, 'w') as f:
        json.dump(rf, f, separators=(',', ':'))
    print(f'wrote {a.out} | {os.path.getsize(a.out)/1e6:.2f} MB | '
          f'nodes={sum(len(t["left"]) for t in trees):,}')

    # ---- parity check: mirror logika inference JS ----
    def js_proba(x):
        s = 0.0
        for t in trees:
            n, L, R, F, T, P = 0, t['left'], t['right'], t['feature'], t['threshold'], t['leaf_p1']
            while L[n] != -1:
                n = L[n] if x[F[n]] <= T[n] else R[n]
            s += P[n]
        return s / len(trees)

    df = pd.read_csv(a.csv)[order]
    X = df.iloc[np.random.RandomState(42).choice(len(df), 5000, replace=False)].to_numpy(float)
    diff = np.abs(pipe.predict_proba(X)[:, 1] - np.array([js_proba(r) for r in X])).max()
    print(f'parity max|diff| on 5000 rows: {diff:.3e}')
    if diff > 1e-6:
        sys.exit('PARITY FAIL - jangan commit rf.json')
    print('OK: rf.json siap di-commit.')

if __name__ == '__main__':
    main()