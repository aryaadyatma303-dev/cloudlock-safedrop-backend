const DEFAULT_IDLE_SECONDS = 600; // 10 menit
const DEFAULT_RENDER_URL = 'https://nama-app-kamu.onrender.com';

let token = '';
let userLevel = 0;
let expiresAtMs = 0;
let pollTimerId = null;
let countdownTimerId = null;
let isPolling = false;

// Menyimpan device session hasil opt-in di UI: { token, lockerName, createdAt, isOpened, shouldOpen }
let localDeviceSessions = [];
let equippedDeviceToken = '';

const el = (id) => document.getElementById(id);

const baseUrlInput = el('baseUrl');
const envBadge = el('envBadge');
const envHint = el('envHint');
const usernameInput = el('username');
const passwordInput = el('password');
const tokenInput = el('tokenInput');
const sessionBadge = el('sessionBadge');
const countdownText = el('countdownText');
const httpStatusBadge = el('httpStatusBadge');
const rawJsonOutput = el('rawJsonOutput');
const lockerNameInput = el('lockerName');
const pollBadge = el('pollBadge');
const lastPollText = el('lastPollText');
const pollIntervalInput = el('pollIntervalSec');
const simIsOpenedSelect = el('simIsOpened');
const togglePollBtn = el('togglePollBtn');
const nodeStatusJson = el('nodeStatusJson');

const deviceApiKeyInput = el('deviceApiKeyInput');
const optInStatusBadge = el('optInStatusBadge');
const equippedBadge = el('equippedBadge');
const equippedDeviceList = el('equippedDeviceList');
const equippedSessionInput = el('equippedSessionInput');

const adminSessionsCard = el('adminSessionsCard');
const loginSessCount = el('loginSessCount');
const deviceSessCount = el('deviceSessCount');
const loginSessionsList = el('loginSessionsList');
const deviceSessionsList = el('deviceSessionsList');

function detectBaseUrl() {
  if (!baseUrlInput || !envBadge) return;

  const host = String(window.location.hostname || '').toLowerCase();
  const port = String(window.location.port || '');
  const protocol = String(window.location.protocol || '');
  const origin = String(window.location.origin || '');

  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.local');

  if (isLocal) {
    const localPort = port || '3000';
    const url = `${protocol}//${host}:${localPort}`;
    baseUrlInput.value = url;
    envBadge.textContent = 'Localhost';
    envBadge.className = 'badge active';
    if (envHint) envHint.textContent = `Terdeteksi lokal (${host}) -> otomatis pakai ${url}`;
  } else if (protocol.startsWith('http') && origin && origin !== 'null') {
    baseUrlInput.value = origin;
    envBadge.textContent = 'Remote Host';
    envBadge.className = 'badge active';
    if (envHint) envHint.textContent = `Terdeteksi origin aktif: ${origin}`;
  } else {
    if (!baseUrlInput.value.trim()) {
      baseUrlInput.value = DEFAULT_RENDER_URL;
    }
    envBadge.textContent = 'File / Manual';
    envBadge.className = 'badge';
    if (envHint) {
      envHint.textContent =
        'Dibuka dari file lokal; isi Base URL ke server Render atau localhost lalu klik Login/Ping.';
    }
  }
}

function getBaseUrl() {
  const raw = baseUrlInput ? baseUrlInput.value.trim() : '';
  if (!raw) {
    detectBaseUrl();
  }
  return (baseUrlInput ? baseUrlInput.value.trim() : DEFAULT_RENDER_URL).replace(/\/+$/, '');
}

function getActiveToken() {
  return tokenInput ? tokenInput.value.trim() : '';
}

function getEquippedDeviceToken() {
  return equippedSessionInput ? equippedSessionInput.value.trim() : '';
}

function formatCreatedTime(isoOrMs) {
  if (!isoOrMs) return '-';
  const d = new Date(isoOrMs);
  if (Number.isNaN(d.getTime())) return String(isoOrMs);
  return `${d.toLocaleDateString('id-ID')} ${d.toLocaleTimeString('id-ID')}`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function setAdminVisibility(level) {
  userLevel = Number(level) || 0;
  if (!adminSessionsCard) return;
  if (userLevel >= 1) {
    adminSessionsCard.classList.remove('hidden');
  } else {
    adminSessionsCard.classList.add('hidden');
  }
}

function setRawOutput(statusCode, data) {
  if (httpStatusBadge) {
    httpStatusBadge.textContent = statusCode ? `HTTP ${statusCode}` : 'Error';
    httpStatusBadge.className =
      statusCode >= 200 && statusCode < 300 ? 'badge active' : 'badge expired';
  }
  if (rawJsonOutput) {
    rawJsonOutput.textContent = JSON.stringify(data, null, 2);
  }
}

function setNodeStatusRaw(data) {
  if (nodeStatusJson) {
    nodeStatusJson.textContent = JSON.stringify(data, null, 2);
  }
  if (lastPollText) {
    lastPollText.textContent = `Update: ${new Date().toLocaleTimeString()}`;
  }
}

function resetSessionTimer(seconds = DEFAULT_IDLE_SECONDS) {
  const sec = Number.isFinite(Number(seconds)) ? Number(seconds) : DEFAULT_IDLE_SECONDS;
  expiresAtMs = Date.now() + sec * 1000;
  if (sessionBadge) {
    sessionBadge.textContent = userLevel >= 1 ? 'Token Aktif (Admin L1)' : 'Token Aktif (L0)';
    sessionBadge.className = 'badge active';
  }
  updateCountdownUI();
}

function stopPolling(label = 'Poll: OFF') {
  isPolling = false;
  if (pollTimerId !== null) {
    clearInterval(pollTimerId);
    pollTimerId = null;
  }
  if (togglePollBtn) {
    togglePollBtn.textContent = 'Mulai Polling Status';
  }
  if (pollBadge) {
    pollBadge.textContent = label;
    pollBadge.className = 'badge';
  }
}

function clearSession(reason = 'No Token', isExpired = false, clearBox = true) {
  stopPolling();
  token = '';
  expiresAtMs = 0;
  setAdminVisibility(0);
  if (clearBox && tokenInput) {
    tokenInput.value = '';
  }
  if (countdownText) {
    countdownText.textContent = '--:--';
  }
  if (sessionBadge) {
    sessionBadge.textContent = reason;
    sessionBadge.className = isExpired ? 'badge expired' : 'badge';
  }
}

function updateCountdownUI() {
  if (!countdownText) return;
  const current = getActiveToken();
  if (!current || !expiresAtMs) return;

  const remainingSec = Math.floor((expiresAtMs - Date.now()) / 1000);
  if (remainingSec <= 0) {
    countdownText.textContent = '00:00';
    if (sessionBadge) {
      sessionBadge.textContent = 'Expired (~10m)';
      sessionBadge.className = 'badge expired';
    }
    return;
  }

  const mins = String(Math.floor(remainingSec / 60)).padStart(2, '0');
  const secs = String(remainingSec % 60).padStart(2, '0');
  countdownText.textContent = `${mins}:${secs}`;
}

// Fetch khusus endpoint user session (Bearer token)
async function userFetch(path, options = {}, requiresAuth = true) {
  const url = `${getBaseUrl()}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const authToken = getActiveToken();
  if (requiresAuth) {
    if (!authToken) {
      return {
        status: null,
        data: { error: 'Masukkan atau login dulu untuk mendapatkan login session token.' }
      };
    }
    headers.Authorization = `Bearer ${authToken}`;
  }

  try {
    const res = await fetch(url, { ...options, headers });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (res.status === 401 && requiresAuth) {
      clearSession('401 Invalid/Expired', true, false);
    } else if (res.ok && requiresAuth && authToken) {
      token = authToken;
      if (typeof data.level === 'number' && data.level >= 1) {
        setAdminVisibility(data.level);
      }
      const nextSec =
        typeof data.remainingSeconds === 'number'
          ? data.remainingSeconds
          : DEFAULT_IDLE_SECONDS;
      resetSessionTimer(nextSec);
    }

    return { status: res.status, data };
  } catch (err) {
    return {
      status: null,
      data: {
        error: 'Gagal terhubung ke server',
        detail: err.message,
        targetUrl: url
      }
    };
  }
}

async function callAndShowMainJson(path, options = {}, requiresAuth = true) {
  const result = await userFetch(path, options, requiresAuth);
  setRawOutput(result.status, result.data);
  return result;
}

// --- Device Opt-In & Equip ---

function equipDeviceSession(devToken, syncLockerName = true) {
  equippedDeviceToken = String(devToken || '').trim();
  if (equippedSessionInput) {
    equippedSessionInput.value = equippedDeviceToken;
  }

  const matched = localDeviceSessions.find((s) => s.token === equippedDeviceToken);
  if (syncLockerName && matched && lockerNameInput) {
    lockerNameInput.value = matched.lockerName;
  }

  if (equippedBadge) {
    if (equippedDeviceToken) {
      equippedBadge.textContent = matched ? `Equipped: ${matched.lockerName}` : 'Equipped (Manual)';
      equippedBadge.className = 'badge active';
    } else {
      equippedBadge.textContent = 'None Equipped';
      equippedBadge.className = 'badge';
    }
  }

  renderEquippedDeviceSessions();
}

function renderEquippedDeviceSessions() {
  if (!equippedDeviceList) return;
  const activeEquip = getEquippedDeviceToken();

  if (!localDeviceSessions.length) {
    equippedDeviceList.innerHTML =
      '<div class="empty-note">Belum ada device session. Tekan ➕ untuk opt-in.</div>';
    return;
  }

  equippedDeviceList.innerHTML = localDeviceSessions
    .map((s) => {
      const isEquipped = s.token === activeEquip;
      return `
        <div
          class="session-item selectable ${isEquipped ? 'equipped' : ''}"
          data-equip-token="${escapeHtml(s.token)}"
          title="Klik untuk equip session ini ke simulasi Heartbeat"
        >
          <div class="session-title">
            <span>${escapeHtml(s.lockerName)}</span>
            ${isEquipped ? '<span class="badge active">Equipped</span>' : '<span class="badge">Klik Equip</span>'}
          </div>
          <div class="session-token-preview">${escapeHtml(s.token)}</div>
          <div class="session-created-at">Opt-in: ${escapeHtml(formatCreatedTime(s.createdAt))}</div>
        </div>
      `;
    })
    .join('');
}

async function handleDeviceOptIn() {
  const apiKey = deviceApiKeyInput ? deviceApiKeyInput.value.trim() : '';
  const lockerName = lockerNameInput ? lockerNameInput.value.trim() : '';
  const isOpened = simIsOpenedSelect ? simIsOpenedSelect.value === 'true' : false;

  if (!lockerName) {
    setNodeStatusRaw({ error: 'Isi Locker Name terlebih dahulu sebelum opt-in.' });
    return;
  }

  const url = `${getBaseUrl()}/api/device/opt-in`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({ lockerName, isOpened })
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (res.status === 200 && data.deviceSessionToken) {
      if (optInStatusBadge) {
        optInStatusBadge.textContent = 'Opt-In OK';
        optInStatusBadge.className = 'badge active';
      }

      // Ganti sesi lokal dengan lockerName yang sama agar tidak duplikat
      localDeviceSessions = localDeviceSessions.filter((s) => s.lockerName !== data.lockerName);
      localDeviceSessions.unshift({
        token: data.deviceSessionToken,
        lockerName: data.lockerName,
        createdAt: new Date().toISOString(),
        isOpened: Boolean(data.isOpened),
        shouldOpen: Boolean(data.shouldOpen)
      });

      equipDeviceSession(data.deviceSessionToken, false);

      if (userLevel >= 1) {
        refreshAdminSessions();
      }
    } else {
      if (optInStatusBadge) {
        optInStatusBadge.textContent = res.status === 401 ? 'API Key Invalid' : `HTTP ${res.status}`;
        optInStatusBadge.className = 'badge expired';
      }
    }

    setNodeStatusRaw({
      action: 'POST /api/device/opt-in',
      httpStatus: res.status,
      response: data
    });
  } catch (err) {
    if (optInStatusBadge) {
      optInStatusBadge.textContent = 'Error';
      optInStatusBadge.className = 'badge expired';
    }
    setNodeStatusRaw({
      action: 'POST /api/device/opt-in',
      error: 'Gagal terhubung ke server',
      detail: err.message
    });
  }
}

async function handleSendHeartbeat() {
  const devToken = getEquippedDeviceToken();
  const lockerName = lockerNameInput ? lockerNameInput.value.trim() : '';
  const isOpened = simIsOpenedSelect ? simIsOpenedSelect.value === 'true' : false;

  if (!devToken) {
    setNodeStatusRaw({
      error: 'Belum ada Device Session token di-equip. Klik salah satu session atau opt-in pakai ➕.'
    });
    return;
  }

  const url = `${getBaseUrl()}/api/device/heartbeat`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-session': devToken
      },
      body: JSON.stringify({ lockerName, isOpened })
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    setNodeStatusRaw({
      action: 'POST /api/device/heartbeat',
      equippedSession: devToken,
      httpStatus: res.status,
      response: data
    });
  } catch (err) {
    setNodeStatusRaw({
      action: 'POST /api/device/heartbeat',
      error: 'Gagal terhubung ke server',
      detail: err.message
    });
  }
}

// --- Admin Sessions ---

function renderLoginSessions(list) {
  if (loginSessCount) loginSessCount.textContent = String(list.length);
  if (!loginSessionsList) return;

  if (!list.length) {
    loginSessionsList.innerHTML = '<div class="empty-note">Tidak ada login session aktif.</div>';
    return;
  }

  loginSessionsList.innerHTML = list
    .map((s) => {
      const isMe = s.token === getActiveToken();
      return `
        <div class="session-item">
          <div class="session-top">
            <div class="session-meta">
              <div class="session-title">
                <span>${escapeHtml(s.username)}</span>
                <span class="badge">L${escapeHtml(s.level)}</span>
                <span class="badge">${escapeHtml(s.remainingSeconds)}s left</span>
                ${isMe ? '<span class="badge active">Current</span>' : ''}
              </div>
              <div class="session-token-preview">${escapeHtml(s.token)}</div>
              <div class="session-created-at">Muncul: ${escapeHtml(formatCreatedTime(s.createdAt))}</div>
            </div>
            <button
              type="button"
              class="trash-btn"
              title="Hapus login session"
              data-delete-login="${escapeHtml(s.token)}"
            >🗑️</button>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderDeviceSessions(list) {
  if (deviceSessCount) deviceSessCount.textContent = String(list.length);
  if (!deviceSessionsList) return;

  if (!list.length) {
    deviceSessionsList.innerHTML = '<div class="empty-note">Tidak ada device session aktif.</div>';
    return;
  }

  deviceSessionsList.innerHTML = list
    .map((s) => {
      let statusBadge = '<span class="badge expired">Offline (Timeout)</span>';
      if (s.isNodeOnline) {
        statusBadge = '<span class="badge active">Active Node</span>';
      } else if (!s.isCurrentForLocker) {
        statusBadge = '<span class="badge">Replaced</span>';
      }

      return `
        <div class="session-item">
          <div class="session-top">
            <div class="session-meta">
              <div class="session-title">
                <span>${escapeHtml(s.lockerName)}</span>
                <span class="badge">${escapeHtml(s.remainingSeconds)}s left</span>
                ${statusBadge}
              </div>
              <div class="session-token-preview">${escapeHtml(s.token)}</div>
              <div class="session-created-at">Muncul: ${escapeHtml(formatCreatedTime(s.createdAt))}</div>
            </div>
            <button
              type="button"
              class="trash-btn"
              title="Hapus device session"
              data-delete-device="${escapeHtml(s.token)}"
            >🗑️</button>
          </div>
        </div>
      `;
    })
    .join('');
}

async function refreshAdminSessions() {
  if (userLevel < 1) return;

  const [loginRes, deviceRes] = await Promise.all([
    userFetch('/api/admin/sessions', { method: 'GET' }, true),
    userFetch('/api/admin/device-sessions', { method: 'GET' }, true)
  ]);

  if (loginSessionsList) {
    if (loginRes.status === 200 && Array.isArray(loginRes.data.sessions)) {
      renderLoginSessions(loginRes.data.sessions);
    } else {
      loginSessionsList.innerHTML = `<div class="empty-note">Gagal memuat login sessions (${loginRes.status || 'err'})</div>`;
    }
  }

  if (deviceSessionsList) {
    if (deviceRes.status === 200 && Array.isArray(deviceRes.data.sessions)) {
      renderDeviceSessions(deviceRes.data.sessions);
    } else {
      deviceSessionsList.innerHTML = `<div class="empty-note">Gagal memuat device sessions (${deviceRes.status || 'err'})</div>`;
    }
  }
}

// --- Node Status Polling & Open Request ---

async function pollNodeStatusOnce() {
  const lockerName = encodeURIComponent(lockerNameInput ? lockerNameInput.value.trim() : '');
  const result = await userFetch(`/api/device/status?lockerName=${lockerName}`, { method: 'GET' }, true);
  setNodeStatusRaw({
    action: 'GET /api/device/status',
    httpStatus: result.status,
    response: result.data
  });
}

function startPolling() {
  if (!getActiveToken()) {
    setNodeStatusRaw({ error: 'Login dulu sebelum mulai polling status node.' });
    return;
  }

  const sec = Math.max(1, Number(pollIntervalInput ? pollIntervalInput.value : 4) || 4);
  stopPolling();
  isPolling = true;
  if (togglePollBtn) togglePollBtn.textContent = 'Stop Polling';
  if (pollBadge) {
    pollBadge.textContent = `Poll: ${sec}s`;
    pollBadge.className = 'badge active';
  }

  pollNodeStatusOnce();
  pollTimerId = setInterval(() => {
    if (!getActiveToken() || !isPolling) {
      stopPolling();
      return;
    }
    pollNodeStatusOnce();
  }, sec * 1000);
}

async function setShouldOpen(shouldOpen) {
  const lockerName = lockerNameInput ? lockerNameInput.value.trim() : '';
  const result = await callAndShowMainJson(
    '/api/locker/open-request',
    {
      method: 'POST',
      body: JSON.stringify({ lockerName, shouldOpen })
    },
    true
  );
  if (result.status === 200) {
    pollNodeStatusOnce();
  }
}

function bindEvents() {
  if (tokenInput) {
    tokenInput.addEventListener('input', () => {
      const edited = getActiveToken();
      if (!edited) {
        clearSession('No Token', false, false);
        return;
      }
      if (!expiresAtMs) {
        expiresAtMs = Date.now() + DEFAULT_IDLE_SECONDS * 1000;
      }
      if (edited !== token && sessionBadge) {
        sessionBadge.textContent = 'Edited (Cek Ping)';
        sessionBadge.className = 'badge';
      }
      updateCountdownUI();
    });
  }

  if (equippedSessionInput) {
    equippedSessionInput.addEventListener('input', () => {
      equipDeviceSession(equippedSessionInput.value, false);
    });
  }

  equippedDeviceList?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-equip-token]');
    if (!item) return;
    equipDeviceSession(item.getAttribute('data-equip-token'), true);
  });

  el('optInAddBtn')?.addEventListener('click', handleDeviceOptIn);
  el('sendHeartbeatBtn')?.addEventListener('click', handleSendHeartbeat);

  el('loginBtn')?.addEventListener('click', async () => {
    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    const result = await callAndShowMainJson(
      '/api/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password })
      },
      false
    );

    if (result.status === 200 && result.data?.token) {
      token = result.data.token;
      if (tokenInput) tokenInput.value = token;
      const lvl = Number(result.data.user?.level ?? 0);
      setAdminVisibility(lvl);

      const ttl =
        typeof result.data.expiresInSeconds === 'number'
          ? result.data.expiresInSeconds
          : DEFAULT_IDLE_SECONDS;
      resetSessionTimer(ttl);

      if (lvl >= 1) {
        refreshAdminSessions();
      }
    }
  });

  el('logoutBtn')?.addEventListener('click', async () => {
    if (!getActiveToken()) {
      clearSession('No Token');
      return;
    }
    const result = await callAndShowMainJson('/api/logout', { method: 'POST', body: '{}' }, true);
    if (result.status === 200 || result.status === 401) {
      clearSession('Logged Out');
    }
  });

  el('pingBtn')?.addEventListener('click', async () => {
    const result = await callAndShowMainJson('/api/ping', { method: 'POST', body: '{}' }, true);
    if (result.status === 200 && userLevel >= 1) {
      refreshAdminSessions();
    }
  });

  el('copyBtn')?.addEventListener('click', async () => {
    const current = getActiveToken();
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current);
      if (sessionBadge) {
        sessionBadge.textContent = 'Token Copied';
        setTimeout(() => {
          if (getActiveToken() && sessionBadge) {
            sessionBadge.textContent = current === token ? 'Token Aktif' : 'Edited (Cek Ping)';
            sessionBadge.className = 'badge active';
          }
        }, 1200);
      }
    } catch {
      setRawOutput(null, { info: 'Salin manual dari kotak token di atas.' });
    }
  });

  el('refreshSessionsBtn')?.addEventListener('click', refreshAdminSessions);

  loginSessionsList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete-login]');
    if (!btn) return;
    const targetToken = btn.getAttribute('data-delete-login');
    const result = await callAndShowMainJson(
      `/api/admin/sessions/${encodeURIComponent(targetToken)}`,
      { method: 'DELETE' },
      true
    );
    if (result.status === 200) {
      if (targetToken === getActiveToken()) {
        clearSession('Deleted by Admin', true, false);
      }
      refreshAdminSessions();
    }
  });

  deviceSessionsList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete-device]');
    if (!btn) return;
    const targetToken = btn.getAttribute('data-delete-device');
    const result = await callAndShowMainJson(
      `/api/admin/device-sessions/${encodeURIComponent(targetToken)}`,
      { method: 'DELETE' },
      true
    );
    if (result.status === 200) {
      localDeviceSessions = localDeviceSessions.filter((s) => s.token !== targetToken);
      if (targetToken === getEquippedDeviceToken()) {
        equipDeviceSession('', false);
      }
      renderEquippedDeviceSessions();
      refreshAdminSessions();
    }
  });

  el('openNodeBtn')?.addEventListener('click', () => setShouldOpen(true));
  el('closeNodeBtn')?.addEventListener('click', () => setShouldOpen(false));

  togglePollBtn?.addEventListener('click', () => {
    if (isPolling) {
      stopPolling();
    } else {
      startPolling();
    }
  });

  el('pollOnceBtn')?.addEventListener('click', pollNodeStatusOnce);

  el('getHomeBtn')?.addEventListener('click', () =>
    callAndShowMainJson('/api/home', { method: 'GET' }, true)
  );
  el('getPackagesBtn')?.addEventListener('click', () =>
    callAndShowMainJson('/api/packages', { method: 'GET' }, true)
  );
  el('getHistoryBtn')?.addEventListener('click', () =>
    callAndShowMainJson('/api/history', { method: 'GET' }, true)
  );
  el('getHealthBtn')?.addEventListener('click', () =>
    callAndShowMainJson('/health', { method: 'GET' }, false)
  );
}

function initController() {
  try {
    detectBaseUrl();
    bindEvents();
    renderEquippedDeviceSessions();
    if (countdownTimerId !== null) clearInterval(countdownTimerId);
    countdownTimerId = setInterval(updateCountdownUI, 1000);
  } catch (err) {
    if (envBadge) envBadge.textContent = 'Init Error';
    setRawOutput(null, { error: 'Gagal inisialisasi controller.js', detail: err.message });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initController);
} else {
  initController();
}