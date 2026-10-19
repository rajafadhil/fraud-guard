import os
from pathlib import Path

# Mendapatkan direktori utama project (fraud-dashboard)
BASE_DIR = Path(__file__).resolve().parent.parent

# Sesuaikan folder tempat file .joblib disimpan:
# Jika berada di folder 'models/':
MODEL_PATH = BASE_DIR / "scripts" / "best_credit_card_fraud_rf.joblib"

# Jika berada langsung di folder root 'fraud-dashboard/':
# MODEL_PATH = BASE_DIR / "best_credit_card_fraud_rf.joblib"

if MODEL_PATH.exists():
    size_mb = os.path.getsize(MODEL_PATH) / 1e6
    print(f"file: {MODEL_PATH} | size: {size_mb:.1f} MB")
else:
    print(f"File tidak ditemukan di: {MODEL_PATH}")