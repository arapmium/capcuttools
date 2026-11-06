/**
 * outlookreader.js
 * Modul pembaca inbox dan penangkap kode OTP / Magic Link dari Outlook / Hotmail
 * melalui API https://outlookreader.my.id (/api/v1/otp & /api/read-inbox)
 * serta fallback langsung Microsoft Graph API (OAuth2 refresh_token).
 */

require('dotenv').config();
const https = require('https');

const OUTLOOK_READER_BASE_URL = 'https://outlookreader.my.id';
const DEFAULT_OUTLOOK_API_URL = 'https://outlookreader.my.id/api/v1/otp';
const DEFAULT_OUTLOOK_API_KEY = 'rdr_05d6ad1e07c889cb134281ea4b35ea37c6e17575';
const DEFAULT_GRAPH_CLIENT_ID = '9e5f94bc-e8a4-4e73-b8be-63364c29d753';

/**
 * Parsing satu baris kredensial akun Outlook/Hotmail
 * Format umum:
 * 1. email|password|refresh_token|client_id
 * 2. email|password|token
 * 3. email|password
 * 4. email:password
 */
function parseAccountLine(rawLine = '') {
  let line = String(rawLine).trim();
  if (!line || line.startsWith('#')) return null;

  // Hapus penomoran depan seperti "1. " atau "1) "
  line = line.replace(/^\d+[\.\)\s]+\s*/, '');

  let parts;
  if (line.includes('|')) {
    parts = line.split('|').map(p => p.trim());
  } else {
    parts = line.split(':').map(p => p.trim());
  }

  const email = (parts[0] || '').trim();
  const password = parts[1] || '';
  const token = parts[2] || '';
  const clientId = parts[3] || DEFAULT_GRAPH_CLIENT_ID;

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
 * Helper HTTP POST JSON via https
 */
function postJson(urlStr, bodyObj, extraHeaders = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(bodyObj);
    const parsedUrl = new URL(urlStr);

    const req = https.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        ...extraHeaders
      },
      timeout: timeoutMs
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: null, raw: data });
        }
      });
    });

    req.on('error', err => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout ${timeoutMs}ms ke ${urlStr}`));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Panggil API /api/v1/otp di outlookreader.my.id
 */
async function callOtpV1Api(credentialLine) {
  const apiUrl = (process.env.outlook_api_url || process.env.OUTLOOK_API_URL || DEFAULT_OUTLOOK_API_URL).trim();
  const apiKey = (process.env.outlook_api_key || process.env.OUTLOOK_API_KEY || DEFAULT_OUTLOOK_API_KEY).trim();
  if (!apiKey) return null;

  const res = await postJson(
    apiUrl,
    { credentials: credentialLine, top: 10 },
    { 'X-API-Key': apiKey },
    12000
  );
  if (res && res.statusCode === 200 && res.data) {
    return res.data;
  }
  return null;
}

/**
 * Panggil API /api/read-inbox di outlookreader.my.id
 */
async function callReadInboxApi(credentialLine, mode = 'oauth2') {
  const res = await postJson(
    `${OUTLOOK_READER_BASE_URL}/api/read-inbox`,
    { credentials: credentialLine, mode, useProxy: false },
    {},
    15000
  );
  if (res && res.data) {
    return res.data;
  }
  throw new Error(`Gagal membaca response dari outlookreader /api/read-inbox`);
}

/**
 * Ekstraksi kode OTP 6 digit dari teks subject, preview, dan body
 */
function extractOtpCode(subject = '', preview = '', body = '') {
  const plainBody = body ? body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>?/gm, ' ') : '';
  const allText = `${subject} ${preview} ${plainBody}`;

  const patterns = [
    /(?:kode|code|verification|verifikasi|otp|canva)[^\d]{1,35}(\b\d{6}\b)/i,
    /(\b\d{6}\b)[^\d]{1,30}(?:adalah kode|is your|for canva|canva)/i,
    /(?:use|enter|masukkan|gunakan|code|kode|OTP|PIN|sandi)[:\s]{1,15}(\b\d{6}\b)/i,
    /<(?:strong|b|h1|h2|h3|span|td)[^>]*>\s*(\d{6})\s*<\/(?:strong|b|h1|h2|h3|span|td)>/i,
    /(?<!\d)(\d{6})(?!\d)/
  ];

  for (const pat of patterns) {
    const m = allText.match(pat);
    if (m && m[1]) {
      return String(m[1]).trim();
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
 * Ambil semua kandidat OTP / pesan terbaru dari outlookreader (/api/v1/otp & /api/read-inbox)
 */
async function fetchAllOtpCandidates(credentialLine) {
  const candidates = [];
  const seenCodes = new Set();

  // 1. Cek cepat /api/v1/otp
  try {
    const v1 = await callOtpV1Api(credentialLine);
    if (v1 && v1.success && v1.code) {
      const codeStr = String(v1.code).trim();
      const cs = v1.codeSource || {};
      seenCodes.add(codeStr);
      candidates.push({
        code: codeStr,
        subject: cs.subject || '',
        from: cs.fromEmail || '',
        date: cs.receivedAt || '',
        resetLink: null
      });
    }
  } catch (_) {}

  // 2. Cek /api/read-inbox untuk daftar pesan lengkap (termasuk jika ada beberapa email berurutan)
  try {
    const inboxData = await callReadInboxApi(credentialLine);
    if (inboxData && Array.isArray(inboxData.results) && inboxData.results.length > 0) {
      const acc = inboxData.results[0];
      if (acc.success && Array.isArray(acc.messages)) {
        for (const msg of acc.messages) {
          const code = extractOtpCode(msg.subject, msg.preview, msg.body);
          const resetLink = extractCanvaResetLink(msg.body);
          const codeStr = code ? String(code).trim() : null;
          if (codeStr && !seenCodes.has(codeStr)) {
            seenCodes.add(codeStr);
            candidates.push({
              code: codeStr,
              subject: msg.subject || '',
              from: `${msg.from || ''} ${msg.fromEmail || ''}`.trim(),
              date: msg.date || msg.receivedDateTime || '',
              resetLink: resetLink || null
            });
          } else if (!codeStr && resetLink) {
            candidates.push({
              code: null,
              subject: msg.subject || '',
              from: `${msg.from || ''} ${msg.fromEmail || ''}`.trim(),
              date: msg.date || msg.receivedDateTime || '',
              resetLink
            });
          }
        }
      } else if (acc && !acc.success && acc.error) {
        const errLower = String(acc.error).toLowerCase();
        if (errLower.includes('aadsts70000') || errLower.includes('refresh_token') || errLower.includes('assertion')) {
          throw new Error(`Token Outlook Kedaluwarsa/Tidak Valid (Microsoft AADSTS70000: Refresh Token Expired/Revoked).`);
        }
        if (errLower.includes('invalid format or email not found')) {
          throw new Error(`Format kredensial tidak valid di outlookreader.my.id (Wajib format: email|password|refresh_token|client_id).`);
        }
      }
    }
  } catch (err) {
    if (err.message.includes('Token Outlook Kedaluwarsa') || err.message.includes('Format kredensial tidak valid')) {
      throw err;
    }
  }

  return candidates;
}

/**
 * Snapshot baseline inbox SEBELUM tombol Lanjutkan / Buat Kata Sandi diklik di Canva.
 * Mencatat semua kode OTP yang SUDAH ADA di inbox (`existingOtps`) sebelum request dikirim,
 * sehingga begitu kode OTP baru masuk, langsung diambil tanpa pernah salah dianggap kode lama!
 */
async function captureCanvaBaseline(credentialLine) {
  const existingOtps = new Set();
  let latestDate = '';
  try {
    const items = await fetchAllOtpCandidates(credentialLine);
    for (const item of items) {
      if (item.code) existingOtps.add(String(item.code).trim());
      if (item.date && item.date > latestDate) latestDate = item.date;
    }
  } catch (_) {}
  return {
    existingOtps,
    latestDate,
    capturedAt: new Date().toISOString()
  };
}

/**
 * Menunggu kode OTP Canva TERBARU masuk ke inbox Outlook via outlookreader.my.id
 * @param {string} credentialLine
 * @param {number} timeoutSeconds
 * @param {number} intervalMs - Default 1500ms (1.5 detik) agar tidak ada delay
 * @param {Function} onProgress
 * @param {Object} options - { baseline, excludeOtps, purpose: 'signup' | 'password_reset' }
 */
async function waitForCanvaOtp(credentialLine, timeoutSeconds = 90, intervalMs = 1500, onProgress = null, options = {}) {
  const startTime = Date.now();
  const maxWaitMs = timeoutSeconds * 1000;
  let attempt = 0;

  const purpose = options.purpose || 'signup';
  const excludeSet = new Set();

  if (options.baseline && options.baseline.existingOtps) {
    for (const c of options.baseline.existingOtps) excludeSet.add(String(c).trim());
  }
  if (options.excludeOtps) {
    for (const c of options.excludeOtps) excludeSet.add(String(c).trim());
  }

  while (Date.now() - startTime < maxWaitMs) {
    attempt++;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (typeof onProgress === 'function') {
      try {
        await onProgress({ attempt, elapsed, maxWait: timeoutSeconds });
      } catch (_) {}
    }

    try {
      const candidates = await fetchAllOtpCandidates(credentialLine);
      for (const item of candidates) {
        if (!item.code) continue;
        const codeStr = String(item.code).trim();

        // 1. Abaikan jika kode sudah ada di inbox sebelum klik submit atau pernah ditolak
        if (excludeSet.has(codeStr)) {
          continue;
        }

        const fromLower = (item.from || '').toLowerCase();
        const subjLower = (item.subject || '').toLowerCase();

        // 2. Pastikan dari Canva (atau fallback jika subject kosong dari endpoint otp)
        const isCanva = !subjLower || fromLower.includes('canva') || subjLower.includes('canva') || subjLower.includes('kode') || subjLower.includes('code');
        if (!isCanva) continue;

        // 3. Jika mode password_reset, abaikan email verifikasi pendaftaran awal
        if (purpose === 'password_reset') {
          if (
            subjLower.includes('selesaikan pendaftaran') ||
            subjLower.includes('complete your sign') ||
            subjLower.includes('finish signing up') ||
            subjLower.includes('verify your email')
          ) {
            continue;
          }
        }

        return {
          code: codeStr,
          subject: item.subject,
          from: item.from,
          date: item.date
        };
      }
    } catch (err) {
      if (err.message.includes('Token Outlook Kedaluwarsa') || err.message.includes('Format kredensial tidak valid')) {
        throw err;
      }
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }

  throw new Error(`Timeout ${timeoutSeconds} detik: Kode OTP Canva baru tidak ditemukan di inbox Outlook.`);
}

/**
 * Menunggu OTP Reset Password atau Link Reset dari Canva masuk ke inbox Outlook
 */
async function waitForCanvaReset(credentialLine, timeoutSeconds = 90, intervalMs = 1500, onProgress = null, options = {}) {
  const res = await waitForCanvaOtp(credentialLine, timeoutSeconds, intervalMs, onProgress, {
    ...options,
    purpose: 'password_reset'
  });
  return {
    resetLink: null,
    code: res.code,
    subject: res.subject,
    from: res.from,
    date: res.date
  };
}

module.exports = {
  parseAccountLine,
  callOtpV1Api,
  callReadInboxApi,
  extractOtpCode,
  extractCanvaResetLink,
  captureCanvaBaseline,
  waitForCanvaOtp,
  waitForCanvaReset
};
