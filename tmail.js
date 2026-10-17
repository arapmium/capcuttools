/**
 * tmail.js
 * Modul otomatis pembuatan email & pengambilan kode OTP dari TMail API (@arapmium.web.id)
 * Untuk pengaitan (bind) email ke akun CapCut GSuite
 */

const FALSE_POSITIVES = new Set([
  '140729', '808080', '989898', '202123', '353740', '9800998',
  '000000', '111111', '222222', '333333', '444444', '555555',
  '666666', '777777', '888888', '999999'
]);

const FIRST_NAMES = [
  'alex', 'sophia', 'david', 'sarah', 'michael', 'emma', 'daniel', 'olivia',
  'james', 'emily', 'kevin', 'jessica', 'brian', 'rachel', 'ryan', 'amanda',
  'jason', 'laura', 'eric', 'megan', 'justin', 'hannah', 'brandon', 'ashley'
];

const LAST_NAMES = [
  'santoso', 'hall', 'wijaya', 'miller', 'tan', 'wilson', 'pratama', 'davis',
  'kusuma', 'clark', 'hidayat', 'taylor', 'saputra', 'moore', 'lestari', 'white',
  'putra', 'harris', 'siregar', 'martin', 'setiawan', 'thompson', 'gunawan', 'lee'
];

/**
 * Generate email dengan format natural seperti alexsantoso729@arapmium.web.id
 */
function generateRandomEmail(domain = 'arapmium.web.id') {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const num = Math.floor(Math.random() * 900 + 100); // 100-999
  const username = `${first}${last}${num}`;
  const cleanDomain = domain.replace(/^@/, '').trim();
  return {
    username,
    email: `${username}@${cleanDomain}`
  };
}

/**
 * Ekstraksi 6 digit kode OTP dari subject / body pesan email
 */
function extractOtpFromText(text = '') {
  if (!text) return null;
  const str = String(text);

  const patterns = [
    /(?:code|kode|verifikasi|verification)[^0-9]{0,50}?([0-9]{6})/i,
    /CapCut[^0-9]{0,50}?([0-9]{6})/i,
    /<span[^>]*>\s*(\d{6})\s*<\/span>/i,
    /<strong[^>]*>\s*(\d{6})\s*<\/strong>/i,
    /<p[^>]*>\s*(\d{6})\s*<\/p>/i,
    /<td[^>]*>\s*(\d{6})\s*<\/td>/i,
    /<h[1-6][^>]*>\s*(\d{6})\s*<\/h[1-6]>/i,
    /\b(\d{6})\b/
  ];

  for (const pat of patterns) {
    const m = str.match(pat);
    if (m && m[1] && !FALSE_POSITIVES.has(m[1])) {
      return m[1];
    }
  }
  return null;
}

/**
 * Generate email dengan format natural seperti alexsantoso729@arapmium.web.id
 * Mencoba memanggil API resmi /api/generate-email, jika offline fallback ke generator lokal
 */
async function generateRandomEmail(domain = 'arapmium.web.id', apiUrl = 'https://arapmium.web.id') {
  const cleanDomain = domain.replace(/^@/, '').trim();
  const cleanBase = apiUrl.replace(/\/+$/, '');

  // 1. Coba request langsung ke endpoint ArapMium Hub
  try {
    const res = await fetch(`${cleanBase}/api/generate-email?domain=${cleanDomain}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.email) {
        return { username: data.username, email: data.email };
      }
    }
  } catch (_) {}

  // 2. Fallback generator lokal jika offline
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const num = Math.floor(Math.random() * 900 + 100);
  const username = `${first}${last}${num}`;
  return {
    username,
    email: `${username}@${cleanDomain}`
  };
}

/**
 * Mengambil kode OTP dari TMail / ArapMium Hub dengan polling berkala
 * Mendukung ArapMium Hub (TANPA API KEY) maupun TMail API standar
 * @param {string} email - Alamat email lengkap (misal alex123@arapmium.web.id)
 * @param {string} apiUrl - Base URL TMail (misal https://arapmium.web.id)
 * @param {string} apiKey - API Key TMail (opsional jika pakai ArapMium Hub)
 * @param {number} maxWaitSec - Maksimal waktu tunggu dalam detik
 * @param {Function} logFn - Logger function
 * @returns {Promise<string|null>} 6 digit OTP atau null jika timeout
 */
async function fetchTMailOtp(email, apiUrl = 'https://arapmium.web.id', apiKey = '', maxWaitSec = 75, logFn = console.log) {
  const cleanBase = apiUrl.replace(/\/+$/, '');
  const username = email.split('@')[0];
  const startTime = Date.now();

  // Daftar endpoint (ArapMium Hub & TMail Standar)
  const endpoints = [
    // 1. Endpoint ArapMium Hub (Publik, tanpa API key)
    `${cleanBase}/email/${encodeURIComponent(email)}?json=true`,
    `${cleanBase}/email/${encodeURIComponent(username)}?json=true`,
  ];

  // 2. Jika ada apiKey diisi di .env, tambahkan juga endpoint TMail standar
  if (apiKey && apiKey !== 'eduedu') {
    endpoints.push(
      `${cleanBase}/api/messages/${encodeURIComponent(username)}/${apiKey}`,
      `${cleanBase}/api/messages/${encodeURIComponent(email)}/${apiKey}`
    );
  } else {
    endpoints.push(
      `${cleanBase}/api/messages/${encodeURIComponent(username)}/eduedu`,
      `${cleanBase}/api/messages/${encodeURIComponent(email)}/eduedu`
    );
  }

  let pollCount = 0;
  while ((Date.now() - startTime) / 1000 < maxWaitSec) {
    pollCount++;
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(8000)
        });

        if (res.ok) {
          const data = await res.json();
          // Cek format ArapMium Hub: { success: true, count: 1, emails: [...] }
          // atau format TMail generic: [...]
          let messagesList = [];
          if (data && Array.isArray(data.emails)) {
            messagesList = data.emails;
          } else if (Array.isArray(data)) {
            messagesList = data;
          }

          if (messagesList.length > 0) {
            for (const msg of messagesList) {
              const subj = msg.subject || '';
              const content = msg.content || msg.html || msg.body || msg.text || '';

              const otpFromSubj = extractOtpFromText(subj);
              if (otpFromSubj) {
                if (logFn) logFn('OTP', `OTP ditemukan dari subject: ${otpFromSubj}`);
                return otpFromSubj;
              }

              const otpFromContent = extractOtpFromText(content);
              if (otpFromContent) {
                if (logFn) logFn('OTP', `OTP ditemukan dari pesan: ${otpFromContent}`);
                return otpFromContent;
              }
            }
          }
        }
      } catch (_) {
        // Retry
      }
    }

    if (pollCount % 4 === 0 && logFn) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      logFn('WAIT', `Menunggu email OTP CapCut masuk... (${elapsed}s/${maxWaitSec}s)`);
    }

    await new Promise(r => setTimeout(r, 2500));
  }

  return null;
}

/**
 * Mengambil link reset password dari inbox ArapMium Webmail
 * @param {string} email - Alamat email target (contoh: user@arapmium.web.id)
 * @param {string} apiUrl - Base URL ArapMium (default: https://arapmium.web.id)
 * @param {number} afterTimestamp - Waktu request dikirim (untuk menghindari email lama)
 * @param {number} maxWaitSec - Maksimal waktu tunggu dalam detik (default 75 detik)
 * @param {Function} logFn - Logger
 * @returns {Promise<string|null>} Link reset password CapCut
 */
async function fetchTMailResetLink(email, apiUrl = 'https://arapmium.web.id', afterTimestamp = 0, maxWaitSec = 75, logFn = console.log) {
  const cleanBase = apiUrl.replace(/\/+$/, '');
  const startTime = Date.now();
  let pollCount = 0;

  while ((Date.now() - startTime) / 1000 < maxWaitSec) {
    pollCount++;
    try {
      const res = await fetch(`${cleanBase}/email/${encodeURIComponent(email)}?json=true`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.emails) && data.emails.length > 0) {
          const latest = data.emails[0];
          const emailTime = latest.time ? new Date(latest.time).getTime() : Date.now();

          // Cek apakah email baru (sesudah request dikirim)
          if (!afterTimestamp || emailTime >= afterTimestamp - 10000) {
            // Ambil konten email dari endpoint /0
            const detailRes = await fetch(`${cleanBase}/email/${encodeURIComponent(email)}/0`, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(8000)
            });

            if (detailRes.ok) {
              const html = await detailRes.text();
              const match = html.match(/https:\/\/www\.capcut\.com\/forget-password\?[^"'\s<>]+/);
              if (match) {
                const cleanLink = match[0].replace(/&amp;/g, '&').replace(/[\/\\"'%]+$/, '').trim();
                if (logFn) logFn('LINK', `Link reset password ditemukan di email: ${cleanLink}`);
                return cleanLink;
              }
            }
          }
        }
      }
    } catch (_) {
      // Retry on network glitch
    }

    if (pollCount % 4 === 0 && logFn) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      logFn('WAIT', `Menunggu email reset password masuk... (${elapsed}s/${maxWaitSec}s)`);
    }

    await new Promise(r => setTimeout(r, 2500));
  }

  return null;
}

module.exports = {
  generateRandomEmail,
  extractOtpFromText,
  fetchTMailOtp,
  fetchTMailResetLink
};

