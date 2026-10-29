require('dotenv').config();
const { chromium, firefox } = require('playwright');
const fs = require('fs');
const path = require('path');

// Arahkan Playwright ke folder yang bisa ditulis (penting untuk Pterodactyl/Docker)
if (process.platform === 'linux') {
  const browserDir = path.join(__dirname, '.browsers');
  process.env.PLAYWRIGHT_BROWSERS_PATH = browserDir;
  if (!fs.existsSync(browserDir)) fs.mkdirSync(browserDir, { recursive: true });
  // Fix ENOSPC
  const tmpDir = path.join(__dirname, '.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  process.env.TMPDIR = tmpDir;
  process.env.TEMP = tmpDir;
  process.env.TMP = tmpDir;
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const PASSWORD_GOOGLE = process.env.password_google || 'masuk123';
const PLAN_MODE       = (process.env.planmode || 'teams').toLowerCase();
const TARGET_SEATS    = parseInt(process.env['seats/kursi'] || process.env.seats || '5', 10);
const BROWSER_PREF    = (process.env.browser || process.env.BROWSER || 'chrome').trim().toLowerCase();

const AUTO_BIND_EMAIL = (process.env.auto_bind_email || process.env.AUTO_BIND_EMAIL || 'true').toLowerCase() === 'true';
const TMAIL_DOMAIN    = (process.env.tmail_domain || process.env.TMAIL_DOMAIN || 'arapmium.web.id').trim();
const TMAIL_API_URL   = (process.env.tmail_api_url || process.env.TMAIL_API_URL || 'https://arapmium.web.id').trim();
const TMAIL_API_KEY   = (process.env.tmail_api_key || process.env.TMAIL_API_KEY || 'eduedu').trim();
const NEW_PASSWORD    = (process.env.new_password || process.env.NEW_PASSWORD || process.env.password_capcut || 'masuk123').trim();
const DAFTAR_PASSWORD = (process.env.daftar_password || process.env.DAFTAR_PASSWORD || process.env.password_capcut || 'masuk123').trim();

const { generateRandomEmail, fetchTMailOtp, fetchTMailResetLink } = require('./tmail');

const GSUITE_FILE           = path.join(__dirname, 'gsuite');
const RESULT_FILE           = path.join(__dirname, 'result.txt');
const AKUN_SUDAH_LOGIN_FILE = path.join(__dirname, 'akun_sudah_login');
const AKUN_GAGAL_FILE       = path.join(__dirname, 'akun_gagal.txt');
const AKUN_TERKAIT_FILE     = path.join(__dirname, 'akun_terkait.txt');
const AKUN_RESET_FILE       = path.join(__dirname, 'akun_reset_password.txt');
const AKUN_TERDAFTAR_FILE   = path.join(__dirname, 'akun_terdaftar.txt');
const AKUN_JOIN_TIM_FILE    = path.join(__dirname, 'akun_join_tim.txt');
const JOIN_ACCOUNTS_FILE    = (process.env.join_accounts_file || process.env.JOIN_ACCOUNTS_FILE || path.join(__dirname, 'akun_login_join.txt')).trim();
const JOIN_LINK             = (process.env.join_link || process.env.JOIN_LINK || '').trim();

if (!fs.existsSync(AKUN_SUDAH_LOGIN_FILE)) {
  fs.writeFileSync(AKUN_SUDAH_LOGIN_FILE, '', 'utf8');
}
if (!fs.existsSync(AKUN_GAGAL_FILE)) {
  fs.writeFileSync(AKUN_GAGAL_FILE, '', 'utf8');
}
if (!fs.existsSync(AKUN_TERKAIT_FILE)) {
  fs.writeFileSync(AKUN_TERKAIT_FILE, '', 'utf8');
}
if (!fs.existsSync(AKUN_RESET_FILE)) {
  fs.writeFileSync(AKUN_RESET_FILE, '', 'utf8');
}
if (!fs.existsSync(AKUN_TERDAFTAR_FILE)) {
  fs.writeFileSync(AKUN_TERDAFTAR_FILE, '', 'utf8');
}
if (!fs.existsSync(AKUN_JOIN_TIM_FILE)) {
  fs.writeFileSync(AKUN_JOIN_TIM_FILE, '', 'utf8');
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const log = (tag, msg) => {
  const cleanTag = (tag || '').replace(/[^\w\s\-\/\:\.]/gi, '').trim();
  const label = cleanTag ? `[${cleanTag.toUpperCase()}]` : '[INFO]';
  console.log(`${label} ${msg}`);
};
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function appendResult(line) {
  fs.appendFileSync(RESULT_FILE, line + '\n', 'utf8');
  log('SAVE', `Disimpan: ${line}`);
}

function getProxyConfig() {
  // Jika user memilih untuk TIDAK menggunakan proxy (USE_PROXY=false)
  if (process.env.USE_PROXY === 'false' || process.env.use_proxy === 'false' || process.env.USE_PROXY === '0') {
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.ALL_PROXY;
    delete process.env.all_proxy;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
    return null;
  }

  // 1. Cek variabel terpisah dari menu Startup Pterodactyl (sesuai UI panel)
  const pteroIp = (process.env.PROXY_IP || process.env.PROXY_HOST || process.env.PROXY_SERVER || '').trim();
  const pteroPort = (process.env.PROXY_PORT || '80').trim();
  const pteroUser = (process.env.PROXY_USERNAME || process.env.PROXY_USER || '').trim();
  const pteroPass = (process.env.PROXY_PASSWORD || process.env.PROXY_PASS || '').trim();
  const pteroType = (process.env.PROXY_TYPE || process.env.PROXY_MODE || 'http').trim().toLowerCase();

  // 2. Cek variabel dari file .env (proxy= dan proxy_mode=)
  const rawEnvProxy = (process.env.proxy || process.env.PROXY || '').trim();

  let raw = '';
  let proto = 'http';

  if (pteroIp) {
    proto = (pteroType === 'socks5' || pteroType === 'socks4') ? 'socks5' : 'http';
    if (pteroUser && pteroPass) {
      raw = `${pteroIp}:${pteroPort}:${pteroUser}:${pteroPass}`;
    } else {
      raw = `${pteroIp}:${pteroPort}`;
    }
  } else if (rawEnvProxy && rawEnvProxy !== 'none' && rawEnvProxy !== 'false' && rawEnvProxy !== 'direct') {
    raw = rawEnvProxy;
    const configuredMode = (process.env.proxy_mode || process.env.PROXY_MODE || process.env.proxy_type || process.env.PROXY_TYPE || 'http').trim().toLowerCase();
    proto = (configuredMode === 'socks5' || configuredMode === 'socks4') ? 'socks5' : 'http';
  }

  // Jika tidak diisi di Pterodactyl maupun di .env, matikan proxy (Mode Direct)
  if (!raw) {
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.ALL_PROXY;
    delete process.env.all_proxy;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
    return null;
  }

  try {
    if (/^(socks5|socks4|http|https):\/\//i.test(raw)) {
      const match = raw.match(/^(socks5|socks4|http|https):\/\/(.*)$/i);
      proto = match[1].toLowerCase();
      raw = match[2];
    }

    // Format 1: host:port:username:password (contoh: ipnon.com:1080:user:pass)
    const colons = raw.split(':');
    if (colons.length === 4) {
      const host = colons[0].trim();
      const port = colons[1].trim();
      const user = colons[2].trim();
      const pass = colons[3].trim();
      return {
        server: `${proto}://${host}:${port}`,
        username: user,
        password: pass,
      };
    }

    // Format 2: username:password@host:port
    if (raw.includes('@')) {
      const atParts = raw.split('@');
      const userPass = atParts[0].split(':');
      const hostPort = atParts[1].split(':');
      const user = userPass[0].trim();
      const pass = userPass.slice(1).join(':').trim();
      const host = hostPort[0].trim();
      const port = hostPort[1] ? hostPort[1].trim() : (proto === 'socks5' ? '1080' : '80');
      return {
        server: `${proto}://${host}:${port}`,
        username: decodeURIComponent(user),
        password: decodeURIComponent(pass),
      };
    }

    // Format 3: host:port (tanpa auth)
    if (colons.length === 2 && !isNaN(colons[1])) {
      const host = colons[0].trim();
      const port = colons[1].trim();
      return {
        server: `${proto}://${host}:${port}`,
      };
    }

    // Fallback standard URL parser
    const u = new URL(raw.includes('://') ? raw : `${proto}://${raw}`);
    const cfg = {
      server: `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}`,
    };
    if (u.username) cfg.username = decodeURIComponent(u.username);
    if (u.password) cfg.password = decodeURIComponent(u.password);
    return cfg;
  } catch (_) {
    return { server: raw.includes('://') ? raw : `http://${raw}` };
  }
}

// ─── ROTASI IP / PROXY DENGAN URL API ───────────────────────────────────────
async function rotateIpIfConfigured() {
  const rotateUrl = (process.env.rotate_ip_url || process.env.ROTATE_IP_URL || '').trim();
  if (!rotateUrl) return;

  log('PROXY', `Memanggil URL Rotasi IP: ${rotateUrl}...`);
  try {
    const res = await fetch(rotateUrl, { timeout: 15000 });
    const text = await res.text().catch(() => '');
    log('PROXY', `✓ Perintah rotasi IP terkirim (Status: ${res.status}, Respon: ${text.slice(0, 100).trim()})`);
    log('WAIT', 'Menunggu 5 detik agar IP baru aktif dan stabil...');
    await wait(5000);
  } catch (err) {
    log('WARN', `Gagal merotasi IP via URL: ${err.message}`);
  }
}

// ─── DETEKSI UNUSUAL ACTIVITY PADA CAPCUT ─────────────────────────────────────
async function detectUnusualActivity(page) {
  try {
    return await page.evaluate(() => {
      const isVisible = el => !!(el && (el.offsetWidth || el.offsetHeight || (typeof el.getClientRects === 'function' && el.getClientRects().length > 0)));
      const bodyText = (document.body ? document.body.innerText : '') || '';
      const textMatches = /unusual activity in your account|aktivitas mencurigakan|aktivitas tidak biasa|can't proceed for the moment/i.test(bodyText);
      let unusualMsg = '';

      const alertEls = [...document.querySelectorAll('div, [role="alert"], [class*="toast"], [class*="notice"], [class*="message"], [class*="tooltip"], [class*="popover"]')];
      for (const el of alertEls) {
        if (!isVisible(el)) continue;
        const t = (el.textContent || '').trim();
        if (/unusual activity in your account|aktivitas mencurigakan|can't proceed for the moment|aktivitas tidak biasa/i.test(t)) {
          unusualMsg = t;
          break;
        }
      }

      if (unusualMsg || textMatches) {
        return unusualMsg || "We've noticed some unusual activity in your account. To protect security, you can't proceed for the moment.";
      }
      return null;
    });
  } catch (_) {
    return null;
  }
}

// ─── SCREENSHOTS MANAGER ────────────────────────────────────────────────────
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  try { fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true }); } catch (_) {}
}

async function takeDiagnosticScreenshot(page, prefix, email) {
  try {
    if (!page || page.isClosed()) return '';
    const cleanEmail = (email || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${prefix}_${cleanEmail}_${Date.now()}.png`;
    const fullPath = path.join(SCREENSHOTS_DIR, filename);
    await page.screenshot({ path: fullPath, fullPage: false, timeout: 6000 });
    log('SCREENSHOT', `📸 Screenshot bukti disimpan: ${fullPath}`);
    return fullPath;
  } catch (err) {
    log('WARN', `Gagal mengambil screenshot: ${err.message}`);
    return '';
  }
}

function moveAccountToDone(email, rawLine) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const lineToRecord = (rawLine || email).trim();

    // 1. Simpan ke akun_sudah_login
    const existing = fs.existsSync(AKUN_SUDAH_LOGIN_FILE)
      ? fs.readFileSync(AKUN_SUDAH_LOGIN_FILE, 'utf8').split('\n').map(e => e.trim().toLowerCase()).filter(Boolean)
      : [];
    if (!existing.some(e => e.startsWith(cleanEmail))) {
      fs.appendFileSync(AKUN_SUDAH_LOGIN_FILE, lineToRecord + '\n', 'utf8');
      log('RECORD', `Dicatat ke akun_sudah_login: ${cleanEmail}`);
    }

    // 2. Hapus/Keluarkan dari file gsuite
    if (fs.existsSync(GSUITE_FILE)) {
      const gsuiteLines = fs.readFileSync(GSUITE_FILE, 'utf8').split('\n');
      const filtered = gsuiteLines.filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        const lineEmail = trimmed.split(/[:|]/)[0].trim().toLowerCase();
        return lineEmail !== cleanEmail;
      });
      fs.writeFileSync(GSUITE_FILE, filtered.length > 0 ? filtered.join('\n') + '\n' : '', 'utf8');
      log('RECORD', `Dikeluarkan dari file gsuite: ${cleanEmail}`);
    }
  } catch (err) {
    log('WARN', `Gagal memindahkan akun selesai: ${err.message}`);
  }
}

function moveAccountToFailed(email, rawLine, errorMsg, screenshotPath = '') {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const lineToRecord = (rawLine || email).trim();
    const timestamp = new Date().toLocaleString('id-ID');

    // 1. Simpan ke akun_gagal.txt (dengan alasan gagal & timestamp)
    const existing = fs.existsSync(AKUN_GAGAL_FILE)
      ? fs.readFileSync(AKUN_GAGAL_FILE, 'utf8').split('\n').map(e => e.trim().toLowerCase()).filter(Boolean)
      : [];
    if (!existing.some(e => e.startsWith(cleanEmail))) {
      const failLine = `${lineToRecord} | GAGAL: ${(errorMsg || 'Unknown error').slice(0, 120)} | ${timestamp}`;
      fs.appendFileSync(AKUN_GAGAL_FILE, failLine + '\n', 'utf8');
      log('RECORD', `Dicatat ke akun_gagal.txt: ${cleanEmail}`);
    }

    // 2. Hapus/Keluarkan dari file gsuite
    if (fs.existsSync(GSUITE_FILE)) {
      const gsuiteLines = fs.readFileSync(GSUITE_FILE, 'utf8').split('\n');
      const filtered = gsuiteLines.filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        const lineEmail = trimmed.split(/[:|]/)[0].trim().toLowerCase();
        return lineEmail !== cleanEmail;
      });
      fs.writeFileSync(GSUITE_FILE, filtered.length > 0 ? filtered.join('\n') + '\n' : '', 'utf8');
      log('RECORD', `Akun gagal dikeluarkan dari file gsuite: ${cleanEmail}`);
    }

    // Kirim marker ke telebot agar tampil notifikasi gagal di Telegram (beserta screenshot jika ada)
    console.log(`###TELE_GAGAL###${email}###${(errorMsg || 'Unknown error').slice(0, 200)}###${screenshotPath || ''}###`);
  } catch (err) {
    log('WARN', `Gagal mencatat akun gagal: ${err.message}`);
  }
}

async function tryClick(page, selectors, timeout = 8000) {
  for (const sel of selectors) {
    try {
      const locator = sel.startsWith('xpath=')
        ? page.locator(`xpath=${sel.slice(6)}`)
        : page.locator(sel.startsWith('css=') ? sel.slice(4) : sel);
      await locator.first().waitFor({ state: 'visible', timeout });
      await locator.first().click();
      return true;
    } catch (_) {}
  }
  return false;
}

async function tryFill(page, selectors, value, timeout = 8000) {
  for (const sel of selectors) {
    try {
      const locator = sel.startsWith('xpath=')
        ? page.locator(`xpath=${sel.slice(6)}`)
        : page.locator(sel.startsWith('css=') ? sel.slice(4) : sel);
      await locator.first().waitFor({ state: 'visible', timeout });
      await locator.first().fill(value);
      return true;
    } catch (_) {}
  }
  return false;
}

async function dismissPopups(page) {
  // Tutup semua popup/banner yang muncul di dashboard
  const closeSels = [
    '[aria-label="Close"]',
    '[aria-label="close"]',
    'button[class*="close"]',
    'button[class*="dismiss"]',
    'button[class*="skip"]',
    '[data-testid="modal-close"]',
    '.modal-close',
    '.lv_dialog_close',
    '.lv_close',
    'button.lv_btn-close',
  ];
  for (const sel of closeSels) {
    try {
      const els = await page.$$(sel);
      for (const el of els) {
        try { await el.click({ timeout: 2000 }); await wait(300); } catch (_) {}
      }
    } catch (_) {}
  }
}

// ─── SELECT ACCOUNT IN GOOGLE POPUP (port dari BOT REGGT gsuite.py) ──────────
async function selectAccountInGooglePopup(googlePage, email) {
  if (!googlePage || googlePage.isClosed()) return false;
  log('AKUN', `Memilih akun Google di popup (${email})...`);

  for (let attempt = 0; attempt < 12; attempt++) {
    if (googlePage.isClosed()) return true;
    try { await googlePage.waitForLoadState('domcontentloaded', { timeout: 2000 }); } catch (_) {}

    // 1. Playwright locator search
    const accountSels = [
      `div[data-identifier="${email}"]`,
      `div[data-identifier*="${email}"]`,
      `div[data-email="${email}"]`,
      `div:has-text("${email}")`,
      `li:has-text("${email}")`,
      `xpath=//div[contains(., "${email}")]`,
      `xpath=//li[contains(., "${email}")]`,
      'div[role="link"]:has-text("@")',
      'div[role="button"]:has-text("@")',
      'div.wb1vfc',
      'ul.vv7owb li',
    ];
    for (const sel of accountSels) {
      try {
        const locator = sel.startsWith('xpath=')
          ? googlePage.locator(`xpath=${sel.slice(6)}`)
          : googlePage.locator(sel);
        const el = locator.first();
        if (await el.isVisible({ timeout: 1000 })) {
          log('OK', `Account item klik: ${sel}`);
          await el.click({ force: true });
          await wait(2000);
          return true;
        }
      } catch (_) {}
    }

    // 2. JS click fallback (mirip 1:1 dengan BOT REGGT)
    try {
      const clickedJs = await googlePage.evaluate((targetEmail) => {
        const elements = [...document.querySelectorAll('div, li, span, p, a')];
        for (const el of elements) {
          if (!el.offsetParent) continue;
          const txt = (el.textContent || '').toLowerCase();
          if (targetEmail && txt.includes(targetEmail.toLowerCase())) {
            let clickable = el;
            while (clickable && clickable !== document.body) {
              if (
                clickable.getAttribute('data-identifier') ||
                clickable.getAttribute('role') === 'link' ||
                clickable.getAttribute('role') === 'button' ||
                clickable.tagName === 'LI'
              ) break;
              clickable = clickable.parentElement;
            }
            const targetEl = clickable || el;
            targetEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
            targetEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            targetEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            if (typeof targetEl.click === 'function') targetEl.click();
            return true;
          }
        }
        return false;
      }, email);
      if (clickedJs) {
        log('OK', 'Account item klik via JS fallback!');
        await wait(2000);
        return true;
      }
    } catch (_) {}

    await wait(800);
  }
  return false;
}

// ─── FILL BIRTHDAY DI CAPCUT (port dari BOT REGGT capcut.py fill_birthday) ───
async function fillBirthday(page) {
  log('BIRTHDAY', 'Memeriksa form Tanggal Lahir di CapCut...');
  try {
    const birthdayInput = await page.waitForSelector(
      "input[placeholder*='Tahun' i], input[placeholder*='Year' i]",
      { timeout: 6000 }
    );
    if (!birthdayInput) return;

    log('BIRTHDAY', 'Isi tanggal lahir CapCut...');

    // Tahun
    await tryFill(page, [
      "css=input[placeholder='Tahun']",
      "css=input[maxlength='4'].gate_birthday-picker-input",
      "xpath=//input[@maxlength='4' and (contains(@placeholder, 'Tahun') or contains(@class, 'birthday'))]",
    ], '1995', 5000);

    // Bulan
    await tryClick(page, [
      "xpath=(//*[@role='combobox' and .//input[@placeholder='Bulan']])[1]",
      "xpath=(//*[contains(@class, 'gate_birthday-picker')]//*[@role='combobox'])[1]",
      "xpath=(//*[@role='combobox'])[1]",
    ], 5000);
    await wait(500);
    await tryClick(page, [
      "xpath=//li[@data-value='6' or contains(.,'Juni') or contains(.,'June')]",
      "xpath=//li[normalize-space(.)='6' or normalize-space(.)='Juni' or normalize-space(.)='June']",
    ], 3000);

    // Hari
    await tryClick(page, [
      "xpath=(//*[@role='combobox' and .//input[@placeholder='Hari']])[1]",
      "xpath=(//*[contains(@class, 'gate_birthday-picker')]//*[@role='combobox'])[2]",
      "xpath=(//*[@role='combobox'])[2]",
    ], 5000);
    await wait(500);
    await tryClick(page, [
      "xpath=//li[@data-value='15' or contains(.,'15')]",
      "xpath=//li[normalize-space(.)='15']",
    ], 3000);

    // Klik Lanjutkan / Next setelah birthday
    await tryClick(page, [
      "css=button.lv_sign_in_panel_wide-birthday-next",
      "xpath=//button[.//span[contains(., 'Lanjutkan')] or contains(., 'Lanjutkan')]",
      "xpath=//button[contains(normalize-space(.), 'Next') or contains(normalize-space(.), 'Berikutnya')]",
      "button:has-text('Lanjutkan')",
      "button:has-text('Next')",
    ], 5000);

    log('OK', 'Birthday selesai diisi');
    // Delay 3 detik setelah birthday selesai (sesuai flow)
    await wait(3000);
  } catch (_) {
    // Birthday tidak muncul, lanjut
  }
}

// ─── GOOGLE LOGIN (port 1:1 dari BOT REGGT gsuite.py login_gsuite_capcut) ────
async function loginGoogle(page, email, password) {
  log('LOGIN', `CapCut GSuite Google Login (${email})...`);
  const context = page.context();

  // Navigasi ke halaman login dengan auto-retry
  let navSuccess = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto('https://www.capcut.com/account-center/login', {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      navSuccess = true;
      break;
    } catch (navErr) {
      log('WARN', `Navigasi ke login CapCut gagal (percobaan ${attempt}/3): ${navErr.message}`);
      if (attempt < 3) {
        log('WAIT', 'Mencoba kembali dalam 3 detik...');
        await wait(3000);
      } else {
        throw navErr;
      }
    }
  }
  await wait(3000);

  // Daftar selector tombol login Google di modal CapCut
  const googleBtnSelectors = [
    '.lv_new_third_part_sign_in_expand-button',
    'span.lv_new_third_part_sign_in_expand-label',
    'span:has-text("Lanjutkan dengan Google")',
    'span:has-text("Continue with Google")',
    'div:has-text("Lanjutkan dengan Google")',
    'div:has-text("Continue with Google")',
    'button:has-text("Google")',
    'button:has-text("Lanjutkan dengan Google")',
    'button:has-text("Continue with Google")',
    '[class*="google_sign_in"]',
    '[class*="google-sign-in"]',
    '#signinDiv',
    '#signinDiv iframe',
    '.lv_google_sign_in_btn-expand-hit-area',
    '.lv_google_sign_in_btn-expand-wrapper-custom',
    'xpath=//*[contains(normalize-space(.), "Lanjutkan dengan Google") or contains(normalize-space(.), "Continue with Google")]'
  ];

  // Step 1: Deteksi modal login — jika belum terbuka, klik tombol "Masuk" / landing
  let isModalOpen = false;
  for (const sel of [
    '.lv_new_third_part_sign_in_expand-button',
    'span:has-text("Lanjutkan dengan Google")',
    'span:has-text("Continue with Google")',
    '#signinDiv'
  ]) {
    try {
      if (await page.locator(sel).first().isVisible({ timeout: 1500 })) {
        isModalOpen = true;
        break;
      }
    } catch (_) {}
  }

  if (!isModalOpen) {
    log('CLICK', 'Modal belum muncul, mencari tombol login landing...');
    const landingSels = [
      'button.lv-btn-primary:has-text("Masuk")',
      'button.lv-btn-primary:has-text("Sign in")',
      'button.lv-btn-primary:has-text("Log in")',
      'button:has-text("Masuk")',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'button:has-text("Get started")',
      'button:has-text("Daftar")',
      'button:has-text("Sign up")',
      'button.lv-btn-primary',
      'a:has-text("Masuk")',
      'a:has-text("Sign in")',
      'a:has-text("Log in")',
      'a:has-text("Get started")',
    ];

    let landingClicked = false;
    for (const sel of landingSels) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2500 })) {
          log('CLICK', `Klik landing: ${sel}`);
          await btn.click({ force: true });
          landingClicked = true;
          break;
        }
      } catch (_) {}
    }

    // Tunggu modal login muncul (hingga 12 detik)
    log('FIND', 'Menunggu modal login terbuka...');
    try {
      await page.locator(
        '.lv_new_third_part_sign_in_expand-button, span:has-text("Lanjutkan dengan Google"), span:has-text("Continue with Google"), #signinDiv'
      ).first().waitFor({ state: 'visible', timeout: 12000 });
      log('OK', 'Modal login CapCut berhasil terbuka');
    } catch (err) {
      log('WARN', `Menunggu modal: ${err.message}. Mencoba lanjut...`);
    }
  } else {
    log('OK', 'Modal login sudah terbuka langsung');
  }

  // Step 2: Setup listener popup & klik tombol Google
  log('CLICK', "Membuka login Google OAuth...");
  let googlePage = null;

  const handlePopup = (newPage) => {
    if (!googlePage) googlePage = newPage;
  };
  context.on('page', handlePopup);

  let clickedGoogle = false;
  for (const sel of googleBtnSelectors) {
    try {
      const loc = sel.startsWith('xpath=')
        ? page.locator(sel)
        : page.locator(sel.startsWith('css=') ? sel.slice(4) : sel);
      const el = loc.first();
      if (await el.isVisible({ timeout: 2000 })) {
        log('CLICK', `Klik tombol Google: ${sel}`);
        await el.click({ force: true });
        clickedGoogle = true;
        await wait(2000);
        break;
      }
    } catch (_) {}
  }

  if (!clickedGoogle) {
    // Fallback klik via JavaScript evaluate
    log('WARN', 'JS fallback click Google button...');
    await page.evaluate(() => {
      const btn = document.querySelector('.lv_new_third_part_sign_in_expand-button') ||
                  document.querySelector('#signinDiv') ||
                  [...document.querySelectorAll('span, div, button, a')].find(e =>
                    e.offsetParent && /Lanjutkan dengan Google|Continue with Google/i.test(e.textContent?.trim())
                  );
      if (btn) {
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        if (typeof btn.click === 'function') btn.click();
      }
    });
    await wait(2000);
  }

  // Cari popup Google di semua page context atau deteksi redirect halaman utama
  for (let i = 0; i < 15; i++) {
    if (googlePage && !googlePage.isClosed()) break;
    for (const p of context.pages()) {
      if (p !== page && (p.url().includes('google.com') || p.url().includes('accounts.google'))) {
        googlePage = p;
        break;
      }
    }
    if (googlePage) break;
    if (page.url().includes('google.com') || page.url().includes('accounts.google')) {
      googlePage = page;
      break;
    }
    await wait(1000);
  }

  if (!googlePage) {
    const allUrls = context.pages().map(p => p.url()).join(' | ');
    const ssPath = await takeDiagnosticScreenshot(page, 'google_popup_not_found', email);
    const err = new Error(`Gagal membuka halaman login Google (Popup tidak ditemukan). URL terbuka: ${allUrls}`);
    err.screenshotPath = ssPath;
    throw err;
  }
  log('OK', `Google OAuth terdeteksi: ${googlePage.url().slice(0, 70)}`);

  // Step 3 & 4: Intelligent Screen Detection & Handling
  log('EMAIL', `Deteksi layar login Google (${email})...`);
  try { await googlePage.waitForLoadState('domcontentloaded', { timeout: 8000 }); } catch (_) {}
  await wait(500);

  // Cek apakah layar password sudah terbuka duluan
  let isPasswordScreen = await googlePage.locator("input[name='Passwd'], input[type='password']").first().isVisible({ timeout: 1500 }).catch(() => false);

  if (!isPasswordScreen) {
    // 3a. Cek Email Input
    const emailInput = googlePage.locator("#identifierId, input[type='email'][name='identifier']").first();
    const hasEmailInput = await emailInput.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasEmailInput) {
      log('EMAIL', `Input email: ${email}`);
      await emailInput.click({ force: true });
      await wait(100);
      try {
        await emailInput.pressSequentially(email.trim(), { delay: 20 });
      } catch (_) {
        await emailInput.fill(email.trim());
      }
      await wait(200);

      // Klik Next email
      await googlePage.evaluate(() => {
        const mc = (el) => {
          if (!el) return;
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          el.click();
        };
        const btn = document.querySelector('#identifierNext button, button[jsname="LgJuR"], #identifierNext') ||
                    [...document.querySelectorAll('button')].find(b => /^(Next|Berikutnya)$/i.test((b.textContent||'').trim()));
        if (btn) mc(btn);
      });
      await googlePage.keyboard.press('Enter').catch(() => {});
      await wait(2000);
    } else {
      // 3b. Layar Account Picker
      log('AKUN', 'Account picker terdeteksi, memilih akun...');
      await selectAccountInGooglePopup(googlePage, email);
      await wait(1500);
    }
  } else {
    log('PASS', 'Layar password sudah aktif!');
  }

  // Step 4: Fill Password Google (Instan)
  if (googlePage && !googlePage.isClosed()) {
    log('PASS', 'Input password Google...');
    try {
      const pwdInput = googlePage.locator("input[name='Passwd'], input[type='password']").first();
      await pwdInput.waitFor({ state: 'visible', timeout: 8000 });
      await pwdInput.click({ force: true });
      await pwdInput.fill(password);

      log('CLICK', 'Submit password (Berikutnya)...');
      // JS Submit & Click Next sekaligus
      await googlePage.evaluate(() => {
        const pwd = document.querySelector("input[name='Passwd'], input[type='password']");
        if (pwd) {
          pwd.dispatchEvent(new Event('input', { bubbles: true }));
          pwd.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const mc = (el) => {
          if (!el) return;
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          el.click();
        };
        const btn = document.querySelector('#passwordNext button, #passwordNext, button[jsname="LgJuR"]') ||
                    [...document.querySelectorAll('button')].find(b => /^(Berikutnya|Next)$/i.test((b.textContent||'').trim()));
        if (btn) mc(btn);
      });

      await pwdInput.press('Enter').catch(() => {});
      await wait(3000);

      // Cek wrong password
      const wrongPwd = await googlePage.evaluate(() => {
        const els = [...document.querySelectorAll('span, div, p')];
        for (const el of els) {
          if (!el.offsetParent) continue;
          const txt = (el.textContent || '').trim().toLowerCase();
          if (txt.includes('wrong password') || txt.includes('kata sandi salah') ||
              txt.includes('password salah') || txt.includes('incorrect password')) {
            return el.textContent.trim();
          }
        }
        return null;
      });
      if (wrongPwd) throw new Error(`GOOGLE_WRONG_PASSWORD: ${email}: ${wrongPwd}`);
    } catch (e) {
      if (String(e).includes('GOOGLE_WRONG_PASSWORD')) throw e;
      log('WARN', `Password input info: ${e.message}`);
    }
  }

  // Step 5: Handle understand / confirm / agree / account chooser (loop 4x)
  const understandSels = [
    'css=input#confirm[name="confirm"]',
    'xpath=//input[@type="submit" and (@value="Saya mengerti" or @value="I understand")]',
    'xpath=//button[normalize-space(.)="Saya mengerti" or normalize-space(.)="I understand"]',
    'xpath=//*[@role="button" and (normalize-space(.)="Saya mengerti" or normalize-space(.)="I understand")]',
    'xpath=//*[contains(@class, "VfPpkd") and (contains(., "Saya mengerti") or contains(., "I understand"))]',
    'xpath=//button[normalize-space(.)="Continue" or normalize-space(.)="Lanjutkan"]',
    'xpath=//span[normalize-space(.)="Continue" or normalize-space(.)="Lanjutkan"]',
    'xpath=//*[@role="button" and (normalize-space(.)="Continue" or normalize-space(.)="Lanjutkan")]',
    // Agree and continue
    'css=#termsofserviceNext',
    'xpath=//div[@id="termsofserviceNext"]//button',
    'css=button[jsname="tHQobd"]',
    'xpath=//button[contains(normalize-space(.),"Agree and continue")]',
    'xpath=//button[contains(normalize-space(.),"Setuju dan lanjutkan")]',
    'xpath=//button[contains(normalize-space(.),"I agree")]',
    'xpath=//button[contains(normalize-space(.),"Saya setuju")]',
  ];
  const confirmSels = [
    'css=#confirm_yes',
    'xpath=//*[@id="confirm_yes" or (contains(., "Confirm") and @role="button")]',
    'button:has-text("Lanjutkan")',
    'button:has-text("Continue")',
    'button:has-text("Berikutnya")',
    'button:has-text("Next")',
    'button:has-text("Confirm")',
    'button:has-text("Confirmed")',
    'button:has-text("Allow")',
    'button:has-text("Izinkan")',
    '#submit_approve_access',
  ];

  for (let i = 0; i < 4; i++) {
    if (!googlePage || googlePage.isClosed()) break;
    await selectAccountInGooglePopup(googlePage, email);
    await tryClick(googlePage, understandSels, 1000);
    await tryClick(googlePage, confirmSels, 1000);
    await wait(800);
  }

  // Step 6: Birthday di halaman CapCut
  log('BIRTHDAY', 'Memeriksa form Tanggal Lahir di CapCut...');
  try { await page.bringToFront(); } catch (_) {}
  await wait(1000);
  await fillBirthday(page);

  // Step 7: Tunggu semua popup Google tertutup (pilih akun + klik Lanjutkan / Saya Mengerti jika muncul kembali)
  log('WAIT', 'Menunggu proses login Google OAuth selesai (pilih akun / konfirmasi)...');
  for (let i = 0; i < 20; i++) {
    const openGooglePopups = context.pages().filter(
      p => p !== page && !p.isClosed() &&
           (p.url().toLowerCase().includes('google.com') || p.url().toLowerCase().includes('accounts.google'))
    );
    if (openGooglePopups.length === 0) break;
    for (const gp of openGooglePopups) {
      try { await selectAccountInGooglePopup(gp, email); } catch (_) {}
      try { await tryClick(gp, understandSels, 500); } catch (_) {}
      try { await tryClick(gp, confirmSels, 500); } catch (_) {}
    }
    await wait(1000);
  }

  log('OK', 'Login Google selesai');
}


// ─── DISMISS ANNOUNCEMENT & FEATURE POPUPS (KABAR TERBARU / GPT IMAGE / BANNER) ──
async function dismissAnnouncementPopups(page) {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      // 1. Coba tutup via Playwright Locator terarah pada popup pengumuman
      try {
        const announceModal = page.locator('div[role="dialog"], [class*="modal"], [class*="Modal"], section, aside')
          .filter({ hasText: /Kabar terbaru|GPT Image|What's new|kini sudah TERSEDIA|is now available/i })
          .first();

        if (await announceModal.isVisible({ timeout: 800 }).catch(() => false)) {
          const closeBtn = announceModal.locator('button[class*="close"], button[class*="Close"], span[class*="close"], span[class*="Close"], svg[class*="close"], svg[class*="Close"], div[class*="close"], .semi-modal-close, .semi-icon-close, .lv-modal-close, [aria-label*="close" i], [aria-label*="tutup" i]').first();
          if (await closeBtn.isVisible({ timeout: 800 }).catch(() => false)) {
            await closeBtn.click({ force: true, timeout: 2000 }).catch(() => {});
            log('OK', 'Popup pengumuman (Kabar terbaru / GPT Image) ditutup via locator close');
            await wait(600);
            continue;
          }
        }
      } catch (_) {}

      // 2. Evaluasi DOM langsung (klik tombol close X, atau buang elemen pengumuman jika memblokir)
      const res = await page.evaluate(() => {
        const isVisible = el => !!(el && (el.offsetWidth || el.offsetHeight || (typeof el.getClientRects === 'function' && el.getClientRects().length > 0)));
        const mc = el => {
          if (!el) return;
          try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
          el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          if (typeof el.focus === 'function') el.focus();
          el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          if (typeof el.click === 'function') el.click();
        };

        const KEYWORDS = [
          'kabar terbaru', "what's new", 'gpt image', 'kini sudah tersedia',
          'is now available', 'editor video', 'video editor'
        ];

        // Cari container pengumuman (jangan sentuh container pricing modal yang memuat kursi / rp / bulan / batas)
        const allModals = [...document.querySelectorAll('div[role="dialog"], [class*="modal"], [class*="Modal"], [class*="dialog"], aside, section')].filter(el => {
          if (!isVisible(el)) return false;
          const t = (el.innerText || el.textContent || '').toLowerCase();
          return KEYWORDS.some(k => t.includes(k));
        });

        for (const modal of allModals) {
          // Cari tombol close di dalam modal ini
          const closeSelectors = [
            'button[class*="close"]', 'button[class*="Close"]',
            'span[class*="close"]', 'span[class*="Close"]',
            'svg[class*="close"]', 'svg[class*="Close"]',
            'div[class*="close"]', 'div[class*="Close"]',
            '.semi-modal-close', '.lv-modal-close', '.semi-icon-close',
            '[aria-label*="close" i]', '[aria-label*="tutup" i]'
          ];

          for (const sel of closeSelectors) {
            const cb = modal.querySelector(sel);
            if (cb && isVisible(cb)) {
              mc(cb);
              return `CloseIcon clicked (${sel})`;
            }
          }

          // Cari elemen berbentuk X di pojok kanan atas modal pengumuman
          const mRect = modal.getBoundingClientRect();
          const children = [...modal.querySelectorAll('*')].filter(c => isVisible(c));
          for (const c of children) {
            const r = c.getBoundingClientRect();
            if (r.right >= mRect.right - 80 && r.top <= mRect.top + 80 && r.width > 8 && r.width < 60 && r.height > 8 && r.height < 60) {
              if ((c.textContent || '').trim().length <= 3 || c.querySelector('svg') || c.tagName.toLowerCase() === 'svg') {
                mc(c);
                return 'TopRight X clicked';
              }
            }
          }

          // Jika tombol close gagal diklik atau popup tetap bandel, hilangkan dialog pengumuman agar pricing modal di belakangnya bebas diklik
          try {
            const parentWrap = modal.closest('.semi-modal-wrap, [class*="modal-wrap"], [class*="dialog-wrap"]') || modal;
            const mask = parentWrap.parentElement ? parentWrap.parentElement.querySelector('.semi-modal-mask, [class*="modal-mask"]') : null;
            if (mask) mask.remove();
            parentWrap.remove();
            return 'Announcement modal removed from DOM';
          } catch (_) {}
        }

        // Cek top announcement banner jika ada
        const banners = [...document.querySelectorAll('div, section, aside')].filter(el => {
          if (!isVisible(el)) return false;
          const t = (el.innerText || '').toLowerCase();
          return t.includes('gpt image') && (t.includes('try now') || t.includes('coba sekarang') || t.includes('available'));
        });

        for (const b of banners) {
          const cb = b.querySelector('button[class*="close"], span[class*="close"], svg, [aria-label*="close" i]');
          if (cb && isVisible(cb)) {
            mc(cb);
            return 'Top banner closed';
          }
        }

        return null;
      });

      if (res) {
        log('OK', `Popup pengumuman ditutup: ${res}`);
        await wait(600);
      } else {
        break;
      }
    }
  } catch (e) {
    log('WARN', `Error saat membersihkan popup pengumuman: ${e.message}`);
  }
}

// ─── DISMISS ALL POPUPS (ONBOARDING & SURVEY) ─────────────────────────────────
async function dismissPopups(page) {
  log('FIND', 'Membersihkan popup onboarding & survey...');
  await dismissAnnouncementPopups(page);
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      // 1. Tekan tombol Escape keyboard untuk menutup modal aktif
      await page.keyboard.press('Escape').catch(() => {});
      await wait(300);

      // 2. Klik tombol close / lewati di DOM
      const dismissed = await page.evaluate(() => {
        const isVisible = el => {
          if (!el) return false;
          return !!(el.offsetWidth || el.offsetHeight || (typeof el.getClientRects === 'function' && el.getClientRects().length > 0));
        };

        const mc = el => {
          if (!el) return;
          try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
          el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          if (typeof el.focus === 'function') el.focus();
          el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          if (typeof el.click === 'function') el.click();
        };

        // a. Cek teks tombol (Lewati, Skip, Nanti, Tutup, dll)
        const TEXTS = [
          'Lewati', 'Skip', 'OK', 'Ok', 'Got it', 'Done', 'Maybe later', 'Nanti',
          'Tutup', 'Selesai', 'Mengerti', 'Lanjut', 'Berikutnya', 'Next', 'Continue',
          'Dismiss', 'Batal', 'Saya mengerti'
        ];

        for (const text of TEXTS) {
          for (const el of document.querySelectorAll('button, a, div, span, p')) {
            if (!isVisible(el)) continue;
            if (el.closest('[class*="subscription"], [class*="plan"], [class*="modal-upgrade"]')) continue;
            if ((el.textContent || '').trim() === text) {
              mc(el);
              return text;
            }
          }
        }

        // b. Cek elemen penutup modal (X) di seluruh DOM
        const closeSelectors = [
          'button[class*="close"]', 'button[class*="Close"]',
          'div[class*="close"]', 'div[class*="Close"]',
          'span[class*="close"]', 'span[class*="Close"]',
          'i[class*="close"]', 'i[class*="Close"]',
          'svg[class*="close"]', 'svg[class*="Close"]',
          'path[class*="close"]',
          '.semi-modal-close', '.lv-modal-close', '.semi-icon-close',
          '[aria-label="Close"]', '[aria-label="Tutup"]',
          '.onboarding-close', '.guide-close'
        ];

        for (const sel of closeSelectors) {
          for (const cb of document.querySelectorAll(sel)) {
            if (!isVisible(cb)) continue;
            if (cb.closest('[class*="subscription"], [class*="plan"], [class*="modal-upgrade"]')) continue;
            mc(cb);
            return `CloseIcon (${sel})`;
          }
        }

        // c. Deteksi elemen X di pojok kanan atas modal aktif
        const modals = [...document.querySelectorAll('div[role="dialog"], div[class*="modal"], div[class*="Modal"], div[class*="dialog"]')].filter(m => {
          if (!isVisible(m)) return false;
          const txt = (m.textContent || '').toLowerCase();
          return !txt.includes('per seat') && !txt.includes('kursi') && !txt.includes('seats') && !txt.includes('tingkatkan') && !txt.includes('upgrade');
        });

        for (const m of modals) {
          const children = [...m.querySelectorAll('*')].filter(c => isVisible(c));
          for (const c of children) {
            const rect = c.getBoundingClientRect();
            const mRect = m.getBoundingClientRect();
            if (rect.right >= mRect.right - 80 && rect.top <= mRect.top + 80 && rect.width > 0 && rect.width < 50 && rect.height > 0 && rect.height < 50) {
              mc(c);
              return 'TopRightModalClose';
            }
          }
        }

        return null;
      });

      if (dismissed) {
        log('OK', `Popup onboarding ditutup: ${dismissed}`);
        await wait(500);
      } else {
        break;
      }
    } catch (_) {}
  }
}

// ─── NAVIGATE TO MY EDIT ─────────────────────────────────────────────────────
async function goToMyEdit(page) {
  log('NAVIGATE', 'Navigate ke CapCut My Edit...');
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto('https://www.capcut.com/my-edit', { waitUntil: 'domcontentloaded', timeout: 45000 });
      break;
    } catch (navErr) {
      log('WARN', `Navigasi My Edit gagal (percobaan ${attempt}/3): ${navErr.message}`);
      if (attempt < 3) {
        await wait(3000);
      } else {
        throw navErr;
      }
    }
  }
  await wait(3000);
  await dismissPopups(page);
  await wait(1000);
}

// ─── API ROUTES (space_list & init_trade) REFERENSI CAPCUT 7 DAY PLAN PRO ───
const INJECTED_SPACE_LIST = {
  ret: '0',
  errmsg: 'success',
  data: {
    space_list: [],
    joint_activity_space_list: [
      {
        product_id: 'capcut.giveaway.web.permanent.10g.along',
        status: 3,
        space_capacity: 5368709120,
        space_time: 0,
        space_end: 0,
        is_permanent: true,
        joint_activity_type: 0,
        is_add: true,
        desc: '',
        is_freezing: false,
        is_from_give: false
      }
    ],
    is_first_subscribe: true,
    is_auto_subscribe: true,    // <-- INJECT: paksa auto-subscribe
    is_cancel_subscribe: false,
    is_web_auto_subscribe: true // <-- INJECT: paksa web auto-subscribe
  }
};

async function setupTradeApiRoutes(page) {
  // PENTING: Di mode TEAMS, dilarang keras meng-inject space_list kosong (space_list: [])
  // karena merusak ID ruang tim asli dan menyebabkan error CapCut: ret -6 shark blocked & 36010113!
  const isTeams = PLAN_MODE === 'teams' || PLAN_MODE === 'team';
  const shouldInjectSpace = !isTeams && (process.env.INJECT_SPACE_LIST === 'true');

  if (shouldInjectSpace) {
    try {
      await page.route('**/subscription/workspace/space_list**', async (route) => {
        try {
          await route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify(INJECTED_SPACE_LIST)
          });
          log('INJECT', 'Route space_list di-inject (is_auto_subscribe=true)');
        } catch (_) {
          await route.continue().catch(() => {});
        }
      });
      log('INJECT', 'Route space_list terpasang');
    } catch (e) {
      log('WARN', `Route space_list gagal: ${e.message}`);
    }
  } else {
    log('INJECT', 'Route space_list: Menggunakan workspace/ruang kerja asli CapCut (Tanpa inject palsu)');
  }
}

// ─── PLAN: TEAMS 7 SEATS ──────────────────────────────────────────────────────
async function extractTeamsCashierLink(page, email = '') {
  log('MODE', `Mode: TEAMS | Target: ${TARGET_SEATS} seats/kursi`);
  await dismissPopups(page);

  let capturedCashierUrl = null;
  let lastTradeError = '';
  const context = page.context();

  // Helper validasi link cashier Pipopay persis seperti BOT REGGT & CAPCUT 7 DAY PLAN PRO
  const isValidPipopayCashierUrl = (urlStr) => {
    if (!urlStr || typeof urlStr !== 'string') return false;
    const low = urlStr.toLowerCase();
    if (low.includes('tiktokglobal.com') || low.includes('c.pipo.')) return false;
    if ((low.includes('pipopay.com') || low.includes('agreement-cashier') || low.includes('pipoux_checkout') || low.includes('payin_checkout')) &&
        (low.includes('pre_order_id=') || low.includes('order_id=') || low.includes('trade_no='))) {
      return true;
    }
    return false;
  };

  const checkAndSaveCashier = (urlStr) => {
    if (!urlStr || capturedCashierUrl) return;
    const cleanUrl = urlStr.replace(/\\/g, '').replace(/u0026/g, '&').replace(/&amp;/g, '&');
    if (isValidPipopayCashierUrl(cleanUrl)) {
      capturedCashierUrl = cleanUrl;
      log('CASHIER', `[OK] Valid Pipopay Cashier URL ditangkap: ${capturedCashierUrl.slice(0, 120)}...`);
    }
  };

  // 1. Intercept Popup & Framenavigated
  const popupHandler = (newPage) => {
    newPage.on('framenavigated', f => checkAndSaveCashier(f.url()));
    checkAndSaveCashier(newPage.url());
  };
  context.on('page', popupHandler);
  page.on('framenavigated', f => checkAndSaveCashier(f.url()));

  // 2. Intercept Request & Response API (Fetch/XHR) persis BOT REGGT & CAPCUT 7 DAY PLAN PRO
  page.on('request', req => checkAndSaveCashier(req.url()));

  const responseHandler = async (res) => {
    try {
      const u = res.url();
      checkAndSaveCashier(u);
      if (capturedCashierUrl) return;

      // Real Trade Init API response interceptor persis CAPCUT 7 DAY PLAN PRO
      if ((u.includes('init_trade') || u.includes('/trade/')) && res.request().method() === 'POST') {
        try {
          const rawText = await res.text().catch(() => '');
          if (rawText) {
            log('API', `[init_trade] Response status ${res.status()} diterima`);
            let respData = null;
            try { respData = JSON.parse(rawText); } catch (_) {}
            if (respData) {
              if (respData.ret && respData.ret !== '0' && respData.ret !== 0) {
                const errMsg = respData.errmsg || respData.message || 'Unknown Error';
                log('WARN', `[init_trade] API response ret: ${respData.ret}, errmsg: ${errMsg}`);
                if (errMsg.includes('shark blocked') || respData.ret === -6 || respData.ret === '-6') {
                  lastTradeError = 'SHARK_BLOCKED: init trade err: shark blocked (Transaksi dicekal oleh Anti-Fraud CapCut, ganti IP / gunakan proxy residential)';
                } else if (respData.ret === 36010113 || respData.ret === '36010113') {
                  lastTradeError = 'INVALID_WORKSPACE: ret 36010113 (Ruang tim / workspace tidak valid)';
                } else {
                  lastTradeError = `API_TRADE_ERROR: ret ${respData.ret} - ${errMsg}`;
                }
              }
              const d = (respData.data && typeof respData.data === 'object') ? respData.data : {};
              const findCashier = (obj, depth = 0) => {
                if (!obj || depth > 6) return '';
                if (typeof obj === 'string') {
                  if ((obj.includes('agreement-cashier') || obj.includes('payin_checkout') || obj.includes('pipoux_checkout') || obj.includes('cashier-') || obj.includes('pipopay.com')) && obj.startsWith('http')) {
                    return obj;
                  }
                  return '';
                }
                if (Array.isArray(obj)) {
                  for (const it of obj) {
                    const r = findCashier(it, depth + 1);
                    if (r) return r;
                  }
                  return '';
                }
                if (typeof obj === 'object') {
                  for (const k of Object.keys(obj)) {
                    const r = findCashier(obj[k], depth + 1);
                    if (r) return r;
                  }
                }
                return '';
              };

              let cu = (d.pipo_aggregate_pay_info && d.pipo_aggregate_pay_info.cashier_url)
                || d.cashier_url
                || findCashier(d)
                || findCashier(respData);

              if (cu && (cu.includes('tiktokglobal.com') || cu.includes('c.pipo.'))) cu = '';
              if (cu) {
                log('API', `[init_trade] Cashier URL ditemukan di response: ${cu.slice(0, 100)}...`);
                checkAndSaveCashier(cu);
              }
            }
          }
        } catch (ex) {
          log('WARN', `Parsing init_trade response error: ${ex.message}`);
        }
      }

      const resType = res.request().resourceType();
      if (resType === 'fetch' || resType === 'xhr') {
        const text = await res.text().catch(() => '');
        if (!text) return;

        // Standard regex match
        const matches = text.match(/https?:\\?\/\\?\/[^\s"']+(?:pipopay|agreement-cashier|pipoux_checkout|payin_checkout)[^\s"']*/gi);
        if (matches) {
          for (const m of matches) {
            checkAndSaveCashier(m);
            if (capturedCashierUrl) return;
          }
        }

        // Recursive JSON object search
        try {
          const json = JSON.parse(text);
          const findCashier = (obj, depth = 0) => {
            if (!obj || depth > 5) return null;
            if (typeof obj === 'string') {
              if (isValidPipopayCashierUrl(obj)) return obj;
              return null;
            }
            if (typeof obj === 'object') {
              for (const key of Object.keys(obj)) {
                const val = obj[key];
                if (typeof val === 'string' && isValidPipopayCashierUrl(val)) return val;
                if (typeof val === 'object') {
                  const res = findCashier(val, depth + 1);
                  if (res) return res;
                }
              }
            }
            return null;
          };
          const found = findCashier(json);
          if (found) checkAndSaveCashier(found);
        } catch (_) {}
      }
    } catch (_) {}
  };
  page.on('response', responseHandler);

  // Step 1: Klik tombol Upgrade di header (persis BOT REGGT)
  log('CLICK', 'Mencari dan mengklik tombol Upgrade / Tingkatkan di header (maks 25s)...');
  let headerClicked = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    try {
      const hit = await page.evaluate(() => {
        const isVisible = el => {
          if (!el) return false;
          return !!(el.offsetWidth || el.offsetHeight || (typeof el.getClientRects === 'function' && el.getClientRects().length > 0));
        };

        const mc = el => {
          if (!el) return;
          el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          if (typeof el.focus === 'function') el.focus();
          el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          if (typeof el.click === 'function') el.click();
        };

        // Class khusus CapCut
        const baru = document.querySelector('span.upgrade-text, div.upgrade-text, button.upgrade-text, [class*="upgrade-text"]');
        if (baru && isVisible(baru)) { mc(baru); return 'upgrade-text'; }

        const lama = document.querySelector('div.LvHeaderUpgradeVipNew, [class*="HeaderUpgrade"], [class*="headerUpgrade"], [class*="header-upgrade"]');
        if (lama && isVisible(lama)) { mc(lama); return 'LvHeaderUpgradeVipNew'; }

        // Text matching di berbagai tag HTML
        const WORDS = ['upgrade', 'tingkatkan', 'join pro', 'join vip', 'gabung pro', 'nâng cấp', 'pro', 'get pro', 'coba gratis', 'try pro'];
        for (const el of document.querySelectorAll('button, div, span, a, p')) {
          if (!isVisible(el)) continue;
          const txt = (el.textContent || '').trim().toLowerCase();
          if (WORDS.some(w => txt === w) && (!el.firstElementChild || el.childElementCount <= 2)) {
            mc(el);
            return txt;
          }
        }
        return null;
      });

      if (hit) {
        headerClicked = true;
        log('OK', `Klik Upgrade header via: ${hit}`);
        break;
      }
    } catch (_) {}
    await wait(1000);
  }

  if (!headerClicked) {
    // Playwright locator fallback
    for (const sel of [
      'button:has-text("Tingkatkan")', 'button:has-text("Upgrade")',
      'div:has-text("Tingkatkan")', 'div:has-text("Upgrade")',
      'span:has-text("Tingkatkan")', 'span:has-text("Upgrade")',
      'xpath=//*[contains(translate(text(), "UPGRADE", "upgrade"), "upgrade") or contains(text(), "Tingkatkan")]'
    ]) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 1500 })) {
          await el.click({ force: true });
          headerClicked = true;
          log('OK', `Klik Upgrade header via locator: ${sel}`);
          break;
        }
      } catch (_) {}
    }
  }

  if (!headerClicked) throw new Error('Tombol Upgrade/Tingkatkan tidak ditemukan di header setelah 25s');
  await wait(3000);

  // Reset cashier url listener agar tidak menggunakan url lama
  capturedCashierUrl = null;
  await dismissAnnouncementPopups(page);

  // Step 2: Scroll modal ke kanan untuk memastikan Tim card terlihat
  log('FIND', 'Memastikan Tim card terlihat & fokus...');
  await page.evaluate(() => {
    const modal = document.querySelector('div[role="dialog"], [class*="modal"], [class*="Modal"], [class*="dialog"]') || document;
    for (const el of modal.querySelectorAll('*')) {
      if (el.scrollWidth > el.clientWidth && el.offsetParent) {
        el.scrollLeft = el.scrollWidth;
      }
    }
  });
  await wait(1500);

  // Step 3: Klik "2 kursi" / "2 seats" di Tim card untuk buka dropdown
  log('SEATS', `Ubah seats dari 2 -> ${TARGET_SEATS} kursi...`);
  const seatSels = [
    'xpath=//*[normalize-space(.)="2 kursi"]',
    'xpath=//*[normalize-space(.)="2 seats"]',
    'xpath=//*[contains(normalize-space(.), "2 kursi")]',
    'xpath=//*[contains(normalize-space(.), "2 seats")]',
    '[role="combobox"]',
    'select',
    'xpath=//*[contains(normalize-space(.), "kursi")]',
    'xpath=//*[contains(normalize-space(.), "seats")]',
  ];

  let seatOpened = false;
  for (const sel of seatSels) {
    try {
      const locator = sel.startsWith('xpath=')
        ? page.locator(`xpath=${sel.slice(6)}`)
        : page.locator(sel);
      const el = locator.first();
      if (!await el.isVisible({ timeout: 3000 })) continue;

      const tag = await el.evaluate(e => e.tagName.toLowerCase()).catch(() => 'div');

      if (tag === 'select') {
        await el.selectOption([
          { label: `${TARGET_SEATS} kursi` },
        ]).catch(() => el.selectOption([{ label: `${TARGET_SEATS} seats` }]).catch(() =>
          el.selectOption([{ value: String(TARGET_SEATS) }])
        ));
        seatOpened = true;
        log('OK', `Seats diubah via <select>`);
        break;
      } else {
        await el.click({ force: true, timeout: 3000 });
        log('OK', `Klik seat selector: ${sel}`);
        await wait(800);
        seatOpened = true;
        break;
      }
    } catch (_) {}
  }

  if (seatOpened) {
    let optionClicked = false;
    const optSels = [
      `xpath=//*[normalize-space(text())="${TARGET_SEATS} kursi"]`,
      `xpath=//*[normalize-space(text())="${TARGET_SEATS} seats"]`,
      `xpath=//li[normalize-space(text())="${TARGET_SEATS} kursi"]`,
      `xpath=//li[normalize-space(text())="${TARGET_SEATS} seats"]`,
      `xpath=//div[normalize-space(text())="${TARGET_SEATS} kursi"]`,
      `xpath=//span[normalize-space(text())="${TARGET_SEATS} kursi"]`,
      `xpath=//*[@role="option" and normalize-space(text())="${TARGET_SEATS} kursi"]`,
      `xpath=//*[@role="option" and normalize-space(text())="${TARGET_SEATS} seats"]`,
      `[role="option"]:has-text("${TARGET_SEATS} kursi")`,
    ];
    for (const sel of optSels) {
      try {
        const locator = sel.startsWith('xpath=')
          ? page.locator(`xpath=${sel.slice(6)}`)
          : page.locator(sel);
        if (await locator.first().isVisible({ timeout: 2000 })) {
          await locator.first().click({ force: true });
          log('OK', `Pilih ${TARGET_SEATS} kursi via selector: ${sel}`);
          optionClicked = true;
          break;
        }
      } catch (_) {}
    }

    if (!optionClicked) {
      log('WARN', `JS fallback: cari teks "${TARGET_SEATS} kursi"...`);
      optionClicked = await page.evaluate((seats) => {
        const target = [`${seats} kursi`, `${seats} seats`];
        const all = [...document.querySelectorAll('li, div, span, p, option')];
        for (const el of all) {
          if (!el.offsetParent) continue;
          const txt = (el.textContent || '').trim();
          if (target.includes(txt)) {
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            if (typeof el.click === 'function') el.click();
            return true;
          }
        }
        return false;
      }, TARGET_SEATS);
      if (optionClicked) log('OK', `Pilih ${TARGET_SEATS} kursi via JS fallback`);
    }

    await wait(1500);
  } else {
    log('WARN', 'Seat selector tidak ditemukan, coba lanjut upgrade...');
  }

  // Step 4: Klik Tingkatkan Pertama & Klik Tingkatkan Kedua TEPAT DI BAWAH TARGET_SEATS KURSI
  const clickTingkatkan = async (label) => {
    log('CLICK', `Klik Tingkatkan (${label}) tepat di bawah ${TARGET_SEATS} kursi...`);
    let clicked = await page.evaluate((seats) => {
      const mc = el => {
        if (!el) return;
        try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        if (typeof el.focus === 'function') el.focus();
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        if (typeof el.click === 'function') el.click();
      };

      // Strategy 1: Cari elemen dengan teks target kursi/seats (${seats} kursi / ${seats} seats) dan temukan tombol Tingkatkan di container yang sama
      const seatEls = [...document.querySelectorAll('*')].filter(el => {
        if (!el.offsetParent) return false;
        const txt = (el.textContent || '').trim().toLowerCase();
        return txt === `${seats} kursi` || txt === `${seats} seats` || txt.includes(`${seats} kursi`) || txt.includes(`${seats} seats`);
      });

      for (const sEl of seatEls) {
        let p = sEl.parentElement;
        for (let i = 0; i < 6; i++) {
          if (!p) break;
          const btns = [...p.querySelectorAll('button, [role="button"], div, a')].filter(b => {
            if (!b.offsetParent) return false;
            const bTxt = (b.textContent || '').trim().toLowerCase();
            return (bTxt === 'tingkatkan' || bTxt === 'upgrade') && (!b.children || b.children.length <= 2);
          });
          if (btns.length > 0) {
            mc(btns[btns.length - 1]);
            return true;
          }
          p = p.parentElement;
        }
      }

      // Strategy 2: Cari card yang mengandung "per kursi" / "Tim" / "Teams"
      const cards = [...document.querySelectorAll('div, section, article')].filter(el => {
        if (!el.offsetParent) return false;
        const txt = (el.textContent || '').toLowerCase();
        return (txt.includes('per kursi') || txt.includes('tim') || txt.includes('teams')) &&
               (txt.includes('tingkatkan') || txt.includes('upgrade'));
      });

      for (const card of cards.reverse()) {
        const btns = [...card.querySelectorAll('button, [role="button"], a, div')].filter(b => {
          if (!b.offsetParent) return false;
          const bTxt = (b.textContent || '').trim().toLowerCase();
          return (bTxt === 'tingkatkan' || bTxt === 'upgrade') && (!b.children || b.children.length <= 2);
        });
        if (btns.length > 0) {
          mc(btns[btns.length - 1]);
          return true;
        }
      }

      return false;
    }, TARGET_SEATS);

    // Strategy 3 (Playwright XPath Ancestor Search):
    if (!clicked) {
      try {
        const teamBtnLocator = page.locator(`xpath=//*[contains(., "${TARGET_SEATS} kursi") or contains(., "${TARGET_SEATS} seats") or contains(., "per kursi")]/ancestor::div[contains(., "Tingkatkan") or contains(., "Upgrade")]//button[normalize-space(.)="Tingkatkan" or normalize-space(.)="Upgrade"]`);
        if (await teamBtnLocator.last().isVisible({ timeout: 2000 })) {
          await teamBtnLocator.last().click({ force: true });
          clicked = true;
        }
      } catch (_) {}
    }

    if (!clicked) {
      try {
        const fallbackBtn = page.locator('button:has-text("Tingkatkan"), button:has-text("Upgrade")').last;
        if (await fallbackBtn.isVisible({ timeout: 2000 })) {
          await fallbackBtn.click({ force: true });
          clicked = true;
        }
      } catch (_) {}
    }

    return clicked;
  };

  // Klik 1st time
  await clickTingkatkan('Pertama');
  log('WAIT', 'Tunggu 2 detik (penanganan notif couldnt pay / tidak dapat membayar)...');
  await wait(2000);

  const uAfterFirst = await detectUnusualActivity(page);
  if (uAfterFirst) {
    log('FAIL', `❌ Terdeteksi Unusual Activity setelah klik Tingkatkan: ${uAfterFirst}`);
    const ssPath = await takeDiagnosticScreenshot(page, 'unusual_teams', email);
    const err = new Error(`UNUSUAL_ACTIVITY: ${uAfterFirst} (Transaksi dicekal oleh CapCut, rotasi IP diperlukan)`);
    err.screenshotPath = ssPath;
    throw err;
  }

  if (capturedCashierUrl) {
    log('CASHIER', `Cashier link didapatkan (instan API): ${capturedCashierUrl}`);
    return capturedCashierUrl;
  }

  // Klik 2nd time
  await clickTingkatkan('Kedua');
  await wait(3000);

  const uAfterSecond = await detectUnusualActivity(page);
  if (uAfterSecond) {
    log('FAIL', `❌ Terdeteksi Unusual Activity setelah klik Tingkatkan ke-2: ${uAfterSecond}`);
    const ssPath = await takeDiagnosticScreenshot(page, 'unusual_teams', email);
    const err = new Error(`UNUSUAL_ACTIVITY: ${uAfterSecond} (Transaksi dicekal oleh CapCut, rotasi IP diperlukan)`);
    err.screenshotPath = ssPath;
    throw err;
  }

  // Helper pencari link cashier dari berbagai sumber
  const getCashierLink = async () => {
    if (capturedCashierUrl) return capturedCashierUrl;

    // Cek tab utama
    const mainUrl = page.url();
    if (isValidPipopayCashierUrl(mainUrl)) return mainUrl;

    // Cek semua tab/popup yang terbuka
    for (const p of context.pages()) {
      const u = p.url();
      if (isValidPipopayCashierUrl(u)) return u;
    }

    // Cek link href/iframe di DOM
    const links = await page.evaluate(() => {
      const found = [];
      document.querySelectorAll('a[href], iframe[src]').forEach(el => {
        const u = el.href || el.src;
        if (u && /pipopay|agreement-cashier|pipoux_checkout|payin_checkout/i.test(u)) found.push(u);
      });
      return found;
    }).catch(() => []);

    for (const l of links) {
      if (isValidPipopayCashierUrl(l)) return l;
    }

    return null;
  };

  let cashierLink = await getCashierLink();

  // Polling jika popup belum muncul sempurna (tunggu hingga 8 detik)
  if (!cashierLink) {
    for (let i = 0; i < 8; i++) {
      await wait(1000);
      cashierLink = await getCashierLink();
      if (cashierLink) break;

      const uPoll = await detectUnusualActivity(page);
      if (uPoll) {
        const ssPath = await takeDiagnosticScreenshot(page, 'unusual_teams', email);
        const err = new Error(`UNUSUAL_ACTIVITY: ${uPoll} (Transaksi dicekal oleh CapCut, rotasi IP diperlukan)`);
        err.screenshotPath = ssPath;
        throw err;
      }
    }
  }

  if (cashierLink) {
    log('CASHIER', `Cashier link didapatkan: ${cashierLink}`);
    return cashierLink;
  }

  const finalTeamsUnusual = await detectUnusualActivity(page);
  if (finalTeamsUnusual) {
    const ssPath = await takeDiagnosticScreenshot(page, 'unusual_teams', email);
    const err = new Error(`UNUSUAL_ACTIVITY: ${finalTeamsUnusual} (Transaksi dicekal oleh CapCut, rotasi IP diperlukan)`);
    err.screenshotPath = ssPath;
    throw err;
  }

  const ssPath = await takeDiagnosticScreenshot(page, 'no_cashier_teams', email);
  const finalMsg = lastTradeError || 'Cashier link tidak ditemukan setelah 2x klik Tingkatkan';
  const err = new Error(finalMsg);
  err.screenshotPath = ssPath;
  throw err;
}

// ─── PLAN: PRO RP14.500 (PROMO BULAN PERTAMA) ─────────────────────────────────
async function extractProCashierLink(page, email = '') {
  log('MODE', 'Mode: PRO (Promo Rp14.500)');
  await dismissPopups(page);

  let capturedCashierUrl = null;
  let lastTradeError = '';
  const context = page.context();

  const isValidPipopayCashierUrl = (urlStr) => {
    if (!urlStr || typeof urlStr !== 'string') return false;
    const clean = urlStr.trim();
    // PENTING: Harus berupa valid URL (diawali http:// atau https://), bukan string JSON atau array!
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) return false;
    if (clean.includes('{') || clean.includes('}') || clean.includes('[') || clean.includes(']') || clean.includes('"') || clean.includes(' ')) return false;

    const low = clean.toLowerCase();
    if (low.includes('tiktokglobal.com') || low.includes('c.pipo.') || low.includes('api-va.tiktokv.com')) return false;
    if (low.includes('/subscription/cc_price_list') || low.includes('cc_price_list')) return false;

    if (
      low.includes('pipopay.com') ||
      low.includes('agreement-cashier') ||
      low.includes('pipoux_checkout') ||
      low.includes('payin_checkout') ||
      low.includes('cashier-') ||
      low.includes('/cashier') ||
      (low.includes('checkout') && (low.includes('pre_order_id') || low.includes('order_id') || low.includes('trade_no') || low.includes('token') || low.includes('cashier')))
    ) {
      return true;
    }
    return false;
  };

  const checkAndSaveCashier = (urlStr) => {
    if (!urlStr || capturedCashierUrl) return;
    const cleanUrl = urlStr.replace(/\\/g, '').replace(/u0026/g, '&').replace(/&amp;/g, '&');
    if (isValidPipopayCashierUrl(cleanUrl)) {
      capturedCashierUrl = cleanUrl;
      log('CASHIER', `[OK] Valid Pipopay Cashier URL ditangkap: ${capturedCashierUrl.slice(0, 120)}...`);
    }
  };

  // Intercept Popup & Framenavigated
  const popupHandler = (newPage) => {
    newPage.on('framenavigated', f => checkAndSaveCashier(f.url()));
    newPage.on('load', () => checkAndSaveCashier(newPage.url()));
    newPage.on('request', req => checkAndSaveCashier(req.url()));
    newPage.on('response', res => {
      checkAndSaveCashier(res.url());
      responseHandler(res);
    });
    checkAndSaveCashier(newPage.url());
  };
  context.on('page', popupHandler);
  page.on('framenavigated', f => checkAndSaveCashier(f.url()));

  // Intercept Request & Response
  page.on('request', req => checkAndSaveCashier(req.url()));

  const responseHandler = async (res) => {
    try {
      const u = res.url();
      checkAndSaveCashier(u);
      if (capturedCashierUrl) return;

      if ((u.includes('init_trade') || u.includes('/trade/')) && res.request().method() === 'POST') {
        try {
          const rawText = await res.text().catch(() => '');
          if (rawText) {
            let respData = null;
            try { respData = JSON.parse(rawText); } catch (_) {}
            log('API', `[init_trade] Response status ${res.status()} diterima (ret: ${respData?.ret ?? 'unknown'})`);
            if (respData) {
              if (respData.ret && respData.ret !== '0' && respData.ret !== 0) {
                const errMsg = respData.errmsg || respData.message || 'Unknown Error';
                log('WARN', `[init_trade] API response ret: ${respData.ret}, errmsg: ${errMsg}`);
                if (errMsg.includes('shark blocked') || respData.ret === -6 || respData.ret === '-6') {
                  lastTradeError = 'SHARK_BLOCKED: init trade err: shark blocked (Transaksi dicekal oleh Anti-Fraud CapCut, ganti IP / gunakan proxy residential)';
                } else if (respData.ret === 36010113 || respData.ret === '36010113') {
                  lastTradeError = 'INVALID_WORKSPACE: ret 36010113 (Ruang tim / workspace tidak valid)';
                } else {
                  lastTradeError = `API_TRADE_ERROR: ret ${respData.ret} - ${errMsg}`;
                }
              }
              const d = (respData.data && typeof respData.data === 'object') ? respData.data : {};
              const findCashier = (obj, depth = 0) => {
                if (!obj || depth > 6) return '';
                if (typeof obj === 'string') {
                  if (obj.startsWith('http') && isValidPipopayCashierUrl(obj)) return obj;
                  return '';
                }
                if (Array.isArray(obj)) { for (const it of obj) { const r = findCashier(it, depth + 1); if (r) return r; } return ''; }
                if (typeof obj === 'object') { for (const k of Object.keys(obj)) { const r = findCashier(obj[k], depth + 1); if (r) return r; } }
                return '';
              };
              let cu = (d.pipo_aggregate_pay_info && d.pipo_aggregate_pay_info.cashier_url) ||
                       d.cashier_url ||
                       d.pay_url ||
                       d.redirect_url ||
                       findCashier(d) ||
                       findCashier(respData);
              if (cu && (cu.includes('tiktokglobal.com') || cu.includes('c.pipo.'))) cu = '';
              if (cu && cu.startsWith('http')) {
                log('API', `[init_trade] Checkout URL terdeteksi di payload: ${cu.slice(0, 100)}...`);
                checkAndSaveCashier(cu);
              }
            }
          }
        } catch (_) {}
      }

      const resType = res.request().resourceType();
      if (resType === 'fetch' || resType === 'xhr') {
        const text = await res.text().catch(() => '');
        if (!text) return;
        const matches = text.match(/https?:\\?\/\\?\/[^\s"']+(?:pipopay|agreement-cashier|pipoux_checkout|payin_checkout)[^\s"']*/gi);
        if (matches) { for (const m of matches) { checkAndSaveCashier(m); if (capturedCashierUrl) return; } }
        try {
          const json = JSON.parse(text);
          const findCashier = (obj, depth = 0) => {
            if (!obj || depth > 5) return null;
            if (typeof obj === 'string') { if (obj.startsWith('http') && isValidPipopayCashierUrl(obj)) return obj; return null; }
            if (typeof obj === 'object' && obj !== null) { for (const key of Object.keys(obj)) { const val = obj[key]; if (typeof val === 'string' && val.startsWith('http') && isValidPipopayCashierUrl(val)) return val; if (typeof val === 'object' && val !== null) { const res = findCashier(val, depth + 1); if (res) return res; } } }
            return null;
          };
          const found = findCashier(json);
          if (found) checkAndSaveCashier(found);
        } catch (_) {}
      }
    } catch (_) {}
  };
  page.on('response', responseHandler);

  // Step 1: Klik tombol Upgrade di header
  log('CLICK', 'Mencari dan mengklik tombol Upgrade / Tingkatkan di header...');
  let headerClicked = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    try {
      const hit = await page.evaluate(() => {
        const isVisible = el => !!(el && (el.offsetWidth || el.offsetHeight || (typeof el.getClientRects === 'function' && el.getClientRects().length > 0)));
        const mc = el => { if (!el) return; el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); if (typeof el.focus === 'function') el.focus(); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); if (typeof el.click === 'function') el.click(); };

        const baru = document.querySelector('span.upgrade-text, div.upgrade-text, button.upgrade-text, [class*="upgrade-text"]');
        if (baru && isVisible(baru)) { mc(baru); return 'upgrade-text'; }
        const lama = document.querySelector('div.LvHeaderUpgradeVipNew, [class*="HeaderUpgrade"], [class*="headerUpgrade"], [class*="header-upgrade"]');
        if (lama && isVisible(lama)) { mc(lama); return 'LvHeaderUpgradeVipNew'; }
        const WORDS = ['upgrade', 'tingkatkan', 'join pro', 'join vip', 'gabung pro', 'pro', 'get pro', 'coba gratis', 'try pro'];
        for (const el of document.querySelectorAll('button, div, span, a, p')) {
          if (!isVisible(el)) continue;
          const txt = (el.textContent || '').trim().toLowerCase();
          if (WORDS.some(w => txt === w) && (!el.firstElementChild || el.childElementCount <= 2)) { mc(el); return txt; }
        }
        return null;
      });
      if (hit) { headerClicked = true; log('OK', `Klik Upgrade header via: ${hit}`); break; }
    } catch (_) {}
    await wait(1000);
  }

  if (!headerClicked) {
    for (const sel of ['button:has-text("Tingkatkan")', 'button:has-text("Upgrade")', 'div:has-text("Tingkatkan")', 'div:has-text("Upgrade")', 'span:has-text("Tingkatkan")', 'span:has-text("Upgrade")']) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 1500 })) { await el.click({ force: true }); headerClicked = true; log('OK', `Klik Upgrade header via locator: ${sel}`); break; }
      } catch (_) {}
    }
  }

  if (!headerClicked) throw new Error('Tombol Upgrade/Tingkatkan tidak ditemukan di header');
  await wait(3000);
  capturedCashierUrl = null;

  // Tutup popup pengumuman seperti "Kabar terbaru" / "GPT Image" jika muncul di depan modal pricing
  await dismissAnnouncementPopups(page);
  await wait(800);
  await dismissAnnouncementPopups(page);

  // Pastikan Tab "Monthly" / "Bulanan" aktif jika ada tab list
  try {
    await page.evaluate(() => {
      const isVisible = el => !!(el && (el.offsetWidth || el.offsetHeight || (typeof el.getClientRects === 'function' && el.getClientRects().length > 0)));
      const tabCandidates = [...document.querySelectorAll('button, div, [role="tab"], span, a')].filter(el => {
        if (!isVisible(el)) return false;
        const t = (el.textContent || '').trim().toLowerCase();
        return (t.startsWith('monthly') || t.startsWith('bulanan')) && (t.includes('89%') || t.includes('off') || t.includes('diskon') || t === 'monthly' || t === 'bulanan');
      });
      if (tabCandidates.length > 0) {
        tabCandidates[0].click();
      }
    });
    await wait(600);
  } catch (_) {}

  // ─── STEP 1.5: CEK KELAYAKAN PROMO RP14.500 & STATUS UNUSUAL ACTIVITY ─────────────
  log('PRO', 'Menganalisis ketersediaan promo CapCut Pro Rp14.500 dan status akun...');

  const checkProEligibility = async () => {
    return await page.evaluate(() => {
      const isVisible = el => !!(el && (el.offsetWidth || el.offsetHeight || (typeof el.getClientRects === 'function' && el.getClientRects().length > 0)));
      const bodyText = (document.body ? document.body.innerText : '') || '';

      // 1. Cek Unusual Activity
      let hasUnusual = /unusual activity in your account|aktivitas mencurigakan|aktivitas tidak biasa|can't proceed for the moment/i.test(bodyText);
      let unusualMsg = '';
      const alertEls = [...document.querySelectorAll('div, [role="alert"], [class*="toast"], [class*="notice"], [class*="message"], [class*="tooltip"], [class*="popover"]')];
      for (const el of alertEls) {
        if (!isVisible(el)) continue;
        const t = (el.textContent || '').trim();
        if (/unusual activity in your account|aktivitas mencurigakan|can't proceed for the moment|aktivitas tidak biasa/i.test(t)) {
          hasUnusual = true;
          unusualMsg = t;
          break;
        }
      }

      // 2. Cek card Pro dan ketersediaan harga promo Rp14.500
      const cards = [...document.querySelectorAll('div, section, article')].filter(el => {
        if (!isVisible(el)) return false;
        const txt = (el.textContent || '').toLowerCase();
        return txt.includes('pro') && !txt.includes('ultra') && !txt.includes('teams') && !txt.includes('per kursi') && !txt.includes('per seat');
      });

      let has14500 = false;
      let hasRp0 = false;
      for (const card of cards) {
        const txt = (card.textContent || '').toLowerCase();
        if (/14[.,\s]?500/i.test(txt) || /first month|bulan pertama/i.test(txt)) {
          has14500 = true;
          break;
        }
        if (txt.includes('rp0') || txt.includes('rp 0') || txt.includes('0 for 7 days') || txt.includes('0 selama 7 hari') || txt.includes('gratis 7 hari') || txt.includes('7 days free') || txt.includes('free for 7') || txt.includes('trial 7 hari')) {
          hasRp0 = true;
        }
      }

      if (!has14500 && !hasRp0) {
        if (/14[.,\s]?500/i.test(bodyText)) {
          has14500 = true;
        } else if (/rp\s*0\b|0\s*for\s*7\s*days|gratis\s*7\s*hari|free\s*for\s*7\s*days/i.test(bodyText)) {
          hasRp0 = true;
        }
      }

      return {
        hasUnusual,
        unusualMsg: unusualMsg || (hasUnusual ? "We've noticed some unusual activity in your account. To protect security, you can't proceed for the moment." : ''),
        has14500,
        hasRp0
      };
    });
  };

  let eligibility = await checkProEligibility();
  if (!eligibility.has14500 && !eligibility.hasRp0 && !eligibility.hasUnusual) {
    log('WAIT', 'Menunggu 2 detik tambahan untuk rendering harga modal...');
    await wait(2000);
    eligibility = await checkProEligibility();
  }

  // 1. Jika terdeteksi Unusual Activity langsung
  if (eligibility.hasUnusual) {
    log('FAIL', `❌ Terdeteksi Unusual Activity: ${eligibility.unusualMsg}`);
    const ssPath = await takeDiagnosticScreenshot(page, 'unusual_activity', email);
    const err = new Error(`UNUSUAL_ACTIVITY: ${eligibility.unusualMsg} (IP terkena limit oleh CapCut, rotasi IP diperlukan)`);
    err.screenshotPath = ssPath;
    throw err;
  }

  // 2. Jika promo Rp14.500 TIDAK ADA
  if (!eligibility.has14500 && !eligibility.hasRp0) {
    log('WARN', '⚠️ Promo CapCut Pro Rp14.500 TIDAK TERSEDIA pada akun ini (Hanya harga normal/tanpa promo).');
    const ssPath = await takeDiagnosticScreenshot(page, 'no_promo_14500', email);
    const err = new Error('PROMO_14500_TIDAK_TERSEDIA: Promo Pro Rp14.500 tidak tersedia pada akun ini (Hanya harga normal/tanpa promo).');
    err.screenshotPath = ssPath;
    throw err;
  }

  if (eligibility.has14500) {
    log('OK', '✓ Promo CapCut Pro Rp14.500 TERDETEKSI aktif dan siap diambil!');
  } else {
    log('OK', '✓ Promo CapCut Pro Rp0 / Trial TERDETEKSI aktif dan siap diambil!');
  }

  // Step 2: Cari card Pro dan klik Upgrade di dalamnya
  log('CLICK', 'Mencari card PRO dan klik Upgrade...');

  const clickProUpgrade = async (label) => {
    log('CLICK', `Klik Upgrade PRO (${label})...`);
    await dismissAnnouncementPopups(page);
    let clicked = false;

    // 0. Pastikan Tab Monthly aktif dan scroll modal agar tombol Pro terlihat jelas
    await page.evaluate(() => {
      const isVisible = el => !!(el && (el.offsetWidth || el.offsetHeight || (typeof el.getClientRects === 'function' && el.getClientRects().length > 0)));
      const tabCandidates = [...document.querySelectorAll('button, div, [role="tab"], span, a')].filter(el => {
        if (!isVisible(el)) return false;
        const t = (el.textContent || '').trim().toLowerCase();
        return (t.startsWith('monthly') || t.startsWith('bulanan')) && (t.includes('89%') || t.includes('off') || t.includes('diskon') || t === 'monthly' || t === 'bulanan');
      });
      if (tabCandidates.length > 0) {
        try { tabCandidates[0].click(); } catch (_) {}
      }

      const modal = document.querySelector('div[role="dialog"], [class*="modal"], [class*="Modal"], [class*="dialog"]') || document.body;
      const all = [modal, ...modal.querySelectorAll('*')];
      for (const el of all) {
        if (el.scrollHeight > el.clientHeight && el.clientHeight > 150) {
          el.scrollTop = 250;
        }
      }
    }).catch(() => {});
    await wait(300);

    // 1. Evaluasi DOM Langsung: Cari Card Pro (memuat 'Pro' + '14,500' / '14.500' / '144,000' / 'first month' / 'bulan pertama', BUKAN 'Ultra', BUKAN 'Teams/Tim', BUKAN 'Current plan/Free')
    try {
      const evalResult = await page.evaluate(() => {
        const isVisible = el => !!(el && (el.offsetWidth || el.offsetHeight || (typeof el.getClientRects === 'function' && el.getClientRects().length > 0)));
        const mc = el => {
          if (!el) return;
          try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
          el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          if (typeof el.focus === 'function') el.focus();
          el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          if (typeof el.click === 'function') el.click();
        };

        // Ambil modal pricing utama
        const modals = [...document.querySelectorAll('div[role="dialog"], [class*="modal"], [class*="Modal"], [class*="dialog"]')].filter(m => {
          if (!isVisible(m)) return false;
          const t = (m.textContent || '').toLowerCase();
          return !t.includes('kabar terbaru') && !t.includes('gpt image 2.5');
        });
        const root = modals.length > 0 ? modals[0] : document.body;

        // Cari semua container card di dalam pricing modal
        // Card 2 Pro memiliki ciri khas:
        // - Mengandung teks "Pro"
        // - Mengandung teks "14,500" / "14.500" / "14500" / "144,000" / "144.000" / "first month" / "bulan pertama" / "selama 7 hari" / "7 days"
        // - TIDAK mengandung "Ultra" (Card 3)
        // - TIDAK mengandung "Tim" atau "Teams" atau "per kursi" / "per seat" (Card 4)
        // - TIDAK mengandung "current plan" / "paket saat ini" (Card 1 Gratis)
        const allCandidates = [...root.querySelectorAll('div, section, article')].filter(el => {
          if (!isVisible(el)) return false;
          if (el.offsetWidth > 600 || el.offsetHeight < 80) return false;
          const t = (el.textContent || '').toLowerCase();
          const hasPro = t.includes('pro');
          const hasPromoOrPrice = /14[.,\s]?500/i.test(t) || t.includes('144,000') || t.includes('144.000') || t.includes('first month') || t.includes('bulan pertama') || t.includes('selama 7 hari') || t.includes('7 days') || t.includes('500 monthly ai credits') || t.includes('500 kredit');
          const isNotOthers = !t.includes('ultra') && !t.includes('tim') && !t.includes('teams') && !t.includes('per kursi') && !t.includes('per seat') && !t.includes('current plan') && !t.includes('paket saat ini');
          return hasPro && hasPromoOrPrice && isNotOthers;
        });

        // Loop dari card terdalam
        for (const card of allCandidates) {
          try { card.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}

          const btns = [...card.querySelectorAll('button, [role="button"], a, div[class*="btn"], div[class*="button"]')].filter(b => {
            if (!isVisible(b)) return false;
            const bTxt = (b.textContent || '').trim().toLowerCase();
            if (bTxt === '' && b.querySelector('svg')) return false; // bukan icon close
            return true;
          });

          if (btns.length > 0) {
            const ctaBtn = btns.find(b => {
              const bTxt = (b.textContent || '').trim().toLowerCase();
              return bTxt.includes('upgrade') || bTxt.includes('tingkatkan') || bTxt.includes('coba') || bTxt.includes('mulai') || bTxt.includes('get pro');
            }) || btns[0];

            mc(ctaBtn);
            return { ok: true, text: ctaBtn.textContent?.trim(), tag: ctaBtn.tagName, method: 'pro-card-button' };
          }
        }

        // Fallback: Cari elemen teks harga Rp14,500 / Rp14.500 dan telusuri tombol di parent container-nya
        const priceEls = [...root.querySelectorAll('*')].filter(el => {
          if (!isVisible(el)) return false;
          const t = (el.textContent || '').trim().toLowerCase();
          return /14[.,\s]?500/i.test(t) && !t.includes('ultra') && !t.includes('teams') && !t.includes('tim');
        });

        for (const pEl of priceEls) {
          let p = pEl.parentElement;
          for (let depth = 0; depth < 8; depth++) {
            if (!p || p === root || p === document.body) break;
            if (p.offsetWidth > 600) { p = p.parentElement; continue; }
            const btns = [...p.querySelectorAll('button, [role="button"], a')].filter(b => isVisible(b));
            if (btns.length > 0) {
              const b = btns.find(btn => {
                const bTxt = (btn.textContent || '').trim().toLowerCase();
                return bTxt.includes('upgrade') || bTxt.includes('tingkatkan') || bTxt.includes('coba');
              }) || btns[0];
              mc(b);
              return { ok: true, text: b.textContent?.trim(), tag: b.tagName, method: 'price-parent-button' };
            }
            p = p.parentElement;
          }
        }

        return { ok: false };
      });

      if (evalResult && evalResult.ok) {
        clicked = true;
        log('OK', `Klik tombol Pro via DOM Card Target (${evalResult.text || evalResult.tag}, method: ${evalResult.method})`);
      }
    } catch (_) {}

    // 2. Playwright Native CDP Click pada tombol di dalam Pro Card
    if (!clicked) {
      try {
        const modalLocator = page.locator('div[role="dialog"], [class*="modal"], [class*="Modal"]').filter({ hasNotText: 'Kabar terbaru' }).first();
        // Target card yang memiliki teks "Pro" dan "14,500" / "14.500" dan TIDAK memiliki "Ultra" / "Teams"
        const cardLocator = modalLocator.locator('div, section, article')
          .filter({ hasText: /Pro/i })
          .filter({ hasText: /14[.,\s]?500|144[.,\s]?000|first month|bulan pertama/i })
          .filter({ hasNotText: /ultra|teams|tim|per kursi|per seat|current plan|paket saat ini/i })
          .first();

        const btnLocator = cardLocator.locator('button, [role="button"], a').filter({ hasText: /upgrade|tingkatkan/i }).first();
        if (await btnLocator.isVisible({ timeout: 2000 }).catch(() => false)) {
          await btnLocator.scrollIntoViewIfNeeded().catch(() => {});
          await btnLocator.click({ force: true, timeout: 3000 });
          clicked = true;
          log('OK', 'Klik tombol Pro via Playwright Native Locator di dalam Card Pro (Rp14.500)');
        }
      } catch (_) {}
    }

    // 3. Fallback teks tombol Upgrade pada Card Pro (hindari Ultra dan Teams)
    if (!clicked) {
      const proButtonSelectors = [
        'button:has-text("Upgrade")',
        'button:has-text("Tingkatkan")',
        '[role="button"]:has-text("Upgrade")',
        '[role="button"]:has-text("Tingkatkan")',
        'button:has-text("Coba gratis")',
        'button:has-text("Coba sekarang")'
      ];

      for (const sel of proButtonSelectors) {
        try {
          const loc = page.locator(sel);
          const count = await loc.count();
          for (let i = 0; i < count; i++) {
            const btn = loc.nth(i);
            const parentText = await btn.evaluate(el => el.closest('div, section, article')?.textContent || '').catch(() => '');
            const pLower = parentText.toLowerCase();
            if (pLower.includes('ultra') || pLower.includes('teams') || pLower.includes('tim') || pLower.includes('per kursi') || pLower.includes('per seat')) {
              continue; // lewati Ultra dan Teams
            }
            if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
              await btn.scrollIntoViewIfNeeded().catch(() => {});
              await btn.click({ force: true, timeout: 3000 });
              clicked = true;
              log('OK', `Klik tombol Pro via Native Locator: ${sel} (index ${i})`);
              break;
            }
          }
          if (clicked) break;
        } catch (_) {}
      }
    }

    return clicked;
  };

  // Klik 1st time
  await clickProUpgrade('Pertama');

  // Tunggu hingga 4 detik sembari mengecek capturedCashierUrl secara realtime
  for (let i = 0; i < 8; i++) {
    if (capturedCashierUrl) break;
    await wait(500);
  }

  // Periksa apakah langsung muncul Unusual Activity setelah klik pertama
  const unusualAfterFirst = await detectUnusualActivity(page);
  if (unusualAfterFirst) {
    log('FAIL', `❌ Terdeteksi Unusual Activity setelah klik Upgrade: ${unusualAfterFirst}`);
    const ssPath = await takeDiagnosticScreenshot(page, 'unusual_activity', email);
    const err = new Error(`UNUSUAL_ACTIVITY: ${unusualAfterFirst} (Transaksi dicekal oleh CapCut, rotasi IP diperlukan)`);
    err.screenshotPath = ssPath;
    throw err;
  }

  if (capturedCashierUrl) {
    log('CASHIER', `Cashier link PRO didapatkan (instan API): ${capturedCashierUrl}`);
    return capturedCashierUrl;
  }

  // Bersihkan kembali popup jika muncul sebelum klik kedua
  await dismissAnnouncementPopups(page);
  await wait(500);

  // Klik 2nd time HANYA jika belum tertangkap cashier dan tidak ada unusual activity
  await clickProUpgrade('Kedua');

  // Tunggu hingga 5 detik sembari mengecek capturedCashierUrl secara realtime
  for (let i = 0; i < 10; i++) {
    if (capturedCashierUrl) break;
    await wait(500);
  }

  // Periksa kembali Unusual Activity setelah klik kedua
  const unusualAfterSecond = await detectUnusualActivity(page);
  if (unusualAfterSecond) {
    log('FAIL', `❌ Terdeteksi Unusual Activity setelah klik Upgrade ke-2: ${unusualAfterSecond}`);
    const ssPath = await takeDiagnosticScreenshot(page, 'unusual_activity', email);
    const err = new Error(`UNUSUAL_ACTIVITY: ${unusualAfterSecond} (Transaksi dicekal oleh CapCut, rotasi IP diperlukan)`);
    err.screenshotPath = ssPath;
    throw err;
  }

  // Helper pencari link cashier
  const getCashierLink = async () => {
    if (capturedCashierUrl) return capturedCashierUrl;
    const mainUrl = page.url();
    if (isValidPipopayCashierUrl(mainUrl)) return mainUrl;
    for (const p of context.pages()) {
      const u = p.url();
      if (isValidPipopayCashierUrl(u)) return u;
    }
    const links = await page.evaluate(() => {
      const found = [];
      document.querySelectorAll('a[href], iframe[src]').forEach(el => {
        const u = el.href || el.src;
        if (u && /pipopay|agreement-cashier|pipoux_checkout|payin_checkout/i.test(u)) found.push(u);
      });
      return found;
    }).catch(() => []);
    for (const l of links) {
      if (isValidPipopayCashierUrl(l)) return l;
    }
    return null;
  };

  let cashierLink = await getCashierLink();
  if (!cashierLink) {
    for (let i = 0; i < 12; i++) {
      await wait(1000);
      cashierLink = await getCashierLink();
      if (cashierLink) break;

      const uCheck = await detectUnusualActivity(page);
      if (uCheck) {
        log('FAIL', `❌ Terdeteksi Unusual Activity saat menunggu cashier: ${uCheck}`);
        const ssPath = await takeDiagnosticScreenshot(page, 'unusual_activity', email);
        const err = new Error(`UNUSUAL_ACTIVITY: ${uCheck} (Transaksi dicekal oleh CapCut, rotasi IP diperlukan)`);
        err.screenshotPath = ssPath;
        throw err;
      }
    }
  }

  if (cashierLink) {
    log('CASHIER', `Cashier link PRO didapatkan: ${cashierLink}`);
    return cashierLink;
  }

  const finalUnusual = await detectUnusualActivity(page);
  if (finalUnusual) {
    const ssPath = await takeDiagnosticScreenshot(page, 'unusual_activity', email);
    const err = new Error(`UNUSUAL_ACTIVITY: ${finalUnusual} (Transaksi dicekal oleh CapCut, rotasi IP diperlukan)`);
    err.screenshotPath = ssPath;
    throw err;
  }

  const ssPath = await takeDiagnosticScreenshot(page, 'no_cashier_pro', email);
  const finalMsg = lastTradeError || 'Cashier link PRO tidak ditemukan setelah 2x klik Upgrade';
  const err = new Error(finalMsg);
  err.screenshotPath = ssPath;
  throw err;
}

// ─── BROWSER DETECTION & LAUNCHER ────────────────────────────────────────────
function getAvailableDriveRoots() {
  const drives = [];
  for (let code = 67; code <= 90; code++) { // C: to Z:
    const letter = String.fromCharCode(code);
    if (fs.existsSync(`${letter}:\\`)) drives.push(letter);
  }
  return drives.length > 0 ? drives : ['C'];
}

function getAllBrowserCandidates() {
  const localAppData    = process.env.LOCALAPPDATA || '';
  const appData         = process.env.APPDATA || '';
  const programFiles    = process.env['ProgramFiles'] || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const userProfile     = process.env.USERPROFILE || '';
  const driveRoots      = getAvailableDriveRoots();

  const chromeList = [
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_PATH,
    localAppData ? path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    userProfile ? path.join(userProfile, 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
  ];

  const braveList = [
    process.env.BRAVE_PATH,
    localAppData ? path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe') : null,
    userProfile ? path.join(userProfile, 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe') : null,
  ];

  const operaList = [
    process.env.OPERA_PATH,
    localAppData ? path.join(localAppData, 'Programs', 'Opera', 'launcher.exe') : null,
    localAppData ? path.join(localAppData, 'Programs', 'Opera', 'opera.exe') : null,
    localAppData ? path.join(localAppData, 'Programs', 'Opera GX', 'launcher.exe') : null,
    localAppData ? path.join(localAppData, 'Programs', 'Opera GX', 'opera.exe') : null,
    appData ? path.join(appData, 'Opera Software', 'Opera Stable', 'launcher.exe') : null,
    appData ? path.join(appData, 'Opera Software', 'Opera GX Stable', 'launcher.exe') : null,
    userProfile ? path.join(userProfile, 'AppData', 'Local', 'Programs', 'Opera', 'launcher.exe') : null,
    userProfile ? path.join(userProfile, 'AppData', 'Local', 'Programs', 'Opera', 'opera.exe') : null,
    userProfile ? path.join(userProfile, 'AppData', 'Local', 'Programs', 'Opera GX', 'launcher.exe') : null,
    userProfile ? path.join(userProfile, 'AppData', 'Local', 'Programs', 'Opera GX', 'opera.exe') : null,
  ];

  const firefoxList = [
    process.env.FIREFOX_PATH,
    localAppData ? path.join(localAppData, 'Mozilla Firefox', 'firefox.exe') : null,
    userProfile ? path.join(userProfile, 'AppData', 'Local', 'Mozilla Firefox', 'firefox.exe') : null,
  ];

  const edgeList = [
    process.env.EDGE_PATH,
    localAppData ? path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe') : null,
    userProfile ? path.join(userProfile, 'AppData', 'Local', 'Microsoft', 'Edge', 'Application', 'msedge.exe') : null,
  ];

  // Scan SEMUA drive yang ada di komputer (C:, D:, E:, F:, dll.)
  for (const d of driveRoots) {
    chromeList.push(
      `${d}:\\Program Files\\Google\\Chrome\\Application\\chrome.exe`,
      `${d}:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe`,
      `${d}:\\Google\\Chrome\\Application\\chrome.exe`
    );
    braveList.push(
      `${d}:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
      `${d}:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
      `${d}:\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`
    );
    operaList.push(
      `${d}:\\Program Files\\Opera\\launcher.exe`,
      `${d}:\\Program Files\\Opera\\opera.exe`,
      `${d}:\\Program Files\\Opera GX\\launcher.exe`,
      `${d}:\\Program Files\\Opera GX\\opera.exe`,
      `${d}:\\Program Files (x86)\\Opera\\launcher.exe`,
      `${d}:\\Program Files (x86)\\Opera\\opera.exe`,
      `${d}:\\Program Files (x86)\\Opera GX\\launcher.exe`,
      `${d}:\\Program Files (x86)\\Opera GX\\opera.exe`,
      `${d}:\\Opera\\launcher.exe`,
      `${d}:\\Opera GX\\launcher.exe`
    );
    firefoxList.push(
      `${d}:\\Program Files\\Mozilla Firefox\\firefox.exe`,
      `${d}:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe`,
      `${d}:\\Mozilla Firefox\\firefox.exe`
    );
    edgeList.push(
      `${d}:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${d}:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${d}:\\Microsoft\\Edge\\Application\\msedge.exe`
    );
  }

  return {
    chrome: chromeList.filter(Boolean),
    brave: braveList.filter(Boolean),
    opera: operaList.filter(Boolean),
    firefox: firefoxList.filter(Boolean),
    edge: edgeList.filter(Boolean),
  };
}

function scanInstalledBrowsers() {
  const candidates = getAllBrowserCandidates();
  const installed = {};
  for (const [name, paths] of Object.entries(candidates)) {
    const found = paths.find(p => fs.existsSync(p));
    if (found) {
      installed[name] = found;
    }
  }
  return installed;
}

function clearProfileLocks(profileDir) {
  if (!fs.existsSync(profileDir)) return;
  const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'];
  for (const f of lockFiles) {
    const p = path.join(profileDir, f);
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (_) {}
  }
}

async function launchBotBrowser(browserPref, options = {}) {
  const pref = (browserPref || 'auto').trim();
  const customPath = process.env.browser_path || process.env.BROWSER_PATH || '';
  const isPersistent = !!(options && options.isPersistent);
  const userDataDir = (options && options.userDataDir) || path.join(__dirname, 'browser_profile');
  const contextOptions = (options && options.contextOptions) || {};

  if (isPersistent) {
    if (!fs.existsSync(userDataDir)) {
      try { fs.mkdirSync(userDataDir, { recursive: true }); } catch (_) {}
    }
    clearProfileLocks(userDataDir);
  }

  const defaultChromiumArgs = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-http2',
    '--disable-popup-blocking',
    '--ignore-certificate-errors',
    '--allow-running-insecure-content',
  ];

  const proxyConfig = getProxyConfig();
  if (proxyConfig) {
    const isSocks = proxyConfig.server.startsWith('socks');
    log('PROXY', `Playwright proxy aktif: ${proxyConfig.server} [${isSocks ? 'SOCKS5' : 'HTTP'}]`);
    if (isSocks && proxyConfig.username) {
      log('WARN', 'Perhatian: Browser Chromium tidak mendukung username/password pada SOCKS5!');
      log('WARN', 'Solusi: Ubah proxy_mode=http di .env (dengan port HTTP) ATAU gunakan IP Whitelist tanpa user/pass.');
    }
  } else {
    // Pastikan Chromium tidak menggunakan proxy Pterodactyl/Docker secara tersembunyi
    defaultChromiumArgs.push('--no-proxy-server');
  }

  // Penentuan mode Headless vs Non-Headless:
  let isHeadless = true;
  if (process.env.HEADLESS !== undefined && process.env.HEADLESS !== '') {
    isHeadless = String(process.env.HEADLESS).toLowerCase() === 'true';
  } else if (process.platform === 'win32') {
    isHeadless = false; // Di Laptop default NON-HEADLESS (Layar browser terbuka)
  }

  if (process.platform === 'linux' && !process.env.DISPLAY) {
    isHeadless = true; // Wajib headless di Linux/Pterodactyl tanpa server display
  }

  log('BROWSER', `Mode browser: ${isHeadless ? 'HEADLESS (Background / Server Pterodactyl)' : 'NON-HEADLESS (Layar Browser Terbuka di Laptop)'}`);

  // ── LINUX / PTERODACTYL: Cari browser sistem, lalu fallback Playwright ──
  if (process.platform === 'linux') {
    log('BROWSER', `Terdeteksi Linux/Server. Mencari browser... [Mode: ${isPersistent ? 'BIASA (Persistent)' : 'INCOGNITO'}]`);

    // Daftar lengkap browser di Linux (Chrome, Chromium, Opera, Brave, Edge, Firefox)
    const linuxBrowserMap = {
      chrome: [
        process.env.CHROME_PATH,
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome-beta',
        '/usr/bin/google-chrome-unstable',
      ].filter(Boolean),
      chromium: [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
      ],
      opera: [
        '/usr/bin/opera',
        '/usr/lib/opera/opera',
        '/snap/bin/opera',
      ],
      brave: [
        '/usr/bin/brave-browser',
        '/usr/bin/brave-browser-stable',
        '/opt/brave.com/brave/brave-browser',
      ],
      edge: [
        '/usr/bin/microsoft-edge',
        '/usr/bin/microsoft-edge-stable',
        '/opt/microsoft/msedge/msedge',
      ],
      firefox: [
        '/usr/bin/firefox',
        '/snap/bin/firefox',
      ],
    };

    // Fungsi helper untuk launch browser di Linux
    async function launchLinux(browserKey, execPath) {
      if (browserKey === 'firefox') {
        log('BROWSER', `Menggunakan Firefox: ${execPath || 'Playwright Engine'} [${isPersistent ? 'Mode: BIASA / Persistent' : 'Mode: INCOGNITO'}]`);
        const fxOpts = { headless: isHeadless, args: ['-no-remote'] };
        if (proxyConfig) fxOpts.proxy = proxyConfig;
        if (execPath) fxOpts.executablePath = execPath;
        if (isPersistent) {
          const context = await firefox.launchPersistentContext(userDataDir, { ...fxOpts, ...contextOptions });
          return { browser: null, context, browserType: 'firefox', executablePath: execPath || null, isPersistent: true };
        }
        const browser = await firefox.launch(fxOpts);
        return { browser, context: null, browserType: 'firefox', executablePath: execPath || null, isPersistent: false };
      }

      log('BROWSER', `Menggunakan browser: ${execPath || 'Playwright Chromium'} [${isPersistent ? 'Mode: BIASA / Persistent' : 'Mode: INCOGNITO'}]`);
      const launchOpts = {
        headless: isHeadless,
        args: defaultChromiumArgs,
      };
      if (proxyConfig) launchOpts.proxy = proxyConfig;
      if (execPath) launchOpts.executablePath = execPath;

      if (isPersistent) {
        const combined = { ...launchOpts, ...contextOptions };
        const context = await chromium.launchPersistentContext(userDataDir, combined);
        return { browser: null, context, browserType: browserKey, executablePath: execPath || null, isPersistent: true };
      }

      const browser = await chromium.launch(launchOpts);
      return { browser, context: null, browserType: browserKey, executablePath: execPath || null, isPersistent: false };
    }

    // 0. Custom path override (dari BROWSER_PATH env)
    if (customPath && fs.existsSync(customPath)) {
      const isFx = customPath.toLowerCase().includes('firefox');
      log('BROWSER', `Menggunakan browser dari custom path: ${customPath}`);
      try {
        return await launchLinux(isFx ? 'firefox' : 'custom', customPath);
      } catch (err) {
        log('WARN', `Gagal meluncurkan custom path ${customPath}: ${err.message}`);
      }
    }

    // 1. Prioritaskan browser yang diminta via .env (browser=chrome/opera/brave/edge/firefox)
    let target = pref.toLowerCase();
    if (target === 'google' || target === 'google-chrome' || target === 'googlechrome') target = 'chrome';
    if (target === 'operagx' || target === 'opera-gx') target = 'opera';
    if (target === 'msedge' || target === 'microsoft-edge') target = 'edge';
    if (target === 'mozilla' || target === 'ff') target = 'firefox';

    if (target !== 'auto' && linuxBrowserMap[target]) {
      for (const sp of linuxBrowserMap[target]) {
        if (fs.existsSync(sp)) {
          log('BROWSER', `Menggunakan ${target.toUpperCase()} dari: ${sp}`);
          try {
            return await launchLinux(target, sp);
          } catch (err) {
            log('WARN', `Gagal meluncurkan ${sp}: ${err.message}`);
          }
        }
      }
      log('WARN', `Browser "${pref}" tidak ditemukan di Linux. Mencari browser lain...`);
    }

    // 2. Fallback: scan semua browser yang tersedia di sistem
    const fallbackOrder = ['chrome', 'chromium', 'brave', 'edge', 'opera', 'firefox'];
    for (const bKey of fallbackOrder) {
      if (bKey === target) continue; // sudah dicoba di atas
      const paths = linuxBrowserMap[bKey] || [];
      for (const sp of paths) {
        if (fs.existsSync(sp)) {
          log('BROWSER', `Fallback: Menggunakan ${bKey.toUpperCase()} dari: ${sp}`);
          try {
            return await launchLinux(bKey, sp);
          } catch (err) {
            log('WARN', `Gagal meluncurkan ${sp}: ${err.message}`);
          }
        }
      }
    }

    // 3. Terakhir: Playwright Chromium bawaan
    log('BROWSER', `Menggunakan Playwright Chromium bawaan... [${isPersistent ? 'Mode: BIASA / Persistent' : 'Mode: INCOGNITO'}]`);
    const launchOpts = {
      headless: isHeadless,
      args: defaultChromiumArgs,
    };
    if (proxyConfig) launchOpts.proxy = proxyConfig;
    if (isPersistent) {
      const combined = { ...launchOpts, ...contextOptions };
      const context = await chromium.launchPersistentContext(userDataDir, combined);
      return { browser: null, context, browserType: 'chromium', executablePath: null, isPersistent: true };
    }
    const browser = await chromium.launch(launchOpts);
    return { browser, context: null, browserType: 'chromium', executablePath: null, isPersistent: false };
  }

  // ── WINDOWS: Scan browser lokal seperti biasa ──
  const installed = scanInstalledBrowsers();

  let target = pref.toLowerCase();
  if (target === 'google' || target === 'google-chrome' || target === 'googlechrome') target = 'chrome';
  if (target === 'operagx' || target === 'opera-gx') target = 'opera';
  if (target === 'msedge' || target === 'microsoft-edge') target = 'edge';
  if (target === 'mozilla' || target === 'ff') target = 'firefox';

  async function attemptLaunch(browserKey, execPath) {
    if (browserKey === 'firefox') {
      log('BROWSER', `Meluncurkan Mozilla Firefox... [${isPersistent ? 'Mode: BIASA / Persistent' : 'Mode: INCOGNITO'}]`);
      const fxOpts = {
        headless: isHeadless,
        args: ['-no-remote'],
      };
      if (proxyConfig) fxOpts.proxy = proxyConfig;
      if (isPersistent) {
        const context = await firefox.launchPersistentContext(userDataDir, { ...fxOpts, ...contextOptions });
        return { browser: null, context, browserType: 'firefox', executablePath: execPath || null, isPersistent: true };
      }
      const browser = await firefox.launch(fxOpts);
      return { browser, context: null, browserType: 'firefox', executablePath: execPath || null, isPersistent: false };
    }

    log('BROWSER', `Meluncurkan browser: ${execPath || 'Playwright Chromium'} [${isPersistent ? 'Mode: BIASA / Persistent' : 'Mode: INCOGNITO'}]`);
    const launchOpts = {
      headless: isHeadless,
      args: defaultChromiumArgs,
    };
    if (proxyConfig) launchOpts.proxy = proxyConfig;
    if (execPath) {
      launchOpts.executablePath = execPath;
    }

    if (isPersistent) {
      const combined = { ...launchOpts, ...contextOptions };
      const context = await chromium.launchPersistentContext(userDataDir, combined);
      return { browser: null, context, browserType: browserKey, executablePath: execPath || null, isPersistent: true };
    }

    const browser = await chromium.launch(launchOpts);
    return { browser, context: null, browserType: browserKey, executablePath: execPath || null, isPersistent: false };
  }

  // 1. Direct path override
  if (customPath && fs.existsSync(customPath)) {
    const isFx = customPath.toLowerCase().includes('firefox');
    const bKey = isFx ? 'firefox' : 'custom';
    log('BROWSER', `Menggunakan browser dari path custom: ${customPath}`);
    return await attemptLaunch(bKey, customPath);
  }
  if (fs.existsSync(pref)) {
    const isFx = pref.toLowerCase().includes('firefox');
    const bKey = isFx ? 'firefox' : 'custom';
    log('BROWSER', `Menggunakan browser dari path .env: ${pref}`);
    return await attemptLaunch(bKey, pref);
  }

  // 2. Specific requested browser
  if (target !== 'auto' && target !== 'chromium') {
    const targetPath = installed[target];
    if (targetPath || target === 'firefox') {
      try {
        log('BROWSER', `Menggunakan ${target.toUpperCase()} dari: ${targetPath || 'Playwright Firefox Engine'}`);
        return await attemptLaunch(target, targetPath);
      } catch (err) {
        log('WARN', `Gagal meluncurkan ${target}: ${err.message}. Mencari fallback browser lain...`);
      }
    } else {
      log('WARN', `Browser "${pref}" tidak ditemukan di direktori standar sistem.`);
    }
  }

  // 3. Fallback scan order: chrome -> brave -> edge -> opera -> firefox
  const fallbackOrder = ['chrome', 'brave', 'edge', 'opera', 'firefox'];
  for (const bKey of fallbackOrder) {
    if (bKey === target) continue;
    const p = installed[bKey];
    if (p || bKey === 'firefox') {
      try {
        log('BROWSER', `Fallback berhasil: Menggunakan ${bKey.toUpperCase()} dari: ${p || 'Playwright Engine'}`);
        return await attemptLaunch(bKey, p);
      } catch (_) {}
    }
  }

  // 4. Default Playwright Chromium
  log('BROWSER', `Fallback ke Playwright Chromium bawaan... [${isPersistent ? 'Mode: BIASA / Persistent' : 'Mode: INCOGNITO'}]`);
  const launchOpts = {
    headless: isHeadless,
    args: defaultChromiumArgs,
  };
  if (proxyConfig) launchOpts.proxy = proxyConfig;
  if (isPersistent) {
    const combined = { ...launchOpts, ...contextOptions };
    const context = await chromium.launchPersistentContext(userDataDir, combined);
    return { browser: null, context, browserType: 'chromium', executablePath: null, isPersistent: true };
  }
  const browser = await chromium.launch(launchOpts);
  return { browser, context: null, browserType: 'chromium', executablePath: null, isPersistent: false };
}

// ─── BIND EMAIL TO CAPCUT ACCOUNT ────────────────────────────────────────────
async function bindEmailToAccount(page, targetEmail, tmailApiUrl, tmailApiKey) {
  log('BIND', `Memulai proses pengaitan email ke CapCut: ${targetEmail}...`);

  // Step 1: Navigasi ke Account Center
  try {
    await page.goto('https://www.capcut.com/account-center', {
      waitUntil: 'domcontentloaded',
      timeout: 35000,
    });
  } catch (navErr) {
    log('WARN', `Navigasi account-center lambat: ${navErr.message}. Lanjut memproses...`);
  }
  await wait(3000);

  // Step 2: Pastikan tab "Sign-in and management" (Security / Keamanan) terbuka
  log('FIND', 'Membuka tab Sign-in and management (Keamanan)...');
  let tabClicked = false;

  // Coba via JS evaluate langsung ke menu item ke-2 (Sign-in and management)
  tabClicked = await page.evaluate(() => {
    const items = document.querySelectorAll('.Item-U9PBQK, div[class*="Item-"], div[role="menuitem"]');
    if (items && items.length >= 2) {
      items[1].click();
      return true;
    }
    return false;
  }).catch(() => false);

  if (!tabClicked) {
    const tabLocators = [
      '.Item-U9PBQK:nth-child(2)',
      '.Menu-EfYAeN .Item-U9PBQK:nth-child(2)',
      '[key="securityPage"]',
      'div[role="menuitem"]:nth-child(2)',
      'div:has-text("Sign-in and management")',
      'span:has-text("Sign-in and management")',
      'text=/Sign-in and management|Security|Keamanan|Masuk dan pengelolaan/i'
    ];
    for (const sel of tabLocators) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click({ force: true });
          tabClicked = true;
          log('CLICK', `Klik tab security via: ${sel}`);
          break;
        }
      } catch (_) {}
    }
  } else {
    log('CLICK', 'Tab Sign-in and management berhasil diklik via evaluate');
  }

  await wait(2500);

  // Cek apakah akun ini sudah punya email terikat sebelumnya
  const alreadyBound = await page.evaluate(() => {
    const emailItem = document.querySelector('.bindItem-bKtjc4, div[class*="bindItem-"]');
    if (emailItem) {
      const text = emailItem.textContent || '';
      if (text.includes('@') && !text.includes('TikTok') && !text.includes('Google')) {
        return text.trim();
      }
    }
    return null;
  }).catch(() => false);

  if (alreadyBound) {
    log('INFO', `Akun ini sudah memiliki email terikat: ${alreadyBound}`);
    return alreadyBound;
  }

  // Step 3: Klik tombol [ Link ] di baris Email
  log('FIND', 'Mencari tombol Link di baris Email...');
  let linkClicked = false;

  // Coba via JS evaluate langsung ke tombol di baris email
  linkClicked = await page.evaluate(() => {
    const firstItem = document.querySelector('.bindItem-bKtjc4, div[class*="bindItem-"]');
    if (firstItem) {
      const btn = firstItem.querySelector('button');
      if (btn) {
        btn.click();
        return true;
      }
    }
    const btns = Array.from(document.querySelectorAll('button'));
    const linkBtn = btns.find(b => /^(Link|Tautkan|Hubungkan)$/i.test((b.textContent || '').trim()));
    if (linkBtn) {
      linkBtn.click();
      return true;
    }
    return false;
  }).catch(() => false);

  if (!linkClicked) {
    const linkSelectors = [
      '.bindWrapper-lYHm0j .bindItem-bKtjc4:first-child button',
      '.bindItem-bKtjc4 button:has-text("Link")',
      '.bindItem-bKtjc4 button:has-text("Tautkan")',
      'div:has-text("Email") ~ div button',
      'button:has-text("Link")',
      'button:has-text("Tautkan")'
    ];
    for (const sel of linkSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click({ force: true });
          linkClicked = true;
          log('CLICK', `Klik tombol Link via: ${sel}`);
          break;
        }
      } catch (_) {}
    }
  } else {
    log('CLICK', 'Tombol Link email berhasil diklik');
  }

  await wait(2500);

  // Step 4: Mengisi email di modal "Link email"
  log('INPUT', `Memasukkan email target: ${targetEmail}...`);
  const emailInputSelectors = [
    'div[role="dialog"] input[type="text"]',
    'div[role="dialog"] input[placeholder*="email" i]',
    'div[role="dialog"] input',
    '.emailFormModal-g69Wm7 input',
    '.arco-modal input',
    'input[placeholder*="Enter email" i]',
    'input[placeholder*="Masukkan email" i]',
    'input[placeholder*="email" i]'
  ];

  let emailFilled = false;
  for (const sel of emailInputSelectors) {
    try {
      const inp = page.locator(sel).first();
      if (await inp.isVisible({ timeout: 2000 })) {
        await inp.click({ force: true });
        await inp.fill(targetEmail);
        emailFilled = true;
        log('INPUT', `Email diisi via selector: ${sel}`);
        break;
      }
    } catch (_) {}
  }

  if (!emailFilled) {
    emailFilled = await page.evaluate((em) => {
      const modal = document.querySelector('div[role="dialog"], .emailFormModal-g69Wm7, .arco-modal');
      if (modal) {
        const input = modal.querySelector('input');
        if (input) {
          input.focus();
          input.value = em;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, targetEmail).catch(() => false);
  }

  if (!emailFilled) {
    throw new Error('Input email tidak ditemukan pada modal Link Email.');
  }

  await wait(500);

  // Step 5: Klik tombol Confirm untuk kirim kode verifikasi
  log('CLICK', 'Klik Confirm kirim kode verifikasi...');
  let confirmClicked = await page.evaluate(() => {
    const modal = document.querySelector('div[role="dialog"], .emailFormModal-g69Wm7, .arco-modal');
    if (modal) {
      const primaryBtn = modal.querySelector('button.lv-btn-primary, button[type="primary"], button.arco-btn-primary');
      if (primaryBtn) {
        primaryBtn.click();
        return true;
      }
      const btns = Array.from(modal.querySelectorAll('button'));
      const confirmBtn = btns.find(b => /^(Confirm|Konfirmasi|Kirim|Next|Lanjut)$/i.test((b.textContent || '').trim()));
      if (confirmBtn) {
        confirmBtn.click();
        return true;
      }
    }
    return false;
  }).catch(() => false);

  if (!confirmClicked) {
    const confirmBtn = page.locator(
      'div[role="dialog"] button.lv-btn-primary, div[role="dialog"] button:has-text("Confirm"), div[role="dialog"] button:has-text("Konfirmasi"), .emailFormModal-g69Wm7 button.lv-btn-primary'
    ).first();
    await confirmBtn.click({ force: true });
  }

  await wait(3000);

  // Cek apakah ada error sebenarnya (bukan notifikasi sukses terkirim)
  const errorMsg = await page.evaluate(() => {
    const errEl = document.querySelector('.lv-form-explain-error, .arco-form-item-message-help, .lv-message-error, .arco-message-error');
    if (errEl && errEl.offsetParent) {
      const text = errEl.textContent.trim();
      if (!/terkirim|sent|success|berhasil/i.test(text)) {
        return text;
      }
    }
    return null;
  }).catch(() => null);

  if (errorMsg) {
    throw new Error(`Gagal mengirim kode: ${errorMsg}`);
  }
  log('OK', 'Kode verifikasi berhasil dikirim oleh CapCut!');

  // Step 6: Ambil kode OTP dari TMail API
  log('OTP', `Mengambil kode OTP untuk ${targetEmail} dari TMail API...`);
  const otpCode = await fetchTMailOtp(targetEmail, tmailApiUrl, tmailApiKey, 75, log);
  if (!otpCode) {
    throw new Error(`Timeout: Tidak menerima kode OTP di inbox ${targetEmail} setelah 75 detik`);
  }
  log('OK', `Kode OTP berhasil didapatkan: ${otpCode}`);

  // Step 7: Masukkan kode OTP ke modal verifikasi
  log('INPUT', `Memasukkan kode OTP ${otpCode}...`);
  let otpFilled = false;
  const otpSelectors = [
    'div[role="dialog"] input[placeholder*="Verification" i]',
    'div[role="dialog"] input[placeholder*="code" i]',
    'div[role="dialog"] input[placeholder*="kode" i]',
    '.verifyCodeModal input',
    'div[role="dialog"] input'
  ];

  for (const sel of otpSelectors) {
    try {
      const inp = page.locator(sel).first();
      if (await inp.isVisible({ timeout: 2000 })) {
        await inp.click({ force: true });
        await inp.fill(otpCode);
        otpFilled = true;
        log('INPUT', `OTP diisi via: ${sel}`);
        break;
      }
    } catch (_) {}
  }

  if (!otpFilled) {
    otpFilled = await page.evaluate((code) => {
      const modal = document.querySelector('div[role="dialog"], .verifyCodeModal, .arco-modal');
      if (modal) {
        const input = modal.querySelector('input');
        if (input) {
          input.focus();
          input.value = code;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, otpCode).catch(() => false);
  }

  if (!otpFilled) {
    throw new Error('Input OTP tidak ditemukan pada modal verifikasi.');
  }

  await wait(500);

  // Step 8: Klik tombol Confirm untuk finalisasi binding
  log('CLICK', 'Klik Confirm untuk menyelesaikan pengaitan email...');
  let otpConfirmClicked = await page.evaluate(() => {
    const modal = document.querySelector('div[role="dialog"], .verifyCodeModal, .arco-modal');
    if (modal) {
      const primaryBtn = modal.querySelector('button.lv-btn-primary, button[type="primary"], button.arco-btn-primary');
      if (primaryBtn) {
        primaryBtn.click();
        return true;
      }
      const btns = Array.from(modal.querySelectorAll('button'));
      const confirmBtn = btns.find(b => /^(Confirm|Konfirmasi|Simpan)$/i.test((b.textContent || '').trim()));
      if (confirmBtn) {
        confirmBtn.click();
        return true;
      }
    }
    return false;
  }).catch(() => false);

  if (!otpConfirmClicked) {
    const confirmOtpBtn = page.locator(
      'div[role="dialog"] button.lv-btn-primary, div[role="dialog"] button:has-text("Confirm"), div[role="dialog"] button:has-text("Konfirmasi")'
    ).last();
    await confirmOtpBtn.click({ force: true });
  }

  await wait(4000);
  log('SUCCESS', `🎉 Email ${targetEmail} BERHASIL DIKAITKAN ke akun CapCut!`);
  return targetEmail;
}

// ─── RESET CAPCUT PASSWORD VIA FORGET PASSWORD ───────────────────────────────
async function resetCapCutPassword(page, targetEmail, newPassword = 'masuk123', tmailApiUrl = 'https://arapmium.web.id') {
  log('RESET', `Memulai proses reset password untuk: ${targetEmail}...`);

  // Step 1: Buka halaman forget-password
  try {
    await page.goto('https://www.capcut.com/forget-password', {
      waitUntil: 'domcontentloaded',
      timeout: 35000,
    });
  } catch (navErr) {
    log('WARN', `Navigasi forget-password lambat: ${navErr.message}. Lanjut memproses...`);
  }
  await wait(3000);

  const reqTimestamp = Date.now();

  // Step 2: Masukkan email target
  const emailInput = page.locator('input.lv_forget_pwd_panel-input, input[placeholder*="email" i], input[type="text"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await emailInput.click();
  await emailInput.fill(targetEmail);
  await wait(500);

  // Step 3: Klik tombol Konfirmasi untuk minta email reset
  log('CLICK', 'Klik tombol Konfirmasi untuk mengirimkan link reset password...');
  const confirmBtn = page.locator('button.lv_forget_pwd_panel-btn, button:has-text("Konfirmasi"), button:has-text("Confirm")').first();
  await confirmBtn.click();
  await wait(4000);

  // Cek apakah ada error penolakan dari CapCut
  const errorText = await page.evaluate(() => {
    const err = document.querySelector('.lv-form-explain-error, .arco-form-item-message-help, .lv-message-error');
    return err && err.offsetParent ? err.textContent.trim() : null;
  }).catch(() => null);

  if (errorText) {
    throw new Error(`CapCut menolak permintaan reset: ${errorText}`);
  }

  log('OK', `Permintaan reset terkirim dari CapCut. Menunggu email masuk di ArapMium...`);

  // Step 4: Polling email masuk di ArapMium dan ambil link reset password
  const resetLink = await fetchTMailResetLink(targetEmail, tmailApiUrl, reqTimestamp, 75, log);
  if (!resetLink) {
    throw new Error(`Timeout: Tidak menerima link reset password di inbox ${targetEmail} setelah 75 detik`);
  }

  log('LINK', `Link reset password berhasil didapatkan: ${resetLink}`);

  // Step 5: Buka link reset password di browser
  await page.goto(resetLink, {
    waitUntil: 'domcontentloaded',
    timeout: 35000,
  });
  await wait(3000);

  // Step 6: Tunggu input kata sandi baru muncul
  log('INPUT', 'Menunggu form kata sandi baru...');
  try {
    await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  } catch (_) {
    throw new Error(`Form kata sandi baru tidak muncul. Halaman saat ini: ${page.url()}`);
  }

  const pwdInputs = page.locator('input[type="password"]');
  const count = await pwdInputs.count();
  if (count < 2) {
    throw new Error(`Ditemukan ${count} input password, seharusnya 2`);
  }

  // Step 7: Isi kedua input password dengan newPassword
  log('INPUT', `Mengisi kata sandi baru: ${newPassword}...`);
  await pwdInputs.nth(0).fill(newPassword);
  await wait(500);
  await pwdInputs.nth(1).fill(newPassword);
  await wait(500);

  // Step 8: Klik tombol "Konfirmasi kata sandi"
  log('CLICK', 'Klik tombol Konfirmasi kata sandi...');
  const submitPwdBtn = page.locator('button:has-text("Konfirmasi kata sandi"), button.lv_forget_pwd_panel-btn-reset, button.lv-btn-primary').first();
  await submitPwdBtn.click();
  await wait(6000);

  // Step 9: Verifikasi keberhasilan
  const currentUrl = page.url();
  log('SUCCESS', `🎉 Kata sandi berhasil diatur untuk ${targetEmail} -> ${newPassword} (URL: ${currentUrl})`);
  return { success: true, email: targetEmail, newPassword };
}

// ─── DAFTAR AKUN CAPCUT BARU (EMAIL ARAPMIUM + PASSWORD) ──────────────────────
async function registerCapCutAccount(page, targetEmail, password, tmailApiUrl = 'https://arapmium.web.id', tmailApiKey = 'eduedu') {
  log('DAFTAR', `Membuka halaman pendaftaran CapCut untuk: ${targetEmail}...`);

  // Step 1: Navigasi ke halaman login / register CapCut
  let navOk = false;
  const loginUrls = [
    'https://www.capcut.com/account-center/login',
    'https://www.capcut.com/login',
    'https://www.capcut.com/account-center'
  ];

  for (const url of loginUrls) {
    try {
      log('NAVIGATE', `Buka URL: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await wait(2000);
      navOk = true;
      break;
    } catch (e) {
      log('WARN', `Gagal membuka ${url}: ${e.message}`);
    }
  }

  if (!navOk) {
    throw new Error('Gagal membuka halaman login/registrasi CapCut setelah beberapa percobaan');
  }

  // Step 2: Pastikan modal login / sign-in terbuka
  let isModalOpen = false;
  for (const sel of [
    '.lv_new_third_part_sign_in_expand-button',
    'span:has-text("Continue with email")',
    'span:has-text("Lanjutkan dengan email")',
    'div.lv_new_third_part_sign_in_expand-wrapper',
    '#signinDiv'
  ]) {
    try {
      if (await page.locator(sel).first().isVisible({ timeout: 1500 })) {
        isModalOpen = true;
        break;
      }
    } catch (_) {}
  }

  if (!isModalOpen) {
    log('CLICK', 'Modal belum muncul, mencari tombol login landing...');
    const landingSels = [
      'button.lv-btn-primary:has-text("Masuk")',
      'button:has-text("Masuk")',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'button:has-text("Gabung")',
      'a:has-text("Masuk")',
      'a:has-text("Sign in")',
      'a:has-text("Log in")',
      '.login-btn',
      '#login-btn'
    ];
    for (const sel of landingSels) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 1500 })) {
          log('CLICK', `Klik tombol landing: ${sel}`);
          await el.click();
          await wait(2000);
          break;
        }
      } catch (_) {}
    }
  }

  // Tunggu modal muncul
  try {
    await page.locator(
      '.lv_new_third_part_sign_in_expand-button, span:has-text("Continue with email"), span:has-text("Lanjutkan dengan email")'
    ).first().waitFor({ state: 'visible', timeout: 15000 });
    log('OK', 'Modal login CapCut berhasil terbuka');
  } catch (err) {
    log('WARN', 'Modal belum terdeteksi secara otomatis, mencoba lanjut mencari opsi email...');
  }

  // Step 3: Klik opsi "Continue with email" / "Lanjutkan dengan email"
  log('CLICK', 'Mencari dan mengklik "Continue with email"...');
  let clickedEmail = false;

  const emailBtnSelectors = [
    'div.lv_new_third_part_sign_in_expand-button:has-text("email")',
    'div.lv_new_third_part_sign_in_expand-button:has-text("Email")',
    'span:has-text("Continue with email")',
    'span:has-text("Continue with Email")',
    'span:has-text("Lanjutkan dengan email")',
    'span:has-text("Lanjutkan dengan Email")',
    '.lv_new_third_part_sign_in_expand-button'
  ];

  for (const sel of emailBtnSelectors) {
    try {
      const loc = page.locator(sel);
      const count = await loc.count();
      for (let i = 0; i < count; i++) {
        const item = loc.nth(i);
        const txt = (await item.innerText().catch(() => '')).toLowerCase();
        if (txt.includes('email')) {
          log('CLICK', `Klik tombol opsi email: ${sel} [${txt}]`);
          await item.scrollIntoViewIfNeeded();
          await item.click();
          clickedEmail = true;
          break;
        }
      }
      if (clickedEmail) break;
    } catch (_) {}
  }

  if (!clickedEmail) {
    log('WARN', 'Coba klik opsi email via JS fallback...');
    clickedEmail = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.lv_new_third_part_sign_in_expand-button, button, div, span'));
      const emailBtn = btns.find(b => {
        const text = (b.innerText || b.textContent || '').trim().toLowerCase();
        return text.includes('continue with email') || text.includes('lanjutkan dengan email') || (text.includes('email') && b.classList.contains('lv_new_third_part_sign_in_expand-button'));
      });
      if (emailBtn) {
        emailBtn.click();
        return true;
      }
      return false;
    });
  }

  if (!clickedEmail) {
    log('WARN', 'Tombol email spesifik tidak ditemukan, mencoba klik tombol ke-3 di modal (Continue with email)...');
    try {
      const allThird = page.locator('.lv_new_third_part_sign_in_expand-button');
      const cnt = await allThird.count();
      if (cnt >= 3) {
        await allThird.nth(2).click();
        clickedEmail = true;
      }
    } catch (_) {}
  }

  await wait(2000);

  // Step 4: Cek apakah form sekarang dalam mode "Sign up" (Create an account) atau "Sign in"
  log('FIND', 'Memeriksa apakah form berada di mode "Sign up" / "Create an account"...');
  let isSignUpForm = false;
  try {
    const titleText = await page.evaluate(() => {
      const h2 = document.querySelector('.lv_new_sign_in_panel_wide-title, h2, h1');
      return h2 ? h2.innerText : '';
    });
    if (/create an account|buat akun|sign up|daftar/i.test(titleText)) {
      isSignUpForm = true;
      log('OK', `Form sudah berada pada mode pendaftaran: "${titleText}"`);
    }
  } catch (_) {}

  if (!isSignUpForm) {
    log('CLICK', 'Mencari tombol switch "Sign up" / "Daftar"...');
    const signUpSwitchSels = [
      'span.new-forget-pwd-btn:has-text("Sign up")',
      'span.new-forget-pwd-btn:has-text("Daftar")',
      'span.lv_new_sign_in_panel_wide-footer-switch-button:has-text("Sign up")',
      'span.lv_new_sign_in_panel_wide-footer-switch-button:has-text("Daftar")',
      'span:has-text("Sign up")',
      'span:has-text("Daftar")',
      'a:has-text("Sign up")',
      'a:has-text("Daftar")',
      'button:has-text("Sign up")',
      'button:has-text("Daftar")'
    ];

    for (const sel of signUpSwitchSels) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 1500 })) {
          log('CLICK', `Klik switch Sign up: ${sel}`);
          await el.click();
          await wait(1500);
          isSignUpForm = true;
          break;
        }
      } catch (_) {}
    }

    if (!isSignUpForm) {
      await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('span, a, button, div')).find(e => {
          const t = (e.innerText || '').trim();
          return t === 'Sign up' || t === 'Daftar';
        });
        if (el) el.click();
      });
      await wait(1500);
    }
  }

  // Step 5: Input Email & Password
  log('INPUT', `Mengisi form registrasi: ${targetEmail} / password...`);

  await page.locator('input[type="email"], input[name="username"], .lv_new_sign_in_panel_wide-form-email input')
    .first()
    .waitFor({ state: 'visible', timeout: 12000 });

  const emailInput = page.locator('input[name="username"], input[type="email"], .lv_new_sign_in_panel_wide-form-email input').first();
  await emailInput.click();
  await emailInput.fill('');
  await emailInput.fill(targetEmail);
  await wait(300);

  const passInput = page.locator('input[name="password"], input[type="password"], .lv_new_sign_in_panel_wide-form-password input').first();
  await passInput.click();
  await passInput.fill('');
  await passInput.fill(password);
  await wait(500);

  log('OK', 'Email dan password selesai diisi');

  // Step 6: Klik tombol "Continue" / "Lanjutkan"
  log('CLICK', 'Klik tombol Continue / Lanjutkan pendaftaran...');
  const continueBtnSels = [
    'button.lv_new_sign_in_panel_wide-sign-in-button',
    'button.lv_new_sign_in_panel_wide-primary-button',
    'button:has-text("Continue")',
    'button:has-text("Lanjutkan")',
    '.lv_new_sign_in_panel_wide-sign-in-button',
    'button[type="primary"]'
  ];

  let continueClicked = false;
  for (const sel of continueBtnSels) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        continueClicked = true;
        log('OK', `Tombol submit diklik: ${sel}`);
        break;
      }
    } catch (_) {}
  }

  if (!continueClicked) {
    await page.evaluate(() => {
      const btn = document.querySelector('.lv_new_sign_in_panel_wide-sign-in-button') ||
                  Array.from(document.querySelectorAll('button')).find(b => /continue|lanjutkan/i.test(b.innerText || ''));
      if (btn) btn.click();
    });
  }

  await wait(2000);

  // Periksa apakah ada pesan error instan
  const instantErr = await page.evaluate(() => {
    const warn = document.querySelector('.lv_new_sign_in_panel_wide-warn, .lv_new_sign_in_panel_wide-code-warn');
    return (warn && warn.innerText) ? warn.innerText.trim() : null;
  }).catch(() => null);

  if (instantErr) {
    log('WARN', `Pesan dari CapCut: "${instantErr}"`);
    if (/already signed up|sudah terdaftar|already registered/i.test(instantErr)) {
      throw new Error(`Email ${targetEmail} sudah pernah terdaftar di CapCut: ${instantErr}`);
    }
  }

  // Step 7: Tunggu form OTP kode verifikasi muncul
  log('WAIT', 'Menunggu layar input kode OTP verifikasi 6 digit...');
  try {
    await page.locator(
      '.verification_code_input-wrapper, .lv_new_sign_in_panel_wide-code-input-wrapper, .lv_new_sign_in_panel_wide-code-detail, h2:has-text("Confirm your email"), h2:has-text("Konfirmasi email Anda")'
    ).first().waitFor({ state: 'visible', timeout: 15000 });
    log('OK', 'Layar kode OTP verifikasi berhasil terbuka!');
  } catch (err) {
    log('WARN', 'Container OTP belum terdeteksi spesifik, tetap melanjutkan polling OTP inbox...');
  }

  // Step 8: Polling kode OTP dari inbox ArapMium Webmail
  log('OTP', `Mengambil kode verifikasi dari ArapMium Webmail untuk ${targetEmail}...`);
  const otpCode = await fetchTMailOtp(targetEmail, tmailApiUrl, tmailApiKey, 75, log);
  if (!otpCode) {
    throw new Error(`Timeout: Tidak menerima kode verifikasi di inbox ${targetEmail} setelah 75 detik`);
  }
  log('OK', `✓ Kode OTP verifikasi diterima: ${otpCode}`);

  // Step 9: Masukkan kode OTP ke form
  log('INPUT', `Memasukkan kode OTP [${otpCode}] ke CapCut...`);
  await wait(800);

  let otpEntered = false;

  try {
    const codeWrapper = page.locator('.verification_code_input-wrapper, .lv_new_sign_in_panel_wide-code-input-wrapper').first();
    if (await codeWrapper.isVisible({ timeout: 2000 })) {
      await codeWrapper.click();
      await wait(300);
      await page.keyboard.type(otpCode, { delay: 150 });
      otpEntered = true;
      log('OK', 'Kode OTP diketik via keyboard focus wrapper');
    }
  } catch (_) {}

  if (!otpEntered) {
    try {
      const codeInputs = page.locator('.verification_code_input-wrapper input, .lv_new_sign_in_panel_wide-code-input-wrapper input, input[maxlength="6"]');
      if (await codeInputs.count() > 0) {
        await codeInputs.first().fill(otpCode);
        otpEntered = true;
        log('OK', 'Kode OTP diisi ke input element');
      }
    } catch (_) {}
  }

  if (!otpEntered) {
    try {
      const boxes = page.locator('.verification_code_input-number-wrapper input, input[maxlength="1"]');
      const boxCount = await boxes.count();
      if (boxCount === 6) {
        for (let b = 0; b < 6; b++) {
          await boxes.nth(b).fill(otpCode[b]);
          await wait(100);
        }
        otpEntered = true;
        log('OK', 'Kode OTP diisi ke 6 kotak input terpisah');
      }
    } catch (_) {}
  }

  if (!otpEntered) {
    await page.keyboard.type(otpCode, { delay: 150 });
  }

  log('OK', 'Kode OTP selesai dimasukkan, menunggu verifikasi & registrasi login oleh CapCut...');
  await wait(3000);

  // Step 10: Periksa apakah form Tanggal Lahir (Birthday) muncul
  try {
    await fillBirthday(page);
  } catch (bErr) {
    log('INFO', 'Form Birthday tidak muncul atau sudah terlewati.');
  }

  // Step 11: Tunggu hingga selesai login dan masuk ke My Edit / Account Center
  log('WAIT', 'Menunggu pendaftaran & sesi login aktif...');
  let loginDone = false;
  for (let s = 0; s < 25; s++) {
    const curUrl = page.url().toLowerCase();
    if (curUrl.includes('/my-edit') || (curUrl.includes('/account-center') && !curUrl.includes('/login'))) {
      loginDone = true;
      break;
    }
    try {
      const isAvatar = await page.locator('.lv_header-user, .user-avatar, img[class*="avatar"]').first().isVisible({ timeout: 500 });
      if (isAvatar) {
        loginDone = true;
        break;
      }
    } catch (_) {}
    await wait(1000);
  }

  if (!loginDone) {
    log('NAVIGATE', 'Navigasi langsung ke https://www.capcut.com/my-edit...');
    try {
      await page.goto('https://www.capcut.com/my-edit', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await wait(2000);
    } catch (_) {}
  }

  try {
    await cleanupPopups(page);
  } catch (_) {}

  log('SUCCESS', `🎉 AKUN BERHASIL DIDAFTARKAN & AKTIF: ${targetEmail}`);
  return { success: true, email: targetEmail, password };
}

// ─── LOGIN CAPCUT DENGAN EMAIL + PASSWORD ─────────────────────────────────────
async function loginCapCutWithEmail(page, email, password, tmailApiUrl = 'https://arapmium.web.id', tmailApiKey = 'eduedu') {
  log('LOGIN', `Melakukan login CapCut via email: ${email}...`);

  let navOk = false;
  const loginUrls = [
    'https://www.capcut.com/account-center/login',
    'https://www.capcut.com/login',
    'https://www.capcut.com/account-center'
  ];

  for (const url of loginUrls) {
    try {
      log('NAVIGATE', `Buka URL login: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await wait(2000);
      navOk = true;
      break;
    } catch (e) {
      log('WARN', `Gagal membuka ${url}: ${e.message}`);
    }
  }

  if (!navOk) {
    throw new Error('Gagal membuka halaman login CapCut');
  }

  // Cek apakah sudah login (misal cookies persist)
  const isAlreadyLoggedIn = await page.evaluate(() => {
    return !!document.querySelector('.lv_header-user, .user-avatar, img[class*="avatar"]');
  }).catch(() => false);

  if (isAlreadyLoggedIn) {
    log('OK', `Sesi sudah login untuk akun: ${email}`);
    return { success: true, email };
  }

  // Pastikan modal terbuka
  let isModalOpen = false;
  for (const sel of [
    '.lv_new_third_part_sign_in_expand-button',
    'span:has-text("Continue with email")',
    'span:has-text("Lanjutkan dengan email")',
    '#signinDiv'
  ]) {
    try {
      if (await page.locator(sel).first().isVisible({ timeout: 1500 })) {
        isModalOpen = true;
        break;
      }
    } catch (_) {}
  }

  if (!isModalOpen) {
    log('CLICK', 'Mencari tombol login landing...');
    const landingSels = [
      'button.lv-btn-primary:has-text("Masuk")',
      'button:has-text("Masuk")',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'a:has-text("Masuk")',
      'a:has-text("Sign in")',
      '.login-btn'
    ];
    for (const sel of landingSels) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 1500 })) {
          await el.click();
          await wait(2000);
          break;
        }
      } catch (_) {}
    }
  }

  // Klik Continue with email
  log('CLICK', 'Mencari dan mengklik "Continue with email"...');
  let clickedEmail = false;
  const emailBtnSelectors = [
    'div.lv_new_third_part_sign_in_expand-button:has-text("email")',
    'div.lv_new_third_part_sign_in_expand-button:has-text("Email")',
    'span:has-text("Continue with email")',
    'span:has-text("Continue with Email")',
    'span:has-text("Lanjutkan dengan email")',
    'span:has-text("Lanjutkan dengan Email")'
  ];

  for (const sel of emailBtnSelectors) {
    try {
      const loc = page.locator(sel);
      const count = await loc.count();
      for (let i = 0; i < count; i++) {
        const item = loc.nth(i);
        const txt = (await item.innerText().catch(() => '')).toLowerCase();
        if (txt.includes('email')) {
          log('CLICK', `Klik tombol opsi email: ${sel}`);
          await item.scrollIntoViewIfNeeded();
          await item.click();
          clickedEmail = true;
          break;
        }
      }
      if (clickedEmail) break;
    } catch (_) {}
  }

  if (!clickedEmail) {
    clickedEmail = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.lv_new_third_part_sign_in_expand-button, button, div, span'));
      const emailBtn = btns.find(b => {
        const text = (b.innerText || b.textContent || '').trim().toLowerCase();
        return text.includes('continue with email') || text.includes('lanjutkan dengan email');
      });
      if (emailBtn) {
        emailBtn.click();
        return true;
      }
      return false;
    });
  }

  await wait(2000);

  // Pastikan form di mode "Sign in" / "Masuk" (bukan "Sign up")
  try {
    const titleText = await page.evaluate(() => {
      const h2 = document.querySelector('.lv_new_sign_in_panel_wide-title, h2, h1');
      return h2 ? h2.innerText : '';
    });
    if (/create an account|buat akun|sign up|daftar/i.test(titleText)) {
      log('CLICK', 'Form berada di mode Sign up, beralih ke mode Sign in / Masuk...');
      const switchSels = [
        'span.new-forget-pwd-btn:has-text("Sign in")',
        'span.new-forget-pwd-btn:has-text("Masuk")',
        'span.lv_new_sign_in_panel_wide-footer-switch-button:has-text("Sign in")',
        'span.lv_new_sign_in_panel_wide-footer-switch-button:has-text("Masuk")',
        'span:has-text("Sign in")',
        'span:has-text("Masuk")'
      ];
      for (const sel of switchSels) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 1500 })) {
            await el.click();
            await wait(1500);
            break;
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  // Input email & password
  log('INPUT', `Mengisi form login: ${email}...`);
  await page.locator('input[type="email"], input[name="username"], .lv_new_sign_in_panel_wide-form-email input')
    .first()
    .waitFor({ state: 'visible', timeout: 12000 });

  const emailInput = page.locator('input[name="username"], input[type="email"], .lv_new_sign_in_panel_wide-form-email input').first();
  await emailInput.click();
  await emailInput.fill('');
  await emailInput.fill(email);
  await wait(300);

  const passInput = page.locator('input[name="password"], input[type="password"], .lv_new_sign_in_panel_wide-form-password input').first();
  await passInput.click();
  await passInput.fill('');
  await passInput.fill(password);
  await wait(500);

  // Klik tombol submit login
  log('CLICK', 'Klik tombol Sign in / Masuk...');
  const continueBtnSels = [
    'button.lv_new_sign_in_panel_wide-sign-in-button',
    'button.lv_new_sign_in_panel_wide-primary-button',
    'button:has-text("Sign in")',
    'button:has-text("Masuk")',
    'button:has-text("Log in")',
    'button:has-text("Continue")',
    'button:has-text("Lanjutkan")'
  ];

  let continueClicked = false;
  for (const sel of continueBtnSels) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        continueClicked = true;
        break;
      }
    } catch (_) {}
  }

  if (!continueClicked) {
    await page.evaluate(() => {
      const btn = document.querySelector('.lv_new_sign_in_panel_wide-sign-in-button') ||
                  Array.from(document.querySelectorAll('button')).find(b => /sign in|masuk|log in|continue/i.test(b.innerText || ''));
      if (btn) btn.click();
    });
  }

  await wait(2500);

  // Periksa apakah ada pesan error instan (misal password salah)
  const instantErr = await page.evaluate(() => {
    const warn = document.querySelector('.lv_new_sign_in_panel_wide-warn, .lv_new_sign_in_panel_wide-code-warn');
    return (warn && warn.innerText) ? warn.innerText.trim() : null;
  }).catch(() => null);

  if (instantErr) {
    log('WARN', `Pesan dari CapCut: "${instantErr}"`);
    if (/password|sandi|incorrect|user not exist|tidak ditemukan/i.test(instantErr)) {
      throw new Error(`Login gagal untuk ${email}: ${instantErr}`);
    }
  }

  // Periksa apakah memerlukan verifikasi kode OTP (misal login dari IP baru)
  let otpNeeded = false;
  try {
    otpNeeded = await page.locator(
      '.verification_code_input-wrapper, .lv_new_sign_in_panel_wide-code-input-wrapper, h2:has-text("Confirm your email"), h2:has-text("Verify")'
    ).first().isVisible({ timeout: 2000 });
  } catch (_) {}

  if (otpNeeded && (email.includes('@arapmium.web.id') || email.includes(TMAIL_DOMAIN))) {
    log('OTP', `Deteksi verifikasi OTP login untuk ${email}. Mengambil dari ArapMium...`);
    const otpCode = await fetchTMailOtp(email, tmailApiUrl, tmailApiKey, 60, log);
    if (otpCode) {
      log('INPUT', `Memasukkan OTP login [${otpCode}]...`);
      try {
        const codeWrapper = page.locator('.verification_code_input-wrapper, .lv_new_sign_in_panel_wide-code-input-wrapper').first();
        if (await codeWrapper.isVisible({ timeout: 1500 })) {
          await codeWrapper.click();
          await page.keyboard.type(otpCode, { delay: 150 });
        }
      } catch (_) {
        await page.keyboard.type(otpCode, { delay: 150 });
      }
      await wait(3000);
    }
  }

  // Tunggu login selesai
  log('WAIT', 'Menunggu sesi login aktif...');
  let loginDone = false;
  for (let s = 0; s < 20; s++) {
    const curUrl = page.url().toLowerCase();
    if (curUrl.includes('/my-edit') || (curUrl.includes('/account-center') && !curUrl.includes('/login'))) {
      loginDone = true;
      break;
    }
    try {
      const isAvatar = await page.locator('.lv_header-user, .user-avatar, img[class*="avatar"]').first().isVisible({ timeout: 500 });
      if (isAvatar) {
        loginDone = true;
        break;
      }
    } catch (_) {}
    await wait(1000);
  }

  try {
    await cleanupPopups(page);
  } catch (_) {}

  log('OK', `✓ Login CapCut berhasil: ${email}`);
  return { success: true, email };
}

// ─── JOIN TIM CAPCUT VIA LINK UNDANGAN ────────────────────────────────────────
async function joinTeamWithLink(page, joinLink, accountEmail) {
  if (!joinLink || typeof joinLink !== 'string' || !joinLink.trim()) {
    throw new Error('Link join tim CapCut (JOIN_LINK) belum ditentukan.');
  }

  const cleanLink = joinLink.trim();
  log('JOIN', `Navigasi ke link join tim CapCut: ${cleanLink}...`);

  try {
    await page.goto(cleanLink, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (gotoErr) {
    log('WARN', `Navigasi goto timeout / err: ${gotoErr.message}, tetap memeriksa halaman...`);
  }
  await wait(3000);

  // Bersihkan popups / survey / banner jika ada
  try {
    await cleanupPopups(page);
  } catch (_) {}

  // Cek URL saat ini
  const curUrl = page.url();
  log('JOIN', `Halaman saat ini: ${curUrl}`);

  // Cek apakah ada error panel di halaman join (Link kedaluwarsa / ruang penuh / link invalid)
  const errPanel = page.locator('.JoinErrPanelWrapper-KPjTjx, .JoinErrPanelTitle-GWfMxQ, [class*="JoinErrPanel"]');
  if (await errPanel.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    const errTitle = await page.locator('.JoinErrPanelTitle-GWfMxQ, [class*="JoinErrPanelTitle"]').first().innerText().catch(() => '');
    const errDesc = await page.locator('.JoinErrPanelDesc-mEYfO7, [class*="JoinErrPanelDesc"]').first().innerText().catch(() => '');
    throw new Error(`Gagal join tim (Error dari CapCut): ${errTitle || 'Link Tidak Valid / Kedaluwarsa'} ${errDesc ? `- ${errDesc}` : ''}`);
  }

  // Deteksi card "Use this account" jika ada
  try {
    const userCard = page.locator('.JoinPanelUser-rhbXL3, .JoinPanel-Y4S5YH, [class*="JoinPanelUser"]');
    if (await userCard.first().isVisible({ timeout: 3000 })) {
      const userText = await userCard.first().innerText().catch(() => '');
      log('OK', `Akun terdeteksi di form Join space: ${userText.replace(/\n+/g, ' ')}`);
    }
  } catch (_) {}

  // Tunggu dan cari tombol Submit / Join
  log('CLICK', 'Mencari tombol "Submit" / "Join" ruang tim...');
  const submitSels = [
    'button.JoinPanelBtn-Ffvlan',
    '.JoinPanelBtn-Ffvlan',
    'button:has-text("Submit")',
    'button:has-text("Join")',
    'button:has-text("Gabung")',
    'button:has-text("Kirim")',
    'button[type="primary"]:has-text("Submit")',
    'button[type="primary"]:has-text("Join")',
    '[class*="JoinPanelBtn"]'
  ];

  let submitClicked = false;
  for (const sel of submitSels) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2500 })) {
        log('CLICK', `Mengklik tombol join tim: ${sel}`);
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        submitClicked = true;
        break;
      }
    } catch (_) {}
  }

  if (!submitClicked) {
    log('WARN', 'Mencoba klik tombol Submit via evaluate JS...');
    submitClicked = await page.evaluate(() => {
      const btn = document.querySelector('.JoinPanelBtn-Ffvlan, [class*="JoinPanelBtn"]') ||
                  Array.from(document.querySelectorAll('button')).find(b => {
                    const t = (b.innerText || b.textContent || '').trim().toLowerCase();
                    return t === 'submit' || t === 'join' || t === 'gabung' || t === 'kirim';
                  });
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
  }

  if (!submitClicked) {
    // Jika tidak ditemukan tombol Submit, cek apakah sudah masuk ke workspace tim
    if (curUrl.includes('/my-edit') || curUrl.includes('/space/') || curUrl.includes('workspace')) {
      log('OK', 'Akun sudah langsung berada di workspace tim.');
      return { success: true, message: 'Sudah bergabung di ruang tim' };
    }
    throw new Error('Tombol Submit / Join tim tidak ditemukan di halaman undangan.');
  }

  log('WAIT', 'Tombol Submit diklik. Menunggu konfirmasi join dari CapCut...');
  await wait(4000);

  // Periksa apakah muncul error panel setelah klik submit
  if (await errPanel.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    const errTitle = await page.locator('.JoinErrPanelTitle-GWfMxQ, [class*="JoinErrPanelTitle"]').first().innerText().catch(() => '');
    const errDesc = await page.locator('.JoinErrPanelDesc-mEYfO7, [class*="JoinErrPanelDesc"]').first().innerText().catch(() => '');
    throw new Error(`Gagal setelah submit join tim: ${errTitle || 'Gagal'} ${errDesc ? `- ${errDesc}` : ''}`);
  }

  // Cek apakah muncul Result Panel (.JoinResultPanelWrapper-G_HLEP)
  let statusResult = 'Berhasil join ruang tim';
  try {
    const resultTitleEl = page.locator('.JoinResultPanelTitle-hXA1v9, .JoinResultPanelContext-yvPUPH, [class*="JoinResultPanelTitle"]').first();
    if (await resultTitleEl.isVisible({ timeout: 3000 })) {
      const resText = await resultTitleEl.innerText().catch(() => '');
      if (resText) {
        statusResult = resText.replace(/\n+/g, ' ').trim();
        log('OK', `Status hasil join: "${statusResult}"`);
      }
    }
  } catch (_) {}

  // Ambil screenshot bukti join berhasil
  let ssPath = '';
  try {
    ssPath = await takeDiagnosticScreenshot(page, 'join_sukses', accountEmail);
  } catch (_) {}

  log('SUCCESS', `🎉 BERHASIL JOIN TIM: ${accountEmail} (${statusResult})`);
  return { success: true, message: statusResult, screenshot: ssPath };
}

// ─── PROCESS ONE ACCOUNT ──────────────────────────────────────────────────────
async function processAccount(email, password, rawLine) {
  console.log('\n------------------------------------------------------------');
  log('AKUN', `Proses akun: ${email}`);

  let browser, context, page;
  let profileDir = null;
  try {
    const BROWSER_MODE = (process.env.browser_mode || 'incognito').trim().toLowerCase();
    const isBiasa = BROWSER_MODE === 'biasa' || BROWSER_MODE === 'normal';

    if (isBiasa) {
      // Buat profile browser baru yang bersih khusus untuk akun ini (bukan profile lama yang menumpuk)
      const safeId = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_');
      profileDir = path.join(__dirname, 'browser_profiles', `prof_${safeId}_${Date.now()}`);
      if (!fs.existsSync(profileDir)) {
        fs.mkdirSync(profileDir, { recursive: true });
      }
      clearProfileLocks(profileDir);
      log('BROWSER', `[Mode BIASA] Membuka browser baru dengan profil bersih: ${path.basename(profileDir)}`);
    } else {
      log('BROWSER', '[Mode INCOGNITO] Membuka browser sesi in-memory bersih (tanpa profil di disk)');
    }

    const realVersion = '131.0.0.0';
    const majorVer = '131';

    const isFirefox = BROWSER_PREF === 'firefox';
    const userAgentStr = isFirefox
      ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0'
      : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${realVersion} Safari/537.36`;

    const contextOptions = {
      viewport: { width: 1366, height: 900 },
      locale: 'id-ID',
      timezoneId: 'Asia/Jakarta',
      userAgent: userAgentStr,
      ignoreHTTPSErrors: true,
    };

    if (isFirefox) {
      contextOptions.extraHTTPHeaders = {
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      };
    } else {
      contextOptions.extraHTTPHeaders = {
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'sec-ch-ua': `"Google Chrome";v="${majorVer}", "Chromium";v="${majorVer}", "Not_A Brand";v="24"`,
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      };
    }

    const proxyConfig = getProxyConfig();
    if (proxyConfig) {
      contextOptions.proxy = proxyConfig;
    }

    const launched = await launchBotBrowser(BROWSER_PREF, {
      isPersistent: isBiasa,
      userDataDir: profileDir,
      contextOptions,
    });

    if (launched.isPersistent) {
      context = launched.context;
      browser = null;
    } else {
      browser = launched.browser;
      context = await browser.newContext(contextOptions);
    }

    // ─── ANTI-DETECT FINGERPRINT INJECTION (Persis seperti AdsPower / SunBrowser) ───
    await context.addInitScript((m) => {
      // 1. Hapus indikator WebDriver & Automation
      try {
        delete Object.getPrototypeOf(navigator).webdriver;
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
      } catch (_) {}

      // 2. Samarkan Platform menjadi Windows Win32 (Mencegah deteksi Linux Server di Pterodactyl)
      try {
        Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });
      } catch (_) {}

      // 3. Vendor Google Inc. & UserAgentData
      try {
        delete window.opr;
        delete window.opera;
        Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.', configurable: true });
        if (navigator.userAgentData) {
          Object.defineProperty(navigator, 'userAgentData', {
            get: () => ({
              brands: [
                { brand: 'Google Chrome', version: m },
                { brand: 'Chromium', version: m },
                { brand: 'Not_A Brand', version: '24' }
              ],
              mobile: false,
              platform: 'Windows'
            }),
            configurable: true
          });
        }
      } catch (_) {}

      // 4. Spoof WebGL GPU menjadi NVIDIA GeForce RTX (Menghilangkan deteksi Software Mesa/llvmpipe Linux)
      try {
        const spoofWebGL = (proto) => {
          if (!proto) return;
          const origGetParam = proto.getParameter;
          proto.getParameter = function (param) {
            // UNMASKED_VENDOR_WEBGL (37445)
            if (param === 37445) return 'Google Inc. (NVIDIA)';
            // UNMASKED_RENDERER_WEBGL (37446)
            if (param === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
            return origGetParam.apply(this, arguments);
          };
        };
        spoofWebGL(window.WebGLRenderingContext && window.WebGLRenderingContext.prototype);
        spoofWebGL(window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype);
      } catch (_) {}

      // 5. Mock Plugins Chrome asli agar tidak terbaca sebagai Headless (plugins length > 0)
      try {
        const fakePlugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
        ];
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            const arr = fakePlugins;
            arr.item = (i) => arr[i];
            arr.namedItem = (name) => arr.find(p => p.name === name);
            arr.refresh = () => {};
            return arr;
          },
          configurable: true
        });
      } catch (_) {}

      // 6. Lengkapi window.chrome runtime & csi
      try {
        window.chrome = window.chrome || {};
        window.chrome.runtime = window.chrome.runtime || {
          connect: () => {},
          sendMessage: () => {},
          id: undefined,
        };
        window.chrome.loadTimes = window.chrome.loadTimes || function() {
          return {
            requestTime: Date.now() / 1000 - 0.5,
            startLoadTime: Date.now() / 1000 - 0.5,
            commitLoadTime: Date.now() / 1000 - 0.3,
            finishDocumentLoadTime: Date.now() / 1000 - 0.1,
            finishLoadTime: Date.now() / 1000,
            firstPaintTime: Date.now() / 1000 - 0.2,
            firstPaintAfterLoadTime: 0,
            navigationType: 'Other'
          };
        };
        window.chrome.csi = window.chrome.csi || function() {
          return { startE: Date.now() - 500, onloadT: Date.now(), pageT: 500, tran: 15 };
        };
      } catch (_) {}

      // 7. Hardware Concurrency & Memory (PC Gaming / Kantor standar)
      try {
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8, configurable: true });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8, configurable: true });
      } catch (_) {}

      // 8. Permissions API (Notifications)
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const origQuery = navigator.permissions.query;
          navigator.permissions.query = (param) => {
            if (param && param.name === 'notifications') {
              return Promise.resolve({ state: 'prompt', onchange: null });
            }
            return origQuery.apply(navigator.permissions, arguments);
          };
        }
      } catch (_) {}
    }, majorVer);

    if (launched.isPersistent && context.pages().length > 0) {
      page = context.pages()[0];
    } else {
      page = await context.newPage();
    }

    // ─── KHUSUS MODE: RESET / FORGOT PASSWORD AKUN ───────────────────────────────
    if (PLAN_MODE === 'reset_password' || PLAN_MODE === 'reset') {
      log('MODE', `Mode: RESET PASSWORD CAPCUT -> ${NEW_PASSWORD}`);

      // Cari email target arapmium:
      // Bisa dari parameter email langsung, atau jika rawLine dari akun_terkait (email:pass:boundEmail:date)
      let targetEmail = email;
      if (rawLine && rawLine.includes('@')) {
        const parts = rawLine.split(/[:|]/);
        const arapMatch = parts.find(p => p.trim().includes(`@${TMAIL_DOMAIN}`) || (p.includes('@') && !p.includes('dewaa.id') && !p.includes('gmail.com')));
        if (arapMatch) {
          targetEmail = arapMatch.trim();
        } else if (parts.length >= 3 && parts[2].includes('@')) {
          targetEmail = parts[2].trim();
        }
      }

      await resetCapCutPassword(page, targetEmail, NEW_PASSWORD, TMAIL_API_URL);

      // Catat ke file akun_reset_password.txt
      const recordLine = `${email}:${NEW_PASSWORD}:${targetEmail}:${new Date().toLocaleString('id-ID')}`;
      fs.appendFileSync(AKUN_RESET_FILE, recordLine + '\n', 'utf8');

      // Hapus dari antrean gsuite jika akun ini ada di file gsuite
      moveAccountToDone(email, rawLine);

      // Kirim marker khusus ke Telegram
      console.log(`###TELE_RESET_SUCCESS###${email}###${NEW_PASSWORD}###${targetEmail}###`);

      await wait(2000);
      return { success: true, email, boundEmail: targetEmail, newPassword: NEW_PASSWORD };
    }

    // ─── KHUSUS MODE: DAFTAR AKUN CAPCUT BARU (EMAIL ARAPMIUM + PASSWORD) ─────────
    if (PLAN_MODE === 'register' || PLAN_MODE === 'daftar') {
      log('MODE', `Mode: DAFTAR AKUN BARU CAPCUT (@${TMAIL_DOMAIN})`);
      const { email: newEmail } = await generateRandomEmail(TMAIL_DOMAIN, TMAIL_API_URL);
      log('DAFTAR', `Email acak dibuat: ${newEmail}`);

      await registerCapCutAccount(page, newEmail, DAFTAR_PASSWORD, TMAIL_API_URL, TMAIL_API_KEY);

      // Catat ke file akun_terdaftar.txt dengan format email|password (sesuai permintaan user)
      const recordLine = `${newEmail}|${DAFTAR_PASSWORD}`;
      fs.appendFileSync(AKUN_TERDAFTAR_FILE, recordLine + '\n', 'utf8');
      log('RECORD', `Tercatat di akun_terdaftar.txt: ${recordLine}`);

      // Kirim marker khusus ke Telegram bot
      console.log(`###TELE_REGISTER_SUCCESS###${newEmail}###${DAFTAR_PASSWORD}###`);

      await wait(2000);
      return { success: true, email: newEmail, password: DAFTAR_PASSWORD };
    }

    // ─── KHUSUS MODE: DAFTAR AKUN BARU + JOIN TIM CAPCUT ─────────────────────────
    if (PLAN_MODE === 'daftar_join') {
      log('MODE', `Mode: DAFTAR AKUN BARU + JOIN TIM CAPCUT (@${TMAIL_DOMAIN})`);
      if (!JOIN_LINK) {
        throw new Error('Link join tim CapCut belum ditentukan (set env join_link)');
      }

      const { email: newEmail } = await generateRandomEmail(TMAIL_DOMAIN, TMAIL_API_URL);
      log('DAFTAR', `Email acak dibuat: ${newEmail}`);

      // Step 1: Daftar akun baru
      await registerCapCutAccount(page, newEmail, DAFTAR_PASSWORD, TMAIL_API_URL, TMAIL_API_KEY);

      // Simpan ke akun_terdaftar.txt
      const recordLine = `${newEmail}|${DAFTAR_PASSWORD}`;
      fs.appendFileSync(AKUN_TERDAFTAR_FILE, recordLine + '\n', 'utf8');
      log('RECORD', `Tercatat di akun_terdaftar.txt: ${recordLine}`);

      // Step 2: Buka link join tim dan klik Submit
      const joinRes = await joinTeamWithLink(page, JOIN_LINK, newEmail);

      // Simpan ke akun_join_tim.txt
      const joinRecord = `${newEmail}|${DAFTAR_PASSWORD}|${joinRes.message}|${new Date().toLocaleString('id-ID')}|${JOIN_LINK}`;
      fs.appendFileSync(AKUN_JOIN_TIM_FILE, joinRecord + '\n', 'utf8');
      log('RECORD', `Tercatat di akun_join_tim.txt: ${joinRecord}`);

      // Kirim marker khusus ke Telegram bot
      console.log(`###TELE_JOIN_SUCCESS###${newEmail}###${DAFTAR_PASSWORD}###${joinRes.message}###${JOIN_LINK}###`);

      await wait(2000);
      return { success: true, email: newEmail, password: DAFTAR_PASSWORD, status: joinRes.message };
    }

    // ─── KHUSUS MODE: LOGIN AKUN + JOIN TIM CAPCUT ────────────────────────────────
    if (PLAN_MODE === 'login_join') {
      log('MODE', `Mode: LOGIN AKUN + JOIN TIM CAPCUT (${email})`);
      if (!JOIN_LINK) {
        throw new Error('Link join tim CapCut belum ditentukan (set env join_link)');
      }

      // Step 1: Login dengan email & password
      await loginCapCutWithEmail(page, email, password, TMAIL_API_URL, TMAIL_API_KEY);

      // Step 2: Buka link join tim dan klik Submit
      const joinRes = await joinTeamWithLink(page, JOIN_LINK, email);

      // Simpan ke akun_join_tim.txt
      const joinRecord = `${email}|${password}|${joinRes.message}|${new Date().toLocaleString('id-ID')}|${JOIN_LINK}`;
      fs.appendFileSync(AKUN_JOIN_TIM_FILE, joinRecord + '\n', 'utf8');
      log('RECORD', `Tercatat di akun_join_tim.txt: ${joinRecord}`);

      // Kirim marker khusus ke Telegram bot
      console.log(`###TELE_JOIN_SUCCESS###${email}###${password}###${joinRes.message}###${JOIN_LINK}###`);

      await wait(2000);
      return { success: true, email, password, status: joinRes.message };
    }

    // Pasang API routes space_list & init_trade referensi CAPCUT 7 DAY PLAN PRO
    await setupTradeApiRoutes(page);

    // Login Google
    await loginGoogle(page, email, password);

    // ─── KHUSUS MODE: KAITKAN EMAIL SAJA (Tanpa ambil link pembayaran) ───────────
    if (PLAN_MODE === 'bind_only' || PLAN_MODE === 'bind') {
      log('MODE', 'Mode: KAITKAN EMAIL SAJA (Tanpa checkout / cashier link)');
      const { email: randomEmail } = await generateRandomEmail(TMAIL_DOMAIN, TMAIL_API_URL);
      const boundEmail = await bindEmailToAccount(page, randomEmail, TMAIL_API_URL, TMAIL_API_KEY);

      // Catat ke file akun_terkait.txt
      const recordLine = `${email}:${password}:${boundEmail}:${new Date().toLocaleString('id-ID')}`;
      fs.appendFileSync(AKUN_TERKAIT_FILE, recordLine + '\n', 'utf8');

      // Pindahkan akun sukses: hapus dari gsuite & tambahkan ke akun_sudah_login
      moveAccountToDone(email, rawLine);

      // Kirim marker khusus ke Telegram
      console.log(`###TELE_BIND_SUCCESS###${email}###${password}###${boundEmail}###`);

      await wait(2000);
      return { success: true, email, boundEmail };
    }

    // Navigasi ke My Edit
    await goToMyEdit(page);

    let cashierLink;
    if (PLAN_MODE === 'teams' || PLAN_MODE === 'team') {
      cashierLink = await extractTeamsCashierLink(page, email);
    } else if (PLAN_MODE === 'pro') {
      cashierLink = await extractProCashierLink(page, email);
    } else {
      throw new Error(`planmode tidak dikenal: ${PLAN_MODE}`);
    }

    // Pengaitan (bind) email otomatis jika diaktifkan di .env
    let boundEmail = null;
    if (AUTO_BIND_EMAIL) {
      try {
        const { email: randomEmail } = await generateRandomEmail(TMAIL_DOMAIN, TMAIL_API_URL);
        boundEmail = await bindEmailToAccount(page, randomEmail, TMAIL_API_URL, TMAIL_API_KEY);
      } catch (bindErr) {
        log('WARN', `Gagal mengaitkan email: ${bindErr.message}. Link cashier tetap tersimpan.`);
      }
    }

    // Simpan result
    const resultLine = boundEmail
      ? `${email}:${password}:${boundEmail}:${cashierLink}`
      : `${email}:${password}:${cashierLink}`;
    appendResult(resultLine);

    if (boundEmail) {
      const recordLine = `${email}:${password}:${boundEmail}:${new Date().toLocaleString('id-ID')}`;
      fs.appendFileSync(AKUN_TERKAIT_FILE, recordLine + '\n', 'utf8');
    }

    // Pindahkan akun sukses: hapus dari gsuite & tambahkan ke akun_sudah_login
    moveAccountToDone(email, rawLine);

    // Kirim notifikasi marker untuk langsung ditangkap telebot
    console.log(`###TELE_CASHIER###${PLAN_MODE.toUpperCase()}###${email}###${password}###${cashierLink}###${boundEmail || '-'}###`);

    await wait(2000);
    return { success: true, email, cashierLink, boundEmail };

  } catch (err) {
    log('FAIL', `Gagal [${email}]: ${err.message}`);
    let ssPath = err.screenshotPath || '';
    if (!ssPath && page && typeof page.isClosed === 'function' && !page.isClosed()) {
      try {
        ssPath = await takeDiagnosticScreenshot(page, 'error', email);
      } catch (_) {}
    }
    // Catat akun gagal ke akun_gagal.txt & keluarkan dari gsuite (sertakan screenshot jika ada)
    moveAccountToFailed(email, rawLine, err.message, ssPath);
    return { success: false, email, error: err.message, screenshot: ssPath };
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (profileDir && fs.existsSync(profileDir)) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  // Bersihkan sisa profil browser lama agar bersih sebelum mulai
  const profilesBase = path.join(__dirname, 'browser_profiles');
  if (fs.existsSync(profilesBase)) {
    try { fs.rmSync(profilesBase, { recursive: true, force: true }); } catch (_) {}
  }
  const oldProfile = path.join(__dirname, 'browser_profile');
  if (fs.existsSync(oldProfile)) {
    try { fs.rmSync(oldProfile, { recursive: true, force: true }); } catch (_) {}
  }

  console.log('');
  console.log('======================================================');
  console.log('               BOT CAPCUT AUTOMATION                  ');
  console.log('                     t.me/Drosek                      ');
  let planSubtitle = ' (Rp14.500)';
  if (PLAN_MODE.includes('team')) planSubtitle = ` | Target: ${TARGET_SEATS} Seats`;
  else if (PLAN_MODE === 'register' || PLAN_MODE === 'daftar') planSubtitle = ` (Daftar Akun Baru @${TMAIL_DOMAIN})`;
  else if (PLAN_MODE === 'daftar_join') planSubtitle = ` (Daftar Akun Baru + Join Tim)`;
  else if (PLAN_MODE === 'login_join') planSubtitle = ` (Login Akun + Join Tim)`;
  else if (PLAN_MODE === 'bind_only' || PLAN_MODE === 'bind') planSubtitle = ' (Kaitkan Email Saja)';
  else if (PLAN_MODE.includes('reset')) planSubtitle = ' (Reset Password)';
  console.log(`          Mode: ${PLAN_MODE.toUpperCase()}${planSubtitle}`);
  console.log('======================================================');
  console.log('');

  // Baca daftar akun gsuite & akun yang sudah selesai
  let doneEmails;
  if (PLAN_MODE === 'daftar_join') {
    doneEmails = new Set();
  } else if (PLAN_MODE === 'login_join') {
    doneEmails = new Set(
      fs.existsSync(AKUN_JOIN_TIM_FILE)
        ? fs.readFileSync(AKUN_JOIN_TIM_FILE, 'utf8')
            .split('\n')
            .filter(l => l.includes('|') && (!JOIN_LINK || l.includes(JOIN_LINK)))
            .map(l => l.split('|')[0].trim().toLowerCase())
            .filter(Boolean)
        : []
    );
  } else if (PLAN_MODE === 'register' || PLAN_MODE === 'daftar') {
    doneEmails = new Set(
      fs.existsSync(AKUN_TERDAFTAR_FILE)
        ? fs.readFileSync(AKUN_TERDAFTAR_FILE, 'utf8')
            .split('\n')
            .map(e => e.split(/[:|]/)[0].trim().toLowerCase())
            .filter(Boolean)
        : []
    );
  } else if (PLAN_MODE === 'bind_only' || PLAN_MODE === 'bind') {
    doneEmails = new Set(
      fs.existsSync(AKUN_TERKAIT_FILE)
        ? fs.readFileSync(AKUN_TERKAIT_FILE, 'utf8')
            .split('\n')
            .map(e => e.split(/[:|]/)[0].trim().toLowerCase())
            .filter(Boolean)
        : []
    );
  } else if (PLAN_MODE === 'reset_password' || PLAN_MODE === 'reset') {
    const set = new Set();
    if (fs.existsSync(AKUN_RESET_FILE)) {
      fs.readFileSync(AKUN_RESET_FILE, 'utf8').split('\n').forEach(e => {
        const parts = e.split(/[:|]/);
        if (parts[0] && parts[0].trim()) set.add(parts[0].trim().toLowerCase());
        if (parts[2] && parts[2].trim()) set.add(parts[2].trim().toLowerCase());
      });
    }
    doneEmails = set;
  } else {
    doneEmails = new Set(
      fs.existsSync(AKUN_SUDAH_LOGIN_FILE)
        ? fs.readFileSync(AKUN_SUDAH_LOGIN_FILE, 'utf8')
            .split('\n')
            .map(e => e.split(/[:|]/)[0].trim().toLowerCase())
            .filter(Boolean)
        : []
    );
  }

  let rawAccounts = [];
  if (PLAN_MODE === 'register' || PLAN_MODE === 'daftar' || PLAN_MODE === 'daftar_join') {
    const MAX_PROCESS = parseInt(process.env.max_process || process.env.MAX_PROCESS || '1', 10);
    const countToRegister = MAX_PROCESS > 0 ? Math.min(MAX_PROCESS, 5) : 1;
    for (let k = 0; k < countToRegister; k++) {
      rawAccounts.push({
        email: `daftar_akun_${k + 1}`,
        password: DAFTAR_PASSWORD,
        raw: `daftar_akun_${k + 1}`
      });
    }
  } else if (PLAN_MODE === 'login_join') {
    let srcFile = JOIN_ACCOUNTS_FILE;
    if (!fs.existsSync(srcFile) || fs.readFileSync(srcFile, 'utf8').trim() === '') {
      if (fs.existsSync(path.join(__dirname, 'akun_login_join.txt')) && fs.readFileSync(path.join(__dirname, 'akun_login_join.txt'), 'utf8').trim() !== '') {
        srcFile = path.join(__dirname, 'akun_login_join.txt');
      } else if (fs.existsSync(AKUN_TERDAFTAR_FILE) && fs.readFileSync(AKUN_TERDAFTAR_FILE, 'utf8').trim() !== '') {
        srcFile = AKUN_TERDAFTAR_FILE;
      } else {
        srcFile = GSUITE_FILE;
      }
    }
    if (fs.existsSync(srcFile)) {
      rawAccounts = fs.readFileSync(srcFile, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && l.includes('@'))
        .map(line => {
          let email = line;
          let password = DAFTAR_PASSWORD;
          if (line.includes('|')) {
            const parts = line.split('|');
            email = parts[0].trim();
            password = parts.slice(1).join('|').trim() || DAFTAR_PASSWORD;
          } else if (line.includes(':')) {
            const parts = line.split(':');
            email = parts[0].trim();
            password = parts.slice(1).join(':').trim() || DAFTAR_PASSWORD;
          }
          return { email, password, raw: line };
        });
    }
  } else if (fs.existsSync(GSUITE_FILE)) {
    rawAccounts = fs.readFileSync(GSUITE_FILE, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && l.includes('@'))
      .map(line => {
        let email = line;
        let password = PASSWORD_GOOGLE;
        if (line.includes('|')) {
          const parts = line.split('|');
          email = parts[0].trim();
          password = parts.slice(1).join('|').trim() || PASSWORD_GOOGLE;
        } else if (line.includes(':')) {
          const parts = line.split(':');
          email = parts[0].trim();
          password = parts.slice(1).join(':').trim() || PASSWORD_GOOGLE;
        }
        return { email, password, raw: line };
      });
  }

  let accounts = (PLAN_MODE === 'register' || PLAN_MODE === 'daftar' || PLAN_MODE === 'daftar_join')
    ? [...rawAccounts]
    : rawAccounts.filter(acc => !doneEmails.has(acc.email.toLowerCase()));

  // Jika mode reset_password dan antrean gsuite kosong/selesai semua, otomatis baca dari akun_terkait.txt
  if ((PLAN_MODE === 'reset_password' || PLAN_MODE === 'reset') && accounts.length === 0 && fs.existsSync(AKUN_TERKAIT_FILE)) {
    const fallbackAccounts = fs.readFileSync(AKUN_TERKAIT_FILE, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && l.includes('@'))
      .map(line => {
        const parts = line.split(':');
        return { email: parts[0].trim(), password: parts[1] ? parts[1].trim() : PASSWORD_GOOGLE, raw: line };
      });
    const pendingFallback = fallbackAccounts.filter(acc => !doneEmails.has(acc.email.toLowerCase()));
    if (pendingFallback.length > 0) {
      rawAccounts = fallbackAccounts;
      accounts = pendingFallback;
      log('INFO', `Otomatis beralih ke akun_terkait.txt (${accounts.length} akun siap di-reset)`);
    }
  }
  const MAX_PROCESS = parseInt(process.env.max_process || process.env.MAX_PROCESS || '0', 10);
  const targetAccounts = (PLAN_MODE === 'register' || PLAN_MODE === 'daftar' || PLAN_MODE === 'daftar_join')
    ? accounts
    : (MAX_PROCESS > 0 ? accounts.slice(0, MAX_PROCESS) : accounts);

  log('INFO', `Total akun sumber: ${rawAccounts.length} | Sudah diproses: ${doneEmails.size} | Belum diproses: ${accounts.length}`);
  if (MAX_PROCESS > 0) {
    log('INFO', `Batas proses aktif: ${targetAccounts.length} akun akan dijalankan`);
  }
  const proxyCfg = getProxyConfig();
  if (proxyCfg) {
    log('PROXY', `Proxy aktif: ${proxyCfg.server} (User: ${proxyCfg.username || 'none'})`);
  } else {
    log('PROXY', 'Mode koneksi langsung (Tanpa proxy)');
  }
  const installedBrowsers = scanInstalledBrowsers();
  const BROWSER_MODE_LOG = (process.env.browser_mode || 'incognito').trim().toLowerCase();
  const isBiasaLog = BROWSER_MODE_LOG === 'biasa' || BROWSER_MODE_LOG === 'normal';
  log('INFO', `Plan: ${PLAN_MODE.toUpperCase()} | Seats/Kursi: ${TARGET_SEATS}`);
  log('BROWSER', `Mode Browser (.env): ${isBiasaLog ? 'BIASA / NORMAL (Persistent Context)' : 'INCOGNITO (Ephemeral Context)'}`);
  log('BROWSER', `Target Browser (.env): ${BROWSER_PREF}`);
  log('BROWSER', 'Status deteksi browser di sistem:');
  const allKnown = ['chrome', 'brave', 'opera', 'firefox', 'edge'];
  for (const b of allKnown) {
    const p = installedBrowsers[b];
    const isChosen = (BROWSER_PREF === b || (BROWSER_PREF === 'auto' && b === 'chrome'));
    if (p) {
      console.log(`    - ${b.toUpperCase().padEnd(8)}: TERDETEKSI -> ${p} ${isChosen ? '[AKTIF]' : ''}`);
    } else {
      console.log(`    - ${b.toUpperCase().padEnd(8)}: TIDAK DITEMUKAN`);
    }
  }
  console.log('');

  if (process.argv.includes('--check')) {
    log('CHECK', 'Verifikasi konfigurasi dan browser selesai dengan sukses!');
    process.exit(0);
  }

  if (targetAccounts.length === 0) {
    const listName = (PLAN_MODE === 'daftar_join' || PLAN_MODE === 'login_join')
      ? 'akun_join_tim.txt'
      : ((PLAN_MODE === 'register' || PLAN_MODE === 'daftar')
          ? 'akun_terdaftar.txt'
          : ((PLAN_MODE === 'bind_only' || PLAN_MODE === 'bind')
              ? 'akun_terkait.txt'
              : (PLAN_MODE.includes('reset') ? 'akun_reset_password.txt' : 'akun_sudah_login')));
    log('SUCCESS', `Semua akun sudah pernah diproses (${listName}) atau tidak ada akun tersedia!`);
    process.exit(0);
  }

  // Reset / inisialisasi result file
  if (!fs.existsSync(RESULT_FILE) || fs.readFileSync(RESULT_FILE, 'utf8').trim() === 'email:password:link_cashier') {
    fs.writeFileSync(RESULT_FILE, 'email:password:link_cashier\n', 'utf8');
  }

  let sukses = 0, gagal = 0;

  for (let i = 0; i < targetAccounts.length; i++) {
    const { email, password, raw } = targetAccounts[i];
    log('AKUN', `[${i + 1}/${targetAccounts.length}] Mulai proses ${email}`);

    // Rotasi IP jika URL rotasi disetel di .env
    if (i > 0 || process.env.rotate_ip_first === 'true' || process.env.ROTATE_IP_FIRST === 'true') {
      await rotateIpIfConfigured();
    }

    const result = await processAccount(email, password, raw);
    if (result.success) sukses++;
    else gagal++;

    // Jeda antar akun
    if (i < targetAccounts.length - 1) {
      log('WAIT', 'Jeda 5 detik sebelum akun berikutnya...');
      await wait(5000);
    }
  }

  const successFile = (PLAN_MODE === 'daftar_join' || PLAN_MODE === 'login_join')
    ? 'akun_join_tim.txt'
    : ((PLAN_MODE === 'register' || PLAN_MODE === 'daftar')
        ? 'akun_terdaftar.txt'
        : ((PLAN_MODE === 'bind_only' || PLAN_MODE === 'bind')
            ? 'akun_terkait.txt'
            : (PLAN_MODE.includes('reset') ? 'akun_reset_password.txt' : 'result.txt')));

  console.log('');
  console.log('------------------------------------------------------');
  console.log(`  SELESAI: ${sukses} sukses, ${gagal} gagal dari ${targetAccounts.length} akun diproses           `);
  console.log(`  Hasil sukses di: ${successFile}                       `);
  if (gagal > 0) {
    console.log(`  Akun gagal dicatat di: akun_gagal.txt              `);
  }
  console.log('------------------------------------------------------');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
