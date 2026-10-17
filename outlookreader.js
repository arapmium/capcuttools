/**
 * outlookreader.js
 * Modul pembaca inbox dan penangkap kode OTP / Magic Link dari Outlook / Hotmail
 * melalui API https://outlookreader.my.id
 */

const https = require('https');

const OUTLOOK_READER_BASE_URL = 'https://outlookreader.my.id';

/**
 * Parsing satu baris kredensial akun Outlook/Hotmail
 * Format umum:
 * 1. email|password|refresh_token|client_id
 * 2. email|password|token
 * 3. email|password
 * 4. email:password
 */
function parseAccountLine(rawLine = '') {
  const line = String(rawLine).trim();
  if (!line) return null;

  // Jika line menggunakan pemisah pipe (|), split HANYA dengan pipe agar password/token bertanda ':' tidak rusak
  let parts;
  if (line.includes('|')) {
    parts = line.split('|').map(p => p.trim());
  } else {
    parts = line.split(':').map(p => p.trim());
  }

  const email = (parts[0] || '').toLowerCase();
  const password = parts[1] || '';
  const token = parts[2] || '';
  const clientId = parts[3] || '';

  if (!email.includes('@')) return null;

  return {
    email,
    password,
    token,
    clientId,
    rawLine: line
  };
}

/**
 * Panggil API /api/read-inbox di outlookreader.my.id
 * @param {string} credentialLine - Format: "email|password|token|id" atau "email|password"
 * @param {string} mode - 'oauth2' (default) atau 'graph'
 * @returns {Promise<Object>}
 */
async function callReadInboxApi(credentialLine, mode = 'oauth2') {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      credentials: credentialLine,
      mode: mode,
      useProxy: false
    });

    const req = https.request(`${OUTLOOK_READER_BASE_URL}/api/read-inbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      timeout: 35000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Gagal parsing response JSON dari outlookreader: ${data.slice(0, 150)}`));
        }
      });
    });

    req.on('error', (err) => reject(new Error(`Koneksi ke outlookreader gagal: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout 35s saat membaca inbox dari outlookreader.my.id'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Ekstraksi kode OTP dari teks subject, preview, dan body
 */
function extractOtpCode(subject = '', preview = '', body = '') {
  const plainBody = body ? body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>?/gm, ' ') : '';
  const allText = `${subject} ${preview} ${plainBody}`;

  const patterns = [
    // 1. Canva spesifik format: "Your Canva code is 123456" / "Kode Canva Anda adalah 123456"
    /(?:canva)[^0-9]{0,40}?([0-9]{6})\b/i,
    // 2. Format standar: "123456 is your code" / "123456 adalah kode verifikasi"
    /\b(\d{6})\b\s*(?:is your|adalah|code|kode|for|verifikasi|verification)/i,
    // 3. Format: "code: 123456" / "use 123456" / "kode: 123456"
    /(?:use|enter|masukkan|gunakan|code|kode|OTP|PIN|sandi)[:\s]{1,15}(\d{6})\b/i,
    // 4. Standar 6 digit di dalam tag HTML
    /<(?:strong|b|h1|h2|h3|span|td)[^>]*>\s*(\d{6})\s*<\/(?:strong|b|h1|h2|h3|span|td)>/i,
    // 5. Standalone 6 digit angka
    /\b(\d{6})\b/
  ];

  for (const pat of patterns) {
    const m = allText.match(pat);
    if (m && m[1]) {
      return m[1];
    }
  }

  return null;
}

/**
 * Ekstraksi Magic Link / Password Reset Link dari body email Canva
 */
function extractCanvaResetLink(body = '') {
  if (!body) return '';
  const hrefRegex = /href\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(body)) !== null) {
    const url = match[1];
    const urlLower = url.toLowerCase();

    // Prioritaskan URL domain Canva yang mengarah ke login/reset atau auth
    if (urlLower.includes('canva.com') && (
      urlLower.includes('reset') ||
      urlLower.includes('token=') ||
      urlLower.includes('auth') ||
      urlLower.includes('password')
    )) {
      return url;
    }
  }

  return '';
}

/**
 * Menunggu kode OTP Canva masuk ke inbox Outlook
 * Polling berkala ke outlookreader.my.id
 * @param {string} credentialLine
 * @param {number} timeoutSeconds
 * @param {number} intervalMs
 * @param {Function} onProgress
 */
async function waitForCanvaOtp(credentialLine, timeoutSeconds = 60, intervalMs = 4000, onProgress = null) {
  const startTime = Date.now();
  const maxWaitMs = timeoutSeconds * 1000;
  let attempt = 0;

  while (Date.now() - startTime < maxWaitMs) {
    attempt++;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (typeof onProgress === 'function') {
      onProgress({ attempt, elapsed, maxWait: timeoutSeconds });
    }

    try {
      const data = await callReadInboxApi(credentialLine);
      if (data && data.results && data.results.length > 0) {
        const account = data.results[0];
        if (account.success && Array.isArray(account.messages) && account.messages.length > 0) {
          // Cari pesan dari Canva
          for (const msg of account.messages) {
            const fromText = `${msg.from || ''} ${msg.fromEmail || ''}`.toLowerCase();
            const subjectText = (msg.subject || '').toLowerCase();

            const isCanva = fromText.includes('canva') || subjectText.includes('canva');
            if (isCanva || attempt > 4) { // jika canva atau fallback setelah beberapa percobaan
              const code = extractOtpCode(msg.subject, msg.preview, msg.body);
              if (code) {
                return {
                  code,
                  subject: msg.subject,
                  from: msg.fromEmail || msg.from,
                  date: msg.date
                };
              }
            }
          }
        } else if (!account.success) {
          if (attempt === 1) {
            console.warn(`[OUTLOOKREADER] Info status akun: ${account.error || 'Gagal membaca inbox'}`);
          }
          const errLower = (account.error || '').toLowerCase();
          if (attempt >= 2) {
            if (errLower.includes('aadsts70000') || errLower.includes('refresh_token') || errLower.includes('assertion')) {
              throw new Error(`Token Outlook Kedaluwarsa/Tidak Valid (Microsoft AADSTS70000: Refresh Token Expired/Revoked).`);
            }
            if (errLower.includes('invalid format or email not found')) {
              throw new Error(`Format kredensial tidak valid di outlookreader.my.id (Wajib format: email|password|refresh_token|client_id).`);
            }
          }
        }
      }
    } catch (err) {
      if (err.message.includes('Token Outlook Kedaluwarsa') || err.message.includes('Format kredensial tidak valid')) {
        throw err;
      }
      console.warn(`[OUTLOOKREADER] Polling error (percobaan ${attempt}): ${err.message}`);
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }

  throw new Error(`Timeout ${timeoutSeconds} detik: Kode OTP Canva tidak ditemukan di inbox Outlook.`);
}

/**
 * Menunggu Link Reset Password atau OTP Reset dari Canva masuk ke inbox Outlook
 * @param {string} credentialLine
 * @param {number} timeoutSeconds
 * @param {number} intervalMs
 * @param {Function} onProgress
 */
async function waitForCanvaReset(credentialLine, timeoutSeconds = 60, intervalMs = 4000, onProgress = null) {
  const startTime = Date.now();
  const maxWaitMs = timeoutSeconds * 1000;
  let attempt = 0;

  while (Date.now() - startTime < maxWaitMs) {
    attempt++;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (typeof onProgress === 'function') {
      onProgress({ attempt, elapsed, maxWait: timeoutSeconds });
    }

    try {
      const data = await callReadInboxApi(credentialLine);
      if (data && data.results && data.results.length > 0) {
        const account = data.results[0];
        if (account.success && Array.isArray(account.messages) && account.messages.length > 0) {
          for (const msg of account.messages) {
            const fromText = `${msg.from || ''} ${msg.fromEmail || ''}`.toLowerCase();
            const subjectText = (msg.subject || '').toLowerCase();

            if (fromText.includes('canva') || subjectText.includes('canva') || subjectText.includes('password') || subjectText.includes('sandi') || subjectText.includes('reset')) {
              const resetLink = extractCanvaResetLink(msg.body);
              const code = extractOtpCode(msg.subject, msg.preview, msg.body);

              if (resetLink || code) {
                return {
                  resetLink: resetLink || null,
                  code: code || null,
                  subject: msg.subject,
                  from: msg.fromEmail || msg.from
                };
              }
            }
          }
        } else if (!account.success) {
          if (attempt === 1) {
            console.warn(`[OUTLOOKREADER] Info status akun: ${account.error || 'Gagal membaca inbox'}`);
          }
          const errLower = (account.error || '').toLowerCase();
          if (attempt >= 2) {
            if (errLower.includes('aadsts70000') || errLower.includes('refresh_token') || errLower.includes('assertion')) {
              throw new Error(`Token Outlook Kedaluwarsa/Tidak Valid (Microsoft AADSTS70000: Refresh Token Expired/Revoked).`);
            }
            if (errLower.includes('invalid format or email not found')) {
              throw new Error(`Format kredensial tidak valid di outlookreader.my.id (Wajib format: email|password|refresh_token|client_id).`);
            }
          }
        }
      }
    } catch (err) {
      if (err.message.includes('Token Outlook Kedaluwarsa') || err.message.includes('Format kredensial tidak valid')) {
        throw err;
      }
      console.warn(`[OUTLOOKREADER] Polling reset error (percobaan ${attempt}): ${err.message}`);
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }

  throw new Error(`Timeout ${timeoutSeconds} detik: Link/Kode reset password Canva tidak ditemukan di inbox Outlook.`);
}

module.exports = {
  parseAccountLine,
  callReadInboxApi,
  extractOtpCode,
  extractCanvaResetLink,
  waitForCanvaOtp,
  waitForCanvaReset
};
