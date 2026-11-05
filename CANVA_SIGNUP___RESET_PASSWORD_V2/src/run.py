import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import requests
import time
import random
import string
import os
import re
import socket
import traceback
import json
import multiprocessing
from colorama import Fore, Style, init
from dotenv import load_dotenv

# Muat .env (cari di cwd dan folder project, override agar tidak ke-cache None)
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ENV_CANDIDATES = [
    os.path.join(os.getcwd(), ".env"),
    os.path.join(_BASE_DIR, ".env"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"),
]
for _env_path in _ENV_CANDIDATES:
    if os.path.isfile(_env_path):
        # encoding utf-8-sig membuang BOM Windows yang bikin key jadi \ufeffCANVA_PASSWORD
        load_dotenv(dotenv_path=_env_path, override=True, encoding="utf-8-sig")
        break
else:
    load_dotenv(override=True)

# ==============================================================================
# KONFIGURASI
# ==============================================================================
API_KEY = os.getenv("API_KEY")
EMAIL_DOMAIN = os.getenv("DOM")
EMAIL_API_BASE = os.getenv("BASE")
PASSWORD = (os.getenv("CANVA_PASSWORD") or "masuk123").strip()
BILLING_PERIOD = (os.getenv("BILLING_PERIOD") or "monthly").strip().lower()

# URL Target Utama (Sesuai Flow Terbaru - Bebas Affiliate)
SIGNUP_URL = (os.getenv("CANVA_SIGNUP_URL") or "https://www.canva.com/id_id/signup/").strip()
PRICING_URL = "https://www.canva.com/id_id/harga/"
RESET_URL = "https://www.canva.com/id_id/login/reset/"

# === OUTLOOK OTP READER API (outlookreader.my.id) ===
OUTLOOK_READER_API_URL = (os.getenv("outlook_api_url") or "https://outlookreader.my.id/api/v1/otp").strip()
OUTLOOK_READER_API_KEY = (os.getenv("outlook_api_key") or "").strip()

# Mode 4: VCC dari .env (fallback jika vcc.txt kosong)
VCC_NUMBER = (os.getenv("VCC_NUMBER") or "").strip().replace(" ", "")
VCC_EXP_MONTH = (os.getenv("VCC_EXP_MONTH") or "").strip()
VCC_EXP_YEAR = (os.getenv("VCC_EXP_YEAR") or "").strip()
VCC_CVC = (os.getenv("VCC_CVC") or "").strip()
VCC_HOLDER = (os.getenv("VCC_HOLDER") or "").strip()

# Mode 4: alamat billing USA (New York) — dipakai saat VPN US
BILLING_NAME = (os.getenv("BILLING_NAME") or "John Smith").strip()
BILLING_LINE1 = (os.getenv("BILLING_LINE1") or "350 5th Ave").strip()
BILLING_LINE2 = (os.getenv("BILLING_LINE2") or "").strip()
BILLING_CITY = (os.getenv("BILLING_CITY") or "New York").strip()
BILLING_STATE = (os.getenv("BILLING_STATE") or "NY").strip()
BILLING_ZIP = (os.getenv("BILLING_ZIP") or "10118").strip()
BILLING_COUNTRY = (os.getenv("BILLING_COUNTRY") or "US").strip().upper()
BILLING_PHONE = (os.getenv("BILLING_PHONE") or "2125550199").strip()

# Alamat tetap Amerika Serikat (US) yang ditentukan oleh pengguna (tidak diubah-ubah)
US_FIXED_ADDRESS = {
    "line1": "969 Cox Rd",
    "city": "Gastonia",
    "state": "NC",
    "state_full": "North Carolina",
    "zip": "28054-3455",
    "zip_short": "28054",
    "full_query": "969 Cox Rd Gastonia, NC 28054-3455"
}

US_RANDOM_ADDRESSES = [US_FIXED_ADDRESS]

# Pool alamat valid Indonesia acak (Business & Commercial addresses)
ID_RANDOM_ADDRESSES = [
    {"line1": "Jl. Jend. Sudirman Kav. 52-53", "city": "Jakarta Selatan", "state": "DKI Jakarta", "zip": "12190"},
    {"line1": "Jl. M.H. Thamrin No. 28-30", "city": "Jakarta Pusat", "state": "DKI Jakarta", "zip": "10350"},
    {"line1": "Jl. Gatot Subroto Kav. 18", "city": "Jakarta Selatan", "state": "DKI Jakarta", "zip": "12930"},
    {"line1": "Jl. H. R. Rasuna Said Kav. X-2", "city": "Jakarta Selatan", "state": "DKI Jakarta", "zip": "12950"},
    {"line1": "Jl. Prof. DR. Satrio No. 3-5", "city": "Jakarta Selatan", "state": "DKI Jakarta", "zip": "12940"},
    {"line1": "Jl. Asia Afrika No. 8", "city": "Bandung", "state": "Jawa Barat", "zip": "40111"},
    {"line1": "Jl. Pemuda No. 33-37", "city": "Surabaya", "state": "Jawa Timur", "zip": "60271"},
    {"line1": "Jl. Gajah Mada No. 188", "city": "Semarang", "state": "Jawa Tengah", "zip": "50133"},
    {"line1": "Jl. Malioboro No. 56", "city": "Yogyakarta", "state": "DI Yogyakarta", "zip": "55213"},
    {"line1": "Jl. Jendral Sudirman No. 1", "city": "Medan", "state": "Sumatera Utara", "zip": "20152"},
    {"line1": "Jl. Teuku Umar No. 43", "city": "Denpasar", "state": "Bali", "zip": "80113"},
    {"line1": "Jl. Jend. Urip Sumoharjo No. 20", "city": "Makassar", "state": "Sulawesi Selatan", "zip": "90232"},
]

GLOBAL_BILLING_COUNTRY = "ID"

def get_billing_country():
    global GLOBAL_BILLING_COUNTRY
    if GLOBAL_BILLING_COUNTRY in ["ID", "US"]:
        return GLOBAL_BILLING_COUNTRY
    env_c = os.environ.get("BILLING_COUNTRY", "").strip().upper()
    if env_c in ["ID", "INDO", "INDONESIA"]:
        return "ID"
    if env_c in ["US", "USA", "AMERIKA"]:
        return "US"
    return "ID"

def set_billing_country(code):
    global GLOBAL_BILLING_COUNTRY
    c = str(code).strip().upper()
    if c in ["ID", "INDO", "INDONESIA", "2"]:
        GLOBAL_BILLING_COUNTRY = "ID"
        os.environ["BILLING_COUNTRY"] = "ID"
    elif c in ["US", "USA", "AMERIKA", "1"]:
        GLOBAL_BILLING_COUNTRY = "US"
        os.environ["BILLING_COUNTRY"] = "US"
    else:
        GLOBAL_BILLING_COUNTRY = "ID"
        os.environ["BILLING_COUNTRY"] = "ID"

def get_random_us_address():
    """Mengambil satu alamat valid Amerika Serikat secara acak."""
    return random.choice(US_RANDOM_ADDRESSES)

def get_random_id_address():
    """Mengambil satu alamat valid Indonesia secara acak."""
    return random.choice(ID_RANDOM_ADDRESSES)

def get_random_billing_address(country=None):
    """Mengambil alamat valid sesuai negara penagihan yang dipilih."""
    c = (country or get_billing_country()).upper()
    if c in ["ID", "INDO", "INDONESIA"]:
        return get_random_id_address()
    return get_random_us_address()

# File hasil
AKUN_FILE = "akun_canva.txt"                    # mode 1: akun gratis + password
AKUN_BAYAR_FILE = "akun_berhasil_bayar.txt"     # mode 2/4: email yang sudah bayar
AKUN_BAYAR_PASSWORD_FILE = "akun_bayar_password.txt"  # mode 2: sudah bayar + set password
EMAILS_FILE = "emails.txt"                      # mode 3: daftar email (satu per baris)
SUKSES_RESET_FILE = "sukses_reset.txt"          # mode 3: email yang berhasil set password
AKUN_LOGIN_FILE = "akun_login.txt"              # mode 4: email|password
VCC_FILE = "vcc.txt"                            # mode 4: number|mm|yy|cvc|holder
AKUN_AUTO_PAY_FILE = "akun_auto_pay.txt"        # mode 4: hasil auto pay sukses

# Inisialisasi colorama
init(autoreset=True)

# ─── Professional Logging & Diagnostics System ───────────────────
import logging
_LOG_DIR = os.path.join(_BASE_DIR, "logs")
os.makedirs(_LOG_DIR, exist_ok=True)
_LOG_FILE = os.path.join(_LOG_DIR, "pipeline.log")

_pipeline_logger = logging.getLogger("canva_pipeline")
_pipeline_logger.setLevel(logging.DEBUG)

if not _pipeline_logger.handlers:
    _file_handler = logging.FileHandler(_LOG_FILE, encoding="utf-8")
    _file_handler.setLevel(logging.DEBUG)
    _file_handler.setFormatter(
        logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    )
    _pipeline_logger.addHandler(_file_handler)

_ANSI_REGEX = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')

def dev_log(msg, level="info", *args, **kwargs):
    """Catat ke logs/pipeline.log secara terstruktur tanpa mencemari terminal console."""
    lvl = str(level).lower()
    clean_text = _ANSI_REGEX.sub('', str(msg)).strip()
    if not clean_text:
        return
    if lvl == "debug":
        _pipeline_logger.debug(clean_text)
    elif lvl in ("warning", "warn"):
        _pipeline_logger.warning(clean_text)
    elif lvl == "error":
        _pipeline_logger.error(clean_text)
    else:
        _pipeline_logger.info(clean_text)

def clean_err_msg(e: Exception, max_len: int = 80) -> str:
    """Format pesan exception menjadi ringkas 1 baris tanpa dump C++ stacktrace Selenium."""
    if not e:
        return ""
    msg = str(e).strip()
    for sep in ["Stacktrace:", "stacktrace:", "\n", "Backtrace:"]:
        if sep in msg:
            msg = msg.split(sep)[0].strip()
    if msg.startswith("Message:"):
        msg = msg[8:].strip()
    return msg[:max_len].strip()

def snap(driver, label="step"):
    """No-op: Screenshot dinonaktifkan sesuai preferensi user untuk performa tinggi & terminal bersih."""
    return None
# ───────────────────────────────────────────────────────────────


def _auto_click_next(driver, timeout=3):
    """
    Klik otomatis tombol Lanjutkan / Next / Continue / Berikutnya jika muncul setelah setiap aksi.
    Cek di halaman utama MAUPUN di semua visible iframe.
    """
    NEXT_LABELS = [
        "lanjutkan", "berikutnya", "selanjutnya",
        "next", "continue", "proceed",
        "lanjut", "ok", "oke", "ya",
    ]
    # Cek halaman utama dulu
    try:
        driver.switch_to.default_content()
        clicked = driver.execute_script("""
            const labels = arguments[0];
            const btns = Array.from(document.querySelectorAll('button, [type="submit"], [role="button"]'));
            const btn = btns.find(b => {
                const t = (b.innerText || b.value || '').trim().toLowerCase();
                const visible = b.offsetParent !== null && !b.disabled;
                return visible && labels.some(l => t === l || t.startsWith(l));
            });
            if (btn) { btn.scrollIntoView({block:'center'}); btn.click(); return btn.innerText.trim(); }
            return null;
        """, NEXT_LABELS)
        if clicked:
            print(Fore.CYAN + f"[AUTO-NEXT] Klik otomatis tombol: '{clicked}' (halaman utama)")
            time.sleep(1)
            return True
    except Exception:
        pass

    # Cek semua visible iframe
    try:
        iframes = driver.find_elements(By.TAG_NAME, "iframe")
        for frame in iframes:
            try:
                driver.switch_to.default_content()
                if not frame.is_displayed():
                    continue
                driver.switch_to.frame(frame)
                clicked_iframe = driver.execute_script("""
                    const labels = arguments[0];
                    const btns = Array.from(document.querySelectorAll('button, [type="submit"], [role="button"]'));
                    const btn = btns.find(b => {
                        const t = (b.innerText || b.value || '').trim().toLowerCase();
                        const visible = b.offsetParent !== null && !b.disabled;
                        return visible && labels.some(l => t === l || t.startsWith(l));
                    });
                    if (btn) { btn.scrollIntoView({block:'center'}); btn.click(); return btn.innerText.trim(); }
                    return null;
                """, NEXT_LABELS)
                if clicked_iframe:
                    print(Fore.CYAN + f"[AUTO-NEXT] Klik otomatis tombol: '{clicked_iframe}' (iframe)")
                    driver.switch_to.default_content()
                    time.sleep(1)
                    return True
            except Exception:
                driver.switch_to.default_content()
    except Exception:
        driver.switch_to.default_content()

    return False



def get_chrome_major_version():
    """Ambil major version Chrome yang terpasang (mis. 150 dari 150.0.7871.129)."""
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    ]
    for path in candidates:
        if not os.path.isfile(path):
            continue
        try:
            import subprocess
            # FileVersion via PowerShell (Windows)
            out = subprocess.check_output(
                [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    f'(Get-Item "{path}").VersionInfo.ProductVersion',
                ],
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=10,
            ).strip()
            if out:
                return int(out.split(".")[0])
        except Exception:
            pass
        # Fallback: folder versi di samping chrome.exe, mis. ...\Application\150.0.7871.129\
        try:
            app_dir = os.path.dirname(path)
            for name in os.listdir(app_dir):
                if re.match(r"^\d+\.\d+\.\d+\.\d+$", name):
                    return int(name.split(".")[0])
        except Exception:
            pass
    return None


# Ukuran browser portrait (vertikal) — mirip window sempit di screenshot
BROWSER_WIDTH = 480
BROWSER_HEIGHT = 900
BROWSER_GAP = 20  # jarak antar window jika multi-browser
# Maks browser paralel (mode 1/2/3). Window disusun kiri → kanan.
MAX_PARALLEL_BROWSERS = 4

# Lock terminal input saat multi-proses
_stdin_lock = None
# Mode 2 paralel: koordinasi 1x y/n untuk seluruh batch browser
_batch_pay_coord = None


def _pool_init(stdin_lock):
    """Initializer Pool: share lock input ke worker process."""
    global _stdin_lock
    _stdin_lock = stdin_lock


def _pool_init_batch_pay(batch_state, stdin_lock=None):
    """Initializer Pool mode 2: share state bayar batch + lock input terminal."""
    global _batch_pay_coord, _stdin_lock
    _batch_pay_coord = batch_state
    if stdin_lock is not None:
        _stdin_lock = stdin_lock


def safe_input(prompt=""):
    """input() aman untuk multi-proses (serialisasi via lock)."""
    if _stdin_lock is not None:
        with _stdin_lock:
            return input(prompt)
    return input(prompt)


def create_batch_pay_state(manager, expected):
    """
    State shared antar worker mode 2 paralel.
    Worker HANYA sinyal ready/failed + menunggu.
    Input y/n dilakukan di PROSES UTAMA (Windows: stdin worker sering EOF → dianggap n).
    """
    return {
        "expected": manager.Value("i", int(expected)),
        "ready": manager.Value("i", 0),
        "failed": manager.Value("i", 0),
        "pay_ok": manager.Value("i", 0),
        "decided": manager.Value("i", 0),
        "lock": manager.Lock(),
        # Worker menunggu keputusan main di sini
        "event": manager.Event(),
        # Main menunggu sampai semua worker ready/failed
        "all_settled": manager.Event(),
        "labels": manager.list(),
    }


def _batch_pay_mark_settled_if_done(state):
    """Set all_settled jika ready+failed >= expected (harus dalam lock)."""
    done = state["ready"].value + state["failed"].value
    if done >= state["expected"].value:
        state["all_settled"].set()


def batch_pay_register_failed(state):
    """Worker gagal sebelum siap pay (signup/dll)."""
    if state is None:
        return
    with state["lock"]:
        state["failed"].value += 1
        print(
            Fore.YELLOW
            + f"[BATCH] Browser gagal (belum siap pay). "
            + f"siap={state['ready'].value} gagal={state['failed'].value} "
            + f"total={state['expected'].value}"
        )
        _batch_pay_mark_settled_if_done(state)


def batch_pay_register_ready(state, email, window_index=0):
    """
    Browser sudah login & siap pay manual.
    Worker TIDAK memanggil input() — hanya menunggu sinyal dari proses utama.
    Browser tetap terbuka sampai main memproses y/n.
    """
    if state is None:
        return False

    x_pos = window_index * (BROWSER_WIDTH + BROWSER_GAP)
    label = f"Browser #{window_index + 1} (x={x_pos}) | {email}"

    with state["lock"]:
        state["ready"].value += 1
        state["labels"].append(label)
        ready_n = state["ready"].value
        exp = state["expected"].value
        failed_n = state["failed"].value
        print(Fore.GREEN + Style.BRIGHT + f"[READY] {label}")
        print(
            Fore.CYAN
            + f"       Menunggu browser lain + konfirmasi terminal... "
            + f"({ready_n + failed_n}/{exp})"
        )
        _batch_pay_mark_settled_if_done(state)

    # Tunggu keputusan y/n dari PROSES UTAMA (browser tetap buka di sini)
    print(
        Fore.YELLOW
        + f"[WAIT] {label} — browser TETAP BUKA. Bayar manual dulu, "
        + "lalu ketik y di terminal utama."
    )
    state["event"].wait()
    ok = bool(state["pay_ok"].value)
    if ok:
        print(Fore.GREEN + f"[BATCH] Bayar OK → lanjut set password: {email}")
    else:
        print(Fore.YELLOW + f"[BATCH] Skip / gagal: {email}")
    return ok


def batch_pay_confirm_in_main(state):
    """
    HANYA dipanggil dari proses utama.
    Tunggu semua worker ready/failed → minta y/n di stdin main → lepas worker.
    """
    print(
        Fore.CYAN
        + Style.BRIGHT
        + "\n[BATCH] Menunggu semua browser selesai signup/login..."
    )
    # Poll agar bisa tampil progress (dan tidak hang diam)
    while not state["all_settled"].wait(timeout=2.0):
        with state["lock"]:
            r = state["ready"].value
            f = state["failed"].value
            e = state["expected"].value
        print(
            Fore.CYAN
            + f"[BATCH] Progress: siap={r} gagal={f} / total={e} "
            + "(browser yang sudah READY tetap terbuka)"
        )

    with state["lock"]:
        if state["decided"].value:
            return bool(state["pay_ok"].value)
        ready_n = state["ready"].value
        labels = list(state["labels"])

    if ready_n <= 0:
        print(
            Fore.YELLOW
            + Style.BRIGHT
            + "\n[BATCH] Tidak ada browser yang siap pay manual."
        )
        state["pay_ok"].value = 0
        state["decided"].value = 1
        state["event"].set()
        return False

    print(Fore.YELLOW + Style.BRIGHT + "\n" + "=" * 64)
    print(Fore.YELLOW + Style.BRIGHT + "  MODE 2 BATCH — PAY MANUAL SEMUA BROWSER")
    print(Fore.YELLOW + Style.BRIGHT + "=" * 64)
    print(
        Fore.GREEN
        + Style.BRIGHT
        + f"  {ready_n} browser SIAP & TETAP TERBUKA (tanpa refresh). Jangan tutup."
    )
    print(Fore.WHITE + "  Silakan BAYAR MANUAL di semua window di bawah:")
    for i, lab in enumerate(labels, 1):
        print(Fore.CYAN + Style.BRIGHT + f"    {i}. {lab}")
    print(Fore.WHITE + "  Langkah di tiap browser:")
    print(Fore.WHITE + "    1. Trial / upgrade Canva Bisnis")
    print(Fore.WHITE + "    2. Selesaikan pembayaran")
    print(Fore.WHITE + "    3. Tunggu Canva konfirmasi sukses")
    print(
        Fore.CYAN
        + Style.BRIGHT
        + "  Setelah SEMUA sudah bayar, ketik y di terminal ini (bukan di browser):"
    )
    print(
        Fore.GREEN
        + Style.BRIGHT
        + "     y  = SEMUA bayar OK → set password SEMUA browser otomatis"
    )
    print(Fore.RED + "     n  = batalkan → TIDAK set password")
    print(Fore.YELLOW + Style.BRIGHT + "=" * 64 + "\n")

    # Loop sampai jawaban valid — jangan anggap kosong/EOF sebagai n
    jawab = ""
    while True:
        try:
            jawab = input(
                Fore.CYAN
                + Style.BRIGHT
                + f"  Status SEMUA pembayaran ({ready_n} browser) [y/n]: "
                + Style.RESET_ALL
            ).strip().lower()
        except EOFError:
            print(
                Fore.RED
                + "[BATCH] Input terminal gagal (EOF). Coba ketik lagi y atau n."
            )
            jawab = ""
        if jawab in ("y", "ya", "yes", "1"):
            print(
                Fore.GREEN
                + Style.BRIGHT
                + f"[BATCH] y — set password otomatis untuk {ready_n} browser..."
            )
            state["pay_ok"].value = 1
            break
        if jawab in ("n", "no", "tidak", "0"):
            print(
                Fore.YELLOW
                + Style.BRIGHT
                + "[BATCH] n — set password dibatalkan untuk batch ini."
            )
            state["pay_ok"].value = 0
            break
        print(Fore.RED + "  Ketik y (lanjut set password) atau n (batal). Browser masih terbuka.")

    state["decided"].value = 1
    state["event"].set()
    return bool(state["pay_ok"].value)


def _apply_chrome_stealth_prefs(options):
    """
    Matikan Save Password & Save Card bubble Chrome — sering nutupi tombol & form.
    """
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-save-password-bubble")
    options.add_argument("--disable-offer-store-unmasked-wallet-cards")
    options.add_argument("--disable-notifications")
    options.add_argument("--disable-blink-features=AutomationControlled")
    try:
        options.add_experimental_option(
            "prefs",
            {
                "credentials_enable_service": False,
                "profile.password_manager_enabled": False,
                "profile.password_manager_leak_detection": False,
                "autofill.credit_card_enabled": False,
                "autofill.profile_enabled": False,
                "autofill.credit_card_save_prompt": False,
            },
        )
    except Exception:
        pass
    return options


def _free_tcp_port():
    """Ambil port TCP bebas (untuk remote-debugging multi-Chrome)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])
    finally:
        try:
            s.close()
        except Exception:
            pass


def _chrome_profile_dir(window_index=0):
    """
    Profil Chrome unik per window+pid+timestamp — WAJIB multi-browser.
    Tanpa ini, 2 proses uc.Chrome sering bentrok (hanya 1 window muncul).
    """
    base = os.path.join(_BASE_DIR, "chrome_profiles")
    stamp = f"{int(time.time() * 1000)}_{random.randint(1000, 9999)}"
    path = os.path.join(base, f"win{window_index}_pid{os.getpid()}_{stamp}")
    os.makedirs(path, exist_ok=True)
    return path


def cleanup_stale_profiles():
    """Hapus folder profile Chrome lama dan sisa lock agar browser selalu 100% fresh dan disk tetap bersih."""
    base = os.path.join(_BASE_DIR, "chrome_profiles")
    if os.path.isdir(base):
        import shutil
        for item in os.listdir(base):
            p = os.path.join(base, item)
            if os.path.isdir(p):
                try:
                    shutil.rmtree(p, ignore_errors=True)
                except Exception:
                    pass
            elif item.endswith(".lock"):
                try:
                    os.remove(p)
                except Exception:
                    pass



def _worker_log_path(window_index=0):
    log_dir = os.path.join(_BASE_DIR, "logs")
    os.makedirs(log_dir, exist_ok=True)
    return os.path.join(log_dir, f"browser_{window_index + 1}_pid{os.getpid()}.log")


def _log_line(msg, log_file=None):
    """Catat ke dev_log / file log worker tanpa membanjiri stdout konsol."""
    line = f"{msg}"
    dev_log(line)
    if log_file:
        try:
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass


# Lock file agar patch ChromeDriver uc tidak race saat buka banyak browser
_UC_LAUNCH_LOCK = os.path.join(_BASE_DIR, "chrome_profiles", ".uc_launch.lock")


def _acquire_uc_launch_lock(timeout_sec=180):
    """Simple file lock (Windows-friendly) untuk serialisasi start uc.Chrome."""
    os.makedirs(os.path.dirname(_UC_LAUNCH_LOCK), exist_ok=True)
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            fd = os.open(_UC_LAUNCH_LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode("ascii", errors="ignore"))
            os.close(fd)
            return True
        except FileExistsError:
            try:
                age = time.time() - os.path.getmtime(_UC_LAUNCH_LOCK)
                if age > 180:
                    os.remove(_UC_LAUNCH_LOCK)
                    continue
            except Exception:
                pass
            time.sleep(0.5 + random.uniform(0, 0.4))
        except Exception:
            time.sleep(0.5)
    return False


def _release_uc_launch_lock():
    try:
        if os.path.isfile(_UC_LAUNCH_LOCK):
            os.remove(_UC_LAUNCH_LOCK)
    except Exception:
        pass


def create_chrome_driver(options=None, window_index=0, max_retries=3):
    """
    Buat uc.Chrome multi-instance yang stabil di Windows:
    - user-data-dir unik
    - remote-debugging-port unik
    - launch di-serial (file lock) + retry
    """
    log_file = _worker_log_path(window_index)
    x = window_index * (BROWSER_WIDTH + BROWSER_GAP)
    major = get_chrome_major_version()
    last_err = None

    for attempt in range(1, max_retries + 1):
        profile_dir = _chrome_profile_dir(window_index)
        debug_port = _free_tcp_port()

        opts = uc.ChromeOptions()
        _apply_chrome_stealth_prefs(opts)
        opts.add_argument(f"--window-size={BROWSER_WIDTH},{BROWSER_HEIGHT}")
        opts.add_argument(f"--window-position={x},0")
        # Jangan pakai --user-data-dir di options bila juga lewat kwarg (dobel bikin error)
        opts.add_argument(f"--remote-debugging-port={debug_port}")
        # Hindari reuse instance / singleton
        opts.add_argument("--no-first-run")
        opts.add_argument("--no-default-browser-check")
        opts.add_argument("--disable-backgrounding-occluded-windows")

        _log_line(
            Fore.CYAN
            + f"[INFO] Buka browser #{window_index + 1} attempt {attempt}/{max_retries} "
            + f"| port={debug_port} | profile={profile_dir}",
            log_file,
        )

        got_lock = _acquire_uc_launch_lock()
        if not got_lock:
            _log_line(
                Fore.YELLOW + "[WARN] Lock launch timeout — coba buka Chrome tanpa lock.",
                log_file,
            )

        driver = None
        try:
            kwargs = {
                "options": opts,
                "user_data_dir": profile_dir,
                "use_subprocess": True,
            }
            if major:
                kwargs["version_main"] = major
            driver = uc.Chrome(**kwargs)
        except Exception as e:
            last_err = e
            _log_line(
                Fore.RED
                + f"[ERROR] Browser #{window_index + 1} gagal start attempt {attempt}: {e}",
                log_file,
            )
            _log_line(traceback.format_exc(), log_file)
            try:
                if driver:
                    driver.quit()
            except Exception:
                pass
            time.sleep(1.5 * attempt)
            continue
        finally:
            _release_uc_launch_lock()

        # Pastikan ukuran/posisi portrait
        try:
            driver.set_window_rect(x=x, y=0, width=BROWSER_WIDTH, height=BROWSER_HEIGHT)
        except Exception as e:
            _log_line(Fore.YELLOW + f"[WARN] set_window_rect: {e}", log_file)

        _log_line(
            Fore.GREEN
            + f"[OK] Browser #{window_index + 1} SIAP "
            + f"{BROWSER_WIDTH}x{BROWSER_HEIGHT} di x={x} (pid={os.getpid()})",
            log_file,
        )
        driver._user_data_dir = profile_dir
        return driver

    raise RuntimeError(
        f"Gagal buka browser #{window_index + 1} setelah {max_retries} percobaan. "
        f"Terakhir: {last_err}"
    )


class CLI:
    """Formatter output terminal modern, bersih, minimalis, dan elegan ala Claude/Modern CLI."""
    
    @staticmethod
    def header():
        print()
        print(Fore.CYAN + Style.BRIGHT + r"""   ______ ___    _   ___     _____ 
  / ____//   |  / | / / |   / /   |
 / /    / /| | /  |/ /| |  / / /| |
/ /___ / ___ |/ /|  / | | / / ___ |
\____//_/  |_/_/ |_/  |___//_/  |_|
    ___   __  ___________ ____  ___  __  __
   /   | / / / /_  __/ __ \/ __ \/   |\ \/ /
  / /| |/ / / / / / / / / / /_/ / /| | \  / 
 / ___ / /_/ / / / / /_/ / ____/ ___ | / /  
/_/  |_\____/ /_/  \____/_/   /_/  |_|/_/   """)
        print(Fore.WHITE + "                 t.me/Drosek" + Style.RESET_ALL)
        print()

    @staticmethod
    def config_info(total, email_src="emails.txt", vcc_src="cc.txt"):
        print(Fore.WHITE + "  • Metode   : " + Fore.GREEN + "Canva Bisnis Trial 0 Rupiah (Unified Flow)")
        print(Fore.WHITE + "  • Lokasi   : " + Fore.GREEN + "United States (Alamat & Pajak US)")
        print(Fore.WHITE + "  • Sumber   : " + Fore.CYAN + f"{email_src} | {vcc_src}")
        print(Fore.WHITE + "  • Target   : " + Fore.YELLOW + Style.BRIGHT + f"{total} Akun")
        print(Fore.CYAN + "  ───────────────────────────────────────────────────────────────" + Style.RESET_ALL)

    @staticmethod
    def account_header(idx, total, email):
        print(f"\n" + Fore.MAGENTA + Style.BRIGHT + f"  [{idx}/{total}] " + Fore.WHITE + Style.BRIGHT + f"{email}" + Style.RESET_ALL)

    @staticmethod
    def step(num, title, status=None, detail=""):
        tag = ""
        if status == "SUCCESS":
            tag = Fore.GREEN + Style.BRIGHT + "[✓] Berhasil"
        elif status == "FAIL":
            tag = Fore.RED + Style.BRIGHT + f"[✕] Gagal {detail}".strip()
        elif status == "RUNNING":
            tag = Fore.YELLOW + "[•] Memproses..."
        elif status == "SKIP":
            tag = Fore.YELLOW + f"[~] Dilewati {detail}".strip()
        else:
            tag = Fore.WHITE + detail
        print(Fore.CYAN + f"    ├── [{num}/6] {title:<25} " + tag + Style.RESET_ALL)

    @staticmethod
    def step_last(num, title, status=None, detail=""):
        tag = ""
        if status == "SUCCESS":
            tag = Fore.GREEN + Style.BRIGHT + "[✓] Berhasil"
        elif status == "FAIL":
            tag = Fore.RED + Style.BRIGHT + f"[✕] Gagal {detail}".strip()
        elif status == "RUNNING":
            tag = Fore.YELLOW + "[•] Memproses..."
        else:
            tag = Fore.WHITE + detail
        print(Fore.CYAN + f"    └── [{num}/6] {title:<25} " + tag + Style.RESET_ALL)

    @staticmethod
    def sub_info(title, val):
        print(Fore.CYAN + f"    │    ├── {title:<18}: " + Fore.WHITE + str(val) + Style.RESET_ALL)

    @staticmethod
    def card_attempt(c_idx, max_cards, last4, exp):
        print(Fore.CYAN + f"    │    ├── Kartu #{c_idx}/{max_cards} (****{last4} | {exp})")

    @staticmethod
    def card_result(sub_idx, max_subs, success, msg=""):
        if success:
            res = Fore.GREEN + Style.BRIGHT + "[✓] Disetujui (Rp 0)"
        else:
            res = Fore.YELLOW + f"[✕] {msg}"
        print(Fore.CYAN + f"    │    │    └── Submit #{sub_idx}/{max_subs}: " + res + Style.RESET_ALL)

    @staticmethod
    def account_finish(success, email):
        if success:
            print(Fore.GREEN + Style.BRIGHT + f"    Status: [✓] SUKSES AKTIF ── Tersimpan di result.txt & akun_berhasil_bayar.txt")
        else:
            print(Fore.RED + Style.BRIGHT + f"    Status: [✕] GAGAL ── Dicatat di result.txt")
        print(Fore.CYAN + "  ───────────────────────────────────────────────────────────────" + Style.RESET_ALL)

    @staticmethod
    def summary(total, success, failed):
        print()
        print(Fore.CYAN + Style.BRIGHT + "  [•] RINGKASAN:" + Style.RESET_ALL)
        print(Fore.WHITE + f"  ├── Total Akun Diproses     : {total}")
        print(Fore.GREEN + f"  ├── Berhasil Aktif (Bisnis) : {success}")
        fail_color = Fore.RED if failed > 0 else Fore.WHITE
        print(fail_color + f"  ├── Gagal                   : {failed}")
        print(Fore.WHITE + f"  └── File Output             : akun_berhasil_bayar.txt, result.txt" + Style.RESET_ALL)
        print()


def print_logo_keren():
    CLI.header()


# ==============================================================================
# FUNGSI UTILITAS
# ==============================================================================

def slow_type(element, text: str, min_delay: float = 0.01, max_delay: float = 0.03):
    if text is None:
        raise ValueError(
            "Teks yang diketik None. Cek .env: CANVA_PASSWORD / field terkait tidak ter-load."
        )
    text = str(text)
    if text == "":
        return
    for char in text:
        element.send_keys(char)
        if min_delay > 0:
            time.sleep(random.uniform(min_delay, max_delay))



def require_password():
    """Pastikan CANVA_PASSWORD ada sebelum set/reset password (mode 1/2/3)."""
    global PASSWORD
    if not PASSWORD:
        # Coba reload sekali lagi (mis. .env baru diedit)
        for _env_path in _ENV_CANDIDATES:
            if os.path.isfile(_env_path):
                load_dotenv(dotenv_path=_env_path, override=True, encoding="utf-8-sig")
                break
        PASSWORD = (os.getenv("CANVA_PASSWORD") or "masuk123").strip()
    return PASSWORD or "masuk123"


def generate_email():
    user = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    email = f"{user}@{EMAIL_DOMAIN}"
    url = f"{EMAIL_API_BASE}/api/email/{requests.utils.quote(email)}/{API_KEY}"
    try:
        res = requests.get(url, timeout=15)
        if res.status_code == 200:
            dev_log(f"[INFO] Berhasil membuat email sementara: {email}")
            return {"email": email, "user": user}
        else:
            print(f"[ERROR] Gagal membuat email. Status: {res.status_code}")
            return None
    except requests.RequestException as e:
        print(f"[ERROR] Gagal terhubung ke API UserGhost: {e}")
        return None


def fetch_inbox_messages(email):
    """Ambil daftar pesan inbox (list dict). Gagal → []."""
    url = f"{EMAIL_API_BASE}/api/messages/{requests.utils.quote(email)}/{API_KEY}"
    try:
        res = requests.get(url, timeout=15)
        if res.status_code == 200 and isinstance(res.json(), list):
            return res.json()
    except requests.RequestException as e:
        dev_log(f"[WARN] Gagal fetch inbox: {e}")
    return []


DEFAULT_GRAPH_CLIENT_ID = "9e5f94bc-e8a4-4e73-b8be-63364c29d753"

_OUTLOOK_CLIENT_CACHE = {}

def get_outlook_client(email: str, refresh_token: str, client_id: str = ""):
    em_key = email.strip().lower()
    client = _OUTLOOK_CLIENT_CACHE.get(em_key)
    if client is None:
        client = OutlookGraphClient(email, refresh_token, client_id)
        _OUTLOOK_CLIENT_CACHE[em_key] = client
    else:
        if refresh_token and refresh_token.strip() and refresh_token != client.refresh_token:
            client.refresh_token = refresh_token.strip()
        if client_id and client_id.strip() and client_id != client.client_id:
            client.client_id = client_id.strip()
    return client


class OutlookGraphClient:
    """
    Client Microsoft Graph API langsung untuk membaca email Outlook / Hotmail via refresh_token.
    Mendukung pengambilan email dari Inbox dan Junk/Spam tanpa membuka browser tab.
    """
    def __init__(self, email: str, refresh_token: str, client_id: str = ""):
        self.email = email.strip()
        self.refresh_token = refresh_token.strip()
        self.client_id = client_id.strip() if client_id and client_id.strip() else DEFAULT_GRAPH_CLIENT_ID
        self.access_token = None
        self.token_expiry = 0

    def get_access_token(self) -> str:
        """Dapatkan atau refresh token OAuth2 untuk Microsoft Graph API."""
        now = time.time()
        if self.access_token and now < (self.token_expiry - 60):
            return self.access_token

        token_endpoints = [
            ("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
                "client_id": self.client_id,
                "grant_type": "refresh_token",
                "refresh_token": self.refresh_token,
                "scope": "https://graph.microsoft.com/Mail.Read offline_access"
            }),
            ("https://login.live.com/oauth20_token.srf", {
                "client_id": self.client_id,
                "grant_type": "refresh_token",
                "refresh_token": self.refresh_token
            })
        ]

        last_err = None
        for url, data in token_endpoints:
            try:
                resp = requests.post(url, data=data, timeout=15)
                if resp.status_code == 200:
                    payload = resp.json()
                    self.access_token = payload.get("access_token")
                    expires_in = payload.get("expires_in", 3600)
                    self.token_expiry = now + int(expires_in)
                    new_refresh = payload.get("refresh_token")
                    if new_refresh:
                        self.refresh_token = new_refresh
                    return self.access_token
                else:
                    last_err = f"HTTP {resp.status_code}: {resp.text[:200]}"
            except Exception as e:
                last_err = str(e)

        raise RuntimeError(f"Gagal refresh token Microsoft Graph API ({self.email}): {last_err}")

    def get_recent_messages(self, top: int = 10) -> list:
        """Ambil email terbaru dari Inbox dan Junk Email via Microsoft Graph API."""
        token = self.get_access_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json"
        }

        urls = [
            f"https://graph.microsoft.com/v1.0/me/messages?$top={top}&$select=id,subject,bodyPreview,body,from,receivedDateTime&$orderby=receivedDateTime desc",
            f"https://graph.microsoft.com/v1.0/me/mailFolders/junkemail/messages?$top=5&$select=id,subject,bodyPreview,body,from,receivedDateTime&$orderby=receivedDateTime desc"
        ]

        messages = []
        seen_ids = set()

        for url in urls:
            try:
                r = requests.get(url, headers=headers, timeout=12)
                if r.status_code == 200:
                    items = r.json().get("value", [])
                    for item in items:
                        m_id = item.get("id")
                        if m_id and m_id not in seen_ids:
                            seen_ids.add(m_id)
                            messages.append({
                                "id": m_id,
                                "subject": item.get("subject") or "",
                                "bodyPreview": item.get("bodyPreview") or "",
                                "bodyContent": (item.get("body") or {}).get("content") or "",
                                "sender": ((item.get("from") or {}).get("emailAddress") or {}).get("address") or "",
                                "receivedDateTime": item.get("receivedDateTime") or ""
                            })
            except Exception:
                continue

        return messages

    def capture_baseline(self) -> dict:
        """
        Ambil baseline inbox SEBELUM OTP dikirim:
        - baseline_ids : set of Graph message-ID yang sudah ada (filter utama)
        - baseline_time: timestamp ISO pesan terbaru (filter cadangan berdasarkan receivedDateTime)
        Return dict {"ids": set, "time": str_iso}
        """
        try:
            msgs = self.get_recent_messages(top=20)
            ids = {m["id"] for m in msgs}
            # Ambil receivedDateTime terbaru sebagai cutoff
            times = [m.get("receivedDateTime", "") for m in msgs if m.get("receivedDateTime")]
            latest_time = max(times) if times else ""
            return {"ids": ids, "time": latest_time}
        except Exception:
            return {"ids": set(), "time": ""}

    def poll_for_canva_otp(self, baseline_ids: set = None, exclude_otp: set = None,
                           timeout_sec: int = 120, purpose: str = "signup",
                           baseline_time: str = "") -> dict:
        """
        Poll inbox Outlook via Graph API hingga OTP baru dari Canva ditemukan.
        Filter berlapis:
          1. baseline_ids  : abaikan pesan yg sudah ada sebelum proses dimulai.
          2. baseline_time : abaikan pesan yg receivedDateTime <= waktu baseline (filter cadangan).
          3. exclude_otp   : abaikan kode OTP yang sudah pernah dicoba/ditolak.
        """
        baseline_ids = baseline_ids or set()
        exclude_otp = exclude_otp or set()
        deadline = time.time() + timeout_sec
        # Normalisasi baseline_time agar perbandingan string ISO 8601 valid
        bt = (baseline_time or "").strip()
        dev_log(
            f"[GRAPH API] Memantau inbox Outlook ({purpose}) via MS Graph API: {self.email} | "
            f"baseline_ids={len(baseline_ids)} | baseline_time={bt or 'N/A'} | "
            f"exclude_otp={exclude_otp or 'None'}"
        )

        # Lacak ID yang sudah dilihat di sesi poll ini (untuk log)
        _seen_in_poll = set(baseline_ids)

        while time.time() < deadline:
            try:
                messages = self.get_recent_messages(top=15)
                best_msg = None   # pesan terbaik (terbaru) yang lolos semua filter

                for msg in messages:
                    msg_id = msg["id"]

                    # Filter 1: ID sudah ada di baseline
                    if msg_id in baseline_ids:
                        continue

                    # Filter 2: receivedDateTime <= baseline_time (pesan lebih lama dari baseline)
                    recv_dt = (msg.get("receivedDateTime") or "").strip()
                    if bt and recv_dt and recv_dt <= bt:
                        # Masukkan ke baseline_ids secara dinamis agar tidak diproses lagi
                        baseline_ids.add(msg_id)
                        continue

                    # Log pesan baru yang pertama kali dilihat
                    if msg_id not in _seen_in_poll:
                        _seen_in_poll.add(msg_id)
                        dev_log(
                            f"[GRAPH API] Pesan baru terdeteksi: id={msg_id[:20]}... "
                            f"subject='{msg.get('subject', '')[:60]}' recv={recv_dt}"
                        )

                    full_text = f"{msg['subject']} {msg['bodyPreview']} {msg['bodyContent']}".lower()
                    sender = (msg.get("sender") or "").lower()

                    # Harus dari/tentang Canva
                    if "canva" not in full_text and "canva" not in sender:
                        continue

                    # Filter khusus password_reset: jangan ambil email konfirmasi signup lama
                    if purpose == "password_reset":
                        if any(k in full_text for k in (
                            "selesaikan pendaftaran", "complete your sign", "finish signing up",
                            "selesaikan proses pendaftaran", "verify your email"
                        )):
                            continue

                    code = extract_otp_code(full_text)
                    if not code:
                        continue

                    # Filter 3: kode OTP sudah pernah dicoba/ditolak
                    if str(code).strip() in exclude_otp:
                        dev_log(f"[GRAPH API] Kode {code} ada di exclude_otp, dilewati.")
                        continue

                    # Pilih pesan terbaru (receivedDateTime terbesar) sebagai kandidat terbaik
                    if best_msg is None:
                        best_msg = (recv_dt, code, msg_id)
                    else:
                        if recv_dt > best_msg[0]:
                            best_msg = (recv_dt, code, msg_id)

                if best_msg is not None:
                    _, code, msg_id = best_msg
                    dev_log(
                        Fore.GREEN + Style.BRIGHT +
                        f"[GRAPH API] OTP {purpose.upper()} DITEMUKAN: {code} (msg_id={msg_id[:20]}...)"
                    )
                    if purpose in ("reauth", "sesi_3", "step_3"):
                        CLI.sub_info("OTP Sesi (Ke-3)", code)
                    else:
                        CLI.sub_info(f"OTP {purpose.replace('_', ' ').capitalize()}", code)
                    return {"otp": code, "msg_id": msg_id}

            except Exception as _poll_err:
                dev_log(f"[GRAPH API] Error saat poll: {_poll_err}")

            time.sleep(2.5)

        dev_log(Fore.RED + f"[GRAPH API] Timeout menunggu OTP {purpose} dari Graph API ({self.email}).")
        return None


def _fetch_outlookreader_messages(account_data: dict) -> list:
    """
    Ambil daftar pesan / OTP terbaru dari outlookreader.my.id secara cepat.
    Mendukung endpoint /api/read-inbox (daftar pesan lengkap) dan /api/v1/otp.
    """
    if not isinstance(account_data, dict):
        return []
    email = (account_data.get("email") or "").strip()
    email_pwd = (account_data.get("email_password") or "").strip()
    refresh_token = (account_data.get("refresh_token") or "").strip()
    client_id = (account_data.get("client_id") or DEFAULT_GRAPH_CLIENT_ID).strip()
    if not email or "@" not in email:
        return []

    credentials_str = f"{email}|{email_pwd}|{refresh_token}|{client_id}" if refresh_token else f"{email}|{email_pwd}"
    results_list = []

    # 1. Endpoint /api/v1/otp (cepat & ringan bila API Key tersedia)
    if OUTLOOK_READER_API_KEY:
        try:
            resp = requests.post(
                OUTLOOK_READER_API_URL,
                headers={"X-API-Key": OUTLOOK_READER_API_KEY, "Content-Type": "application/json"},
                json={"credentials": credentials_str, "top": 10},
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success") and data.get("code"):
                    cs = data.get("codeSource") or {}
                    otp_str = str(data.get("code")).strip()
                    recv_at = str(cs.get("receivedAt") or "").strip()
                    subj = cs.get("subject") or ""
                    from_em = cs.get("fromEmail") or ""
                    results_list.append({
                        "id": f"{recv_at}_{otp_str}",
                        "code": otp_str,
                        "subject": subj,
                        "from": from_em,
                        "receivedAt": recv_at,
                    })
        except Exception as e:
            dev_log(f"[OUTLOOKREADER] /api/v1/otp info: {e}")

    # 2. Endpoint /api/read-inbox (mengembalikan banyak pesan lengkap beserta subject, body, date)
    try:
        resp = requests.post(
            "https://outlookreader.my.id/api/read-inbox",
            headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
            json={"credentials": credentials_str, "mode": "oauth2", "useProxy": False},
            timeout=12,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data and isinstance(data.get("results"), list) and len(data["results"]) > 0:
                acc = data["results"][0]
                if acc.get("success") and isinstance(acc.get("messages"), list):
                    for m in acc["messages"]:
                        subj = m.get("subject") or ""
                        prev = m.get("preview") or ""
                        body = m.get("body") or ""
                        dt = str(m.get("date") or m.get("receivedDateTime") or "").strip()
                        from_str = f"{m.get('from', '')} {m.get('fromEmail', '')}"
                        code = extract_otp_code(f"{subj} {prev} {body}")
                        code_str = str(code).strip() if code else None
                        msg_uid = m.get("id") or f"{dt}_{code_str or subj[:20]}"
                        if code_str and not any(r.get("code") == code_str for r in results_list):
                            results_list.append({
                                "id": str(msg_uid),
                                "code": code_str,
                                "subject": subj,
                                "from": from_str,
                                "receivedAt": dt,
                            })
    except Exception as e:
        dev_log(f"[OUTLOOKREADER] /api/read-inbox info: {e}")

    return results_list


def get_max_message_id(account_or_email):
    """
    Ambil baseline inbox SEBELUM tombol kirim OTP diklik:
    - Menyimpan daftar kode OTP yang SUDAH ADA di inbox (`existing_otps`), ID pesan (`ids`),
      dan waktu pesan terakhir (`time`) SEBELUM request OTP dikirim.
    - Dengan mencatat `existing_otps` sebelum klik submit, kode OTP yang baru masuk tidak akan
      pernah salah dianggap sebagai kode lama akibat selisih timestamp server!
    """
    if isinstance(account_or_email, dict):
        if account_or_email.get("refresh_token") or OUTLOOK_READER_API_KEY:
            ids = set()
            existing_otps = set()
            latest_time = ""

            # 1. Snapshot cepat via outlookreader.my.id
            try:
                or_msgs = _fetch_outlookreader_messages(account_or_email)
                for m in or_msgs:
                    if m.get("id"):
                        ids.add(str(m["id"]))
                    if m.get("code"):
                        existing_otps.add(str(m["code"]).strip())
                    if m.get("receivedAt") and m["receivedAt"] > latest_time:
                        latest_time = m["receivedAt"]
            except Exception:
                pass

            # 2. Fallback snapshot via Graph API jika belum dapat dari outlookreader
            if not existing_otps and account_or_email.get("refresh_token"):
                try:
                    client = get_outlook_client(
                        account_or_email["email"],
                        account_or_email["refresh_token"],
                        account_or_email.get("client_id", "")
                    )
                    msgs = client.get_recent_messages(top=10)
                    for m in msgs:
                        if m.get("id"):
                            ids.add(m["id"])
                        c = extract_otp_code(f"{m.get('subject', '')} {m.get('bodyPreview', '')}")
                        if c:
                            existing_otps.add(str(c).strip())
                        rt = (m.get("receivedDateTime") or "").strip()
                        if rt and rt > latest_time:
                            latest_time = rt
                except Exception:
                    pass

            return {"ids": ids, "time": latest_time, "existing_otps": existing_otps}
        email = account_or_email.get("email", "")
    else:
        email = str(account_or_email)

    msgs = fetch_inbox_messages(email)
    if not msgs:
        return 0
    try:
        return max(int(m.get("id", 0) or 0) for m in msgs)
    except Exception:
        return 0


def extract_otp_code(text):
    """
    Ambil kode OTP dari subject/body email Canva.
    Prioritas: Pola teks eksplisit Canva ('kode verifikasi Anda', 'enter code'), lalu 6 digit.
    """
    if not text:
        return None
    canva_patterns = [
        r"(?:kode|code|verification|verifikasi|otp)[^\d]{1,30}(\b\d{6}\b)",
        r"(\b\d{6}\b)[^\d]{1,30}(?:adalah kode|is your)",
        r"masukkan kode (\b\d{6}\b)",
        r"enter the code (\b\d{6}\b)",
    ]
    for cp in canva_patterns:
        m = re.search(cp, text, re.IGNORECASE)
        if m:
            return m.group(1)

    matches = re.findall(r"(?<!\d)(\d{6})(?!\d)", text)
    if matches:
        return matches[-1]

    multi = re.findall(r"(?<!\d)(\d{6,8})(?!\d)", text)
    if multi:
        return multi[-1]
    return None


def wait_for_otp(
    account_or_email,
    timeout_sec=120,
    interval_sec=1.5,
    after_id=None,
    exclude_otp=None,
    require_newer=True,
    purpose="signup",
):
    """
    Tunggu OTP TERBARU dari inbox via outlookreader.my.id (dan fallback Graph API):
    - Mengandalkan `existing_otps` (daftar OTP yang sudah ada SEBELUM tombol diklik) + `exclude_otp`
      agar OTP baru langsung terdeteksi dalam ~1.5 detik tanpa salah dianggap kode lama!
    """
    exclude_set = set()
    if isinstance(exclude_otp, (set, list, tuple)):
        exclude_set = {str(x).strip() for x in exclude_otp if x}
    elif exclude_otp is not None and str(exclude_otp).strip():
        exclude_set = {str(exclude_otp).strip()}

    if isinstance(account_or_email, dict) and (account_or_email.get("refresh_token") or OUTLOOK_READER_API_KEY):
        email = account_or_email["email"]
        refresh_token = account_or_email.get("refresh_token", "")
        client_id = account_or_email.get("client_id", DEFAULT_GRAPH_CLIENT_ID)

        if isinstance(after_id, dict):
            baseline_set = set(after_id.get("ids") or set())
            baseline_time = (after_id.get("time") or "").strip()
            baseline_otps = {str(x).strip() for x in (after_id.get("existing_otps") or set()) if x}
            exclude_set.update(baseline_otps)
        elif isinstance(after_id, set):
            baseline_set = set(after_id)
            baseline_time = ""
        else:
            baseline_set = set()
            baseline_time = ""

        ex_info = ", ".join(sorted(exclude_set)) if exclude_set else "None"

        # ═══ PRIORITAS UTAMA: outlookreader.my.id (/api/v1/otp & /api/read-inbox) ═══
        dev_log(
            Fore.CYAN +
            f"[OUTLOOK API] Polling OTP cepat via outlookreader.my.id untuk {email} | "
            f"purpose={purpose} | exclude={ex_info} | baseline_time={baseline_time or 'None'}"
        )
        print(Fore.CYAN + f"  [OUTLOOK API] Menunggu OTP Canva ({purpose})...")
        if exclude_set:
            print(Fore.CYAN + f"       Abaikan OTP sebelumnya: [{ex_info}]")

        deadline = time.time() + timeout_sec
        _seen_otp_api = set(exclude_set)
        poll_interval = 1.5

        while time.time() < deadline:
            try:
                candidates = _fetch_outlookreader_messages(account_or_email)
                for item in candidates:
                    otp_code = item.get("code")
                    if not otp_code:
                        continue
                    otp_str = str(otp_code).strip()
                    recv_at = (item.get("receivedAt") or "").strip()
                    subject = item.get("subject") or ""
                    sender_email = (item.get("from") or "").lower()
                    subject_lower = subject.lower()

                    # 1. Jika kode OTP sudah ada di inbox sebelum klik submit atau pernah ditolak, skip!
                    if otp_str in _seen_otp_api:
                        dev_log(f"[OUTLOOK API] OTP {otp_str} adalah kode lama (ada di daftar exclude), skip.")
                        continue

                    # 2. Harus dari/tentang Canva
                    if subject and sender_email and ("canva" not in subject_lower and "canva" not in sender_email):
                        dev_log(f"[OUTLOOK API] OTP {otp_str} bukan dari Canva, skip.")
                        continue

                    # 3. Filter khusus password_reset: jangan ambil email konfirmasi pendaftaran awal
                    if purpose == "password_reset":
                        if any(k in subject_lower for k in (
                            "selesaikan pendaftaran", "complete your sign",
                            "finish signing up", "verify your email"
                        )):
                            dev_log(f"[OUTLOOK API] Skip email signup ({otp_str}) karena sedang mode reset password.")
                            continue

                    # Kode OTP baru & valid ditemukan!
                    dev_log(Fore.GREEN + f"[OUTLOOK API] OTP CANVA BARU DITEMUKAN: {otp_str} | subj='{subject}' | recv={recv_at}")
                    print(Fore.GREEN + Style.BRIGHT + f"  [OUTLOOK API] ✓ OTP Ditemukan: {otp_str}  ({subject[:50]})")
                    return {"otp": otp_str, "msg_id": recv_at or otp_str}

            except Exception as api_err:
                dev_log(f"[OUTLOOK API] Polling info: {api_err}")

            # Cek juga via Graph API langsung secara paralel tiap iterasi jika ada refresh_token
            if refresh_token:
                try:
                    client = get_outlook_client(email, refresh_token, client_id)
                    msgs = client.get_recent_messages(top=8)
                    for msg in msgs:
                        m_id = msg.get("id")
                        if m_id in baseline_set:
                            continue
                        full_text = f"{msg.get('subject', '')} {msg.get('bodyPreview', '')} {msg.get('bodyContent', '')}"
                        full_lower = full_text.lower()
                        sender = (msg.get("sender") or "").lower()
                        if "canva" not in full_lower and "canva" not in sender:
                            continue
                        if purpose == "password_reset" and any(k in full_lower for k in (
                            "selesaikan pendaftaran", "complete your sign", "finish signing up", "verify your email"
                        )):
                            continue
                        code = extract_otp_code(full_text)
                        if not code:
                            continue
                        otp_str = str(code).strip()
                        if otp_str in _seen_otp_api:
                            continue
                        recv_dt = (msg.get("receivedDateTime") or "").strip()
                        dev_log(Fore.GREEN + f"[GRAPH API] OTP CANVA BARU DITEMUKAN: {otp_str} | recv={recv_dt}")
                        print(Fore.GREEN + Style.BRIGHT + f"  [GRAPH API] ✓ OTP Ditemukan: {otp_str}")
                        return {"otp": otp_str, "msg_id": m_id or otp_str}
                except Exception:
                    pass

            time.sleep(poll_interval)

        dev_log(Fore.RED + f"[OUTLOOK API] Timeout {timeout_sec}s — OTP tidak ditemukan.")
        return None

    # Fallback ke Tempmail API
    email = account_or_email.get("email", "") if isinstance(account_or_email, dict) else str(account_or_email)
    baseline = int(after_id) if (after_id is not None and not isinstance(after_id, (set, dict))) else -1
    ex_info = ", ".join(exclude_set) if exclude_set else "None"

    dev_log(Fore.CYAN + f"[INFO] Menunggu OTP TERBARU (Tempmail API) untuk {email}...")
    print(Fore.CYAN + f"       baseline_id={baseline} | Abaikan OTP lama: [{ex_info}]")
    deadline = time.time() + timeout_sec
    seen_ids = set()

    while time.time() < deadline:
        try:
            messages = fetch_inbox_messages(email)
            best = None
            for msg in messages:
                try:
                    msg_id = int(msg.get("id", 0) or 0)
                except Exception:
                    continue
                if require_newer and msg_id <= baseline:
                    continue
                body = f"{msg.get('subject', '')} {msg.get('body', '')}"
                otp = extract_otp_code(body)
                if not otp or str(otp).strip() in exclude_set:
                    continue
                if best is None or msg_id > best[0]:
                    best = (msg_id, otp)

            if best is not None:
                msg_id, otp = best
                dev_log(Fore.GREEN + Style.BRIGHT + f"[SUCCESS] OTP TERBARU DITEMUKAN (ID: {msg_id}): {otp}")
                return {"otp": otp, "msg_id": msg_id}
        except Exception as e:
            dev_log(f"[WARN] Gagal memproses inbox OTP: {e}")
        time.sleep(interval_sec)

    print(Fore.RED + "[ERROR] Timeout! Tidak ada OTP baru yang masuk dalam batas waktu.")
    return None


def _xpath_for_button_text(text, partial=False):
    """
    Selector tombol Canva (sering: <button type="submit"><span>Berikutnya</span></button>).
    """
    if partial:
        return (
            f"//button[.//span[contains(normalize-space(.), '{text}')]] | "
            f"//button[contains(normalize-space(.), '{text}')] | "
            f"//button[@type='submit' and .//span[contains(normalize-space(.), '{text}')]] | "
            f"//*[@role='button' and contains(normalize-space(.), '{text}')] | "
            f"//a[contains(normalize-space(.), '{text}')] | "
            f"//span[contains(normalize-space(.), '{text}')]/ancestor::button[1] | "
            f"//label[contains(normalize-space(.), '{text}')] | "
            f"//div[contains(normalize-space(.), '{text}') and (@role='radio' or @role='option' or @role='button')]"
        )
    return (
        f"//button[.//span[normalize-space()='{text}']] | "
        f"//button[normalize-space()='{text}'] | "
        f"//button[@type='submit' and .//span[normalize-space()='{text}']] | "
        f"//*[@role='button' and normalize-space()='{text}'] | "
        f"//a[normalize-space()='{text}'] | "
        f"//span[normalize-space()='{text}']/ancestor::button[1] | "
        f"//label[normalize-space()='{text}']"
    )


def click_button_by_text(driver, text, timeout=15):
    wait = WebDriverWait(driver, timeout)
    xpath = _xpath_for_button_text(text, partial=False)
    try:
        button = wait.until(EC.element_to_be_clickable((By.XPATH, xpath)))
        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", button)
        time.sleep(0.3)
        driver.execute_script("arguments[0].click();", button)
        dev_log(f"[ACTION] Mengklik tombol: '{text}'")
        return True
    except TimeoutException:
        print(f"[ERROR] Tidak dapat menemukan tombol: '{text}'")
        raise


def try_click_texts(driver, texts, timeout=8, partial=False):
    """Coba klik salah satu teks (button / role=button / span / a)."""
    # Quick combined check first using JavaScript for instantaneous matching
    try:
        clicked = driver.execute_script("""
            const texts = arguments[0].map(t => t.trim().toLowerCase());
            const partial = arguments[1];
            const all = Array.from(document.querySelectorAll('button, [role="button"], a, input[type="submit"], [role="radio"], [role="option"], label, span'));
            for (const t of texts) {
                for (const el of all) {
                    if (el.disabled || (el.offsetWidth === 0 && el.offsetHeight === 0)) continue;
                    const content = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
                    const matched = partial ? content.includes(t) : content === t;
                    if (matched) {
                        const target = el.closest('button, [role="button"], a, label') || el;
                        target.scrollIntoView({block: 'center'});
                        target.click();
                        return t;
                    }
                }
            }
            return null;
        """, texts, partial)
        if clicked:
            dev_log(f"[ACTION] Mengklik (cepat JS): '{clicked}'")
            return clicked
    except Exception:
        pass

    item_timeout = min(timeout, 2.0)
    for text in texts:
        xpath = _xpath_for_button_text(text, partial=partial)
        try:
            wait = WebDriverWait(driver, item_timeout)
            el = wait.until(EC.element_to_be_clickable((By.XPATH, xpath)))
            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
            time.sleep(0.4)
            driver.execute_script("arguments[0].click();", el)
            dev_log(f"[ACTION] Mengklik: '{text}'")
            return text
        except TimeoutException:
            continue
        except Exception as e:
            dev_log(f"[WARN] Gagal klik '{text}': {e}")
            continue
    return None





def type_into_element(driver, placeholder, text, timeout=15):
    wait = WebDriverWait(driver, timeout)
    xpath = f"//input[@placeholder='{placeholder}']"
    try:
        element = wait.until(EC.visibility_of_element_located((By.XPATH, xpath)))
        element.clear()
        slow_type(element, text)
        dev_log(f"[ACTION] Mengisi '{placeholder}'")
    except TimeoutException:
        print(f"[ERROR] Tidak dapat menemukan input '{placeholder}'")
        raise


def type_otp(driver, otp, timeout=15):
    """
    Isi field OTP Canva dengan dukungan:
    1. 6 field terpisah (maxlength="1") — multi-digit mode.
    2. 1 field gabungan (inputmode="numeric", autocomplete="one-time-code").
    Memastikan event input & change ter-trigger agar React state Canva terisi.
    """
    otp_str = re.sub(r"\D", "", str(otp))[:6]
    wait = WebDriverWait(driver, timeout)

    # 1. Cek apakah Canva menampilkan 6 kotak terpisah
    try:
        multi_inputs = driver.execute_script("""
            const inps = Array.from(document.querySelectorAll(
                "input[maxlength='1'], input[maxLength='1'], input[autocomplete='one-time-code'], input[inputmode='numeric']"
            )).filter(el => {
                const s = window.getComputedStyle(el);
                return el.offsetWidth > 0 && el.offsetHeight > 0 && s.display !== 'none' && s.visibility !== 'hidden';
            });
            return inps.length >= 6;
        """)

        if multi_inputs:
            set_multi = driver.execute_script("""
                const code = arguments[0];
                const inps = Array.from(document.querySelectorAll(
                    "input[maxlength='1'], input[maxLength='1'], input[autocomplete='one-time-code'], input[inputmode='numeric']"
                )).filter(el => {
                    const s = window.getComputedStyle(el);
                    return el.offsetWidth > 0 && el.offsetHeight > 0 && s.display !== 'none' && s.visibility !== 'hidden';
                }).slice(0, code.length);

                if (inps.length !== code.length) return false;

                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                for (let i = 0; i < code.length; i++) {
                    const el = inps[i];
                    el.focus();
                    if (setter) setter.call(el, code[i]); else el.value = code[i];
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
                return true;
            """, otp_str)
            if set_multi:
                return True
    except Exception:
        pass

    # 2. Fallback: Single input field
    xpath = (
        "//input[@inputmode='numeric'] | "
        "//input[contains(@placeholder, 'kode') or contains(@placeholder, 'Code') or "
        "contains(@placeholder, 'code') or contains(@placeholder, 'Kode') or contains(@autocomplete, 'one-time')] | "
        "//div[contains(@role, 'dialog')]//input[not(@type='password') and not(@type='hidden') and not(@type='checkbox')] | "
        "//input[@type='tel' and (@maxlength='6' or @maxlength='8')] | "
        "//input[@type='text' and (@maxlength='6' or @maxlength='8')]"
    )
    try:
        element = wait.until(EC.visibility_of_element_located((By.XPATH, xpath)))
        try:
            element.clear()
        except Exception:
            pass
        try:
            driver.execute_script("""
                const el = arguments[0];
                const val = arguments[1];
                el.focus();
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                if (setter) setter.call(el, val); else el.value = val;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
            """, element, otp_str)
        except Exception:
            slow_type(element, otp_str, min_delay=0.03, max_delay=0.08)
        return True
    except TimeoutException:
        raise


def dismiss_cookies(driver):
    try:
        try_click_texts(driver, ["Terima semua kuki", "Accept all cookies", "Accept all", "Setuju"], timeout=4)
    except Exception:
        pass


def append_line(filepath, line):
    with open(filepath, "a", encoding="utf-8") as f:
        f.write(line if line.endswith("\n") else line + "\n")


def save_account_free(email, password):
    """Mode 1: akun gratis + password."""
    line = f"{email}|{password}\n"
    append_line(AKUN_FILE, line)
    print(f"[✓] Disimpan ke {AKUN_FILE}: {email}|{password}")


def save_account_signup_only(email):
    """Setelah signup sukses (belum set password) — untuk lanjut manual."""
    line = f"{email}|signup_ok\n"
    append_line(AKUN_FILE, line)
    print(Fore.GREEN + f"[✓] Disimpan ke {AKUN_FILE}: {email}|signup_ok")


def save_account_paid(email):
    """Mode 2 tahap 1: berhasil bayar (belum tentu password)."""
    line = f"{email}|business_paid\n"
    append_line(AKUN_BAYAR_FILE, line)
    print(Fore.GREEN + f"[✓] Disimpan ke {AKUN_BAYAR_FILE}: {email}|business_paid")


def save_account_paid_with_password(email, password):
    """Mode 2 tahap 2: sudah bayar + password sudah di-set."""
    line = f"{email}|{password}|business_password_set\n"
    append_line(AKUN_BAYAR_PASSWORD_FILE, line)
    print(Fore.GREEN + f"[✓] Disimpan ke {AKUN_BAYAR_PASSWORD_FILE}: {email}|{password}|business_password_set")


def save_account_reset_success(email, password):
    """Mode 3: reset password sukses → sukses_reset.txt"""
    line = f"{email}|{password}\n"
    append_line(SUKSES_RESET_FILE, line)
    print(Fore.GREEN + f"[✓] Disimpan ke {SUKSES_RESET_FILE}: {email}|{password}")


def load_emails_from_file(filepath=EMAILS_FILE):
    """
    Baca daftar email dari file (satu email per baris).
    Abaikan baris kosong dan komentar (# ...).
    Format baris: email  atau  email|password (hanya ambil bagian email).
    """
    if not os.path.isfile(filepath):
        return None
    emails = []
    seen = set()
    with open(filepath, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            # dukung email|apa_saja
            em = line.split("|")[0].strip()
            if "@" not in em:
                continue
            key = em.lower()
            if key in seen:
                continue
            seen.add(key)
            emails.append(em)
    return emails


def ensure_emails_file_exists(filepath=EMAILS_FILE):
    """Buat emails.txt contoh jika belum ada."""
    if os.path.isfile(filepath):
        return
    with open(filepath, "w", encoding="utf-8") as f:
        f.write("# Isi satu email Canva per baris, contoh:\n")
        f.write("# user1@domain.com\n")
        f.write("# user2@domain.com\n")
    dev_log(Fore.YELLOW + f"[INFO] File {filepath} dibuat (kosong). Isi dulu email-nya.")


def load_accounts_from_file(filepath=AKUN_LOGIN_FILE):
    """
    Baca akun login Mode 4.
    Format baris: email|password
    """
    if not os.path.isfile(filepath):
        return None
    accounts = []
    seen = set()
    # utf-8-sig buang BOM Windows
    with open(filepath, "r", encoding="utf-8-sig") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) < 2 or "@" not in parts[0] or not parts[1]:
                dev_log(Fore.YELLOW + f"[WARN] Baris akun diabaikan (butuh email|password): {line[:60]}")
                continue
            em, pwd = parts[0], parts[1]
            key = em.lower()
            if key in seen:
                continue
            seen.add(key)
            accounts.append({"email": em, "password": pwd})
    return accounts


def ensure_akun_login_file_exists(filepath=AKUN_LOGIN_FILE):
    if os.path.isfile(filepath):
        return
    with open(filepath, "w", encoding="utf-8") as f:
        f.write("# Mode 4: email|password (satu akun per baris)\n")
        f.write("# user@domain.com|password123\n")
    dev_log(Fore.YELLOW + f"[INFO] File {filepath} dibuat (kosong). Isi dulu akun login.")


def get_next_card():
    """
    Baca kartu VCC pertama dari cc.txt atau vcc.txt.
    Pindahkan kartu terpakai ke cc_used.txt agar tidak terpakai ulang.
    Fallback ke .env VCC_* jika file kosong.
    """
    card_files = ["cc.txt", "vcc.txt"]
    for file_path in card_files:
        if os.path.isfile(file_path):
            with open(file_path, "r", encoding="utf-8-sig") as f:
                lines = f.readlines()
            
            selected_card = None
            selected_line_idx = -1
            
            for idx, raw in enumerate(lines):
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                parts = [p.strip() for p in line.split("|")]
                if len(parts) >= 4:
                    number = parts[0].replace(" ", "").replace("-", "")
                    mm = parts[1].zfill(2) if parts[1].isdigit() else parts[1]
                    yy = parts[2]
                    if len(yy) == 4 and yy.isdigit():
                        yy = yy[-2:]
                    cvc = parts[3]
                    holder = parts[4] if len(parts) > 4 and parts[4] else (VCC_HOLDER or BILLING_NAME)
                    if number and mm and yy and cvc:
                        selected_card = {
                            "number": number,
                            "exp_month": mm,
                            "exp_year": yy,
                            "cvc": cvc,
                            "holder": holder,
                            "raw_line": line
                        }
                        selected_line_idx = idx
                        break
            
            if selected_card:
                lines.pop(selected_line_idx)
                with open(file_path, "w", encoding="utf-8") as f:
                    f.writelines(lines)
                
                append_line("cc_used.txt", selected_card["raw_line"] + "\n")
                dev_log(Fore.GREEN + f"[INFO] Memakai VCC ...{selected_card['number'][-4:]} dari {file_path} (dipindahkan ke cc_used.txt)")
                return selected_card

    if VCC_NUMBER and VCC_EXP_MONTH and VCC_EXP_YEAR and VCC_CVC:
        yy = VCC_EXP_YEAR[-2:] if len(VCC_EXP_YEAR) == 4 else VCC_EXP_YEAR
        dev_log(Fore.GREEN + "[INFO] Memakai VCC dari .env")
        return {
            "number": VCC_NUMBER,
            "exp_month": VCC_EXP_MONTH.zfill(2) if VCC_EXP_MONTH.isdigit() else VCC_EXP_MONTH,
            "exp_year": yy,
            "cvc": VCC_CVC,
            "holder": VCC_HOLDER or BILLING_NAME,
        }
    return None


def parse_email_line(raw):
    """
    Parse satu baris akun email.
    Mendukung format:
      1. email|password|refresh_token|client_id (Outlook Graph API)
      2. email|password
      3. email
    """
    if not raw:
        return None
    line = raw.strip()
    if not line or line.startswith("#") or "@" not in line:
        return None

    # Hapus penomoran depan seperti '1. ', '1) ' jika ada
    line = re.sub(r'^\d+[\.\)\s]+\s*', '', line)

    parts = [p.strip() for p in line.split("|")] if "|" in line else [line]
    email = parts[0].strip()
    if "@" not in email:
        return None

    email_password = parts[1].strip() if len(parts) >= 2 else ""
    refresh_token = parts[2].strip() if len(parts) >= 3 else ""
    client_id = parts[3].strip() if len(parts) >= 4 else DEFAULT_GRAPH_CLIENT_ID

    return {
        "email": email,
        "email_password": email_password,
        "refresh_token": refresh_token,
        "client_id": client_id,
        "from_file": True,
        "raw_line": raw.strip(),
    }


def get_already_completed_emails():
    """
    Kumpulkan semua email yang SUDAH PERNAH sukses diproses sebelumnya,
    baik dari akun_berhasil_bayar.txt, result.txt, akun_canva.txt, maupun akun_auto_pay.txt.
    """
    completed = set()
    files_to_check = [
        AKUN_BAYAR_FILE,           # akun_berhasil_bayar.txt
        "result.txt",              # result.txt
        AKUN_FILE,                 # akun_canva.txt
        AKUN_AUTO_PAY_FILE,        # akun_auto_pay.txt
        SUKSES_RESET_FILE,         # sukses_reset.txt
    ]
    for filename in files_to_check:
        if os.path.isfile(filename):
            try:
                with open(filename, "r", encoding="utf-8-sig") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        parts = line.split("|")
                        em = parts[0].strip().lower()
                        if "@" in em:
                            if len(parts) >= 4:
                                status = parts[3].strip().upper()
                                if status == "SUCCESS":
                                    completed.add(em)
                            else:
                                completed.add(em)
            except Exception:
                pass
    return completed


def get_next_email():
    """
    Baca email dari emails.txt jika ada.
    Hapus email yang terpakai dari emails.txt.
    Filter otomatis: Jika akun sudah pernah sukses diproses sebelumnya,
    lewati akun tersebut (jangan di-run ulang) dan ambil akun berikutnya yang fresh!
    Jika emails.txt kosong / tidak ada, panggil generate_email().
    """
    completed_emails = get_already_completed_emails()
    email_file = "emails.txt"
    if os.path.isfile(email_file):
        with open(email_file, "r", encoding="utf-8-sig") as f:
            lines = f.readlines()

        selected_account = None
        selected_idx = -1
        indices_to_remove = []

        for idx, raw in enumerate(lines):
            parsed = parse_email_line(raw)
            if parsed:
                em_lower = parsed["email"].lower()
                # FILTER: Cek apakah akun sudah pernah selesai sebelumnya
                if em_lower in completed_emails:
                    print(Fore.YELLOW + f"[FILTER] Email {parsed['email']} SUDAH PERNAH sukses diproses sebelumnya. Melewati...")
                    indices_to_remove.append(idx)
                    continue

                selected_account = parsed
                selected_idx = idx
                indices_to_remove.append(idx)
                break

        # Bersihkan akun yang di-skip maupun yang terpilih dari emails.txt
        if indices_to_remove:
            new_lines = [line for i, line in enumerate(lines) if i not in indices_to_remove]
            with open(email_file, "w", encoding="utf-8") as f:
                f.writelines(new_lines)

        if selected_account:
            dev_log(Fore.GREEN + f"[INFO] Memakai akun FRESH dari {email_file}: {selected_account['email']}")
            if selected_account.get("refresh_token"):
                print(Fore.GREEN + Style.BRIGHT + "       [✓] Mode Microsoft Graph API aktif (refresh_token terdeteksi)")
            return selected_account

    dev_log(Fore.CYAN + "[INFO] emails.txt kosong / tidak ada akun fresh — Generate temp mail otomatis via API (.env)...")
    em_data = generate_email()
    if em_data:
        em_data["from_file"] = False
        return em_data
    return None




def load_vcc_list(filepath=None):
    """
    Load daftar VCC / CC.
    Prioritas: cc.txt → vcc.txt → fallback .env VCC_*
    Format baris: number|mm|yy|cvc|holder
    """
    if not filepath:
        if os.path.isfile("cc.txt"):
            filepath = "cc.txt"
        elif os.path.isfile("vcc.txt"):
            filepath = "vcc.txt"
        else:
            filepath = VCC_FILE

    cards = []
    if os.path.isfile(filepath):
        with open(filepath, "r", encoding="utf-8-sig") as f:

            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                parts = [p.strip() for p in line.split("|")]
                if len(parts) < 4:
                    dev_log(Fore.YELLOW + f"[WARN] Baris VCC diabaikan: {line[:40]}")
                    continue
                number = parts[0].replace(" ", "").replace("-", "")
                mm = parts[1].zfill(2) if parts[1].isdigit() else parts[1]
                yy = parts[2]
                # Normalisasi tahun: 2031 → 31 (banyak form minta MM/YY)
                if len(yy) == 4 and yy.isdigit():
                    yy = yy[-2:]
                cvc = parts[3]
                holder = parts[4] if len(parts) > 4 and parts[4] else (VCC_HOLDER or BILLING_NAME)
                if not number or not mm or not yy or not cvc:
                    continue
                cards.append({
                    "number": number,
                    "exp_month": mm,
                    "exp_year": yy,
                    "cvc": cvc,
                    "holder": holder,
                })
    if cards:
        dev_log(Fore.GREEN + f"[INFO] {len(cards)} VCC dimuat dari {filepath}")
        return cards

    if VCC_NUMBER and VCC_EXP_MONTH and VCC_EXP_YEAR and VCC_CVC:
        holder = VCC_HOLDER or BILLING_NAME
        dev_log(Fore.GREEN + "[INFO] Memakai VCC dari .env")
        return [{
            "number": VCC_NUMBER,
            "exp_month": VCC_EXP_MONTH.zfill(2) if VCC_EXP_MONTH.isdigit() else VCC_EXP_MONTH,
            "exp_year": VCC_EXP_YEAR,
            "cvc": VCC_CVC,
            "holder": holder,
        }]
    return []


def get_vcc_for_index(cards, index):
    """Rotasi VCC jika jumlah kartu < jumlah akun."""
    if not cards:
        return None
    return cards[index % len(cards)]


def save_account_auto_pay(email, status="auto_paid"):
    """Mode 4: simpan hasil auto pay."""
    line = f"{email}|{status}\n"
    append_line(AKUN_AUTO_PAY_FILE, line)
    append_line(AKUN_BAYAR_FILE, f"{email}|business_paid\n")
    print(Fore.GREEN + f"[✓] Disimpan ke {AKUN_AUTO_PAY_FILE} & {AKUN_BAYAR_FILE}: {email}")


def wait_manual_upgrade_and_payment(email, window_index=0):
    """
    Browser tetap terbuka (sudah login).
    User sendiri klik trial Canva Bisnis + bayar.

    - Parallel mode 2 (batch): tunggu semua browser siap, 1x y → set password semua.
    - Sequential (1 browser): konfirmasi y/n per akun seperti biasa.
    """
    # Mode 2 multi-browser: 1 konfirmasi untuk seluruh batch
    if _batch_pay_coord is not None:
        return batch_pay_register_ready(_batch_pay_coord, email, window_index)

    x_pos = window_index * (BROWSER_WIDTH + BROWSER_GAP)
    print(Fore.YELLOW + Style.BRIGHT + "\n" + "=" * 60)
    print(Fore.YELLOW + Style.BRIGHT + "  MODE MANUAL — UPGRADE + BAYAR DI BROWSER")
    print(Fore.YELLOW + Style.BRIGHT + "=" * 60)
    print(
        Fore.WHITE
        + f"  Browser #{window_index + 1} (kiri→kanan, x={x_pos})"
    )
    print(Fore.WHITE + f"  Akun    : {email}")
    print(Fore.WHITE + "  Browser sudah LOGIN (tanpa refresh). Silakan di browser:")
    print(Fore.WHITE + "    1. Klik trial / upgrade Canva Bisnis")
    print(Fore.WHITE + "    2. Pilih plan & metode bayar (DANA / QRIS / dll)")
    print(Fore.WHITE + "    3. Selesaikan pembayaran di HP")
    print(Fore.WHITE + "    4. Tunggu Canva konfirmasi sukses")
    print(Fore.CYAN + "  Lalu kembali ke terminal ini:")
    print(Fore.GREEN + "     y  = bayar BERHASIL → bot lanjut set password otomatis")
    print(Fore.RED + "     n  = gagal / lewati → TIDAK set password")
    print(Fore.YELLOW + Style.BRIGHT + "=" * 60 + "\n")

    try:
        jawab = safe_input(
            Fore.CYAN
            + f"  [Browser #{window_index + 1} | {email}] Status bayar [y/n]: "
            + Style.RESET_ALL
        ).strip().lower()
    except EOFError:
        jawab = ""

    if jawab in ("y", "ya", "yes", "1"):
        print(
            Fore.GREEN
            + f"[SUCCESS] Browser #{window_index + 1} — pembayaran BERHASIL ({email})."
        )
        print(Fore.CYAN + "  → Lanjut set password otomatis...")
        return True

    print(
        Fore.YELLOW
        + f"[INFO] Browser #{window_index + 1} — bayar tidak dikonfirmasi ({email}). Lewati reset password."
    )
    return False


# ==============================================================================
# FUNGSI ALUR
# ==============================================================================

# ==============================================================================
# ERROR HANDLING NOTIFIKASI MERAH (RMS) & OTP (REFERENSI CANVA-PAYY & EDU BOT)
# ==============================================================================

def has_canva_rms_security_error(driver):
    """Deteksi banner error keamanan merah RMS/RRS Canva ('Karena alasan keamanan, kode verifikasi tidak dapat dikirim...')."""
    try:
        res = driver.execute_script(r"""
            const text = (document.body.innerText || '').toLowerCase();
            if (text.includes('karena alasan keamanan') || 
                text.includes('kode verifikasi tidak dapat dikirim') ||
                text.includes('kode verifikasi tidak bisa dikirim') ||
                text.includes('for security reasons') ||
                text.includes('verification code could not be sent') ||
                text.includes('verification code couldn\'t be sent') ||
                /rms-[a-z0-9]+/i.test(text) ||
                /rrs-[a-z0-9]+/i.test(text)) {
                return true;
            }
            const redEls = Array.from(document.querySelectorAll('div, p, span')).filter(e => {
                if (!e.getClientRects().length) return false;
                const t = (e.innerText || '').toLowerCase();
                if (t.length < 15 || t.length > 700) return false;
                if (!t.includes('keamanan') && !t.includes('security') && !t.includes('verifikasi') && !t.includes('rms-')) return false;
                const c = window.getComputedStyle(e).backgroundColor.match(/[\d.]+/g);
                return c && (c.length < 4 || +c[3] > .1) && +c[0] > 150 && +c[0] > +c[1] + 12;
            });
            return redEls.length > 0;
        """)
        return bool(res)
    except Exception:
        return False


def click_canva_modal_back(driver):
    """Klik tombol '<' (Kembali / Back) di modal Canva untuk mereset RMS error."""
    try:
        res = driver.execute_script(r"""
            function dispatchClick(el) {
                if (!el) return false;
                try {
                    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                    el.focus();
                } catch (e) {}
                ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
                    try {
                        el.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
                    } catch (e) {}
                });
                try {
                    if (typeof el.click === 'function') el.click();
                } catch (e) {}
                return true;
            }

            const allElements = Array.from(document.querySelectorAll("button, [role='button'], a, svg, div[tabindex='0'], span[tabindex='0']"));
            for (const el of allElements) {
                if (!el.getClientRects().length) continue;
                const aria = (el.getAttribute('aria-label') || '').toLowerCase().trim();
                const title = (el.getAttribute('title') || '').toLowerCase().trim();
                const tid = (el.getAttribute('data-testid') || '').toLowerCase().trim();
                const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
                
                if (aria === 'kembali' || aria === 'back' || aria.startsWith('kembali') || aria.startsWith('back') ||
                    title === 'kembali' || title === 'back' || tid.includes('back') || tid.includes('kembali')) {
                    const target = el.closest('button, [role="button"], a') || el;
                    dispatchClick(target);
                    return true;
                }
                
                if (['<', '‹', '←', '«'].includes(txt) && txt.length <= 2) {
                    const target = el.closest('button, [role="button"], a') || el;
                    dispatchClick(target);
                    return true;
                }
            }
            return false;
        """)
        return bool(res)
    except Exception:
        return False


def handle_canva_security_back_retry(driver, purpose='signup', max_retries=3):
    """Auto-bypass pesan keamanan merah RMS Canva dengan auto back '<' dan submit ulang."""
    for attempt in range(1, max_retries + 1):
        if not has_canva_rms_security_error(driver):
            return True

        print(Fore.YELLOW + Style.BRIGHT + f"[AUTO-FIX] Pesan keamanan merah (RMS) Canva terdeteksi (Percobaan {attempt}/{max_retries})!")
        dev_log(Fore.CYAN + "[ACTION] Mengklik tombol '<' (kembali) pada modal Canva...")
        click_canva_modal_back(driver)
        time.sleep(1.5)

        # Submit ulang form yang sesuai
        if purpose == 'signup':
            dev_log(Fore.CYAN + "[ACTION] Submit ulang form signup...")
            try_click_texts(driver, ["Lanjutkan", "Berikutnya", "Continue", "Next", "Buat akun Anda", "Buat akun"], timeout=5)
        elif purpose == 'password_reset':
            dev_log(Fore.CYAN + "[ACTION] Submit ulang form reset password...")
            try_click_texts(driver, ["Buat kata sandi", "Create password", "Atur kata sandi", "Set password", "Simpan"], timeout=5)

        time.sleep(2.0)
        if not has_canva_rms_security_error(driver):
            print(Fore.GREEN + Style.BRIGHT + "[✓] Pesan keamanan merah (RMS) berhasil diatasi!")
            return True

    return not has_canva_rms_security_error(driver)


def detect_otp_failure(driver):
    """Deteksi jika kode OTP yang dimasukkan ditolak atau kedaluwarsa (CANVA EDU BOT pattern)."""
    try:
        text = (driver.page_source or "").lower()
        fail_markers = [
            "kode yang anda masukkan salah",
            "kode yang dimasukkan salah",
            "kode salah",
            "kode tidak valid",
            "invalid code",
            "incorrect code",
            "kode sudah kedaluwarsa",
            "kode kadaluarsa",
            "code expired",
            "too many attempts",
            "terlalu banyak percobaan",
            "coba lagi",
            "try again",
            "kode verifikasi salah",
        ]
        if any(err in text for err in fail_markers):
            return True

        # Cek atribut error pada input OTP di DOM
        has_invalid = driver.execute_script("""
            const alerts = Array.from(document.querySelectorAll("[role='alert'], [aria-live='assertive'], [aria-invalid='true']"));
            if (alerts.some(a => (a.innerText || '').toLowerCase().includes('kode') || (a.innerText || '').toLowerCase().includes('code'))) {
                return true;
            }
            const inputs = Array.from(document.querySelectorAll("input[autocomplete='one-time-code'], input[type='text'][maxlength='1']"));
            return inputs.some(i => i.getAttribute('aria-invalid') === 'true');
        """)
        if has_invalid:
            return True
    except Exception:
        pass
    return False


def request_fresh_otp(driver):
    """Klik tombol kirim ulang kode OTP di halaman Canva dengan penanganan cooldown."""
    dev_log(Fore.YELLOW + "[OTP] Meminta kirim ulang kode OTP dari Canva...")
    
    # Cek apakah sedang cooldown countdown (mis. 'Kirim ulang dalam 15d')
    try:
        for _ in range(8):
            canva_text = (driver.page_source or "").lower()
            if "kirim ulang dalam" in canva_text or "resend in" in canva_text:
                dev_log(Fore.YELLOW + "  [OTP] Tombol kirim ulang masih dalam masa cooldown, menunggu 2 detik...")
                time.sleep(2.0)
            else:
                break
    except Exception:
        pass

    resend_labels = [
        "Kirim ulang kode",
        "Kirim ulang",
        "Kirim kode lagi",
        "Kode baru",
        "Resend code",
        "Resend",
        "Get a new code",
    ]
    clicked = try_click_texts(driver, resend_labels, timeout=4)
    if not clicked:
        # Coba klik via JS
        try:
            clicked_js = driver.execute_script("""
                const btns = Array.from(document.querySelectorAll("button, a, [role='button']"));
                const b = btns.find(el => {
                    const t = (el.innerText || el.textContent || '').trim().toLowerCase();
                    return t === 'kirim ulang kode' || t === 'kirim ulang' || t === 'resend code' || t === 'resend';
                });
                if (b && !b.disabled) {
                    b.scrollIntoView({block: 'center'});
                    b.click();
                    return true;
                }
                return false;
            """)
            if clicked_js:
                dev_log(Fore.GREEN + "[OTP] Berhasil klik 'Kirim ulang kode' via direct JS!")
                return True
        except Exception:
            pass
    return clicked


def handle_post_reset_login(driver, wait, email, password):
    """
    Handling setelah reset password berhasil (Permintaan spesifik user):
    Mengeklik tombol 'Login sekarang', 'Login ke akun Anda', 'Masuk ke akun Anda', 
    'Masuk', 'Lanjutkan', 'Selesai', dan submit enter agar langsung masuk ke beranda Canva.
    """
    for attempt in range(6):
        try:
            clicked = driver.execute_script("""
                const targets = [
                    'masuk ke akun anda', 'login ke akun anda', 'login sekarang', 
                    'masuk sekarang', 'log in to your account', 'log in now',
                    'lanjutkan', 'continue', 'selesai', 'done', 'masuk', 'log in'
                ];
                const btns = Array.from(document.querySelectorAll("button, a, [role='button'], input[type='submit']"));
                for (const b of btns) {
                    if (b.disabled || b.offsetParent === null) continue;
                    const t = (b.innerText || b.textContent || b.value || '').trim().toLowerCase();
                    for (const target of targets) {
                        if (t === target || (t.includes(target) && t.length < 35)) {
                            b.scrollIntoView({block: 'center'});
                            b.click();
                            return t;
                        }
                    }
                }
                return null;
            """)
            if clicked:
                time.sleep(2)
                break
        except Exception:
            pass
        time.sleep(1)

    # Jika diarahkan ke form input password, isi password baru dan tekan ENTER
    try:
        pwd_fields = driver.find_elements(By.CSS_SELECTOR, "input[type='password']")
        vis_pwd = [e for e in pwd_fields if e.is_displayed()]
        if vis_pwd:
            vis_pwd[0].clear()
            vis_pwd[0].send_keys(password)
            time.sleep(0.5)
            vis_pwd[0].send_keys(Keys.ENTER)
            time.sleep(2.5)
    except Exception:
        pass

    # Tutup popup / cookie
    dismiss_cookies(driver)
    dismiss_browser_popups(driver)

    # Pastikan browser mendarat di beranda Canva
    cur_url = (driver.current_url or "").lower()
    if "reset" in cur_url or "login" in cur_url:
        driver.get("https://www.canva.com/id_id/")
        time.sleep(3)
        dismiss_cookies(driver)
        dismiss_browser_popups(driver)

    return True



def _email_input_present(driver):
    """Cek apakah form email signup sudah tampil."""
    try:
        els = driver.find_elements(By.CSS_SELECTOR, "input[type='text'][inputmode='email']")
        return any(e.is_displayed() for e in els)
    except Exception:
        return False


def _wait_email_input(driver, timeout=8):
    """Tunggu form email muncul (lebih cepat dari sleep tetap)."""
    try:
        WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, "input[type='text'][inputmode='email']")
            )
        )
        return True
    except TimeoutException:
        return False


def open_signup_via_email(driver, wait):
    """Buka form pendaftaran akun lewat Email."""
    dismiss_cookies(driver)

    if _email_input_present(driver):
        dev_log(Fore.GREEN + "[INFO] Form email sudah tampil.")
        return

    email_labels = [
        "Email",
        "Continue with email",
        "Lanjutkan dengan email",
        "Daftar dengan email",
        "Sign up with email",
    ]

    if try_click_texts(driver, email_labels, timeout=3):
        if _wait_email_input(driver, timeout=6):
            return

    # Landing home/signup: klik Daftar / Sign up dulu
    if try_click_texts(
        driver,
        [
            "Daftar",
            "Sign up",
            "Sign up for free",
            "Get Canva free",
            "Mulai gratis",
            "Coba Canva Pro",
            "Get started",
            "Start designing",
        ],
        timeout=4,
    ):
        time.sleep(0.6)
        dismiss_cookies(driver)

    clicked = try_click_texts(driver, email_labels, timeout=6)
    if not clicked:
        try:
            click_button_by_text(driver, "Email", timeout=5)
        except Exception:
            pass

    if not _wait_email_input(driver, timeout=6):
        dev_log(Fore.YELLOW + f"[WARN] Form email belum muncul — fallback buka langsung {SIGNUP_URL}")
        driver.get(SIGNUP_URL)
        time.sleep(1.5)
        dismiss_cookies(driver)
        if not _wait_email_input(driver, timeout=4):
            click_button_by_text(driver, "Email", timeout=5)
            _wait_email_input(driver, timeout=6)


def _is_otp_screen_visible(driver) -> bool:
    """Deteksi cepat apakah halaman Canva saat ini sudah meminta input kode OTP."""
    try:
        return bool(driver.execute_script("""
            const inps = Array.from(document.querySelectorAll(
                "input[maxlength='1'], input[maxLength='1'], input[autocomplete='one-time-code'], input[inputmode='numeric']"
            )).filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
            if (inps.length >= 1) return true;
            const txt = (document.body.innerText || '').toLowerCase();
            return (txt.includes('masukkan kode') || txt.includes('enter the code') || txt.includes('enter code') || txt.includes('kode verifikasi')) &&
                   (txt.includes('kirim ulang') || txt.includes('resend') || txt.includes('6 digit') || inps.length > 0);
        """))
    except Exception:
        return False


def perform_signup(driver, wait, email_or_account):
    if isinstance(email_or_account, dict):
        email = email_or_account["email"]
        account_data = email_or_account
    else:
        email = str(email_or_account)
        account_data = {"email": email}

    nama = email.split("@")[0].capitalize()
    dev_log("Step checkpoint")

    # 1. Snapshot baseline inbox SEBELUM klik Lanjutkan di Canva (kunci utama agar OTP baru tidak dianggap OTP lama!)
    baseline_signup = get_max_message_id(account_data)
    seen_signup_otps = set(baseline_signup.get("existing_otps") or set()) if isinstance(baseline_signup, dict) else set()
    dev_log(Fore.CYAN + f"[INFO] Baseline inbox SEBELUM submit signup: existing_otps={seen_signup_otps} | time={baseline_signup.get('time') if isinstance(baseline_signup, dict) else baseline_signup}")

    # Buka langsung SIGNUP_URL Canva Indonesia
    start_url = SIGNUP_URL
    dev_log(Fore.CYAN + f"[SIGNUP] Membuka URL pendaftaran resmi: {start_url}")
    driver.get(start_url)
    time.sleep(2.0)
    dismiss_cookies(driver)

    # Langsung klik daftar lewat Email
    dev_log(Fore.CYAN + "[INFO] Klik daftar lewat Email...")
    open_signup_via_email(driver, wait)

    email_input = wait.until(
        EC.presence_of_element_located(
            (By.CSS_SELECTOR, "input[type='text'][inputmode='email'], input[type='email']")
        )
    )
    slow_type(email_input, email, min_delay=0.02, max_delay=0.05)
    dev_log(f"[ACTION] Mengisi email: {email}")

    if not try_click_texts(driver, ["Lanjutkan", "Berikutnya", "Continue", "Next"], timeout=8):
        try:
            wait.until(
                EC.element_to_be_clickable(
                    (
                        By.XPATH,
                        "//button[.//span[normalize-space()='Lanjutkan' or normalize-space()='Berikutnya']]",
                    )
                )
            ).click()
        except Exception:
            pass

    time.sleep(1.2)
    # Cek jika email sudah terdaftar
    page_text_lower = (driver.page_source or "").lower()
    if any(err in page_text_lower for err in ["sudah terdaftar", "sudah digunakan", "already registered"]):
        raise Exception("Email sudah digunakan.")

    # Cek pesan keamanan merah RMS setelah email
    if has_canva_rms_security_error(driver):
        handle_canva_security_back_retry(driver, purpose='signup')

    # Cek apakah Canva meminta Nama terlebih dahulu atau langsung ke layar OTP
    for attempt in range(4):
        if _is_otp_screen_visible(driver):
            dev_log("[INFO] Layar input OTP langsung tampil (tanpa step nama di awal).")
            break
        try:
            nama_inputs = driver.execute_script("""
                return Array.from(document.querySelectorAll("input[type='text']")).filter(el => {
                    if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;
                    const mode = (el.getAttribute('inputmode') || '').toLowerCase();
                    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
                    const ml = el.getAttribute('maxlength') || '';
                    if (mode === 'numeric' || mode === 'email' || ac === 'one-time-code' || ml === '1' || ml === '6') return false;
                    return true;
                });
            """)
            if nama_inputs and len(nama_inputs) > 0:
                nama_input = nama_inputs[0]
                val = (nama_input.get_attribute("value") or "").strip()
                if val.lower() != nama.strip().lower():
                    nama_input.clear()
                    slow_type(nama_input, nama, min_delay=0.02, max_delay=0.05)
                try_click_texts(
                    driver, ["Lanjutkan", "Berikutnya", "Continue", "Next", "Buat akun Anda"], timeout=4
                )
                time.sleep(1.0)
                break
        except Exception:
            pass
        time.sleep(0.5)

    # Cek pesan keamanan merah RMS setelah submit
    if has_canva_rms_security_error(driver):
        handle_canva_security_back_retry(driver, purpose='signup')

    signup_otp_data = None

    for otp_loop in range(1, 4):
        signup_otp_data = wait_for_otp(
            account_data,
            timeout_sec=90,
            interval_sec=1.5,
            after_id=baseline_signup,
            exclude_otp=seen_signup_otps,
            require_newer=True,
            purpose="signup",
        )
        if not signup_otp_data:
            if has_canva_rms_security_error(driver):
                handle_canva_security_back_retry(driver, purpose='signup')
                continue
            if otp_loop < 3:
                request_fresh_otp(driver)
                time.sleep(2.0)
                continue
            raise Exception("Gagal mendapatkan OTP signup dari inbox.")

        current_otp = signup_otp_data["otp"]
        type_otp(driver, current_otp)
        time.sleep(2.5)

        # Cek jika Canva menolak kode ini (kode salah / kedaluwarsa)
        if detect_otp_failure(driver):
            dev_log(Fore.YELLOW + f"[OTP LAMA/DITOLAK] Kode signup {current_otp} ditolak/kedaluwarsa! Menambahkan ke daftar abaikan...")
            seen_signup_otps.add(str(current_otp))
            request_fresh_otp(driver)
            time.sleep(2.0)
        else:
            dev_log(Fore.GREEN + f"[OTP DITERIMA] Kode OTP signup {current_otp} berhasil diterima Canva!")
            break

    time.sleep(2.5)
    # Simpan hasil signup ke result/sukses_signup.txt dan akun_canva.txt
    try:
        os.makedirs(os.path.join(_BASE_DIR, "result"), exist_ok=True)
        append_line(os.path.join(_BASE_DIR, "result", "sukses_signup.txt"), f"{email}|signup_ok")
        save_account_signup_only(email)
    except Exception:
        pass
    dev_log(Fore.GREEN + "[SUCCESS] Pendaftaran signup berhasil!")
    return signup_otp_data


def hold_browser_for_manual(email, note="Silakan lanjut manual di browser."):
    """
    Biarkan browser tetap di halaman setelah signup.
    Tidak driver.get / refresh. Tutup setelah user tekan Enter.
    """
    print(Fore.YELLOW + Style.BRIGHT + "\n" + "=" * 60)
    print(Fore.YELLOW + Style.BRIGHT + "  MODE MANUAL — BROWSER TETAP DI SINI")
    print(Fore.YELLOW + Style.BRIGHT + "=" * 60)
    print(Fore.WHITE + f"  Akun : {email}")
    print(Fore.WHITE + f"  {note}")
    print(Fore.WHITE + "  Bot tidak me-refresh / pindah halaman.")
    print(Fore.CYAN + "  Tekan Enter di terminal ini jika sudah selesai (tutup browser).")
    print(Fore.YELLOW + Style.BRIGHT + "=" * 60 + "\n")
    try:
        safe_input(Fore.GREEN + "  [Enter] tutup browser... " + Style.RESET_ALL)
    except EOFError:
        pass


def perform_password_reset(driver, wait, email_or_account, signup_otp_data=None, save_mode="none"):
    """
    Set password via halaman reset.
    save_mode:
      - "free"              → akun_canva.txt
      - "paid_with_password"→ akun_bayar_password.txt
      - "reset_only"        → sukses_reset.txt (mode 3)
      - None / "none"       → tidak simpan file

    OTP: snapshot inbox SEBELUM submit, lalu hanya ambil pesan TERBARU
    setelah baseline (tidak pakai OTP lama dari signup).
    Setelah sukses, otomatis mengeklik 'Login sekarang' / 'Masuk ke akun Anda' / Enter (permintaan user).
    """
    if isinstance(email_or_account, dict):
        email = email_or_account["email"]
        account_data = email_or_account
    else:
        email = str(email_or_account)
        account_data = {"email": email}

    pwd = require_password()
    dev_log("Step checkpoint")
    dev_log(Fore.CYAN + f"[INFO] Password dari .env (CANVA_PASSWORD) panjang={len(pwd)} karakter")
    dev_log(Fore.CYAN + f"[INFO] Email: {email}")

    # Coba beberapa URL reset (locale ID / global)
    opened = False
    for reset_url in (
        "https://www.canva.com/id_id/login/reset/",
        "https://www.canva.com/login/reset/",
        "https://www.canva.com/id_id/login/reset",
    ):
        try:
            dev_log(Fore.CYAN + f"[INFO] Buka: {reset_url}")
            driver.get(reset_url)
            time.sleep(2.5)
            dismiss_cookies(driver)
            if _is_roadblock_or_404(driver):
                dev_log(Fore.YELLOW + f"[WARN] Roadblock/404 di {reset_url}")
                continue
            opened = True
            break
        except Exception as e:
            dev_log(Fore.YELLOW + f"[WARN] Gagal buka {reset_url}: {e}")
    if not opened:
        raise Exception("Tidak bisa buka halaman reset password.")

    # Placeholder bisa beda locale (ID / EN)
    email_filled = False
    for ph in (
        "Email atau nomor telepon",
        "Email or phone number",
        "Email",
    ):
        try:
            type_into_element(driver, ph, email, timeout=6)
            email_filled = True
            break
        except TimeoutException:
            continue
    if not email_filled:
        # fallback CSS
        try:
            el = WebDriverWait(driver, 8).until(
                EC.presence_of_element_located((
                    By.CSS_SELECTOR,
                    "input[type='text'][inputmode='email'], input[type='email'], "
                    "input[placeholder*='Email'], input[placeholder*='email']"
                ))
            )
            el.clear()
            slow_type(el, email, min_delay=0.02, max_delay=0.06)
            email_filled = True
            dev_log("[ACTION] Mengisi email (fallback CSS)")
        except TimeoutException:
            raise Exception("Field email reset password tidak ditemukan.")

    if not try_click_texts(driver, ["Berikutnya", "Lanjutkan", "Continue", "Next"], timeout=8):
        click_button_by_text(driver, "Lanjutkan")

    # Tunggu field password (bukan sleep tetap)
    pwd_filled = False
    for attempt in range(10):
        for ph_new, ph_confirm in (
            ("Kata sandi baru", "Konfirmasikan kata sandi baru"),
            ("New password", "Confirm new password"),
            ("Password", "Confirm password"),
        ):
            try:
                type_into_element(driver, ph_new, pwd, timeout=3)
                type_into_element(driver, ph_confirm, pwd, timeout=3)
                pwd_filled = True
                break
            except TimeoutException:
                continue
        if pwd_filled:
            break
        try:
            pwd_inputs = driver.find_elements(By.CSS_SELECTOR, "input[type='password']")
            visible = [e for e in pwd_inputs if e.is_displayed()]
            if len(visible) >= 2:
                visible[0].clear()
                slow_type(visible[0], pwd, min_delay=0.02, max_delay=0.06)
                visible[1].clear()
                slow_type(visible[1], pwd, min_delay=0.02, max_delay=0.06)
                pwd_filled = True
                dev_log("[ACTION] Mengisi password via input[type=password]")
                break
            if len(visible) == 1:
                visible[0].clear()
                slow_type(visible[0], pwd, min_delay=0.02, max_delay=0.06)
                time.sleep(0.8)
        except Exception:
            pass
        time.sleep(0.6)
    if not pwd_filled:
        raise Exception("Field password baru tidak ditemukan.")

    # Snapshot inbox SEBELUM minta OTP baru — kunci agar tidak ambil OTP lama
    baseline_id = get_max_message_id(account_data)
    if signup_otp_data and signup_otp_data.get("msg_id") is not None:
        try:
            _sid = signup_otp_data["msg_id"]
            if isinstance(baseline_id, dict):
                # Format baru dict {"ids": set, "time": str}
                baseline_id["ids"].add(_sid)
            elif isinstance(baseline_id, int):
                baseline_id = max(baseline_id, int(_sid))
            elif isinstance(baseline_id, set):
                baseline_id.add(_sid)
        except Exception:
            pass

    seen_reset_otps = set(baseline_id.get("existing_otps") or set()) if isinstance(baseline_id, dict) else set()
    if signup_otp_data and signup_otp_data.get("otp"):
        seen_reset_otps.add(str(signup_otp_data["otp"]))
    dev_log(Fore.CYAN + f"[INFO] Baseline inbox SEBELUM submit reset password: existing_otps={seen_reset_otps}")

    if not try_click_texts(
        driver,
        [
            "Buat kata sandi",
            "Create password",
            "Reset password",
            "Set password",
            "Continue",
            "Lanjutkan",
            "Berikutnya",
            "Next",
        ],
        timeout=8,
    ):
        click_button_by_text(driver, "Buat kata sandi")

    time.sleep(1.5)
    if has_canva_rms_security_error(driver):
        handle_canva_security_back_retry(driver, purpose='password_reset')

    reset_otp_data = None
    for reset_loop in range(1, 4):
        reset_otp_data = wait_for_otp(
            account_data,
            timeout_sec=90,
            interval_sec=2,
            after_id=baseline_id,
            exclude_otp=seen_reset_otps,
            require_newer=True,
            purpose="password_reset",
        )
        if not reset_otp_data:
            if has_canva_rms_security_error(driver):
                handle_canva_security_back_retry(driver, purpose='password_reset')
                continue
            if reset_loop < 3:
                request_fresh_otp(driver)
                time.sleep(2.0)
                continue
            raise Exception("Gagal OTP reset (tidak ada email OTP baru setelah submit). Cek inbox / baseline_id.")

        current_reset_otp = reset_otp_data["otp"]
        type_otp(driver, current_reset_otp)
        time.sleep(2.0)

        if detect_otp_failure(driver):
            seen_reset_otps.add(str(current_reset_otp))
            request_fresh_otp(driver)
            time.sleep(2.0)
            # Update baseline agar OTP ditolak tidak dibaca ulang
            _rejected_id = reset_otp_data.get("msg_id")
            if isinstance(baseline_id, dict):
                if _rejected_id:
                    baseline_id["ids"].add(_rejected_id)
            elif isinstance(baseline_id, int):
                try:
                    baseline_id = max(baseline_id, int(_rejected_id or 0))
                except Exception:
                    pass
            elif isinstance(baseline_id, set) and _rejected_id:
                baseline_id.add(_rejected_id)
        else:
            dev_log(Fore.GREEN + f"  • OTP password diterima: {current_reset_otp} [OK]")
            break

    # *** KLIK "Lanjutkan" / Submit yang muncul setelah OTP dimasukkan ***
    for attempt in range(8):
        try:
            clicked_txt = driver.execute_script("""
                const btns = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"], a'));
                const b = btns.find(x => {
                    if (x.disabled || x.offsetParent === null) return false;
                    const t = (x.innerText || x.textContent || x.value || '').trim().toLowerCase();
                    return t === 'lanjutkan' || t === 'continue' || t === 'next' || t === 'ok' || t === 'submit' || t === 'verifikasi';
                });
                if (b) {
                    b.scrollIntoView({block:'center'});
                    b.click();
                    return b.innerText || b.textContent || 'Button';
                }
                const form = document.querySelector('form');
                if (form) {
                    form.requestSubmit ? form.requestSubmit() : form.submit();
                    return 'Form submitted';
                }
                return null;
            """)
            if clicked_txt:
                dev_log(Fore.GREEN + f"[INFO] Klik tombol setelah OTP password (attempt {attempt+1}): '{clicked_txt}'")
                time.sleep(2)
                cur = (driver.current_url or "").lower()
                if "reset" not in cur or "templates" in cur:
                    break
        except Exception:
            pass
        time.sleep(1)

    try:
        wait.until(
            lambda d: "reset" not in (d.current_url or "").lower()
            or any(
                m in (d.page_source or "").lower()
                for m in (
                    "berhasil mengganti",
                    "password has been changed",
                    "kata sandi anda telah",
                    "kata sandi telah",
                    "you're signed in",
                )
            )
        )
    except TimeoutException:
        pass

    success_markers = [
        "anda berhasil mengganti kata sandi",
        "anda kini akan masuk ke akun anda",
        "password has been changed",
        "kata sandi anda telah",
        "kata sandi telah diubah",
        "you're signed in",
        "you're signed in",
    ]
    page = driver.page_source or ""
    page_l = page.lower()
    url = (driver.current_url or "").lower()
    success = any(m.lower() in page_l for m in success_markers)

    if not success:
        fail_markers = [
            "kode tidak valid",
            "kode salah",
            "invalid code",
            "incorrect code",
            "try again",
            "coba lagi",
        ]
        if any(m in page_l for m in fail_markers):
            print(Fore.RED + "[FAIL] OTP ditolak Canva (kode tidak valid).")
            return False
        if "/templates" in url or any(x in url for x in ("/folder", "/designs", "/projects", "/your-apps")):
            success = True
        elif "login/reset" not in url and "canva.com" in url and "otp" not in page_l:
            success = True

    if success:
        handle_post_reset_login(driver, wait, email, pwd)
        if save_mode == "free":
            save_account_free(email, pwd)
        elif save_mode == "paid_with_password":
            save_account_paid_with_password(email, pwd)
        elif save_mode in ("reset_only", "reset_success"):
            save_account_reset_success(email, pwd)
            try:
                os.makedirs(os.path.join(_BASE_DIR, "result"), exist_ok=True)
                append_line(os.path.join(_BASE_DIR, "result", "sukses_reset.txt"), f"{email}|{pwd}")
            except Exception:
                pass
        return reset_otp_data or True
    else:
        # Coba jalankan post reset login sebagai fallback
        handle_post_reset_login(driver, wait, email, pwd)
        cur_u = (driver.current_url or "").lower()
        if "reset" not in cur_u and "canva.com" in cur_u:
            return reset_otp_data or True

    dev_log(Fore.YELLOW + "[WARN] Reset mungkin tidak berhasil, tidak menyimpan akun password.")
    print(Fore.YELLOW + f"       URL: {driver.current_url}")
    return False



def ensure_logged_in(driver, wait, email, password=None):
    """Pastikan session login aktif; kalau perlu login ulang."""
    pwd = password if password else PASSWORD
    driver.get("https://www.canva.com/")
    time.sleep(5)
    dismiss_cookies(driver)

    # Sudah di home / app
    if any(x in driver.current_url for x in ["/folder", "/designs", "/projects", "canva.com/"]):
        # Cek tombol login masih ada?
        login_visible = False
        try:
            driver.find_element(By.XPATH, "//a[contains(@href,'login')] | //button[contains(.,'Log in') or contains(.,'Masuk')]")
            login_visible = True
        except NoSuchElementException:
            login_visible = False

        if not login_visible:
            dev_log("[INFO] Sudah login.")
            return True

    dev_log("[INFO] Mencoba login ulang...")
    return perform_login(driver, wait, email, pwd)


def _is_roadblock_or_404(driver):
    """Deteksi halaman error Canva (404 / roadblock)."""
    try:
        page = driver.page_source.lower()
        url = driver.current_url.lower()
        markers = [
            "looks like we hit a roadblock",
            "that link doesn't work",
            "error: 404",
            "page not found",
            "halaman tidak ditemukan",
        ]
        if any(m in page for m in markers):
            return True
        if "404" in page and "ray id" in page:
            return True
        if "/en_us/" in url and ("roadblock" in page or "doesn't work" in page):
            return True
    except Exception:
        pass
    return False


def _login_url_candidates(use_us_locale=False):
    """
    URL login Canva yang valid.
    Catatan: /en_us/login/ sering 404 — JANGAN dipakai.
    Dengan VPN US, /login/ (tanpa locale) sudah cukup; UI jadi English.
    """
    if use_us_locale:
        return [
            "https://www.canva.com/login/",
            "https://www.canva.com/login",
            "https://www.canva.com/",
            "https://www.canva.com/id_id/login/",  # fallback terakhir
        ]
    return [
        "https://www.canva.com/id_id/login/",
        "https://www.canva.com/login/",
        "https://www.canva.com/",
    ]


def perform_login(driver, wait, email, password, use_us_locale=False):
    """
    Login Canva dengan email + password.
    Mode 4: use_us_locale=True → buka /login/ (bukan /en_us/ yang 404).
    """
    print(Fore.CYAN + f"\n--- LOGIN: {email} ---")

    opened = False
    for login_url in _login_url_candidates(use_us_locale=use_us_locale):
        dev_log(f"[INFO] Buka login: {login_url}")
        try:
            driver.get(login_url)
            time.sleep(5)
            dismiss_cookies(driver)
            if _is_roadblock_or_404(driver):
                dev_log(Fore.YELLOW + f"[WARN] 404/roadblock di {login_url}, coba URL lain...")
                continue
            opened = True
            break
        except Exception as e:
            dev_log(Fore.YELLOW + f"[WARN] Gagal buka {login_url}: {e}")
            continue

    if not opened:
        print(Fore.RED + "[ERROR] Semua URL login gagal / 404.")
        return False

    # Kalau landing di home (bukan form login), klik Log in
    try:
        page_l = driver.page_source.lower()
        if "log in" in page_l or "masuk" in page_l or "sign up" in page_l:
            try_click_texts(
                driver,
                ["Log in", "Login", "Masuk", "Sign in"],
                timeout=5,
            )
            time.sleep(3)
            dismiss_cookies(driver)
    except Exception:
        pass

    try:
        try_click_texts(
            driver,
            [
                "Continue with email",
                "Log in with email",
                "Lanjutkan dengan email",
                "Email",
            ],
            timeout=6,
        )
    except Exception:
        pass

    # Email
    try:
        email_el = WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((
                By.CSS_SELECTOR,
                "input[type='text'][inputmode='email'], input[type='email'], "
                "input[placeholder*='Email'], input[autocomplete='email']"
            ))
        )
        email_el.clear()
        slow_type(email_el, email)
        if not try_click_texts(driver, ["Continue", "Next", "Berikutnya", "Lanjutkan"], timeout=8):
            dev_log("[WARN] Tombol lanjut setelah email tidak ketemu, coba Enter.")
            email_el.send_keys("\n")
        time.sleep(3)
    except TimeoutException:
        print("[ERROR] Field email login tidak ditemukan.")
        dev_log(Fore.YELLOW + f"[DEBUG] URL saat ini: {driver.current_url}")
        if _is_roadblock_or_404(driver):
            print(Fore.RED + "[ERROR] Masih di halaman 404/roadblock.")
        return False

    # Password
    try:
        pwd_el = WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='password']"))
        )
        pwd_el.clear()
        slow_type(pwd_el, password)
        if not try_click_texts(
            driver,
            ["Log in", "Login", "Masuk", "Continue", "Next", "Berikutnya", "Lanjutkan"],
            timeout=10,
        ):
            pwd_el.send_keys("\n")
        time.sleep(8)
    except TimeoutException:
        print("[ERROR] Field password tidak ditemukan.")
        return False

    # Cek 404 setelah submit
    if _is_roadblock_or_404(driver):
        print(Fore.RED + "[ERROR] Setelah login muncul 404/roadblock.")
        return False

    # Cek masih di halaman login?
    url = driver.current_url.lower()
    page = driver.page_source.lower()
    if "login" in url and any(
        x in page for x in ["incorrect", "salah", "invalid", "try again", "doesn't match"]
    ):
        print(Fore.RED + "[ERROR] Login gagal (password/email salah?).")
        return False

    dev_log(Fore.GREEN + "[SUCCESS] Login selesai (atau sudah di dashboard).")
    dev_log(Fore.CYAN + f"[INFO] URL setelah login: {driver.current_url}")
    return True


def open_canva_for_manual_upgrade(driver, wait, email, window_index=0):
    """
    Pastikan sudah login, buka homepage Canva, lalu serahkan ke user.
    Tidak ada klik trial/plan/bayar otomatis.
    window_index: posisi horizontal browser (0=paling kiri, lalu ke kanan).
    """
    print(
        Fore.MAGENTA
        + f"\n--- UPGRADE MANUAL (Browser #{window_index + 1}, kiri→kanan) ---"
    )

    try:
        ensure_logged_in(driver, wait, email)

        # Pastikan posisi window tetap di slot kiri→kanan (kadang Chrome reset)
        try:
            x = window_index * (BROWSER_WIDTH + BROWSER_GAP)
            driver.set_window_rect(x=x, y=0, width=BROWSER_WIDTH, height=BROWSER_HEIGHT)
        except Exception:
            pass

        # Buka home Canva (sudah login) — user bebas navigasi ke trial Bisnis
        dev_log("[INFO] Membuka homepage Canva (sudah login)...")
        driver.get("https://www.canva.com/")
        time.sleep(4)
        dismiss_cookies(driver)
    except Exception as e:
        dev_log(f"[WARN] Gagal siapkan browser pay manual: {e}")
        # Batch paralel: hitung sebagai gagal agar batch tidak deadlock
        if _batch_pay_coord is not None:
            batch_pay_register_failed(_batch_pay_coord)
            return False
        raise

    print(
        Fore.GREEN
        + f"[INFO] Browser #{window_index + 1} siap (x={window_index * (BROWSER_WIDTH + BROWSER_GAP)}). "
        + "Silakan klik trial Bisnis & bayar sendiri."
    )
    return wait_manual_upgrade_and_payment(email, window_index=window_index)


# ==============================================================================
# MODE 4 — AUTO PAY (VCC + alamat USA New York)
# ==============================================================================

def _js_set_value(driver, element, value):
    """Set value input (termasuk React-controlled) lalu trigger event."""
    driver.execute_script(
        """
        const el = arguments[0];
        const val = arguments[1];
        el.focus();
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        """,
        element,
        value,
    )


def _safe_clear_type(driver, element, text, use_js=False):
    try:
        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", element)
        time.sleep(0.2)
        element.click()
        time.sleep(0.15)
        if use_js:
            _js_set_value(driver, element, text)
        else:
            try:
                element.clear()
            except Exception:
                element.send_keys("\u0001")  # select all fallback
                element.send_keys("\b")
            slow_type(element, text, min_delay=0.03, max_delay=0.08)
        return True
    except Exception as e:
        dev_log(f"[WARN] Gagal isi field: {e}")
        return False


def _find_and_fill(driver, selectors, text, timeout=6, use_js=False):
    """
    Cari input dengan daftar CSS selector, isi text.
    selectors: list of CSS strings
    """
    end = time.time() + timeout
    while time.time() < end:
        for sel in selectors:
            try:
                els = driver.find_elements(By.CSS_SELECTOR, sel)
                for el in els:
                    if not el.is_displayed():
                        continue
                    if _safe_clear_type(driver, el, text, use_js=use_js):
                        dev_log(f"[ACTION] Isi field ({sel[:50]}...) → OK")
                        return True
            except Exception:
                continue
        time.sleep(0.4)
    return False


def _find_and_fill_xpath(driver, xpaths, text, timeout=6, use_js=False):
    end = time.time() + timeout
    while time.time() < end:
        for xp in xpaths:
            try:
                els = driver.find_elements(By.XPATH, xp)
                for el in els:
                    if not el.is_displayed():
                        continue
                    if _safe_clear_type(driver, el, text, use_js=use_js):
                        dev_log(f"[ACTION] Isi field xpath → OK")
                        return True
            except Exception:
                continue
        time.sleep(0.4)
    return False


def _fill_in_iframes(driver, fill_fn, max_depth=3, depth=0):
    """
    Jalankan fill_fn di dokumen saat ini + semua iframe (rekursif).
    fill_fn(driver) -> True jika sukses mengisi sesuatu.
    """
    filled = False
    try:
        if fill_fn(driver):
            filled = True
    except Exception:
        pass

    if depth >= max_depth:
        return filled

    try:
        frames = driver.find_elements(By.TAG_NAME, "iframe")
    except Exception:
        frames = []

    for i, frame in enumerate(frames):
        try:
            driver.switch_to.frame(frame)
            if _fill_in_iframes(driver, fill_fn, max_depth=max_depth, depth=depth + 1):
                filled = True
            driver.switch_to.parent_frame()
        except Exception:
            try:
                driver.switch_to.default_content()
            except Exception:
                pass
    try:
        driver.switch_to.default_content()
    except Exception:
        pass
    return filled


def _exp_formats(card):
    """Beberapa format expiry umum: MM/YY, MMYY, MM / YY, MM/YYYY."""
    mm = str(card["exp_month"]).zfill(2)
    yy = str(card["exp_year"]).strip()
    if len(yy) == 4:
        yy2 = yy[-2:]
        yyyy = yy
    else:
        yy2 = yy.zfill(2)
        yyyy = "20" + yy2
    return {
        "mm": mm,
        "yy": yy2,
        "yyyy": yyyy,
        "mm_yy": f"{mm}/{yy2}",
        "mm_yyyy": f"{mm}/{yyyy}",
        "mmyy": f"{mm}{yy2}",
    }


def _force_type_input(driver, el, text):
    """Isi input dengan clear + type + JS set (TokenEx/React-friendly)."""
    try:
        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
        time.sleep(0.15)
        try:
            el.click()
        except Exception:
            driver.execute_script("arguments[0].click();", el)
        time.sleep(0.1)
        try:
            el.clear()
        except Exception:
            pass
        # Select-all + delete
        try:
            el.send_keys("\u0001")
            el.send_keys("\b")
        except Exception:
            pass
        slow_type(el, str(text), min_delay=0.04, max_delay=0.09)
        _js_set_value(driver, el, str(text))
        return True
    except Exception as e:
        dev_log(f"[WARN] force_type gagal: {e}")
        return False


def fill_card_fields(driver, card):
    """
    Isi nomor kartu, expiry, CVC (halaman + iframe).
    Selector dari HTML Canva user:
      - exp: input[inputmode=numeric][aria-describedby*='expiryDate']
      - cvc: input[autocomplete=cc-csc] / name=Data maxlength=4
    """
    exp = _exp_formats(card)
    dev_log(Fore.CYAN + f"[INFO] Mengisi VCC ...{card['number'][-4:]} exp {exp['mm_yy']}")

    def fill_number(d):
        # Prioritas selector umum + Canva
        ok = _find_and_fill(
            d,
            [
                "input[autocomplete='cc-number']",
                "input[name*='cardnumber']",
                "input[name*='cardNumber']",
                "input[id*='cardnumber']",
                "input[id*='card-number']",
                "input[placeholder*='Card number']",
                "input[placeholder*='Nomor kartu']",
                "input[placeholder*='nomor kartu']",
                "input[aria-label*='Card number']",
                "input[aria-label*='Nomor kartu']",
                "input[data-fieldtype='encryptedCardNumber']",
                "input[name='encryptedCardNumber']",
            ],
            card["number"],
            timeout=2,
        )
        if ok:
            return True
        return _find_and_fill_xpath(
            d,
            [
                "//input[contains(@placeholder,'Nomor')]",
                "//input[contains(@aria-label,'Nomor')]",
                "//label[contains(.,'Nomor kartu')]/following::input[1]",
                "//*[contains(normalize-space(.),'Nomor kartu')]/following::input[1]",
                "//input[contains(@autocomplete,'cc-number')]",
            ],
            card["number"],
            timeout=1,
        )

    def fill_exp(d):
        # HTML user: aria-describedby="...expiryDate-error" inputmode=numeric type=text
        selectors_css = [
            "input[aria-describedby*='expiryDate']",
            "input[aria-describedby*='expiry']",
            "input[aria-describedby*='Expiry']",
            "input[autocomplete='cc-exp']",
            "input[data-fieldtype='encryptedExpiryDate']",
            "input[name='encryptedExpiryDate']",
        ]
        xpaths = [
            "//input[contains(@aria-describedby,'expiryDate')]",
            "//input[contains(@aria-describedby,'expiry')]",
            "//input[contains(@aria-describedby,'Expiry')]",
            "//label[contains(.,'Kedaluwarsa')]/following::input[1]",
            "//*[contains(normalize-space(.),'BB/TT')]/following::input[1]",
            "//*[contains(normalize-space(.),'Kedaluwarsa')]/following::input[@inputmode='numeric'][1]",
        ]
        for val in (exp["mm_yy"], exp["mmyy"], f"{exp['mm']}{exp['yy']}"):
            for sel in selectors_css:
                try:
                    for el in d.find_elements(By.CSS_SELECTOR, sel):
                        if not el.is_displayed():
                            continue
                        if _force_type_input(d, el, val):
                            dev_log(f"[ACTION] Isi kedaluwarsa BB/TT → {val}")
                            return True
                except Exception:
                    continue
            for xp in xpaths:
                try:
                    for el in d.find_elements(By.XPATH, xp):
                        if not el.is_displayed():
                            continue
                        if _force_type_input(d, el, val):
                            dev_log(f"[ACTION] Isi kedaluwarsa BB/TT (xpath) → {val}")
                            return True
                except Exception:
                    continue
        return False

    def fill_cvc(d):
        # HTML user: autocomplete=cc-csc id=data name=Data maxlength=4 inputmode=numeric
        selectors_css = [
            "input[autocomplete='cc-csc']",
            "input[name='Data']",
            "input[name='data']",
            "input#data",
            "input[maxlength='4'][inputmode='numeric']",
            "input[maxlength='3'][inputmode='numeric']",
            "input[data-fieldtype='encryptedSecurityCode']",
            "input[name='encryptedSecurityCode']",
            "input[placeholder*='CVC']",
            "input[placeholder*='CVV']",
        ]
        xpaths = [
            "//input[@autocomplete='cc-csc']",
            "//input[@name='Data' or @name='data']",
            "//input[@id='data']",
            "//label[contains(.,'Kode keamanan')]/following::input[1]",
            "//*[contains(normalize-space(.),'Kode keamanan')]/following::input[1]",
            "//*[contains(normalize-space(.),'CVC')]/following::input[@inputmode='numeric'][1]",
        ]
        for sel in selectors_css:
            try:
                for el in d.find_elements(By.CSS_SELECTOR, sel):
                    if not el.is_displayed():
                        continue
                    # Hindari field nomor kartu (panjang)
                    ml = el.get_attribute("maxlength") or ""
                    if ml and ml.isdigit() and int(ml) > 4:
                        continue
                    if _force_type_input(d, el, card["cvc"]):
                        dev_log("[ACTION] Isi CVC/kode keamanan")
                        return True
            except Exception:
                continue
        for xp in xpaths:
            try:
                for el in d.find_elements(By.XPATH, xp):
                    if not el.is_displayed():
                        continue
                    if _force_type_input(d, el, card["cvc"]):
                        dev_log("[ACTION] Isi CVC (xpath)")
                        return True
            except Exception:
                continue
        return False

    def fill_holder(d):
        return _find_and_fill(
            d,
            [
                "input[autocomplete='cc-name']",
                "input[name*='cardholder' i]",
                "input[name*='card-name' i]",
                "input[name*='holder' i]",
                "input[id*='cardholder' i]",
                "input[placeholder*='Name on card' i]",
                "input[placeholder*='Cardholder' i]",
                "input[placeholder*='Nama di kartu' i]",
                "input[aria-label*='Name on card' i]",
                "input[aria-label*='Cardholder' i]",
            ],
            card["holder"],
            timeout=2,
        )

    n_ok = _fill_in_iframes(driver, fill_number)
    e_ok = _fill_in_iframes(driver, fill_exp)
    c_ok = _fill_in_iframes(driver, fill_cvc)
    h_ok = _fill_in_iframes(driver, fill_holder)

    # Nama kadang di luar iframe
    if not h_ok:
        h_ok = fill_holder(driver)

    print(
        Fore.CYAN
        + f"[INFO] Card fill status: number={n_ok} exp={e_ok} cvc={c_ok} holder={h_ok}"
    )
    return n_ok  # minimal nomor kartu harus keisi


def fill_us_billing_address(driver, skip_country=True):
    """
    Isi alamat penagihan USA (New York).
    skip_country=True → TIDAK pilih negara (sudah otomatis, sesuai flow mode 4).
    """
    print(
        Fore.CYAN
        + f"[INFO] Isi alamat penagihan: {BILLING_LINE1}, {BILLING_CITY}, {BILLING_STATE} {BILLING_ZIP}"
    )
    if skip_country:
        dev_log("[INFO] Skip pilih negara (otomatis dari VPN/locale).")

    # Name (jika ada)
    _find_and_fill(
        driver,
        [
            "input[autocomplete='name']",
            "input[autocomplete='billing name']",
            "input[name*='fullName' i]",
            "input[name*='full_name' i]",
            "input[placeholder*='Full name' i]",
            "input[placeholder*='Nama' i]",
            "input[aria-label*='Full name' i]",
            "input[aria-label*='Name' i]",
        ],
        BILLING_NAME,
        timeout=3,
    )

    # Address — HTML user:
    # <input placeholder="Masukkan alamat penagihan Anda" autocomplete="search-with-keyboard-handler">
    addr_ok = False
    addr_selectors = [
        "input[placeholder='Masukkan alamat penagihan Anda']",
        "input[placeholder*='Masukkan alamat penagihan']",
        "input[placeholder*='alamat penagihan']",
        "input[autocomplete='search-with-keyboard-handler']",
        "input[autocomplete='address-line1']",
        "input[autocomplete='billing address-line1']",
        "input[placeholder*='Address']",
        "input[placeholder*='Alamat']",
    ]
    for sel in addr_selectors:
        try:
            for el in driver.find_elements(By.CSS_SELECTOR, sel):
                if not el.is_displayed():
                    continue
                if _force_type_input(driver, el, BILLING_LINE1):
                    dev_log(f"[ACTION] Isi alamat penagihan: {BILLING_LINE1}")
                    addr_ok = True
                    break
        except Exception:
            continue
        if addr_ok:
            break
    if not addr_ok:
        _find_and_fill_xpath(
            driver,
            [
                "//input[@placeholder='Masukkan alamat penagihan Anda']",
                "//input[contains(@placeholder,'alamat penagihan')]",
                "//input[contains(@placeholder,'Masukkan alamat')]",
                "//label[contains(.,'Alamat penagihan')]/following::input[1]",
                "//input[@autocomplete='search-with-keyboard-handler']",
            ],
            BILLING_LINE1,
            timeout=3,
        )
    # Suggestion alamat: panah bawah + Enter
    try:
        from selenium.webdriver.common.keys import Keys
        active = driver.switch_to.active_element
        time.sleep(1.0)
        active.send_keys(Keys.ARROW_DOWN)
        time.sleep(0.3)
        active.send_keys(Keys.ENTER)
        time.sleep(0.6)
    except Exception:
        pass

    if BILLING_LINE2:
        _find_and_fill(
            driver,
            [
                "input[autocomplete='address-line2']",
                "input[name*='address2' i]",
                "input[name*='line2' i]",
                "input[placeholder*='Apt' i]",
                "input[placeholder*='Suite' i]",
            ],
            BILLING_LINE2,
            timeout=2,
        )

    # City
    _find_and_fill(
        driver,
        [
            "input[autocomplete='address-level2']",
            "input[autocomplete='billing address-level2']",
            "input[name*='city' i]",
            "input[id*='city' i]",
            "input[placeholder*='City' i]",
            "input[placeholder*='Kota' i]",
            "input[aria-label*='City' i]",
            "input[aria-label*='Kota' i]",
        ],
        BILLING_CITY,
        timeout=3,
    )

    # State NY
    state_ok = False
    for sel in [
        "select[autocomplete='address-level1']",
        "select[name*='state' i]",
        "select[id*='state' i]",
        "select[aria-label*='State' i]",
    ]:
        try:
            els = driver.find_elements(By.CSS_SELECTOR, sel)
            for el in els:
                if not el.is_displayed():
                    continue
                s = Select(el)
                for attempt in (BILLING_STATE, "NY", "New York"):
                    try:
                        s.select_by_value(attempt)
                        state_ok = True
                        break
                    except Exception:
                        try:
                            s.select_by_visible_text(attempt)
                            state_ok = True
                            break
                        except Exception:
                            continue
                if state_ok:
                    dev_log("[ACTION] State = NY")
                    break
        except Exception:
            continue
    if not state_ok:
        _find_and_fill(
            driver,
            [
                "input[autocomplete='address-level1']",
                "input[name*='state' i]",
                "input[placeholder*='State' i]",
                "input[placeholder*='Provinsi' i]",
                "input[aria-label*='State' i]",
            ],
            BILLING_STATE,
            timeout=2,
        )

    # ZIP
    _find_and_fill(
        driver,
        [
            "input[autocomplete='postal-code']",
            "input[autocomplete='billing postal-code']",
            "input[name*='postal' i]",
            "input[name*='zip' i]",
            "input[id*='postal' i]",
            "input[id*='zip' i]",
            "input[placeholder*='ZIP' i]",
            "input[placeholder*='Postal' i]",
            "input[placeholder*='Kode pos' i]",
            "input[aria-label*='ZIP' i]",
            "input[aria-label*='Postal' i]",
        ],
        BILLING_ZIP,
        timeout=3,
    )

    # Phone (opsional)
    _find_and_fill(
        driver,
        [
            "input[autocomplete='tel']",
            "input[type='tel']",
            "input[name*='phone' i]",
            "input[placeholder*='Phone' i]",
            "input[placeholder*='Telepon' i]",
            "input[aria-label*='Phone' i]",
        ],
        BILLING_PHONE,
        timeout=2,
    )

    dev_log(Fore.GREEN + "[INFO] Alamat penagihan selesai diisi (field yang ketemu).")
    return True


def click_lanjutkan(driver, timeout=8, extra_labels=None):
    """Klik tombol Lanjutkan / Continue di flow trial."""
    labels = [
        "Lanjutkan",
        "Continue",
        "Next",
        "Berikutnya",
        "Confirm",
        "Konfirmasi",
    ]
    if extra_labels:
        labels = list(extra_labels) + labels
    clicked = try_click_texts(driver, labels, timeout=timeout, partial=False)
    if not clicked:
        clicked = try_click_texts(driver, labels, timeout=3, partial=True)
    if clicked:
        dev_log(f"[ACTION] Klik lanjut: {clicked}")
        time.sleep(3)
        return clicked
    # Fallback submit
    try:
        for b in driver.find_elements(By.CSS_SELECTOR, "button[type='submit']"):
            if b.is_displayed() and b.is_enabled():
                driver.execute_script("arguments[0].click();", b)
                dev_log("[ACTION] Klik button[type=submit]")
                time.sleep(3)
                return "submit"
    except Exception:
        pass
    return None


def _page_text_has(driver, *phrases):
    try:
        src = driver.page_source.lower()
        return any(p.lower() in src for p in phrases)
    except Exception:
        return False


def _click_role_option(driver, labels, timeout=6):
    """
    Pilih opsi Individu/Bisnis atau metode bayar (radio/card/option).
    """
    end = time.time() + timeout
    while time.time() < end:
        for label in labels:
            xpaths = [
                f"//*[@role='radio' and contains(normalize-space(.), '{label}')]",
                f"//*[@role='option' and contains(normalize-space(.), '{label}')]",
                f"//*[@role='button' and contains(normalize-space(.), '{label}')]",
                f"//label[contains(normalize-space(.), '{label}')]",
                f"//button[contains(normalize-space(.), '{label}')]",
                f"//div[contains(normalize-space(.), '{label}') and (@role='radio' or @role='option' or @tabindex)]",
                f"//span[contains(normalize-space(.), '{label}')]/ancestor::label[1]",
                f"//span[contains(normalize-space(.), '{label}')]/ancestor::*[@role='radio' or @role='button' or @role='option'][1]",
            ]
            for xp in xpaths:
                try:
                    els = driver.find_elements(By.XPATH, xp)
                    for el in els:
                        if not el.is_displayed():
                            continue
                        driver.execute_script(
                            "arguments[0].scrollIntoView({block:'center'});", el
                        )
                        time.sleep(0.2)
                        try:
                            el.click()
                        except Exception:
                            driver.execute_script("arguments[0].click();", el)
                        dev_log(f"[ACTION] Pilih opsi: {label}")
                        time.sleep(1.5)
                        return label
                except Exception:
                    continue
        # fallback try_click_texts
        hit = try_click_texts(driver, labels, timeout=2, partial=True)
        if hit:
            return hit
        time.sleep(0.4)
    return None


def _click_by_labels_fast(driver, labels, timeout=10, partial_ok=True):
    """Klik tombol/link by label — timeout pendek per label, lalu XPath contains."""
    for label in labels:
        hit = try_click_texts(driver, [label], timeout=1.0, partial=False)
        if hit:
            return hit
    if partial_ok:
        for label in labels:
            hit = try_click_texts(driver, [label], timeout=0.8, partial=True)
            if hit:
                return hit

    # XPath contains (case-insensitive) untuk label terpanjang dulu
    end = time.time() + timeout
    ordered = sorted(labels, key=len, reverse=True)
    while time.time() < end:
        for label in ordered:
            low = label.lower()
            xpaths = [
                f"//button[contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'{low}')]",
                f"//a[contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'{low}')]",
                f"//*[@role='button' and contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'{low}')]",
                f"//span[contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'{low}')]/ancestor::button[1]",
                f"//span[contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'{low}')]/ancestor::a[1]",
                f"//label[contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'{low}')]",
            ]
            for xp in xpaths:
                try:
                    for el in driver.find_elements(By.XPATH, xp):
                        try:
                            if not el.is_displayed():
                                continue
                            driver.execute_script(
                                "arguments[0].scrollIntoView({block:'center'});", el
                            )
                            time.sleep(0.2)
                            try:
                                el.click()
                            except Exception:
                                driver.execute_script("arguments[0].click();", el)
                            dev_log(f"[ACTION] Klik: {label}")
                            time.sleep(1.2)
                            return label
                        except Exception:
                            continue
                except Exception:
                    continue
        time.sleep(0.4)
    return None


def handle_password_reauth(driver, password):
    """
    Menangani modal Canva (seperti di screenshot user):
    1. 'Jump back in!' -> Klik 'Continue'
    2. 'Log in to your account' -> Fill input[type='password'] -> Klik 'Log in'
    """
    handled = False
    for attempt in range(5):
        # 1. Cek modal 'Jump back in!' / 'Continue'
        try:
            hit = try_click_texts(driver, ["Continue", "Lanjutkan"], timeout=1.5, partial=False)
            if hit:
                dev_log(Fore.CYAN + f"[INFO] Klik '{hit}' di modal Jump back in!")
                time.sleep(1.5)
                handled = True
        except Exception:
            pass

        # 2. Cek input password & tombol Log in
        try:
            pwd_inputs = driver.find_elements(By.CSS_SELECTOR, "input[type='password']")
            for inp in pwd_inputs:
                if inp.is_displayed():
                    dev_log(Fore.CYAN + "[INFO] Menemukan field password Canva — mengetik password...")
                    try:
                        inp.clear()
                    except Exception:
                        pass
                    slow_type(inp, password, min_delay=0.03, max_delay=0.08)
                    time.sleep(0.5)
                    click_hit = try_click_texts(driver, ["Log in", "Masuk", "Lanjutkan", "Berikutnya"], timeout=5)
                    dev_log(Fore.GREEN + f"[OK] Klik tombol login modal: {click_hit}")
                    time.sleep(2.5)
                    return True
        except Exception:
            pass

        # 3. Cek tombol Log in jika field password sudah terisi
        try:
            hit_login = try_click_texts(driver, ["Log in", "Masuk"], timeout=1.0, partial=False)
            if hit_login:
                dev_log(Fore.CYAN + f"[INFO] Klik '{hit_login}' di modal login")
                time.sleep(1.5)
                handled = True
        except Exception:
            pass

        if not handled:
            break
        time.sleep(1)
    return handled


# ==============================================================================
# ALUR BUAT TIM & KLAIM TRIAL CANVA BISNIS RP 0 (FLOW TERBARU)
# ==============================================================================

def open_create_team_flow(driver):
    """
    Flow lengkap buat tim sesuai instruksi:
      1. Klik avatar/profile → klik "Buat Tim" / "Create a Team"
      2. Isi nama tim → klik Lanjutkan/Continue
      3. Input email anggota tim (random gmail nama manusia)
      4. Klik "Aktifkan Paket dan Undang Tim" / "Berlangganan Sekarang" → trigger payment
    """
    dev_log("[CREATE TEAM] Memulai alur pembuatan tim...")
    dismiss_browser_popups(driver)

    # ── STEP 1: Buka profile → klik "Buat Tim" ────────────────────────────────
    modal_already_open = False
    try:
        modal_already_open = driver.execute_script("""
            const txt = (document.body.innerText || '').toLowerCase();
            return txt.includes('nama tim') || txt.includes('team name') ||
                   txt.includes('siapa di tim anda') || txt.includes('undang tim anda') ||
                   txt.includes('coba canva untuk tim') || txt.includes('buat tim anda');
        """)
    except Exception:
        pass

    if not modal_already_open:
        # Klik tab "Lainnya" / "More" di bottom bar (portrait layout)
        try:
            driver.execute_script("""
                const tabs = Array.from(document.querySelectorAll("button, a, [role='tab']"));
                const lainnya = tabs.find(t => {
                    const txt = (t.innerText || '').trim().toLowerCase();
                    return txt === 'lainnya' || txt === 'more';
                });
                if (lainnya) { lainnya.click(); }
            """)
            time.sleep(0.5)
        except Exception:
            pass

        # Klik avatar / ikon profil
        for attempt in range(3):
            try:
                clicked = driver.execute_script("""
                    const selectors = [
                        "button[data-testid*='user-menu']",
                        "button[data-testid*='avatar']",
                        "[aria-label*='akun' i]",
                        "[aria-label*='account' i]",
                        "[aria-label*='profile' i]",
                        "[data-testid*='user-avatar']"
                    ];
                    for (const s of selectors) {
                        const el = document.querySelector(s);
                        if (el) { el.click(); return true; }
                    }
                    const imgs = Array.from(document.querySelectorAll("button img, [role='button'] img"));
                    if (imgs.length) {
                        const btn = imgs[0].closest('button,[role="button"]');
                        if (btn) { btn.click(); return true; }
                    }
                    return false;
                """)
                if clicked:
                    break
            except Exception:
                pass
            time.sleep(0.8)

        time.sleep(1.0)

        # Klik "Buat Tim" / "Create a Team" dari menu profil
        for attempt in range(3):
            try:
                clicked = driver.execute_script("""
                    const btns = Array.from(document.querySelectorAll(
                        "button, a, [role='menuitem'], [role='option'], li, [role='button']"
                    ));
                    const b = btns.find(x => {
                        if (x.offsetParent === null) return false;
                        const t = (x.innerText || x.textContent || '').toLowerCase().trim();
                        return t.includes('buat tim') || t.includes('create a team') ||
                               t.includes('create team') || t.includes('new team');
                    });
                    if (b) { b.scrollIntoView({block:'center'}); b.click(); return true; }
                    return false;
                """)
                if clicked:
                    dev_log("[CREATE TEAM] Klik 'Buat Tim' berhasil.")
                    break
            except Exception:
                pass
            time.sleep(0.8)

        time.sleep(1.2)

    # ── STEP 2: Isi nama tim → klik Lanjutkan ─────────────────────────────────
    try:
        driver.execute_script("""
            const inps = Array.from(document.querySelectorAll("input[type='text'], input:not([type])"));
            const tInp = inps.find(i => {
                if (i.offsetParent === null) return false;
                const ph = (i.getAttribute('placeholder') || i.getAttribute('name') ||
                            i.getAttribute('aria-label') || '').toLowerCase();
                return ph.includes('tim') || ph.includes('team') || ph.includes('nama');
            });
            if (tInp) {
                tInp.focus();
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                if (setter) setter.call(tInp, 'Pro Studio'); else tInp.value = 'Pro Studio';
                tInp.dispatchEvent(new Event('input', {bubbles: true}));
                tInp.dispatchEvent(new Event('change', {bubbles: true}));
            }
        """)
        time.sleep(0.5)
    except Exception:
        pass

    # Klik tombol Lanjutkan / Buat Tim setelah isi nama
    try:
        driver.execute_script("""
            const btns = Array.from(document.querySelectorAll("button, [role='button']"));
            const b = btns.find(x => {
                if (x.disabled || x.offsetParent === null) return false;
                const t = (x.innerText || '').toLowerCase().trim();
                return t === 'lanjutkan' || t === 'berikutnya' || t === 'buat tim' ||
                       t === 'continue' || t === 'next' || t === 'create team';
            });
            if (b) { b.scrollIntoView({block:'center'}); b.click(); }
        """)
        time.sleep(1.2)
    except Exception:
        pass

    # ── STEP 3: Input email anggota tim (random gmail, nama manusia) ───────────
    _first_names = [
        "aditama", "bagas", "rizky", "dimas", "fahri", "galih", "hendra",
        "irwan", "joko", "kevin", "luthfi", "muhamad", "nanda", "oscar",
        "prasetyo", "rafi", "sandi", "taufik", "wahyu", "yusuf", "zainal",
        "budi", "candra", "dani", "eko", "ferry", "gilang", "hadi", "kiki"
    ]
    _last_parts = [
        "123", "456", "99", "2024", "007", "88", "21", "77", "101",
        "pratama", "putra", "santoso", "wijaya", "kurniawan", "saputra"
    ]
    _team_email = random.choice(_first_names) + random.choice(_last_parts) + "@gmail.com"

    email_filled = False
    try:
        email_filled = driver.execute_script("""
            const val = arguments[0];
            const inps = Array.from(document.querySelectorAll(
                "input[type='email'], input[type='text'], input[inputmode='email']"
            ));
            const eInp = inps.find(i => {
                if (i.offsetParent === null) return false;
                const ph = (i.getAttribute('placeholder') || i.getAttribute('aria-label') || '').toLowerCase();
                return ph.includes('email') || ph.includes('undang') ||
                       ph.includes('invite') || ph.includes('anggota');
            });
            if (eInp) {
                eInp.focus();
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                if (setter) setter.call(eInp, val); else eInp.value = val;
                // Trigger input & change agar React/Vue state Canva terupdate
                eInp.dispatchEvent(new Event('input', {bubbles: true}));
                eInp.dispatchEvent(new Event('change', {bubbles: true}));
                // JANGAN dispatch Enter di sini — biarkan Step 4 klik
                // "Aktifkan Paket dan Undang Tim" secara eksplisit
                eInp.dispatchEvent(new Event('blur', {bubbles: true}));
                return true;
            }
            return false;
        """, _team_email)
        if email_filled:
            dev_log(f"[CREATE TEAM] Input email anggota tim: {_team_email} (menunggu Step 4 klik tombol aktivasi)")
        time.sleep(1.0)  # beri waktu Canva reaktif update tombol
    except Exception:
        pass

    # Fallback: send_keys manual (tanpa ENTER — biarkan Step 4 klik tombol)
    if not email_filled:
        try:
            fields = driver.find_elements(
                By.CSS_SELECTOR,
                "input[type='email'], input[inputmode='email'], input[type='text']"
            )
            for ef in fields:
                try:
                    if not ef.is_displayed():
                        continue
                    ph = (ef.get_attribute("placeholder") or ef.get_attribute("aria-label") or "").lower()
                    if any(k in ph for k in ("email", "undang", "invite", "anggota")):
                        ef.clear()
                        slow_type(ef, _team_email, min_delay=0.02, max_delay=0.05)
                        # blur agar React state terupdate, JANGAN ENTER
                        try:
                            ef.send_keys(Keys.TAB)
                        except Exception:
                            pass
                        email_filled = True
                        dev_log(f"[CREATE TEAM] Input email via send_keys: {_team_email}")
                        break
                except Exception:
                    continue
        except Exception:
            pass

    time.sleep(0.8)

    # ── STEP 4: Klik "Aktifkan Paket dan Undang Tim" / "Berlangganan Sekarang" ─
    _activate_labels = [
        "aktifkan paket dan undang tim",
        "aktifkan paket",
        "aktifkan sekarang",
        "undang tim",
        "berlangganan sekarang",
        "mulai uji coba gratis",
        "dapatkan uji coba gratis",
        "coba gratis",
        "activate plan and invite team",
        "activate plan",
        "invite team",
        "subscribe now",
        "start free trial",
        "get free trial",
        "try for free",
        "upgrade now",
    ]
    activated = False
    for attempt in range(4):
        try:
            activated = driver.execute_script("""
                const labels = arguments[0];
                const btns = Array.from(document.querySelectorAll(
                    "button, [role='button'], input[type='submit'], a"
                ));
                for (const lbl of labels) {
                    const b = btns.find(x => {
                        if (x.disabled || x.offsetParent === null) return false;
                        const t = (x.innerText || x.textContent || x.value || '').toLowerCase().trim();
                        return t === lbl || t.includes(lbl);
                    });
                    if (b) {
                        b.scrollIntoView({block: 'center'});
                        b.click();
                        return (b.innerText || b.textContent || lbl).trim();
                    }
                }
                return null;
            """, _activate_labels)
            if activated:
                dev_log(Fore.GREEN + f"[CREATE TEAM] Tombol aktivasi diklik: '{activated}'")
                break
        except Exception:
            pass
        time.sleep(1.0)

    if activated:
        time.sleep(1.5)
        dev_log(Fore.GREEN + "[CREATE TEAM] Selesai → halaman payment akan terbuka.")
    else:
        dev_log(Fore.YELLOW + "[CREATE TEAM] Tombol 'Aktifkan Paket' tidak ditemukan — lanjut ke pricing page.")

    return True


def real_click_element(driver, el):
    """Klik elemen menggunakan CDP mouse click, pointer events, dan ActionChains."""
    if not el:
        return False
    try:
        driver.execute_script("arguments[0].scrollIntoView({block:'center', inline:'center'});", el)
        time.sleep(0.15)
        driver.execute_script("""
            const el = arguments[0];
            el.focus();
            ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evtType => {
                el.dispatchEvent(new MouseEvent(evtType, { bubbles: true, cancelable: true, view: window }));
            });
        """, el)
        time.sleep(0.05)
    except Exception:
        pass

    try:
        rect = driver.execute_script("""
            const r = arguments[0].getBoundingClientRect();
            return {x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height};
        """, el)
        if rect and rect.get("w", 0) > 2:
            x, y = float(rect["x"]), float(rect["y"])
            for ev_type in ("mouseMoved", "mousePressed", "mouseReleased"):
                driver.execute_cdp_cmd("Input.dispatchMouseEvent", {
                    "type": ev_type,
                    "x": x,
                    "y": y,
                    "button": "left",
                    "buttons": 1 if ev_type == "mousePressed" else 0,
                    "clickCount": 1,
                })
                time.sleep(0.03)
            return True
    except Exception:
        pass

    try:
        from selenium.webdriver.common.action_chains import ActionChains
        ActionChains(driver).move_to_element(el).pause(0.1).click().perform()
        return True
    except Exception:
        pass

    try:
        el.click()
        return True
    except Exception:
        pass
    return False


def click_lanjutkan_in_dom(driver):
    """
    Cari dan klik tombol ungu 'Lanjutkan' pada context frame saat ini.
    Menggunakan:
    1. XPath komprehensif (ancestor button, exact span, dialog button)
    2. Pure JavaScript Deep Scanner (dispatches synthetic events + retrieves coords)
    3. Hardware CDP Mouse Click + Selenium ActionChains
    """
    # 1. XPath komprehensif (hindari 'Lanjutkan dengan akun lain' / 'other')
    xpaths = [
        "//span[normalize-space()='Lanjutkan']/ancestor::button[not(contains(.,'lain')) and not(contains(.,'akun'))][1]",
        "//span[normalize-space()='Lanjutkan']/ancestor::*[@role='button'][not(contains(.,'lain')) and not(contains(.,'akun'))][1]",
        "//p[normalize-space()='Lanjutkan']/ancestor::button[not(contains(.,'lain')) and not(contains(.,'akun'))][1]",
        "//button[.//span[normalize-space()='Lanjutkan'] and not(contains(.,'lain')) and not(contains(.,'akun'))]",
        "//button[normalize-space()='Lanjutkan']",
        "//button[contains(.,'Lanjutkan') and not(contains(.,'lain')) and not(contains(.,'akun'))]",
        "//div[contains(@role,'dialog')]//button[not(contains(.,'lain')) and (contains(.,'Lanjutkan') or contains(.,'Continue'))]",
        "//button[normalize-space()='Continue']",
        "//span[normalize-space()='Continue']/ancestor::button[1]",
    ]
    for xp in xpaths:
        try:
            btns = driver.find_elements(By.XPATH, xp)
            for b in btns:
                rect = driver.execute_script(
                    "const r = arguments[0].getBoundingClientRect(); return (r.width > 15 && r.height > 10) ? {x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height} : null;",
                    b,
                )
                if rect:
                    t = (b.text or "").strip().lower()
                    if "lain" in t or "other" in t:
                        continue
                    dev_log(f"[REAUTH] Menemukan tombol 'Lanjutkan' via XPath ({xp})! Melakukan real CDP click...")
                    if real_click_element(driver, b):
                        return True
        except Exception:
            pass

    # 2. Pure JavaScript Deep Scanner
    try:
        clicked_info = driver.execute_script(r"""
            const isVis = el => {
                if (!el) return false;
                const r = el.getBoundingClientRect();
                return r.width > 15 && r.height > 10;
            };

            const allElements = Array.from(document.querySelectorAll("button, [role='button'], a, span, p, div, input[type='submit']"));
            for (const el of allElements) {
                const rawText = (el.innerText || el.textContent || el.value || '').trim();
                const t = rawText.toLowerCase();
                if (t.includes('lain') || t.includes('other') || t.includes('akun')) continue;
                if (t === 'lanjutkan' || t === 'continue' || t.startsWith('lanjutkan')) {
                    const btn = el.closest("button, [role='button'], a") || el;
                    if (isVis(btn)) {
                        btn.scrollIntoView({block: 'center', inline: 'center'});
                        btn.focus();
                        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
                            btn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
                        });
                        if (typeof btn.click === 'function') btn.click();
                        const r = btn.getBoundingClientRect();
                        return { x: r.left + r.width/2, y: r.top + r.height/2, text: rawText };
                    }
                }
            }
            return null;
        """)
        if clicked_info:
            dev_log(Fore.GREEN + Style.BRIGHT + f"[REAUTH] Berhasil klik tombol '{clicked_info.get('text', 'Lanjutkan')}' via JS Events!")
            try:
                x, y = float(clicked_info["x"]), float(clicked_info["y"])
                for ev_type in ("mouseMoved", "mousePressed", "mouseReleased"):
                    driver.execute_cdp_cmd("Input.dispatchMouseEvent", {
                        "type": ev_type,
                        "x": x,
                        "y": y,
                        "button": "left",
                        "buttons": 1 if ev_type == "mousePressed" else 0,
                        "clickCount": 1,
                    })
                    time.sleep(0.02)
            except Exception:
                pass
            return True
    except Exception:
        pass

    return False


def try_click_lanjutkan_everywhere(driver):
    """Cari tombol 'Lanjutkan' di Main Document dan di semua iframe (rekursif)."""
    # 1. Main Document
    try:
        driver.switch_to.default_content()
        if click_lanjutkan_in_dom(driver):
            return True
    except Exception:
        pass

    # 2. Check each IFRAME (tanpa skip is_displayed karena modal fixed/portal)
    try:
        driver.switch_to.default_content()
        iframes = driver.find_elements(By.TAG_NAME, "iframe")
        for iframe in iframes:
            try:
                driver.switch_to.default_content()
                driver.switch_to.frame(iframe)
                if click_lanjutkan_in_dom(driver):
                    driver.switch_to.default_content()
                    return True

                sub_iframes = driver.find_elements(By.TAG_NAME, "iframe")
                for sub in sub_iframes:
                    try:
                        driver.switch_to.frame(sub)
                        if click_lanjutkan_in_dom(driver):
                            driver.switch_to.default_content()
                            return True
                    except Exception:
                        pass
                    finally:
                        driver.switch_to.default_content()
                        driver.switch_to.frame(iframe)
            except Exception:
                continue
    except Exception:
        pass
    finally:
        try:
            driver.switch_to.default_content()
        except Exception:
            pass

    return False


def click_modal_lanjutkan_button(driver):
    """Mengeklik tombol ungu 'Lanjutkan' di manapun berada."""
    return try_click_lanjutkan_everywhere(driver)


def is_otp_input_present_everywhere(driver):
    """Cek apakah ada field input OTP di Main Document atau di sembarang iframe."""
    def _check():
        return driver.execute_script(r"""
            const isVis = el => {
                if (!el) return false;
                const r = el.getBoundingClientRect();
                return r.width > 20 && r.height > 10;
            };
            const inputs = Array.from(document.querySelectorAll("input"));
            return inputs.some(i => {
                if (i.disabled || !isVis(i)) return false;
                const ph = (i.placeholder || '').toLowerCase();
                const nm = (i.name || '').toLowerCase();
                const ac = (i.getAttribute('autocomplete') || '').toLowerCase();
                const id = (i.id || '').toLowerCase();
                const aria = (i.getAttribute('aria-label') || '').toLowerCase();
                const desc = (i.getAttribute('aria-describedby') || '').toLowerCase();

                // Abaikan input kartu kredit, expiry date, CVC, postal code, address
                if (ac.includes('cc-') || ac.includes('postal') || ac.includes('address') ||
                    nm.includes('card') || nm.includes('exp') || nm.includes('cvc') ||
                    id.includes('card') || id.includes('tokenex') || desc.includes('expiry') ||
                    ph.includes('kartu') || ph.includes('card') || ph.includes('cvc') || ph.includes('bb/tt') || ph.includes('mm/yy')) {
                    return false;
                }

                return ph.includes('kode') || ph.includes('code') || nm.includes('code') || 
                       nm.includes('otp') || id.includes('otp') || aria.includes('otp') || aria.includes('kode') || ac === 'one-time-code';
            });
        """)

    try:
        driver.switch_to.default_content()
        if _check():
            return True
    except Exception:
        pass

    try:
        driver.switch_to.default_content()
        iframes = driver.find_elements(By.TAG_NAME, "iframe")
        for iframe in iframes:
            try:
                driver.switch_to.default_content()
                driver.switch_to.frame(iframe)
                if _check():
                    driver.switch_to.default_content()
                    return True
            except Exception:
                continue
    except Exception:
        pass
    finally:
        try:
            driver.switch_to.default_content()
        except Exception:
            pass

    return False


def is_otp_modal_present(driver):
    """
    Cek secara akurat apakah modal 'Selesaikan proses masuk' (OTP ke-3) sedang aktif di layar.
    """
    try:
        driver.switch_to.default_content()
        return driver.execute_script(r"""
            const t = (document.body.innerText || '').toLowerCase();
            if (t.includes('selesaikan proses masuk') || 
                t.includes('masukkan kode yang kami kirim') || 
                t.includes('masukkan kode verifikasi anda') ||
                (t.includes('masukkan kode') && (t.includes('kirim ulang') || t.includes('kata sandi')))) {
                return true;
            }
            const dlg = document.querySelector("div[role='dialog']");
            if (dlg) {
                const dt = (dlg.innerText || '').toLowerCase();
                if (dt.includes('selesaikan proses masuk') || dt.includes('masukkan kode')) {
                    return true;
                }
            }
            return false;
        """) or is_otp_input_present_everywhere(driver)
    except Exception:
        return False


def try_fill_otp_everywhere(driver, otp_code):
    """
    Cari input field OTP di Main Document atau iframe dan isi dengan engine type_otp.
    Mendukung 6 kotak terpisah (multi-input) maupun 1 input field (numeric/code).
    """
    # 1. Main Document via type_otp
    try:
        driver.switch_to.default_content()
        if type_otp(driver, otp_code, timeout=5):
            return True
    except Exception as e:
        dev_log(f"type_otp di Main Document gagal: {clean_err_msg(e)}", "debug")

    # 2. Main Document via direct JS
    try:
        driver.switch_to.default_content()
        filled_js = driver.execute_script("""
            const code = arguments[0];
            const inps = Array.from(document.querySelectorAll("input")).filter(i => {
                const s = window.getComputedStyle(i);
                if (s.display === 'none' || s.visibility === 'hidden' || i.offsetWidth === 0) return false;
                const ph = (i.placeholder || '').toLowerCase();
                const nm = (i.name || '').toLowerCase();
                const ac = (i.getAttribute('autocomplete') || '').toLowerCase();
                const id = (i.id || '').toLowerCase();
                return ph.includes('kode') || ph.includes('code') || nm.includes('code') || nm.includes('otp') || id.includes('otp') || ac === 'one-time-code' || i.closest("div[role='dialog']") !== null;
            });
            if (inps.length > 0) {
                const el = inps[0];
                el.focus();
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                if (setter) setter.call(el, code); else el.value = code;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
                return true;
            }
            return false;
        """, str(otp_code))
        if filled_js:
            return True
    except Exception:
        pass

    # 3. Check each IFRAME
    try:
        driver.switch_to.default_content()
        iframes = driver.find_elements(By.TAG_NAME, "iframe")
        for iframe in iframes:
            try:
                driver.switch_to.default_content()
                driver.switch_to.frame(iframe)
                if type_otp(driver, otp_code, timeout=3):
                    driver.switch_to.default_content()
                    return True
            except Exception:
                continue
    except Exception:
        pass
    finally:
        try:
            driver.switch_to.default_content()
        except Exception:
            pass

    return False


def submit_reauth_modal(driver):
    """
    Submit form OTP / Reauth dengan mengeklik tombol 'Lanjutkan' / 'Continue' yang aktif (tidak disabled).
    Melakukan JS dispatch event, Hardware CDP click, dan ActionChains.
    """
    for attempt in range(1, 6):
        try:
            driver.switch_to.default_content()
            res = driver.execute_script(r"""
                const isVis = el => {
                    if (!el) return false;
                    const r = el.getBoundingClientRect();
                    return r.width > 20 && r.height > 10;
                };

                const btns = Array.from(document.querySelectorAll("button, [role='button'], input[type='submit']"));
                const target = btns.find(b => {
                    if (b.disabled || !isVis(b)) return false;
                    const t = (b.innerText || b.textContent || b.value || '').trim().toLowerCase();
                    if (t.includes('lain') || t.includes('other') || t.includes('sandi') || t.includes('bantuan')) return false;
                    return t === 'lanjutkan' || t === 'continue' || t === 'submit' || t === 'verifikasi' || t.startsWith('lanjutkan');
                });

                if (target) {
                    target.scrollIntoView({block: 'center', inline: 'center'});
                    target.focus();
                    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
                        target.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
                    });
                    if (typeof target.click === 'function') target.click();
                    const rect = target.getBoundingClientRect();
                    return {
                        status: "CLICKED",
                        x: rect.left + rect.width / 2,
                        y: rect.top + rect.height / 2,
                        text: (target.innerText || target.textContent || '').trim()
                    };
                }

                // Cek form submit jika ada
                const form = document.querySelector("form");
                if (form) {
                    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    return { status: "FORM_SUBMITTED" };
                }

                return null;
            """)

            if isinstance(res, dict) and res.get("status") in ("CLICKED", "FORM_SUBMITTED"):
                dev_log(Fore.GREEN + Style.BRIGHT + f"[REAUTH] Tombol submit '{res.get('text', 'Lanjutkan')}' berhasil diklik!")
                if "x" in res and "y" in res:
                    try:
                        x, y = float(res["x"]), float(res["y"])
                        for ev_type in ("mouseMoved", "mousePressed", "mouseReleased"):
                            driver.execute_cdp_cmd("Input.dispatchMouseEvent", {
                                "type": ev_type,
                                "x": x,
                                "y": y,
                                "button": "left",
                                "buttons": 1 if ev_type == "mousePressed" else 0,
                                "clickCount": 1,
                            })
                            time.sleep(0.02)
                    except Exception:
                        pass
                return True

            # Fallback kirim Keys.ENTER pada active element
            try:
                driver.switch_to.active_element.send_keys(Keys.ENTER)
            except Exception:
                pass

        except Exception as e:
            dev_log(Fore.YELLOW + f"[WARN] Submit attempt {attempt} error: {e}")

        time.sleep(0.6)

    return False


def try_use_password_fallback_on_reauth(driver, password):
    """
    Jika OTP 3 tidak kunjung masuk di email, klik opsi 'Masukkan kata sandi saya'
    pada modal 'Selesaikan proses masuk' (lihat UI Canva) dan isi kata sandi.
    """
    pwd = password or PASSWORD or "Masuk123!"
    try:
        driver.switch_to.default_content()
        clicked_pwd_opt = driver.execute_script(r"""
            const btns = Array.from(document.querySelectorAll("button, [role='button'], a, span, p"));
            const opt = btns.find(b => {
                const t = (b.innerText || b.textContent || '').trim().toLowerCase();
                return t.includes('masukkan kata sandi') || t.includes('enter password') || t.includes('use password');
            });
            if (opt) {
                const clickTarget = opt.closest('button, [role="button"]') || opt;
                clickTarget.scrollIntoView({block:'center'});
                clickTarget.click();
                return true;
            }
            return false;
        """)
        if clicked_pwd_opt:
            dev_log(Fore.CYAN + Style.BRIGHT + "[REAUTH] Mengalihkan ke opsi 'Masukkan kata sandi saya'...")
            time.sleep(1.5)
            # Isi input password
            pwd_inp = WebDriverWait(driver, 6).until(
                EC.visibility_of_element_located((By.CSS_SELECTOR, "input[type='password']"))
            )
            pwd_inp.clear()
            slow_type(pwd_inp, pwd, min_delay=0.01, max_delay=0.03)
            time.sleep(0.5)
            pwd_inp.send_keys(Keys.ENTER)
            time.sleep(2.0)
            submit_reauth_modal(driver)
            dev_log(Fore.GREEN + Style.BRIGHT + "[REAUTH] [✓] Berhasil submit kata sandi reauth akun!")
            return True
    except Exception as e:
        dev_log(Fore.YELLOW + f"[REAUTH] Fallback password error: {e}")
    return False


def resolve_login_reauth_modal(driver, wait=None, email_info=None, password=None, seen_otps=None, max_retries=15):
    """
    Menangani alur autentikasi sesi / step-up auth Canva:
    1. Modal 'Lanjutkan kembali!' -> Klik tombol ungu 'Lanjutkan' di Main DOM atau iframe secara aktif.
    2. Modal 'Selesaikan proses masuk' -> Baca OTP ke-3 via wait_for_otp (purpose='reauth') -> input kode -> klik 'Lanjutkan'.
       PENTING: JANGAN klik 'Lanjutkan' sebelum kode OTP ke-3 diisikan!
    3. Loop sampai modal benar-benar tertutup dan halaman checkout/harga terbuka.
    """
    pwd = password or PASSWORD or "Masuk123!"
    email_target = ""
    if isinstance(email_info, dict):
        email_target = email_info.get("email", "")
    elif email_info:
        email_target = str(email_info)

    if seen_otps is None:
        seen_otps = set()

    for attempt in range(1, max_retries + 1):
        try:
            driver.switch_to.default_content()

            # 1. CEK TAHAP 2: Modal 'Selesaikan proses masuk' / Permintaan OTP ke-3
            # Prioritas TERTINGGI: Jika terdeteksi modal OTP ke-3, WAJIB ambil dan isi OTP dulu!
            if is_otp_modal_present(driver) or is_otp_input_present_everywhere(driver):
                dev_log(Fore.CYAN + Style.BRIGHT + f"[REAUTH FLOW] ({attempt}/{max_retries}) Modal 'Selesaikan proses masuk' meminta kode OTP ke-3 untuk {email_target or 'akun'}...")
                account_payload = email_info if isinstance(email_info, dict) else {"email": email_target}
                
                otp_data = wait_for_otp(
                    account_payload,
                    timeout_sec=55,
                    interval_sec=2,
                    exclude_otp=seen_otps,
                    purpose="reauth",
                )
                if otp_data:
                    current_otp = otp_data["otp"] if isinstance(otp_data, dict) else str(otp_data)
                    dev_log(Fore.GREEN + Style.BRIGHT + f"[REAUTH FLOW] [✓] Kode OTP ke-3 diterima dari email: {current_otp}")
                    seen_otps.add(str(current_otp))

                    # Isi kode ke field input OTP
                    filled = try_fill_otp_everywhere(driver, current_otp)
                    if filled:
                        dev_log(Fore.GREEN + f"[REAUTH FLOW] Kode OTP {current_otp} berhasil diisikan ke input field!")

                    time.sleep(1.0)
                    dev_log(Fore.CYAN + Style.BRIGHT + "[REAUTH FLOW] Mengeklik tombol 'Lanjutkan' untuk submit OTP ke-3...")
                    submit_reauth_modal(driver)
                    time.sleep(3.0)
                    dismiss_browser_popups(driver)

                    if detect_otp_failure(driver):
                        dev_log(Fore.YELLOW + f"[REAUTH FLOW] Kode OTP {current_otp} ditolak/kedaluwarsa! Mencoba kata sandi...")
                        try_use_password_fallback_on_reauth(driver, pwd)
                    continue
                else:
                    # Fallback jika OTP tidak masuk dalam timeout: klik 'Masukkan kata sandi saya'
                    dev_log(Fore.YELLOW + "[REAUTH FLOW] OTP ke-3 belum masuk. Mencoba opsi 'Masukkan kata sandi saya'...")
                    try_use_password_fallback_on_reauth(driver, pwd)
                    time.sleep(2.5)
                    continue

            # 2. CEK TAHAP 1: Modal 'Lanjutkan kembali!' (SEBELUM OTP - HANYA jika BUKAN modal input OTP)
            is_lanjutkan_kembali = driver.execute_script(r"""
                const t = (document.body.innerText || '').toLowerCase();
                return t.includes('lanjutkan kembali') || t.includes('konfirmasi akun anda') || t.includes('sebelum melanjutkan');
            """)
            if is_lanjutkan_kembali:
                clicked = try_click_lanjutkan_everywhere(driver)
                if clicked:
                    dev_log(f"[REAUTH FLOW] Berhasil klik tombol ungu 'Lanjutkan' pada modal 'Lanjutkan kembali!' (attempt {attempt}/{max_retries})")
                    time.sleep(2.5)
                    dismiss_browser_popups(driver)
                    continue

            # 3. CEK INPUT PASSWORD JIKA DIMINTA
            try:
                driver.switch_to.default_content()
                pwd_inputs = [i for i in driver.find_elements(By.CSS_SELECTOR, "input[type='password']") if i.is_displayed()]
                if pwd_inputs:
                    dev_log(Fore.CYAN + f"[REAUTH FLOW] Mengisi input password konfirmasi akun...")
                    pwd_inputs[0].clear()
                    slow_type(pwd_inputs[0], pwd, min_delay=0.01, max_delay=0.04)
                    time.sleep(0.5)
                    pwd_inputs[0].send_keys(Keys.ENTER)
                    time.sleep(3.0)
                    dismiss_browser_popups(driver)
                    continue
            except Exception:
                pass

            # 4. CEK APAKAH MODAL BENAR-BENAR SUDAH SELESAI DAN CHECKOUT SIAP
            has_reauth_still = driver.execute_script(r"""
                const t = (document.body.innerText || '').toLowerCase();
                return t.includes('selesaikan proses masuk') || 
                       t.includes('lanjutkan kembali') || 
                       t.includes('masukkan kode yang kami kirim');
            """) or is_otp_input_present_everywhere(driver)

            if not has_reauth_still:
                checkout_ready = driver.execute_script("""
                    const t = (document.body.innerText || '').toLowerCase();
                    const hasPlan = t.includes('bulanan') || t.includes('tahunan') || t.includes('berikutnya');
                    const hasPay = t.includes('kartu kredit') || t.includes('credit card') || document.querySelector('iframe[src*="tokenex"]') !== null || document.querySelector('iframe[src*="subscribe"]') !== null;
                    return hasPlan || hasPay;
                """)
                if checkout_ready:
                    dev_log("[REAUTH FLOW] Modal re-autentikasi telah selesai dan checkout sudah siap!")
                    return True

        except Exception as e:
            dev_log(Fore.YELLOW + f"[WARN] Reauth attempt {attempt} error: {clean_err_msg(e)}")

        time.sleep(1.0)

    return True


def handle_reauth_after_trial_click(driver, wait, email_info, password=None, seen_otps=None):
    """
    Eksekusi penanganan modal 'Lanjutkan kembali!' & 'Selesaikan proses masuk' pasca klik trial.
    Mendeteksi apakah akun diminta OTP ke-3 atau password reauth.
    Jika ada modal 'Selesaikan proses masuk' atau input OTP, WAJIB diselesaikan terlebih dahulu.
    """
    time.sleep(1.0)
    driver.switch_to.default_content()

    # Tunggu beberapa detik untuk kemunculan modal session (sering ada jeda 1-2 detik setelah klik trial)
    has_reauth = False
    for _ in range(5):
        has_reauth = driver.execute_script(r"""
            const t = (document.body.innerText || '').toLowerCase();
            return t.includes('selesaikan proses masuk') || 
                   t.includes('lanjutkan kembali') || 
                   t.includes('masukkan kata sandi') || 
                   t.includes('masukkan kode yang kami kirim');
        """) or is_otp_modal_present(driver) or is_otp_input_present_everywhere(driver)
        if has_reauth:
            break
        time.sleep(0.8)

    if not has_reauth:
        is_checkout_open = driver.execute_script("""
            const t = (document.body.innerText || '').toLowerCase();
            return t.includes('tinjau uji coba') || t.includes('berikutnya') || t.includes('kartu kredit');
        """)
        if is_checkout_open:
            dev_log(Fore.GREEN + "[SESI KRITIS] Tidak ada modal reauth — langsung menuju pemilihan paket.")
            return True
        dev_log(Fore.GREEN + "[SESI KRITIS] Bebas reauth sesi — lanjut ke checkout.")
        return True

    # 2. JIKA TERDETEKSI REAUTH (Lanjutkan kembali / OTP Ke-3):
    dev_log(Fore.CYAN + Style.BRIGHT + "\n[SESI KRITIS] Terdeteksi modal re-autentikasi sesi! Memproses verifikasi...")
    return resolve_login_reauth_modal(driver, wait=wait, email_info=email_info, password=password, seen_otps=seen_otps, max_retries=15)



def handle_lanjutkan_kembali_session(driver, password=None):
    """Alias kompatibilitas untuk resolve_login_reauth_modal."""
    return resolve_login_reauth_modal(driver, password=password)


def open_business_trial_harga_id(driver, wait=None, email_info=None, password=None, seen_otps=None):
    """
    Poin 3 flow terbaru: Buka https://www.canva.com/id_id/harga/ dan pilih Canva Bisnis trial 0 rupiah.
    Dilengkapi deteksi modal session 'Lanjutkan kembali!' & 'Selesaikan proses masuk' (OTP ke-3 / kata sandi) secara tuntas.
    """
    dev_log("[POIN 3] Membuka halaman harga Canva Bisnis trial 0 rupiah")

    target_url = PRICING_URL or "https://www.canva.com/id_id/harga/"
    driver.get(target_url)
    time.sleep(3.5)
    dismiss_browser_popups(driver)

    # Deteksi jika ada modal session flow sebelum scroll
    resolve_login_reauth_modal(driver, wait=wait, email_info=email_info, password=password, seen_otps=seen_otps)

    # Scroll perlahan agar card harga ter-load
    for sp in [400, 800, 1200]:
        driver.execute_script(f"window.scrollTo(0, {sp});")
        time.sleep(0.5)

    # Klik tombol trial di card Canva Bisnis (HANYA Canva Bisnis / Canva untuk Tim — STRICT EXCLUDE Canva Pro!)
    clicked = driver.execute_script(r"""
        const isVis = el => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            return r.width > 20 && r.height > 15;
        };

        // 1. Cari card yang memuat kata bisnis / tim dan bukan cuma pro
        const allCards = Array.from(document.querySelectorAll('div, section, article'));
        const bizCards = allCards.filter(c => {
            const t = (c.innerText || '').toLowerCase();
            return (t.includes('canva bisnis') || t.includes('canva untuk tim') || (t.includes('bisnis') && !t.includes('canva pro')))
                && (t.includes('uji coba') || t.includes('coba gratis') || t.includes('rp 0') || t.includes('0 rupiah') || t.includes('trial'));
        });

        // Urutkan dari elemen dengan teks terpendek agar dapat card terdalam/paling spesifik
        bizCards.sort((a, b) => a.innerText.length - b.innerText.length);
        for (const card of bizCards) {
            const btn = Array.from(card.querySelectorAll('button, a')).find(b => {
                if (b.disabled || !isVis(b)) return false;
                const bt = (b.innerText || b.textContent || '').toLowerCase().trim();
                return (bt.includes('coba canva') || bt.includes('coba gratis') || bt.includes('mulai uji coba') || bt.includes('uji coba') || bt.includes('trial')) && !bt.includes('pro');
            });
            if (btn) {
                btn.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'});
                btn.focus();
                btn.click();
                return 'biz_card_button';
            }
        }

        // 2. Direct button pencarian spesifik: 'Coba Canva Bisnis' atau 'Coba Canva untuk Tim' (TIDAK menyentuh Canva Pro)
        const allBtns = Array.from(document.querySelectorAll('button, a'));
        const directBizBtn = allBtns.find(b => {
            if (b.disabled || !isVis(b)) return false;
            const bt = (b.innerText || b.textContent || '').toLowerCase().trim();
            return (bt.includes('coba canva bisnis') || bt.includes('coba canva untuk tim') || (bt.includes('bisnis') && bt.includes('coba'))) && !bt.includes('pro');
        });
        if (directBizBtn) {
            directBizBtn.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'});
            directBizBtn.focus();
            directBizBtn.click();
            return 'direct_biz_trial_button';
        }
        return false;
    """)

    if clicked:
        dev_log(f"[INFO] Klik trial Canva Bisnis berhasil via {clicked}!")
    else:
        dev_log(Fore.YELLOW + "[WARN] Tombol trial Bisnis di card tidak ditemukan via DOM scanner, mencoba klik teks langsung...")
        try_click_texts(driver, [
            "Coba Canva Bisnis",
            "Coba Canva untuk Tim",
            "Mulai uji coba gratis Canva Bisnis",
        ], timeout=2.5)

    time.sleep(2.0)
    dismiss_browser_popups(driver)

    # *** DETEKSI & SELESAIKAN MODAL REAUTH (Lanjutkan kembali! & Selesaikan proses masuk) ***
    handle_reauth_after_trial_click(driver, wait=wait, email_info=email_info, password=password, seen_otps=seen_otps)

    # Jika setelah konfirmasi session modal harga / form pembayaran belum terbuka, klik tombol trial sekali lagi
    form_or_modal_ready = driver.execute_script("""
        const t = (document.body.innerText || '').toLowerCase();
        const hasPlan = t.includes('bulanan') || t.includes('tahunan') || t.includes('berikutnya');
        const hasPay = t.includes('kartu kredit') || t.includes('credit card') || document.querySelector('iframe[src*="tokenex"], iframe[src*="subscribe"]') !== null;
        return hasPlan || hasPay;
    """)
    if not form_or_modal_ready:
        dev_log(Fore.CYAN + "[TRIAL FLOW] Mengklik ulang tombol uji coba Canva Bisnis setelah re-autentikasi...")
        driver.execute_script(r"""
            const allBtns = Array.from(document.querySelectorAll('button, a'));
            const b = allBtns.find(x => {
                const t = (x.innerText || x.textContent || '').toLowerCase().trim();
                return (t.includes('coba canva bisnis') || t.includes('coba canva untuk tim') || (t.includes('bisnis') && t.includes('coba'))) && !t.includes('pro');
            });
            if (b && b.offsetParent !== null) { b.click(); }
        """)
        time.sleep(2.5)

    # Tangani dialog survei pekerjaan jika muncul
    try:
        driver.execute_script("""
            const btns = Array.from(document.querySelectorAll('button'));
            const b = btns.find(x => {
                const t = (x.innerText || '').toLowerCase();
                return t.includes('pekerjaan') || t.includes('bisnis') || t.includes('work');
            });
            if (b) { b.click(); }
        """)
        time.sleep(0.8)
    except Exception:
        pass

    # Pastikan opsi Bulanan (Monthly Rp 0) terpilih jika belum di layar pembayaran
    step_select_monthly_then_next(driver)
    time.sleep(0.5)

    # Pilih opsi 'Kartu kredit atau debit'
    dev_log(Fore.CYAN + Style.BRIGHT + "\n[TRIAL FLOW] Memilih opsi 'Kartu kredit atau debit'...")
    select_credit_card_option(driver)

    return True



def check_free_trial_badge_present(driver):
    """
    Cek apakah tombol '👑 Coba gratis selama 30 hari' / 'Coba Canva Pro' / 'Coba gratis' masih ada di layar.
    Jika masih ada, akun BELUM berhasil berlangganan / trial belum aktif!
    """
    try:
        driver.switch_to.default_content()
        return driver.execute_script("""
            const allEls = Array.from(document.querySelectorAll('button, a, span, div'));
            return allEls.some(el => {
                const t = (el.innerText || el.textContent || '').trim().toLowerCase();
                return t.includes('coba gratis selama 30 hari') ||
                       t.includes('coba canva pro') ||
                       (t.includes('coba gratis') && t.includes('30 hari')) ||
                       t === 'coba gratis' ||
                       t === 'try canva pro' ||
                       t.includes('try for 30 days');
            });
        """)
    except Exception:
        return False


def check_canva_subscription_api(driver):
    """
    Query Canva internal API untuk memeriksa apakah subscription Canva Bisnis / Pro aktif:
    1. GET /_ajax/features/featurebundles -> {"A":{...},"B":["BUS1"]} -> BUS1 = Canva Bisnis!
    2. Cek window internal store / capabilities Canva
    """
    try:
        is_active = driver.execute_script(r"""
            return (async () => {
                try {
                    const res = await fetch('/_ajax/features/featurebundles', {
                        headers: { 'accept': 'application/json' }
                    });
                    const text = await res.text();
                    const clean = text.replace(/^\)]}'\n/, '');
                    const data = JSON.parse(clean);
                    const bundles = data.B || [];
                    if (bundles.includes('BUS1') || bundles.some(b => b.startsWith('BUS') || b.startsWith('PRO'))) {
                        return true;
                    }
                } catch(e) {}

                try {
                    const state = window.__INITIAL_STATE__ || {};
                    const str = JSON.stringify(state).toLowerCase();
                    if (str.includes('canva:business') || str.includes('"bus1"') || str.includes('canva business')) {
                        return true;
                    }
                } catch(e2) {}

                return false;
            })();
        """)
        if is_active:
            return True
    except Exception:
        pass
    return False


def verify_business_active_dashboard(driver):
    """
    Poin 7 flow terbaru: Deteksi beranda di akhir bahwa Canva Bisnis aktif.
    PASTIKAN bahwa tombol '👑 Coba gratis selama 30 hari' BENAR-BENAR HILANG!
    """
    dev_log("Step checkpoint")
    try:
        driver.switch_to.default_content()
        curr_text = (driver.find_element(By.TAG_NAME, "body").text or "").lower()
        curr_url = (driver.current_url or "").lower()
        if "bisnis" in curr_text and ("/menu" in curr_url or "canva.com" in curr_url):
            dev_log(Fore.GREEN + Style.BRIGHT + f"[✓] Halaman saat ini mengonfirmasi Canva Bisnis AKTIF: {driver.current_url}")
            return True
    except Exception:
        pass

    try:
        driver.switch_to.default_content()
        driver.get("https://www.canva.com/")
        time.sleep(3.5)
        dismiss_browser_popups(driver)
    except Exception:
        pass

    # 1. Cek query subscription API internal Canva
    if check_canva_subscription_api(driver):
        dev_log(Fore.GREEN + Style.BRIGHT + "[✓] Canva Subscription API mengonfirmasi paket Bisnis AKTIF!")
        return True

    # 2. Cek halaman billing settings untuk konfirmasi
    try:
        driver.get("https://www.canva.com/settings/billing-and-teams")
        time.sleep(3.0)
        page_billing = (driver.page_source or "").lower()
        if "canva bisnis" in page_billing and ("aktif" in page_billing or "uji coba" in page_billing or "langganan" in page_billing or "trial" in page_billing):
            dev_log(Fore.GREEN + Style.BRIGHT + "[✓] Konfirmasi: Canva Bisnis aktif di halaman penagihan!")
            driver.get("https://www.canva.com/")
            time.sleep(1.5)
            return True
    except Exception:
        pass

    # 3. Cek beranda kembali
    driver.switch_to.default_content()
    curr_url = (driver.current_url or "").lower()
    page_title = (driver.title or "").lower()
    if "/create-new" in curr_url or "/menu" in curr_url or "beranda" in page_title:
        dev_log(Fore.GREEN + Style.BRIGHT + f"[✓] Beranda aktif terdeteksi: {driver.current_url}")
        return True

    if not check_free_trial_badge_present(driver):
        dev_log(Fore.GREEN + Style.BRIGHT + "[✓] Tombol CTA uji coba gratis sudah hilang dari beranda!")
        return True

    return False


def step_open_canva_business_trial(driver, wait=None):
    """Alias kompatibilitas untuk membuka Canva Bisnis trial 0 rupiah."""
    return open_business_trial_harga_id(driver)



def dismiss_browser_popups(driver):
    """
    Tutup popup Chrome (Save password, dll) yang menghalangi klik Berikutnya.
    """
    # Tombol di password manager / bubble browser
    for label in (
        "No, thanks",
        "Never",
        "Not now",
        "Jangan pernah",
        "Nanti",
        "Tidak",
        "Close",
        "OK",
    ):
        try:
            hit = try_click_texts(driver, [label], timeout=0.6, partial=False)
            if hit:
                dev_log(f"[INFO] Tutup popup browser: {hit}")
                time.sleep(0.5)
                return True
        except Exception:
            pass
    # Escape
    try:
        from selenium.webdriver.common.keys import Keys
        driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
        time.sleep(0.3)
    except Exception:
        pass
    return False


def _cdp_real_click(driver, el):
    """
    Klik seperti mouse manusia via Chrome DevTools Protocol.
    Sering berhasil di tombol React Canva yang mengabaikan el.click().
    """
    try:
        driver.execute_script(
            "arguments[0].scrollIntoView({block:'center', inline:'center'});", el
        )
        time.sleep(0.25)
        rect = driver.execute_script(
            """
            const r = arguments[0].getBoundingClientRect();
            return {x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height};
            """,
            el,
        )
        if not rect or rect.get("w", 0) < 2 or rect.get("h", 0) < 2:
            return False
        x, y = float(rect["x"]), float(rect["y"])
        for ev_type in ("mouseMoved", "mousePressed", "mouseReleased"):
            payload = {
                "type": ev_type,
                "x": x,
                "y": y,
                "button": "left",
                "buttons": 1 if ev_type == "mousePressed" else 0,
                "clickCount": 1,
            }
            driver.execute_cdp_cmd("Input.dispatchMouseEvent", payload)
            time.sleep(0.05)
        return True
    except Exception as e:
        dev_log(f"[WARN] CDP click gagal: {e}")
        return False


def _actionchains_click(driver, el):
    try:
        from selenium.webdriver.common.action_chains import ActionChains
        driver.execute_script(
            "arguments[0].scrollIntoView({block:'center'});", el
        )
        time.sleep(0.2)
        ActionChains(driver).move_to_element(el).pause(0.15).click().perform()
        return True
    except Exception as e:
        dev_log(f"[WARN] ActionChains click gagal: {e}")
        return False


def _find_berikutnya_buttons(driver):
    """
    Cari tombol submit/Berikutnya/Next/Continue di modal bayar Canva.
    """
    xpaths = [
        # Exact struktur user (Tinjau uji coba gratis Anda / Berikutnya / Next / Continue / Lanjutkan)
        "//button[@type='submit' and .//span[contains(@class,'khPe7Q') and (contains(normalize-space(),'Tinjau') or contains(normalize-space(),'Berikutnya') or contains(normalize-space(),'Next') or contains(normalize-space(),'Continue') or contains(normalize-space(),'Lanjutkan'))]]",
        "//button[@type='submit']/span[contains(normalize-space(),'Tinjau') or contains(normalize-space(),'Berikutnya') or contains(normalize-space(),'Next') or contains(normalize-space(),'Continue') or contains(normalize-space(),'Lanjutkan')]/parent::button",
        "//span[contains(normalize-space(),'Tinjau') or contains(normalize-space(),'Berikutnya') or contains(normalize-space(),'Next') or contains(normalize-space(),'Continue') or contains(normalize-space(),'Lanjutkan')]/ancestor::button[1]",
        "//button[@type='submit' and (contains(normalize-space(.),'Tinjau') or contains(normalize-space(.),'Berikutnya') or contains(normalize-space(.),'Next') or contains(normalize-space(.),'Continue') or contains(normalize-space(.),'Lanjutkan'))]",
        "//button[.//span[contains(normalize-space(),'Tinjau') or contains(normalize-space(),'Berikutnya') or contains(normalize-space(),'Next') or contains(normalize-space(),'Continue') or contains(normalize-space(),'Lanjutkan')]]",
        "//button[contains(normalize-space(),'Tinjau uji coba') or contains(normalize-space(),'Berikutnya') or contains(normalize-space(),'Next') or contains(normalize-space(),'Continue') or contains(normalize-space(),'Lanjutkan')]",
        "//button[@type='submit']",
    ]
    found = []
    seen = set()
    for xp in xpaths:
        try:
            for el in driver.find_elements(By.XPATH, xp):
                try:
                    id_el = id(el)
                    if id_el in seen:
                        continue
                    seen.add(id_el)
                    # disabled?
                    if el.get_attribute("aria-disabled") == "true":
                        continue
                    dis = el.get_attribute("disabled")
                    if dis is not None and dis != "false":
                        continue
                    found.append(el)
                except Exception:
                    continue
        except Exception:
            continue
    # CSS fallback
    try:
        for el in driver.find_elements(By.CSS_SELECTOR, "button[type='submit']"):
            try:
                txt = (el.text or "").strip().lower()
                if "berikutnya" in txt or "next" in txt or "continue" in txt:
                    found.append(el)
            except Exception:
                continue
    except Exception:
        pass
    return found


def handle_subscribe_widget_flow(driver, max_steps=8):
    """
    Menangani seluruh flow modal di dalam iframe subscribe_widget:
    1) Dismiss 'Jump back in!' -> klik Continue
    2) Plan selection ('Try Canva Business for free') -> klik Next / Berikutnya
    3) Payment method -> klik 'Credit or debit card' / 'Kartu kredit atau debit'
    """
    dev_log(Fore.CYAN + "[INFO] Menjalankan handle_subscribe_widget_flow (pemeriksaan iframe)...")
    for step in range(max_steps):
        driver.switch_to.default_content()
        iframes = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")
        if not iframes:
            iframes = driver.find_elements(By.TAG_NAME, "iframe")

        handled = False
        for frame in iframes:
            try:
                if not frame.is_displayed():
                    continue
                driver.switch_to.default_content()
                driver.switch_to.frame(frame)

                # 0) Password Re-authentication di subscribe_widget iframe
                try:
                    pwd_els = driver.find_elements(By.CSS_SELECTOR, "input[type='password'], input[name='password']")
                    for pwd_el in pwd_els:
                        if pwd_el.is_displayed():
                            pwd_el.click()
                            pwd_el.clear()
                            for ch in (PASSWORD or "masuk123"):
                                pwd_el.send_keys(ch)
                                time.sleep(0.03)
                            time.sleep(0.3)
                            driver.execute_script("""
                                const el = arguments[0];
                                try {
                                    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                                    nativeSetter.call(el, arguments[1]);
                                } catch(e){}
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            """, pwd_el, PASSWORD or "masuk123")
                            time.sleep(0.3)
                            
                            btn_logins = driver.find_elements(By.CSS_SELECTOR, "button, [role='button'], [type='submit']")
                            for b in btn_logins:
                                if b.is_displayed():
                                    t = (b.text or "").strip().lower()
                                    if t in ("log in", "masuk"):
                                        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", b)
                                        try:
                                            b.click()
                                        except Exception:
                                            driver.execute_script("arguments[0].click();", b)
                                        dev_log(Fore.GREEN + "[IFRAME WIDGET] Real send_keys Password & Klik Log in!")
                                        driver.switch_to.default_content()
                                        time.sleep(3)
                                        handled = True
                                        break
                            if handled:
                                break
                except Exception:
                    pass

                if handled:
                    break

                # 1) Continue di Jump back in!
                res_cont = driver.execute_script("""
                    const btns = Array.from(document.querySelectorAll('button, [role="button"], [type="submit"]'));
                    const b = btns.find(x => {
                        const t = (x.innerText || '').trim().toLowerCase();
                        return (t === 'continue' || t === 'lanjutkan') && x.offsetParent !== null;
                    });
                    if (b) { b.scrollIntoView({block:'center'}); b.click(); return (b.innerText||'').trim(); }
                    return null;
                """)
                if res_cont:
                    dev_log(Fore.YELLOW + f"[IFRAME WIDGET] Klik '{res_cont}' di modal Jump back in!")
                    driver.switch_to.default_content()
                    time.sleep(2.5)
                    handled = True
                    break

                # 2) Next / Tinjau / Berikutnya di plan modal
                res_next = driver.execute_script("""
                    const isPlanScreen = Array.from(document.querySelectorAll('input[type="radio"]')).some(r => {
                        const txt = (r.closest('label')?.textContent || r.parentElement?.textContent || r.value || '').toLowerCase();
                        return txt.includes('bulanan') || txt.includes('tahunan');
                    });
                    const btns = Array.from(document.querySelectorAll('button, [role="button"], [type="submit"]'));
                    const b = btns.find(x => {
                        const t = (x.innerText || '').trim().toLowerCase();
                        if (isPlanScreen) {
                            return (t === 'next' || t === 'berikutnya' || t.includes('tinjau') || t.includes('uji coba') || t.includes('lanjutkan') || t.includes('continue')) && !t.includes('dapatkan') && x.offsetParent !== null;
                        }
                        return (t === 'next' || t === 'berikutnya') && x.offsetParent !== null;
                    });
                    if (b) { b.scrollIntoView({block:'center'}); b.click(); return (b.innerText||'').trim(); }
                    return null;
                """)
                if res_next:
                    dev_log(Fore.YELLOW + f"[IFRAME WIDGET] Klik '{res_next}' di plan selection!")
                    driver.switch_to.default_content()
                    time.sleep(2.5)
                    handled = True
                    break

                # 3) Opsi Kartu kredit
                res_card = driver.execute_script("""
                    // Check if card form inputs or TokenEx child iframes are ALREADY visible/open (don't match generic background iframes)
                    const cardFormOpen = document.querySelector('iframe[src*="tokenex"], iframe[title*="card"], iframe[title*="Credit"], input[autocomplete*="cc-number"], input[id*="cardNumber"]') !== null;
                    if (cardFormOpen) {
                        return "ALREADY_OPEN";
                    }

                    // Auto scroll payment container down
                    const paymentItems = Array.from(document.querySelectorAll('*')).filter(el => {
                        const t = (el.innerText || el.textContent || '').toLowerCase();
                        return t.includes('gopay') || t.includes('dana') || t.includes('shopeepay') || t.includes('metode pembayaran');
                    });
                    for (const item of paymentItems) {
                        let p = item.parentElement;
                        while (p && p !== document.body) {
                            if (p.scrollHeight > p.clientHeight) {
                                p.scrollTop = p.scrollHeight;
                                p.scrollBy({ top: 400, behavior: 'instant' });
                            }
                            p = p.parentElement;
                        }
                    }

                    const allRadios = Array.from(document.querySelectorAll('input[type="radio"], [role="radio"]'));
                    const isPaymentScreen = allRadios.some(r => {
                        const txt = (r.closest('label')?.textContent || r.parentElement?.textContent || r.value || '').toLowerCase();
                        return txt.includes('gopay') || txt.includes('dana') || txt.includes('shopee') || txt.includes('ovo') || txt.includes('kartu') || txt.includes('credit');
                    });
                    if (!isPaymentScreen) return null;

                    let targetRadio = allRadios.find(r => {
                        const txt = (r.closest('label')?.textContent || r.parentElement?.textContent || r.value || '').toLowerCase();
                        if (txt.includes('bulanan') || txt.includes('tahunan') || txt.includes('monthly') || txt.includes('annual')) return false;
                        return txt.includes('kartu') || txt.includes('credit') || txt.includes('kredit') || txt.includes('debit') || r.value === '13' || r.getAttribute('data-provider') === 'VAULTED_CREDIT_CARD';
                    });
                    if (!targetRadio) {
                        targetRadio = allRadios.find(r => {
                            const txt = (r.closest('label')?.textContent || r.parentElement?.textContent || r.value || '').toLowerCase();
                            if (txt.includes('bulanan') || txt.includes('tahunan') || txt.includes('monthly') || txt.includes('annual')) return false;
                            return !txt.includes('gopay') && !txt.includes('dana') && !txt.includes('shopee') && !txt.includes('ovo') && !txt.includes('paypal');
                        });
                    }
                    if (!targetRadio && allRadios.length >= 4) {
                        targetRadio = allRadios[allRadios.length - 1];
                    }
                    if (targetRadio) {
                        targetRadio.scrollIntoView({block:'center', behavior:'instant'});
                        const lbl = targetRadio.closest('label') || targetRadio.parentElement;
                        if (lbl) {
                            lbl.scrollIntoView({block:'center', behavior:'instant'});
                            lbl.click();
                        }
                        try {
                            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
                            if (setter) setter.call(targetRadio, true); else targetRadio.checked = true;
                        } catch(e){}
                        targetRadio.dispatchEvent(new Event('input', { bubbles: true }));
                        targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                        targetRadio.click();
                        return "CLICKED_CARD_RADIO";
                    }

                    const els = Array.from(document.querySelectorAll('label, [role="radio"], input, span, div, p'));
                    const e = els.find(x => {
                        const t = (x.innerText || x.value || '').trim().toLowerCase();
                        const p = x.getAttribute('data-provider') || '';
                        return p === 'VAULTED_CREDIT_CARD' || 
                               t === 'credit or debit card' || 
                               t === 'kartu kredit atau debit' || 
                               t.includes('kartu kredit atau debit') ||
                               t.includes('credit or debit card') ||
                               (t.includes('credit') && t.includes('debit')) || 
                               (t.includes('kartu') && t.includes('kredit'));
                    });
                    if (e) {
                        e.scrollIntoView({block:'center'});
                        let target = e;
                        if (e.tagName === 'SPAN' && e.closest('label')) target = e.closest('label');
                        else if (e.tagName === 'SPAN' && e.closest('[role="radio"]')) target = e.closest('[role="radio"]');
                        else if (e.closest('label')) target = e.closest('label');
                        else if (e.closest('[role="radio"]')) target = e.closest('[role="radio"]');
                        target.click();
                        return (target.innerText||'').trim();
                    }
                    return null;
                """)
                if res_card == "ALREADY_OPEN":
                    dev_log(Fore.GREEN + "[IFRAME WIDGET] Card form already visible and selected! Proceeding to VCC fill.")
                    driver.switch_to.default_content()
                    handled = True
                    break
                elif res_card:
                    dev_log(Fore.GREEN + f"[IFRAME WIDGET] Klik '{res_card}' untuk memilih Kartu!")
                    driver.switch_to.default_content()
                    time.sleep(1)
                    handled = True
                    break

            except Exception:
                driver.switch_to.default_content()

        driver.switch_to.default_content()
        if not handled:
            time.sleep(0.5)

    return True


def hard_click_berikutnya(driver, timeout=30):
    dev_log(Fore.CYAN + "[INFO] hard_click_berikutnya — outerHTML user button[type=submit]>span.khPe7Q")
    end = time.time() + timeout
    attempt = 0

    def advanced():
        if _page_has_card_form(driver):
            return True
        try:
            driver.switch_to.default_content()
            subs = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")
            if subs:
                driver.switch_to.frame(subs[0])
                res = driver.execute_script("""
                    const hasPmt = document.querySelector('iframe[src*="tokenex"], [data-provider="VAULTED_CREDIT_CARD"]') !== null;
                    const isPlanScreen = Array.from(document.querySelectorAll('input[type="radio"]')).some(r => {
                        const t = (r.closest('label')?.textContent || r.parentElement?.textContent || '').toLowerCase();
                        return t.includes('bulanan') || t.includes('tahunan');
                    });
                    const txt = (document.body.innerText || '').toLowerCase();
                    const hasPaymentOptions = (txt.includes('gopay') || txt.includes('dana') || txt.includes('kartu kredit')) && !isPlanScreen;
                    return hasPmt || hasPaymentOptions;
                """)
                driver.switch_to.default_content()
                if res:
                    return True
        except Exception:
            driver.switch_to.default_content()
        return False

    while time.time() < end:
        attempt += 1
        dismiss_browser_popups(driver)

        # ── Jika modal 'Jump back in!' masih ada, klik Continue dulu ──
        try:
            src = (driver.page_source or "").lower()
            if "jump back" in src or "continue with another" in src:
                hit = try_click_texts(driver, ["Continue", "Lanjutkan"], timeout=2, partial=False)
                if hit:
                    dev_log(Fore.YELLOW + f"[hard_click] Dismiss 'Jump back in!' → klik '{hit}'")
                    time.sleep(2)
                    continue
        except Exception:
            pass

        if advanced():
            # Pastikan bukan false-positive dari modal Jump back in!
            src_lower = (driver.page_source or "").lower()
            if "jump back" in src_lower or "continue with another" in src_lower:
                dev_log(Fore.YELLOW + "[hard_click] advanced() palsu — masih di Jump back in!, skip")
            else:
                dev_log(Fore.GREEN + "[OK] Sudah di halaman setelah Berikutnya.")
                return True

        buttons = _find_berikutnya_buttons(driver)
        dev_log(f"[INFO] Percobaan {attempt}: ketemu {len(buttons)} tombol Berikutnya")

        # Scroll modal dalam (dialog) ke bawah — tombol sering di bawah panel kiri
        try:
            driver.execute_script(
                """
                const dialogs = document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="Modal"]');
                dialogs.forEach(d => { try { d.scrollTop = d.scrollHeight; } catch(e){} });
                // scroll parent overflow
                document.querySelectorAll('button[type="submit"]').forEach(b => {
                  if ((b.innerText||'').includes('Berikutnya')) {
                    let p = b.parentElement;
                    for (let i=0;i<8 && p;i++) {
                      try { p.scrollTop = p.scrollHeight; } catch(e){}
                      p = p.parentElement;
                    }
                  }
                });
                """
            )
        except Exception:
            pass
        time.sleep(0.4)

        for el in buttons:
            try:
                # Scroll ke tombol
                driver.execute_script(
                    "arguments[0].scrollIntoView({block:'center', inline:'center'});", el
                )
                time.sleep(0.3)

                # A) CDP real mouse di button
                dev_log("[ACTION] CDP real-click button Berikutnya")
                _cdp_real_click(driver, el)
                time.sleep(2.2)
                if advanced():
                    dev_log(Fore.GREEN + "[OK] Berikutnya (CDP button)")
                    return True

                # B) CDP di span.khPe7Q
                try:
                    spans = el.find_elements(
                        By.CSS_SELECTOR, "span.khPe7Q, span[class*='khPe7Q']"
                    )
                    for sp in spans:
                        if "Berikutnya" in (sp.text or ""):
                            dev_log("[ACTION] CDP real-click span.khPe7Q Berikutnya")
                            _cdp_real_click(driver, sp)
                            time.sleep(2.2)
                            if advanced():
                                dev_log(Fore.GREEN + "[OK] Berikutnya (CDP span)")
                                return True
                except Exception:
                    pass

                # C) ActionChains
                dev_log("[ACTION] ActionChains click Berikutnya")
                _actionchains_click(driver, el)
                time.sleep(2.2)
                if advanced():
                    dev_log(Fore.GREEN + "[OK] Berikutnya (ActionChains)")
                    return True

                # D) JS click + form.requestSubmit
                dev_log("[ACTION] JS click + requestSubmit Berikutnya")
                driver.execute_script(
                    """
                    const btn = arguments[0];
                    btn.removeAttribute('disabled');
                    btn.setAttribute('aria-disabled','false');
                    btn.scrollIntoView({block:'center'});
                    // pointer events sequence
                    for (const type of ['pointerdown','mousedown','pointerup','mouseup','click']) {
                      btn.dispatchEvent(new MouseEvent(type, {bubbles:true, cancelable:true, view:window, buttons:1}));
                    }
                    try { btn.click(); } catch(e) {}
                    const form = btn.closest('form');
                    if (form) {
                      try { form.requestSubmit(btn); } catch(e) {
                        try { form.submit(); } catch(e2) {}
                      }
                    }
                    """,
                    el,
                )
                time.sleep(2.5)
                if advanced():
                    dev_log(Fore.GREEN + "[OK] Berikutnya (JS/requestSubmit)")
                    return True

                # E) Focus + ENTER
                dev_log("[ACTION] Focus button + ENTER")
                try:
                    from selenium.webdriver.common.keys import Keys
                    el.send_keys(Keys.ENTER)
                    time.sleep(1.5)
                    el.send_keys(Keys.SPACE)
                    time.sleep(2)
                except Exception:
                    try:
                        driver.execute_script(
                            """
                            const b=arguments[0]; b.focus();
                            b.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,bubbles:true}));
                            b.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,bubbles:true}));
                            """,
                            el,
                        )
                        time.sleep(2)
                    except Exception:
                        pass
                if advanced():
                    dev_log(Fore.GREEN + "[OK] Berikutnya (ENTER)")
                    return True

            except Exception as e:
                dev_log(f"[WARN] hard click satu elemen: {e}")
                continue

        # F) Pure JS query di seluruh document (termasuk nested)
        try:
            dev_log("[ACTION] document querySelectorAll Berikutnya (JS global)")
            clicked = driver.execute_script(
                """
                function visible(el) {
                  const r = el.getBoundingClientRect();
                  const st = getComputedStyle(el);
                  return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
                }
                const nodes = Array.from(document.querySelectorAll('button[type="submit"], button, [role="button"]'));
                const btn = nodes.find(b => {
                  const t = (b.innerText || b.textContent || '').replace(/\\s+/g,' ').trim();
                  return t === 'Berikutnya' || t.startsWith('Berikutnya') || !!b.querySelector('span.khPe7Q');
                });
                // refine: span.khPe7Q text
                let target = null;
                for (const sp of document.querySelectorAll('span.khPe7Q, span[class*="khPe7Q"]')) {
                  if ((sp.textContent||'').trim() === 'Berikutnya') {
                    target = sp.closest('button') || sp;
                    break;
                  }
                }
                if (!target) {
                  target = nodes.find(b => (b.innerText||'').includes('Berikutnya'));
                }
                if (!target) return false;
                target.scrollIntoView({block:'center'});
                if (target.tagName === 'BUTTON' || target.getAttribute('type')==='submit') {
                  const form = target.closest('form');
                  target.click();
                  if (form) { try { form.requestSubmit(target); } catch(e){} }
                } else {
                  target.click();
                  const b = target.closest('button');
                  if (b) b.click();
                }
                return true;
                """
            )
            time.sleep(2.5)
            if clicked and advanced():
                dev_log(Fore.GREEN + "[OK] Berikutnya (JS global)")
                return True
        except Exception as e:
            dev_log(f"[WARN] JS global: {e}")

        time.sleep(1.0)

    print(Fore.RED + "[FAIL] hard_click_berikutnya timeout — tombol tidak memajukan halaman.")
    try:
        os.makedirs("picture", exist_ok=True)
        p = os.path.join("picture", f"berikutnya_fail_{int(time.time())}.png")
        driver.save_screenshot(p)
        dev_log(Fore.CYAN + f"[INFO] Screenshot: {p}")
        # dump tombol di page
        info = driver.execute_script(
            """
            return Array.from(document.querySelectorAll('button')).slice(0,30).map(b => ({
              text: (b.innerText||'').trim().slice(0,40),
              type: b.getAttribute('type'),
              disabled: b.disabled,
              aria: b.getAttribute('aria-disabled'),
              cls: (b.className||'').toString().slice(0,60)
            }));
            """
        )
        dev_log(Fore.YELLOW + f"[DEBUG] buttons sample: {info}")
    except Exception:
        pass
    return False


def _click_canva_submit_span(driver, span_text, timeout=15):
    """
    Klik tombol Canva:
      <button type="submit"><span class="khPe7Q">TEXT</span></button>
    """
    if span_text == "Berikutnya":
        return "Berikutnya" if hard_click_berikutnya(driver, timeout=timeout) else None

    dismiss_browser_popups(driver)
    xpaths = [
        f"//button[@type='submit']//span[normalize-space()='{span_text}']/ancestor::button[1]",
        f"//button[@type='submit'][span[normalize-space()='{span_text}']]",
        f"//button[@type='submit'][.//span[contains(@class,'khPe7Q') and normalize-space()='{span_text}']]",
        f"//span[contains(@class,'khPe7Q') and normalize-space()='{span_text}']/ancestor::button[1]",
        f"//span[normalize-space()='{span_text}']/ancestor::button[@type='submit'][1]",
        f"//button[.//span[normalize-space()='{span_text}']]",
        f"//button[normalize-space()='{span_text}']",
    ]
    end = time.time() + timeout
    while time.time() < end:
        dismiss_browser_popups(driver)
        for xp in xpaths:
            try:
                els = driver.find_elements(By.XPATH, xp)
                for el in els:
                    try:
                        disabled = el.get_attribute("disabled")
                        aria_dis = el.get_attribute("aria-disabled")
                        if disabled or aria_dis == "true":
                            continue
                        if _cdp_real_click(driver, el):
                            time.sleep(2)
                            return span_text
                        _js_click(driver, el)
                        dev_log(Fore.GREEN + f"[OK] Klik submit span: {span_text}")
                        time.sleep(2.5)
                        return span_text
                    except Exception:
                        continue
            except Exception:
                continue
        time.sleep(0.4)
    return None


def click_berikutnya(driver, timeout=15):
    """
    Klik tombol ungu 'Berikutnya'.
    HTML user exact:
      <button type="submit" class="_5KtATA ... SjfYWQ">
        <span class="khPe7Q">Berikutnya</span>
      </button>
    """
    dev_log("[INFO] Mencari tombol Berikutnya (HTML user: button[type=submit]>span.khPe7Q)...")
    if hard_click_berikutnya(driver, timeout=max(timeout, 25)):
        return "Berikutnya"
    return None


def step_select_monthly_then_next(driver):
    """
    STEP 2: Bulanan biasanya sudah terpilih otomatis.
    Cukup klik 'Berikutnya' / 'Lanjutkan — Anda tidak perlu membayar hari ini'.
    Mendukung pengecekan langsung di subscribe_widget iframe + debug screenshot.
    """
    import os
    dev_log("Step checkpoint")
    time.sleep(1)
    os.makedirs("picture", exist_ok=True)

    # 1. Cek di dalam subscribe_widget iframe terlebih dahulu
    try:
        driver.switch_to.default_content()
        subs = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")
        if subs:
            driver.switch_to.frame(subs[0])
            dev_log("Widget iframe subscribe_widget terbuka")

            # Cek apakah ada tombol Tinjau uji coba / Lanjutkan / Berikutnya di dalam widget
            clicked_btn = driver.execute_script("""
                const btns = Array.from(document.querySelectorAll('button, [type="submit"], [role="button"]'));
                const b = btns.find(x => {
                    const t = (x.innerText || '').toLowerCase();
                    return (t.includes('tinjau') || t.includes('uji coba') || t.includes('lanjutkan') || t.includes('berikutnya') || t.includes('continue') || t.includes('next')) && !t.includes('dapatkan');
                });
                if (b) {
                    b.scrollIntoView({block:'center'});
                    b.click();
                    return (b.innerText || '').trim();
                }
                return null;
            """)
            if clicked_btn:
                dev_log(Fore.GREEN + f"[INFO] Berhasil klik '{clicked_btn}' di dalam subscribe_widget!")
                time.sleep(0.8)
                driver.switch_to.default_content()
                return True
            driver.switch_to.default_content()
    except Exception as e:
        driver.switch_to.default_content()

    # 2. Cek di main document jika bukan di iframe
    dismiss_browser_popups(driver)
    time.sleep(0.5)

    dev_log("[INFO] Skip pilih bulanan/tahunan — langsung Berikutnya.")
    if not click_berikutnya(driver, timeout=6):
        dev_log(Fore.YELLOW + "[WARN] Tombol Berikutnya belum terklik (mungkin langsung ke metode pembayaran).")
        return False
    return True


def step_select_credit_debit_card(driver):
    """
    STEP 3: Pilih 'Kartu kredit atau debit'.
    HTML user:
      <label ...><span data-provider="VAULTED_CREDIT_CARD">...Kartu kredit atau debit</span></label>
    """
    dev_log("Step checkpoint")
    time.sleep(2)
    dismiss_browser_popups(driver)

    for _ in range(12):
        if _page_text_has(
            driver,
            "kartu kredit",
            "metode pembayaran",
            "paypal",
            "vaulted_credit_card",
        ) or _page_has_card_form(driver):
            break
        time.sleep(1)

    if _page_has_card_form(driver):
        dev_log("[INFO] Form kartu sudah tampil — skip pilih metode.")
        return True

    # Prioritas selector dari HTML user
    xpaths = [
        "//*[@data-provider='VAULTED_CREDIT_CARD']",
        "//span[@data-provider='VAULTED_CREDIT_CARD']",
        "//span[@data-provider='VAULTED_CREDIT_CARD']/ancestor::label[1]",
        "//label[.//span[@data-provider='VAULTED_CREDIT_CARD']]",
        "//label[.//span[normalize-space()='Kartu kredit atau debit']]",
        "//label[contains(.,'Kartu kredit atau debit')]",
        "//span[normalize-space()='Kartu kredit atau debit']/ancestor::label[1]",
        "//span[contains(@class,'Yhl9mg')]//span[normalize-space()='Kartu kredit atau debit']/ancestor::label[1]",
        "//input[@type='radio']/following::*[contains(.,'Kartu kredit atau debit')][1]/ancestor::label[1]",
    ]
    end = time.time() + 12
    while time.time() < end:
        for xp in xpaths:
            try:
                for el in driver.find_elements(By.XPATH, xp):
                    try:
                        driver.execute_script(
                            "arguments[0].scrollIntoView({block:'center'});", el
                        )
                        time.sleep(0.25)
                        try:
                            el.click()
                        except Exception:
                            driver.execute_script("arguments[0].click();", el)
                        # Klik juga label parent jika yang ketemu span
                        try:
                            label = el.find_element(By.XPATH, "./ancestor::label[1]")
                            driver.execute_script("arguments[0].click();", label)
                        except Exception:
                            pass
                        dev_log(Fore.GREEN + "[OK] Pilih: Kartu kredit atau debit (VAULTED_CREDIT_CARD)")
                        time.sleep(3)
                        return True
                    except Exception:
                        continue
            except Exception:
                continue
        time.sleep(0.4)

    # Fallback: klik radio terkait
    try:
        radios = driver.find_elements(By.CSS_SELECTOR, "input[type='radio']")
        for r in radios:
            try:
                # Ambil label via for=id
                rid = r.get_attribute("id")
                if rid:
                    lab = driver.find_elements(By.CSS_SELECTOR, f"label[for='{rid}']")
                    for lb in lab:
                        if "kartu" in (lb.text or "").lower() or "credit" in (lb.get_attribute("innerHTML") or "").lower():
                            driver.execute_script("arguments[0].click();", lb)
                            dev_log(Fore.GREEN + "[OK] Pilih kartu via label[for=radio]")
                            time.sleep(3)
                            return True
            except Exception:
                continue
    except Exception:
        pass

    dev_log(Fore.YELLOW + "[WARN] Opsi kartu kredit/debit belum ketemu.")
    return False


def click_dapatkan_uji_coba(driver, timeout=8):
    """
    Klik tombol submit 'Dapatkan uji coba gratis' secara presisi:
    1. Masuk ke iframe subscribe_widget
    2. Cari tombol button[type='submit'] / 'Dapatkan uji coba gratis'
    3. Trigger pointerdown, mousedown, mouseup, click, dan requestSubmit
    4. ActionChains natural hover & click
    """
    from selenium.webdriver.common.action_chains import ActionChains

    try:
        driver.switch_to.default_content()
        subs = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")
        if subs:
            driver.switch_to.frame(subs[0])

            # Coba submit via PointerEvents + requestSubmit
            submitted = driver.execute_script(r"""
                const btn = document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button')).find(b => {
                    const t = (b.innerText || b.textContent || '').trim().toLowerCase();
                    return t.includes('dapatkan') || t.includes('uji coba') || t.includes('coba gratis');
                });
                if (!btn) return false;

                btn.scrollIntoView({ block: 'center', behavior: 'instant' });
                const rect = btn.getBoundingClientRect();
                const opts = {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: rect.left + rect.width / 2,
                    clientY: rect.top + rect.height / 2
                };
                ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
                    btn.dispatchEvent(new MouseEvent(evt, opts));
                });
                try { btn.click(); } catch(e) {}
                const form = btn.closest('form');
                if (form) {
                    try { form.requestSubmit(btn); } catch(e) {
                        try { form.submit(); } catch(e2) {}
                    }
                }
                return true;
            """)
            if submitted:
                dev_log("[SUBMIT] Tombol 'Dapatkan uji coba gratis' berhasil diklik & disubmit!")
                driver.switch_to.default_content()
                return True

            # Fallback ActionChains
            w = WebDriverWait(driver, 3)
            btn = w.until(EC.element_to_be_clickable((By.XPATH,
                "//button[@type='submit'] | //button[contains(., 'Dapatkan uji coba')]"
            )))
            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", btn)
            time.sleep(0.2)
            try:
                ActionChains(driver).move_to_element(btn).click().perform()
                dev_log(Fore.GREEN + f"[SUBMIT] ActionChains klik submit: '{btn.text}'")
                driver.switch_to.default_content()
                return True
            except Exception:
                btn.click()
                dev_log(Fore.GREEN + f"[SUBMIT] Native klik submit: '{btn.text}'")
                driver.switch_to.default_content()
                return True
    except Exception:
        driver.switch_to.default_content()

    hit = _click_canva_submit_span(driver, "Dapatkan uji coba gratis", timeout=timeout)
    if hit:
        return hit
    for t in ("Dapatkan uji cobanya", "Mulai uji coba gratis", "Start free trial"):
        hit = _click_canva_submit_span(driver, t, timeout=2)
        if hit:
            return hit
    return try_click_texts(
        driver,
        ["Dapatkan uji coba gratis", "Mulai uji coba gratis"],
        timeout=3,
        partial=True,
    )


def step_fill_vcc_and_get_trial(driver, card):
    """
    STEP 4 (screenshot nyata):
      - Nomor kartu
      - Kedaluwarsa (BB/TT)
      - Kode keamanan (CVC)
      - Negara sudah Amerika Serikat (skip)
      - Alamat penagihan
      - Klik 'Dapatkan uji coba gratis'
    """
    dev_log("Step checkpoint")
    time.sleep(2)
    dismiss_browser_popups(driver)

    for _ in range(18):
        if _page_has_card_form(driver) or _page_text_has(
            driver, "nomor kartu", "kedaluwarsa", "kode keamanan", "alamat penagihan"
        ):
            dev_log(Fore.GREEN + "[INFO] Form kartu/alamat terdeteksi.")
            break
        time.sleep(1)

    # Scroll di dalam modal (field di panel kiri)
    try:
        driver.execute_script(
            """
            const modal = document.querySelector('[role="dialog"]') || document.body;
            modal.scrollTop = 0;
            """
        )
    except Exception:
        pass
    time.sleep(0.5)

    dev_log("[INFO] Mengisi VCC: nomor → BB/TT → CVC...")
    card_ok = fill_card_fields(driver, card)
    if not card_ok:
        time.sleep(1)
        card_ok = fill_card_fields(driver, card)

    # Pastikan exp + cvc (kadang nomor ok tapi exp/cvc kosong)
    exp = _exp_formats(card)
    dev_log(f"[INFO] Pastikan exp={exp['mm_yy']} cvc=***")
    _fill_in_iframes(
        driver,
        lambda d: _find_and_fill_xpath(
            d,
            [
                "//label[contains(.,'Kedaluwarsa')]/following::input[1]",
                "//*[contains(.,'BB/TT')]/following::input[1]",
                "//input[contains(@placeholder,'BB') or contains(@aria-label,'Kedaluwarsa')]",
                "//input[@autocomplete='cc-exp']",
            ],
            exp["mm_yy"],
            timeout=1,
        ),
    )
    _fill_in_iframes(
        driver,
        lambda d: _find_and_fill_xpath(
            d,
            [
                "//label[contains(.,'Kode keamanan')]/following::input[1]",
                "//*[contains(.,'CVC')]/following::input[1]",
                "//input[contains(@placeholder,'CVC') or contains(@aria-label,'CVC')]",
                "//input[@autocomplete='cc-csc']",
            ],
            card["cvc"],
            timeout=1,
        ),
    )

    dev_log("[INFO] Isi alamat penagihan (negara sudah Amerika Serikat — skip)...")
    try:
        driver.execute_script(
            """
            const modal = document.querySelector('[role="dialog"]') || document.body;
            modal.scrollTop = modal.scrollHeight;
            """
        )
    except Exception:
        pass
    time.sleep(0.6)
    fill_us_billing_address(driver, skip_country=True)

    # City + ZIP + state juga (kadang expand setelah alamat)
    time.sleep(1)
    fill_us_billing_address(driver, skip_country=True)

    if not card_ok:
        print(Fore.RED + "[ERROR] Nomor VCC gagal diisi otomatis.")
        try:
            jawab = input(
                Fore.CYAN
                + "  Lengkapi VCC+alamat manual, lalu y untuk klik 'Dapatkan uji coba gratis' [y/n]: "
                + Style.RESET_ALL
            ).strip().lower()
        except EOFError:
            jawab = "n"
        if jawab not in ("y", "ya", "yes", "1"):
            return False
    else:
        dev_log(Fore.GREEN + "[OK] VCC diisi (cek exp/CVC/alamat di browser).")

    time.sleep(1.5)
    clicked = click_dapatkan_uji_coba(driver, timeout=14)
    if not clicked:
        dev_log(Fore.YELLOW + "[WARN] Tombol 'Dapatkan uji coba gratis' belum terklik.")
        try:
            jawab = input(
                Fore.CYAN
                + "  Klik manual 'Dapatkan uji coba gratis', lalu y jika sukses [y/n]: "
                + Style.RESET_ALL
            ).strip().lower()
        except EOFError:
            jawab = "n"
        return jawab in ("y", "ya", "yes", "1")

    dev_log(Fore.GREEN + f"[OK] Klik akhir: {clicked}")
    time.sleep(4)
    return True


def _page_has_card_form(driver):
    """
    True HANYA jika ada input kartu yang terlihat (termasuk di iframe).
    Jangan pakai page_source keywords — homepage Canva sering false positive.
    """

    def check(d):
        sels = [
            "input[autocomplete='cc-number']",
            "input[autocomplete='cc-exp']",
            "input[autocomplete='cc-csc']",
            "input[data-fieldtype='encryptedCardNumber']",
            "input[name='encryptedCardNumber']",
            "input[name='encryptedExpiryDate']",
            "input[name='encryptedSecurityCode']",
            "input[id*='encryptedCardNumber']",
            "input[placeholder*='Card number']",
            "input[placeholder*='card number']",
            "input[placeholder*='Nomor kartu']",
            "input[placeholder*='MM']",
            "input[aria-label*='Card number']",
            "input[aria-label*='card number']",
            "input[aria-label*='Nomor kartu']",
        ]
        for sel in sels:
            try:
                for el in d.find_elements(By.CSS_SELECTOR, sel):
                    try:
                        if el.is_displayed():
                            return True
                    except Exception:
                        continue
            except Exception:
                continue
        try:
            for fr in d.find_elements(By.CSS_SELECTOR, "iframe"):
                title = (fr.get_attribute("title") or "").lower()
                name = (fr.get_attribute("name") or "").lower()
                if any(
                    k in title or k in name
                    for k in (
                        "card number",
                        "cardnumber",
                        "encryptedcardnumber",
                        "security code",
                        "cvc",
                        "cvv",
                        "expiry",
                        "stripe",
                        "adyen",
                    )
                ):
                    if fr.is_displayed():
                        return True
        except Exception:
            pass
        return False

    try:
        driver.switch_to.default_content()
    except Exception:
        pass
    return _fill_in_iframes(driver, check)


def detect_payment_success(driver, timeout=30):
    """
    Deteksi indikasi pembayaran / trial sukses:
    1. Prioritas utama: Deteksi URL menu/dashboard dan status 'Bisnis' (misal 'Bisnis • 1')
    2. Cek query subscription API Canva
    3. Cek marker sukses resmi
    4. Cek notif merah / fail_markers HANYA jika subscribe_widget masih aktif di layar
    """
    fail_markers = [
        "terjadi kesalahan saat memproses pembayaran anda",
        "card was declined",
        "payment failed",
        "could not process",
        "invalid card",
        "kartu ditolak",
        "pembayaran gagal",
        "tidak dapat memproses pembayaran",
        "pihak bank telah menolak",
        "bank telah menolak",
        "menolak transaksi ini",
        "silakan hubungi pihak bank",
    ]
    success_markers = [
        # Popup 'Anda sudah berlangganan' — PRIORITAS (muncul di /harga/ setelah sukses)
        "anda sudah berlangganan canva bisnis",
        "anda sudah berlangganan canva pro",
        "you're already subscribed",
        "you are already subscribed",
        "already subscribed to canva",
        # Marker standar sukses
        "welcome to canva business",
        "selamat datang di canva bisnis",
        "welcome to canva pro",
        "trial has started",
        "free trial has started",
        "uji coba telah dimulai",
        "uji coba gratis dimulai",
        "berhasil berlangganan",
        "pembayaran berhasil",
        "thanks for subscribing",
        "thank you for subscribing",
    ]

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            driver.switch_to.default_content()
            url = (driver.current_url or "").lower()
            sub_widgets = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")

            # -----------------------------------------------------------------
            # 1. PRIORITAS TERTINGGI: SUDAH PINDAH KE MENU / BERANDA / DASHBOARD
            # -----------------------------------------------------------------
            # Jika URL adalah /menu, /templates, /designs, /home, /settings, atau root canva.com
            # dan modal subscribe_widget sudah tertutup
            if not sub_widgets or "/menu" in url:
                dashboard_indicators = [
                    "/create-new", "/menu", "/home", "/templates", "/designs",
                    "/projects", "/setup/team", "/your-apps", "/settings", "/folders", "/folder"
                ]
                page_title = (driver.title or "").lower()
                is_on_dashboard = any(p in url for p in dashboard_indicators) or (
                    "/harga" not in url and "/pricing" not in url and ("beranda" in page_title or "canva" in page_title)
                )

                if is_on_dashboard:
                    dev_log(Fore.GREEN + Style.BRIGHT + f"[SUCCESS] Web berhasil redirect ke Beranda / Dashboard: '{driver.current_url}' (Title: '{driver.title}')!")
                    return True

                # Periksa teks di halaman apakah ada tanda paket Bisnis aktif
                body_text = ""
                try:
                    body_text = (driver.find_element(By.TAG_NAME, "body").text or "").lower()
                except Exception:
                    pass

                # ── CEK POPUP 'Anda sudah berlangganan Canva Bisnis!' ──
                # Popup ini muncul di halaman /harga/ setelah sukses bayar
                _already_sub_markers = [
                    "anda sudah berlangganan canva bisnis",
                    "anda sudah berlangganan canva pro",
                    "you're already subscribed",
                    "you are already subscribed",
                ]
                if any(m in body_text for m in _already_sub_markers):
                    dev_log(Fore.GREEN + Style.BRIGHT + "[SUCCESS] Popup 'Anda sudah berlangganan Canva Bisnis!' terdeteksi!")
                    # Klik tombol 'Lanjutkan ke Canva' jika ada
                    try:
                        driver.execute_script("""
                            const btns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
                            const b = btns.find(x => {
                                const t = (x.innerText || x.textContent || '').toLowerCase().trim();
                                return t.includes('lanjutkan ke canva') || t.includes('continue to canva') ||
                                       t.includes('lanjutkan') || t.includes('continue');
                            });
                            if (b) { b.scrollIntoView({block:'center'}); b.click(); return true; }
                            return false;
                        """)
                        time.sleep(2.0)
                    except Exception:
                        pass
                    return True

                # Indikasi kuat Canva Bisnis aktif di menu / dashboard
                if "bisnis" in body_text or "canva bisnis" in body_text:
                    dev_log(Fore.GREEN + Style.BRIGHT + f"[SUCCESS] Terdeteksi Canva Bisnis AKTIF di menu/dashboard: '{driver.current_url}'!")
                    return True

                # Cek apakah subscription API Canva mengonfirmasi aktif
                if check_canva_subscription_api(driver):
                    dev_log(Fore.GREEN + Style.BRIGHT + "[SUCCESS] Canva Subscription API mengonfirmasi paket Bisnis AKTIF!")
                    return True

            # -----------------------------------------------------------------
            # 2. CEK TEKS DI DALAM SUBSCRIBE_WIDGET (JIKA MASIH TERBUKA)
            # -----------------------------------------------------------------
            widget_text = ""
            if sub_widgets:
                try:
                    driver.switch_to.frame(sub_widgets[0])
                    widget_text = (driver.find_element(By.TAG_NAME, "body").text or "").lower()
                except Exception:
                    pass
                finally:
                    driver.switch_to.default_content()

            # Deteksi & klik tombol Verifikasi (3DS) jika muncul di widget
            if "verifikasi" in widget_text or "konfirmasi" in widget_text:
                try:
                    if sub_widgets:
                        driver.switch_to.frame(sub_widgets[0])
                        verif = driver.execute_script("""
                            const btns = Array.from(document.querySelectorAll('button'));
                            const b = btns.find(x => {
                                const t = (x.innerText || '').trim().toLowerCase();
                                return t === 'verifikasi' || t.includes('verifikasi') || t.includes('konfirmasi');
                            });
                            if (b && !b.disabled) {
                                b.scrollIntoView({block:'center'});
                                b.click();
                                return b.innerText;
                            }
                            return null;
                        """)
                        if verif:
                            print(Fore.CYAN + f"  → [VERIFIKASI] Berhasil klik tombol 3DS: '{verif}'")
                except Exception:
                    pass
                finally:
                    driver.switch_to.default_content()

            # Cek Notifikasi Masalah Server ("Server kami mengalami masalah")
            server_error_markers = [
                "server kami mengalami masalah",
                "our server is experiencing problems",
                "our servers are having issues",
                "server error",
                "terjadi masalah pada server kami",
                "ada masalah di server kami",
                "we are having trouble",
                "something went wrong on our end",
            ]
            if any(sem in widget_text for sem in server_error_markers) or any(sem in (body_text or "") for sem in server_error_markers):
                dev_log(Fore.YELLOW + Style.BRIGHT + "[SERVER ERROR] Terdeteksi notifikasi 'Server kami mengalami masalah'!")
                return "SERVER_ERROR"

            # Marker sukses konfirmasi di dalam widget
            if any(m in widget_text for m in success_markers):
                dev_log(Fore.GREEN + "[SUCCESS] Marker sukses terdeteksi di dalam widget!")
                return True

            # -----------------------------------------------------------------
            # 3. CEK NOTIFIKASI ERROR PENOLAKAN KARTU (HANYA DI DALAM WIDGET)
            # -----------------------------------------------------------------
            if sub_widgets and any(m in widget_text for m in fail_markers):
                dev_log(Fore.RED + "[CHECK] Terdeteksi pesan penolakan pembayaran / notif merah di widget.")
                return False

        except Exception:
            pass
        time.sleep(1.2)

    return None  # timeout



def _js_click(driver, el):
    """Klik paksa (native + JS + MouseEvent) — untuk tombol Canva."""
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
    time.sleep(0.2)
    try:
        el.click()
    except Exception:
        pass
    driver.execute_script(
        """
        const el = arguments[0];
        try { el.focus(); } catch(e) {}
        try { el.click(); } catch(e) {}
        try {
          el.dispatchEvent(new MouseEvent('click', {
            bubbles: true, cancelable: true, view: window, buttons: 1
          }));
        } catch(e) {}
        """,
        el,
    )
    return True


def _wait_and_click_xpaths(driver, xpaths, timeout=20, must_contain=None):
    """
    Tunggu salah satu xpath klikable, klik, return True.
    must_contain: opsional, text harus ada di page sebelum sukses dianggap pindah.
    """
    end = time.time() + timeout
    while time.time() < end:
        dismiss_browser_popups(driver)
        for xp in xpaths:
            try:
                els = driver.find_elements(By.XPATH, xp)
                for el in els:
                    try:
                        if el.get_attribute("disabled") is not None and el.get_attribute("disabled"):
                            continue
                        if el.get_attribute("aria-disabled") == "true":
                            continue
                        # skip invisible if size 0
                        try:
                            if el.size.get("height", 1) == 0:
                                continue
                        except Exception:
                            pass
                        _js_click(driver, el)
                        time.sleep(2)
                        if must_contain:
                            if _page_text_has(driver, *must_contain):
                                return True
                            # mungkin perlu 1x lagi
                            continue
                        return True
                    except Exception:
                        continue
            except Exception:
                continue
        time.sleep(0.5)
    return False


def _wait_page_has(driver, phrases, timeout=25):
    end = time.time() + timeout
    while time.time() < end:
        if _page_text_has(driver, *phrases):
            return True
        time.sleep(0.5)
    return False


def _type_into_input_field(driver, el, val):
    """Ketik teks ke input (JS native clear to empty + Backspace x30 + send_keys + blur event). Fallback ke JS Injection jika element not interactable."""
    val_str = str(val).strip()
    try:
        driver.execute_script("arguments[0].scrollIntoView({block:'center'}); arguments[0].focus(); arguments[0].click();", el)
        time.sleep(0.1)

        # 1. Clear input via JS native setter to empty string ""
        driver.execute_script("""
            var el = arguments[0];
            try {
                var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                if (setter) { setter.call(el, ""); } else { el.value = ""; }
            } catch(e) {}
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        """, el)
        time.sleep(0.05)

        # 2. Clear via keyboard (Ctrl+A + Backspace x30) to erase remaining chars
        from selenium.webdriver.common.keys import Keys
        try:
            el.send_keys(Keys.CONTROL + "a")
            for _ in range(30):
                el.send_keys(Keys.BACKSPACE)
        except Exception:
            pass
        time.sleep(0.1)

        # 3. Type character by character
        for char in val_str:
            el.send_keys(char)
            time.sleep(0.02)

        # 4. Dispatch events
        driver.execute_script("""
            var el = arguments[0];
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            el.dispatchEvent(new Event('focusout', { bubbles: true }));
        """, el)
        return True
    except Exception as e:
        dev_log(f"[WARN] send_keys gagal ({e}), menggunakan Fallback JS injection for value '{val_str}'...")
        try:
            driver.execute_script("""
                var el = arguments[0];
                var val = arguments[1];
                try {
                    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    if (setter) { setter.call(el, val); } else { el.value = val; }
                } catch(err) { el.value = val; }
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
                el.dispatchEvent(new Event('focusout', { bubbles: true }));
            """, el, val_str)
            return True
        except Exception as js_err:
            dev_log(f"[WARN] Error _type_into_input_field JS fallback: {js_err}")
            return False


def _select_country_from_env(driver):
    """
    Pilih negara di form penagihan Canva sesuai BILLING_COUNTRY di .env.
    """
    country_code = (os.getenv("BILLING_COUNTRY") or "US").strip().upper()
    country_map = {
        "US": "United States",
        "USA": "United States",
        "ID": "Indonesia",
        "IDN": "Indonesia",
        "GB": "United Kingdom",
        "UK": "United Kingdom",
        "CA": "Canada",
        "AU": "Australia",
        "SG": "Singapore",
        "MY": "Malaysia",
    }
    target_country = country_map.get(country_code, country_code)
    dev_log(Fore.CYAN + f"[COUNTRY] Setting country to: '{target_country}' ({country_code})")

    def _do_select(d):
        btn = None
        for b in d.find_elements(By.CSS_SELECTOR, "button[aria-label='Country'], button[aria-label='Negara'], button[role='combobox']"):
            if b.is_displayed():
                btn = b
                break

        if not btn:
            return False

        current_txt = (btn.text or "").strip()
        if target_country.lower() in current_txt.lower():
            dev_log(Fore.GREEN + f"[COUNTRY] Country already selected: {current_txt}")
            return True

        # Click country dropdown
        try:
            d.execute_script("arguments[0].scrollIntoView({block:'center'}); arguments[0].click();", btn)
        except Exception:
            btn.click()
        time.sleep(1)

        # 1. Search input inside dropdown
        search_inps = d.find_elements(By.CSS_SELECTOR, "input[placeholder*='Search'], input[placeholder*='Cari'], input[type='search'], input[type='text']")
        for sinp in search_inps:
            if sinp.is_displayed():
                try:
                    sinp.send_keys(target_country)
                    time.sleep(0.5)
                    from selenium.webdriver.common.keys import Keys
                    sinp.send_keys(Keys.ENTER)
                    time.sleep(0.5)
                except Exception:
                    pass
                break

        # 2. Click matching role='option' element
        opts = d.find_elements(By.CSS_SELECTOR, "[role='option'], button[role='option'], li[role='option']")
        for opt in opts:
            try:
                txt = (opt.text or "").strip()
                if txt.lower() == target_country.lower():
                    d.execute_script("arguments[0].click();", opt)
                    dev_log(Fore.GREEN + f"[COUNTRY] Selected country option: {target_country}")
                    time.sleep(1)
                    return True
            except Exception:
                continue

        # Fallback: if dropdown is still open, send Escape to close overlay
        try:
            d.switch_to.active_element.send_keys(Keys.ESCAPE)
        except Exception:
            pass

        return True

    driver.switch_to.default_content()
    _fill_in_iframes(driver, _do_select)
    driver.switch_to.default_content()


def _find_and_fill_all_payment_fields(driver, card):
    """
    Search and fill payment fields:
    - Card Number: inside child iframe #1 of subscribe_widget
    - CVC: inside child iframe #2 (or subscribe_widget DOM)
    - Expiry: inside subscribe_widget DOM
    """
    card_num = str(card.get("number", "")).strip()
    card_cvc = str(card.get("cvc", "")).strip()
    exp = _exp_formats(card)
    exp_mmyy = exp.get("mm_yy", "")

    dev_log(Fore.CYAN + f"[VCC FILL] Target values: Card ...{card_num[-4:]} | Exp: {exp_mmyy} | CVC: {card_cvc}")

    driver.switch_to.default_content()
    iframes = driver.find_elements(By.TAG_NAME, "iframe")
    widget_frame = None
    for f in iframes:
        src = (f.get_attribute("src") or "").lower()
        if "subscribe_widget" in src:
            widget_frame = f
            break
    if not widget_frame and iframes:
        widget_frame = iframes[0]

    if widget_frame:
        driver.switch_to.frame(widget_frame)

    # 1. Check child iframes for Card Number and CVC
    sub_iframes = driver.find_elements(By.TAG_NAME, "iframe")
    dev_log(Fore.CYAN + f"[VCC] Found {len(sub_iframes)} child iframe(s) inside subscribe_widget")

    filled_card = False
    filled_cvc_iframe = False

    from selenium.webdriver.common.keys import Keys

    for idx, f in enumerate(sub_iframes):
        try:
            driver.switch_to.frame(f)
            inputs = driver.find_elements(By.TAG_NAME, "input")
            for inp in inputs:
                if inp.is_displayed():
                    if not filled_card:
                        dev_log(Fore.GREEN + f"[VCC] Injected Card Number into child iframe #{idx}: ...{card_num[-4:]}")
                        try:
                            driver.execute_script("arguments[0].focus(); arguments[0].click();", inp)
                        except Exception:
                            pass
                        time.sleep(0.1)
                        inp.send_keys(Keys.CONTROL + "a")
                        inp.send_keys(Keys.BACKSPACE)
                        time.sleep(0.1)
                        for char in card_num:
                            inp.send_keys(char)
                            time.sleep(0.02)
                        driver.execute_script("""
                            var el = arguments[0];
                            var val = arguments[1];
                            try {
                                var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                                if (nativeInputValueSetter) { nativeInputValueSetter.call(el, val); } else { el.value = val; }
                            } catch(e){}
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            el.dispatchEvent(new Event('blur', { bubbles: true }));
                        """, inp, card_num)
                        filled_card = True
                        break
                    elif not filled_cvc_iframe:
                        dev_log(Fore.GREEN + f"[VCC] Injected CVC ({card_cvc}) into child iframe #{idx}")
                        try:
                            driver.execute_script("arguments[0].focus(); arguments[0].click();", inp)
                        except Exception:
                            pass
                        time.sleep(0.1)
                        inp.send_keys(Keys.CONTROL + "a")
                        inp.send_keys(Keys.BACKSPACE)
                        time.sleep(0.1)
                        for char in card_cvc:
                            inp.send_keys(char)
                            time.sleep(0.02)
                        driver.execute_script("""
                            var el = arguments[0];
                            var val = arguments[1];
                            try {
                                var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                                if (nativeInputValueSetter) { nativeInputValueSetter.call(el, val); } else { el.value = val; }
                            } catch(e){}
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            el.dispatchEvent(new Event('blur', { bubbles: true }));
                        """, inp, card_cvc)
                        filled_cvc_iframe = True
                        break
            driver.switch_to.parent_frame()
        except Exception:
            try:
                driver.switch_to.parent_frame()
            except Exception:
                pass

    # 2. Fill Expiry and CVC (if not filled via iframe) in subscribe_widget DOM
    inputs = driver.find_elements(By.TAG_NAME, "input")
    expiry_input = None
    cvc_input = None

    text_inputs = []
    for inp in inputs:
        try:
            if not inp.is_displayed():
                continue
            ph = (inp.get_attribute("placeholder") or "").lower()
            aria = (inp.get_attribute("aria-describedby") or "").lower()
            ac = (inp.get_attribute("autocomplete") or "").lower()
            name = (inp.get_attribute("name") or "").lower()

            if "address" in ph or "billing" in ph or "alamat" in ph:
                continue

            if "expiry" in aria or "exp" in ac or "expiry" in name or "mm" in ph or "bb" in ph or "kedaluwarsa" in ph or "kedaluwarsa" in aria:
                expiry_input = inp
            elif "security" in aria or "csc" in ac or "cvc" in ph or "cvv" in ph or "cvc" in name or "security" in name or "kode keamanan" in ph:
                cvc_input = inp
            elif inp.get_attribute("type") in ("text", "tel", "number") or inp.get_attribute("inputmode") == "numeric":
                text_inputs.append(inp)
        except Exception:
            continue

    if not expiry_input and text_inputs:
        expiry_input = text_inputs[0]
    if not cvc_input and len(text_inputs) > 1:
        cvc_input = text_inputs[1] if text_inputs[0] == expiry_input else text_inputs[0]
    elif not cvc_input and text_inputs and text_inputs[0] != expiry_input:
        cvc_input = text_inputs[0]

    if expiry_input:
        dev_log(Fore.GREEN + f"[VCC] Injected Expiry ({exp_mmyy})")
        _type_into_input_field(driver, expiry_input, exp_mmyy)

    if not filled_cvc_iframe and cvc_input and cvc_input != expiry_input:
        dev_log(Fore.GREEN + f"[VCC] Injected CVC ({card_cvc}) into DOM input")
        _type_into_input_field(driver, cvc_input, card_cvc)

    driver.switch_to.default_content()


def clear_all_card_fields(driver):
    """
    Hapus bersih SEMUA kolom kartu (Nomor kartu, Expiry BB/TT, CVC) sebelum
    mengetik ulang data kartu baru pada saat rotasi/loop kartu.
    """
    from selenium.webdriver.common.keys import Keys
    dev_log("[CLEAR] Menghapus semua teks kartu lama (Nomor, BB/TT, CVC)...")

    driver.switch_to.default_content()
    subs = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")
    if subs:
        driver.switch_to.frame(subs[0])

    # 1. Bersihkan child iframe (Nomor Kartu dan CVC TokenEx)
    child_frames = driver.find_elements(By.TAG_NAME, "iframe")
    for idx, f in enumerate(child_frames):
        try:
            driver.switch_to.frame(f)
            inps = driver.find_elements(By.TAG_NAME, "input")
            for inp in inps:
                try:
                    inp.click()
                except Exception:
                    driver.execute_script("arguments[0].click();", inp)
                inp.send_keys(Keys.CONTROL + "a")
                inp.send_keys(Keys.BACKSPACE)
                driver.execute_script(r"""
                    var el = arguments[0];
                    try {
                        var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                        if (setter) { setter.call(el, ''); }
                    } catch(e) {}
                    el.value = '';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new Event('blur', { bubbles: true }));
                """, inp)
                for _ in range(25):
                    inp.send_keys(Keys.BACKSPACE)
                    inp.send_keys(Keys.DELETE)
            driver.switch_to.parent_frame()
        except Exception:
            try:
                driver.switch_to.parent_frame()
            except Exception:
                pass

    # 2. Bersihkan input Kedaluwarsa (BB/TT) di subscribe_widget DOM
    exp_inps = driver.find_elements(By.CSS_SELECTOR, "input[aria-describedby*='expiryDate'], input[aria-describedby*='expiry'], input[autocomplete='cc-exp'], input[name*='expiry']")
    if not exp_inps:
        exp_inps = driver.find_elements(By.XPATH, r"""
            //label[contains(.,'Kedaluwarsa') or contains(.,'BB/TT') or contains(.,'Expiry') or contains(.,'MM/YY')]//input
            | //input[@autocomplete='cc-exp']
            | //input[contains(@placeholder, 'BB') or contains(@placeholder, 'MM')]
        """)
    if not exp_inps:
        # Fallback JS search for expiry input
        exp_inps = driver.execute_script(r"""
            const labels = Array.from(document.querySelectorAll('label, div, span')).filter(el => {
                const t = (el.innerText || el.textContent || '').trim().toLowerCase();
                return (t.includes('kedaluwarsa') || t.includes('bb/tt') || t.includes('expiry')) && t.length < 50;
            });
            const results = [];
            for (const lbl of labels) {
                const forId = lbl.getAttribute('for');
                if (forId) {
                    const el = document.getElementById(forId);
                    if (el && el.tagName === 'INPUT') results.push(el);
                }
                const inp = lbl.querySelector('input') || lbl.parentElement?.querySelector('input');
                if (inp && inp.tagName === 'INPUT' && !results.includes(inp)) results.push(inp);
            }
            return results;
        """) or []

    for exp_inp in exp_inps:
        try:
            ph = (exp_inp.get_attribute("placeholder") or "").lower()
            ac = (exp_inp.get_attribute("autocomplete") or "").lower()
            if any(k in ph for k in ["alamat", "address", "penagihan"]) or any(k in ac for k in ["address"]):
                continue
            exp_inp.click()
            exp_inp.send_keys(Keys.CONTROL + "a")
            exp_inp.send_keys(Keys.BACKSPACE)
            driver.execute_script(r"""
                var el = arguments[0];
                try {
                    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    if (setter) { setter.call(el, ''); }
                } catch(e) {}
                el.value = '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
            """, exp_inp)
            for _ in range(8):
                exp_inp.send_keys(Keys.BACKSPACE)
                exp_inp.send_keys(Keys.DELETE)
        except Exception:
            pass

    driver.switch_to.default_content()
    dev_log("[CLEAR] Semua kolom kartu lama (Nomor, BB/TT, CVC) berhasil dibersihkan total!")
    time.sleep(0.3)


def set_billing_country_and_address(driver, target_country=None):
    """
    Mengatur negara penagihan (US atau ID / Indonesia) di formulir checkout Canva Bisnis.
    - Jika target ID (Indonesia):
      Canva default negara penagihan sudah Indonesia, dan Canva Indonesia TIDAK memerlukan
      pengisian alamat lagi. Langsung lanjut ke pengisian kartu kredit dan submit trial.
    - Jika target US (Amerika Serikat):
      Ubah dropdown negara ke Amerika Serikat, ketik alamat random US & klik saran popover Canva.
    """
    country = (target_country or get_billing_country()).upper()
    is_id = country in ["ID", "INDO", "INDONESIA"]

    if is_id:
        CLI.sub_info("Negara Penagihan", "Indonesia (Tanpa Alamat)")
        dev_log(Fore.GREEN + "[BILLING] Mode Indonesia: Canva default negara Indonesia & tidak memerlukan alamat. Langsung proses kartu & submit trial.")
        return True

    addr = get_random_billing_address(country)
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.common.action_chains import ActionChains

    # 1. Pastikan fokus berada di dalam iframe subscribe_widget
    try:
        driver.switch_to.default_content()
        subs = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")
        if subs:
            driver.switch_to.frame(subs[0])
    except Exception:
        pass

    # 2. Cek apakah negara saat ini sudah sesuai target
    try:
        current_country_text = driver.execute_script(r"""
            const btns = Array.from(document.querySelectorAll("button, [role='combobox'], [role='button']"));
            const target = btns.find(b => {
                const t = (b.innerText || b.textContent || '').trim().toLowerCase();
                const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                return (aria.includes('negara') || aria.includes('country') || t === 'indonesia' || t.startsWith('indonesia') || t.includes('amerika')) && !t.includes('rp');
            });
            return target ? (target.innerText || target.textContent || '').trim() : '';
        """) or ""
    except Exception:
        current_country_text = ""

    c_low = current_country_text.lower().strip()
    if is_id:
        is_already_target = "indonesia" in c_low
    else:
        is_already_target = "amerika" in c_low or "united states" in c_low

    if is_already_target:
        if is_id:
            CLI.sub_info("Negara Penagihan", "Indonesia (ID)")
        else:
            CLI.sub_info("Negara Penagihan", "Amerika Serikat (US)")
    else:
        # Perlu ganti negara di dropdown
        search_term = "Indonesia" if is_id else "Amerika"
        target_name = "Indonesia" if is_id else "Amerika Serikat"
        country_selected = False

        for attempt in range(1, 4):
            # 3A. Klik tombol dropdown negara
            try:
                country_btns = driver.find_elements(
                    By.XPATH,
                    "//button[@aria-label='Negara' or @aria-label='Country' or contains(.,'Indonesia') or contains(.,'Amerika')]"
                )
                for cbtn in country_btns:
                    if cbtn.is_displayed():
                        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", cbtn)
                        try:
                            cbtn.click()
                        except Exception:
                            driver.execute_script("arguments[0].click();", cbtn)
                        break
            except Exception:
                pass

            time.sleep(0.7)
            snap(driver, f"checkout_01_country_dropdown_opened_{country}")

            # 3B. Coba cari target_name di dalam list dropdown
            country_selected = driver.execute_script(r"""
                const targetText = arguments[0];
                const all = Array.from(document.querySelectorAll('*'));
                const el = all.find(item => {
                    const t = (item.innerText || item.textContent || '').trim();
                    return t === targetText && item.children.length === 0;
                });
                if (el) {
                    el.scrollIntoView({block:'center'});
                    el.click();
                    return true;
                }
                return false;
            """, target_name)

            if not country_selected:
                # Coba ketik di search box di dalam subscribe_widget
                driver.execute_script(r"""
                    const searchTerm = arguments[0];
                    const inps = Array.from(document.querySelectorAll('input'));
                    const sinp = inps.find(i => {
                        const ph = (i.placeholder || '').toLowerCase();
                        return ph.includes('cari') || ph.includes('search') || (!ph.includes('kartu') && !ph.includes('alamat') && i.type === 'text');
                    });
                    if (sinp) {
                        sinp.focus();
                        sinp.value = searchTerm;
                        sinp.dispatchEvent(new Event('input', { bubbles: true }));
                        sinp.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    }
                    return false;
                """, search_term)
                time.sleep(0.6)
                country_selected = driver.execute_script(r"""
                    const targetText = arguments[0];
                    const all = Array.from(document.querySelectorAll('*'));
                    const el = all.find(item => {
                        const t = (item.innerText || item.textContent || '').trim();
                        return t === targetText && item.children.length === 0;
                    });
                    if (el) { el.click(); return true; }
                    return false;
                """, target_name)

            if not country_selected:
                # Fallback di default_content jika ada popover terpisah
                try:
                    driver.switch_to.default_content()
                    cand = driver.find_elements(
                        By.XPATH,
                        f"//*[normalize-space(text())='{target_name}'] | //*[@role='option'][contains(.,'{target_name}')]"
                    )
                    for c in cand:
                        if c.is_displayed():
                            driver.execute_script("arguments[0].click();", c)
                            country_selected = True
                            break
                except Exception:
                    pass

            # Kembalikan fokus ke subscribe_widget setelah pilih negara
            try:
                driver.switch_to.default_content()
                subs3 = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")
                if subs3:
                    driver.switch_to.frame(subs3[0])
            except Exception:
                pass

            time.sleep(0.8)
            snap(driver, f"checkout_02_country_selected_{country}")

            if country_selected:
                CLI.sub_info("Negara Penagihan", f"{target_name} ({country})")
                break

    # 4. ISI ALAMAT RANDOM (US atau ID)
    time.sleep(0.5)

    try:
        driver.execute_script(r"""
            const scrollables = Array.from(document.querySelectorAll('*')).filter(el => {
                const st = window.getComputedStyle(el);
                return (st.overflowY === 'auto' || st.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
            });
            for (const s of scrollables) { s.scrollTop = s.scrollHeight; }
        """)
    except Exception:
        pass
    time.sleep(0.3)

    # 4A. Alamat Baris 1 (Street Address) & Klik Pilihan Saran Canva
    try:
        # Pastikan berada di dalam iframe subscribe_widget
        driver.switch_to.default_content()
        subs = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")
        if subs:
            driver.switch_to.frame(subs[0])

        addr_selectors = [
            "input[autocomplete*='search-with-keyboard-handler']",
            "input[placeholder*='alamat penagihan']",
            "input[placeholder*='Address']",
            "input[placeholder*='alamat']",
            "input[autocomplete*='address-line1']",
            "input[name*='addressLine1']",
            "input[id*='address-line1']",
            "input[id*='id2']",
        ]
        addr_input = None
        for sel in addr_selectors:
            found = driver.find_elements(By.CSS_SELECTOR, sel)
            for f in found:
                if f.is_displayed():
                    addr_input = f
                    break
            if addr_input:
                break

        if addr_input:
            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", addr_input)
            time.sleep(0.3)
            try:
                addr_input.click()
            except Exception:
                driver.execute_script("arguments[0].focus(); arguments[0].click();", addr_input)

            # Bersihkan kolom input
            addr_input.send_keys(Keys.CONTROL + "a")
            addr_input.send_keys(Keys.BACKSPACE)
            time.sleep(0.2)

            street_query = addr["line1"]
            street_first_word = street_query.split()[0].lower() if street_query else ""
            dev_log(f"[ADDRESS FLOW] Mengetik alamat ({country}): '{street_query}' untuk memicu dropdown saran Canva...")
            for ch in street_query:
                addr_input.send_keys(ch)
                time.sleep(0.04)

            # Tunggu dan KLIK pilihan saran alamat yang muncul langsung di bawah input
            sugg_clicked = False
            selected_sugg_text = ""

            dev_log(f"[ADDRESS FLOW] Menunggu popover saran alamat Canva muncul...")
            for wait_sugg in range(12):  # Polling hingga 6 detik
                time.sleep(0.5)

                # 1. Cek & klik via JS: Cari tombol saran langsung di dalam popover (di atas 'secara manual')
                sugg_res = driver.execute_script(r"""
                    const streetFirst = arguments[0];
                    const fullStreet = arguments[1].toLowerCase();
                    const all = Array.from(document.querySelectorAll('*'));
                    
                    // Cara A: Temukan link/tombol 'secara manual', lalu ambil tombol saran pertama di dalam kontainer yang sama
                    const manualEl = all.find(el => {
                        const t = (el.innerText || el.textContent || '').trim().toLowerCase();
                        return t.includes('secara manual') && el.offsetHeight > 0;
                    });

                    if (manualEl) {
                        const container = manualEl.closest("div[class*='x'], div[role='dialog'], div[role='listbox'], div") || manualEl.parentElement;
                        if (container) {
                            const btns = Array.from(container.querySelectorAll("button, [role='button'], div[role='option'], div[class*='t_WlAQ']")).filter(b => {
                                const t = (b.innerText || b.textContent || '').trim().toLowerCase();
                                return t && !t.includes('secara manual') && !t.includes('kembali');
                            });
                            if (btns.length > 0) {
                                // Prioritaskan pilihan yang memuat 'cox' atau 'gastonia' atau '969' sesuai yang diketik
                                const target = btns.find(b => {
                                    const t = (b.innerText || b.textContent || '').toLowerCase();
                                    return (t.includes('969') && (t.includes('cox') || t.includes('gastonia'))) || t.includes('gastonia') || t.includes('cox');
                                }) || btns[0];
                                target.scrollIntoView({block: 'center', inline: 'center'});
                                ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
                                    target.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window, buttons: 1 }));
                                });
                                if (typeof target.click === 'function') target.click();
                                const sp = target.querySelector('span');
                                if (sp && typeof sp.click === 'function') sp.click();
                                return { clicked: true, text: target.innerText || target.textContent || '' };
                            }
                        }
                    }

                    // Cara B: Cari tombol bertipe 'button' yang memuat nama jalan/kota/negara
                    const btns = Array.from(document.querySelectorAll("button, [role='button']"));
                    for (const b of btns) {
                        if (b.disabled || b.offsetHeight === 0) continue;
                        const t = (b.innerText || b.textContent || '').trim();
                        const tl = t.toLowerCase();

                        if (tl === 'kembali' || tl === 'nanti saja' || tl.includes('dapatkan') || 
                            tl === 'keluar' || tl === 'amerika serikat' || tl === 'indonesia' || tl.includes('secara manual') || 
                            tl.includes('persyaratan') || tl.includes('kebijakan') || tl.includes('jatuh tempo')) {
                            continue;
                        }

                        const hasMatch = (tl.includes('969') && tl.includes('cox')) || tl.includes('gastonia') || 
                                         tl.includes('cox rd') || (streetFirst && tl.includes(streetFirst)) || tl.includes(fullStreet);
                        if (hasMatch || (tl.includes('969') && tl.includes('nc')) || (tl.includes(',') && (tl.includes('gastonia') || tl.includes('28054')))) {
                            b.scrollIntoView({block: 'center', inline: 'center'});
                            ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
                                b.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window, buttons: 1 }));
                            });
                            if (typeof b.click === 'function') b.click();
                            return { clicked: true, text: t };
                        }
                    }
                    return null;
                """, street_first_word, street_query)

                if sugg_res and sugg_res.get("clicked"):
                    sugg_clicked = True
                    selected_sugg_text = sugg_res.get("text", "")
                    dev_log(Fore.GREEN + f"[ADDRESS FLOW] [✓] Berhasil klik pilihan saran alamat Canva (JS): '{selected_sugg_text}'")
                    break

                # 2. Cek & klik via Selenium native XPath
                try:
                    xpath_suggs = driver.find_elements(
                        By.XPATH,
                        "//*[contains(text(),'secara manual')]/ancestor::div[1]//button[contains(.,'Cox') or contains(.,'Gastonia') or contains(.,'969')]"
                        " | //button[contains(.,'Cox') or contains(.,'Gastonia')]"
                        " | //*[contains(text(),'secara manual')]/ancestor::div[1]//button[not(contains(.,'secara manual'))]"
                        " | //*[contains(text(),'secara manual')]/preceding::button[1]"
                        " | //button[contains(@class,'t_WlAQ')]"
                        " | //button[contains(.,',') and not(contains(.,'Dapatkan')) and not(contains(.,'Samoa')) and not(contains(.,'Keluar'))]"
                    )
                    for c in xpath_suggs:
                        if c.is_displayed():
                            t = c.text.strip()
                            t_low = t.lower()
                            if t and "secara manual" not in t_low and "dapatkan" not in t_low and "keluar" not in t_low and t_low != "amerika serikat" and t_low != "indonesia":
                                driver.execute_script("arguments[0].scrollIntoView({block:'center'});", c)
                                time.sleep(0.1)
                                try:
                                    c.click()
                                except Exception:
                                    try:
                                        ActionChains(driver).move_to_element(c).click().perform()
                                    except Exception:
                                        driver.execute_script("arguments[0].click();", c)
                                sugg_clicked = True
                                selected_sugg_text = t
                                dev_log(Fore.GREEN + f"[ADDRESS FLOW] [✓] Berhasil klik pilihan saran alamat Canva (Selenium): '{t}'")
                                break
                    if sugg_clicked:
                        break
                except Exception:
                    pass

                # 3. Coba kirim ArrowDown + Enter ke input alamat
                try:
                    addr_input.send_keys(Keys.ARROW_DOWN)
                    time.sleep(0.15)
                    addr_input.send_keys(Keys.ENTER)
                except Exception:
                    pass

            # Loop konfirmasi: pastikan popover benar-benar menutup
            for loop_close in range(5):
                time.sleep(0.3)
                is_popover_open = driver.execute_script(r"""
                    const all = Array.from(document.querySelectorAll('*'));
                    const manualEl = all.find(el => {
                        const t = (el.innerText || el.textContent || '').trim().toLowerCase();
                        return t.includes('secara manual') && el.offsetHeight > 0;
                    });
                    return manualEl !== undefined && manualEl !== null;
                """)
                if not is_popover_open:
                    dev_log(Fore.GREEN + "[ADDRESS FLOW] [✓] Popover saran alamat telah tertutup sempurna!")
                    break
                else:
                    # Popover masih terbuka, klik ulang tombol pertama di dalam popover
                    driver.execute_script(r"""
                        const all = Array.from(document.querySelectorAll('*'));
                        const manualEl = all.find(el => {
                            const t = (el.innerText || el.textContent || '').trim().toLowerCase();
                            return t.includes('secara manual') && el.offsetHeight > 0;
                        });
                        if (manualEl) {
                            const container = manualEl.closest("div[class*='x'], div[role='dialog'], div") || manualEl.parentElement;
                            if (container) {
                                const btns = Array.from(container.querySelectorAll("button, [role='button']")).filter(b => {
                                    const t = (b.innerText || b.textContent || '').trim().toLowerCase();
                                    return t && !t.includes('secara manual') && !t.includes('kembali');
                                });
                                if (btns.length > 0) {
                                    btns[0].click();
                                    const sp = btns[0].querySelector('span');
                                    if (sp) sp.click();
                                }
                            }
                        }
                    """)
                    try:
                        addr_input.send_keys(Keys.ARROW_DOWN)
                        time.sleep(0.1)
                        addr_input.send_keys(Keys.ENTER)
                    except Exception:
                        pass

            # Cek nilai akhir isian alamat
            final_val = ""
            try:
                final_val = (addr_input.get_attribute("value") or "").strip()
            except Exception:
                pass

            display_addr = selected_sugg_text or final_val or street_query
            CLI.sub_info(f"Pilihan Alamat ({country})", display_addr[:38])
            dev_log(Fore.GREEN + f"[ADDRESS FLOW] [✓] Alamat {country} terpilih: '{display_addr}'")
            time.sleep(0.5)

            # Jika TIDAK ada saran sama sekali (offline/timeout), fallback opsi manual
            if not sugg_clicked and not ("," in final_val):
                dev_log(Fore.YELLOW + f"[ADDRESS FLOW] Saran alamat {country} tidak muncul, mengaktifkan pengisian manual...")
                driver.execute_script(r"""
                    const links = Array.from(document.querySelectorAll("a, button, [role='button']"));
                    const manualLink = links.find(l => (l.innerText || '').toLowerCase().includes('secara manual'));
                    if (manualLink) { manualLink.click(); }
                """)
                time.sleep(0.5)
    except Exception:
        pass

    # 4B. Kota, State, ZIP
    time.sleep(0.3)
    try:
        driver.execute_script(r"""
            const line1 = arguments[0];
            const city = arguments[1];
            const state = arguments[2];
            const zip = arguments[3];
            const inps = Array.from(document.querySelectorAll("input, select"));
            for (const el of inps) {
                if (el.disabled || el.type === 'radio' || el.type === 'hidden') continue;
                const ph = (el.placeholder || '').toLowerCase();
                const nm = (el.name || '').toLowerCase();
                const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
                const id = (el.id || '').toLowerCase();
                const aria = (el.getAttribute('aria-label') || '').toLowerCase();

                // 1. Alamat Baris 1 (Street Address)
                if (ac.includes('address-line1') || ph.includes('baris 1') || nm.includes('line1') || nm.includes('address1') || id.includes('address-line1')) {
                    if (!el.value || el.value.length < 3) {
                        el.focus(); el.value = line1;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.dispatchEvent(new Event('blur', { bubbles: true }));
                    }
                }

                // 2. Kota (City)
                if (ac.includes('address-level2') || ph.includes('kota') || ph.includes('city') || nm.includes('city') || aria.includes('city')) {
                    if (!el.value || el.value.length < 2) {
                        el.focus(); el.value = city;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.dispatchEvent(new Event('blur', { bubbles: true }));
                    }
                }

                // 3. Negara Bagian (State - NC / North Carolina)
                if (ac.includes('address-level1') || ph.includes('state') || ph.includes('provinsi') || nm.includes('state') || aria.includes('state') || aria.includes('bagian')) {
                    if (el.tagName === 'SELECT') {
                        const opt = Array.from(el.options).find(o => o.value === state || o.text.includes(state) || o.text.includes('North Carolina') || o.value === 'North Carolina');
                        if (opt) { el.value = opt.value; }
                    } else if (!el.value || el.value.length < 2) {
                        el.focus(); el.value = state;
                    }
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new Event('blur', { bubbles: true }));
                }

                // 4. Kode Pos (ZIP - 28054-3455)
                if (ac.includes('postal-code') || ph.includes('zip') || ph.includes('pos') || nm.includes('zip') || nm.includes('pos') || id.includes('zip')) {
                    if (!el.value || el.value.length < 3) {
                        el.focus(); el.value = zip;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.dispatchEvent(new Event('blur', { bubbles: true }));
                    }
                }
            }
        """, addr["line1"], addr["city"], addr["state"], addr["zip"])
    except Exception:
        pass

    snap(driver, f"checkout_03_address_{country}_filled")

    # Scroll kembali ke atas menuju formulir kartu
    try:
        driver.execute_script(r"""
            const scrollables = Array.from(document.querySelectorAll('*')).filter(el => {
                const st = window.getComputedStyle(el);
                return (st.overflowY === 'auto' || st.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
            });
            for (const s of scrollables) { s.scrollTop = 0; }
        """)
    except Exception:
        pass

    return True


def set_us_country_and_address(driver):
    """Fungsi pembungkus kompatibilitas: menggunakan target_country global (US / ID)."""
    return set_billing_country_and_address(driver)


def _fill_canva_vcc_full(driver, card):
    """
    Isi VCC Canva Bisnis secara SUPER CEPAT & PRESISI:
    1. Ganti Negara ke 'Amerika Serikat' (US) & isi alamat random USA DULUAN!
    2. HAPUS SEMUA DATA KARTU LAMA (clear total) agar tidak menabrak kartu sebelumnya!
    3. TokenEx Card iframe (Mode=Data) -> ketik 16 digit nomor kartu
    4. Expiry input -> ketik MMYY baru secara presisi
    5. TokenEx CVV iframe (Mode=CVV) -> ketik 3 digit CVC
    6. Verifikasi KETIGA kolom terisi dan tidak ada yang tertukar/kosong
    """
    card_num = str(card.get("number", "")).strip()
    card_cvc = str(card.get("cvc", "")).strip()
    exp = _exp_formats(card)
    exp_val = card.get("exp_month", "") + card.get("exp_year", "")
    last4 = card_num[-4:] if len(card_num) >= 4 else card_num

    driver.switch_to.default_content()
    subs = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")
    if not subs:
        return False

    # 1. Atur Negara Penagihan & Isi Alamat Random (US / ID) PERTAMA KALI!
    try:
        set_billing_country_and_address(driver)
    except Exception as e:
        dev_log(f"[ADDRESS FLOW] Warning saat set_billing_country_and_address: {e}", level="warning")

    time.sleep(0.5)

    # 2. HAPUS SEMUA DATA KARTU LAMA SEBELUM MENGETIK DATA KARTU BARU!
    clear_all_card_fields(driver)

    driver.switch_to.default_content()
    subs = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")
    if subs:
        driver.switch_to.frame(subs[0])

    filled_num = False
    filled_exp = False
    filled_cvc = False

    try:
        # 3. IDENTIFIKASI IFRAME NOMOR KARTU & CVC SECARA PRESISI (TIDAK AKAN TERTUKAR!)
        all_iframes = driver.find_elements(By.TAG_NAME, "iframe")
        card_frame = None
        cvc_frame = None

        for f in all_iframes:
            try:
                title = (f.get_attribute("title") or "").lower()
                src = (f.get_attribute("src") or "").lower()
                p_id = ""
                try:
                    p_id = (f.find_element(By.XPATH, "..").get_attribute("id") or "").lower()
                except Exception:
                    pass

                # CVC iframe: Mode=CVV atau parent id mengandung cvv/cvc
                if "cvv" in p_id or "cvc" in p_id or "keamanan" in title or "cvc" in title or "mode=cvv" in src:
                    cvc_frame = f
                # Card iframe: Mode=Data atau parent id mengandung card
                elif "card" in p_id or "kartu" in title or "mode=data" in src or "pan" in src:
                    card_frame = f
            except Exception:
                pass

        # Fallback jika belum teridentifikasi berdasarkan atribut
        if not card_frame and len(all_iframes) >= 1:
            card_frame = all_iframes[0]
        if not cvc_frame and len(all_iframes) >= 2:
            cvc_frame = all_iframes[1]

        # Hapus overlay popover alamat & scroll ke atas menuju input kartu
        driver.execute_script(r"""
            if (document.activeElement) document.activeElement.blur();
            const overlays = Array.from(document.querySelectorAll('.x1o0tod, div[class*="x1o0tod"]'));
            for (const o of overlays) { o.remove(); }
            const scrollables = Array.from(document.querySelectorAll('*')).filter(el => {
                const st = window.getComputedStyle(el);
                return (st.overflowY === 'auto' || st.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
            });
            for (const s of scrollables) { s.scrollTop = 0; }
        """)
        time.sleep(0.3)

        # 4. KETIK NOMOR KARTU (16 Digit ke Card Frame)
        if card_frame:
            driver.switch_to.frame(card_frame)
            for inp in driver.find_elements(By.TAG_NAME, "input"):
                if inp.get_attribute("type") != "hidden" and inp.is_displayed():
                    _type_into_input_field(driver, inp, card_num)
                    filled_num = True
                    break
            driver.switch_to.parent_frame()

        # 5. KETIK KEDALUWARSA (BB/TT) di subscribe_widget DOM
        exp_input = None

        # Cara 1: CSS selector langsung yang spesifik untuk field expiry Canva
        for cand in driver.find_elements(By.CSS_SELECTOR, "input[aria-describedby*='expiryDate'], input[aria-describedby*='expiry'], input[autocomplete='cc-exp'], input[name*='expiry']"):
            if cand.is_displayed() and cand.get_attribute('type') != 'radio':
                exp_input = cand
                break

        # Cara 2: input yang ADA DI DALAM label Kedaluwarsa (descendant)
        if not exp_input:
            exp_candidates = driver.find_elements(By.XPATH,
                "//label[.//p[contains(text(),'Kedaluwarsa')] or contains(.,'Kedaluwarsa')]//input"
                " | //label[contains(.,'BB/TT')]//input"
                " | //input[@autocomplete='cc-exp']"
            )
            for cand in exp_candidates:
                if cand.is_displayed() and cand.get_attribute('type') != 'radio':
                    exp_input = cand
                    break

        if not exp_input:
            exp_found = driver.execute_script(r"""
                const labels = Array.from(document.querySelectorAll('label'));
                for (const lbl of labels) {
                    const t = (lbl.innerText || lbl.textContent || '').trim().toLowerCase();
                    if (!t.includes('kedaluwarsa') && !t.includes('bb/tt') && !t.includes('expiry')) continue;
                    const inp = lbl.querySelector('input[type="text"], input:not([type="radio"]):not([type="hidden"])');
                    if (inp && inp.offsetParent !== null) return inp;
                    const parent = lbl.parentElement;
                    if (parent) {
                        const inp2 = parent.querySelector('input[type="text"]');
                        if (inp2 && inp2.offsetParent !== null) return inp2;
                    }
                }
                const allInputs = Array.from(document.querySelectorAll('input[type="text"]')).filter(i => {
                    if (!i.offsetParent) return false;
                    const ph = (i.placeholder || '').toLowerCase();
                    if (ph.includes('alamat') || ph.includes('address') || ph.includes('masukkan')) return false;
                    return true;
                });
                if (allInputs.length > 0) return allInputs[0];
                return null;
            """)
            if exp_found:
                exp_input = exp_found

        if exp_input:
            _type_into_input_field(driver, exp_input, exp.get("mm_yy", exp_val))
            filled_exp = True

        # 6. KETIK CVC (3 Digit ke CVC Frame, bukan card frame!)
        if cvc_frame and cvc_frame != card_frame:
            driver.switch_to.frame(cvc_frame)
            for inp in driver.find_elements(By.TAG_NAME, "input"):
                if inp.get_attribute("type") != "hidden" and inp.is_displayed():
                    _type_into_input_field(driver, inp, card_cvc)
                    time.sleep(0.2)
                    val_now = (inp.get_attribute("value") or "").strip()
                    if len(val_now) < len(card_cvc):
                        # Jika terpotong (misal hanya 1 digit '7'), ketik ulang utuh
                        inp.clear()
                        inp.send_keys(card_cvc)
                        time.sleep(0.1)
                    filled_cvc = True
                    break
            driver.switch_to.parent_frame()

    except Exception:
        pass

    # Fallback jika salah satu field kartu belum lengkap
    if not (filled_num and filled_exp and filled_cvc):
        driver.switch_to.default_content()
        fallback_ok = fill_card_fields(driver, card)
        if fallback_ok:
            filled_num = True
            filled_exp = True
            filled_cvc = True

    driver.switch_to.default_content()
    all_ok = filled_num and filled_exp and filled_cvc
    return all_ok

def upgrade_to_business_via_gb_pricing(driver):
    """(DEPRECATED) Digantikan sepenuhnya oleh open_business_trial_harga_id."""
    return open_business_trial_harga_id(driver)



def select_credit_card_option(driver):
    """
    Pilih opsi 'Kartu kredit atau debit' secara instan dan presisi:
    1. Cek langsung apakah form kartu / TokenEx sudah terbuka. Jika sudah, RETURN TRUE seketika.
    2. Jika belum, masuk ke iframe subscribe_widget, auto-scroll container dan klik radio kartu (value=13).
    3. Verifikasi cepat kemunculan TokenEx iframe tanpa loop buta dan tanpa spam screenshot.
    """
    driver.switch_to.default_content()
    subs = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")
    if not subs:
        return True

    try:
        driver.switch_to.frame(subs[0])

        # 1. Cek apakah form kartu / TokenEx SUDAH aktif
        already_open = driver.execute_script("""
            return document.querySelector('iframe[src*="tokenex"], iframe[id*="card"], input[autocomplete*="cc-number"]') !== null;
        """)
        if already_open:
            driver.switch_to.default_content()
            return True

        # 2. Advance jika masih di layar paket
        adv_clicked = driver.execute_script("""
            const btns = Array.from(document.querySelectorAll('button, [type="submit"]'));
            const b = btns.find(x => {
                const t = (x.innerText || '').toLowerCase();
                return (t.includes('tinjau') || t.includes('berikutnya') || t.includes('lanjutkan') || t.includes('next')) && !t.includes('dapatkan');
            });
            if (b) { b.click(); return true; }
            return false;
        """)
        if adv_clicked:
            time.sleep(0.8)

        # 3. Auto-scroll container pembayaran & pilih radio Kartu Kredit (value 13 / VAULTED_CREDIT_CARD)
        selected = driver.execute_script("""
            const allScrollables = Array.from(document.querySelectorAll('*')).filter(el => {
                return el.scrollHeight > el.clientHeight && el.scrollHeight > 150;
            });
            for (const s of allScrollables) { s.scrollTop = s.scrollHeight; }

            const allRadios = Array.from(document.querySelectorAll('input[type="radio"], [role="radio"]'));
            let target = allRadios.find(r => (r.value && r.value.includes('13')) || r.getAttribute('data-provider') === 'VAULTED_CREDIT_CARD');
            if (!target) {
                target = allRadios.find(r => {
                    const txt = (r.closest('label')?.textContent || r.parentElement?.textContent || '').toLowerCase();
                    return (txt.includes('kartu') || txt.includes('credit') || txt.includes('debit')) && !txt.includes('bulanan') && !txt.includes('tahunan');
                });
            }
            if (!target && allRadios.length >= 4) {
                target = allRadios[allRadios.length - 1];
            }
            if (target) {
                target.scrollIntoView({block:'center', inline:'center'});
                target.focus();
                const label = target.closest('label') || target.parentElement;
                if (label) label.click();
                target.click();
                target.dispatchEvent(new Event('input', { bubbles: true }));
                target.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
            return false;
        """)
        if selected:
            dev_log("[CARD OPTION] Opsi Kartu kredit atau debit berhasil dipilih!")
            time.sleep(0.6)

    except Exception:
        pass
    finally:
        driver.switch_to.default_content()

    return True


def smart_detect_current_state(driver):
    """
    Mendeteksi posisi / state Canva saat ini:
    - 'SUCCESS': Berhasil aktif (menu/dashboard atau subscription aktif)
    - 'SERVER_ERROR': Canva menampilkan 'Server kami mengalami masalah'
    - 'REAUTH_PASSWORD': Canva meminta input password
    - 'REAUTH_OTP': Canva meminta input kode OTP
    - 'PLAN_SELECTION': Di modal pilihan paket / ada tombol 'Lanjutkan' / 'Berikutnya'
    - 'PAYMENT_SELECTION': Di layar metode pembayaran tapi form kartu belum terbuka
    - 'CARD_FORM': Di form input kartu kredit (TokenEx / Expiry / Address)
    - 'PRICING_PAGE': Di halaman /harga/ atau ada card Canva Bisnis (subscribe_widget belum buka)
    - 'UNKNOWN': State belum terdefinisi
    """
    driver.switch_to.default_content()
    url = (driver.current_url or "").lower()

    # 1. Cek Success
    body_text = ""
    try:
        body_text = (driver.find_element(By.TAG_NAME, "body").text or "").lower()
    except Exception:
        pass

    subs = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")
    widget_text = ""
    if subs:
        try:
            driver.switch_to.frame(subs[0])
            widget_text = (driver.find_element(By.TAG_NAME, "body").text or "").lower()
        except Exception:
            pass
        finally:
            driver.switch_to.default_content()

    combined_text = body_text + " " + widget_text

    # Success marker
    page_title = (driver.title or "").lower()
    is_dashboard = any(p in url for p in ["/create-new", "/menu", "/home", "/templates", "/designs", "/projects", "/setup/team", "/folders", "/folder"]) or (
        "/harga" not in url and "/pricing" not in url and ("beranda" in page_title or "canva" in page_title)
    )
    if not subs and is_dashboard:
        return "SUCCESS"

    success_markers = ["welcome to canva business", "selamat datang di canva bisnis", "uji coba telah dimulai", "uji coba gratis dimulai"]
    if any(m in combined_text for m in success_markers) or ("/menu" in url and ("bisnis" in combined_text or "canva bisnis" in combined_text)):
        return "SUCCESS"

    # Server error marker
    server_markers = ["server kami mengalami masalah", "our server is experiencing problems", "our servers are having issues", "terjadi masalah pada server", "ada masalah di server", "server error"]
    if any(m in combined_text for m in server_markers):
        return "SERVER_ERROR"

    # Reauth Password in default content
    has_pw_default = False
    driver.switch_to.default_content()
    pw_inps = driver.find_elements(By.CSS_SELECTOR, "input[type='password']:not([type='hidden'])")
    for pwi in pw_inps:
        if pwi.is_displayed():
            has_pw_default = True
            break
    if has_pw_default:
        return "REAUTH_PASSWORD"

    # Reauth OTP in default content
    otp_markers = ["masukkan kode", "verifikasi akun", "enter code", "selesaikan proses masuk"]
    has_otp_default = False
    if any(m in body_text for m in otp_markers):
        otp_inps = driver.find_elements(By.CSS_SELECTOR, "input[autocomplete*='one-time-code'], input[placeholder*='kode'], input[aria-label*='kode']")
        for oi in otp_inps:
            if oi.is_displayed():
                has_otp_default = True
                break
    if has_otp_default:
        return "REAUTH_OTP"

    # Cek di dalam subscribe_widget jika terbuka
    if subs:
        driver.switch_to.frame(subs[0])
        try:
            # Reauth Password in widget
            pw_w = driver.find_elements(By.CSS_SELECTOR, "input[type='password']:not([type='hidden'])")
            if any(p.is_displayed() for p in pw_w):
                driver.switch_to.default_content()
                return "REAUTH_PASSWORD"

            # Reauth OTP in widget
            if any(m in widget_text for m in otp_markers):
                driver.switch_to.default_content()
                return "REAUTH_OTP"

            # Card Form Open check
            card_form_open = driver.execute_script("""
                const hasTokenEx = document.querySelector('iframe[src*="tokenex"], iframe[title*="card"], iframe[title*="Credit"], iframe[id*="tokenex"]') !== null;
                const hasExp = document.querySelector('input[autocomplete="cc-exp"], input[aria-describedby*="expiry"]') !== null;
                const hasAddr = document.querySelector('input[placeholder*="alamat penagihan"], input[placeholder*="Address"], input[placeholder*="alamat"]') !== null;
                return hasTokenEx || hasExp || hasAddr;
            """)
            if card_form_open:
                driver.switch_to.default_content()
                return "CARD_FORM"

            # Payment Selection check (Radios for Gopay/DANA/Card)
            has_payment_sel = driver.execute_script("""
                const allRadios = Array.from(document.querySelectorAll('input[type="radio"], [role="radio"]'));
                return allRadios.some(r => {
                    const t = (r.closest('label')?.textContent || r.parentElement?.textContent || r.value || '').toLowerCase();
                    return t.includes('gopay') || t.includes('dana') || t.includes('shopee') || t.includes('kartu') || t.includes('credit') || r.value === '13';
                });
            """)
            if has_payment_sel:
                driver.switch_to.default_content()
                return "PAYMENT_SELECTION"

            # Plan Selection / Tombol Lanjutkan / Berikutnya
            has_lanjut = driver.execute_script("""
                const btns = Array.from(document.querySelectorAll('button, [role="button"], [type="submit"]'));
                return btns.some(b => {
                    const t = (b.innerText || b.value || '').trim().toLowerCase();
                    return (t.includes('lanjutkan') || t.includes('berikutnya') || t.includes('continue') || t.includes('next') || t.includes('tinjau')) && !t.includes('dapatkan') && b.offsetParent !== null;
                });
            """)
            if has_lanjut:
                driver.switch_to.default_content()
                return "PLAN_SELECTION"
        finally:
            driver.switch_to.default_content()

    # Tombol Lanjutkan di default content (misal dialog Jump back in!)
    has_dialog_lanjut = driver.execute_script("""
        const btns = Array.from(document.querySelectorAll('button, [role="button"], [type="submit"]'));
        return btns.some(b => {
            const t = (b.innerText || b.value || '').trim().toLowerCase();
            return (t === 'lanjutkan' || t === 'continue' || t.includes('lanjutkan')) && b.offsetParent !== null;
        });
    """)
    if has_dialog_lanjut:
        return "PLAN_SELECTION"

    # Pricing Page (bila di /harga/ atau /pricing/ dan subscribe_widget belum terbuka)
    if ("/harga" in url or "/pricing" in url) and not subs:
        return "PRICING_PAGE"

    return "UNKNOWN"


def smart_navigate_checkout_flow(driver, wait=None, email_info=None, password=None, seen_otps=None, card=None, max_steps=15):
    """
    Navigator pintar Canva Bisnis:
    Secara otonom mendeteksi state/page saat ini dan mengambil tindakan yang tepat:
    - Input kata sandi / OTP
    - Klik Lanjutkan / Berikutnya
    - Pilih opsi Kartu kredit atau debit
    - Isi form kartu + US address
    - Reload jika terjadi 'Server kami mengalami masalah'
    """
    dev_log(Fore.CYAN + Style.BRIGHT + "\n[SMART NAV] Memulai Smart Checkout Navigator...")
    server_error_count = 0
    max_server_reloads = 3

    for step in range(1, max_steps + 1):
        dismiss_browser_popups(driver)
        state = smart_detect_current_state(driver)
        dev_log(Fore.MAGENTA + f"[STEP {step}] Terdeteksi State: {Style.BRIGHT}{state}{Style.NORMAL} (URL: {driver.current_url})")

        if state == "SUCCESS":
            dev_log(Fore.GREEN + Style.BRIGHT + "  [✓] CANVA BISNIS SUKSES AKTIF!")
            return True

        elif state == "SERVER_ERROR":
            server_error_count += 1
            print(Fore.YELLOW + Style.BRIGHT + f"  [!] Terdeteksi 'Server kami mengalami masalah' (Percobaan reload {server_error_count}/{max_server_reloads}).")
            if server_error_count > max_server_reloads:
                print(Fore.RED + "  [✕] Server Canva tetap bermasalah setelah 3x reload.")
                return "SERVER_ERROR_PERSISTENT"

            dev_log(Fore.YELLOW + "  → Melakukan driver.refresh() sesuai instruksi...")
            driver.refresh()
            time.sleep(3.5)
            dismiss_browser_popups(driver)
            continue

        elif state == "REAUTH_PASSWORD":
            dev_log(Fore.CYAN + "  → Disuruh input Password! Memasukkan password...")
            pw_val = password or PASSWORD or "masuk123"
            driver.switch_to.default_content()
            subs = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")

            filled_pw = False
            for pwi in driver.find_elements(By.CSS_SELECTOR, "input[type='password']:not([type='hidden'])"):
                if pwi.is_displayed():
                    _type_into_input_field(driver, pwi, pw_val)
                    filled_pw = True
                    break

            if not filled_pw and subs:
                driver.switch_to.frame(subs[0])
                for pwi in driver.find_elements(By.CSS_SELECTOR, "input[type='password']:not([type='hidden'])"):
                    if pwi.is_displayed():
                        _type_into_input_field(driver, pwi, pw_val)
                        filled_pw = True
                        break
                driver.switch_to.default_content()

            time.sleep(0.3)
            driver.execute_script("""
                const btns = Array.from(document.querySelectorAll('button, [type="submit"], [role="button"]'));
                const b = btns.find(x => {
                    const t = (x.innerText || x.value || '').trim().toLowerCase();
                    return t === 'masuk' || t === 'log in' || t === 'lanjutkan' || t === 'submit';
                });
                if (b) { b.click(); }
            """)
            time.sleep(2.5)
            continue

        elif state == "REAUTH_OTP":
            dev_log(Fore.CYAN + "  → Disuruh input OTP! Memanggil handler OTP re-auth...")
            resolve_login_reauth_modal(driver, wait=wait, email_info=email_info, password=password, seen_otps=seen_otps)
            time.sleep(2.5)
            continue

        elif state == "PRICING_PAGE":
            dev_log(Fore.CYAN + "  → Di halaman harga. Mengklik card Canva Bisnis (Rp 0)...")
            clicked_card = driver.execute_script(r"""
                const isVis = el => el && el.getBoundingClientRect().width > 20 && el.getBoundingClientRect().height > 15;
                const allCards = Array.from(document.querySelectorAll('div, section, article'));
                const bizCards = allCards.filter(c => {
                    const t = (c.innerText || '').toLowerCase();
                    return (t.includes('canva bisnis') || t.includes('canva untuk tim') || (t.includes('bisnis') && !t.includes('canva pro')))
                        && (t.includes('uji coba') || t.includes('coba gratis') || t.includes('rp 0') || t.includes('trial'));
                });
                bizCards.sort((a, b) => a.innerText.length - b.innerText.length);
                for (const card of bizCards) {
                    const btn = Array.from(card.querySelectorAll('button, a')).find(b => {
                        if (b.disabled || !isVis(b)) return false;
                        const bt = (b.innerText || b.textContent || '').toLowerCase().trim();
                        return (bt.includes('coba canva') || bt.includes('coba gratis') || bt.includes('mulai uji coba') || bt.includes('trial')) && !bt.includes('pro');
                    });
                    if (btn) {
                        btn.scrollIntoView({block: 'center'});
                        btn.click();
                        return 'biz_card_button';
                    }
                }
                const allBtns = Array.from(document.querySelectorAll('button, a'));
                const directBtn = allBtns.find(b => {
                    if (b.disabled || !isVis(b)) return false;
                    const bt = (b.innerText || b.textContent || '').toLowerCase().trim();
                    return (bt.includes('coba canva bisnis') || bt.includes('coba canva untuk tim')) && !bt.includes('pro');
                });
                if (directBtn) { directBtn.scrollIntoView({block:'center'}); directBtn.click(); return 'direct_biz_btn'; }
                return null;
            """)
            dev_log(f"    Klik card Canva Bisnis: {clicked_card}")
            time.sleep(2.5)
            continue

        elif state == "PLAN_SELECTION":
            dev_log(Fore.CYAN + "  → Disuruh klik Lanjutkan / Berikutnya! Mengklik tombol...")
            clicked_lanjut = None
            driver.switch_to.default_content()
            subs = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")
            if subs:
                driver.switch_to.frame(subs[0])
                clicked_lanjut = driver.execute_script("""
                    const btns = Array.from(document.querySelectorAll('button, [role="button"], [type="submit"]'));
                    const b = btns.find(x => {
                        const t = (x.innerText || x.value || '').trim().toLowerCase();
                        return (t.includes('lanjutkan') || t.includes('berikutnya') || t.includes('continue') || t.includes('next') || t.includes('tinjau')) && !t.includes('dapatkan') && x.offsetParent !== null;
                    });
                    if (b) {
                        b.scrollIntoView({block:'center'});
                        b.click();
                        return (b.innerText || '').trim();
                    }
                    return null;
                """)
                driver.switch_to.default_content()

            if not clicked_lanjut:
                clicked_lanjut = driver.execute_script("""
                    const btns = Array.from(document.querySelectorAll('button, [role="button"], [type="submit"]'));
                    const b = btns.find(x => {
                        const t = (x.innerText || x.value || '').trim().toLowerCase();
                        return (t.includes('lanjutkan') || t.includes('continue') || t.includes('berikutnya')) && x.offsetParent !== null;
                    });
                    if (b) {
                        b.scrollIntoView({block:'center'});
                        b.click();
                        return (b.innerText || '').trim();
                    }
                    return null;
                """)
            dev_log(f"    Hasil klik Lanjutkan: '{clicked_lanjut}'")
            time.sleep(2.0)
            continue

        elif state == "PAYMENT_SELECTION":
            dev_log(Fore.CYAN + "  → Disuruh pilih metode pembayaran! Memilih 'Kartu kredit atau debit'...")
            driver.switch_to.default_content()
            subs = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")
            clicked_radio = None
            if subs:
                driver.switch_to.frame(subs[0])
                clicked_radio = driver.execute_script("""
                    const paymentItems = Array.from(document.querySelectorAll('*')).filter(el => {
                        const t = (el.innerText || el.textContent || '').toLowerCase();
                        return t.includes('gopay') || t.includes('dana') || t.includes('metode pembayaran');
                    });
                    for (const item of paymentItems) {
                        let p = item.parentElement;
                        while (p && p !== document.body) {
                            if (p.scrollHeight > p.clientHeight) { p.scrollTop = p.scrollHeight; }
                            p = p.parentElement;
                        }
                    }

                    const allRadios = Array.from(document.querySelectorAll('input[type="radio"], [role="radio"]'));
                    let target = allRadios.find(r => {
                        const txt = (r.closest('label')?.textContent || r.parentElement?.textContent || r.value || '').toLowerCase();
                        return (r.value && r.value.includes('13')) || txt.includes('kartu kredit') || txt.includes('credit');
                    });
                    if (target) {
                        target.scrollIntoView({block:'center'});
                        target.click();
                        return 'CLICKED_CARD_RADIO';
                    }
                    const span = document.querySelector('[data-provider="VAULTED_CREDIT_CARD"]');
                    if (span) {
                        span.click();
                        return 'CLICKED_VAULTED_SPAN';
                    }
                    return null;
                """)
                driver.switch_to.default_content()
            dev_log(f"    Hasil pilih opsi kartu: {clicked_radio}")
            time.sleep(2.0)
            continue

        elif state == "CARD_FORM":
            dev_log(Fore.CYAN + "  → Disuruh isi form kartu kredit & penagihan! Mengisi data US & VCC...")
            if not card:
                card = get_next_card()
            if not card:
                print(Fore.RED + "  [✕] Tidak ada kartu tersedia di cc.txt!")
                return False

            driver.switch_to.default_content()
            filled = _fill_canva_vcc_full(driver, card)
            if filled:
                dev_log(Fore.GREEN + "  [✓] SEMUA FIELD KARTU & US TELAH TERISI LENGKAP!")
                dev_log(Fore.CYAN + "  → Menekan tombol submit: 'Dapatkan uji coba gratis'...")
                sub_res = click_dapatkan_uji_coba(driver, timeout=6)
                dev_log(f"    Submit clicked: {sub_res}")
                time.sleep(2.5)

                res = detect_payment_success(driver, timeout=12)
                dev_log(Fore.CYAN + f"    Payment detection status: {res}")
                if res is True:
                    return True
                elif res == "SERVER_ERROR":
                    dev_log(Fore.YELLOW + Style.BRIGHT + "  [!] Server error terdeteksi saat pembayaran! Loop berikutnya akan reload & resume...")
                    continue
                elif res == "SECURITY_CHECK_FAILED":
                    dev_log(Fore.YELLOW + "  [!] Security challenge terdeteksi.")
                    return "SECURITY_CHECK_FAILED"
                else:
                    return "CARD_DECLINED"
            else:
                dev_log(Fore.YELLOW + "  [!] Pengisian kartu belum lengkap, mengulang step...")
                time.sleep(1.0)
                continue

        else:
            dev_log(Fore.YELLOW + f"  [?] State UNKNOWN: mencoba mendeteksi popups/reauth atau menunggu...")
            time.sleep(2.0)

    return False


def perform_auto_pay_vcc_business(driver, wait, email, max_cards=5, max_submit_retries=3, email_info=None, password=None, seen_otps=None):
    """
    Poin 4 & 5 flow terbaru:
    - Masukkan cc.txt & Alamat US
    - Rotasi kalau kartu ditolak notif merah: coba submit ulang 2-3x loop pada kartu yang sama
    - Kalau masih gak bisa, ganti kartu berikutnya (loop sampai 5 kartu)
    - Output CLI bersih, rapi, dan terstruktur
    - Cerdas menangani Server Bermasalah (Reload & Resume via smart_navigate_checkout_flow)
    """
    dismiss_browser_popups(driver)
    resolve_login_reauth_modal(driver, wait=wait, email_info=email_info or email, password=password, seen_otps=seen_otps)

    cards_tried = 0
    payment_success = False
    successful_card = None

    while cards_tried < max_cards and not payment_success:
        card = get_next_card()
        if not card:
            CLI.sub_info("Kartu VCC", "Tidak ada kartu tersedia di cc.txt!")
            break

        cards_tried += 1
        card_num = card["number"]
        last4 = card_num[-4:] if len(card_num) >= 4 else card_num
        exp_str = f"{card['exp_month']}/{card['exp_year']}"
        CLI.card_attempt(cards_tried, max_cards, last4, exp_str)

        # ── CEK DULU: Apakah sudah berlangganan sebelum isi kartu? ──
        # Ini mendeteksi popup 'Anda sudah berlangganan' yang muncul di /harga/
        try:
            _body_now = (driver.find_element(By.TAG_NAME, "body").text or "").lower()
            _sub_markers = [
                "anda sudah berlangganan canva bisnis",
                "anda sudah berlangganan canva pro",
                "you're already subscribed",
                "you are already subscribed",
            ]
            if any(m in _body_now for m in _sub_markers):
                dev_log(Fore.GREEN + "[PAYMENT] Popup 'Anda sudah berlangganan' terdeteksi sebelum isi kartu! Stop rotasi.")
                print(Fore.GREEN + "  [OK] Sudah berlangganan Canva Bisnis — hentikan rotasi kartu.")
                # Klik Lanjutkan ke Canva
                try:
                    driver.execute_script("""
                        const btns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
                        const b = btns.find(x => {
                            const t = (x.innerText || x.textContent || '').toLowerCase().trim();
                            return t.includes('lanjutkan ke canva') || t.includes('continue to canva') ||
                                   t.includes('lanjutkan') || t.includes('continue');
                        });
                        if (b) { b.scrollIntoView({block:'center'}); b.click(); }
                    """)
                    time.sleep(2.0)
                except Exception:
                    pass
                payment_success = True
                successful_card = card_num
                break
        except Exception:
            pass

        if payment_success:
            break

        # 1. Pastikan opsi 'Kartu kredit atau debit' terpilih
        select_credit_card_option(driver)

        # 2. Isi form kartu kredit & alamat US
        filled = _fill_canva_vcc_full(driver, card)
        if not filled:
            select_credit_card_option(driver)
            time.sleep(0.8)
            filled = _fill_canva_vcc_full(driver, card)

        if not filled:
            CLI.card_result(1, max_submit_retries, False, "Form Kartu Tidak Terisi")
            if cards_tried < max_cards:
                try:
                    open_business_trial_harga_id(driver, wait=wait, email_info=email_info or email, password=password, seen_otps=seen_otps)
                except Exception:
                    pass
            continue

        # 3. Submit pembayaran (Loop max 3x jika notif merah)
        for submit_loop in range(1, max_submit_retries + 1):
            time.sleep(1.0)
            submit_ok = click_dapatkan_uji_coba(driver, timeout=5)
            if not submit_ok:
                try:
                    driver.execute_script("""
                        const btns = Array.from(document.querySelectorAll('button, [type="submit"], [role="button"]'));
                        const b = btns.find(x => {
                            const t = (x.innerText || x.value || '').trim().toLowerCase();
                            return t.includes('dapatkan') || t.includes('uji coba') || t.includes('coba gratis') || t.includes('bayar') || t.includes('review') || t.includes('start');
                        });
                        if (b) { b.scrollIntoView({block:'center'}); b.click(); }
                    """)
                except Exception:
                    pass

            # Submit terakhir → beri waktu lebih panjang karena kadang Canva
            # butuh beberapa detik untuk redirect ke beranda setelah sukses
            detect_timeout = 25 if submit_loop == max_submit_retries else 12
            time.sleep(2.0)

            # Cek respon status pembayaran
            res = detect_payment_success(driver, timeout=detect_timeout)
            if res is True:
                payment_success = True
                successful_card = card_num
                CLI.card_result(submit_loop, max_submit_retries, True, "Disetujui Bank (Rp 0)")
                break
            elif res == "SERVER_ERROR":
                CLI.card_result(submit_loop, max_submit_retries, False, "Server Canva Bermasalah (Reload & Resume)")
                dev_log(Fore.YELLOW + Style.BRIGHT + "\n[SERVER ERROR] Terdeteksi 'Server kami mengalami masalah'.")
                dev_log(Fore.YELLOW + "[SERVER ERROR] Melakukan reload dan deteksi state pintar sesuai instruksi...")
                try:
                    driver.refresh()
                    time.sleep(3.5)
                    dismiss_browser_popups(driver)
                except Exception:
                    pass

                # Jalankan smart navigator untuk deteksi posisi dan melanjutkan flow
                nav_ok = smart_navigate_checkout_flow(
                    driver, wait=wait, email_info=email_info or email, password=password, seen_otps=seen_otps, card=card
                )
                if nav_ok is True:
                    payment_success = True
                    successful_card = card_num
                    CLI.card_result(submit_loop, max_submit_retries, True, "Disetujui Bank (Rp 0)")
                    break
                elif nav_ok == "SERVER_ERROR_PERSISTENT":
                    dev_log(Fore.RED + "[SERVER ERROR] Server Canva tetap bermasalah setelah berkali-kali reload.")
                    break
                elif nav_ok == "CARD_DECLINED":
                    CLI.card_result(submit_loop, max_submit_retries, False, "Ditolak Bank (Notif Merah)")
                    break
                else:
                    time.sleep(1.5)
                    continue
            elif res == "SECURITY_CHECK_FAILED":
                CLI.card_result(submit_loop, max_submit_retries, False, "Pemeriksaan Keamanan (Challenge)")
                if submit_loop < max_submit_retries:
                    time.sleep(2.0)
                    continue
                else:
                    break
            else:
                # Cek terlebih dahulu apakah sebenarnya web sudah redirect ke Beranda / Dashboard
                driver.switch_to.default_content()
                curr_url = (driver.current_url or "").lower()
                curr_subs = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")
                page_title = (driver.title or "").lower()
                is_on_dashboard = not curr_subs and (
                    any(p in curr_url for p in ["/create-new", "/menu", "/home", "/templates", "/designs", "/projects", "/setup/team"])
                    or ("/harga" not in curr_url and "/pricing" not in curr_url and ("beranda" in page_title or "canva" in page_title))
                )
                if is_on_dashboard:
                    payment_success = True
                    successful_card = card_num
                    CLI.card_result(submit_loop, max_submit_retries, True, "Disetujui Bank (Redirect Beranda)")
                    break

                # ── PENTING: Cek subscription API sebelum deklarasi GAGAL ──
                # Kadang Canva sukses tapi tidak redirect — konfirmasi via API
                try:
                    if check_canva_subscription_api(driver):
                        payment_success = True
                        successful_card = card_num
                        CLI.card_result(submit_loop, max_submit_retries, True, "Disetujui Bank (Konfirmasi API)")
                        dev_log(Fore.GREEN + f"[PAYMENT] Sukses dikonfirmasi via Canva Subscription API!")
                        break
                except Exception:
                    pass

                CLI.card_result(submit_loop, max_submit_retries, False, "Ditolak Bank (Notif Merah)")
                if submit_loop < max_submit_retries:
                    time.sleep(1.5)
                else:
                    break

        if payment_success:
            break

        # Rotasi kartu jika masih ada kuota
        if cards_tried < max_cards:
            driver.switch_to.default_content()
            subs = driver.find_elements(By.CSS_SELECTOR, "iframe[src*='subscribe_widget']")
            if not subs:
                try:
                    open_business_trial_harga_id(driver, wait=wait, email_info=email_info or email, password=password, seen_otps=seen_otps)
                    time.sleep(1.5)
                except Exception:
                    pass

    return payment_success, successful_card

def perform_auto_pay(driver, wait, email, card, billing_period=None):
    """Alias kompatibilitas untuk checkout pembayaran VCC."""
    ok, _ = perform_auto_pay_vcc_business(driver, wait, email)
    return ok


# ==============================================================================
# MAIN FLOW
# ==============================================================================

def save_unified_result(email, password, card_number, status="SUCCESS", email_info=None):
    """
    Simpan hasil unified flow.
    Format output: email|passwordoutlook|token|clientid
    - result.txt         : email|passwordoutlook|token|clientid|status
    - akun_berhasil_bayar.txt: email|passwordoutlook|token|clientid
    Password yang disimpan adalah password Outlook asli (dari emails.txt),
    bukan password Canva — sesuai permintaan user.
    """
    token = ""
    client_id = ""
    outlook_password = ""  # password Outlook asli dari emails.txt

    if isinstance(email_info, dict):
        token = email_info.get("refresh_token") or ""
        client_id = email_info.get("client_id") or ""
        outlook_password = email_info.get("email_password") or ""
    elif isinstance(email_info, str):
        parts = [p.strip() for p in email_info.split("|")]
        if len(parts) >= 2:
            outlook_password = parts[1]
        if len(parts) >= 3:
            token = parts[2]
        if len(parts) >= 4:
            client_id = parts[3]

    if not client_id and token:
        client_id = DEFAULT_GRAPH_CLIENT_ID

    # Gunakan password Outlook asli; fallback ke password Canva jika tidak ada
    save_password = outlook_password if outlook_password else password

    if status == "SUCCESS":
        if token:
            bayar_line = f"{email}|{save_password}|{token}|{client_id}\n"
        else:
            bayar_line = f"{email}|{save_password}|{card_number}|{client_id}\n"
        append_line(AKUN_BAYAR_FILE, bayar_line)

    if token:
        res_line = f"{email}|{save_password}|{token}|{client_id}|{status}\n"
    else:
        res_line = f"{email}|{save_password}|{card_number}|{status}\n"
    append_line("result.txt", res_line)


def unified_flow_process(window_index=0, current_idx=1, total_accounts=1):
    """
    FLOW RESMI SESUAI 'flow terbaru':
    1. Email Outlook / Tempmail API (dengan kode otomatis & error handling OTP)
    2. PENTING: Reset Password dulu setelah signup!
    3. Create a team (buat tim)
    4. Buka https://www.canva.com/id_id/harga/ & pilih Canva Bisnis Trial 0 Rupiah
    5. Masukkan cc.txt rotasi (loop 2-3x per kartu jika notif merah, max 5 kartu)
    6. Sukses deteksi beranda Canva Bisnis aktif -> Simpan hasil & DONE!
    """
    email_info = get_next_email()
    if not email_info or not email_info.get("email"):
        print(Fore.RED + "    [✕] Gagal mendapatkan email target (emails.txt / TempMail API)!")
        return False

    email = email_info["email"]
    password = PASSWORD or "Masuk123!"

    CLI.account_header(current_idx, total_accounts, email)

    if email.lower() in get_already_completed_emails():
        CLI.step(1, "Validasi Akun", "SKIP", "(Sudah sukses sebelumnya)")
        CLI.account_finish(True, email)
        return True

    driver = None
    try:
        driver = create_chrome_driver(window_index=window_index)
        wait = WebDriverWait(driver, 25)
        seen_account_otps = set()

        # LANGKAH 1: SIGNUP AKUN CANVA (atau LOGIN jika sudah terdaftar)
        signup_otp_data = None
        is_already_registered = False
        try:
            signup_otp_data = perform_signup(driver, wait, email_info)
            if signup_otp_data and signup_otp_data.get("otp"):
                seen_account_otps.add(str(signup_otp_data["otp"]))
            CLI.step(1, "Pendaftaran Akun", "SUCCESS")
        except Exception as signup_err:
            err_msg = str(signup_err).lower()
            if "sudah digunakan" in err_msg or "tidak valid" in err_msg or "terdaftar" in err_msg:
                is_already_registered = True
                login_ok = perform_login(driver, wait, email, password, use_us_locale=False)
                if not login_ok:
                    login_ok = perform_login(driver, wait, email, password, use_us_locale=True)
                if not login_ok:
                    CLI.step(1, "Login Akun Terdaftar", "FAIL")
                    CLI.account_finish(False, email)
                    return False
                CLI.step(1, "Login Akun Terdaftar", "SUCCESS")
            else:
                CLI.step(1, "Pendaftaran Akun", "FAIL", str(signup_err)[:25])
                CLI.account_finish(False, email)
                return False

        # LANGKAH 2: RESET / SET PASSWORD AKUN BARU
        if not is_already_registered:
            try:
                reset_res = perform_password_reset(driver, wait, email_info, signup_otp_data, save_mode="none")
                if isinstance(reset_res, dict) and reset_res.get("otp"):
                    seen_account_otps.add(str(reset_res["otp"]))
                CLI.step(2, "Setup Password Baru", "SUCCESS")
            except Exception:
                CLI.step(2, "Setup Password Baru", "SKIP")
        else:
            CLI.step(2, "Setup Password Baru", "SKIP", "(Akun Lama)")

        # LANGKAH 3: MEMBUAT TIM (CREATE A TEAM)
        try:
            open_create_team_flow(driver)
            CLI.step(3, "Pembuatan Tim", "SUCCESS")
        except Exception:
            CLI.step(3, "Pembuatan Tim", "SKIP")

        # LANGKAH 4: CEK APAKAH PAYMENT SUDAH TERBUKA OTOMATIS
        # Setelah klik "Aktifkan Paket dan Undang Tim", Canva otomatis membuka
        # halaman/modal pembayaran — TIDAK perlu navigate ke /harga/ lagi.
        # Kita tunggu dulu, cek state. Baru fallback jika belum terbuka.
        try:
            time.sleep(3.0)  # beri waktu Canva redirect ke payment
            dismiss_browser_popups(driver)

            # Cek apakah payment form / subscribe_widget sudah ada
            _payment_already_open = _page_has_card_form(driver) or driver.execute_script("""
                // Cek subscribe_widget iframe terbuka
                const iframes = Array.from(document.querySelectorAll('iframe'));
                if (iframes.some(f => (f.src||'').includes('subscribe_widget'))) return true;
                // Cek teks form kartu di halaman
                const txt = (document.body.innerText || '').toLowerCase();
                return txt.includes('nomor kartu') || txt.includes('kedaluwarsa') ||
                       txt.includes('kode keamanan') || txt.includes('metode pembayaran') ||
                       txt.includes('kartu kredit') || txt.includes('dapatkan uji coba');
            """)

            if _payment_already_open:
                # Payment sudah terbuka otomatis oleh Canva — langsung ke checkout
                dev_log(Fore.GREEN + "[STEP 4] Payment form sudah terbuka otomatis setelah klik 'Aktifkan Paket'. Langsung checkout!")
                CLI.step(4, "Halaman Payment", "SUCCESS", "Terbuka Otomatis")
            else:
                # Fallback: payment belum terbuka, navigate ke harga
                dev_log(Fore.YELLOW + "[STEP 4] Payment belum terbuka — fallback ke halaman harga Canva Bisnis...")
                open_business_trial_harga_id(
                    driver,
                    wait=wait,
                    email_info=email_info,
                    password=password,
                    seen_otps=seen_account_otps
                )
                CLI.step(4, "Pilih Canva Bisnis", "SUCCESS", "Via Halaman Harga")
        except Exception as harga_err:
            CLI.step(4, "Pilih Canva Bisnis", "FAIL", str(harga_err)[:25])

        # LANGKAH 5: AUTO CHECKOUT VCC DENGAN ROTASI & RETRY
        paid_ok, used_card = perform_auto_pay_vcc_business(
            driver, wait, email,
            max_cards=5, max_submit_retries=3,
            email_info=email_info,
            password=password,
            seen_otps=seen_account_otps
        )
        CLI.step(5, "Pembayaran VCC", "SUCCESS" if paid_ok else "FAIL")

        # LANGKAH 6: VERIFIKASI BERANDA CANVA BISNIS AKTIF
        if paid_ok:
            dash_ok = verify_business_active_dashboard(driver)
            if dash_ok:
                CLI.step_last(6, "Verifikasi Langganan", "SUCCESS", "Canva Bisnis Aktif")
                save_unified_result(email, password, used_card or "VCC", status="SUCCESS", email_info=email_info)
                CLI.account_finish(True, email)
                time.sleep(2)
                return True
            else:
                CLI.step_last(6, "Verifikasi Langganan", "FAIL", "Dashboard Belum Aktif")
                save_unified_result(email, password, used_card or "VCC", status="FAILED_PAYMENT", email_info=email_info)
                CLI.account_finish(False, email)
                return False
        else:
            CLI.step_last(6, "Verifikasi Langganan", "FAIL", "VCC Ditolak")
            save_unified_result(email, password, used_card or "VCC", status="FAILED_PAYMENT", email_info=email_info)
            CLI.account_finish(False, email)
            return False

    except Exception as e:
        dev_log(f"Error runtime: {e}\n{traceback.format_exc()}", "error")
        CLI.step(1, "Proses Akun", "FAIL", clean_err_msg(e))
        save_unified_result(email, password, "-", status="FAIL", email_info=email_info)
        CLI.account_finish(False, email)
        return False
    finally:
        if driver:
            prof = getattr(driver, "_user_data_dir", None)
            try:
                driver.quit()
            except Exception:
                pass
            if prof and os.path.isdir(prof):
                try:
                    import shutil
                    time.sleep(0.5)
                    shutil.rmtree(prof, ignore_errors=True)
                except Exception:
                    pass


def _create_driver(window_index=0):
    """Buat Chrome driver portrait (profil unik + retry multi-instance)."""
    return create_chrome_driver(window_index=window_index)


def main_flow(mode="1", window_index=0, email=None, password=None, vcc_card=None):
    """
    Mode 1:
      signup (affiliate) → simpan email|signup_ok → browser tetap (manual)

    Mode 2:
      signup → browser tetap (tanpa refresh) → user manual trial + bayar
        → y: simpan akun_berhasil_bayar.txt → set password → akun_bayar_password.txt
        → n: lewati, TIDAK set password

    Mode 3:
      hanya set password untuk email yang diberikan → simpan sukses_reset.txt

    Mode 4:
      login (email|password) → Auto Pay VCC + alamat USA New York
        → sukses: akun_auto_pay.txt + akun_berhasil_bayar.txt

    window_index: posisi horizontal window portrait (0, 1, 2, ...)
    email: wajib untuk mode 3/4; diabaikan mode 1/2 (dibuat otomatis)
    password: wajib mode 4
    vcc_card: dict VCC untuk mode 4

    Mode 2 paralel: signup semua → pay manual semua → 1x y di MAIN → set password SEMUA.
    """
    # Mode 2 batch: pastikan tiap worker terhitung (ready/failed) agar tidak deadlock
    batch_settled = False

    def _mode2_batch_fail_once():
        nonlocal batch_settled
        if mode == "2" and _batch_pay_coord is not None and not batch_settled:
            batch_pay_register_failed(_batch_pay_coord)
            batch_settled = True

    if mode == "3":
        if not email:
            print("[ERROR] Mode 3 membutuhkan email.")
            return False
    elif mode == "4":
        if not email or not password:
            print("[ERROR] Mode 4 membutuhkan email dan password.")
            return False
        if not vcc_card:
            print("[ERROR] Mode 4 membutuhkan data VCC (.env atau vcc.txt).")
            return False
    else:
        email_data = generate_email()
        if not email_data:
            _mode2_batch_fail_once()
            return False
        email = email_data["email"]

    try:
        driver = _create_driver(window_index=window_index)
    except Exception as e:
        print(f"[ERROR] Gagal buka browser: {e}")
        _mode2_batch_fail_once()
        return False

    wait = WebDriverWait(driver, 25)

    try:
        # Mode 3: hanya set password (tanpa signup) → sukses_reset.txt
        if mode == "3":
            print(Fore.CYAN + f"\n[MODE 3] Set password saja untuk: {email}")
            print(
                Fore.YELLOW
                + "[INFO] OTP lama di inbox diabaikan — hanya pakai email OTP terbaru."
            )
            try:
                reset_ok = perform_password_reset(
                    driver, wait, email, signup_otp_data=None, save_mode="reset_only"
                )
            except Exception as e:
                print(Fore.RED + f"[ERROR] Mode 3 set password gagal: {e}")
                reset_ok = False
            if reset_ok:
                print(Fore.GREEN + f"[DONE] Password OK: {email}")
                print(Fore.GREEN + f"       Disimpan ke {SUKSES_RESET_FILE}")
            else:
                print(Fore.RED + f"[FAIL] Set password gagal: {email}")
            return bool(reset_ok)

        # Mode 4: FULL AUTO login + Canva Bisnis + VCC
        if mode == "4":
            print(Fore.CYAN + f"\n[MODE 4 FULL AUTO] Login + Bisnis + VCC: {email}")
            # Locale ID biar UI cocok dengan /id_id/canva-bisnis/
            try:
                driver.set_window_rect(x=0, y=0, width=1200, height=920)
            except Exception:
                pass
            login_ok = perform_login(
                driver, wait, email, password, use_us_locale=False
            )
            if not login_ok:
                # fallback login EN/global
                dev_log(Fore.YELLOW + "[WARN] Login id_id gagal, coba /login/ ...")
                login_ok = perform_login(
                    driver, wait, email, password, use_us_locale=True
                )
            if not login_ok:
                print(Fore.RED + f"[FAIL] Login gagal: {email}")
                return False

            paid_ok = perform_auto_pay(
                driver, wait, email, vcc_card, billing_period=BILLING_PERIOD
            )
            if not paid_ok:
                print(Fore.YELLOW + f"[SKIP] {email} — full auto pay gagal.")
                try:
                    os.makedirs("picture", exist_ok=True)
                    driver.save_screenshot(
                        os.path.join("picture", f"mode4_fail_{int(time.time())}.png")
                    )
                except Exception:
                    pass
                return False

            save_account_auto_pay(email)
            print(Fore.GREEN + f"[DONE] {email} — FULL AUTO sukses.")
            dev_log("[INFO] Menutup browser dalam 5 detik...")
            time.sleep(5)
            return True

        signup_otp_data = perform_signup(driver, wait, email)
        if not signup_otp_data:
            _mode2_batch_fail_once()
            return False

        # Setelah signup: JANGAN refresh / set password otomatis.
        # Session login tetap di halaman saat ini → user lanjut manual.
        save_account_signup_only(email)

        if mode == "2":
            # 1) Setelah signup: JANGAN refresh — user bayar manual di session aktif
            print(
                Fore.MAGENTA
                + f"\n--- UPGRADE MANUAL (Browser #{window_index + 1}) — tanpa refresh ---"
            )
            paid_ok = wait_manual_upgrade_and_payment(email, window_index=window_index)
            batch_settled = True
            if not paid_ok:
                print(
                    Fore.YELLOW
                    + f"[SKIP] {email} — bayar tidak dikonfirmasi, password TIDAK di-set."
                )
                return False

            # 2) Simpan daftar yang berhasil bayar
            save_account_paid(email)

            # 3) Setelah y → set password otomatis (semua browser paralel jalan bersamaan)
            dev_log(Fore.CYAN + f"\n[INFO] Pembayaran OK → set password otomatis: {email}")
            try:
                reset_ok = perform_password_reset(
                    driver, wait, email, signup_otp_data, save_mode="paid_with_password"
                )
            except Exception as e:
                print(Fore.RED + f"[ERROR] Set password gagal ({email}): {e}")
                reset_ok = False

            if not reset_ok:
                print(
                    Fore.YELLOW
                    + f"[WARN] {email} sudah bayar, tapi set password gagal."
                )
                print(Fore.YELLOW + f"       Cek hanya di: {AKUN_BAYAR_FILE}")
                # Parallel: jangan block Enter (biar batch tidak macet)
                if _batch_pay_coord is None:
                    hold_browser_for_manual(
                        email,
                        note="Set password gagal. Cek browser / set manual, lalu Enter.",
                    )
                return False

            print(Fore.GREEN + f"[DONE] {email} — bayar OK + password OK.")
            dev_log("[INFO] Menutup browser dalam 3 detik...")
            time.sleep(3)
            return True

        # Mode 1: signup selesai → manual saja (tidak reset password / tidak refresh)
        print(Fore.GREEN + f"[DONE] {email} — signup OK. Lanjut manual di browser.")
        hold_browser_for_manual(
            email,
            note="Akun sudah terdaftar & login. Lanjut manual (set password / trial / dll).",
        )
        return True

    except Exception as e:
        print(f"[ERROR] {e}")
        _mode2_batch_fail_once()
        return False
    finally:
        try:
            driver.quit()
        except Exception:
            pass


# ==============================================================================
# MULTIPROSES / SEQUENTIAL
# ==============================================================================

def run_process(process_id, mode="1", window_index=0, email=None, password=None, vcc_card=None):
    print(
        f"[PROSES {process_id}] Mulai... (mode={mode}, window=#{window_index + 1}, "
        f"pid={os.getpid()})",
        flush=True,
    )
    while True:
        try:
            success = main_flow(
                mode=mode,
                window_index=window_index,
                email=email,
                password=password,
                vcc_card=vcc_card,
            )
            if success:
                print(f"[PROSES {process_id}] Sukses.", flush=True)
                return True
            else:
                print(f"[PROSES {process_id}] Gagal, ulangi...", flush=True)
                # Mode 2 batch paralel: jangan retry (barrier batch sudah dihitung)
                if mode == "2" and _batch_pay_coord is not None:
                    return False
                # Mode 3/4: jangan loop infinite — tanya lanjut/skip
                if mode in ("3", "4"):
                    label = "set password" if mode == "3" else "login+auto pay"
                    try:
                        ulang = safe_input(
                            Fore.YELLOW
                            + f"  Ulangi {label} {email}? [y/n]: "
                            + Style.RESET_ALL
                        ).strip().lower()
                    except EOFError:
                        ulang = "n"
                    if ulang not in ("y", "ya", "yes", "1"):
                        return False
        except Exception as e:
            print(f"[PROSES {process_id}] Error: {e}", flush=True)
            print(traceback.format_exc(), flush=True)
            if mode == "2" and _batch_pay_coord is not None:
                return False
        time.sleep(5)


def _run_process_wrapper(args):
    # args: (process_id, mode, window_index[, email[, password[, vcc_card]]])
    process_id = args[0]
    mode = args[1] if len(args) > 1 else "1"
    window_index = args[2] if len(args) > 2 else 0
    email = args[3] if len(args) > 3 else None
    password = args[4] if len(args) > 4 else None
    vcc_card = args[5] if len(args) > 5 else None
    return run_process(
        process_id,
        mode=mode,
        window_index=window_index,
        email=email,
        password=password,
        vcc_card=vcc_card,
    )


def _mode2_worker_main(process_id, window_index, batch_state, result_queue=None):
    """
    Entry point Process terpisah (bukan Pool) — lebih andal di Windows
    untuk buka banyak Chrome + tetap share batch state.
    """
    global _batch_pay_coord, _stdin_lock
    _batch_pay_coord = batch_state
    _stdin_lock = None
    # Pastikan print worker tampil
    try:
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
    except Exception:
        pass

    log_file = _worker_log_path(window_index)
    _log_line(
        f"[WORKER] start process_id={process_id} window=#{window_index + 1} pid={os.getpid()}",
        log_file,
    )
    ok = False
    try:
        ok = bool(
            run_process(
                process_id,
                mode="2",
                window_index=window_index,
            )
        )
    except Exception as e:
        _log_line(f"[WORKER] CRASH: {e}", log_file)
        _log_line(traceback.format_exc(), log_file)
        # Pastikan batch tidak deadlock jika crash sebelum ready/failed
        try:
            if batch_state is not None:
                batch_pay_register_failed(batch_state)
        except Exception:
            pass
        ok = False

    _log_line(f"[WORKER] selesai ok={ok}", log_file)
    if result_queue is not None:
        try:
            result_queue.put((process_id, window_index, ok))
        except Exception:
            pass
    return ok


def run_mode2_parallel_batch(jumlah_akun, jumlah_browser):
    """
    Mode 2 multi-browser: start Process bertahap (stagger) agar SEMUA Chrome muncul.
    Pool map sering bikin hanya 1 browser di Windows + undetected_chromedriver.
    """
    # Bersihkan lock sisa crash sebelumnya
    _release_uc_launch_lock()

    manager = multiprocessing.Manager()
    result_queue = manager.Queue()

    for batch_start in range(0, jumlah_akun, jumlah_browser):
        batch_n = min(jumlah_browser, jumlah_akun - batch_start)
        batch_end = batch_start + batch_n
        print(
            Fore.MAGENTA
            + Style.BRIGHT
            + f"\n[BATCH MODE 2] Akun {batch_start + 1}–{batch_end} "
            + f"dari {jumlah_akun} | {batch_n} browser (kiri→kanan)",
            flush=True,
        )
        print(
            Fore.CYAN
            + "  Alur: start browser BERURUTAN (jarak 5 dtk) → signup → pay manual "
            + "→ 1x y → set password SEMUA",
            flush=True,
        )
        print(
            Fore.YELLOW
            + "  Log tiap browser: folder logs/browser_*.log",
            flush=True,
        )

        state = create_batch_pay_state(manager, batch_n)
        procs = []

        for i in range(batch_n):
            process_id = batch_start + i
            window_index = i
            p = multiprocessing.Process(
                target=_mode2_worker_main,
                args=(process_id, window_index, state, result_queue),
                name=f"canva-b{window_index + 1}",
                daemon=False,
            )
            print(
                Fore.GREEN
                + Style.BRIGHT
                + f"[MAIN] Menyalakan browser #{window_index + 1} "
                + f"(akun {process_id + 1}/{jumlah_akun})...",
                flush=True,
            )
            p.start()
            procs.append(p)
            print(
                Fore.CYAN
                + f"[MAIN] Browser #{window_index + 1} PID={p.pid} started.",
                flush=True,
            )
            # Stagger di proses UTAMA — kunci agar Chrome #2 benar-benar kebuka
            if i < batch_n - 1:
                wait_s = 5.0
                print(
                    Fore.YELLOW
                    + f"[MAIN] Tunggu {wait_s:.0f}s sebelum buka browser berikutnya "
                    + "(biar Chrome #1 selesai init)...",
                    flush=True,
                )
                time.sleep(wait_s)
                # Jika proses sebelumnya sudah mati, beri peringatan
                prev = procs[-1]
                if not prev.is_alive() and i == 0:
                    # cek last started (current p) vs previous — previous is procs[-2] if any
                    pass
                if len(procs) >= 1:
                    for pi, pr in enumerate(procs):
                        if not pr.is_alive() and pr.exitcode not in (None, 0):
                            print(
                                Fore.RED
                                + f"[MAIN] Browser #{pi + 1} (PID {pr.pid}) sudah mati "
                                + f"exit={pr.exitcode}. Cek logs/browser_{pi + 1}_*.log",
                                flush=True,
                            )

        alive_n = sum(1 for p in procs if p.is_alive())
        print(
            Fore.GREEN
            + Style.BRIGHT
            + f"[MAIN] {alive_n}/{batch_n} proses browser MASIH HIDUP. "
            + "Cek Taskbar Chrome (window portrait kiri→kanan).",
            flush=True,
        )
        if alive_n < batch_n:
            print(
                Fore.RED
                + Style.BRIGHT
                + f"[MAIN] Hanya {alive_n} proses hidup! Buka folder logs/ untuk error.",
                flush=True,
            )

        # Tunggu settled sambil pantau proses mati (supaya batch tidak hang forever)
        print(
            Fore.CYAN
            + Style.BRIGHT
            + "\n[BATCH] Menunggu semua browser selesai signup...",
            flush=True,
        )
        while not state["all_settled"].is_set():
            dead = []
            for pi, pr in enumerate(procs):
                if not pr.is_alive() and pr.exitcode not in (None,):
                    dead.append((pi, pr))
            # Jika proses mati tanpa register ready/failed, tandai failed
            if dead:
                with state["lock"]:
                    done = state["ready"].value + state["failed"].value
                    # Hitung berapa yang "hilang" dari ekspektasi vs yang masih alive+done
                    # Tidak sempurna, tapi cegah hang: jika semua proses mati tapi belum settled
                    alive = sum(1 for p in procs if p.is_alive())
                    if alive == 0 and done < state["expected"].value:
                        missing = state["expected"].value - done
                        state["failed"].value += missing
                        print(
                            Fore.RED
                            + f"[BATCH] Semua worker mati prematur. "
                            + f"Mark {missing} sebagai gagal agar batch lanjut.",
                            flush=True,
                        )
                        _batch_pay_mark_settled_if_done(state)
            with state["lock"]:
                r = state["ready"].value
                f = state["failed"].value
                e = state["expected"].value
            print(
                Fore.CYAN
                + f"[BATCH] Progress: siap={r} gagal={f} / total={e} "
                + f"| proses hidup={sum(1 for p in procs if p.is_alive())}",
                flush=True,
            )
            if state["all_settled"].wait(timeout=3.0):
                break

        try:
            ok = batch_pay_confirm_in_main(state)
            if ok:
                print(
                    Fore.GREEN
                    + Style.BRIGHT
                    + "\n[BATCH] y diterima — worker set password paralel...",
                    flush=True,
                )
            else:
                print(
                    Fore.YELLOW
                    + "\n[BATCH] n / batal — worker menutup tanpa set password.",
                    flush=True,
                )
        except Exception as e:
            print(Fore.RED + f"[BATCH] Error konfirmasi: {e}", flush=True)
            try:
                state["pay_ok"].value = 0
                state["decided"].value = 1
                state["event"].set()
            except Exception:
                pass

        # Join semua worker
        for p in procs:
            p.join(timeout=600)
            if p.is_alive():
                print(
                    Fore.RED
                    + f"[BATCH] Process {p.name} masih hidup setelah timeout — terminate.",
                    flush=True,
                )
                p.terminate()

if __name__ == "__main__":
    multiprocessing.freeze_support()
    CLI.header()

    # 1. Hitung estimasi jumlah email & Tanya Jumlah Akun
    count_emails = 0
    if os.path.isfile("emails.txt"):
        with open("emails.txt", "r", encoding="utf-8-sig") as f:
            count_emails = sum(1 for line in f if line.strip() and not line.startswith("#") and "@" in line.strip())

    default_total = count_emails if count_emails > 0 else 1

    # 1. Parsing argumen CLI jika ada
    cli_total = None
    cli_country = None
    for idx_arg, arg in enumerate(sys.argv):
        if arg.lower() in ["--total", "-n", "--count"] and idx_arg + 1 < len(sys.argv):
            if sys.argv[idx_arg + 1].strip().isdigit():
                cli_total = int(sys.argv[idx_arg + 1].strip())
        elif arg.lower() in ["--country", "-c"] and idx_arg + 1 < len(sys.argv):
            cli_country = sys.argv[idx_arg + 1].strip().upper()
        elif arg.lower() in ["--indo", "-id", "--id"]:
            cli_country = "ID"
        elif arg.lower() in ["--us", "-usa", "--usa"]:
            cli_country = "US"

    # Tanya Jumlah Akun jika tidak ada di argumen
    if cli_total is not None:
        total_akun = max(1, cli_total)
        print(Fore.WHITE + f"  how manny create accounts?: " + Fore.GREEN + Style.BRIGHT + str(total_akun) + Style.RESET_ALL)
    else:
        try:
            total_input = input(
                Fore.WHITE + f"  how manny create accounts? [default: {default_total}]: " + Fore.GREEN + Style.BRIGHT
            ).strip()
            print(Style.RESET_ALL, end="")
            total_akun = int(total_input) if total_input.isdigit() else default_total
        except Exception:
            total_akun = default_total

    # 2. Tanya Opsi Alamat Billing (US / INDO) - Default US jika tidak ada di argumen
    if cli_country in ["ID", "INDO", "INDONESIA"]:
        chosen_country = "ID"
        print(Fore.WHITE + "  alamat billing us / indo?: " + Fore.GREEN + Style.BRIGHT + "indo" + Style.RESET_ALL)
    elif cli_country in ["US", "USA", "AMERIKA"]:
        chosen_country = "US"
        print(Fore.WHITE + "  alamat billing us / indo?: " + Fore.GREEN + Style.BRIGHT + "us" + Style.RESET_ALL)
    else:
        try:
            billing_input = input(
                Fore.WHITE + "  alamat billing us / indo? [default: us]: " + Fore.GREEN + Style.BRIGHT
            ).strip().lower()
            print(Style.RESET_ALL, end="")
            if "indo" in billing_input or "id" in billing_input or billing_input == "2":
                chosen_country = "ID"
            else:
                chosen_country = "US"
        except Exception:
            chosen_country = "US"

    set_billing_country(chosen_country)
    if chosen_country == "ID":
        print(Fore.GREEN + Style.BRIGHT + "\n  [✓] Wilayah Penagihan: INDONESIA (Tanpa Alamat, Langsung Kartu & Trial)" + Style.RESET_ALL)
    else:
        print(Fore.GREEN + Style.BRIGHT + "\n  [✓] Wilayah Penagihan: AMERIKA SERIKAT (969 Cox Rd Gastonia, NC 28054-3455 AS)" + Style.RESET_ALL)

    cleanup_stale_profiles()
    print(Fore.CYAN + f"\n  [•] Memulai pipeline untuk {total_akun} akun...\n" + Style.RESET_ALL)

    success_count = 0
    fail_count = 0

    for i in range(total_akun):
        ok = unified_flow_process(window_index=0, current_idx=i+1, total_accounts=total_akun)
        if ok:
            success_count += 1
        else:
            fail_count += 1
        time.sleep(2)

    CLI.summary(total_akun, success_count, fail_count)
