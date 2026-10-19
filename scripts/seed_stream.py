#!/usr/bin/env python3
"""Seed stream_source dari creditcard.csv via Supabase REST (stdlib saja). Idempotent."""
import base64, json, os, sys, urllib.request, urllib.error
from pathlib import Path
import pandas as pd

def load_dotenv():
    here = Path(__file__).resolve().parent
    for base in (here, here.parent):
        env_file = base / '.env'
        if not env_file.exists():
            continue
        for line in env_file.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, val = line.partition('=')
            os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))
        return env_file
    return None

loaded = load_dotenv()
URL = os.environ.get('SUPABASE_URL')
KEY = os.environ.get('SUPABASE_SERVICE_KEY')
if not URL or not KEY:
    sys.exit('SUPABASE_URL / SUPABASE_SERVICE_KEY tidak ditemukan (cek file .env).')
print(f'[env] dimuat dari: {loaded}')

def key_role():
    try:
        payload = KEY.split('.')[1]
        payload += '=' * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload)).get('role', '?')
    except Exception:
        return '(key non-JWT, mis. sb_secret_ -> OK)'

role = key_role()
print(f'[key] role terdeteksi: {role}')
if role == 'anon':
    sys.exit('SALAH KEY: ini anon/public key. Ganti SUPABASE_SERVICE_KEY dengan key '
             'service_role/secret (Project Settings -> API Keys).')

BASE = URL.rstrip('/')
HDR = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}

def fail_http(e, context):
    detail = e.read().decode(errors='replace')[:800]
    print(f'\nHTTP {e.code} ({context}) dari Supabase:\n{detail}')
    if e.code == 403:
        print('-> 403: role key tidak punya izin tulis (biasanya masih anon key, '
              'atau RLS aktif tanpa policy dan role bukan service_role).')
    elif e.code == 401:
        print('-> 401: key tidak valid/kedaluwarsa, atau SUPABASE_URL bukan project milik key ini.')
    sys.exit(1)

def insert(batch):
    req = urllib.request.Request(
        f'{BASE}/rest/v1/stream_source',
        data=json.dumps(batch).encode(), method='POST',
        headers={**HDR, 'Prefer': 'resolution=merge-duplicates,return=minimal'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status
    except urllib.error.HTTPError as e:
        fail_http(e, 'INSERT batch')

def main():
    default_csv = Path(__file__).resolve().parent.parent / 'scripts' / 'data' / 'creditcard.csv'
    csv = sys.argv[1] if len(sys.argv) > 1 else str(default_csv)
    cols = ['Time'] + [f'V{i}' for i in range(1, 29)] + ['Amount']
    df = pd.read_csv(csv)[cols + ['Class']].drop_duplicates().reset_index(drop=True)
    total, B = len(df), 500
    for s in range(0, total, B):
        batch = [{'idx': s + i,
                  'features': [float(v) for v in r[cols].to_numpy()],
                  'actual_class': int(r['Class'])}
                 for i, (_, r) in enumerate(df.iloc[s:s + B].iterrows())]
        insert(batch)
        print(f'seeded {min(s + B, total):,}/{total:,}', end='\r')
    print('\ndone.')

if __name__ == '__main__':
    main()