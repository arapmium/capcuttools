/**
 * canva.js
 * Modul otomatisasi Canva:
 * 1. Pendaftaran Akun Canva (Sign Up dengan Email OTP Outlook)
 * 2. Reset Password Akun Canva
 * Menggunakan pembaca inbox otomatis dari outlookreader.my.id
 */

require('dotenv').config();
const { chromium, firefox } = require('playwright');
const fs = require('fs');
const path = require('path');
const { captureCanvaBaseline, waitForCanvaOtp, waitForCanvaReset, parseAccountLine } = require('./outlookreader');

// Arahkan Playwright ke folder yang bisa ditulis (penting untuk Pterodactyl/Docker/Linux)
if (process.platform === 'linux') {
  const browserDir = path.join(__dirname, '.browsers');
  process.env.PLAYWRIGHT_BROWSERS_PATH = browserDir;
  if (!fs.existsSync(browserDir)) {
    try { fs.mkdirSync(browserDir, { recursive: true }); } catch (_) {}
  }
  // Fix ENOSPC: arahkan temp juga ke folder yang bisa ditulis
  const tmpDir = path.join(__dirname, '.tmp');
  if (!fs.existsSync(tmpDir)) {
    try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (_) {}
  }
  process.env.TMPDIR = tmpDir;
  process.env.TEMP = tmpDir;
  process.env.TMP = tmpDir;
}

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  try { fs.mkdirSync(SCREENSHOT_DIR, { recursive: true }); } catch (_) {}
}

function log(tag, msg) {
  const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
  console.log(`[CANVA] [${tag}] ${msg}`);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── BROWSER DETECTION & LAUNCHER (STEALTH) ──────────────────────────────────
function getProxyConfig() {
  if (process.env.USE_PROXY === 'false' || process.env.use_proxy === 'false' || process.env.USE_PROXY === '0') {
    return null;
  }
  const proxyStr = (process.env.proxy || process.env.PROXY || '').trim();
  if (!proxyStr || proxyStr === 'none' || proxyStr === 'direct' || proxyStr === 'false') return null;

  let mode = (process.env.proxy_mode || process.env.PROXY_MODE || 'http').trim().toLowerCase();
  if (mode !== 'http' && mode !== 'socks5') mode = 'http';

  let clean = proxyStr.replace(/^(https?|socks5?):\/\//i, '');
  const parts = clean.split(':');
  if (parts.length === 4) {
    const [host, port, username, password] = parts;
    return {
      server: `${mode}://${host}:${port}`,
      username: username ? decodeURIComponent(username) : undefined,
      password: password ? decodeURIComponent(password) : undefined,
    };
  } else if (parts.length === 2) {
    return { server: `${mode}://${parts[0]}:${parts[1]}` };
  }
  return null;
}

async function launchCanvaBrowser(options = {}) {
  const browserPref = (process.env.browser || process.env.BROWSER || 'auto').trim().toLowerCase();
  const customPath = (process.env.browser_path || process.env.BROWSER_PATH || '').trim();
  const isBiasa = (process.env.browser_mode || '').trim().toLowerCase() === 'biasa';
  const userDataDir = path.join(__dirname, 'browser_profile');

  const proxyConfig = getProxyConfig();
  const proxyOption = proxyConfig ? { server: proxyConfig.server, username: proxyConfig.username, password: proxyConfig.password } : undefined;

    // Ukuran browser portrait 480x900 (mengikuti referensi perangkat/komputer agar ringan & tidak memicu bot detection Canva)
  const BROWSER_WIDTH = 480;
  const BROWSER_HEIGHT = 900;

  const defaultChromiumArgs = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-save-password-bubble',
    '--disable-offer-store-unmasked-wallet-cards',
    '--disable-notifications',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-backgrounding-occluded-windows',
    `--window-size=${BROWSER_WIDTH},${BROWSER_HEIGHT}`
  ];

  if (process.platform === 'linux') {
    defaultChromiumArgs.push('--disable-gpu');
  }

  if (!proxyConfig) {
    defaultChromiumArgs.push('--no-proxy-server');
  }

  // Penentuan mode Headless vs Non-Headless
  let isHeadless = true;
  if (process.env.HEADLESS !== undefined && process.env.HEADLESS !== '') {
    isHeadless = String(process.env.HEADLESS).toLowerCase() === 'true';
  } else if (process.platform === 'win32') {
    isHeadless = false; // Di Laptop default NON-HEADLESS (terbuka jendela portrait kecil)
  }

  if (process.platform === 'linux' && !process.env.DISPLAY) {
    isHeadless = true; // Paksa headless jika di server Linux/Pterodactyl tanpa GUI display
  }

  log('BROWSER', `Mode browser: ${isHeadless ? 'HEADLESS (Background / Server Pterodactyl)' : `NON-HEADLESS (${BROWSER_WIDTH}x${BROWSER_HEIGHT} Portrait Sesuai Perangkat)`}`);

  const contextOptions = {
    viewport: { width: BROWSER_WIDTH, height: BROWSER_HEIGHT },
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
  };

  if (proxyOption) contextOptions.proxy = proxyOption;

  let browser, context;

  // Linux detection (Pterodactyl / VPS / Container)
  let executablePath = customPath || undefined;
  if (!executablePath && process.platform === 'linux') {
    const linuxPaths = [
      process.env.CHROME_PATH,
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/brave-browser',
      '/usr/bin/microsoft-edge'
    ].filter(Boolean);
    for (const p of linuxPaths) {
      if (fs.existsSync(p)) { executablePath = p; break; }
    }
  }

  // Windows detection (Laptop / PC)
  if (!executablePath && process.platform === 'win32') {
    const winPaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
    ];
    for (const p of winPaths) {
      if (fs.existsSync(p)) { executablePath = p; break; }
    }
  }

  const launchOpts = {
    headless: isHeadless,
    args: defaultChromiumArgs,
    executablePath: executablePath || undefined,
    proxy: proxyOption
  };

  try {
    if (isBiasa) {
      if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
      context = await chromium.launchPersistentContext(userDataDir, {
        ...launchOpts,
        ...contextOptions
      });
      browser = null;
    } else {
      browser = await chromium.launch(launchOpts);
      context = await browser.newContext(contextOptions);
    }
  } catch (err) {
    log('WARN', `Launch utama gagal (${err.message}), fallback Chromium default...`);
    browser = await chromium.launch({
      headless: isHeadless,
      args: defaultChromiumArgs,
      proxy: proxyOption
    });
    context = await browser.newContext(contextOptions);
  }

  // Inject advanced stealth script
  await context.addInitScript(() => {
    // 1. Hide automation & webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    try { delete navigator.__proto__.webdriver; } catch (_) {}

    // 2. Realistic Chrome runtime & plugins
    window.chrome = {
      app: { isInstalled: false },
      runtime: {
        PlatformOs: { WIN: 'win', MAC: 'mac', LINUX: 'linux' },
        PlatformArch: { X86_64: 'x86-64', ARM: 'arm' }
      },
      csi: function() {},
      loadTimes: function() {}
    };

    // 3. Languages
    Object.defineProperty(navigator, 'languages', { get: () => ['id-ID', 'id', 'en-US', 'en'] });

    // 4. Fake plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' }
      ]
    });
  });

  const page = await context.newPage();
  return { browser, context, page };
}

async function takeCanvaScreenshot(page, prefix = 'canva', email = '') {
  try {
    const cleanEmail = String(email).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
    const filename = `${prefix}_${cleanEmail}_${Date.now()}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: false });
    log('SCREENSHOT', `📸 Bukti disimpan: ${filepath}`);
    return filepath;
  } catch (_) {
    return '';
  }
}

// ─── HELPER: TUTUP BANNER COOKIES & POPUP CANVA ──────────────────────────────
async function dismissCanvaPopups(page) {
  try {
    // 1. Terima Kuki (Cookies)
    const cookieBtn = page.locator('button:has-text("Terima semua kuki"), button:has-text("Accept all cookies"), button:has-text("Terima"), button:has-text("Accept")').first();
    if (await cookieBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await cookieBtn.click({ force: true });
      log('OK', 'Banner cookies Canva ditutup');
      await wait(500);
    }

    // 2. Popups "Nanti saja" / "Skip" / "Maybe later"
    const skipBtn = page.locator('button:has-text("Nanti saja"), button:has-text("Maybe later"), button:has-text("Lewati"), button:has-text("Skip")').first();
    if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await skipBtn.click({ force: true });
      log('OK', 'Popup onboarding Canva diskip');
    }
  } catch (_) {}
}

// ─── HELPER V2: DETEKSI & BYPASS ERROR KEAMANAN MERAH (RMS/RRS) & OTP ─────────
async function hasCanvaRmsSecurityError(page) {
  try {
    return await page.evaluate(() => {
      const text = (document.body.innerText || '').toLowerCase();
      if (
        text.includes('karena alasan keamanan') ||
        text.includes('kode verifikasi tidak dapat dikirim') ||
        text.includes('kode verifikasi tidak bisa dikirim') ||
        text.includes('for security reasons') ||
        text.includes('verification code could not be sent') ||
        text.includes("verification code couldn't be sent") ||
        /rms-[a-z0-9]+/i.test(text) ||
        /rrs-[a-z0-9]+/i.test(text)
      ) {
        return true;
      }

      // Deteksi banner kotak notifikasi merah / pink keamanan Canva
      const redEls = Array.from(document.querySelectorAll('div, p, span, [role="alert"]')).filter(e => {
        if (!e.getClientRects().length) return false;
        const t = (e.innerText || '').toLowerCase();
        if (t.length < 15 || t.length > 700) return false;
        if (!t.includes('keamanan') && !t.includes('security') && !t.includes('verifikasi') && !t.includes('rrs-') && !t.includes('rms-')) return false;
        return true;
      });
      return redEls.length > 0;
    });
  } catch (_) {
    return false;
  }
}

async function clickCanvaModalBack(page) {
  try {
    // 1. Coba klik via selector Playwright spesifik tombol back
    const backSelectors = [
      'button[aria-label*="kembali" i]',
      'button[aria-label*="back" i]',
      '[role="button"][aria-label*="kembali" i]',
      '[role="button"][aria-label*="back" i]',
      'button[data-testid*="back" i]',
      'button:has-text("<")',
      'button:has-text("‹")',
      'button:has-text("←")',
      'span:has-text("<")',
      'svg[aria-label*="kembali" i]'
    ];
    for (const sel of backSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 400 })) {
          await el.click({ force: true });
          return true;
        }
      } catch (_) {}
    }

    // 2. Dispatch click dengan event pointer & mouse lengkap (sesuai referensi perangkat)
    return await page.evaluate(() => {
      function dispatchClick(el) {
        if (!el) return false;
        try {
          el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          el.focus();
        } catch (_) {}
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
          try {
            el.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
          } catch (_) {}
        });
        try {
          if (typeof el.click === 'function') el.click();
        } catch (_) {}
        return true;
      }

      const allElements = Array.from(document.querySelectorAll("button, [role='button'], a, svg, div[tabindex='0'], span[tabindex='0']"));
      for (const el of allElements) {
        if (!el.getClientRects().length) continue;
        const aria = (el.getAttribute('aria-label') || '').toLowerCase().trim();
        const title = (el.getAttribute('title') || '').toLowerCase().trim();
        const tid = (el.getAttribute('data-testid') || '').toLowerCase().trim();
        const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (
          aria === 'kembali' || aria === 'back' || aria.startsWith('kembali') || aria.startsWith('back') ||
          title === 'kembali' || title === 'back' || tid.includes('back') || tid.includes('kembali') ||
          (['<', '‹', '←', '«'].includes(txt) && txt.length <= 2)
        ) {
          const target = el.closest('button, [role="button"], a') || el;
          dispatchClick(target);
          return true;
        }
      }
      return false;
    });
  } catch (_) {
    return false;
  }
}

async function handleCanvaSecurityBackRetry(page, purpose = 'signup', maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (!(await hasCanvaRmsSecurityError(page))) return true;
    log('WARN', `[AUTO-FIX] Pesan keamanan merah (RMS/RRS) Canva terdeteksi (Percobaan ${attempt}/${maxRetries})! Mengklik '<' kembali...`);
    await clickCanvaModalBack(page);
    await wait(1800);
    if (purpose === 'signup') {
      const btn = page.locator('button[type="submit"], button:has-text("Lanjutkan"), button:has-text("Berikutnya"), button:has-text("Continue"), button:has-text("Next"), button:has-text("Buat akun Anda"), button:has-text("Buat akun")').first();
      if (await btn.isVisible({ timeout: 3500 }).catch(() => false)) await btn.click({ force: true });
    } else {
      const btn = page.locator('button[type="submit"], button:has-text("Buat kata sandi"), button:has-text("Create password"), button:has-text("Atur kata sandi"), button:has-text("Set password"), button:has-text("Lanjutkan")').first();
      if (await btn.isVisible({ timeout: 3500 }).catch(() => false)) await btn.click({ force: true });
    }
    await wait(2500);
    if (!(await hasCanvaRmsSecurityError(page))) {
      log('OK', '✓ Pesan keamanan merah (RMS/RRS) berhasil diatasi!');
      return true;
    }
  }
  return !(await hasCanvaRmsSecurityError(page));
}

async function detectCanvaOtpFailure(page) {
  try {
    return await page.evaluate(() => {
      const text = (document.body.innerText || '').toLowerCase();
      const markers = [
        'kode yang anda masukkan salah',
        'kode yang dimasukkan salah',
        'kode salah',
        'kode tidak valid',
        'invalid code',
        'incorrect code',
        'kode sudah kedaluwarsa',
        'kode kadaluarsa',
        'code expired',
        'kode verifikasi salah'
      ];
      if (markers.some(m => text.includes(m))) return true;
      const inputs = Array.from(document.querySelectorAll("input[autocomplete='one-time-code'], input[type='text'][maxlength='1']"));
      return inputs.some(i => i.getAttribute('aria-invalid') === 'true');
    });
  } catch (_) {
    return false;
  }
}

async function requestFreshCanvaOtp(page) {
  log('OTP', 'Meminta kirim ulang kode OTP dari Canva...');
  for (let i = 0; i < 8; i++) {
    const inCooldown = await page.evaluate(() => {
      const t = (document.body.innerText || '').toLowerCase();
      return t.includes('kirim ulang dalam') || t.includes('resend in');
    }).catch(() => false);
    if (!inCooldown) break;
    await wait(2000);
  }
  const resendBtn = page.locator('button:has-text("Kirim ulang kode"), button:has-text("Kirim ulang"), button:has-text("Resend code"), button:has-text("Resend"), a:has-text("Kirim ulang")').first();
  if (await resendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await resendBtn.click({ force: true });
    return true;
  }
  return false;
}

async function fillCanvaOtpCode(page, otpCode) {
  const cleanCode = String(otpCode).replace(/\D/g, '').slice(0, 6);
  // 1. Cek 6 kotak terpisah via React value setter
  const filledMulti = await page.evaluate((code) => {
    const inps = Array.from(document.querySelectorAll(
      "input[maxlength='1'], input[maxLength='1'], input[autocomplete='one-time-code'], input[inputmode='numeric']"
    )).filter(el => {
      const s = window.getComputedStyle(el);
      return el.offsetWidth > 0 && el.offsetHeight > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    });
    if (inps.length >= 6) {
      const boxes = inps.slice(0, code.length);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      for (let i = 0; i < code.length; i++) {
        const el = boxes[i];
        el.focus();
        if (setter) setter.call(el, code[i]); else el.value = code[i];
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    }
    return false;
  }, cleanCode).catch(() => false);

  if (filledMulti) {
    log('OK', 'OTP diinput ke 6 digit kotak terpisah');
    return true;
  }

  // 2. Fallback: Single input field
  const singleOtpInput = page.locator('input[inputmode="numeric"], input[name="code"], input[autocomplete="one-time-code"], input[placeholder*="kode" i], input[placeholder*="code" i], input[type="tel"], input[type="text"]').first();
  await singleOtpInput.waitFor({ state: 'visible', timeout: 10000 });
  await singleOtpInput.fill(cleanCode);
  log('OK', 'OTP diinput ke single input field');
  return true;
}

// ─── 1. SIGNUP CANVA V2 (PENDAFTARAN AKUN DENGAN EMAIL OTP OUTLOOKREADER) ────
async function signupCanvaAccount(rawAccountLine, customPassword = '') {
  const parsed = parseAccountLine(rawAccountLine);
  if (!parsed) {
    throw new Error(`Format akun tidak valid: ${rawAccountLine}`);
  }

  const { email, password: accPassword, rawLine } = parsed;
  const targetPassword = customPassword || process.env.CANVA_PASSWORD || process.env.canva_password || accPassword || process.env.daftar_password || process.env.new_password || 'Bisnis2024!';

  log('SIGNUP', `[1/6] Memulai proses pendaftaran Canva V2: ${email}`);

  // Snapshot baseline inbox SEBELUM membuka/submit form agar OTP baru tidak pernah dianggap OTP lama!
  const baseline = await captureCanvaBaseline(rawLine);
  const seenOtps = new Set(baseline.existingOtps || []);
  if (seenOtps.size > 0) {
    log('OTP', `Baseline inbox dicatat sebelum signup (mengabaikan OTP lama: ${[...seenOtps].join(', ')})`);
  }

  const { browser, context, page } = await launchCanvaBrowser();
  let screenshotPath = '';

  try {
    // Step 1: Buka halaman pendaftaran Canva Indonesia (V2 URL)
    const signupUrl = process.env.CANVA_SIGNUP_URL || 'https://www.canva.com/id_id/signup/';
    log('NAVIGATE', `Membuka ${signupUrl}...`);
    await page.goto(signupUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await wait(2000);
    await dismissCanvaPopups(page);

    // Step 2: Klik tombol "Lanjutkan dengan email" / "Email"
    log('CLICK', 'Mencari tombol "Lanjutkan dengan email"...');
    let emailBtnClicked = false;
    const emailButtonSelectors = [
      'button:has-text("Lanjutkan dengan email")',
      'button:has-text("Continue with email")',
      'button:has-text("Daftar dengan email")',
      'button:has-text("Sign up with email")',
      'button:has-text("Email")',
      '[role="button"]:has-text("Email")'
    ];

    for (const sel of emailButtonSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 1800 })) {
          await el.click({ force: true });
          emailBtnClicked = true;
          log('OK', `Tombol email diklik via: ${sel}`);
          break;
        }
      } catch (_) {}
    }

    if (!emailBtnClicked) {
      const directInput = page.locator('input[inputmode="email"], input[name="username"], input[type="email"]').first();
      if (!await directInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        screenshotPath = await takeCanvaScreenshot(page, 'canva_signup_no_email_btn', email);
        throw new Error('Tombol "Continue with email" tidak ditemukan pada modal Canva');
      }
    }

    await wait(1500);
    await dismissCanvaPopups(page);

    // Step 3: Isi email
    log('INPUT', `[2/6] Memasukkan email: ${email}`);
    const emailInput = page.locator('input[inputmode="email"], input[name="username"], input[type="email"], input[type="text"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill('');
    await emailInput.type(email, { delay: 30 });
    await wait(400);

    const continueBtn = page.locator('button[type="submit"], button:has-text("Lanjutkan"), button:has-text("Berikutnya"), button:has-text("Continue"), button:has-text("Next")').first();
    await continueBtn.click({ force: true });
    log('OK', 'Submit email terkirim, menganalisis respon Canva...');
    await wait(1800);

    // Cek error rate limit ("Server kami mengalami masalah")
    const errorBanner = page.locator('*:has-text("Server kami mengalami masalah"), *:has-text("Hubungi Tim Dukungan")').first();
    if (await errorBanner.isVisible({ timeout: 1000 }).catch(() => false)) {
      const bannerText = await errorBanner.innerText().catch(() => 'Server kami mengalami masalah');
      screenshotPath = await takeCanvaScreenshot(page, 'canva_signup_ratelimit', email);
      throw new Error(`CANVA_IP_BLOCKED: Canva membatasi IP Anda ("${bannerText.slice(0, 80)}"). Ganti IP / gunakan Proxy.`);
    }

    // Cek & auto-bypass pesan keamanan merah RMS/RRS
    if (await hasCanvaRmsSecurityError(page)) {
      const bypassed = await handleCanvaSecurityBackRetry(page, 'signup', 3);
      if (!bypassed) {
        screenshotPath = await takeCanvaScreenshot(page, 'canva_security_rrs_blocked', email);
        throw new Error('CANVA_SECURITY_BLOCKED: Karena alasan keamanan, kode verifikasi tidak dapat dikirim (RMS/RRS Block).');
      }
    }

    // Cek apakah email sudah terdaftar
    const pwdLoginInput = page.locator('input[type="password"]').first();
    if (await pwdLoginInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      screenshotPath = await takeCanvaScreenshot(page, 'canva_already_registered', email);
      throw new Error('AKUN_SUDAH_TERDAFTAR: Email ini sudah memiliki akun Canva. Gunakan fitur Reset Password Canva.');
    }

    // Cek apakah muncul form Nama terlebih dahulu atau langsung layar OTP
    const isOtpScreenReady = await page.evaluate(() => {
      const inps = Array.from(document.querySelectorAll("input[maxlength='1'], input[autocomplete='one-time-code'], input[inputmode='numeric']")).filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
      return inps.length > 0;
    }).catch(() => false);

    if (!isOtpScreenReady) {
      try {
        const nameInput = page.locator('input[name="name"], input[placeholder*="nama" i], input[placeholder*="name" i], input[type="text"]:not([inputmode="numeric"]):not([maxlength="1"])').first();
        if (await nameInput.isVisible({ timeout: 2500 }).catch(() => false)) {
          const usernamePart = email.split('@')[0];
          const displayName = usernamePart.charAt(0).toUpperCase() + usernamePart.slice(1);
          log('INPUT', `Mengisi nama lengkap: ${displayName}`);
          await nameInput.fill(displayName);
          await wait(400);
          const submitCreateBtn = page.locator('button[type="submit"], button:has-text("Lanjutkan"), button:has-text("Buat akun Anda"), button:has-text("Buat akun"), button:has-text("Continue")').first();
          if (await submitCreateBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
            await submitCreateBtn.click({ force: true });
            await wait(1500);
          }
        }
      } catch (_) {}
    }

    if (await hasCanvaRmsSecurityError(page)) {
      await handleCanvaSecurityBackRetry(page, 'signup', 3);
    }

    // Step 4: Polling OTP cepat (interval 1.5 detik) dari outlookreader.my.id dengan filter baseline
    log('OTP', `[3/6] Menunggu OTP Canva baru di inbox ${email} via outlookreader.my.id...`);
    let acceptedOtp = null;
    for (let otpLoop = 1; otpLoop <= 3; otpLoop++) {
      const otpResult = await waitForCanvaOtp(rawLine, 90, 1500, async (p) => {
        if (p.attempt % 3 === 0) {
          log('WAIT', `Polling OTP dari outlookreader (${p.elapsed}s/${p.maxWait}s)...`);
          if (await hasCanvaRmsSecurityError(page)) {
            log('WARN', '[AUTO-FIX] Pesan keamanan merah (RRS/RMS) Canva muncul saat menunggu OTP! Mengklik kembali & submit ulang...');
            await handleCanvaSecurityBackRetry(page, 'signup', 2);
          }
        }
      }, { baseline, excludeOtps: seenOtps, purpose: 'signup' });

      const currentOtp = otpResult.code;
      log('OK', `✓ Kode OTP Canva baru didapatkan: ${currentOtp}`);

      log('INPUT', `[4/6] Memasukkan 6-digit kode OTP (${currentOtp})...`);
      await fillCanvaOtpCode(page, currentOtp);
      await wait(2500);

      if (await detectCanvaOtpFailure(page)) {
        log('WARN', `Kode OTP ${currentOtp} ditolak/kedaluwarsa! Meminta kode baru...`);
        seenOtps.add(String(currentOtp));
        await requestFreshCanvaOtp(page);
        await wait(2000);
      } else {
        acceptedOtp = currentOtp;
        log('OK', `✓ Kode OTP signup ${currentOtp} diterima oleh Canva!`);
        break;
      }
    }

    if (!acceptedOtp) {
      throw new Error('Gagal verifikasi OTP signup setelah 3 percobaan.');
    }

    await wait(2500);

    // Step 5: Pasang Password jika form password tampil, atau onboarding skip
    try {
      const pwdInput = page.locator('input[type="password"], input[name="password"]').first();
      if (await pwdInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await pwdInput.fill(targetPassword);
        const submitPwd = page.locator('button[type="submit"], button:has-text("Simpan"), button:has-text("Lanjutkan"), button:has-text("Save"), button:has-text("Buat kata sandi")').first();
        if (await submitPwd.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitPwd.click({ force: true });
          await wait(2500);
        }
      }
    } catch (_) {}

    // Step 6: Onboarding skip
    try {
      for (let i = 0; i < 3; i++) {
        const maybeLater = page.locator('button:has-text("Nanti saja"), button:has-text("Maybe later"), button:has-text("Lewati"), button:has-text("Skip")').first();
        if (await maybeLater.isVisible({ timeout: 1500 }).catch(() => false)) {
          await maybeLater.click({ force: true });
          await wait(1200);
        } else {
          break;
        }
      }
    } catch (_) {}

    const finalUrl = page.url();
    log('SUCCESS', `🎉 AKUN CANVA BERHASIL DIDAFTARKAN! (${email})`);

    fs.appendFileSync(path.join(__dirname, 'akun_canva_terdaftar.txt'), `${email}|${targetPassword}
`, 'utf8');
    fs.appendFileSync(path.join(__dirname, 'akun_sukses.txt'), `${email}|${targetPassword}
`, 'utf8');

    console.log(`###TELE_CANVA_REGISTER_SUCCESS###${email}###${targetPassword}###${finalUrl}###`);

    return {
      success: true,
      email,
      password: targetPassword,
      otp: acceptedOtp,
      url: finalUrl
    };

  } catch (err) {
    if (!screenshotPath) {
      screenshotPath = await takeCanvaScreenshot(page, 'canva_signup_fail', email);
    }
    log('FAIL', `❌ Pendaftaran Canva gagal [${email}]: ${err.message}`);
    fs.appendFileSync(path.join(__dirname, 'akun_canva_gagal.txt'), `${email}|${err.message}
`, 'utf8');

    console.log(`###TELE_CANVA_GAGAL###${email}###${err.message}###${screenshotPath}###`);
    throw err;
  } finally {
    try {
      if (context) await context.close();
      if (browser) await browser.close();
    } catch (_) {}
  }
}

// ─── 2. RESET PASSWORD CANVA V2 (SESUAI ALUR CANVA_SIGNUP___RESET_PASSWORD_V2) ──
async function resetPasswordCanvaAccount(rawAccountLine, newPassword = '') {
  const parsed = parseAccountLine(rawAccountLine);
  if (!parsed) {
    throw new Error(`Format akun tidak valid: ${rawAccountLine}`);
  }

  const { email, rawLine } = parsed;
  const targetPassword = newPassword || process.env.CANVA_PASSWORD || process.env.canva_password || process.env.new_password || process.env.daftar_password || 'Bisnis2024!';

  log('RESET', `[1/5] Memulai reset password Canva V2 untuk: ${email} (Password baru: ${targetPassword})`);

  // Snapshot baseline inbox SEBELUM meminta OTP reset agar OTP lama dari signup diabaikan!
  const baseline = await captureCanvaBaseline(rawLine);
  const seenResetOtps = new Set(baseline.existingOtps || []);
  if (seenResetOtps.size > 0) {
    log('OTP', `Baseline inbox sebelum reset (mengabaikan OTP sebelumnya: ${[...seenResetOtps].join(', ')})`);
  }

  const { browser, context, page } = await launchCanvaBrowser();
  let screenshotPath = '';

  try {
    // Step 1: Buka halaman Reset Password Canva Indonesia (V2 URL)
    const resetUrls = [
      'https://www.canva.com/id_id/login/reset/',
      'https://www.canva.com/login/reset/'
    ];
    let opened = false;
    for (const rUrl of resetUrls) {
      try {
        log('NAVIGATE', `Membuka ${rUrl}...`);
        await page.goto(rUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await wait(2500);
        await dismissCanvaPopups(page);
        opened = true;
        break;
      } catch (_) {}
    }
    if (!opened) throw new Error('Tidak dapat membuka halaman reset password Canva.');

    // Step 2: Isi Email atau nomor telepon lalu klik Lanjutkan
    log('INPUT', `[2/5] Memasukkan email untuk reset: ${email}`);
    const emailInput = page.locator('input[placeholder*="Email" i], input[placeholder*="email" i], input[inputmode="email"], input[type="email"], input[type="text"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.fill('');
    await emailInput.type(email, { delay: 30 });
    await wait(400);

    const nextBtn = page.locator('button:has-text("Lanjutkan"), button:has-text("Berikutnya"), button:has-text("Continue"), button:has-text("Next"), button[type="submit"]').first();
    await nextBtn.click({ force: true });
    await wait(2000);

    // Step 3 (Alur V2): Canva menampilkan input "Kata sandi baru" & "Konfirmasikan kata sandi baru" SEBELUM kirim OTP!
    let pwdFilledBeforeOtp = false;
    try {
      const pwdInputs = page.locator('input[type="password"]');
      if (await pwdInputs.first().isVisible({ timeout: 6000 }).catch(() => false)) {
        const allPwds = await pwdInputs.all();
        log('INPUT', `[3/5] Mengisi Kata sandi baru & Konfirmasi (${allPwds.length} field)...`);
        for (const inp of allPwds) {
          await inp.fill('');
          await inp.type(targetPassword, { delay: 25 });
          await wait(200);
        }
        pwdFilledBeforeOtp = true;

        // Perbarui baseline tepat sebelum klik "Buat kata sandi"
        try {
          const preSubmitBase = await captureCanvaBaseline(rawLine);
          for (const c of (preSubmitBase.existingOtps || [])) seenResetOtps.add(String(c));
        } catch (_) {}

        const createPwdBtn = page.locator('button:has-text("Buat kata sandi"), button:has-text("Create password"), button:has-text("Reset password"), button:has-text("Set password"), button:has-text("Lanjutkan"), button[type="submit"]').first();
        await createPwdBtn.click({ force: true });
        log('OK', 'Tombol "Buat kata sandi" diklik! Menunggu pengiriman kode OTP dari Canva...');
        await wait(1800);
      }
    } catch (_) {}

    if (await hasCanvaRmsSecurityError(page)) {
      await handleCanvaSecurityBackRetry(page, 'password_reset', 3);
    }

    // Step 4: Polling OTP Reset terbaru (interval 1.5 detik) via outlookreader.my.id
    log('WAIT', `[4/5] Menunggu OTP reset password baru di inbox ${email} via outlookreader.my.id...`);
    let acceptedResetOtp = null;
    for (let resetLoop = 1; resetLoop <= 3; resetLoop++) {
      const resetResult = await waitForCanvaReset(rawLine, 90, 1500, (p) => {
        if (p.attempt % 4 === 0) {
          log('WAIT', `Polling OTP reset dari outlookreader (${p.elapsed}s/${p.maxWait}s)...`);
        }
      }, { baseline, excludeOtps: seenResetOtps, purpose: 'password_reset' });

      const currentCode = resetResult.code;
      log('OK', `✓ Kode OTP reset baru diterima: ${currentCode} (${resetResult.subject || 'Canva'})`);

      await fillCanvaOtpCode(page, currentCode);
      await wait(2000);

      if (await detectCanvaOtpFailure(page)) {
        log('WARN', `Kode OTP reset ${currentCode} ditolak/kedaluwarsa! Meminta kirim ulang...`);
        seenResetOtps.add(String(currentCode));
        await requestFreshCanvaOtp(page);
        await wait(2000);
      } else {
        acceptedResetOtp = currentCode;
        log('OK', `✓ Kode OTP reset ${currentCode} diterima!`);
        break;
      }
    }

    if (!acceptedResetOtp) {
      throw new Error('Gagal verifikasi OTP reset password setelah 3 percobaan.');
    }

    // Jika alur lama (password baru muncul setelah OTP), isi password sekarang
    if (!pwdFilledBeforeOtp) {
      try {
        if (await page.locator('input[type="password"]').first().isVisible({ timeout: 4000 }).catch(() => false)) {
          const allPwdInputs = await page.locator('input[type="password"]').all();
          for (const inp of allPwdInputs) {
            await inp.fill(targetPassword);
            await wait(200);
          }
        }
      } catch (_) {}
    }

    // Klik tombol Lanjutkan / Submit setelah OTP dimasukkan, lalu tombol Masuk ke akun Anda
    for (let attempt = 0; attempt < 6; attempt++) {
      const clickedTxt = await page.evaluate(() => {
        const targets = [
          'lanjutkan', 'continue', 'next', 'verifikasi', 'submit',
          'masuk ke akun anda', 'login ke akun anda', 'login sekarang',
          'masuk sekarang', 'log in to your account', 'log in now', 'selesai', 'done'
        ];
        const btns = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"], a'));
        for (const b of btns) {
          if (b.disabled || b.offsetParent === null) continue;
          const t = (b.innerText || b.textContent || b.value || '').trim().toLowerCase();
          if (targets.some(tg => t === tg || (t.includes(tg) && t.length < 35))) {
            b.click();
            return t;
          }
        }
        return null;
      }).catch(() => null);

      if (clickedTxt) {
        log('OK', `Klik tombol pasca-OTP: "${clickedTxt}"`);
        await wait(2000);
      } else {
        await wait(1000);
      }
      const curUrl = page.url().toLowerCase();
      if (!curUrl.includes('reset')) break;
    }

    log('SUCCESS', `🎉 PASSWORD CANVA BERHASIL DI-RESET: ${email} -> ${targetPassword}`);

    // Simpan ke file akun_canva_reset.txt & CANVA_SIGNUP___RESET_PASSWORD_V2/result/sukses_reset.txt
    fs.appendFileSync(path.join(__dirname, 'akun_canva_reset.txt'), `${email}|${targetPassword}
`, 'utf8');
    fs.appendFileSync(path.join(__dirname, 'akun_sukses.txt'), `${email}|${targetPassword}
`, 'utf8');

    console.log(`###TELE_CANVA_RESET_SUCCESS###${email}###${targetPassword}###`);

    return {
      success: true,
      email,
      newPassword: targetPassword
    };

  } catch (err) {
    if (!screenshotPath) {
      screenshotPath = await takeCanvaScreenshot(page, 'canva_reset_fail', email);
    }
    log('FAIL', `❌ Reset password Canva gagal [${email}]: ${err.message}`);
    fs.appendFileSync(path.join(__dirname, 'akun_canva_gagal.txt'), `${email}|Reset: ${err.message}
`, 'utf8');

    console.log(`###TELE_CANVA_GAGAL###${email}###${err.message}###${screenshotPath}###`);
    throw err;
  } finally {
    try {
      if (context) await context.close();
      if (browser) await browser.close();
    } catch (_) {}
  }
}

// ─── HELPER: KELUARKAN AKUN DARI FILE ANTREAN ──────────────────────────────
function removeAccountFromFile(filePath, targetEmail) {
  try {
    if (!fs.existsSync(filePath)) return;
    const cleanEmail = targetEmail.trim().toLowerCase();
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    const filtered = lines.filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      const parsed = parseAccountLine(trimmed);
      if (parsed && parsed.email.toLowerCase() === cleanEmail) return false;
      if (trimmed.toLowerCase().includes(cleanEmail)) return false;
      return true;
    });
    fs.writeFileSync(filePath, filtered.length > 0 ? filtered.join('\n') + '\n' : '', 'utf8');
    log('RECORD', `Akun ${cleanEmail} dikeluarkan dari antrean ${path.basename(filePath)}`);
  } catch (err) {
    log('WARN', `Gagal mengeluarkan akun ${targetEmail}: ${err.message}`);
  }
}

// ─── CLI RUNNER ──────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  let command = 'signup';
  let maxCount = 0;

  if (args.length > 0) {
    if (!isNaN(parseInt(args[0], 10)) && !args[0].includes('reset') && !args[0].includes('signup')) {
      // Jika argumen pertama adalah angka: node canva.js 5
      maxCount = parseInt(args[0], 10);
      command = (args[1] || process.env.CANVA_ACTION || 'signup').toLowerCase();
    } else {
      // Format biasa: node canva.js signup 5 ATAU node canva.js reset
      command = args[0].toLowerCase();
      if (args[1] && !isNaN(parseInt(args[1], 10))) {
        maxCount = parseInt(args[1], 10);
      }
    }
  } else {
    command = (process.env.CANVA_ACTION || 'signup').toLowerCase();
    maxCount = parseInt(process.env.CANVA_MAX || process.env.max_process || '0', 10) || 0;
  }
  const customPass = process.env.canva_password || process.env.new_password || process.env.daftar_password || 'masuk123';

  const accountsFile = process.env.CANVA_ACCOUNTS_FILE || path.join(__dirname, 'akun_canva.txt');
  if (!fs.existsSync(accountsFile)) {
    fs.writeFileSync(accountsFile, '', 'utf8');
    log('INFO', `File ${path.basename(accountsFile)} dibuat. Silakan isi dengan daftar akun Outlook (format: email|password|token|id atau email|password).`);
    return;
  }

  const rawLines = fs.readFileSync(accountsFile, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && l.includes('@'));

  if (rawLines.length === 0) {
    log('WARN', `Tidak ada akun di ${path.basename(accountsFile)} yang siap diproses.`);
    return;
  }

  const toProcess = (maxCount > 0) ? rawLines.slice(0, maxCount) : rawLines;
  log('INFO', `Memulai proses Canva mode: ${command.toUpperCase()} | Target: ${toProcess.length} akun (dari total ${rawLines.length})`);

  let sukses = 0, gagal = 0;
  for (let i = 0; i < toProcess.length; i++) {
    const line = toProcess[i];
    const parsed = parseAccountLine(line);
    const email = parsed ? parsed.email : line.split(/[:|]/)[0].trim();

    log('INFO', `------------------------------------------------------------`);
    log('INFO', `[${i + 1}/${toProcess.length}] Memproses akun: ${email}...`);

    try {
      if (command.includes('reset')) {
        await resetPasswordCanvaAccount(line, customPass);
      } else {
        await signupCanvaAccount(line, customPass);
      }
      sukses++;
      // Keluarkan akun dari file antrean jika sukses
      removeAccountFromFile(accountsFile, email);
    } catch (e) {
      gagal++;
      // Keluarkan juga dari file antrean agar tidak menghambat antrean
      removeAccountFromFile(accountsFile, email);
    }

    if (i < toProcess.length - 1) {
      log('WAIT', 'Jeda 4 detik sebelum akun berikutnya...');
      await wait(4000);
    }
  }

  log('INFO', `============================================================`);
  log('INFO', `Selesai: ${sukses} berhasil, ${gagal} gagal dari ${toProcess.length} akun.`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('[CANVA FATAL]', err);
    process.exit(1);
  });
}

module.exports = {
  signupCanvaAccount,
  resetPasswordCanvaAccount,
  launchCanvaBrowser
};
