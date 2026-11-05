import os
import subprocess
import sys

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if _BASE_DIR:
    os.chdir(_BASE_DIR)

# Auto-install dependencies
_REQUIRED = ["undetected_chromedriver", "selenium", "requests", "colorama", "dotenv"]

def _check_deps():
    missing = []
    for pkg in _REQUIRED:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)
    return missing

_missing = _check_deps()
if _missing:
    print(f"[AUTO-INSTALL] Modul kurang: {_missing}")
    print("[AUTO-INSTALL] Install dari requirements.txt...")
    req_file = os.path.join(_BASE_DIR, "requirements.txt")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", req_file, "-q"])
    print("[AUTO-INSTALL] Selesai! Restart...")
    os.execv(sys.executable, [sys.executable] + sys.argv)

import multiprocessing

if __name__ == "__main__":
    multiprocessing.freeze_support()

    target_script = os.path.join("src", "run.py")
    if not os.path.isfile(target_script):
        print(f"[ERROR] File tidak ditemukan: {target_script}")
        input("Tekan Enter untuk keluar...")
        sys.exit(1)

    sys.path.insert(0, os.path.join(_BASE_DIR, "src"))

    try:
        from colorama import Fore, Style, init as colorama_init
        colorama_init(autoreset=True)
    except ImportError:
        class Fore:
            CYAN = WHITE = GREEN = YELLOW = RED = MAGENTA = ""
        class Style:
            BRIGHT = RESET_ALL = ""

    SEP = "=" * 52
    LINE = "-" * 52

    print()
    print(Fore.CYAN + Style.BRIGHT + SEP)
    print(Fore.CYAN + Style.BRIGHT + "   CANVA TOOL  --  Signup + Reset Password")
    print(Fore.CYAN + Style.BRIGHT + SEP)
    print(Fore.WHITE + "                  t.me/Drosek")
    print(Fore.CYAN + LINE)
    print()
    print(Fore.WHITE + "  [1] Signup / Daftar Akun Canva")
    print(Fore.WHITE + "      * Buat akun baru via emails.txt")
    print(Fore.WHITE + "      * Auto OTP via Outlook API")
    print(Fore.WHITE + "      * Set password otomatis")
    print()
    print(Fore.WHITE + "  [2] Reset Password Akun Canva")
    print(Fore.WHITE + "      * Reset password akun existing")
    print(Fore.WHITE + "      * Auto OTP via Outlook API")
    print(Fore.WHITE + "      * Simpan hasil ke result/")
    print()
    print(Fore.WHITE + "  [0] Keluar")
    print(Fore.CYAN + LINE)
    print()

    try:
        pilihan = input(Fore.WHITE + "  Pilih menu [1/2/0]: " + Fore.GREEN + Style.BRIGHT).strip()
        print(Style.RESET_ALL, end="")
    except (KeyboardInterrupt, EOFError):
        print("\n[EXIT] Dibatalkan.")
        sys.exit(0)

    if pilihan == "0":
        sys.exit(0)

    elif pilihan in ("1", "2"):
        emails_file = os.path.join(_BASE_DIR, "emails.txt")
        count_emails = 0
        if os.path.isfile(emails_file):
            with open(emails_file, "r", encoding="utf-8-sig") as f:
                count_emails = sum(
                    1 for line in f
                    if line.strip() and not line.strip().startswith("#") and "@" in line.strip()
                )
        default_total = count_emails if count_emails > 0 else 1
        label = "Signup" if pilihan == "1" else "Reset Password"

        print()
        try:
            n_input = input(
                Fore.WHITE + f"  Jumlah akun untuk {label} [default: {default_total}]: "
                + Fore.GREEN + Style.BRIGHT
            ).strip()
            print(Style.RESET_ALL, end="")
            jumlah = int(n_input) if n_input.isdigit() else default_total
        except (KeyboardInterrupt, EOFError):
            jumlah = default_total

        print(Fore.CYAN + f"\n  Memulai {label} untuk {jumlah} akun...\n" + Style.RESET_ALL)

        import importlib.util
        spec = importlib.util.spec_from_file_location("run", target_script)
        run_mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(run_mod)

        _create_driver   = run_mod._create_driver
        perform_signup   = run_mod.perform_signup
        perf_reset       = run_mod.perform_password_reset
        get_next_email   = run_mod.get_next_email
        cleanup_profiles = run_mod.cleanup_stale_profiles

        from selenium.webdriver.support.ui import WebDriverWait

        cleanup_profiles()
        success_count = 0
        fail_count    = 0

        for i in range(jumlah):
            print(Fore.MAGENTA + Style.BRIGHT + f"\n  [{i+1}/{jumlah}] Memproses..." + Style.RESET_ALL)
            driver = None
            try:
                email_info = get_next_email()
                if not email_info:
                    print(Fore.RED + "  [!] Tidak ada email tersisa di emails.txt. Berhenti.")
                    break
                email = email_info.get("email", "")
                print(Fore.WHITE + "  Email: " + Fore.CYAN + email)
                driver = _create_driver(window_index=0)
                wait   = WebDriverWait(driver, 30)
                if pilihan == "1":
                    ok = perform_signup(driver, wait, email_info)
                else:
                    ok = perf_reset(driver, wait, email_info, save_mode="reset_success")
                if ok:
                    print(Fore.GREEN + Style.BRIGHT + f"  [OK] Berhasil: {email}")
                    success_count += 1
                else:
                    print(Fore.RED + f"  [X] Gagal: {email}")
                    fail_count += 1
            except KeyboardInterrupt:
                print(Fore.YELLOW + "\n  [!] Dihentikan oleh user.")
                if driver:
                    try: driver.quit()
                    except Exception: pass
                break
            except Exception as ex:
                print(Fore.RED + f"  [ERROR] {ex}")
                fail_count += 1
            finally:
                if driver:
                    try: driver.quit()
                    except Exception: pass

        print()
        print(Fore.CYAN + Style.BRIGHT + SEP)
        print(Fore.WHITE + f"  SELESAI  |  Sukses: {success_count}  |  Gagal: {fail_count}")
        print(Fore.CYAN + Style.BRIGHT + SEP)
        print()
    else:
        print(Fore.RED + "  [!] Pilihan tidak valid.")

    input(Fore.WHITE + "\n  Tekan Enter untuk keluar...")
