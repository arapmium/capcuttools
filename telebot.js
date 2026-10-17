const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// Arahkan Playwright ke folder yang bisa ditulis (penting untuk Pterodactyl/Docker)
if (process.platform === 'linux') {
    const browserDir = path.join(__dirname, '.browsers');
    process.env.PLAYWRIGHT_BROWSERS_PATH = browserDir;
    if (!fs.existsSync(browserDir)) fs.mkdirSync(browserDir, { recursive: true });
    // Fix ENOSPC: arahkan temp juga ke folder yang bisa ditulis
    const tmpDir = path.join(__dirname, '.tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    process.env.TMPDIR = tmpDir;
    process.env.TEMP = tmpDir;
    process.env.TMP = tmpDir;
}

// ─── 1. AUTO INSTALLER ──────────────────────────────────────────────────────
console.log('');
console.log('======================================================');
console.log('         PUSAT KENDALI BOT CAPCUT VIA TELEGRAM         ');
console.log('======================================================');
console.log('');
console.log('[AUTO-INSTALL] Memeriksa modul...');

const requiredModules = {
    'telegraf': 'telegraf',
    'dotenv': 'dotenv',
    'chalk': 'chalk@4',
    'playwright': 'playwright',
};

for (const [modName, installName] of Object.entries(requiredModules)) {
    try {
        require.resolve(modName);
        console.log(`[AUTO-INSTALL] ✓ ${modName} sudah terinstal.`);
    } catch (e) {
        console.log(`[AUTO-INSTALL] ✗ ${modName} belum ada. Menginstal ${installName}...`);
        try {
            execSync(`npm install ${installName} --save`, { stdio: 'inherit', cwd: __dirname });
            console.log(`[AUTO-INSTALL] ✓ ${modName} berhasil diinstal.`);
        } catch (installErr) {
            console.error(`[AUTO-INSTALL] GAGAL menginstal ${modName}: ${installErr.message}`);
        }
    }
}

// Load .env di awal agar konfigurasi browser, proxy, dan token terbaca sejak awal
require('dotenv').config({ path: path.join(__dirname, '.env') });

const customBrowserPath = (process.env.browser_path || process.env.BROWSER_PATH || '').trim();
const prefBrowser = (process.env.browser || process.env.BROWSER || 'auto').trim().toLowerCase();

// Cari browser di sistem (Linux / Pterodactyl)
if (process.platform === 'linux') {
    console.log('[AUTO-INSTALL] Memeriksa browser di sistem Linux/Pterodactyl...');

    let foundBrowser = null;

    // 1. Cek jika user menyetel custom path (browser_path / BROWSER_PATH)
    if (customBrowserPath && fs.existsSync(customBrowserPath)) {
        foundBrowser = customBrowserPath;
        console.log(`[AUTO-INSTALL] ✓ Menggunakan custom browser path: ${foundBrowser}`);
        process.env.CHROME_PATH = foundBrowser;
    } else {
        // 2. Cek browser sistem yang terinstal di Linux
        const systemBrowserPaths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/opera',
            '/usr/lib/opera/opera',
            '/usr/bin/brave-browser',
            '/usr/bin/microsoft-edge',
            '/usr/bin/firefox',
        ];

        for (const bp of systemBrowserPaths) {
            if (fs.existsSync(bp)) {
                foundBrowser = bp;
                break;
            }
        }

        // Coba juga dengan perintah `which`
        if (!foundBrowser) {
            for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'opera', 'brave-browser', 'microsoft-edge', 'firefox']) {
                try {
                    const result = execSync(`which ${name} 2>/dev/null`, { encoding: 'utf8', timeout: 3000 }).trim();
                    if (result && fs.existsSync(result)) {
                        foundBrowser = result;
                        break;
                    }
                } catch (_) {}
            }
        }

        if (foundBrowser) {
            console.log(`[AUTO-INSTALL] ✓ Browser sistem ditemukan: ${foundBrowser}`);
            process.env.CHROME_PATH = foundBrowser;
        } else {
            // 3. Cek apakah browser Playwright bawaan sudah pernah diunduh
            let playwrightOk = false;
            try {
                const checkResult = execSync(
                    'node -e "const {chromium}=require(\'playwright\');console.log(chromium.executablePath())"',
                    { cwd: __dirname, timeout: 10000, encoding: 'utf8', env: { ...process.env } }
                ).trim();
                if (checkResult && fs.existsSync(checkResult)) {
                    console.log(`[AUTO-INSTALL] ✓ Playwright Chromium tersedia: ${checkResult}`);
                    playwrightOk = true;
                }
            } catch (_) {}

            if (!playwrightOk) {
                console.log('[AUTO-INSTALL] Browser sistem belum ditemukan.');
                console.log('[AUTO-INSTALL] Memulai auto-install browser Chromium Playwright (~180MB)...');
                try {
                    execSync('npx playwright install chromium', {
                        stdio: 'inherit',
                        cwd: __dirname,
                        env: { ...process.env },
                    });
                    console.log('[AUTO-INSTALL] ✓ Browser berhasil diunduh dan siap digunakan!');
                } catch (dlErr) {
                    console.log('[WARN] Gagal mengunduh Chromium via npx: ' + dlErr.message);
                    console.log('[WARN] Bot akan mencoba jalan dengan engine Playwright yang tersedia.');
                }
            }
        }
    }
} else {
    console.log('[AUTO-INSTALL] Windows terdeteksi. Browser lokal akan dideteksi oleh index.js.');
}

// ─── 2. LOAD TELEGRAF ───────────────────────────────────────────────────────
const { Telegraf, Markup } = require('telegraf');

const token = process.env.TELEGRAM_TOKEN;

if (!token || token.includes('MASUKAN_TOKEN')) {
    console.error('');
    console.error('====================================================');
    console.error(' ERROR: TELEGRAM_TOKEN belum diatur di file .env!');
    console.error(' Buka file .env dan isi token dari @BotFather.');
    console.error('====================================================');
    console.error('');
    console.log('Menunggu 30 detik sebelum keluar...');
    setTimeout(() => process.exit(1), 30000);
} else {
    mulaiBot();
}

// ─── 3. FUNGSI UTAMA BOT TELEGRAM ───────────────────────────────────────────
function mulaiBot() {
    const bot = new Telegraf(token);

    let botProcess = null;
    let logBuffer = [];
    const MAX_LOG = 30;
    const userState = {};
    const pendingInput = {};

    function addLog(line) {
        logBuffer.push(line);
        if (logBuffer.length > MAX_LOG) logBuffer.shift();
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function getBrowserMode() {
        const m = (process.env.browser_mode || 'incognito').trim().toLowerCase();
        return (m === 'biasa' || m === 'normal') ? 'biasa' : 'incognito';
    }

    function setEnvValue(key, val) {
        const envPath = path.join(__dirname, '.env');
        try {
            let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(content)) {
                content = content.replace(regex, `${key}=${val}`);
            } else {
                if (content && !content.endsWith('\n')) content += '\n';
                content += `${key}=${val}\n`;
            }
            fs.writeFileSync(envPath, content, 'utf8');
        } catch (e) {
            console.error(`[ENV] Gagal menyimpan ${key}=${val}:`, e.message);
        }
        process.env[key] = val;
    }

    // ── Inline Keyboard: MENU UTAMA (Pilih Kategori Platform) ──
    function mainMenu() {
        const mode = getBrowserMode();
        const modeLabel = mode === 'biasa' ? '🌐 Biasa' : '🕵️ Incognito';
        return Markup.inlineKeyboard([
            [
                Markup.button.callback('🎬 Menu CapCut Automation', 'open_menu_capcut'),
            ],
            [
                Markup.button.callback('🎨 Menu Canva Automation', 'open_menu_canva'),
            ],
            [
                Markup.button.callback(`🌐 Mode: ${modeLabel}`, 'menu_browser_mode'),
                Markup.button.callback('🔄 Restart Server', 'menu_restart_server'),
            ],
            [
                Markup.button.callback('ℹ️ Status Bot', 'status'),
                Markup.button.callback('📋 Lihat Log Terakhir', 'view_log'),
            ],
            [
                Markup.button.callback('🛑 Hentikan Bot', 'stop_bot'),
            ],
        ]);
    }

    // ── Inline Keyboard: KELOMPOK MENU CAPCUT ──
    function capcutMenu() {
        return Markup.inlineKeyboard([
            [
                Markup.button.callback('👥 Mulai TEAM (5 Seats)', 'plan_team'),
                Markup.button.callback('💎 Mulai PRO (7 Hari)', 'plan_pro'),
            ],
            [
                Markup.button.callback('✨ Daftar Akun CapCut Baru', 'menu_daftar_capcut'),
            ],
            [
                Markup.button.callback('✨ Daftar + Join Tim', 'menu_daftar_join'),
                Markup.button.callback('🔑 Masuk + Join Tim', 'menu_login_join'),
            ],
            [
                Markup.button.callback('🔗 Kaitkan Email Saja', 'plan_bind'),
                Markup.button.callback('🔑 Reset Sandi CapCut', 'menu_reset_password'),
            ],
            [
                Markup.button.callback('📝 Input Akun GSuite', 'menu_input_gsuite'),
                Markup.button.callback('📂 Kelola Akun GSuite', 'view_gsuite'),
            ],
            [
                Markup.button.callback('📄 Hasil (result.txt)', 'view_result'),
                Markup.button.callback('📁 Akun Terdaftar', 'view_daftar'),
            ],
            [
                Markup.button.callback('👥 Akun Join Tim', 'view_join_tim'),
                Markup.button.callback('📑 Lihat Akun Terkait', 'view_terkait'),
            ],
            [
                Markup.button.callback('🔐 Akun Ter-Reset', 'view_reset'),
                Markup.button.callback('❌ Lihat Akun Gagal', 'view_gagal'),
            ],
            [
                Markup.button.callback('🛑 Hentikan Bot', 'stop_bot'),
                Markup.button.callback('🏠 Menu Utama', 'back_menu'),
            ],
        ]);
    }

    // ── Inline Keyboard: KELOMPOK MENU CANVA ──
    function canvaMenu() {
        return Markup.inlineKeyboard([
            [
                Markup.button.callback('🎨 Daftar Akun Canva Baru', 'menu_canva_daftar'),
                Markup.button.callback('🔑 Reset Sandi Canva', 'menu_canva_reset'),
            ],
            [
                Markup.button.callback('📝 Input Akun Outlook', 'menu_input_canva'),
                Markup.button.callback('📥 Download Antrean', 'download_canva_queue'),
            ],
            [
                Markup.button.callback('📁 Canva Terdaftar', 'view_canva_terdaftar'),
                Markup.button.callback('🔐 Canva Ter-Reset', 'view_canva_reset'),
            ],
            [
                Markup.button.callback('❌ Canva Gagal', 'view_canva_gagal'),
                Markup.button.callback('🗑️ Bersihkan Antrean', 'clear_canva_queue'),
            ],
            [
                Markup.button.callback('🛑 Hentikan Bot', 'stop_bot'),
                Markup.button.callback('🏠 Menu Utama', 'back_menu'),
            ],
        ]);
    }

    function countLinesWithAt(filePath) {
        if (!fs.existsSync(filePath)) return 0;
        return fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@')).length;
    }

    function countNonEmptyLines(filePath) {
        if (!fs.existsSync(filePath)) return 0;
        return fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim()).length;
    }

    function sendCapcutHub(ctx) {
        delete userState[ctx.chat.id];
        delete pendingInput[ctx.chat.id];

        const gsuiteCount = countLinesWithAt(path.join(__dirname, 'gsuite'));
        const doneCount = countLinesWithAt(path.join(__dirname, 'akun_sudah_login'));
        const resultCount = countNonEmptyLines(path.join(__dirname, 'result.txt'));
        const regCount = countLinesWithAt(path.join(__dirname, 'akun_terdaftar.txt'));
        const joinCount = countLinesWithAt(path.join(__dirname, 'akun_join_tim.txt'));
        const boundCount = countLinesWithAt(path.join(__dirname, 'akun_terkait.txt'));
        const resetCount = countLinesWithAt(path.join(__dirname, 'akun_reset_password.txt'));
        const failCount = countNonEmptyLines(path.join(__dirname, 'akun_gagal.txt'));

        const msg =
            `🎬 <b>PUSAT KENDALI OTOMATISASI CAPCUT</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📊 <b>Ringkasan Data & Antrean CapCut:</b>\n` +
            `• 📂 <b>Antrean GSuite:</b> <b>${gsuiteCount} akun</b> <i>(Selesai: ${doneCount})</i>\n` +
            `• 💳 <b>Hasil Cashier (result.txt):</b> <b>${resultCount} link</b>\n` +
            `• ✨ <b>Akun Baru Terdaftar:</b> <b>${regCount} akun</b>\n` +
            `• 👥 <b>Akun Join Tim:</b> <b>${joinCount} akun</b>\n` +
            `• 🔗 <b>Akun Terkait Email:</b> <b>${boundCount} akun</b>\n` +
            `• 🔐 <b>Akun Ter-Reset Sandi:</b> <b>${resetCount} akun</b>\n` +
            `• ❌ <b>Akun Gagal:</b> <b>${failCount} akun</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Pilih fitur otomatisasi CapCut di bawah ini:`;

        return ctx.reply(msg, { parse_mode: 'HTML', ...capcutMenu() });
    }

    function sendCanvaHub(ctx) {
        delete userState[ctx.chat.id];
        delete pendingInput[ctx.chat.id];

        const queueCount = countLinesWithAt(path.join(__dirname, 'akun_canva.txt'));
        const regCount = countLinesWithAt(path.join(__dirname, 'akun_canva_terdaftar.txt'));
        const resetCount = countLinesWithAt(path.join(__dirname, 'akun_canva_reset.txt'));
        const failCount = countNonEmptyLines(path.join(__dirname, 'akun_canva_gagal.txt'));

        const msg =
            `🎨 <b>PUSAT KENDALI OTOMATISASI CANVA</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📊 <b>Ringkasan Data & Antrean Canva (Outlook):</b>\n` +
            `• 📂 <b>Antrean Outlook (akun_canva.txt):</b> <b>${queueCount} akun</b>\n` +
            `• 🎨 <b>Canva Terdaftar:</b> <b>${regCount} akun</b>\n` +
            `• 🔐 <b>Canva Ter-Reset Sandi:</b> <b>${resetCount} akun</b>\n` +
            `• ❌ <b>Canva Gagal:</b> <b>${failCount} akun</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Pilih fitur otomatisasi Canva di bawah ini:`;

        return ctx.reply(msg, { parse_mode: 'HTML', ...canvaMenu() });
    }

    // ── /start ──
    bot.start((ctx) => {
        delete userState[ctx.chat.id];
        delete pendingInput[ctx.chat.id];
        const name = ctx.from.first_name || 'User';
        ctx.reply(
            `Halo <b>${escapeHtml(name)}</b>! 👋\n` +
            `Selamat datang di <b>Pusat Kendali Bot Automation</b>.\n\n` +
            `Silakan pilih kategori layanan yang ingin Anda kelola:\n` +
            `🎬 <b>Menu CapCut Automation</b> — Checkout Cashier (Team/Pro), Daftar Akun ArapMium, Join Tim, Bind & Reset Password CapCut.\n` +
            `🎨 <b>Menu Canva Automation</b> — Daftar Akun Canva & Reset Password via Outlook OTP.\n\n` +
            `Pilih menu di bawah ini:`,
            { parse_mode: 'HTML', ...mainMenu() }
        );
    });

    // ── /menu ──
    bot.command('menu', (ctx) => {
        delete userState[ctx.chat.id];
        delete pendingInput[ctx.chat.id];
        ctx.reply('🏠 <b>Menu Utama Pusat Kendali</b>\nSilakan pilih platform atau pengaturan:', { parse_mode: 'HTML', ...mainMenu() });
    });

    // ── /capcut & callback open_menu_capcut ──
    bot.command('capcut', (ctx) => sendCapcutHub(ctx));
    bot.action('open_menu_capcut', async (ctx) => {
        await ctx.answerCbQuery();
        sendCapcutHub(ctx);
    });

    // ── /canva & callback open_menu_canva ──
    bot.command('canva', (ctx) => sendCanvaHub(ctx));
    bot.action('open_menu_canva', async (ctx) => {
        await ctx.answerCbQuery();
        sendCanvaHub(ctx);
    });

    // ── /daftar & /register ──
    bot.command(['daftar', 'register'], (ctx) => {
        delete userState[ctx.chat.id];
        delete pendingInput[ctx.chat.id];

        const registeredPath = path.join(__dirname, 'akun_terdaftar.txt');
        const regCount = fs.existsSync(registeredPath)
            ? fs.readFileSync(registeredPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@')).length
            : 0;

        const defaultPass = process.env.daftar_password || process.env.DAFTAR_PASSWORD || process.env.password_capcut || 'masuk123';
        const domain = process.env.tmail_domain || 'arapmium.web.id';

        const text =
            `✨ <b>DAFTAR AKUN CAPCUT BARU (EMAIL ARAPMIUM)</b>\n\n` +
            `Fitur ini secara otomatis membuat akun CapCut baru melalui opsi <b>"Continue with email"</b> menggunakan email temporary <code>@${escapeHtml(domain)}</code> + password.\n\n` +
            `• <b>Default Password:</b> <code>${escapeHtml(defaultPass)}</code>\n` +
            `• <b>Format Output:</b> <code>email|password</code>\n` +
            `• <b>File Database:</b> <code>akun_terdaftar.txt</code> (Total saat ini: <b>${regCount} akun</b>)\n\n` +
            `<b>Pilih jumlah akun yang ingin didaftarkan (Maksimal 5 akun):</b>`;

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('1️⃣ 1 Akun', 'run_register_1'),
                Markup.button.callback('2️⃣ 2 Akun', 'run_register_2'),
                Markup.button.callback('3️⃣ 3 Akun', 'run_register_3'),
            ],
            [
                Markup.button.callback('4️⃣ 4 Akun', 'run_register_4'),
                Markup.button.callback('5️⃣ 5 Akun', 'run_register_5'),
            ],
            [
                Markup.button.callback('📁 Lihat Akun Terdaftar', 'view_daftar'),
                Markup.button.callback('📥 Download .txt', 'download_daftar'),
            ],
            [
                Markup.button.callback('🎬 Menu CapCut', 'open_menu_capcut'),
                Markup.button.callback('🏠 Menu Utama', 'back_menu')
            ]
        ]);

        ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
    });

    // ── /daftar_join ──
    bot.command('daftar_join', (ctx) => {
        delete userState[ctx.chat.id];
        delete pendingInput[ctx.chat.id];
        userState[ctx.chat.id] = { step: 'waiting_join_link_daftar' };
        ctx.reply(
            `✨ <b>DAFTAR AKUN BARU + JOIN TIM CAPCUT</b>\n\n` +
            `Fitur ini secara otomatis:\n` +
            `1️⃣ Mendaftarkan akun CapCut baru dengan email temporary <code>@${escapeHtml(process.env.tmail_domain || 'arapmium.web.id')}</code> + password.\n` +
            `2️⃣ Menyimpan data akun ke <code>akun_terdaftar.txt</code> (format: <code>email|password</code>).\n` +
            `3️⃣ Membuka link undangan tim dan otomatis klik <b>Submit / Join space</b>.\n` +
            `4️⃣ Mencatat riwayat join ke <code>akun_join_tim.txt</code>.\n\n` +
            `🔗 <b>Silakan kirimkan Link Undangan / Join Tim CapCut Anda:</b>\n` +
            `<i>Contoh:</i> <code>https://www.capcut.com/sv2/ZS9DUNV6BxA7W-hcWGC</code>\n\n` +
            `<i>Ketik link di chat atau kirim /cancel untuk batal.</i>`,
            { parse_mode: 'HTML' }
        );
    });

    // ── /login_join ──
    bot.command('login_join', (ctx) => {
        delete userState[ctx.chat.id];
        delete pendingInput[ctx.chat.id];
        userState[ctx.chat.id] = { step: 'waiting_join_link_login' };
        ctx.reply(
            `🔑 <b>MASUK (LOGIN) + JOIN TIM CAPCUT</b>\n\n` +
            `Fitur ini menggunakan akun CapCut yang sudah ada untuk login melalui <b>Continue with email</b>, lalu membuka link undangan tim dan otomatis klik <b>Submit / Join space</b>.\n\n` +
            `🔗 <b>Silakan kirimkan Link Undangan / Join Tim CapCut Anda:</b>\n` +
            `<i>Contoh:</i> <code>https://www.capcut.com/sv2/ZS9DUNV6BxA7W-hcWGC</code>\n\n` +
            `<i>Ketik link di chat atau kirim /cancel untuk batal.</i>`,
            { parse_mode: 'HTML' }
        );
    });

    // ── /join ──
    bot.command('join', (ctx) => {
        delete userState[ctx.chat.id];
        delete pendingInput[ctx.chat.id];
        ctx.reply(
            `👥 <b>PILIH METODE JOIN TIM CAPCUT:</b>\n\n` +
            `1️⃣ <b>Daftar + Join:</b> Otomatis buat akun baru @${escapeHtml(process.env.tmail_domain || 'arapmium.web.id')} lalu join tim.\n` +
            `2️⃣ <b>Masuk + Join:</b> Gunakan akun lama (email|pass) untuk login lalu join tim.`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('✨ Daftar + Join Tim', 'menu_daftar_join'),
                        Markup.button.callback('🔑 Masuk + Join Tim', 'menu_login_join'),
                    ],
                    [
                        Markup.button.callback('🎬 Menu CapCut', 'open_menu_capcut'),
                        Markup.button.callback('🏠 Menu Utama', 'back_menu')
                    ]
                ])
            }
        );
    });

    // ── /batal & /cancel ──
    bot.command(['batal', 'cancel'], (ctx) => {
        delete userState[ctx.chat.id];
        delete pendingInput[ctx.chat.id];
        ctx.reply('❌ Input dibatalkan. Kembali ke menu utama.', mainMenu());
    });

    // ── Helper Cek Akun Pending ──
    function getPendingAccounts(planMode = null) {
        if (planMode === 'reset_password' || planMode === 'reset') {
            const gsuitePath = path.join(__dirname, 'gsuite');
            const terkaitPath = path.join(__dirname, 'akun_terkait.txt');
            const resetPath = path.join(__dirname, 'akun_reset_password.txt');

            const doneReset = [];
            if (fs.existsSync(resetPath)) {
                fs.readFileSync(resetPath, 'utf8').split('\n').forEach(e => {
                    const parts = e.split(/[:|]/);
                    if (parts[0] && parts[0].trim()) doneReset.push(parts[0].trim().toLowerCase());
                    if (parts[2] && parts[2].trim()) doneReset.push(parts[2].trim().toLowerCase());
                });
            }

            if (fs.existsSync(gsuitePath)) {
                const gAccounts = fs.readFileSync(gsuitePath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@'));
                const pendingG = gAccounts.filter(a => {
                    const parts = a.split(/[:|]/);
                    const p0 = parts[0] ? parts[0].trim().toLowerCase() : '';
                    const p2 = parts[2] ? parts[2].trim().toLowerCase() : '';
                    return !doneReset.includes(p0) && (!p2 || !doneReset.includes(p2));
                });
                if (pendingG.length > 0) return pendingG;
            }

            if (fs.existsSync(terkaitPath)) {
                const tAccounts = fs.readFileSync(terkaitPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@'));
                return tAccounts.filter(a => {
                    const parts = a.split(/[:|]/);
                    const p0 = parts[0] ? parts[0].trim().toLowerCase() : '';
                    const p2 = parts[2] ? parts[2].trim().toLowerCase() : '';
                    return !doneReset.includes(p0) && (!p2 || !doneReset.includes(p2));
                });
            }

            return [];
        }

        const gsuitePath = path.join(__dirname, 'gsuite');
        const allAccounts = fs.existsSync(gsuitePath)
            ? fs.readFileSync(gsuitePath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@'))
            : [];

        if (planMode === 'bind_only' || planMode === 'bind') {
            const boundPath = path.join(__dirname, 'akun_terkait.txt');
            const boundAccounts = fs.existsSync(boundPath)
                ? fs.readFileSync(boundPath, 'utf8').split('\n').map(e => e.split(/[:|]/)[0].trim().toLowerCase()).filter(Boolean)
                : [];
            return allAccounts.filter(a => !boundAccounts.includes(a.split(/[:|]/)[0].trim().toLowerCase()));
        }

        const donePath = path.join(__dirname, 'akun_sudah_login');
        const doneAccounts = fs.existsSync(donePath)
            ? fs.readFileSync(donePath, 'utf8').split('\n').map(e => e.split(/[:|]/)[0].trim().toLowerCase()).filter(Boolean)
            : [];
        return allAccounts.filter(a => !doneAccounts.includes(a.split(/[:|]/)[0].trim().toLowerCase()));
    }

    // ── Fungsi Tanya Jumlah Akun / Langsung Jalankan ──
    function askOrRunPlan(ctx, planMode) {
        if (botProcess) {
            return ctx.reply('⚠️ Bot CapCut sedang berjalan! Hentikan terlebih dahulu jika ingin memulai baru.');
        }

        const pending = getPendingAccounts(planMode);
        if (pending.length === 0) {
            let note = 'Semua akun mungkin sudah selesai diproses (ada di akun_sudah_login) atau antrean kosong.';
            if (planMode === 'bind_only') {
                note = 'Semua akun di antrean gsuite sudah pernah dikaitkan email (ada di akun_terkait.txt) atau file gsuite masih kosong.';
            } else if (planMode === 'reset_password') {
                note = 'Semua akun sudah pernah di-reset password-nya (ada di akun_reset_password.txt) atau tidak ada akun terkait yang ditemukan.';
            }
            return ctx.reply(
                `⚠️ <b>Tidak ada akun yang tersedia di antrean!</b>\n\n` +
                `${note}\n\n` +
                `Silakan gunakan menu <b>📝 Input Akun GSuite</b> untuk menambahkan akun baru.`,
                { parse_mode: 'HTML', ...capcutMenu() }
            );
        }

        // Jika hanya ada 1 akun di antrean, langsung proses tanpa tanya jumlah
        if (pending.length === 1) {
            return runBot(ctx, planMode, 1);
        }

        // Jika ada 2 atau lebih (tersedia custom 1-5 akun atau semua)
        const maxSelectable = Math.min(pending.length, 5);
        const buttons = [];
        for (let i = 1; i <= maxSelectable; i++) {
            buttons.push(Markup.button.callback(`${i} Akun`, `run_${planMode}_${i}`));
        }
        if (pending.length > 5) {
            buttons.push(Markup.button.callback(`Semua (${pending.length})`, `run_${planMode}_${pending.length}`));
        }

        const rows = [];
        while (buttons.length > 0) {
            rows.push(buttons.splice(0, 3));
        }
        rows.push([
            Markup.button.callback('⬅️ Menu CapCut', 'open_menu_capcut'),
            Markup.button.callback('🏠 Menu Utama', 'back_menu')
        ]);

        let modeLabel = `👥 TEAMS (${process.env['seats/kursi'] || '5'} Seats)`;
        if (planMode === 'pro') modeLabel = '💎 PRO (7 Hari Trial)';
        if (planMode === 'bind_only') modeLabel = '🔗 KAITKAN EMAIL SAJA';
        if (planMode === 'reset_password') modeLabel = `🔑 RESET PASSWORD (${process.env.new_password || 'masuk123'})`;

        ctx.reply(
            `🎯 <b>Pilih Jumlah Akun yang Ingin Diproses:</b>\n\n` +
            `• Mode: <b>${modeLabel}</b>\n` +
            `• Tersedia di antrean: <b>${pending.length} akun</b>\n\n` +
            `Pilih berapa akun yang ingin dijalankan saat ini:`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
        );
    }

    // ── Fungsi untuk menjalankan bot dengan mode & jumlah tertentu ──
    function runBot(ctx, planMode, count, options = {}) {
        if (botProcess) {
            return ctx.reply('⚠️ Bot CapCut sedang berjalan! Hentikan dulu jika ingin restart.');
        }

        const newPassEnv = process.env.new_password || 'masuk123';
        let modeLabel = `👥 TEAMS (${process.env['seats/kursi'] || '5'} Seats)`;
        if (planMode === 'pro') modeLabel = '💎 PRO (7 Day Trial)';
        if (planMode === 'bind_only') modeLabel = '🔗 KAITKAN EMAIL SAJA';
        if (planMode === 'reset_password') modeLabel = `🔑 RESET PASSWORD (${newPassEnv})`;
        if (planMode === 'register' || planMode === 'daftar') modeLabel = '✨ DAFTAR AKUN BARU CAPCUT';
        if (planMode === 'daftar_join') modeLabel = '✨ DAFTAR + JOIN TIM CAPCUT';
        if (planMode === 'login_join') modeLabel = '🔑 MASUK + JOIN TIM CAPCUT';

        const targetCount = count ? count : 0;
        const countText = targetCount > 0 ? `${targetCount} akun` : 'Semua akun';

        let descText = 'Proses otomatisasi sedang berjalan. Link cashier akan otomatis dikirimkan ke chat ini begitu berhasil didapatkan.';
        if (planMode === 'bind_only') {
            descText = 'Proses otomatisasi sedang berjalan. Email akan otomatis dikaitkan ke akun CapCut via @arapmium.web.id.';
        } else if (planMode === 'reset_password') {
            descText = `Proses reset password sedang berjalan. Bot akan otomatis membuka forget-password, mengambil link dari ArapMium, dan mengatur password baru (${newPassEnv}).`;
        } else if (planMode === 'register' || planMode === 'daftar') {
            descText = `Bot akan mendaftarkan ${countText} CapCut baru secara otomatis menggunakan email temporary @${process.env.tmail_domain || 'arapmium.web.id'} + password masuk123. Hasil dicatat ke akun_terdaftar.txt (format: email|password).`;
        } else if (planMode === 'daftar_join') {
            descText = `Bot akan mendaftarkan ${countText} CapCut baru dengan email ArapMium, lalu otomatis membuka link join tim dan klik Submit / Join space. Hasil dicatat di akun_terdaftar.txt dan akun_join_tim.txt.`;
        } else if (planMode === 'login_join') {
            descText = `Bot akan login menggunakan akun yang diberikan via Continue with email, lalu otomatis membuka link join tim dan klik Submit / Join space. Hasil dicatat di akun_join_tim.txt.`;
        }

        ctx.reply(
            `⏳ <b>Memulai Bot CapCut...</b>\n\n` +
            `• <b>Mode:</b> ${modeLabel}\n` +
            `• <b>Target:</b> ${countText}\n\n` +
            `<i>${descText}</i>`,
            { parse_mode: 'HTML' }
        ).catch(() => {});

        logBuffer = [];
        addLog(`[START] Bot CapCut dimulai (${modeLabel} | ${countText}) pada ${new Date().toLocaleString('id-ID')}`);

        // Tracking sesi eksekusi saat ini untuk laporan lengkap
        const sessionSuccess = [];
        const sessionFailed = [];
        const startTime = Date.now();

        // Jalankan index.js dengan env planmode dan max_process
        const botEnv = {
            ...process.env,
            planmode: planMode,
            max_process: targetCount > 0 ? String(targetCount) : '0',
            ...(options.joinLink ? { join_link: options.joinLink, JOIN_LINK: options.joinLink } : {}),
            ...(options.accountsFile ? { join_accounts_file: options.accountsFile, JOIN_ACCOUNTS_FILE: options.accountsFile } : {}),
        };

        botProcess = spawn('node', ['index.js'], {
            cwd: __dirname,
            env: botEnv,
        });

        let stdoutBuffer = '';

        botProcess.stdout.on('data', (data) => {
            stdoutBuffer += data.toString();
            const lines = stdoutBuffer.split('\n');
            stdoutBuffer = lines.pop(); // simpan fragmen baris terakhir jika belum lengkap

            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line) continue;
                console.log(`[CAPCUT] ${line}`);
                addLog(line);

                // 1. Deteksi marker link cashier untuk langsung dikirim ke Telegram
                if (line.includes('###TELE_CASHIER###')) {
                    try {
                        const parts = line.split('###').filter(Boolean);
                        if (parts.length >= 5) {
                            const pPlan = parts[1];
                            const pEmail = parts[2];
                            const pPass = parts[3];
                            const pLink = parts[4];
                            const pBound = parts.length >= 6 ? parts[5].trim() : null;

                            sessionSuccess.push({
                                type: 'cashier',
                                plan: pPlan,
                                email: pEmail,
                                password: pPass,
                                cashierLink: pLink,
                                boundEmail: (pBound && pBound !== '-') ? pBound : null,
                            });

                            let msg = `🎉 <b>LINK CASHIER BERHASIL DIDAPATKAN!</b>\n\n` +
                                      `📌 <b>Paket:</b> <code>${escapeHtml(pPlan)}</code>\n` +
                                      `📧 <b>Email GSuite:</b> <code>${escapeHtml(pEmail)}</code>\n` +
                                      `🔑 <b>Password:</b> <code>${escapeHtml(pPass)}</code>\n`;

                            if (pBound && pBound !== '-') {
                                msg += `🔗 <b>Email Terikat:</b> <code>${escapeHtml(pBound)}</code> <i>(Aman jika Google suspend)</i>\n`;
                            }

                            msg += `\n🔗 <b>Link Pembayaran (Cashier):</b>\n<code>${escapeHtml(pLink)}</code>\n\n` +
                                   `<i>✅ Akun otomatis dikeluarkan dari gsuite & dicatat ke akun_sudah_login.</i>`;

                            ctx.reply(
                                msg,
                                {
                                    parse_mode: 'HTML',
                                    disable_web_page_preview: true,
                                    ...Markup.inlineKeyboard([
                                        [Markup.button.url('💳 Buka Link Pembayaran', pLink)]
                                    ])
                                }
                            ).catch((err) => {
                                console.error('[TELEGRAM ERR] Gagal kirim link:', err.message);
                                ctx.reply(`🎉 LINK CASHIER BERHASIL DIDAPATKAN!\n\nPaket: ${pPlan}\nEmail: ${pEmail}\nPassword: ${pPass}\nLink: ${pLink}`).catch(() => {});
                            });
                        }
                    } catch (e) {
                        console.error('[TELEGRAM ERR] Parse link cashier error:', e.message);
                    }
                }

                // 2. Deteksi marker akun gagal untuk notifikasi ke Telegram
                if (line.includes('###TELE_GAGAL###')) {
                    try {
                        const parts = line.split('###').filter(Boolean);
                        if (parts.length >= 3) {
                            const fEmail = parts[1];
                            const fError = parts[2].trim();
                            const fScreenshot = parts.length >= 4 ? parts[3].trim() : '';

                            sessionFailed.push({
                                email: fEmail,
                                error: fError,
                                screenshot: fScreenshot,
                            });

                            let customTips = '';
                            if (fError.includes('UNUSUAL_ACTIVITY')) {
                                customTips = `\n💡 <b>Saran:</b> <i>IP Anda terdeteksi limit/unusual oleh CapCut. Gunakan rotasi IP (Mode Pesawat Tethering HP / Rotating Residential Proxy) sebelum melanjutkan.</i>\n`;
                            } else if (fError.includes('SHARK_BLOCKED')) {
                                customTips = `\n💡 <b>Saran:</b> <i>Sistem Anti-Fraud CapCut (Shark WAF) mencekal checkout dari IP server ini (shark blocked). Hindari 'Tanpa proxy' di Pterodactyl. Gunakan proxy Residential / Mobile rotasi IP!</i>\n`;
                            } else if (fError.includes('INVALID_WORKSPACE')) {
                                customTips = `\n💡 <b>Saran:</b> <i>Ruang tim tidak valid atau akun belum memiliki ruang kerja tim. Buka akun di browser dan pastikan ruang tim sudah terbuat.</i>\n`;
                            } else if (fError.includes('PROMO_RP0_TIDAK_TERSEDIA')) {
                                customTips = `\n💡 <b>Saran:</b> <i>Promo Pro 7 Hari Rp0 tidak tersedia pada akun ini (hanya harga normal). Bukti screenshot modal CapCut terlampir.</i>\n`;
                            }

                            const failCaption = `❌ <b>AKUN GAGAL DIPROSES</b>\n\n` +
                                `📧 <b>Email:</b> <code>${escapeHtml(fEmail)}</code>\n` +
                                `⚠️ <b>Alasan:</b> <i>${escapeHtml(fError.slice(0, 200))}</i>\n` +
                                customTips +
                                `\n<i>Akun dikeluarkan dari antrean gsuite & dicatat ke akun_gagal.txt</i>`;

                            if (fScreenshot && fs.existsSync(fScreenshot)) {
                                const sendPhotoWithFallback = async () => {
                                    try {
                                        await ctx.replyWithPhoto(
                                            { source: fs.createReadStream(fScreenshot) },
                                            { caption: failCaption.slice(0, 990), parse_mode: 'HTML' }
                                        );
                                    } catch (streamErr) {
                                        try {
                                            await ctx.replyWithPhoto(
                                                { source: fs.readFileSync(fScreenshot) },
                                                { caption: failCaption.slice(0, 990), parse_mode: 'HTML' }
                                            );
                                        } catch (bufErr) {
                                            console.error('[TELEGRAM ERR] Gagal kirim foto screenshot:', bufErr.message);
                                            await ctx.reply(failCaption, { parse_mode: 'HTML' });
                                        }
                                    }
                                };
                                sendPhotoWithFallback().catch(() => {});
                            } else {
                                ctx.reply(failCaption, { parse_mode: 'HTML' }).catch((err) => {
                                    console.error('[TELEGRAM ERR] Gagal kirim notif gagal:', err.message);
                                    ctx.reply(`❌ AKUN GAGAL: ${fEmail}\nAlasan: ${fError.slice(0, 200)}`).catch(() => {});
                                });
                            }
                        }
                    } catch (e) {
                        console.error('[TELEGRAM ERR] Parse akun gagal error:', e.message);
                    }
                }

                // 3. Deteksi marker email berhasil dikaitkan
                if (line.includes('###TELE_BIND_SUCCESS###')) {
                    try {
                        const parts = line.split('###').filter(Boolean);
                        if (parts.length >= 4) {
                            const bEmail = parts[1];
                            const bPass = parts[2];
                            const bBound = parts[3];

                            sessionSuccess.push({
                                type: 'bind',
                                email: bEmail,
                                password: bPass,
                                boundEmail: bBound,
                            });

                            ctx.reply(
                                `🎉 <b>EMAIL BERHASIL DIKAITKAN!</b>\n\n` +
                                `📧 <b>Akun GSuite:</b> <code>${escapeHtml(bEmail)}</code>\n` +
                                `🔑 <b>Password:</b> <code>${escapeHtml(bPass)}</code>\n` +
                                `🔗 <b>Email Terkait:</b> <code>${escapeHtml(bBound)}</code>\n\n` +
                                `✅ <i>Akun CapCut kini aman dan dapat diakses via email di atas meskipun akun Google suspend/banned.</i>\n` +
                                `📁 <i>Tersimpan permanen di akun_terkait.txt.</i>`,
                                {
                                    parse_mode: 'HTML',
                                    ...Markup.inlineKeyboard([
                                        [Markup.button.callback('📥 Download akun_terkait.txt', 'download_terkait')]
                                    ])
                                }
                            ).catch((err) => {
                                console.error('[TELEGRAM ERR] Gagal kirim notif bind:', err.message);
                                ctx.reply(`🎉 EMAIL BERHASIL DIKAITKAN!\n\nEmail GSuite: ${bEmail}\nPassword: ${bPass}\nEmail Terkait: ${bBound}\n\nTersimpan di akun_terkait.txt`).catch(() => {});
                            });
                        }
                    } catch (e) {
                        console.error('[TELEGRAM ERR] Parse bind success error:', e.message);
                    }
                }

                // 4. Deteksi marker reset password berhasil
                if (line.includes('###TELE_RESET_SUCCESS###')) {
                    try {
                        const parts = line.split('###').filter(Boolean);
                        if (parts.length >= 4) {
                            const rEmail = parts[1];
                            const rPass = parts[2];
                            const rBound = parts[3];

                            sessionSuccess.push({
                                type: 'reset',
                                email: rEmail,
                                password: rPass,
                                boundEmail: rBound,
                            });

                            let msg = `🎉 <b>KATA SANDI BERHASIL DI-RESET!</b>\n\n` +
                                      `📧 <b>Email CapCut:</b> <code>${escapeHtml(rBound)}</code>\n` +
                                      `🔑 <b>Password Baru:</b> <code>${escapeHtml(rPass)}</code>\n`;

                            if (rEmail && rEmail !== rBound) {
                                msg += `👤 <b>Akun GSuite Asal:</b> <code>${escapeHtml(rEmail)}</code>\n`;
                            }

                            msg += `\n✅ <i>Akun CapCut kini dapat langsung login menggunakan email & password baru di atas tanpa tergantung akun Google!</i>\n` +
                                   `📁 <i>Tercatat di: <code>akun_reset_password.txt</code></i>`;

                            ctx.reply(msg, {
                                parse_mode: 'HTML',
                                ...Markup.inlineKeyboard([
                                    [Markup.button.callback('📥 Download akun_reset_password.txt', 'download_reset')]
                                ])
                            }).catch((err) => {
                                console.error('[TELEGRAM ERR] Gagal kirim notif reset:', err.message);
                                ctx.reply(`🎉 KATA SANDI BERHASIL DI-RESET!\n\nEmail: ${rBound}\nPassword Baru: ${rPass}\nTersimpan di akun_reset_password.txt`).catch(() => {});
                            });
                        }
                    } catch (e) {
                        console.error('[TELEGRAM ERR] Parse reset success error:', e.message);
                    }
                }

                // 5. Deteksi marker akun berhasil didaftarkan (ArapMium)
                if (line.includes('###TELE_REGISTER_SUCCESS###')) {
                    try {
                        const parts = line.split('###').filter(Boolean);
                        if (parts.length >= 3) {
                            const regEmail = parts[1];
                            const regPass = parts[2];

                            sessionSuccess.push({
                                type: 'register',
                                email: regEmail,
                                password: regPass,
                            });

                            const regOutput = `${regEmail}|${regPass}`;
                            const msg = `✨ <b>AKUN CAPCUT BERHASIL DIDAFTARKAN!</b>\n\n` +
                                        `📧 <b>Email:</b> <code>${escapeHtml(regEmail)}</code>\n` +
                                        `🔑 <b>Password:</b> <code>${escapeHtml(regPass)}</code>\n\n` +
                                        `📋 <b>Format Output:</b>\n<code>${escapeHtml(regOutput)}</code>\n\n` +
                                        `📁 <i>Tersimpan di: <code>akun_terdaftar.txt</code></i>`;

                            ctx.reply(msg, {
                                parse_mode: 'HTML',
                                ...Markup.inlineKeyboard([
                                    [Markup.button.callback('📥 Download akun_terdaftar.txt', 'download_daftar')]
                                ])
                            }).catch((err) => {
                                console.error('[TELEGRAM ERR] Gagal kirim notif register:', err.message);
                                ctx.reply(`✨ AKUN BERHASIL DIDAFTARKAN!\n\nEmail: ${regEmail}\nPassword: ${regPass}\nFormat: ${regOutput}`).catch(() => {});
                            });
                        }
                    } catch (e) {
                        console.error('[TELEGRAM ERR] Parse register success error:', e.message);
                    }
                }

                // 6. Deteksi marker akun berhasil join tim CapCut
                if (line.includes('###TELE_JOIN_SUCCESS###')) {
                    try {
                        const parts = line.split('###').filter(Boolean);
                        if (parts.length >= 5) {
                            const jEmail = parts[1];
                            const jPass = parts[2];
                            const jStatus = parts[3];
                            const jLink = parts[4];

                            sessionSuccess.push({
                                type: 'join',
                                email: jEmail,
                                password: jPass,
                                status: jStatus,
                                joinLink: jLink,
                            });

                            const msg = `🎉 <b>AKUN BERHASIL JOIN TIM CAPCUT!</b>\n\n` +
                                        `📧 <b>Email:</b> <code>${escapeHtml(jEmail)}</code>\n` +
                                        `🔑 <b>Password:</b> <code>${escapeHtml(jPass)}</code>\n` +
                                        `👥 <b>Status:</b> <b>${escapeHtml(jStatus)}</b>\n` +
                                        `🔗 <b>Link Tim:</b> <code>${escapeHtml(jLink)}</code>\n\n` +
                                        `📁 <i>Tersimpan di: <code>akun_join_tim.txt</code></i>`;

                            ctx.reply(msg, {
                                parse_mode: 'HTML',
                                disable_web_page_preview: true,
                                ...Markup.inlineKeyboard([
                                    [Markup.button.callback('📥 Download akun_join_tim.txt', 'download_join_tim')]
                                ])
                            }).catch((err) => {
                                console.error('[TELEGRAM ERR] Gagal kirim notif join:', err.message);
                                ctx.reply(`🎉 AKUN BERHASIL JOIN TIM!\n\nEmail: ${jEmail}\nPassword: ${jPass}\nStatus: ${jStatus}`).catch(() => {});
                            });
                        }
                    } catch (e) {
                        console.error('[TELEGRAM ERR] Parse join success error:', e.message);
                    }
                }
            }
        });

        botProcess.stderr.on('data', (data) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            for (const line of lines) {
                console.error(`[CAPCUT ERR] ${line}`);
                addLog(`[ERR] ${line}`);
            }
        });

        botProcess.on('close', (code) => {
            // Proses sisa buffer jika ada
            if (stdoutBuffer && stdoutBuffer.trim()) {
                const line = stdoutBuffer.trim();
                console.log(`[CAPCUT] ${line}`);
                addLog(line);
                if (line.includes('###TELE_BIND_SUCCESS###')) {
                    try {
                        const parts = line.split('###').filter(Boolean);
                        if (parts.length >= 4) {
                            sessionSuccess.push({
                                type: 'bind',
                                email: parts[1],
                                password: parts[2],
                                boundEmail: parts[3],
                            });
                        }
                    } catch (_) {}
                } else if (line.includes('###TELE_RESET_SUCCESS###')) {
                    try {
                        const parts = line.split('###').filter(Boolean);
                        if (parts.length >= 4) {
                            sessionSuccess.push({
                                type: 'reset',
                                email: parts[1],
                                password: parts[2],
                                boundEmail: parts[3],
                            });
                        }
                    } catch (_) {}
                } else if (line.includes('###TELE_JOIN_SUCCESS###')) {
                    try {
                        const parts = line.split('###').filter(Boolean);
                        if (parts.length >= 5) {
                            sessionSuccess.push({
                                type: 'join',
                                email: parts[1],
                                password: parts[2],
                                status: parts[3],
                                joinLink: parts[4],
                            });
                        }
                    } catch (_) {}
                }
            }

            const durationSec = Math.round((Date.now() - startTime) / 1000);
            const durationStr = durationSec > 60
                ? `${Math.floor(durationSec / 60)} menit ${durationSec % 60} detik`
                : `${durationSec} detik`;

            const totalSuccess = sessionSuccess.length;
            const totalFailed = sessionFailed.length;
            const totalProcessed = totalSuccess + totalFailed;

            const logMsg = `Proses selesai dengan kode ${code} (Berhasil: ${totalSuccess}, Gagal: ${totalFailed}, Durasi: ${durationStr})`;
            console.log(`[CAPCUT] ${logMsg}`);
            addLog(`[SELESAI] ${logMsg}`);
            botProcess = null;

            if (totalProcessed === 0) {
                let emptyNote = 'Tidak ada akun yang diproses. Semua akun di antrean gsuite sudah pernah diproses sebelumnya (ada di akun_sudah_login) atau daftar antrean kosong.';
                if (planMode === 'bind_only') {
                    emptyNote = 'Tidak ada akun yang diproses. Semua akun di antrean gsuite sudah pernah dikaitkan email (ada di akun_terkait.txt) atau daftar antrean kosong.';
                } else if (planMode === 'reset_password') {
                    emptyNote = 'Tidak ada akun yang diproses. Semua akun sudah pernah di-reset password-nya (ada di akun_reset_password.txt) atau daftar antrean kosong.';
                } else if (planMode === 'daftar_join' || planMode === 'login_join') {
                    emptyNote = 'Tidak ada akun yang diproses atau daftar akun yang diberikan kosong / sudah diproses.';
                }

                return ctx.reply(
                    `ℹ️ <b>PEMBERITAHUAN</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `${emptyNote}\n\n` +
                    `Silakan gunakan menu bot untuk mencoba kembali dengan akun lain.`,
                    { parse_mode: 'HTML', ...capcutMenu() }
                ).catch(() => {});
            }

            // Susun pesan laporan lengkap
            let reportMsg = `📊 <b>LAPORAN HASIL OTOMATISASI CAPCUT</b>\n` +
                            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                            `⚙️ <b>Mode:</b> ${modeLabel}\n` +
                            `⏱️ <b>Durasi:</b> ${durationStr}\n` +
                            `🎯 <b>Total Diproses:</b> ${totalProcessed} akun\n` +
                            `✅ <b>Berhasil:</b> ${totalSuccess} akun\n` +
                            `❌ <b>Gagal:</b> ${totalFailed} akun\n` +
                            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

            if (planMode === 'bind_only') {
                if (totalSuccess > 0) {
                    reportMsg += `🔗 <b>RINCIAN AKUN BERHASIL DIKAITKAN (${totalSuccess}):</b>\n`;
                    sessionSuccess.forEach((item, idx) => {
                        reportMsg += `${idx + 1}. 📧 <b>GSuite:</b> <code>${escapeHtml(item.email)}</code>\n` +
                                     `   🔗 <b>Email Terkait:</b> <code>${escapeHtml(item.boundEmail)}</code>\n` +
                                     `   🔑 <b>Password:</b> <code>${escapeHtml(item.password)}</code>\n\n`;
                    });
                    reportMsg += `📁 <i>Semua data tersimpan rapi di file <b>akun_terkait.txt</b></i>\n\n`;
                } else {
                    reportMsg += `ℹ️ <i>Tidak ada akun yang berhasil dikaitkan email pada sesi ini.</i>\n\n`;
                }
            } else if (planMode === 'reset_password') {
                if (totalSuccess > 0) {
                    reportMsg += `🔑 <b>RINCIAN KATA SANDI BERHASIL DI-RESET (${totalSuccess}):</b>\n`;
                    sessionSuccess.forEach((item, idx) => {
                        reportMsg += `${idx + 1}. 📧 <b>Email:</b> <code>${escapeHtml(item.boundEmail || item.email)}</code>\n` +
                                     `   🔑 <b>Password Baru:</b> <code>${escapeHtml(item.password)}</code>\n\n`;
                    });
                    reportMsg += `📁 <i>Semua data tersimpan di file <b>akun_reset_password.txt</b></i>\n\n`;
                } else {
                    reportMsg += `ℹ️ <i>Tidak ada akun yang berhasil di-reset password pada sesi ini.</i>\n\n`;
                }
            } else if (planMode === 'daftar_join' || planMode === 'login_join') {
                if (totalSuccess > 0) {
                    reportMsg += `👥 <b>RINCIAN AKUN BERHASIL JOIN TIM (${totalSuccess}):</b>\n`;
                    sessionSuccess.forEach((item, idx) => {
                        reportMsg += `${idx + 1}. 📧 <b>Email:</b> <code>${escapeHtml(item.email)}</code>\n` +
                                     `   🔑 <b>Pass:</b> <code>${escapeHtml(item.password)}</code>\n` +
                                     `   👥 <b>Status:</b> <b>${escapeHtml(item.status)}</b>\n\n`;
                    });
                    reportMsg += `📁 <i>Semua data tersimpan rapi di file <b>akun_join_tim.txt</b></i>\n\n`;
                } else {
                    reportMsg += `ℹ️ <i>Tidak ada akun yang berhasil join tim pada sesi ini.</i>\n\n`;
                }
            } else if (planMode === 'register' || planMode === 'daftar') {
                if (totalSuccess > 0) {
                    reportMsg += `✨ <b>DAFTAR AKUN BARU CAPCUT BERHASIL (${totalSuccess}):</b>\n`;
                    sessionSuccess.forEach((item, idx) => {
                        const pair = `${item.email}|${item.password}`;
                        reportMsg += `${idx + 1}. <code>${escapeHtml(pair)}</code>\n`;
                    });
                    reportMsg += `\n📁 <i>Semua data tersimpan di file <b>akun_terdaftar.txt</b> (Format: email|password)</i>\n\n`;
                } else {
                    reportMsg += `ℹ️ <i>Tidak ada akun yang berhasil didaftarkan pada sesi ini.</i>\n\n`;
                }
            } else {
                if (totalSuccess > 0) {
                    reportMsg += `💳 <b>RINCIAN LINK CASHIER DIDAPATKAN (${totalSuccess}):</b>\n`;
                    sessionSuccess.forEach((item, idx) => {
                        reportMsg += `${idx + 1}. 📧 <b>GSuite:</b> <code>${escapeHtml(item.email)}</code>\n` +
                                     (item.boundEmail && item.boundEmail !== '-' ? `   🔗 <b>Terikat:</b> <code>${escapeHtml(item.boundEmail)}</code>\n` : '') +
                                     `   🔗 <b>Cashier:</b> <a href="${item.cashierLink}">Buka Link Pembayaran</a>\n\n`;
                    });
                    reportMsg += `📁 <i>Tersimpan di file <b>result.txt</b></i>\n\n`;
                } else {
                    reportMsg += `ℹ️ <i>Tidak ada link cashier yang didapatkan pada sesi ini.</i>\n\n`;
                }
            }

            if (totalFailed > 0) {
                reportMsg += `⚠️ <b>DAFTAR AKUN GAGAL (${totalFailed}):</b>\n`;
                sessionFailed.forEach((item, idx) => {
                    reportMsg += `${idx + 1}. <code>${escapeHtml(item.email)}</code>: <i>${escapeHtml(item.error.slice(0, 80))}</i>\n`;
                });
                reportMsg += `\n📁 <i>Dicatat di file <b>akun_gagal.txt</b></i>\n\n`;
            }

            // Keyboard aksi
            const finishButtons = [];
            if (planMode === 'bind_only') {
                if (totalSuccess > 0) {
                    finishButtons.push([Markup.button.callback('📥 Download akun_terkait.txt', 'download_terkait')]);
                }
            } else if (planMode === 'reset_password') {
                if (totalSuccess > 0) {
                    finishButtons.push([Markup.button.callback('📥 Download akun_reset_password.txt', 'download_reset')]);
                }
            } else if (planMode === 'register' || planMode === 'daftar') {
                if (totalSuccess > 0) {
                    finishButtons.push([Markup.button.callback('📥 Download akun_terdaftar.txt', 'download_daftar')]);
                }
            } else if (planMode === 'daftar_join' || planMode === 'login_join') {
                if (totalSuccess > 0) {
                    finishButtons.push([Markup.button.callback('📥 Download akun_join_tim.txt', 'download_join_tim')]);
                }
            } else {
                if (totalSuccess > 0) {
                    finishButtons.push([Markup.button.callback('📥 Download result.txt', 'view_result')]);
                }
            }
            finishButtons.push([
                Markup.button.callback('🎬 Menu CapCut', 'open_menu_capcut'),
                Markup.button.callback('🏠 Menu Utama', 'back_menu')
            ]);

            // Batasi panjang jika melebihi limit Telegram (4096 char)
            if (reportMsg.length > 3900) {
                reportMsg = reportMsg.slice(0, 3850) + '\n\n<i>...(laporan dipotong karena batas karakter Telegram, unduh file untuk melihat lengkap)...</i>';
            }

            ctx.reply(reportMsg, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                ...Markup.inlineKeyboard(finishButtons)
            }).catch((err) => {
                console.error('[TELEGRAM ERR] Gagal kirim laporan selesai HTML:', err.message);
                let fallback = `📊 LAPORAN BOT CAPCUT SELESAI\nMode: ${modeLabel}\nTotal: ${totalProcessed} | Berhasil: ${totalSuccess} | Gagal: ${totalFailed}\n\n`;
                if (planMode === 'bind_only') {
                    sessionSuccess.forEach((item, idx) => {
                        fallback += `${idx + 1}. ${item.email} -> ${item.boundEmail}\n`;
                    });
                } else if (planMode === 'reset_password') {
                    sessionSuccess.forEach((item, idx) => {
                        fallback += `${idx + 1}. ${item.boundEmail || item.email} -> ${item.password}\n`;
                    });
                } else if (planMode === 'register' || planMode === 'daftar') {
                    sessionSuccess.forEach((item, idx) => {
                        fallback += `${idx + 1}. ${item.email}|${item.password}\n`;
                    });
                }
                ctx.reply(fallback, capcutMenu()).catch(() => {});
            });
        });

        botProcess.on('error', (err) => {
            addLog(`[FATAL] ${err.message}`);
            botProcess = null;
            ctx.reply(`❌ <b>Gagal menjalankan bot:</b> ${escapeHtml(err.message)}`, { parse_mode: 'HTML' }).catch(() => {});
        });
    }

    // ── Helper Simpan Akun Canva ──
    function saveCanvaAccounts(ctx, accountsList, mode) {
        const canvaPath = path.join(__dirname, 'akun_canva.txt');

        if (mode === 'replace') {
            fs.writeFileSync(canvaPath, accountsList.join('\n') + '\n', 'utf8');
            return ctx.reply(
                `✅ <b>Berhasil Mengganti Semua Akun Canva!</b>\n\n` +
                `• Total akun baru di <code>akun_canva.txt</code>: <b>${accountsList.length} akun</b>\n\n` +
                `Sekarang Anda bisa langsung memilih mode untuk memulai bot:`,
                {
                    parse_mode: 'HTML',
                    ...canvaMenu()
                }
            );
        } else {
            // Append
            let existingContent = fs.existsSync(canvaPath) ? fs.readFileSync(canvaPath, 'utf8') : '';
            if (existingContent && !existingContent.endsWith('\n')) existingContent += '\n';
            fs.writeFileSync(canvaPath, existingContent + accountsList.join('\n') + '\n', 'utf8');

            const allAccounts = fs.readFileSync(canvaPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@'));
            return ctx.reply(
                `✅ <b>Berhasil Menambahkan Akun Canva!</b>\n\n` +
                `• Akun ditambahkan: <b>${accountsList.length} akun</b>\n` +
                `• Total akun di antrean sekarang: <b>${allAccounts.length} akun</b>\n\n` +
                `Silakan pilih mode untuk menjalankan bot:`,
                {
                    parse_mode: 'HTML',
                    ...canvaMenu()
                }
            );
        }
    }

    // ── Fungsi untuk menjalankan script Canva (Sign Up & Reset) ──
    function runCanva(ctx, action, count = 0, options = {}) {
        if (botProcess) {
            return ctx.reply('⚠️ Proses bot sedang berjalan! Hentikan dulu jika ingin memulai baru.');
        }

        const isReset = (action === 'reset' || action.includes('reset'));
        const modeLabel = isReset ? '🔑 RESET PASSWORD CANVA' : '🎨 DAFTAR AKUN BARU CANVA';
        const targetCount = count ? count : 0;
        const countText = targetCount > 0 ? `${targetCount} akun` : 'Semua akun';
        const customPass = process.env.canva_password || process.env.new_password || process.env.daftar_password || 'masuk123';

        let descText = isReset
            ? `Bot akan membuka halaman lupa sandi Canva, menarik link/kode reset dari inbox Outlook via outlookreader.my.id, dan memasang password baru (${customPass}).`
            : `Bot akan mendaftarkan akun Canva baru via opsi Continue with email, menarik kode OTP 6-digit dari inbox Outlook via outlookreader.my.id, dan menyimpan akun ke akun_canva_terdaftar.txt.`;

        ctx.reply(
            `⏳ <b>Memulai Otomatisasi Canva...</b>\n\n` +
            `• <b>Mode:</b> ${modeLabel}\n` +
            `• <b>Target:</b> ${countText}\n` +
            `• <b>Password:</b> <code>${escapeHtml(customPass)}</code>\n\n` +
            `<i>${descText}</i>`,
            { parse_mode: 'HTML' }
        ).catch(() => {});

        logBuffer = [];
        addLog(`[START] Canva dimulai (${modeLabel} | ${countText}) pada ${new Date().toLocaleString('id-ID')}`);

        const sessionSuccess = [];
        const sessionFailed = [];
        const startTime = Date.now();

        const canvaEnv = {
            ...process.env,
            CANVA_ACTION: isReset ? 'reset' : 'signup',
            CANVA_MAX: targetCount > 0 ? String(targetCount) : '0',
            ...(options.accountsFile ? { CANVA_ACCOUNTS_FILE: options.accountsFile } : {}),
        };

        botProcess = spawn('node', ['canva.js', isReset ? 'reset' : 'signup', String(targetCount)], {
            cwd: __dirname,
            env: canvaEnv,
        });

        let stdoutBuffer = '';

        botProcess.stdout.on('data', (data) => {
            stdoutBuffer += data.toString();
            const lines = stdoutBuffer.split('\n');
            stdoutBuffer = lines.pop();

            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line) continue;
                console.log(`[CANVA] ${line}`);
                addLog(line);

                // 1. Deteksi Canva Register Berhasil
                if (line.includes('###TELE_CANVA_REGISTER_SUCCESS###')) {
                    try {
                        const parts = line.split('###').filter(Boolean);
                        if (parts.length >= 3) {
                            const cEmail = parts[1];
                            const cPass = parts[2];
                            const cUrl = parts.length >= 4 ? parts[3] : '';

                            sessionSuccess.push({
                                type: 'signup',
                                email: cEmail,
                                password: cPass,
                                url: cUrl,
                            });

                            const outText = `${cEmail}|${cPass}`;
                            ctx.reply(
                                `🎨 <b>AKUN CANVA BERHASIL DIDAFTARKAN!</b>\n\n` +
                                `📧 <b>Email:</b> <code>${escapeHtml(cEmail)}</code>\n` +
                                `🔑 <b>Password:</b> <code>${escapeHtml(cPass)}</code>\n\n` +
                                `📋 <b>Format Output:</b>\n<code>${escapeHtml(outText)}</code>\n\n` +
                                `📁 <i>Tersimpan di: <code>akun_canva_terdaftar.txt</code></i>`,
                                {
                                    parse_mode: 'HTML',
                                    ...Markup.inlineKeyboard([
                                        [Markup.button.callback('📥 Download akun_canva_terdaftar.txt', 'download_canva_daftar')]
                                    ])
                                }
                            ).catch((err) => {
                                console.error('[TELEGRAM ERR] Gagal kirim notif canva register:', err.message);
                            });
                        }
                    } catch (e) {
                        console.error('[TELEGRAM ERR] Parse canva register error:', e.message);
                    }
                }

                // 2. Deteksi Canva Reset Password Berhasil
                if (line.includes('###TELE_CANVA_RESET_SUCCESS###')) {
                    try {
                        const parts = line.split('###').filter(Boolean);
                        if (parts.length >= 3) {
                            const rEmail = parts[1];
                            const rPass = parts[2];

                            sessionSuccess.push({
                                type: 'reset',
                                email: rEmail,
                                password: rPass,
                            });

                            const outText = `${rEmail}|${rPass}`;
                            ctx.reply(
                                `🔑 <b>PASSWORD CANVA BERHASIL DI-RESET!</b>\n\n` +
                                `📧 <b>Email:</b> <code>${escapeHtml(rEmail)}</code>\n` +
                                `🔑 <b>Password Baru:</b> <code>${escapeHtml(rPass)}</code>\n\n` +
                                `📋 <b>Format Output:</b>\n<code>${escapeHtml(outText)}</code>\n\n` +
                                `📁 <i>Tersimpan di: <code>akun_canva_reset.txt</code></i>`,
                                {
                                    parse_mode: 'HTML',
                                    ...Markup.inlineKeyboard([
                                        [Markup.button.callback('📥 Download akun_canva_reset.txt', 'download_canva_reset')]
                                    ])
                                }
                            ).catch((err) => {
                                console.error('[TELEGRAM ERR] Gagal kirim notif canva reset:', err.message);
                            });
                        }
                    } catch (e) {
                        console.error('[TELEGRAM ERR] Parse canva reset error:', e.message);
                    }
                }

                // 3. Deteksi Canva Gagal
                if (line.includes('###TELE_CANVA_GAGAL###')) {
                    try {
                        const parts = line.split('###').filter(Boolean);
                        if (parts.length >= 3) {
                            const fEmail = parts[1];
                            const fError = parts[2].trim();
                            const fScreenshot = parts.length >= 4 ? parts[3].trim() : '';

                            sessionFailed.push({
                                email: fEmail,
                                error: fError,
                                screenshot: fScreenshot,
                            });

                            const failCaption = `❌ <b>CANVA GAGAL DIPROSES</b>\n\n` +
                                `📧 <b>Email:</b> <code>${escapeHtml(fEmail)}</code>\n` +
                                `⚠️ <b>Alasan:</b> <i>${escapeHtml(fError.slice(0, 200))}</i>\n\n` +
                                `📁 <i>Dicatat ke: <code>akun_canva_gagal.txt</code></i>`;

                            if (fScreenshot && fs.existsSync(fScreenshot)) {
                                const sendPhotoWithFallback = async () => {
                                    try {
                                        await ctx.replyWithPhoto(
                                            { source: fs.createReadStream(fScreenshot) },
                                            { caption: failCaption.slice(0, 990), parse_mode: 'HTML' }
                                        );
                                    } catch (streamErr) {
                                        try {
                                            await ctx.replyWithPhoto(
                                                { source: fs.readFileSync(fScreenshot) },
                                                { caption: failCaption.slice(0, 990), parse_mode: 'HTML' }
                                            );
                                        } catch (_) {
                                            await ctx.reply(failCaption, { parse_mode: 'HTML' });
                                        }
                                    }
                                };
                                sendPhotoWithFallback().catch(() => {});
                            } else {
                                ctx.reply(failCaption, { parse_mode: 'HTML' }).catch(() => {});
                            }
                        }
                    } catch (e) {
                        console.error('[TELEGRAM ERR] Parse canva gagal error:', e.message);
                    }
                }
            }
        });

        botProcess.stderr.on('data', (data) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            for (const line of lines) {
                console.error(`[CANVA ERR] ${line}`);
                addLog(`[ERR] ${line}`);
            }
        });

        botProcess.on('close', (code) => {
            if (stdoutBuffer && stdoutBuffer.trim()) {
                const line = stdoutBuffer.trim();
                console.log(`[CANVA] ${line}`);
                addLog(line);
            }

            const durationSec = Math.round((Date.now() - startTime) / 1000);
            const durationStr = durationSec > 60
                ? `${Math.floor(durationSec / 60)} menit ${durationSec % 60} detik`
                : `${durationSec} detik`;

            const totalSuccess = sessionSuccess.length;
            const totalFailed = sessionFailed.length;
            const totalProcessed = totalSuccess + totalFailed;

            const logMsg = `Canva selesai dengan kode ${code} (Berhasil: ${totalSuccess}, Gagal: ${totalFailed}, Durasi: ${durationStr})`;
            console.log(`[CANVA] ${logMsg}`);
            addLog(`[SELESAI] ${logMsg}`);
            botProcess = null;

            if (totalProcessed === 0) {
                return ctx.reply(
                    `ℹ️ <b>PEMBERITAHUAN</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `Tidak ada akun Canva yang diproses atau daftar antrean kosong.\n\n` +
                    `Silakan gunakan menu <b>📝 Input Akun Canva</b> untuk menambahkan akun Outlook.`,
                    { parse_mode: 'HTML', ...canvaMenu() }
                ).catch(() => {});
            }

            let reportMsg = `📊 <b>LAPORAN HASIL OTOMATISASI CANVA</b>\n` +
                            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                            `⚙️ <b>Mode:</b> ${modeLabel}\n` +
                            `⏱️ <b>Durasi:</b> ${durationStr}\n` +
                            `🎯 <b>Total Diproses:</b> ${totalProcessed} akun\n` +
                            `✅ <b>Berhasil:</b> ${totalSuccess} akun\n` +
                            `❌ <b>Gagal:</b> ${totalFailed} akun\n` +
                            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

            if (totalSuccess > 0) {
                reportMsg += `✅ <b>DAFTAR AKUN BERHASIL (${totalSuccess}):</b>\n`;
                sessionSuccess.forEach((item, idx) => {
                    reportMsg += `${idx + 1}. <code>${escapeHtml(item.email)}|${escapeHtml(item.password)}</code>\n`;
                });
                const destFile = isReset ? 'akun_canva_reset.txt' : 'akun_canva_terdaftar.txt';
                reportMsg += `\n📁 <i>Tersimpan di: <code>${destFile}</code></i>\n\n`;
            }

            if (totalFailed > 0) {
                reportMsg += `❌ <b>DAFTAR AKUN GAGAL (${totalFailed}):</b>\n`;
                sessionFailed.forEach((item, idx) => {
                    reportMsg += `${idx + 1}. <code>${escapeHtml(item.email)}</code>: <i>${escapeHtml(item.error.slice(0, 80))}</i>\n`;
                });
                reportMsg += `\n📁 <i>Dicatat di: <code>akun_canva_gagal.txt</code></i>\n\n`;
            }

            const finishButtons = [];
            if (isReset) {
                if (totalSuccess > 0) finishButtons.push([Markup.button.callback('📥 Download akun_canva_reset.txt', 'download_canva_reset')]);
            } else {
                if (totalSuccess > 0) finishButtons.push([Markup.button.callback('📥 Download akun_canva_terdaftar.txt', 'download_canva_daftar')]);
            }
            finishButtons.push([
                Markup.button.callback('🎨 Menu Canva', 'open_menu_canva'),
                Markup.button.callback('🏠 Menu Utama', 'back_menu')
            ]);

            if (reportMsg.length > 3900) {
                reportMsg = reportMsg.slice(0, 3850) + '\n\n<i>...(laporan dipotong karena batas karakter Telegram)...</i>';
            }

            ctx.reply(reportMsg, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard(finishButtons)
            }).catch(() => {});
        });

        botProcess.on('error', (err) => {
            addLog(`[FATAL] ${err.message}`);
            botProcess = null;
            ctx.reply(`❌ <b>Gagal menjalankan script Canva:</b> ${escapeHtml(err.message)}`, { parse_mode: 'HTML' }).catch(() => {});
        });
    }

    // ── ACTION: Pilih Plan TEAM ──
    bot.action('plan_team', async (ctx) => {
        await ctx.answerCbQuery();
        askOrRunPlan(ctx, 'teams');
    });

    // ── ACTION: Pilih Plan PRO ──
    bot.action('plan_pro', async (ctx) => {
        await ctx.answerCbQuery();
        askOrRunPlan(ctx, 'pro');
    });

    // ── ACTION: Pilih Kaitkan Email Saja ──
    bot.action('plan_bind', async (ctx) => {
        await ctx.answerCbQuery();
        askOrRunPlan(ctx, 'bind_only');
    });

    // ── ACTION: Menu Daftar Akun CapCut ──
    bot.action('menu_daftar_capcut', async (ctx) => {
        await ctx.answerCbQuery();
        if (botProcess) {
            return ctx.reply('⚠️ Bot CapCut sedang berjalan! Hentikan terlebih dahulu jika ingin memulai baru.');
        }

        const registeredPath = path.join(__dirname, 'akun_terdaftar.txt');
        const regCount = fs.existsSync(registeredPath)
            ? fs.readFileSync(registeredPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@')).length
            : 0;

        const defaultPass = process.env.daftar_password || process.env.DAFTAR_PASSWORD || process.env.password_capcut || 'masuk123';
        const domain = process.env.tmail_domain || 'arapmium.web.id';

        const text =
            `✨ <b>DAFTAR AKUN CAPCUT BARU (EMAIL ARAPMIUM)</b>\n\n` +
            `Fitur ini secara otomatis membuat akun CapCut baru melalui opsi <b>"Continue with email"</b> menggunakan email temporary <code>@${escapeHtml(domain)}</code> + password.\n\n` +
            `• <b>Default Password:</b> <code>${escapeHtml(defaultPass)}</code>\n` +
            `• <b>Format Output:</b> <code>email|password</code>\n` +
            `• <b>File Database:</b> <code>akun_terdaftar.txt</code> (Total saat ini: <b>${regCount} akun</b>)\n\n` +
            `<b>Pilih jumlah akun yang ingin didaftarkan (Maksimal 5 akun):</b>`;

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('1️⃣ 1 Akun', 'run_register_1'),
                Markup.button.callback('2️⃣ 2 Akun', 'run_register_2'),
                Markup.button.callback('3️⃣ 3 Akun', 'run_register_3'),
            ],
            [
                Markup.button.callback('4️⃣ 4 Akun', 'run_register_4'),
                Markup.button.callback('5️⃣ 5 Akun', 'run_register_5'),
            ],
            [
                Markup.button.callback('📁 Lihat Akun Terdaftar', 'view_daftar'),
                Markup.button.callback('📥 Download .txt', 'download_daftar'),
            ],
            [
                Markup.button.callback('⬅️ Menu CapCut', 'open_menu_capcut'),
                Markup.button.callback('🏠 Menu Utama', 'back_menu')
            ]
        ]);

        await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
    });

    // ── ACTION: Callback Pilih Jumlah Akun ──
    bot.action(/^run_(teams|pro|bind_only|reset_password|register|daftar)_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const planMode = ctx.match[1];
        const count = parseInt(ctx.match[2], 10);
        runBot(ctx, planMode, count);
    });

    // ── ACTION: Menu Daftar Canva ──
    bot.action('menu_canva_daftar', async (ctx) => {
        await ctx.answerCbQuery();
        if (botProcess) {
            return ctx.reply('⚠️ Bot sedang berjalan! Hentikan terlebih dahulu jika ingin memulai baru.');
        }

        const canvaPath = path.join(__dirname, 'akun_canva.txt');
        const regPath = path.join(__dirname, 'akun_canva_terdaftar.txt');
        const queueAccounts = fs.existsSync(canvaPath)
            ? fs.readFileSync(canvaPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@'))
            : [];
        const regCount = fs.existsSync(regPath)
            ? fs.readFileSync(regPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@')).length
            : 0;

        const defaultPass = process.env.canva_password || process.env.new_password || process.env.daftar_password || 'masuk123';

        if (queueAccounts.length === 0) {
            return ctx.reply(
                `⚠️ <b>Antrean Akun Canva Kosong!</b>\n\n` +
                `File <code>akun_canva.txt</code> belum memiliki akun Outlook untuk didaftarkan.\n\n` +
                `Silakan gunakan menu <b>📝 Input Akun Canva</b> untuk memasukkan akun Outlook (format: <code>email|pass|token|id</code> atau <code>email|pass</code>).`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('📝 Input Akun Canva Sekarang', 'menu_input_canva')],
                        [Markup.button.callback('📁 Lihat Akun Terdaftar', 'view_canva_terdaftar')],
                        [
                            Markup.button.callback('⬅️ Menu Canva', 'open_menu_canva'),
                            Markup.button.callback('🏠 Menu Utama', 'back_menu')
                        ]
                    ])
                }
            );
        }

        const text =
            `🎨 <b>DAFTAR AKUN BARU CANVA (VIA OUTLOOK OTP)</b>\n\n` +
            `Fitur ini membuat akun Canva baru via opsi <b>"Continue with email"</b>, menarik kode OTP 6-digit dari inbox Outlook via <code>outlookreader.my.id</code>, dan memasang kata sandi.\n\n` +
            `• <b>Default Password:</b> <code>${escapeHtml(defaultPass)}</code>\n` +
            `• <b>Format Output:</b> <code>email|password</code>\n` +
            `• <b>Tersedia di Antrean:</b> <b>${queueAccounts.length} akun</b>\n` +
            `• <b>Sudah Terdaftar:</b> ${regCount} akun\n\n` +
            `<b>Pilih jumlah akun yang ingin didaftarkan:</b>`;

        const maxSelect = Math.min(queueAccounts.length, 5);
        const btns = [];
        for (let i = 1; i <= maxSelect; i++) {
            btns.push(Markup.button.callback(`${i} Akun`, `run_canva_signup_${i}`));
        }
        if (queueAccounts.length > 5) {
            btns.push(Markup.button.callback(`Semua (${queueAccounts.length})`, `run_canva_signup_${queueAccounts.length}`));
        }

        const rows = [];
        while (btns.length > 0) {
            rows.push(btns.splice(0, 3));
        }
        rows.push([
            Markup.button.callback('📁 Canva Terdaftar', 'view_canva_terdaftar'),
            Markup.button.callback('📝 Input Akun', 'menu_input_canva')
        ]);
        rows.push([
            Markup.button.callback('⬅️ Menu Canva', 'open_menu_canva'),
            Markup.button.callback('🏠 Menu Utama', 'back_menu')
        ]);

        ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
    });

    // ── ACTION: Menu Reset Canva ──
    bot.action('menu_canva_reset', async (ctx) => {
        await ctx.answerCbQuery();
        if (botProcess) {
            return ctx.reply('⚠️ Bot sedang berjalan! Hentikan terlebih dahulu jika ingin memulai baru.');
        }

        const canvaPath = path.join(__dirname, 'akun_canva.txt');
        const resetPath = path.join(__dirname, 'akun_canva_reset.txt');
        const queueAccounts = fs.existsSync(canvaPath)
            ? fs.readFileSync(canvaPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@'))
            : [];
        const resetCount = fs.existsSync(resetPath)
            ? fs.readFileSync(resetPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@')).length
            : 0;

        const defaultPass = process.env.canva_password || process.env.new_password || process.env.daftar_password || 'masuk123';

        if (queueAccounts.length === 0) {
            return ctx.reply(
                `⚠️ <b>Antrean Akun Canva Kosong!</b>\n\n` +
                `File <code>akun_canva.txt</code> belum memiliki akun Outlook untuk di-reset.\n\n` +
                `Silakan gunakan menu <b>📝 Input Akun Canva</b> untuk memasukkan akun Outlook.`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('📝 Input Akun Canva Sekarang', 'menu_input_canva')],
                        [Markup.button.callback('🔐 Lihat Canva Ter-Reset', 'view_canva_reset')],
                        [
                            Markup.button.callback('⬅️ Menu Canva', 'open_menu_canva'),
                            Markup.button.callback('🏠 Menu Utama', 'back_menu')
                        ]
                    ])
                }
            );
        }

        const text =
            `🔑 <b>RESET PASSWORD AKUN CANVA</b>\n\n` +
            `Fitur ini membuka halaman lupa sandi Canva, menarik link/kode reset dari inbox Outlook via <code>outlookreader.my.id</code>, dan memasang kata sandi baru.\n\n` +
            `• <b>Password Baru:</b> <code>${escapeHtml(defaultPass)}</code>\n` +
            `• <b>Format Output:</b> <code>email|new_password</code>\n` +
            `• <b>Tersedia di Antrean:</b> <b>${queueAccounts.length} akun</b>\n` +
            `• <b>Sudah Di-reset:</b> ${resetCount} akun\n\n` +
            `<b>Pilih jumlah akun yang ingin di-reset:</b>`;

        const maxSelect = Math.min(queueAccounts.length, 5);
        const btns = [];
        for (let i = 1; i <= maxSelect; i++) {
            btns.push(Markup.button.callback(`${i} Akun`, `run_canva_reset_${i}`));
        }
        if (queueAccounts.length > 5) {
            btns.push(Markup.button.callback(`Semua (${queueAccounts.length})`, `run_canva_reset_${queueAccounts.length}`));
        }

        const rows = [];
        while (btns.length > 0) {
            rows.push(btns.splice(0, 3));
        }
        rows.push([
            Markup.button.callback('🔐 Canva Ter-Reset', 'view_canva_reset'),
            Markup.button.callback('📝 Input Akun', 'menu_input_canva')
        ]);
        rows.push([
            Markup.button.callback('⬅️ Menu Canva', 'open_menu_canva'),
            Markup.button.callback('🏠 Menu Utama', 'back_menu')
        ]);

        ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
    });

    // ── ACTION: Run Canva Action Callback ──
    bot.action(/^run_canva_(signup|reset)_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const action = ctx.match[1];
        const count = parseInt(ctx.match[2], 10);
        runCanva(ctx, action, count);
    });

    // ── ACTION: Menu Input Akun Canva ──
    bot.action('menu_input_canva', async (ctx) => {
        await ctx.answerCbQuery();
        const canvaPath = path.join(__dirname, 'akun_canva.txt');
        const count = fs.existsSync(canvaPath)
            ? fs.readFileSync(canvaPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@')).length
            : 0;

        ctx.reply(
            `📝 <b>Pusat Pengelolaan Akun Canva (Outlook)</b>\n\n` +
            `• <b>Jumlah Akun di Antrean:</b> <b>${count} akun</b>\n` +
            `• <b>File Database:</b> <code>akun_canva.txt</code>\n\n` +
            `<b>Format yang Didukung:</b>\n` +
            `1. <code>email|password|refresh_token|client_id</code> <i>(OAuth2 Recommended)</i>\n` +
            `2. <code>email|password|token</code>\n` +
            `3. <code>email|password</code>\n\n` +
            `Pilih aksi di bawah ini:`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Tambah Akun (Append)', 'set_canva_input_append')],
                    [Markup.button.callback('🔄 Ganti Semua Akun (Replace)', 'set_canva_input_replace')],
                    [Markup.button.callback('📥 Download akun_canva.txt', 'download_canva_queue')],
                    [Markup.button.callback('🗑️ Bersihkan Antrean', 'clear_canva_queue')],
                    [
                        Markup.button.callback('⬅️ Menu Canva', 'open_menu_canva'),
                        Markup.button.callback('🏠 Menu Utama', 'back_menu')
                    ]
                ])
            }
        );
    });

    bot.action('set_canva_input_append', async (ctx) => {
        await ctx.answerCbQuery();
        userState[ctx.chat.id] = { step: 'waiting_canva_accounts', mode: 'append' };
        ctx.reply(
            `➕ <b>Mode Tambah Akun Canva (Append) Aktif</b>\n\n` +
            `Kirimkan teks daftar akun Outlook/Hotmail ke chat ini sekarang.\n\n` +
            `<b>Format per baris:</b>\n` +
            `<code>email|password|token|id</code> atau <code>email|password</code>\n\n` +
            `<i>(Bisa kirim teks atau upload file dokumen .txt)\n` +
            `Ketik /cancel atau /batal untuk membatalkan.</i>`,
            { parse_mode: 'HTML' }
        );
    });

    bot.action('set_canva_input_replace', async (ctx) => {
        await ctx.answerCbQuery();
        userState[ctx.chat.id] = { step: 'waiting_canva_accounts', mode: 'replace' };
        ctx.reply(
            `🔄 <b>Mode Ganti Semua Akun Canva (Replace) Aktif</b>\n\n` +
            `⚠️ <i>Perhatian: Daftar akun lama di <code>akun_canva.txt</code> akan ditimpa!</i>\n\n` +
            `Kirimkan teks daftar akun baru ke chat ini sekarang.\n` +
            `Format per baris: <code>email|pass|token|id</code> atau <code>email|pass</code>\n\n` +
            `<i>Ketik /cancel atau /batal untuk membatalkan.</i>`,
            { parse_mode: 'HTML' }
        );
    });

    bot.action('download_canva_queue', async (ctx) => {
        await ctx.answerCbQuery();
        const canvaPath = path.join(__dirname, 'akun_canva.txt');
        if (fs.existsSync(canvaPath) && fs.readFileSync(canvaPath, 'utf8').trim()) {
            const count = fs.readFileSync(canvaPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@')).length;
            await ctx.replyWithDocument(
                { source: canvaPath, filename: 'akun_canva.txt' },
                { caption: `📋 Antrean akun Canva Outlook (${count} akun)` }
            );
        } else {
            ctx.reply('ℹ️ File akun_canva.txt masih kosong.');
        }
    });

    bot.action('clear_canva_queue', async (ctx) => {
        await ctx.answerCbQuery();
        const canvaPath = path.join(__dirname, 'akun_canva.txt');
        if (fs.existsSync(canvaPath)) {
            fs.writeFileSync(canvaPath, '', 'utf8');
        }
        ctx.reply('🗑️ <b>Antrean akun_canva.txt berhasil dikosongkan!</b>', { parse_mode: 'HTML', ...canvaMenu() });
    });

    // ── ACTION: Lihat Akun Canva Terdaftar ──
    bot.action('view_canva_terdaftar', async (ctx) => {
        await ctx.answerCbQuery();
        const regPath = path.join(__dirname, 'akun_canva_terdaftar.txt');
        if (!fs.existsSync(regPath)) {
            return ctx.reply('ℹ️ Belum ada akun Canva yang terdaftar. File akun_canva_terdaftar.txt belum dibuat.', canvaMenu());
        }
        const lines = fs.readFileSync(regPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@'));
        if (lines.length === 0) {
            return ctx.reply('ℹ️ File akun_canva_terdaftar.txt masih kosong.', canvaMenu());
        }
        const total = lines.length;
        const recent = lines.slice(-10);
        const text =
            `🎨 <b>Daftar Akun Canva yang Berhasil Didaftarkan:</b>\n` +
            `• Total akun terdaftar: <b>${total} akun</b>\n\n` +
            `<b>10 Akun Terakhir:</b>\n` +
            recent.map((l, i) => `${total - recent.length + 1 + i}. <code>${escapeHtml(l)}</code>`).join('\n') +
            `\n\n📁 <i>File: <code>akun_canva_terdaftar.txt</code></i>`;

        ctx.reply(text, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📥 Download akun_canva_terdaftar.txt', 'download_canva_daftar')],
                [Markup.button.callback('🗑️ Bersihkan Riwayat Terdaftar', 'clear_canva_daftar')],
                [
                    Markup.button.callback('⬅️ Menu Canva', 'open_menu_canva'),
                    Markup.button.callback('🏠 Menu Utama', 'back_menu')
                ],
            ])
        });
    });

    bot.action('download_canva_daftar', async (ctx) => {
        await ctx.answerCbQuery();
        const regPath = path.join(__dirname, 'akun_canva_terdaftar.txt');
        if (fs.existsSync(regPath) && fs.readFileSync(regPath, 'utf8').trim()) {
            const count = fs.readFileSync(regPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@')).length;
            await ctx.replyWithDocument(
                { source: regPath, filename: 'akun_canva_terdaftar.txt' },
                { caption: `🎨 Daftar akun Canva terdaftar (${count} akun | format: email|password)` }
            );
        } else {
            ctx.reply('ℹ️ File akun_canva_terdaftar.txt kosong.');
        }
    });

    bot.action('clear_canva_daftar', async (ctx) => {
        await ctx.answerCbQuery();
        const regPath = path.join(__dirname, 'akun_canva_terdaftar.txt');
        if (fs.existsSync(regPath)) {
            fs.writeFileSync(regPath, '', 'utf8');
        }
        ctx.reply('🗑️ <b>Riwayat akun_canva_terdaftar.txt berhasil dibersihkan!</b>', { parse_mode: 'HTML', ...canvaMenu() });
    });

    // ── ACTION: Lihat Akun Canva Reset ──
    bot.action('view_canva_reset', async (ctx) => {
        await ctx.answerCbQuery();
        const resetPath = path.join(__dirname, 'akun_canva_reset.txt');
        if (!fs.existsSync(resetPath)) {
            return ctx.reply('ℹ️ Belum ada akun Canva yang di-reset. File akun_canva_reset.txt belum dibuat.', canvaMenu());
        }
        const lines = fs.readFileSync(resetPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@'));
        if (lines.length === 0) {
            return ctx.reply('ℹ️ File akun_canva_reset.txt masih kosong.', canvaMenu());
        }
        const total = lines.length;
        const recent = lines.slice(-10);
        const text =
            `🔑 <b>Daftar Akun Canva yang Berhasil Di-Reset:</b>\n` +
            `• Total akun di-reset: <b>${total} akun</b>\n\n` +
            `<b>10 Akun Terakhir:</b>\n` +
            recent.map((l, i) => `${total - recent.length + 1 + i}. <code>${escapeHtml(l)}</code>`).join('\n') +
            `\n\n📁 <i>File: <code>akun_canva_reset.txt</code></i>`;

        ctx.reply(text, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📥 Download akun_canva_reset.txt', 'download_canva_reset')],
                [Markup.button.callback('🗑️ Bersihkan Riwayat Reset', 'clear_canva_reset')],
                [
                    Markup.button.callback('⬅️ Menu Canva', 'open_menu_canva'),
                    Markup.button.callback('🏠 Menu Utama', 'back_menu')
                ],
            ])
        });
    });

    bot.action('download_canva_reset', async (ctx) => {
        await ctx.answerCbQuery();
        const resetPath = path.join(__dirname, 'akun_canva_reset.txt');
        if (fs.existsSync(resetPath) && fs.readFileSync(resetPath, 'utf8').trim()) {
            const count = fs.readFileSync(resetPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@')).length;
            await ctx.replyWithDocument(
                { source: resetPath, filename: 'akun_canva_reset.txt' },
                { caption: `🔑 Daftar akun Canva di-reset (${count} akun | format: email|new_password)` }
            );
        } else {
            ctx.reply('ℹ️ File akun_canva_reset.txt kosong.');
        }
    });

    bot.action('clear_canva_reset', async (ctx) => {
        await ctx.answerCbQuery();
        const resetPath = path.join(__dirname, 'akun_canva_reset.txt');
        if (fs.existsSync(resetPath)) {
            fs.writeFileSync(resetPath, '', 'utf8');
        }
        ctx.reply('🗑️ <b>Riwayat akun_canva_reset.txt berhasil dibersihkan!</b>', { parse_mode: 'HTML', ...canvaMenu() });
    });

    // ── ACTION: Lihat Akun Canva Gagal ──
    bot.action('view_canva_gagal', async (ctx) => {
        await ctx.answerCbQuery();
        const gagalPath = path.join(__dirname, 'akun_canva_gagal.txt');
        if (!fs.existsSync(gagalPath) || !fs.readFileSync(gagalPath, 'utf8').trim()) {
            return ctx.reply('✅ <b>Belum ada akun Canva yang gagal!</b>', { parse_mode: 'HTML', ...canvaMenu() });
        }
        const lines = fs.readFileSync(gagalPath, 'utf8').split('\n').filter(l => l.trim());
        const preview = lines.slice(-5).map((l, i) => `${lines.length - 4 + i}. <code>${escapeHtml(l.slice(0, 80))}</code>`).join('\n');

        ctx.reply(
            `❌ <b>Daftar Akun Canva Gagal:</b>\n` +
            `• Total gagal: <b>${lines.length} akun</b>\n\n` +
            `<b>5 Terakhir:</b>\n${preview}`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📥 Download akun_canva_gagal.txt', 'download_canva_gagal')],
                    [Markup.button.callback('🗑️ Bersihkan File Gagal', 'clear_canva_gagal')],
                    [
                        Markup.button.callback('⬅️ Menu Canva', 'open_menu_canva'),
                        Markup.button.callback('🏠 Menu Utama', 'back_menu')
                    ],
                ])
            }
        );
    });

    bot.action('download_canva_gagal', async (ctx) => {
        await ctx.answerCbQuery();
        const gagalPath = path.join(__dirname, 'akun_canva_gagal.txt');
        if (fs.existsSync(gagalPath) && fs.readFileSync(gagalPath, 'utf8').trim()) {
            await ctx.replyWithDocument(
                { source: gagalPath, filename: 'akun_canva_gagal.txt' },
                { caption: '❌ Daftar akun Canva yang gagal diproses' }
            );
        } else {
            ctx.reply('✅ File akun_canva_gagal.txt kosong.');
        }
    });

    bot.action('clear_canva_gagal', async (ctx) => {
        await ctx.answerCbQuery();
        const gagalPath = path.join(__dirname, 'akun_canva_gagal.txt');
        if (fs.existsSync(gagalPath)) {
            fs.writeFileSync(gagalPath, '', 'utf8');
        }
        ctx.reply('🗑️ <b>File akun_canva_gagal.txt berhasil dibersihkan!</b>', { parse_mode: 'HTML', ...canvaMenu() });
    });

    // ── ACTION: Menu Daftar + Join Tim ──
    bot.action('menu_daftar_join', async (ctx) => {
        await ctx.answerCbQuery();
        if (botProcess) {
            return ctx.reply('⚠️ Bot CapCut sedang berjalan! Hentikan terlebih dahulu jika ingin memulai baru.');
        }
        delete pendingInput[ctx.chat.id];
        userState[ctx.chat.id] = { step: 'waiting_join_link_daftar' };
        ctx.reply(
            `✨ <b>DAFTAR AKUN BARU + JOIN TIM CAPCUT</b>\n\n` +
            `Fitur ini secara otomatis:\n` +
            `1️⃣ Mendaftarkan akun CapCut baru dengan email temporary <code>@${escapeHtml(process.env.tmail_domain || 'arapmium.web.id')}</code> + password.\n` +
            `2️⃣ Menyimpan data akun ke <code>akun_terdaftar.txt</code> (format: <code>email|password</code>).\n` +
            `3️⃣ Membuka link undangan tim dan otomatis klik <b>Submit / Join space</b>.\n` +
            `4️⃣ Mencatat riwayat join ke <code>akun_join_tim.txt</code>.\n\n` +
            `🔗 <b>Silakan kirimkan Link Undangan / Join Tim CapCut Anda:</b>\n` +
            `<i>Contoh:</i> <code>https://www.capcut.com/sv2/ZS9DUNV6BxA7W-hcWGC</code>\n\n` +
            `<i>Ketik link di chat atau kirim /cancel untuk batal.</i>`,
            { parse_mode: 'HTML' }
        );
    });

    // ── ACTION: Menu Masuk + Join Tim ──
    bot.action('menu_login_join', async (ctx) => {
        await ctx.answerCbQuery();
        if (botProcess) {
            return ctx.reply('⚠️ Bot CapCut sedang berjalan! Hentikan terlebih dahulu jika ingin memulai baru.');
        }
        delete pendingInput[ctx.chat.id];
        userState[ctx.chat.id] = { step: 'waiting_join_link_login' };
        ctx.reply(
            `🔑 <b>MASUK (LOGIN) + JOIN TIM CAPCUT</b>\n\n` +
            `Fitur ini menggunakan akun CapCut yang sudah ada untuk login melalui <b>Continue with email</b>, lalu membuka link undangan tim dan otomatis klik <b>Submit / Join space</b>.\n\n` +
            `🔗 <b>Silakan kirimkan Link Undangan / Join Tim CapCut Anda:</b>\n` +
            `<i>Contoh:</i> <code>https://www.capcut.com/sv2/ZS9DUNV6BxA7W-hcWGC</code>\n\n` +
            `<i>Ketik link di chat atau kirim /cancel untuk batal.</i>`,
            { parse_mode: 'HTML' }
        );
    });

    // ── ACTION: Run Daftar + Join Callback ──
    bot.action(/^run_daftar_join_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const count = parseInt(ctx.match[1], 10);
        const state = userState[ctx.chat.id];
        const link = state?.joinLink || '';
        delete userState[ctx.chat.id];
        if (!link) {
            return ctx.reply('⚠️ Link join tim belum tersimpan. Silakan mulai ulang dari menu.', capcutMenu());
        }
        runBot(ctx, 'daftar_join', count, { joinLink: link });
    });

    // ── ACTION: Login Join - Input Manual ──
    bot.action('login_join_input_manual', async (ctx) => {
        await ctx.answerCbQuery();
        const state = userState[ctx.chat.id];
        const link = state?.joinLink || '';
        userState[ctx.chat.id] = { step: 'waiting_login_join_accounts', joinLink: link };
        ctx.reply(
            `📝 <b>KIRIMKAN DAFTAR AKUN (EMAIL|PASSWORD)</b>\n\n` +
            `Silakan ketik atau paste akun CapCut yang ingin di-join ke tim dengan format:\n` +
            `<code>email|password</code> (satu akun per baris)\n\n` +
            `<i>Contoh:</i>\n` +
            `<code>user1@arapmium.web.id|masuk123\nuser2@arapmium.web.id|masuk123</code>\n\n` +
            `<i>Ketik akun di chat atau kirim /cancel untuk batal.</i>`,
            { parse_mode: 'HTML' }
        );
    });

    // ── ACTION: Login Join - Ambil dari akun_terdaftar.txt ──
    bot.action('login_join_from_terdaftar', async (ctx) => {
        await ctx.answerCbQuery();
        const state = userState[ctx.chat.id];
        const link = state?.joinLink || '';

        const regPath = path.join(__dirname, 'akun_terdaftar.txt');
        const accounts = fs.existsSync(regPath)
            ? fs.readFileSync(regPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@'))
            : [];

        if (accounts.length === 0) {
            return ctx.reply('⚠️ File akun_terdaftar.txt masih kosong. Silakan gunakan opsi Input Manual.');
        }

        const maxSel = Math.min(accounts.length, 5);
        const btns = [];
        for (let i = 1; i <= maxSel; i++) {
            btns.push(Markup.button.callback(`${i} Akun`, `run_login_join_td_${i}`));
        }
        if (accounts.length > 5) {
            btns.push(Markup.button.callback(`Semua (${accounts.length})`, `run_login_join_td_${accounts.length}`));
        }
        const rows = [];
        while (btns.length > 0) {
            rows.push(btns.splice(0, 3));
        }
        rows.push([
            Markup.button.callback('⬅️ Menu CapCut', 'open_menu_capcut'),
            Markup.button.callback('🏠 Menu Utama', 'back_menu')
        ]);

        ctx.reply(
            `🎯 <b>Pilih Jumlah Akun dari akun_terdaftar.txt:</b>\n\n` +
            `• <b>Tersedia:</b> ${accounts.length} akun\n` +
            `• <b>Link Tim:</b> <code>${escapeHtml(link)}</code>\n\n` +
            `Pilih berapa akun yang ingin di-join ke tim:`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
        );
    });

    // ── ACTION: Run Login Join Terdaftar Callback ──
    bot.action(/^run_login_join_td_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const count = parseInt(ctx.match[1], 10);
        const state = userState[ctx.chat.id];
        const link = state?.joinLink || '';

        const regPath = path.join(__dirname, 'akun_terdaftar.txt');
        const allAccs = fs.existsSync(regPath)
            ? fs.readFileSync(regPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@'))
            : [];

        const picked = count > 0 ? allAccs.slice(0, count) : allAccs;
        const targetPath = path.join(__dirname, 'akun_login_join.txt');
        fs.writeFileSync(targetPath, picked.join('\n') + '\n', 'utf8');

        delete userState[ctx.chat.id];
        runBot(ctx, 'login_join', count, { joinLink: link, accountsFile: targetPath });
    });

    // ── ACTION: Run Login Join Manual Callback ──
    bot.action(/^run_login_join_manual_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const count = parseInt(ctx.match[1], 10);
        const state = userState[ctx.chat.id];
        const link = state?.joinLink || '';
        delete userState[ctx.chat.id];
        const targetPath = path.join(__dirname, 'akun_login_join.txt');
        runBot(ctx, 'login_join', count, { joinLink: link, accountsFile: targetPath });
    });

    // ── ACTION: Menu Reset Password ──
    bot.action('menu_reset_password', async (ctx) => {
        await ctx.answerCbQuery();
        const newPassEnv = process.env.new_password || 'masuk123';
        const terkaitPath = path.join(__dirname, 'akun_terkait.txt');
        const resetPath = path.join(__dirname, 'akun_reset_password.txt');
        const terkaitCount = fs.existsSync(terkaitPath)
            ? fs.readFileSync(terkaitPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@')).length
            : 0;
        const resetCount = fs.existsSync(resetPath)
            ? fs.readFileSync(resetPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@')).length
            : 0;

        ctx.reply(
            `🔑 <b>Pusat Reset / Forgot Password CapCut</b>\n\n` +
            `Fitur ini membuka halaman lupa sandi CapCut, menarik link reset via ArapMium (<code>@${escapeHtml(process.env.tmail_domain || 'arapmium.web.id')}</code>), dan mengatur kata sandi baru.\n\n` +
            `• <b>Password Baru:</b> <code>${escapeHtml(newPassEnv)}</code> <i>(diatur di .env)</i>\n` +
            `• <b>Akun Terkait Tersedia:</b> ${terkaitCount} akun\n` +
            `• <b>Akun Sudah Di-reset:</b> ${resetCount} akun\n\n` +
            `Pilih metode di bawah:`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🚀 Jalankan Reset dari Akun Terkait', 'reset_from_terkait')],
                    [Markup.button.callback('📝 Input Manual Email ArapMium', 'reset_input_manual')],
                    [Markup.button.callback('🔐 Lihat Akun Ter-Reset', 'view_reset')],
                    [
                        Markup.button.callback('⬅️ Menu CapCut', 'open_menu_capcut'),
                        Markup.button.callback('🏠 Menu Utama', 'back_menu')
                    ],
                ])
            }
        );
    });

    // ── ACTION: Reset dari Akun Terkait ──
    bot.action('reset_from_terkait', async (ctx) => {
        await ctx.answerCbQuery();
        const terkaitPath = path.join(__dirname, 'akun_terkait.txt');
        if (!fs.existsSync(terkaitPath) || !fs.readFileSync(terkaitPath, 'utf8').trim()) {
            return ctx.reply(
                `⚠️ <b>File akun_terkait.txt masih kosong!</b>\n\n` +
                `Silakan gunakan mode <b>🔗 Kaitkan Email Saja</b> terlebih dahulu atau gunakan menu <b>📝 Input Manual Email ArapMium</b> untuk mereset password.`,
                { parse_mode: 'HTML', ...capcutMenu() }
            );
        }
        askOrRunPlan(ctx, 'reset_password');
    });

    // ── ACTION: Reset Input Manual ──
    bot.action('reset_input_manual', async (ctx) => {
        await ctx.answerCbQuery();
        userState[ctx.chat.id] = { step: 'waiting_reset_emails' };
        ctx.reply(
            `📝 <b>Input Manual Email Target Reset Password</b>\n\n` +
            `Kirimkan daftar email <code>@arapmium.web.id</code> yang ingin di-reset password-nya ke chat ini sekarang.\n\n` +
            `<b>Format per baris:</b>\n` +
            `<code>namaakun@arapmium.web.id</code>\n` +
            `<code>namaakun2@arapmium.web.id</code>\n\n` +
            `<i>(Bisa juga upload file .txt yang berisi daftar email)\n` +
            `Ketik /batal untuk membatalkan.</i>`,
            { parse_mode: 'HTML' }
        );
    });
    // ── ACTION: Hentikan Bot ──
    bot.action('stop_bot', async (ctx) => {
        await ctx.answerCbQuery();
        if (!botProcess) {
            return ctx.reply('⚠️ Tidak ada proses bot yang sedang berjalan.');
        }
        botProcess.kill('SIGINT');
        botProcess = null;
        addLog('[STOP] Bot dihentikan paksa via Telegram');
        ctx.reply('🛑 Proses bot berhasil dihentikan.', mainMenu());
    });

    // ── ACTION: Lihat Log Terakhir ──
    bot.action('view_log', async (ctx) => {
        await ctx.answerCbQuery();
        if (logBuffer.length === 0) {
            return ctx.reply('📋 Belum ada log. Mulai bot terlebih dahulu.');
        }
        const logText = logBuffer.map((l, i) => `${i + 1}. ${l}`).join('\n');
        // Telegram max message 4096 chars
        const trimmed = logText.length > 3800 ? '...\n' + logText.slice(-3800) : logText;
        ctx.reply(`📋 *Log Terakhir (${logBuffer.length} baris):*\n\`\`\`\n${trimmed}\n\`\`\``, { parse_mode: 'Markdown' });
    });

    // ── ACTION: Lihat Hasil (result.txt) ──
    bot.action('view_result', async (ctx) => {
        await ctx.answerCbQuery();
        const resultPath = path.join(__dirname, 'result.txt');
        if (!fs.existsSync(resultPath)) {
            return ctx.reply('⚠️ File result.txt belum ada. Bot mungkin belum pernah dijalankan.');
        }
        const content = fs.readFileSync(resultPath, 'utf8').trim();
        if (!content || content === 'email:password:link_cashier') {
            return ctx.reply('⚠️ File result.txt masih kosong (belum ada link cashier).');
        }
        // Kirim sebagai file agar mudah di-download
        await ctx.replyWithDocument(
            { source: resultPath, filename: 'result.txt' },
            { caption: `📄 Hasil bot (${content.split('\n').length - 1} link)` }
        );
    });

    // ── ACTION: Lihat Akun Gagal (akun_gagal.txt) ──
    bot.action('view_gagal', async (ctx) => {
        await ctx.answerCbQuery();
        const gagalPath = path.join(__dirname, 'akun_gagal.txt');
        if (!fs.existsSync(gagalPath)) {
            return ctx.reply('✅ <b>Belum ada akun yang gagal!</b> File akun_gagal.txt belum dibuat.', { parse_mode: 'HTML', ...capcutMenu() });
        }
        const content = fs.readFileSync(gagalPath, 'utf8').trim();
        if (!content) {
            return ctx.reply('✅ <b>File akun_gagal.txt masih kosong.</b> Belum ada akun yang gagal.', { parse_mode: 'HTML', ...capcutMenu() });
        }
        const lines = content.split('\n').filter(l => l.trim());
        const preview = lines.slice(-5).map((l, i) => `${lines.length - 4 + i}. <code>${escapeHtml(l.slice(0, 70))}</code>`).join('\n');

        await ctx.reply(
            `❌ <b>Daftar Akun Gagal:</b>\n` +
            `• Total gagal: <b>${lines.length} akun</b>\n\n` +
            `<b>5 Terakhir:</b>\n${preview}`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📥 Download akun_gagal.txt', 'download_gagal')],
                    [Markup.button.callback('🗑️ Hapus Semua Akun Gagal', 'clear_gagal')],
                    [
                        Markup.button.callback('⬅️ Menu CapCut', 'open_menu_capcut'),
                        Markup.button.callback('🏠 Menu Utama', 'back_menu')
                    ],
                ])
            }
        );
    });

    bot.action('download_gagal', async (ctx) => {
        await ctx.answerCbQuery();
        const gagalPath = path.join(__dirname, 'akun_gagal.txt');
        if (fs.existsSync(gagalPath) && fs.readFileSync(gagalPath, 'utf8').trim()) {
            const count = fs.readFileSync(gagalPath, 'utf8').split('\n').filter(l => l.trim()).length;
            await ctx.replyWithDocument(
                { source: gagalPath, filename: 'akun_gagal.txt' },
                { caption: `❌ File akun gagal (${count} akun)` }
            );
        } else {
            ctx.reply('✅ File akun_gagal.txt kosong.');
        }
    });

    bot.action('clear_gagal', async (ctx) => {
        await ctx.answerCbQuery();
        const gagalPath = path.join(__dirname, 'akun_gagal.txt');
        if (fs.existsSync(gagalPath)) {
            fs.writeFileSync(gagalPath, '', 'utf8');
        }
        ctx.reply('🗑️ <b>Daftar akun gagal berhasil dibersihkan!</b>', { parse_mode: 'HTML', ...capcutMenu() });
    });

    // ── ACTION: Lihat Akun Terkait (akun_terkait.txt) ──
    bot.action('view_terkait', async (ctx) => {
        await ctx.answerCbQuery();
        const terkaitPath = path.join(__dirname, 'akun_terkait.txt');
        if (!fs.existsSync(terkaitPath)) {
            return ctx.reply('ℹ️ Belum ada akun yang dikaitkan email. File akun_terkait.txt belum dibuat.', capcutMenu());
        }
        const content = fs.readFileSync(terkaitPath, 'utf8').trim();
        if (!content) {
            return ctx.reply('ℹ️ File akun_terkait.txt masih kosong.', capcutMenu());
        }
        const lines = content.split('\n').filter(l => l.trim());
        const preview = lines.slice(-5).map((l, i) => `${lines.length - 4 + i}. <code>${escapeHtml(l.slice(0, 70))}</code>`).join('\n');

        await ctx.reply(
            `🔗 <b>Daftar Akun yang Berhasil Dikaitkan Email:</b>\n` +
            `• Total akun terkait: <b>${lines.length} akun</b>\n\n` +
            `<b>5 Terakhir:</b>\n${preview}`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📥 Download akun_terkait.txt', 'download_terkait')],
                    [Markup.button.callback('🗑️ Bersihkan Daftar', 'clear_terkait')],
                    [
                        Markup.button.callback('⬅️ Menu CapCut', 'open_menu_capcut'),
                        Markup.button.callback('🏠 Menu Utama', 'back_menu')
                    ],
                ])
            }
        );
    });

    bot.action('download_terkait', async (ctx) => {
        await ctx.answerCbQuery();
        const terkaitPath = path.join(__dirname, 'akun_terkait.txt');
        if (fs.existsSync(terkaitPath) && fs.readFileSync(terkaitPath, 'utf8').trim()) {
            const count = fs.readFileSync(terkaitPath, 'utf8').split('\n').filter(l => l.trim()).length;
            await ctx.replyWithDocument(
                { source: terkaitPath, filename: 'akun_terkait.txt' },
                { caption: `🔗 File daftar akun terkait email (${count} akun)` }
            );
        } else {
            ctx.reply('ℹ️ File akun_terkait.txt kosong.');
        }
    });

    bot.action('clear_terkait', async (ctx) => {
        await ctx.answerCbQuery();
        const terkaitPath = path.join(__dirname, 'akun_terkait.txt');
        if (fs.existsSync(terkaitPath)) {
            fs.writeFileSync(terkaitPath, '', 'utf8');
        }
        ctx.reply('🗑️ <b>Daftar akun terkait email berhasil dibersihkan!</b>', { parse_mode: 'HTML', ...capcutMenu() });
    });

    // ── ACTION: Lihat Akun Ter-Reset (akun_reset_password.txt) ──
    bot.action('view_reset', async (ctx) => {
        await ctx.answerCbQuery();
        const resetPath = path.join(__dirname, 'akun_reset_password.txt');
        if (!fs.existsSync(resetPath)) {
            return ctx.reply('ℹ️ Belum ada akun yang di-reset password. File akun_reset_password.txt belum dibuat.', capcutMenu());
        }
        const content = fs.readFileSync(resetPath, 'utf8').trim();
        if (!content) {
            return ctx.reply('ℹ️ File akun_reset_password.txt masih kosong.', capcutMenu());
        }
        const lines = content.split('\n').filter(l => l.trim());
        const preview = lines.slice(-5).map((l, i) => `${lines.length - 4 + i}. <code>${escapeHtml(l.slice(0, 70))}</code>`).join('\n');

        await ctx.reply(
            `🔐 <b>Daftar Akun yang Berhasil Di-Reset Password:</b>\n` +
            `• Total akun ter-reset: <b>${lines.length} akun</b>\n\n` +
            `<b>5 Terakhir:</b>\n${preview}`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📥 Download akun_reset_password.txt', 'download_reset')],
                    [Markup.button.callback('🗑️ Bersihkan Daftar', 'clear_reset')],
                    [
                        Markup.button.callback('⬅️ Menu CapCut', 'open_menu_capcut'),
                        Markup.button.callback('🏠 Menu Utama', 'back_menu')
                    ],
                ])
            }
        );
    });

    bot.action('download_reset', async (ctx) => {
        await ctx.answerCbQuery();
        const resetPath = path.join(__dirname, 'akun_reset_password.txt');
        if (fs.existsSync(resetPath) && fs.readFileSync(resetPath, 'utf8').trim()) {
            const count = fs.readFileSync(resetPath, 'utf8').split('\n').filter(l => l.trim()).length;
            await ctx.replyWithDocument(
                { source: resetPath, filename: 'akun_reset_password.txt' },
                { caption: `🔐 File daftar akun ter-reset password (${count} akun)` }
            );
        } else {
            ctx.reply('ℹ️ File akun_reset_password.txt kosong.');
        }
    });

    bot.action('clear_reset', async (ctx) => {
        await ctx.answerCbQuery();
        const resetPath = path.join(__dirname, 'akun_reset_password.txt');
        if (fs.existsSync(resetPath)) {
            fs.writeFileSync(resetPath, '', 'utf8');
        }
        ctx.reply('🗑️ <b>Daftar akun ter-reset password berhasil dibersihkan!</b>', { parse_mode: 'HTML', ...capcutMenu() });
    });

    // ── ACTION: Lihat Akun Terdaftar (akun_terdaftar.txt) ──
    bot.action('view_daftar', async (ctx) => {
        await ctx.answerCbQuery();
        const daftarPath = path.join(__dirname, 'akun_terdaftar.txt');
        if (!fs.existsSync(daftarPath)) {
            return ctx.reply('ℹ️ Belum ada akun yang didaftarkan. File akun_terdaftar.txt belum dibuat.', capcutMenu());
        }
        const content = fs.readFileSync(daftarPath, 'utf8').trim();
        if (!content) {
            return ctx.reply('ℹ️ File akun_terdaftar.txt masih kosong.', capcutMenu());
        }
        const lines = content.split('\n').filter(l => l.trim() && l.includes('@'));
        const preview = lines.slice(-5).map((l, i) => `${lines.length - 4 + i}. <code>${escapeHtml(l.slice(0, 75))}</code>`).join('\n');

        await ctx.reply(
            `📁 <b>Daftar Akun CapCut Terdaftar (Email ArapMium):</b>\n` +
            `• Total akun terdaftar: <b>${lines.length} akun</b>\n` +
            `• Format: <code>email|password</code>\n\n` +
            `<b>5 Akun Terakhir:</b>\n${preview}`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📥 Download akun_terdaftar.txt', 'download_daftar')],
                    [Markup.button.callback('🗑️ Bersihkan Daftar', 'clear_daftar')],
                    [
                        Markup.button.callback('⬅️ Menu CapCut', 'open_menu_capcut'),
                        Markup.button.callback('🏠 Menu Utama', 'back_menu')
                    ],
                ])
            }
        );
    });

    bot.action('download_daftar', async (ctx) => {
        await ctx.answerCbQuery();
        const daftarPath = path.join(__dirname, 'akun_terdaftar.txt');
        if (fs.existsSync(daftarPath) && fs.readFileSync(daftarPath, 'utf8').trim()) {
            const count = fs.readFileSync(daftarPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@')).length;
            await ctx.replyWithDocument(
                { source: daftarPath, filename: 'akun_terdaftar.txt' },
                { caption: `📁 File daftar akun CapCut terdaftar (${count} akun | format: email|password)` }
            );
        } else {
            ctx.reply('ℹ️ File akun_terdaftar.txt kosong.');
        }
    });

    bot.action('clear_daftar', async (ctx) => {
        await ctx.answerCbQuery();
        const daftarPath = path.join(__dirname, 'akun_terdaftar.txt');
        if (fs.existsSync(daftarPath)) {
            fs.writeFileSync(daftarPath, '', 'utf8');
        }
        ctx.reply('🗑️ <b>Daftar akun_terdaftar.txt berhasil dibersihkan!</b>', { parse_mode: 'HTML', ...capcutMenu() });
    });

    // ── ACTION: Lihat Akun Join Tim (akun_join_tim.txt) ──
    bot.action('view_join_tim', async (ctx) => {
        await ctx.answerCbQuery();
        const joinPath = path.join(__dirname, 'akun_join_tim.txt');
        if (!fs.existsSync(joinPath)) {
            return ctx.reply('ℹ️ Belum ada akun yang join tim. File akun_join_tim.txt belum dibuat.', capcutMenu());
        }
        const lines = fs.readFileSync(joinPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('|'));
        if (lines.length === 0) {
            return ctx.reply('ℹ️ File akun_join_tim.txt masih kosong.', capcutMenu());
        }
        const total = lines.length;
        const recent = lines.slice(-15);
        const text =
            `👥 <b>Daftar Akun yang Berhasil Join Tim CapCut:</b>\n` +
            `• Total akun join: <b>${total} akun</b>\n\n` +
            `<b>15 Akun Terakhir:</b>\n` +
            recent.map((l, i) => `${total - recent.length + 1 + i}. <code>${escapeHtml(l)}</code>`).join('\n\n') +
            `\n\n📁 <i>File: <code>akun_join_tim.txt</code></i>`;

        ctx.reply(text, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📥 Download akun_join_tim.txt', 'download_join_tim')],
                [Markup.button.callback('🗑️ Bersihkan Riwayat Join', 'clear_join_tim')],
                [
                    Markup.button.callback('⬅️ Menu CapCut', 'open_menu_capcut'),
                    Markup.button.callback('🏠 Menu Utama', 'back_menu')
                ],
            ])
        });
    });

    bot.action('download_join_tim', async (ctx) => {
        await ctx.answerCbQuery();
        const joinPath = path.join(__dirname, 'akun_join_tim.txt');
        if (fs.existsSync(joinPath) && fs.readFileSync(joinPath, 'utf8').trim()) {
            const count = fs.readFileSync(joinPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('|')).length;
            await ctx.replyWithDocument(
                { source: joinPath, filename: 'akun_join_tim.txt' },
                { caption: `👥 File daftar riwayat akun join tim CapCut (${count} akun | format: email|password|status|timestamp|link)` }
            );
        } else {
            ctx.reply('ℹ️ File akun_join_tim.txt kosong.');
        }
    });

    bot.action('clear_join_tim', async (ctx) => {
        await ctx.answerCbQuery();
        const joinPath = path.join(__dirname, 'akun_join_tim.txt');
        if (fs.existsSync(joinPath)) {
            fs.writeFileSync(joinPath, '', 'utf8');
        }
        ctx.reply('🗑️ <b>Riwayat akun_join_tim.txt berhasil dibersihkan!</b>', { parse_mode: 'HTML', ...capcutMenu() });
    });

    // ── Helper Simpan Akun ──
    function saveAccounts(ctx, accountsList, mode) {
        const gsuitePath = path.join(__dirname, 'gsuite');
        const donePath = path.join(__dirname, 'akun_sudah_login');

        if (mode === 'replace') {
            fs.writeFileSync(gsuitePath, accountsList.join('\n') + '\n', 'utf8');
            if (fs.existsSync(donePath)) {
                fs.writeFileSync(donePath, '', 'utf8');
            }
            return ctx.reply(
                `✅ <b>Berhasil Mengganti Semua Akun!</b>\n\n` +
                `• Total akun baru di gsuite: <b>${accountsList.length}</b>\n` +
                `• Riwayat akun selesai (<code>akun_sudah_login</code>): <b>Direset bersih</b>\n\n` +
                `Sekarang Anda bisa langsung memilih mode untuk memulai bot:`,
                { parse_mode: 'HTML', ...capcutMenu() }
            );
        } else {
            // Append
            let existingContent = fs.existsSync(gsuitePath) ? fs.readFileSync(gsuitePath, 'utf8') : '';
            if (existingContent && !existingContent.endsWith('\n')) existingContent += '\n';
            fs.writeFileSync(gsuitePath, existingContent + accountsList.join('\n') + '\n', 'utf8');

            const allAccounts = fs.readFileSync(gsuitePath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@'));
            return ctx.reply(
                `✅ <b>Berhasil Menambahkan Akun!</b>\n\n` +
                `• Akun ditambahkan: <b>${accountsList.length}</b>\n` +
                `• Total akun di gsuite sekarang: <b>${allAccounts.length}</b>\n\n` +
                `Silakan pilih mode untuk menjalankan bot:`,
                { parse_mode: 'HTML', ...capcutMenu() }
            );
        }
    }

    // ── ACTION: Menu Input Akun GSuite ──
    bot.action('menu_input_gsuite', async (ctx) => {
        await ctx.answerCbQuery();
        ctx.reply(
            `📝 *Pusat Pengelolaan & Input Akun GSuite*\n\n` +
            `Format yang didukung:\n` +
            `\`email@domain.com|password\`\n` +
            `\`email@domain.com:password\`\n\n` +
            `Pilih aksi di bawah ini:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Tambah Akun (Append)', 'set_input_append')],
                    [Markup.button.callback('🔄 Ganti Semua Akun (Replace Baru)', 'set_input_replace')],
                    [Markup.button.callback('📥 Download File gsuite', 'download_gsuite')],
                    [Markup.button.callback('🗑️ Reset Riwayat Selesai', 'clear_history')],
                    [
                        Markup.button.callback('⬅️ Menu CapCut', 'open_menu_capcut'),
                        Markup.button.callback('🏠 Menu Utama', 'back_menu')
                    ],
                ])
            }
        );
    });

    // ── ACTION: Set Mode Input ──
    bot.action('set_input_append', async (ctx) => {
        await ctx.answerCbQuery();
        userState[ctx.chat.id] = { step: 'waiting_accounts', mode: 'append' };
        ctx.reply(
            `➕ *Mode Tambah Akun (Append) Aktif*\n\n` +
            `Kirimkan teks daftar akun ke chat ini sekarang.\n` +
            `Format per baris:\n` +
            `\`email1@domain.com|pass123\`\n` +
            `\`email2@domain.com|pass123\`\n\n` +
            `_(Bisa kirim 1 baris, puluhan baris, atau kirim file dokumen .txt)_\n\n` +
            `Ketik /batal untuk membatalkan.`,
            { parse_mode: 'Markdown' }
        );
    });

    bot.action('set_input_replace', async (ctx) => {
        await ctx.answerCbQuery();
        userState[ctx.chat.id] = { step: 'waiting_accounts', mode: 'replace' };
        ctx.reply(
            `🔄 *Mode Ganti Semua Akun (Replace) Aktif*\n\n` +
            `⚠️ *Perhatian:* Daftar akun lama di file \`gsuite\` dan riwayat \`akun_sudah_login\` akan direset!\n\n` +
            `Kirimkan daftar akun baru Anda ke chat ini sekarang.\n` +
            `Format per baris:\n` +
            `\`email1@domain.com|pass123\`\n` +
            `\`email2@domain.com|pass123\`\n\n` +
            `Ketik /batal untuk membatalkan.`,
            { parse_mode: 'Markdown' }
        );
    });

    bot.action('clear_history', async (ctx) => {
        await ctx.answerCbQuery();
        const donePath = path.join(__dirname, 'akun_sudah_login');
        if (fs.existsSync(donePath)) {
            fs.writeFileSync(donePath, '', 'utf8');
        }
        ctx.reply('🗑️ *Riwayat akun selesai (akun_sudah_login) berhasil dibersihkan!*', { parse_mode: 'Markdown', ...capcutMenu() });
    });

    bot.action('download_gsuite', async (ctx) => {
        await ctx.answerCbQuery();
        const gsuitePath = path.join(__dirname, 'gsuite');
        if (fs.existsSync(gsuitePath)) {
            const count = fs.readFileSync(gsuitePath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@')).length;
            await ctx.replyWithDocument(
                { source: gsuitePath, filename: 'gsuite.txt' },
                { caption: `📂 File daftar akun GSuite (${count} akun)` }
            );
        } else {
            ctx.reply('⚠️ File gsuite tidak ditemukan.');
        }
    });

    bot.action('back_menu', async (ctx) => {
        await ctx.answerCbQuery();
        delete userState[ctx.chat.id];
        delete pendingInput[ctx.chat.id];
        await sendMainMenu(ctx);
    });

    bot.action('save_pending_append', async (ctx) => {
        await ctx.answerCbQuery();
        const valid = pendingInput[ctx.chat.id];
        delete pendingInput[ctx.chat.id];
        if (!valid || valid.length === 0) return ctx.reply('⚠️ Tidak ada data akun pending.');
        return saveAccounts(ctx, valid, 'append');
    });

    bot.action('save_pending_replace', async (ctx) => {
        await ctx.answerCbQuery();
        const valid = pendingInput[ctx.chat.id];
        delete pendingInput[ctx.chat.id];
        if (!valid || valid.length === 0) return ctx.reply('⚠️ Tidak ada data akun pending.');
        return saveAccounts(ctx, valid, 'replace');
    });

    bot.action('save_pending_canva', async (ctx) => {
        await ctx.answerCbQuery();
        const valid = pendingInput[ctx.chat.id];
        delete pendingInput[ctx.chat.id];
        if (!valid || valid.length === 0) return ctx.reply('⚠️ Tidak ada data akun pending.');
        return saveCanvaAccounts(ctx, valid, 'append');
    });

    bot.action('cancel_pending', async (ctx) => {
        await ctx.answerCbQuery();
        delete pendingInput[ctx.chat.id];
        ctx.reply('❌ Input dibatalkan.', mainMenu());
    });

    // ── ACTION: Lihat Akun GSuite ──
    bot.action('view_gsuite', async (ctx) => {
        await ctx.answerCbQuery();
        const gsuitePath = path.join(__dirname, 'gsuite');
        const donePath = path.join(__dirname, 'akun_sudah_login');

        if (!fs.existsSync(gsuitePath)) {
            return ctx.reply('⚠️ File gsuite tidak ditemukan!');
        }

        const allAccounts = fs.readFileSync(gsuitePath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@'));
        const doneAccounts = fs.existsSync(donePath)
            ? fs.readFileSync(donePath, 'utf8').split('\n').map(e => e.trim().toLowerCase()).filter(Boolean)
            : [];

        const pending = allAccounts.filter(a => !doneAccounts.includes(a.split(/[:|]/)[0].trim().toLowerCase()));
        const preview = pending.slice(0, 5).map((a, i) => `${i + 1}. <code>${escapeHtml(a)}</code>`).join('\n');

        ctx.reply(
            `📂 <b>Data Akun GSuite:</b>\n` +
            `• Total akun di file: <b>${allAccounts.length}</b>\n` +
            `• Sudah diproses: <b>${doneAccounts.length}</b>\n` +
            `• Belum diproses: <b>${pending.length}</b>\n\n` +
            (preview ? `<b>Antrean Akun Teratas:</b>\n${preview}\n\n` : `<i>Semua akun sudah diproses atau daftar kosong.</i>\n\n`) +
            `Pilih tindakan di bawah:`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📝 Input / Tambah Akun', 'menu_input_gsuite')],
                    [Markup.button.callback('📥 Download File gsuite', 'download_gsuite')],
                    [Markup.button.callback('🗑️ Reset Riwayat Selesai', 'clear_history')],
                    [
                        Markup.button.callback('⬅️ Menu CapCut', 'open_menu_capcut'),
                        Markup.button.callback('🏠 Menu Utama', 'back_menu')
                    ],
                ])
            }
        );
    });

    // ── LISTENER: Text Input (Auto-detect & State Handler) ──
    bot.on('text', async (ctx, next) => {
        const text = ctx.message.text ? ctx.message.text.trim() : '';
        if (text.startsWith('/')) return next();

        const state = userState[ctx.chat.id];
        const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const validAccounts = rawLines.filter(l => l.includes('@'));

        // Handler untuk input manual Reset Password
        if (state && state.step === 'waiting_reset_emails') {
            delete userState[ctx.chat.id];
            if (validAccounts.length === 0) {
                return ctx.reply('⚠️ Tidak ada email yang valid (harus mengandung email @). Silakan coba lagi atau ketik /batal.');
            }
            const gsuitePath = path.join(__dirname, 'gsuite');
            fs.writeFileSync(gsuitePath, validAccounts.join('\n') + '\n', 'utf8');
            const newPassEnv = process.env.new_password || 'masuk123';
            return ctx.reply(
                `✅ <b>${validAccounts.length} email target reset berhasil dimuat ke antrean!</b>\n\n` +
                `• <b>Contoh Target:</b> <code>${escapeHtml(validAccounts[0])}</code>\n` +
                `• <b>Password Baru:</b> <code>${escapeHtml(newPassEnv)}</code>\n\n` +
                `Siap menjalankan Reset Password otomatis?`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback(`🚀 Mulai Reset Sekarang (${validAccounts.length} Akun)`, `run_reset_password_${validAccounts.length}`)],
                        [Markup.button.callback('⬅️ Menu Utama', 'back_menu')],
                    ])
                }
            );
        }

        if (state && state.step === 'waiting_accounts') {
            delete userState[ctx.chat.id];
            if (validAccounts.length === 0) {
                return ctx.reply('⚠️ Tidak ada akun yang valid (harus mengandung email @). Silakan ketik format <code>email|pass</code> atau ketik /batal.', { parse_mode: 'HTML' });
            }
            return saveAccounts(ctx, validAccounts, state.mode);
        }

        if (state && state.step === 'waiting_canva_accounts') {
            delete userState[ctx.chat.id];
            if (validAccounts.length === 0) {
                return ctx.reply('⚠️ Tidak ada akun yang valid (harus mengandung email @). Silakan ketik format <code>email|pass|token|id</code> atau <code>email|pass</code> atau ketik /cancel.', { parse_mode: 'HTML' });
            }
            return saveCanvaAccounts(ctx, validAccounts, state.mode);
        }

        // Handler untuk input link undangan pada mode Daftar + Join
        if (state && state.step === 'waiting_join_link_daftar') {
            if (!text.toLowerCase().includes('capcut.com')) {
                return ctx.reply('⚠️ Link join CapCut tidak valid! Pastikan link mengandung <code>capcut.com</code> (contoh: <code>https://www.capcut.com/sv2/...</code>).\n\nKetik link di chat atau kirim /cancel untuk batal.', { parse_mode: 'HTML' });
            }

            userState[ctx.chat.id] = { step: 'waiting_daftar_join_count', joinLink: text.trim() };
            return ctx.reply(
                `✨ <b>DAFTAR AKUN BARU + JOIN TIM CAPCUT</b>\n\n` +
                `🔗 <b>Link Join Tim:</b>\n<code>${escapeHtml(text.trim())}</code>\n\n` +
                `<b>Pilih jumlah akun baru yang ingin didaftarkan & di-join ke tim (Maksimal 5 akun):</b>`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback('1️⃣ 1 Akun', 'run_daftar_join_1'),
                            Markup.button.callback('2️⃣ 2 Akun', 'run_daftar_join_2'),
                            Markup.button.callback('3️⃣ 3 Akun', 'run_daftar_join_3'),
                        ],
                        [
                            Markup.button.callback('4️⃣ 4 Akun', 'run_daftar_join_4'),
                            Markup.button.callback('5️⃣ 5 Akun', 'run_daftar_join_5'),
                        ],
                        [
                            Markup.button.callback('⬅️ Batal / Menu Utama', 'back_menu')
                        ]
                    ])
                }
            );
        }

        // Handler untuk input link undangan pada mode Masuk + Join
        if (state && state.step === 'waiting_join_link_login') {
            if (!text.toLowerCase().includes('capcut.com')) {
                return ctx.reply('⚠️ Link join CapCut tidak valid! Pastikan link mengandung <code>capcut.com</code> (contoh: <code>https://www.capcut.com/sv2/...</code>).\n\nKetik link di chat atau kirim /cancel untuk batal.', { parse_mode: 'HTML' });
            }

            const regPath = path.join(__dirname, 'akun_terdaftar.txt');
            const regCount = fs.existsSync(regPath)
                ? fs.readFileSync(regPath, 'utf8').split('\n').filter(l => l.trim() && l.includes('@')).length
                : 0;

            userState[ctx.chat.id] = { step: 'waiting_login_join_method', joinLink: text.trim() };

            const buttons = [
                [Markup.button.callback('📝 Input Manual (email|password)', 'login_join_input_manual')],
            ];
            if (regCount > 0) {
                buttons.push([Markup.button.callback(`📁 Gunakan Akun Terdaftar (${regCount} Akun)`, 'login_join_from_terdaftar')]);
            }
            buttons.push([Markup.button.callback('⬅️ Batal / Menu Utama', 'back_menu')]);

            return ctx.reply(
                `🔑 <b>MASUK (LOGIN) + JOIN TIM CAPCUT</b>\n\n` +
                `🔗 <b>Link Join Tim:</b>\n<code>${escapeHtml(text.trim())}</code>\n\n` +
                `<b>Pilih Sumber Akun yang Ingin Digunakan:</b>\n\n` +
                `1️⃣ <b>Input Manual:</b> Ketik atau paste langsung daftar akun <code>email|password</code> di chat Telegram.\n` +
                (regCount > 0 ? `2️⃣ <b>Gunakan Akun Terdaftar:</b> Ambil akun dari <code>akun_terdaftar.txt</code> (${regCount} akun tersedia).\n\n` : '\n') +
                `Pilih metode di bawah:`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard(buttons)
                }
            );
        }

        // Handler untuk input manual daftar akun (email|password) pada mode Masuk + Join
        if (state && state.step === 'waiting_login_join_accounts') {
            const joinLink = state.joinLink;
            if (validAccounts.length === 0) {
                return ctx.reply('⚠️ Tidak ada akun yang valid (harus mengandung email @). Silakan ketik format <code>email|password</code> atau kirim /cancel.', { parse_mode: 'HTML' });
            }

            const targetPath = path.join(__dirname, 'akun_login_join.txt');
            fs.writeFileSync(targetPath, validAccounts.join('\n') + '\n', 'utf8');

            return ctx.reply(
                `✅ <b>${validAccounts.length} akun berhasil dimuat untuk Join Tim!</b>\n\n` +
                `• <b>Link Tim:</b> <code>${escapeHtml(joinLink)}</code>\n` +
                `• <b>Contoh Akun:</b> <code>${escapeHtml(validAccounts[0])}</code>\n\n` +
                `Mulai proses Masuk + Join Tim sekarang?`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback(`🚀 Mulai Join Sekarang (${validAccounts.length} Akun)`, `run_login_join_manual_${validAccounts.length}`)],
                        [Markup.button.callback('⬅️ Batal', 'back_menu')]
                    ])
                }
            );
        }

        // Auto-detect jika user langsung paste daftar akun ke chat tanpa klik tombol dulu
        if (validAccounts.length > 0 && (text.includes('|') || text.includes(':') || validAccounts.length > 1)) {
            pendingInput[ctx.chat.id] = validAccounts;
            return ctx.reply(
                `📩 <b>Terdeteksi ${validAccounts.length} baris akun!</b>\n\n` +
                `Contoh baris pertama:\n<code>${escapeHtml(validAccounts[0])}</code>\n\n` +
                `Pilih tujuan penyimpanan akun:`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('➕ Tambah ke GSuite (Append)', 'save_pending_append')],
                        [Markup.button.callback('🎨 Simpan ke Antrean Canva', 'save_pending_canva')],
                        [Markup.button.callback('🔄 Ganti Semua GSuite (Replace)', 'save_pending_replace')],
                        [Markup.button.callback('❌ Abaikan / Batal', 'cancel_pending')],
                    ])
                }
            );
        }

        return next();
    });

    // ── LISTENER: Document Upload (.txt file) ──
    bot.on('document', async (ctx) => {
        const doc = ctx.message.document;
        if (!doc) return;
        try {
            await ctx.reply('⏳ Membaca file dokumen akun...');
            const fileLink = await ctx.telegram.getFileLink(doc.file_id);
            const res = await fetch(fileLink.href);
            const content = await res.text();
            const rawLines = content.split('\n').map(l => l.trim()).filter(Boolean);
            const validAccounts = rawLines.filter(l => l.includes('@'));

            if (validAccounts.length === 0) {
                return ctx.reply('⚠️ Dokumen tidak memuat baris email yang valid.');
            }

            const state = userState[ctx.chat.id];
            if (state && state.step === 'waiting_reset_emails') {
                delete userState[ctx.chat.id];
                const gsuitePath = path.join(__dirname, 'gsuite');
                fs.writeFileSync(gsuitePath, validAccounts.join('\n') + '\n', 'utf8');
                const newPassEnv = process.env.new_password || 'masuk123';
                return ctx.reply(
                    `✅ <b>File ${escapeHtml(doc.file_name || 'dokumen')} diterima (${validAccounts.length} email)!</b>\n\n` +
                    `• <b>Contoh Target:</b> <code>${escapeHtml(validAccounts[0])}</code>\n` +
                    `• <b>Password Baru:</b> <code>${escapeHtml(newPassEnv)}</code>\n\n` +
                    `Siap menjalankan Reset Password otomatis?`,
                    {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback(`🚀 Mulai Reset Sekarang (${validAccounts.length} Akun)`, `run_reset_password_${validAccounts.length}`)],
                            [Markup.button.callback('⬅️ Menu Utama', 'back_menu')],
                        ])
                    }
                );
            }

            if (state && state.step === 'waiting_canva_accounts') {
                delete userState[ctx.chat.id];
                return saveCanvaAccounts(ctx, validAccounts, state.mode);
            }

            pendingInput[ctx.chat.id] = validAccounts;
            return ctx.reply(
                `📁 <b>File ${escapeHtml(doc.file_name || 'dokumen')} diterima (${validAccounts.length} akun)!</b>\n\n` +
                `Pilih tujuan penyimpanan akun:`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('➕ Tambah ke GSuite (Append)', 'save_pending_append')],
                        [Markup.button.callback('🎨 Simpan ke Antrean Canva', 'save_pending_canva')],
                        [Markup.button.callback('🔄 Ganti Semua GSuite (Replace)', 'save_pending_replace')],
                        [Markup.button.callback('❌ Abaikan / Batal', 'cancel_pending')],
                    ])
                }
            );
        } catch (err) {
            ctx.reply(`⚠️ Gagal memproses file: ${err.message}`);
        }
    });

    // ── ACTION: Cek Config (.env) ──
    bot.action('view_config', async (ctx) => {
        await ctx.answerCbQuery();
        const envPath = path.join(__dirname, '.env');
        if (!fs.existsSync(envPath)) {
            return ctx.reply('⚠️ File .env tidak ditemukan.');
        }
        const envContent = fs.readFileSync(envPath, 'utf8')
            .replace(/password_google=.*/gi, 'password_google=***HIDDEN***')
            .replace(/TELEGRAM_TOKEN=.*/gi, 'TELEGRAM_TOKEN=***HIDDEN***')
            .replace(/ptero_api_key=.*/gi, 'ptero_api_key=***HIDDEN***');
        ctx.reply(`⚙️ *Konfigurasi Saat Ini:*\n\`\`\`\n${envContent}\n\`\`\``, { parse_mode: 'Markdown' });
    });

    // ── ACTION: Status Bot ──
    bot.action('status', async (ctx) => {
        await ctx.answerCbQuery();
        const isRunning = botProcess !== null;
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const mins = Math.floor((uptime % 3600) / 60);
        const secs = Math.floor(uptime % 60);

        ctx.reply(
            `ℹ️ *Status Server:*\n` +
            `• Bot CapCut: ${isRunning ? '🟢 Berjalan' : '🔴 Berhenti'}\n` +
            `• Uptime server: ${hours}j ${mins}m ${secs}d\n` +
            `• Node.js: ${process.version}\n` +
            `• Platform: ${process.platform} ${process.arch}\n` +
            `• Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
            { parse_mode: 'Markdown' }
        );
    });

    // ── HELPER: Render Menu Mode Browser ──
    async function showBrowserModeMenu(ctx) {
        const currentMode = getBrowserMode();
        const isBiasa = currentMode === 'biasa';
        const hasProfiles = fs.existsSync(path.join(__dirname, 'browser_profiles')) || fs.existsSync(path.join(__dirname, 'browser_profile'));

        const statusBadge = isBiasa
            ? '🌐 <b>Mode BIASA (Profile Baru Per Akun - Aktif)</b>'
            : '🕵️ <b>Mode INCOGNITO (In-Memory - Aktif)</b>';

        const msg =
            `🌐 <b>Pengaturan Mode Browser Automation</b>\n\n` +
            `• <b>Status Saat Ini:</b> ${statusBadge}\n` +
            `• <b>Data Browser di Server:</b> ${hasProfiles ? 'Ada data tersimpan' : 'Bersih (0 data)'}\n\n` +
            `<b>Penjelasan Mode:</b>\n` +
            `• 🕵️ <b>Incognito:</b> Membuka sesi in-memory tanpa menyimpan cache/cookies ke disk server.\n` +
            `• 🌐 <b>Biasa / Normal:</b> Membuka browser asli (non-incognito) dengan <b>profil baru untuk setiap akun</b> (bukan menumpuk di profil lama). Ini mencegah deteksi bot anti-fraud sekaligus memastikan cookies antar-akun tidak pernah tercampur.\n\n` +
            `Silakan pilih mode di bawah:`;

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    isBiasa ? '🕵️ Beralih ke Incognito' : '✅ 🕵️ Incognito (Aktif)',
                    'set_browser_incognito'
                ),
                Markup.button.callback(
                    isBiasa ? '✅ 🌐 Biasa (Profile Baru Aktif)' : '🌐 Beralih ke Mode Biasa',
                    'set_browser_normal'
                ),
            ],
            [
                Markup.button.callback('🗑️ Hapus Semua Data Browser', 'clear_browser_data'),
            ],
            [
                Markup.button.callback('⬅️ Menu Utama', 'back_menu'),
            ],
        ]);

        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            try {
                await ctx.editMessageText(msg, { parse_mode: 'HTML', ...keyboard });
                return;
            } catch (_) {}
        }
        await ctx.reply(msg, { parse_mode: 'HTML', ...keyboard });
    }

    // ── HELPER: Render Menu Restart Server ──
    async function showRestartServerMenu(ctx) {
        let pteroUrl = (process.env.ptero_url || process.env.PTERO_URL || '').trim();
        const pteroServerId = (process.env.ptero_server_id || process.env.PTERO_SERVER_ID || '').trim();
        const pteroKey = (process.env.ptero_api_key || process.env.PTERO_API_KEY || '').trim();

        const isApiReady = !!(pteroUrl && pteroServerId && pteroKey);

        const msg =
            `🔄 <b>Pusat Kendali Restart Server (Pterodactyl)</b>\n\n` +
            `<b>Status Konfigurasi API Pterodactyl:</b>\n` +
            `• Panel URL: <code>${escapeHtml(pteroUrl || 'Belum diatur')}</code>\n` +
            `• Server ID: <code>${escapeHtml(pteroServerId || 'Belum diatur')}</code>\n` +
            `• API Key: <code>${pteroKey ? '✓ Terpasang (ptlc_...)' : 'Belum diatur'}</code>\n` +
            `• Status API: ${isApiReady ? '🟢 Siap Digunakan' : '🟡 Belum Lengkap (Gunakan Restart Cepat)'}\n\n` +
            `<b>Pilihan Metode Restart:</b>\n` +
            `1. ⚡ <b>Restart via API Pterodactyl</b>: Mengirim sinyal resmi ke panel Pterodactyl untuk me-reboot seluruh container secara aman.\n` +
            `2. 🔁 <b>Restart Cepat (Process Exit)</b>: Mematikan proses bot saat ini. Supervisor container Pterodactyl akan otomatis me-restart bot dalam beberapa detik (tanpa butuh API key).\n\n` +
            `Pilih aksi di bawah:`;

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('⚡ Restart via API Pterodactyl', 'exec_ptero_api_restart'),
            ],
            [
                Markup.button.callback('🔁 Restart Cepat (Process Exit)', 'exec_force_exit_restart'),
            ],
            [
                Markup.button.callback('⚙️ Panduan Setup API Pterodactyl', 'guide_ptero_api'),
                Markup.button.callback('⬅️ Menu Utama', 'back_menu'),
            ],
        ]);

        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            try {
                await ctx.editMessageText(msg, { parse_mode: 'HTML', ...keyboard });
                return;
            } catch (_) {}
        }
        await ctx.reply(msg, { parse_mode: 'HTML', ...keyboard });
    }

    // ── ACTION: Menu Mode Browser ──
    bot.action('menu_browser_mode', async (ctx) => {
        await ctx.answerCbQuery();
        await showBrowserModeMenu(ctx);
    });

    bot.command('mode', async (ctx) => {
        await showBrowserModeMenu(ctx);
    });

    bot.action('set_browser_incognito', async (ctx) => {
        await ctx.answerCbQuery('Mode diubah ke: Incognito');
        setEnvValue('browser_mode', 'incognito');
        await showBrowserModeMenu(ctx);
    });

    bot.action('set_browser_normal', async (ctx) => {
        await ctx.answerCbQuery('Mode diubah ke: Biasa (Profile Baru Per Akun)');
        setEnvValue('browser_mode', 'biasa');
        await showBrowserModeMenu(ctx);
    });

    const handleClearBrowserData = async (ctx) => {
        const dirsToClean = [
            path.join(__dirname, 'browser_profile'),
            path.join(__dirname, 'browser_profiles'),
            path.join(__dirname, '.tmp'),
            path.join(__dirname, '.browsers', '.cache'),
        ];
        for (const dir of dirsToClean) {
            try {
                if (fs.existsSync(dir)) {
                    fs.rmSync(dir, { recursive: true, force: true });
                }
            } catch (_) {}
        }
        await ctx.answerCbQuery('Semua data browser berhasil dihapus bersih!');
        await ctx.reply(
            `🗑️ <b>Semua Data Browser Berhasil Dihapus!</b>\n\n` +
            `• Profil browser lama (<code>browser_profiles</code>): <b>Direset Bersih</b>\n` +
            `• Cookies, LocalStorage, dan sesi akun: <b>Terhapus</b>\n` +
            `• File cache & temporary sistem: <b>Dibersihkan</b>\n\n` +
            `Browser sekarang dalam kondisi 100% segar seperti baru diinstal.`,
            { parse_mode: 'HTML' }
        );
        await showBrowserModeMenu(ctx);
    };

    bot.action('clear_browser_data', handleClearBrowserData);
    bot.action('clear_browser_cache', handleClearBrowserData);

    // ── ACTION: Menu Restart Server ──
    bot.action('menu_restart_server', async (ctx) => {
        await ctx.answerCbQuery();
        await showRestartServerMenu(ctx);
    });

    bot.command('restart', async (ctx) => {
        await showRestartServerMenu(ctx);
    });

    bot.action('guide_ptero_api', async (ctx) => {
        await ctx.answerCbQuery();
        const guideMsg =
            `📖 <b>Panduan Konfigurasi API Pterodactyl</b>\n\n` +
            `Untuk mengaktifkan tombol <b>⚡ Restart via API Pterodactyl</b>, tambahkan konfigurasi berikut ke file <code>.env</code>:\n\n` +
            `1. <b>ptero_url</b>\n` +
            `   URL panel Pterodactyl Anda, contoh:\n` +
            `   <code>ptero_url=https://panel.contoh.com</code>\n\n` +
            `2. <b>ptero_server_id</b>\n` +
            `   ID server Anda (tertera di URL console browser, contoh: jika URL console adalah <code>https://panel.../server/7b8c0e12</code> maka ID-nya adalah <code>7b8c0e12</code>).\n\n` +
            `3. <b>ptero_api_key</b>\n` +
            `   Buka Panel Pterodactyl -> Klik foto/icon profil pojok kanan atas -> <b>Account Settings</b> -> <b>API Credentials</b> -> Klik <i>Create New</i> -> Salin kodenya (berawalan <code>ptlc_...</code>).\n\n` +
            `<i>💡 Tips: Jika belum sempat memasang API Key, gunakan opsi <b>🔁 Restart Cepat (Process Exit)</b> yang langsung berfungsi tanpa konfigurasi apa pun!</i>`;

        await ctx.reply(guideMsg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔁 Jalankan Restart Cepat Sekarang', 'exec_force_exit_restart')],
                [Markup.button.callback('⬅️ Kembali ke Menu Restart', 'menu_restart_server')],
            ])
        });
    });

    bot.action('exec_ptero_api_restart', async (ctx) => {
        await ctx.answerCbQuery();
        let pteroUrl = (process.env.ptero_url || process.env.PTERO_URL || '').trim();
        const pteroServerId = (process.env.ptero_server_id || process.env.PTERO_SERVER_ID || '').trim();
        const pteroKey = (process.env.ptero_api_key || process.env.PTERO_API_KEY || '').trim();

        if (!pteroUrl || !pteroServerId || !pteroKey) {
            return ctx.reply(
                `⚠️ <b>Konfigurasi API Pterodactyl Belum Lengkap!</b>\n\n` +
                `Variabel <code>ptero_url</code>, <code>ptero_server_id</code>, atau <code>ptero_api_key</code> belum diisi di file <code>.env</code>.\n\n` +
                `Anda dapat langsung menggunakan opsi <b>🔁 Restart Cepat (Process Exit)</b> tanpa API key:`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔁 Gunakan Restart Cepat Sekarang', 'exec_force_exit_restart')],
                        [Markup.button.callback('📖 Buka Panduan API', 'guide_ptero_api')],
                        [Markup.button.callback('⬅️ Menu Utama', 'back_menu')],
                    ])
                }
            );
        }

        if (!pteroUrl.startsWith('http://') && !pteroUrl.startsWith('https://')) {
            pteroUrl = 'https://' + pteroUrl;
        }
        if (pteroUrl.endsWith('/')) {
            pteroUrl = pteroUrl.slice(0, -1);
        }

        const endpoint = `${pteroUrl}/api/client/servers/${pteroServerId}/power`;
        await ctx.reply('⏳ <b>Mengirim sinyal restart ke panel Pterodactyl...</b>', { parse_mode: 'HTML' });

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${pteroKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ signal: 'restart' }),
            });

            if (res.status === 204 || res.ok) {
                await ctx.reply(
                    `✅ <b>Sinyal restart berhasil diterima oleh Pterodactyl!</b>\n\n` +
                    `Container server sedang reboot ulang sekarang. Bot akan otomatis aktif kembali dalam ~10-30 detik.`,
                    { parse_mode: 'HTML' }
                );
            } else {
                const errBody = await res.text().catch(() => '');
                await ctx.reply(
                    `❌ <b>Pterodactyl mengembalikan HTTP ${res.status}:</b>\n` +
                    `<code>${escapeHtml(errBody.slice(0, 300) || 'Unknown error')}</code>\n\n` +
                    `Ingin mencoba Restart Cepat (Process Exit)?`,
                    {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🔁 Gunakan Restart Cepat', 'exec_force_exit_restart')],
                            [Markup.button.callback('⬅️ Menu Restart', 'menu_restart_server')],
                        ])
                    }
                );
            }
        } catch (fetchErr) {
            await ctx.reply(
                `❌ <b>Gagal menghubungi panel Pterodactyl:</b>\n<code>${escapeHtml(fetchErr.message)}</code>\n\n` +
                `Periksa apakah URL <code>${escapeHtml(pteroUrl)}</code> dapat diakses dari server.`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔁 Gunakan Restart Cepat', 'exec_force_exit_restart')],
                        [Markup.button.callback('⬅️ Menu Restart', 'menu_restart_server')],
                    ])
                }
            );
        }
    });

    bot.action('exec_force_exit_restart', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.reply(
            `🔄 <b>Memulai Restart Server Cepat (Process Exit)...</b>\n\n` +
            `• Menghentikan sub-proses automation...\n` +
            `• Mengirim sinyal exit ke container Pterodactyl...\n\n` +
            `<i>Bot akan offline sesaat dan otomatis hidup kembali dalam ~5-15 detik. Silakan ketik /start setelah bot online.</i>`,
            { parse_mode: 'HTML' }
        );

        if (botProcess) {
            try { botProcess.kill('SIGKILL'); } catch (_) {}
            botProcess = null;
        }

        setTimeout(() => {
            console.log('[RESTART] User meminta restart container via Telegram. Exiting process with code 0...');
            process.exit(0);
        }, 1500);
    });

    // ── Launch Bot ──
    bot.launch()
        .then(() => {
            bot.telegram.setMyCommands([
                { command: 'start', description: '🏠 Menu Utama Bot' },
                { command: 'capcut', description: '🎬 Buka Menu CapCut Automation' },
                { command: 'canva', description: '🎨 Buka Menu Canva Automation' },
                { command: 'mode', description: '🌐 Pengaturan Mode Browser' },
                { command: 'restart', description: '🔄 Restart Server Pterodactyl' },
                { command: 'batal', description: '❌ Batalkan Input Saat Ini' },
            ]).catch(() => {});
            console.log('[TELEGRAM] ✓ Bot Telegram berhasil terhubung dan berjalan!');
            console.log('[TELEGRAM] Buka Telegram Anda dan ketik /start ke bot Anda.');
            console.log('');
        })
        .catch((err) => {
            console.error('[TELEGRAM] ✗ GAGAL menghubungkan bot Telegram!');
            console.error('[TELEGRAM] Periksa token BotFather Anda di file .env');
            console.error(`[TELEGRAM] Detail error: ${err.message}`);
            process.exit(1);
        });

    // Graceful shutdown
    process.once('SIGINT', () => {
        if (botProcess) botProcess.kill('SIGINT');
        bot.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
        if (botProcess) botProcess.kill('SIGTERM');
        bot.stop('SIGTERM');
    });
}
