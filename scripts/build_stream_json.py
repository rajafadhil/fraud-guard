#!/usr/bin/env python3
"""Pecah creditcard.csv menjadi chunk JSON @1000 row di public/stream/."""
import json
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'stream'
cols = ['Time'] + [f'V{i}' for i in range(1, 29)] + ['Amount']

def main():
    df = pd.read_csv(ROOT / 'data' / 'creditcard.csv')[cols + ['Class']] \
           .drop_duplicates().reset_index(drop=True)
    OUT.mkdir(parents=True, exist_ok=True)
    B, n = 1000, 0
    for start in range(0, len(df), B):
        chunk = df.iloc[start:start + B]
        payload = {'idx_start': start, 'rows': [
            {'idx': start + i,
             'features': [float(v) for v in r[cols].to_numpy()],
             'actual_class': int(r['Class'])}
            for i, (_, r) in enumerate(chunk.iterrows())]}
        (OUT / f'chunk_{start // B:04d}.json').write_text(
            json.dumps(payload, separators=(',', ':')), encoding='utf-8')
        n += 1
    print(f'wrote {n} chunks ({len(df):,} row) to {OUT}')

if __name__ == '__main__':
    main()