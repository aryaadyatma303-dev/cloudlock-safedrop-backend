const path = require('path');
const express = require('express');
const cors = require('cors');
const { SESSION_IDLE_TIMEOUT_MS, sessions } = require('./store');
const { router: authRouter } = require('./auth');
const deviceRouter = require('./device');
const lockerRouter = require('./locker');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Sajikan file statis (termasuk /controller/controller.html)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ ok: true, status: 'running' });
});

app.use('/api', authRouter);
app.use('/api', deviceRouter);
app.use('/api', lockerRouter);

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now - session.lastActiveAt > SESSION_IDLE_TIMEOUT_MS) {
      sessions.delete(token);
    }
  }
}, 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
});