// Meridian Agent Diagnostics — vanilla JS, no framework
// Served only on 127.0.0.1 loopback — local diagnostic UI
// Auto-refreshes status every 30 seconds

let rawCollectedData = null;

async function fetchJson(url, options) {
  const resp = await fetch(url, options);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return resp.json();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || '';
}

function createConfigItem(label, value) {
  const div = document.createElement('div');
  div.className = 'config-item';
  const labelEl = document.createElement('div');
  labelEl.className = 'config-label';
  labelEl.textContent = label;
  const valueEl = document.createElement('div');
  valueEl.className = 'config-value';
  valueEl.textContent = value;
  div.appendChild(labelEl);
  div.appendChild(valueEl);
  return div;
}

// ---- Status ----
async function loadStatus() {
  try {
    const data = await fetchJson('/api/status');

    setText('version-badge', 'v' + data.agentVersion);

    const enrolledEl = document.getElementById('status-enrolled');
    const enrollInd = document.getElementById('indicator-enrolled');
    if (data.enrolled) {
      enrolledEl.textContent = 'Enrolled';
      enrollInd.className = 'indicator connected';
    } else {
      enrolledEl.textContent = 'Not enrolled — set EnrollmentToken to register';
      enrollInd.className = 'indicator warning';
    }

    const connectedEl = document.getElementById('status-connected');
    const connInd = document.getElementById('indicator-connected');
    if (data.connected) {
      connectedEl.textContent = 'Connected to server (' + data.latencyMs + 'ms)';
      connInd.className = 'indicator connected';
    } else {
      connectedEl.textContent = 'Cannot reach server';
      connInd.className = 'indicator error';
    }

    setText('status-server-url', 'Server: ' + data.serverUrl);
    setText('status-privacy-tier', 'Privacy: ' + data.privacyTier);
    setText('status-platform', 'Platform: ' + data.platform);
  } catch (err) {
    setText('status-connected', 'Error loading status: ' + err.message);
    const connInd = document.getElementById('indicator-connected');
    if (connInd) connInd.className = 'indicator error';
  }
}

// ---- Hardware ----
async function loadHardware() {
  const loadingEl = document.getElementById('hardware-loading');
  const tableEl = document.getElementById('hardware-table');
  const tbody = document.getElementById('hardware-tbody');

  try {
    const hw = await fetchJson('/api/hardware');
    loadingEl.style.display = 'none';
    tbody.textContent = '';

    const cpuText = hw.cpus ? hw.cpus.map(function(c) {
      return c.name + ' (' + c.cores + 'c/' + c.threads + 't)';
    }).join(', ') : 'Unknown';

    const diskText = hw.disks ? hw.disks.map(function(d) {
      return d.deviceName + ': ' + formatBytes(d.sizeBytes) + ' ' + d.type;
    }).join(', ') : 'Unknown';

    const rows = [
      ['Manufacturer', hw.manufacturer || 'Unknown'],
      ['Model', hw.model || 'Unknown'],
      ['Serial Number', hw.serialNumber || '(hidden by privacy tier)'],
      ['Total Memory', hw.totalMemoryBytes ? formatBytes(hw.totalMemoryBytes) : 'Unknown'],
      ['CPUs', cpuText],
      ['Disks', diskText],
    ];

    for (const [label, value] of rows) {
      const tr = document.createElement('tr');
      const th = document.createElement('td');
      th.style.fontWeight = '500';
      th.style.width = '160px';
      th.textContent = label;
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(th);
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    tableEl.style.display = 'table';
  } catch (err) {
    if (loadingEl) loadingEl.textContent = 'Error loading hardware: ' + err.message;
  }
}

// ---- Queue ----
async function loadQueue() {
  try {
    const data = await fetchJson('/api/queue');
    const infoEl = document.getElementById('queue-info');
    const itemsContainer = document.getElementById('queue-items-container');

    if (infoEl) {
      infoEl.textContent = '';
      const detail = document.createElement('div');
      detail.className = 'status-detail';
      const itemSpan = document.createElement('span');
      itemSpan.textContent = 'Items: ' + data.count;
      const sizeSpan = document.createElement('span');
      sizeSpan.textContent = 'Size: ' + formatBytes(data.sizeBytes);
      detail.appendChild(itemSpan);
      detail.appendChild(sizeSpan);
      infoEl.appendChild(detail);
    }

    if (data.items && data.items.length > 0) {
      if (itemsContainer) itemsContainer.style.display = 'block';
      const tbody = document.getElementById('queue-tbody');
      if (tbody) {
        tbody.textContent = '';
        for (const item of data.items) {
          const tr = document.createElement('tr');
          ['id', 'type', 'createdAt', 'retryCount'].forEach(function(key) {
            const td = document.createElement('td');
            td.textContent = item[key] !== undefined ? String(item[key]) : '';
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        }
      }
    } else {
      if (itemsContainer) itemsContainer.style.display = 'none';
    }
  } catch (err) {
    setText('queue-info', 'Error: ' + err.message);
  }
}

// ---- Config ----
async function loadConfig() {
  try {
    const cfg = await fetchJson('/api/config');
    const container = document.getElementById('config-display');
    if (!container) return;

    container.textContent = '';
    const grid = document.createElement('div');
    grid.className = 'config-grid';

    const items = [
      ['Server URL', cfg.serverUrl],
      ['Privacy Tier', cfg.privacyTier],
      ['Heartbeat Interval', cfg.heartbeatIntervalSeconds + 's (' + (cfg.heartbeatIntervalSeconds / 60) + 'min)'],
      ['Inventory Interval', cfg.inventoryIntervalSeconds + 's (' + (cfg.inventoryIntervalSeconds / 3600) + 'hr)'],
      ['Local UI Port', String(cfg.localWebUiPort)],
      ['Queue Max Size', cfg.localQueueMaxSizeMb + ' MB'],
      ['Log Level', cfg.logLevel],
      ['Enrolled', cfg.enrolled ? 'Yes' : 'No'],
      ['HTTP Proxy', cfg.hasProxy ? 'Configured' : 'None'],
    ];

    for (const [label, value] of items) {
      grid.appendChild(createConfigItem(label, value));
    }
    container.appendChild(grid);
  } catch (err) {
    setText('config-display', 'Error loading config: ' + err.message);
  }
}

// ---- Logs ----
async function loadLogs() {
  try {
    const data = await fetchJson('/api/logs');
    const logEl = document.getElementById('log-content');
    const pathEl = document.getElementById('log-path');

    if (pathEl && data.path) pathEl.textContent = 'Log file: ' + data.path;
    if (logEl) {
      logEl.textContent = (data.lines && data.lines.length > 0)
        ? data.lines.join('\n')
        : '(no log entries)';
    }

    // Scroll to bottom
    const viewer = document.getElementById('log-viewer');
    if (viewer) viewer.scrollTop = viewer.scrollHeight;
  } catch (err) {
    setText('log-content', 'Error loading logs: ' + err.message);
  }
}

// ---- Network Test button ----
document.getElementById('btn-network-test').addEventListener('click', async function() {
  const resultEl = document.getElementById('network-test-result');
  if (resultEl) resultEl.textContent = 'Testing...';
  try {
    const data = await fetchJson('/api/network-test', { method: 'POST' });
    if (resultEl) {
      if (data.connected) {
        resultEl.className = 'result-ok';
        resultEl.textContent = 'Connected — ' + data.latencyMs + 'ms';
      } else {
        resultEl.className = 'result-error';
        resultEl.textContent = 'Unreachable';
      }
    }
  } catch (err) {
    if (resultEl) {
      resultEl.className = 'result-error';
      resultEl.textContent = 'Error: ' + err.message;
    }
  }
});

// ---- Collect Now button ----
document.getElementById('btn-collect').addEventListener('click', async function() {
  const resultEl = document.getElementById('collect-result');
  if (resultEl) resultEl.textContent = 'Collecting...';
  try {
    const data = await fetchJson('/api/collect', { method: 'POST' });
    rawCollectedData = data;
    if (resultEl) {
      resultEl.className = 'result-ok';
      resultEl.textContent = 'Done — ' + data.softwareCount + ' software entries';
    }
    await loadHardware();
    await loadQueue();
  } catch (err) {
    if (resultEl) {
      resultEl.className = 'result-error';
      resultEl.textContent = 'Error: ' + err.message;
    }
  }
});

// ---- Toggle Raw JSON ----
document.getElementById('btn-toggle-raw').addEventListener('click', async function() {
  const rawEl = document.getElementById('raw-json');
  if (!rawEl) return;
  if (rawEl.style.display === 'none') {
    if (!rawCollectedData) {
      try {
        rawCollectedData = await fetchJson('/api/hardware');
      } catch (err) {
        rawCollectedData = { error: err.message };
      }
    }
    rawEl.textContent = JSON.stringify(rawCollectedData, null, 2);
    rawEl.style.display = 'block';
    document.getElementById('btn-toggle-raw').textContent = 'Hide Raw JSON';
  } else {
    rawEl.style.display = 'none';
    document.getElementById('btn-toggle-raw').textContent = 'Show Raw JSON';
  }
});

// ---- Helpers ----
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

// ---- Initial load ----
async function loadAll() {
  await Promise.allSettled([loadStatus(), loadHardware(), loadQueue(), loadConfig(), loadLogs()]);
}

loadAll();

// Auto-refresh status every 30 seconds
setInterval(function() {
  loadStatus();
  loadQueue();
}, 30000);
