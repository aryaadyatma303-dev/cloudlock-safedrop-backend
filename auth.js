const express = require('express');
const crypto = require('crypto');
const { SESSION_IDLE_TIMEOUT_MS, users, sessions } = require('./store');

const router = express.Router();

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  if (!token || !sessions.has(token)) {
    return res.status(401).json({
      ok: false,
      error: 'Session token tidak valid atau sudah tidak ada'
    });
  }

  const session = sessions.get(token);
  const now = Date.now();

  if (now - session.lastActiveAt > SESSION_IDLE_TIMEOUT_MS) {
    sessions.delete(token);
    return res.status(401).json({
      ok: false,
      error: 'Session expired karena tidak ada aktivitas selama 10 menit'
    });
  }

  session.lastActiveAt = now;
  req.session = session;
  req.token = token;
  next();
}

function requireLevel(minLevel) {
  return (req, res, next) => {
    const level = Number(req.session?.level ?? 0);
    if (level < minLevel) {
      return res.status(403).json({
        ok: false,
        error: `Akses ditolak: butuh permission level ${minLevel}, level akun kamu ${level}`
      });
    }
    next();
  };
}

function maskToken(token) {
  if (!token || token.length < 10) return '***';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

// Login -> sertakan level di response
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({
      ok: false,
      error: 'username dan password wajib diisi'
    });
  }

  const user = users.get(username);
  if (!user || user.password !== password) {
    return res.status(401).json({
      ok: false,
      error: 'Username atau password salah'
    });
  }

  const level = Number(user.level ?? 0);
  const now = Date.now();
  const token = crypto.randomBytes(24).toString('hex');

  sessions.set(token, {
    username,
    level,
    createdAt: now,
    lastActiveAt: now
  });

  res.json({
    ok: true,
    token,
    expiresInSeconds: SESSION_IDLE_TIMEOUT_MS / 1000,
    user: { username, level }
  });
});

router.post('/ping', requireAuth, (req, res) => {
  const remainingMs = SESSION_IDLE_TIMEOUT_MS - (Date.now() - req.session.lastActiveAt);

  res.json({
    ok: true,
    message: 'Pong! Session diperpanjang',
    user: req.session.username,
    level: req.session.level,
    remainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
    serverTime: new Date().toISOString()
  });
});

router.post('/logout', requireAuth, (req, res) => {
  sessions.delete(req.token);
  res.json({ ok: true, message: 'Logout berhasil, session dihapus' });
});

// --- Endpoint Debugging Khusus Permission Level 1 (Admin) ---

// Lihat semua session aktif
router.get('/admin/sessions', requireAuth, requireLevel(1), (req, res) => {
  const now = Date.now();
  const list = [];

  for (const [tokenKey, sess] of sessions.entries()) {
    const idleMs = now - sess.lastActiveAt;
    list.push({
      token: tokenKey, // berguna saat ngetes edit/hapus di controller
      tokenPreview: maskToken(tokenKey),
      username: sess.username,
      level: sess.level,
      createdAt: new Date(sess.createdAt).toISOString(),
      lastActiveAt: new Date(sess.lastActiveAt).toISOString(),
      idleSeconds: Math.floor(idleMs / 1000),
      remainingSeconds: Math.max(0, Math.floor((SESSION_IDLE_TIMEOUT_MS - idleMs) / 1000))
    });
  }

  res.json({
    ok: true,
    total: list.length,
    sessions: list
  });
});

// Edit session (misal: expireNow: true, extendSeconds: 300, atau lastActiveAt langsung)
router.patch('/admin/sessions/:token', requireAuth, requireLevel(1), (req, res) => {
  const targetToken = String(req.params.token || '').trim();
  const sess = sessions.get(targetToken);

  if (!sess) {
    return res.status(404).json({
      ok: false,
      error: 'Session token tidak ditemukan'
    });
  }

  const { expireNow, extendSeconds, lastActiveAt, level } = req.body || {};
  const now = Date.now();

  if (expireNow === true) {
    sess.lastActiveAt = now - (SESSION_IDLE_TIMEOUT_MS + 1000);
  } else if (typeof lastActiveAt === 'number' && Number.isFinite(lastActiveAt)) {
    sess.lastActiveAt = lastActiveAt;
  } else if (typeof extendSeconds === 'number' && Number.isFinite(extendSeconds)) {
    // Geser lastActiveAt agar sisa waktunya menjadi extendSeconds dari sekarang
    const clampedSec = Math.min(extendSeconds, SESSION_IDLE_TIMEOUT_MS / 1000);
    sess.lastActiveAt = now - (SESSION_IDLE_TIMEOUT_MS - clampedSec * 1000);
  }

  if (level === 0 || level === 1) {
    sess.level = level;
  }

  res.json({
    ok: true,
    message: 'Session berhasil diubah',
    session: {
      tokenPreview: maskToken(targetToken),
      username: sess.username,
      level: sess.level,
      lastActiveAt: new Date(sess.lastActiveAt).toISOString()
    }
  });
});

// Hapus session tertentu
router.delete('/admin/sessions/:token', requireAuth, requireLevel(1), (req, res) => {
  const targetToken = String(req.params.token || '').trim();

  if (!sessions.has(targetToken)) {
    return res.status(404).json({
      ok: false,
      error: 'Session token tidak ditemukan'
    });
  }

  sessions.delete(targetToken);
  res.json({
    ok: true,
    message: 'Session berhasil dihapus',
    deletedTokenPreview: maskToken(targetToken)
  });
});

module.exports = { router, requireAuth, requireLevel };