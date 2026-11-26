const express = require('express');
const crypto = require('crypto');
const {
  DEVICE_API_KEY,
  DEVICE_SESSION_IDLE_MS,
  lockers,
  deviceSessions,
  lockerActiveSession,
  NODE_ONLINE_TIMEOUT_MS
} = require('./store');
const { requireAuth, requireLevel } = require('./auth');

const router = express.Router();

function upsertLocker(cleanName, now) {
  let entry = lockers.get(cleanName);
  if (!entry) {
    entry = {
      lockerName: cleanName,
      isOpened: false,
      shouldOpen: false,
      lastSeen: now
    };
    lockers.set(cleanName, entry);
  } else {
    entry.lastSeen = now;
  }
  return entry;
}

// Middleware khusus device: wajib bawa x-device-session
function requireDeviceSession(req, res, next) {
  const token = String(req.headers['x-device-session'] || '').trim();
  if (!token || !deviceSessions.has(token)) {
    return res.status(401).json({
      ok: false,
      error: 'Device session tidak valid. Lakukan opt-in ulang pakai x-api-key.'
    });
  }

  const session = deviceSessions.get(token);
  const now = Date.now();

  if (now - session.lastActiveAt > DEVICE_SESSION_IDLE_MS) {
    deviceSessions.delete(token);
    if (lockerActiveSession.get(session.lockerName) === token) {
      lockerActiveSession.delete(session.lockerName);
    }
    return res.status(401).json({
      ok: false,
      error: 'Device session expired. Lakukan opt-in ulang.'
    });
  }

  // Pastikan bukan sesi lama yang sudah digantikan opt-in baru untuk locker yang sama
  if (lockerActiveSession.get(session.lockerName) !== token) {
    deviceSessions.delete(token);
    return res.status(401).json({
      ok: false,
      error: 'Device session sudah digantikan sesi baru.'
    });
  }

  session.lastActiveAt = now;
  req.deviceSession = session;
  req.deviceToken = token;
  next();
}

// 1. Opt-in pertama kali pakai API Key -> dapat deviceSessionToken (sekali di respons ini)
router.post('/device/opt-in', (req, res) => {
  const apiKey = String(req.headers['x-api-key'] || '').trim();
  if (!apiKey || apiKey !== DEVICE_API_KEY) {
    return res.status(401).json({
      ok: false,
      error: 'API key device tidak valid'
    });
  }

  const { lockerName, isOpened } = req.body || {};
  if (!lockerName || typeof lockerName !== 'string' || !lockerName.trim()) {
    return res.status(400).json({
      ok: false,
      error: 'lockerName (string) wajib diisi saat opt-in'
    });
  }

  const cleanName = lockerName.trim();
  const now = Date.now();

  // Bersihkan sesi lama jika lockerName ini sebelumnya sudah opt-in
  const oldToken = lockerActiveSession.get(cleanName);
  if (oldToken) {
    deviceSessions.delete(oldToken);
  }

  const entry = upsertLocker(cleanName, now);
  if (typeof isOpened === 'boolean') {
    entry.isOpened = isOpened;
  }

  const deviceSessionToken = `dvs_${crypto.randomBytes(20).toString('hex')}`;
  deviceSessions.set(deviceSessionToken, {
    lockerName: cleanName,
    createdAt: now,
    lastActiveAt: now
  });
  lockerActiveSession.set(cleanName, deviceSessionToken);

  // Session key dikirim hanya di respons opt-in ini
  res.json({
    ok: true,
    lockerName: entry.lockerName,
    deviceSessionToken,
    expiresInSeconds: DEVICE_SESSION_IDLE_MS / 1000,
    shouldOpen: entry.shouldOpen,
    isOpened: entry.isOpened
  });
});

// 2. Heartbeat selanjutnya pakai x-device-session (token tidak dikirim ulang di respons)
router.post('/device/heartbeat', requireDeviceSession, (req, res) => {
  const { lockerName, isOpened } = req.body || {};

  if (!lockerName || typeof lockerName !== 'string' || !lockerName.trim()) {
    return res.status(400).json({
      ok: false,
      error: 'lockerName (string) wajib diisi'
    });
  }

  const cleanName = lockerName.trim();
  if (cleanName !== req.deviceSession.lockerName) {
    return res.status(403).json({
      ok: false,
      error: `Session ini terikat ke "${req.deviceSession.lockerName}", bukan "${cleanName}"`
    });
  }

  const now = Date.now();
  const entry = upsertLocker(cleanName, now);
  if (typeof isOpened === 'boolean') {
    entry.isOpened = isOpened;
  }

  res.json({
    ok: true,
    lockerName: entry.lockerName,
    shouldOpen: entry.shouldOpen,
    isOpened: entry.isOpened,
    serverTime: new Date(now).toISOString()
  });
});

// 3. Cek status satu node (untuk client / controller)
router.get('/device/status', requireAuth, (req, res) => {
  const { lockerName } = req.query || {};
  if (!lockerName || typeof lockerName !== 'string' || !lockerName.trim()) {
    return res.status(400).json({
      ok: false,
      error: 'Query param lockerName wajib diisi'
    });
  }

  const cleanName = lockerName.trim();
  const entry = lockers.get(cleanName);
  if (!entry) {
    return res.status(404).json({
      ok: false,
      error: `Locker "${cleanName}" belum terdaftar di Map lockers`
    });
  }

  const now = Date.now();
  const online = entry.lastSeen !== null && now - entry.lastSeen <= NODE_ONLINE_TIMEOUT_MS;

  res.json({
    ok: true,
    locker: {
      lockerName: entry.lockerName,
      isOpened: entry.isOpened,
      shouldOpen: entry.shouldOpen,
      online,
      lastSeen: entry.lastSeen ? new Date(entry.lastSeen).toISOString() : null,
      ageSeconds: entry.lastSeen ? Math.floor((now - entry.lastSeen) / 1000) : null
    },
    serverTime: new Date(now).toISOString()
  });
});

// --- Admin (level >= 1): lihat & hapus device session ---

router.get('/admin/device-sessions', requireAuth, requireLevel(1), (req, res) => {
  const now = Date.now();
  const list = [];

  for (const [devToken, sess] of deviceSessions.entries()) {
    const idleMs = now - sess.lastActiveAt;
    const isCurrentForLocker = lockerActiveSession.get(sess.lockerName) === devToken;
    const lockerEntry = lockers.get(sess.lockerName);
    const isNodeOnline = Boolean(
      isCurrentForLocker &&
      lockerEntry &&
      lockerEntry.lastSeen !== null &&
      now - lockerEntry.lastSeen <= NODE_ONLINE_TIMEOUT_MS
    );

    list.push({
      token: devToken,
      lockerName: sess.lockerName,
      isCurrentForLocker,
      isNodeOnline,
      createdAt: new Date(sess.createdAt).toISOString(),
      lastActiveAt: new Date(sess.lastActiveAt).toISOString(),
      idleSeconds: Math.floor(idleMs / 1000),
      remainingSeconds: Math.max(0, Math.floor((DEVICE_SESSION_IDLE_MS - idleMs) / 1000))
    });
  }

  res.json({
    ok: true,
    total: list.length,
    sessions: list
  });
});

router.delete('/admin/device-sessions/:token', requireAuth, requireLevel(1), (req, res) => {
  const targetToken = String(req.params.token || '').trim();
  const sess = deviceSessions.get(targetToken);

  if (!sess) {
    return res.status(404).json({
      ok: false,
      error: 'Device session token tidak ditemukan'
    });
  }

  deviceSessions.delete(targetToken);
  if (lockerActiveSession.get(sess.lockerName) === targetToken) {
    lockerActiveSession.delete(sess.lockerName);
  }

  res.json({
    ok: true,
    message: 'Device session berhasil dihapus',
    lockerName: sess.lockerName
  });
});

module.exports = router;