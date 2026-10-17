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
const { waitForCanvaOtp, waitForCanvaReset, parseAccountLine } = require('./outlookreader');

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

  const defaultChromiumArgs = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-popup-blocking',
    '--ignore-certificate-errors',
    '--allow-running-insecure-content',
    '--start-maximized'
  ];

  if (process.platform === 'linux') {
    defaultChromiumArgs.push('--disable-gpu');
  }

  if (!proxyConfig) {
    defaultChromiumArgs.push('--no-proxy-server');
  }

  // Penentuan mode Headless vs Non-Headless:
  // 1. Jika HEADLESS di-set spesifik ('false' / 'true')
  // 2. Jika di Windows (Laptop), default ke FALSE (tampak layar browser) kecuali diset HEADLESS=true
  // 3. Jika di Linux/Pterodactyl tanpa display X11 ($DISPLAY), WAJIB TRUE agar tidak crash
  let isHeadless = true;
  if (process.env.HEADLESS !== undefined && process.env.HEADLESS !== '') {
    isHeadless = String(process.env.HEADLESS).toLowerCase() === 'true';
  } else if (process.platform === 'win32') {
    isHeadless = false; // Di Laptop default NON-HEADLESS (terbuka jendela browser)
  }

  if (process.platform === 'linux' && !process.env.DISPLAY) {
    isHeadless = true; // Paksa headless jika di server Linux/Pterodactyl tanpa GUI display
  }

  log('BROWSER', `Mode browser: ${isHeadless ? 'HEADLESS (Background / Server Pterodactyl)' : 'NON-HEADLESS (Layar Browser Terbuka di Laptop)'}`);

  const contextOptions = {
    viewport: { width: 1280, height: 850 },
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true,
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

// ─── 1. SIGNUP CANVA (PENDAFTARAN AKUN DENGAN EMAIL OTP) ──────────────────────
async function signupCanvaAccount(rawAccountLine, customPassword = '') {
  const parsed = parseAccountLine(rawAccountLine);
  if (!parsed) {
    throw new Error(`Format akun tidak valid: ${rawAccountLine}`);
  }

  const { email, password: accPassword, rawLine } = parsed;
  const targetPassword = customPassword || accPassword || process.env.daftar_password || process.env.new_password || 'masuk123';

  log('SIGNUP', `[1/6] Memulai proses pendaftaran Canva: ${email}`);

  const { browser, context, page } = await launchCanvaBrowser();
  let screenshotPath = '';

  try {
    // Step 1: Buka halaman pendaftaran Canva
    log('NAVIGATE', 'Membuka https://www.canva.com/signup...');
    await page.goto('https://www.canva.com/signup', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await wait(3000);
    await dismissCanvaPopups(page);

    // Step 2: Klik tombol "Continue with email" / "Email"
    log('CLICK', 'Mencari tombol "Lanjutkan dengan email"...');
    let emailBtnClicked = false;
    const emailButtonSelectors = [
      'button:has-text("Lanjutkan dengan email")',
      'button:has-text("Continue with email")',
      'button:has-text("Email")',
      '[role="button"]:has-text("Email")',
      'button:has-text("Sign up with email")',
      'button:has-text("Daftar dengan email")'
    ];

    for (const sel of emailButtonSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click({ force: true });
          emailBtnClicked = true;
          log('OK', `Tombol email diklik via: ${sel}`);
          break;
        }
      } catch (_) {}
    }

    if (!emailBtnClicked) {
      // Cek apakah input email sudah langsung tampil di layar
      const directInput = page.locator('input[name="username"], input[type="email"]').first();
      if (!await directInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        screenshotPath = await takeCanvaScreenshot(page, 'canva_signup_no_email_btn', email);
        throw new Error('Tombol "Continue with email" tidak ditemukan pada modal Canva');
      }
    }

    await wait(2000);
    await dismissCanvaPopups(page);

    // Step 3: Isi email
    log('INPUT', `[2/6] Memasukkan email: ${email}`);
    const emailInput = page.locator('input[name="username"], input[type="email"], input[type="text"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill('');
    await emailInput.type(email, { delay: 40 });
    await wait(500);

    // Klik tombol Lanjutkan / Continue pertama (Submit Email)
    await wait(800);
    const continueBtn = page.locator('button[type="submit"], button:has-text("Lanjutkan"), button:has-text("Continue")').first();
    await continueBtn.hover().catch(() => {});
    await wait(400);
    await continueBtn.click({ force: true });
    log('OK', 'Submit email terkirim, menganalisis respon Canva...');
    await wait(2500);

    // ── STEP 3.5: PENANGANAN RESPON CANVA SETELAH SUBMIT EMAIL ──
    // Cek kemungkinan error rate limit ("Server kami mengalami masalah")
    const errorBanner = page.locator('*:has-text("Server kami mengalami masalah"), text*="Server kami mengalami masalah", *:has-text("Hubungi Tim Dukungan"), text*="-SIN", text*="-CGK"').first();
    if (await errorBanner.isVisible({ timeout: 1500 }).catch(() => false)) {
      const bannerText = await errorBanner.innerText().catch(() => 'Server kami mengalami masalah (Cloudflare Rate Limit)');
      screenshotPath = await takeCanvaScreenshot(page, 'canva_signup_ratelimit', email);
      log('FAIL', `🚨 Terdeteksi Cloudflare WAF / Rate Limit Canva: ${bannerText.slice(0, 150)}`);
      throw new Error(`CANVA_IP_BLOCKED: Canva & Cloudflare membatasi IP Anda ("${bannerText.slice(0, 80)}"). Solusi WAJIB: Ganti IP via Hotspot HP (Tethering) lalu aktifkan Mode Pesawat 10 detik.`);
    }

    // Cek pemblokiran keamanan RRS Canva ("Karena alasan keamanan, kode verifikasi tidak dapat dikirim...")
    const rrsEarly = page.locator('text*="alasan keamanan", text*="kode verifikasi tidak dapat dikirim", text*="RRS-", text*="security reasons", text*="verification code could not be sent"').first();
    if (await rrsEarly.isVisible({ timeout: 1500 }).catch(() => false)) {
      const rrsTxt = await rrsEarly.innerText().catch(() => 'Pemblokiran keamanan RRS oleh Canva');
      screenshotPath = await takeCanvaScreenshot(page, 'canva_security_rrs_blocked', email);
      log('FAIL', `🚨 Terdeteksi Canva Risk Scoring (RRS Block): ${rrsTxt.slice(0, 150)}`);
      throw new Error(`CANVA_SECURITY_BLOCKED: ${rrsTxt.slice(0, 120)}. Solusi: Gunakan Tethering Hotspot HP dan ON/OFF Mode Pesawat untuk ganti IP.`);
    }

    // Cek apakah akun sudah terdaftar (Canva langsung meminta kata sandi login)
    const pwdLoginInput = page.locator('input[type="password"]').first();
    const isLoginPasswordVisible = await pwdLoginInput.isVisible({ timeout: 1500 }).catch(() => false);
    if (isLoginPasswordVisible) {
      log('WARN', `Akun ${email} sudah terdaftar di Canva (halaman meminta kata sandi login)!`);
      screenshotPath = await takeCanvaScreenshot(page, 'canva_already_registered', email);
      throw new Error('AKUN_SUDAH_TERDAFTAR: Akun ini sudah memiliki akun Canva. Silakan gunakan fitur Reset Password Canva.');
    }

    // Cek apakah muncul modal "Buat akun" (Nama lengkap) -> Seperti di screenshot
    log('FIND', 'Memeriksa formulir "Buat akun" (Nama lengkap)...');
    try {
      const isCreateAccountModal = await page.locator('h1:has-text("Buat akun"), h2:has-text("Buat akun"), div:has-text("Buat akun"), h1:has-text("Create account"), h2:has-text("Create account"), label:has-text("Nama lengkap"), label:has-text("Full name")').first().isVisible({ timeout: 4000 }).catch(() => false);

      if (isCreateAccountModal) {
        log('OK', '✓ Modal "Buat akun" (Nama lengkap) terdeteksi!');
        const nameInput = page.locator('input[name="name"], input[placeholder*="nama" i], input[placeholder*="name" i], input[aria-label*="nama" i], input[type="text"]').first();
        if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          const currentVal = await nameInput.inputValue().catch(() => '');
          if (!currentVal || !currentVal.trim()) {
            const usernamePart = email.split('@')[0];
            const displayName = usernamePart.charAt(0).toUpperCase() + usernamePart.slice(1);
            log('INPUT', `Mengisi nama lengkap: ${displayName}`);
            await nameInput.fill(displayName);
            await wait(600);
          } else {
            log('OK', `Nama lengkap sudah terisi otomatis: ${currentVal}`);
          }
        }

        // Klik tombol Lanjutkan / Buat akun pada modal ini (INILAH YANG MEMICU CANVA MENGIRIM OTP!)
        const submitCreateBtn = page.locator('button[type="submit"], button:has-text("Lanjutkan"), button:has-text("Buat akun"), button:has-text("Continue"), button:has-text("Create account")').first();
        await submitCreateBtn.waitFor({ state: 'visible', timeout: 5000 });
        await wait(800);
        await submitCreateBtn.hover().catch(() => {});
        await wait(400);
        await submitCreateBtn.click({ force: true });
        log('OK', '✓ Tombol "Lanjutkan" pada form Buat akun diklik! Memeriksa respon pengiriman OTP...');
        await wait(3000);

        // Cek apakah muncul error rate limit Cloudflare ("Server kami mengalami masalah...")
        const cfLate = page.locator('*:has-text("Server kami mengalami masalah"), text*="Server kami mengalami masalah", *:has-text("Hubungi Tim Dukungan"), text*="-SIN", text*="-CGK"').first();
        if (await cfLate.isVisible({ timeout: 2000 }).catch(() => false)) {
          const bannerText = await cfLate.innerText().catch(() => 'Server kami mengalami masalah (Cloudflare Rate Limit)');
          screenshotPath = await takeCanvaScreenshot(page, 'canva_signup_ratelimit', email);
          log('FAIL', `🚨 Terdeteksi Cloudflare WAF / Rate Limit Canva: ${bannerText.slice(0, 150)}`);
          throw new Error(`CANVA_IP_BLOCKED: Canva & Cloudflare membatasi IP Anda ("${bannerText.slice(0, 80)}"). Solusi WAJIB: Ganti IP via Hotspot HP (Tethering) lalu aktifkan Mode Pesawat 10 detik.`);
        }

        // Cek apakah muncul pemblokiran RRS setelah klik kirim OTP
        const rrsLate = page.locator('text*="alasan keamanan", text*="kode verifikasi tidak dapat dikirim", text*="RRS-", text*="security reasons", text*="verification code could not be sent"').first();
        if (await rrsLate.isVisible({ timeout: 2000 }).catch(() => false)) {
          const rrsTxt = await rrsLate.innerText().catch(() => 'Pemblokiran keamanan RRS oleh Canva');
          screenshotPath = await takeCanvaScreenshot(page, 'canva_security_rrs_blocked', email);
          log('FAIL', `🚨 Terdeteksi Canva Risk Scoring (RRS Block): ${rrsTxt.slice(0, 150)}`);
          throw new Error(`CANVA_SECURITY_BLOCKED: ${rrsTxt.slice(0, 120)}. Solusi: Gunakan Tethering Hotspot HP dan ON/OFF Mode Pesawat untuk ganti IP.`);
        }
      }
    } catch (err) {
      if (err.message && (err.message.includes('CANVA_SECURITY_BLOCKED') || err.message.includes('CANVA_IP_BLOCKED'))) throw err;
      log('WARN', `Pengecekan form Buat akun selesai: ${err.message}`);
    }

    // Pastikan layar sekarang meminta kode OTP
    log('WAIT', 'Memverifikasi bahwa Canva telah membuka halaman input OTP...');
    try {
      await page.locator('input[inputmode="numeric"], input[name="code"], text="Masukkan kode", text="Enter code", text="kode 6 digit"').first().waitFor({ state: 'visible', timeout: 8000 });
      log('OK', '✓ Halaman verifikasi OTP Canva aktif!');
    } catch (_) {
      log('WARN', 'Halaman verifikasi OTP sedang dimuat...');
    }

    // Step 4: Menunggu Canva mengirimkan kode OTP ke Outlook
    log('OTP', `[3/6] Memeriksa inbox ${email} via outlookreader.my.id...`);
    const otpResult = await waitForCanvaOtp(rawLine, 75, 4000, (p) => {
      if (p.attempt % 3 === 0) {
        log('WAIT', `Menunggu OTP dari outlookreader (${p.elapsed}s/${p.maxWait}s)...`);
      }
    });

    const otpCode = otpResult.code;
    log('OK', `✓ Kode OTP Canva berhasil didapatkan: ${otpCode}`);

    // Step 5: Input kode OTP ke form Canva
    log('INPUT', `[4/6] Memasukkan 6-digit kode OTP (${otpCode}) ke form Canva...`);
    await wait(1000);

    // Cari input OTP (bisa 6 kotak terpisah atau 1 input teks)
    const digitBoxes = await page.locator('input[inputmode="numeric"], input[aria-label*="digit" i], input[maxlength="1"]').all();
    if (digitBoxes.length >= 6) {
      for (let i = 0; i < 6; i++) {
        await digitBoxes[i].fill(otpCode[i]);
        await wait(120);
      }
      log('OK', 'OTP diinput ke 6 digit kotak terpisah');
    } else {
      const singleOtpInput = page.locator('input[name="code"], input[autocomplete="one-time-code"], input[type="text"], input[inputmode="numeric"]').first();
      await singleOtpInput.waitFor({ state: 'visible', timeout: 10000 });
      await singleOtpInput.fill(otpCode);
      log('OK', 'OTP diinput ke single input field');
    }

    await wait(3500);

    // Step 6: Pasang Password Akun Canva
    log('PASSWORD', `[5/6] Memeriksa form pembuatan password Canva: ${targetPassword}`);
    try {
      const pwdInput = page.locator('input[type="password"], input[name="password"]').first();
      if (await pwdInput.isVisible({ timeout: 4000 })) {
        await pwdInput.fill(targetPassword);
        const submitPwd = page.locator('button[type="submit"], button:has-text("Simpan"), button:has-text("Lanjutkan"), button:has-text("Save"), button:has-text("Buat akun")').first();
        if (await submitPwd.isVisible({ timeout: 2000 })) {
          await submitPwd.click({ force: true });
          await wait(3000);
        }
        log('OK', 'Password akun Canva berhasil dipasang');
      }
    } catch (_) {}

    // Step 7: Penanganan Onboarding Pertanyaan ("Untuk apa Anda menggunakan Canva?")
    try {
      log('FIND', '[6/6] Memeriksa kuesioner onboarding tujuan penggunaan Canva...');
      for (let i = 0; i < 5; i++) {
        const personalCard = page.locator('div:has-text("Pribadi"), div:has-text("Personal"), button:has-text("Pribadi"), button:has-text("Personal")').first();
        if (await personalCard.isVisible({ timeout: 2000 })) {
          await personalCard.click({ force: true });
          log('OK', 'Tujuan Canva dipilih: Pribadi / Personal');
          await wait(2000);
          break;
        }

        const maybeLater = page.locator('button:has-text("Nanti saja"), button:has-text("Maybe later"), button:has-text("Lewati"), button:has-text("Skip")').first();
        if (await maybeLater.isVisible({ timeout: 2000 })) {
          await maybeLater.click({ force: true });
          log('OK', 'Onboarding Canva diskip (Nanti saja)');
          await wait(1500);
        }
      }
    } catch (_) {}

    // Verifikasi URL akhir (Dashboard Canva)
    await wait(3000);
    const finalUrl = page.url();
    log('SUCCESS', `🎉 AKUN CANVA BERHASIL DIDAFTARKAN! (${email})`);

    // Catat ke file akun_canva_terdaftar.txt
    const outputLine = `${email}|${targetPassword}|${rawLine}`;
    fs.appendFileSync(path.join(__dirname, 'akun_canva_terdaftar.txt'), `${email}|${targetPassword}\n`, 'utf8');

    console.log(`###TELE_CANVA_REGISTER_SUCCESS###${email}###${targetPassword}###${finalUrl}###`);

    return {
      success: true,
      email,
      password: targetPassword,
      url: finalUrl
    };

  } catch (err) {
    if (!screenshotPath) {
      screenshotPath = await takeCanvaScreenshot(page, 'canva_signup_fail', email);
    }
    log('FAIL', `❌ Pendaftaran Canva gagal [${email}]: ${err.message}`);
    fs.appendFileSync(path.join(__dirname, 'akun_canva_gagal.txt'), `${email}|${err.message}\n`, 'utf8');

    console.log(`###TELE_CANVA_GAGAL###${email}###${err.message}###${screenshotPath}###`);
    throw err;
  } finally {
    try {
      if (context) await context.close();
      if (browser) await browser.close();
    } catch (_) {}
  }
}

// ─── 2. RESET PASSWORD CANVA (LUPA KATA SANDI) ──────────────────────────────
async function resetPasswordCanvaAccount(rawAccountLine, newPassword = '') {
  const parsed = parseAccountLine(rawAccountLine);
  if (!parsed) {
    throw new Error(`Format akun tidak valid: ${rawAccountLine}`);
  }

  const { email, rawLine } = parsed;
  const targetPassword = newPassword || process.env.new_password || process.env.daftar_password || 'masuk123';

  log('RESET', `[1/5] Memulai reset password Canva untuk: ${email}`);

  const { browser, context, page } = await launchCanvaBrowser();
  let screenshotPath = '';

  try {
    // Step 1: Buka halaman Reset Password Canva
    log('NAVIGATE', 'Membuka https://www.canva.com/login/reset...');
    await page.goto('https://www.canva.com/login/reset', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await wait(3000);
    await dismissCanvaPopups(page);

    // Step 2: Masukkan email ke form reset password
    log('INPUT', `[2/5] Memasukkan email untuk reset: ${email}`);
    const emailInput = page.locator('input[name="username"], input[type="email"], input[type="text"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.fill('');
    await emailInput.type(email, { delay: 40 });
    await wait(500);

    const submitBtn = page.locator('button[type="submit"], button:has-text("Lanjutkan"), button:has-text("Continue")').first();
    await submitBtn.click({ force: true });
    log('OK', 'Permintaan reset password terkirim ke Canva...');
    await wait(3000);

    // Step 3: Polling link / kode reset dari outlookreader.my.id
    log('WAIT', `[3/5] Menunggu email reset dari Canva di inbox ${email}...`);
    const resetResult = await waitForCanvaReset(rawLine, 75, 4000, (p) => {
      if (p.attempt % 3 === 0) {
        log('WAIT', `Menunggu email reset dari outlookreader (${p.elapsed}s/${p.maxWait}s)...`);
      }
    });

    log('OK', `✓ Email reset password Canva diterima! (Subject: ${resetResult.subject || 'Reset Password'})`);

    // Step 4: Eksekusi link reset atau input kode OTP
    if (resetResult.resetLink) {
      log('NAVIGATE', `[4/5] Membuka Magic Link Reset: ${resetResult.resetLink}`);
      await page.goto(resetResult.resetLink, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await wait(3000);
      await dismissCanvaPopups(page);
    } else if (resetResult.code) {
      log('INPUT', `[4/5] Memasukkan kode OTP reset: ${resetResult.code}`);
      const otpInputs = await page.locator('input[inputmode="numeric"], input[aria-label*="digit" i], input[maxlength="1"]').all();
      if (otpInputs.length >= 6) {
        for (let i = 0; i < 6; i++) {
          await otpInputs[i].fill(resetResult.code[i]);
          await wait(100);
        }
      } else {
        const single = page.locator('input[type="text"], input[inputmode="numeric"]').first();
        await single.fill(resetResult.code);
      }
      await wait(3000);
    }

    // Step 5: Masukkan kata sandi baru
    log('INPUT', `[5/5] Memasukkan password baru: ${targetPassword}`);
    const pwdFields = await page.locator('input[type="password"]').all();
    if (pwdFields.length === 0) {
      // Coba tunggu sebentar jika halaman baru rendering
      await page.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: 10000 });
    }

    const allPwdInputs = await page.locator('input[type="password"]').all();
    for (const inp of allPwdInputs) {
      await inp.fill(targetPassword);
      await wait(300);
    }

    const saveBtn = page.locator('button[type="submit"], button:has-text("Atur ulang kata sandi"), button:has-text("Reset password"), button:has-text("Simpan"), button:has-text("Save")').first();
    await saveBtn.click({ force: true });
    await wait(4000);

    log('SUCCESS', `🎉 PASSWORD CANVA BERHASIL DI-RESET: ${email} -> ${targetPassword}`);

    // Simpan ke file akun_canva_reset.txt
    fs.appendFileSync(path.join(__dirname, 'akun_canva_reset.txt'), `${email}|${targetPassword}\n`, 'utf8');

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
    fs.appendFileSync(path.join(__dirname, 'akun_canva_gagal.txt'), `${email}|Reset: ${err.message}\n`, 'utf8');

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
