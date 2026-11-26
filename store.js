const SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 menit
const NODE_ONLINE_TIMEOUT_MS = 15 * 1000; // 15 detik (cocok untuk ping tiap 3-5 detik)

const DEVICE_API_KEY = process.env.DEVICE_API_KEY || 'dev-secret-key-123'; //API buat Arduino/ESP opt-in dan connect ke backend
const DEVICE_SESSION_IDLE_MS = 10 * 60 * 1000; // 10 menit

// deviceSessionToken -> { lockerName, createdAt, lastActiveAt }
const deviceSessions = new Map();
// lockerName -> activeDeviceSessionToken (agar 1 locker pegang 1 sesi aktif terbaru)
const lockerActiveSession = new Map();

const users = new Map([
  ['admin', { password: '123456', level: 1 }],
  ['user1', { password: 'user123', level: 0 }]
]);

// token -> { username, createdAt, lastActiveAt }
const sessions = new Map();

// lockerName -> { lockerName, isOpened, shouldOpen, lastSeen }
const lockers = new Map([
  [
    'Locker A1',
    {
      lockerName: 'Locker A1',
      isOpened: false,
      shouldOpen: false,
      lastSeen: null
    }
  ],
  [
    'Locker B2',
    {
      lockerName: 'Locker B2',
      isOpened: false,
      shouldOpen: false,
      lastSeen: null
    }
  ]
]);

/*
  [ Fake Data Placeholder untuk Prototype! Masih ter-share ke setiap akun ]
  Akan di gantikan oleh MongoDB dalam format yang lebih baik.
*/
const lockerState = {
  // Daftar compartment yang sedang ada paket masuk (belum diambil)
  arrivedPackages: [
    {
      lockerName: 'Locker A1',
      arrivedAt: '2026-11-25T19:40:00.000Z'
    },
    {
      lockerName: 'Locker B2',
      arrivedAt: '2026-11-25T19:55:00.000Z'
    }
  ],
  // Daftar semua compartment beserta OTP & status pengambilan
  packages: [
    {
      lockerName: 'Locker A1',
      otp: '482910',
      isCollected: false
    },
    {
      lockerName: 'Locker A2',
      otp: '193847',
      isCollected: true
    },
    {
      lockerName: 'Locker B1',
      otp: '736251',
      isCollected: true
    },
    {
      lockerName: 'Locker B2',
      otp: '904812',
      isCollected: false
    }
  ],
  // Dipakai oleh bagian history di MyPackages maupun tab Notifications
  history: [
    {
      id: 'hist-1',
      lockerName: 'Locker A2',
      action: 'Collected',
      timestamp: '2026-11-25T18:10:00.000Z'
    },
    {
      id: 'hist-2',
      lockerName: 'Locker A1',
      action: 'Arrived',
      timestamp: '2026-11-25T19:40:00.000Z'
    },
    {
      id: 'hist-3',
      lockerName: 'Locker B2',
      action: 'Arrived',
      timestamp: '2026-11-25T19:55:00.000Z'
    }
  ]
};

function isLockerOnline(entry, now = Date.now()) {
  if (!entry || !entry.lastSeen) return false;
  return now - entry.lastSeen <= NODE_ONLINE_TIMEOUT_MS;
}

function getCompartmentsSummary(now = Date.now()) {
  const allLockers = Array.from(lockers.values());
  const onlineCount = allLockers.filter((item) => isLockerOnline(item, now)).length;

  return {
    online: onlineCount,
    total: allLockers.length,
    items: allLockers.map((item) => ({
      lockerName: item.lockerName,
      isOpened: item.isOpened,
      shouldOpen: item.shouldOpen,
      online: isLockerOnline(item, now),
      lastSeen: item.lastSeen
    }))
  };
}

module.exports = {
  SESSION_IDLE_TIMEOUT_MS,
  NODE_ONLINE_TIMEOUT_MS,
  users,
  sessions,
  lockers,
  lockerState,
  isLockerOnline,
  getCompartmentsSummary,
  DEVICE_API_KEY,
  DEVICE_SESSION_IDLE_MS,
  deviceSessions,
  lockerActiveSession
};