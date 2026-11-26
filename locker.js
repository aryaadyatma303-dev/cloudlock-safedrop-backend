const express = require('express');
const {
  lockers,
  lockerState,
  getCompartmentsSummary
} = require('./store');
const { requireAuth } = require('./auth');

const router = express.Router();

// Tab [ Homepage ]
router.get('/home', requireAuth, (req, res) => {
  const summary = getCompartmentsSummary();

  res.json({
    ok: true,
    compartments: {
      online: summary.online,
      total: summary.total
    },
    arrivedPackages: lockerState.arrivedPackages
  });
});

// Client set sinyal shouldOpen (true = harus terbuka, false = harus tertutup)
router.post('/locker/open-request', requireAuth, (req, res) => {
  const { lockerName, shouldOpen } = req.body || {};

  if (!lockerName || typeof lockerName !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'lockerName (string) wajib diisi'
    });
  }

  if (typeof shouldOpen !== 'boolean') {
    return res.status(400).json({
      ok: false,
      error: 'shouldOpen harus bertipe boolean (true atau false)'
    });
  }

  const cleanName = lockerName.trim();
  const entry = lockers.get(cleanName);

  if (!entry) {
    return res.status(404).json({
      ok: false,
      error: `Locker "${cleanName}" tidak ditemukan`
    });
  }

  entry.shouldOpen = shouldOpen;

  res.json({
    ok: true,
    requestedBy: req.session.username,
    locker: {
      lockerName: entry.lockerName,
      shouldOpen: entry.shouldOpen,
      isOpened: entry.isOpened
    }
  });
});

// Tab [ MyPackages ] - list semua compartment & OTP
router.get('/packages', requireAuth, (req, res) => {
  res.json({
    ok: true,
    packages: lockerState.packages
  });
});

// Tab [ MyPackages ] (history) & Tab [ Notifications ]
router.get('/history', requireAuth, (req, res) => {
  res.json({
    ok: true,
    history: lockerState.history
  });
});

module.exports = router;