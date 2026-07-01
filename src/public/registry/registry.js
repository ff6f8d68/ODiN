const API_BASE = '';

async function api(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await res.json();
  if (!res.ok && !data.error) {
    throw new Error(data.error || 'Request failed');
  }
  return { data, ok: res.ok };
}

function showError(msg) {
  alert(msg);
}

function $(id) { return document.getElementById(id); }

// Auth state
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await api('/api/auth/me');
  if (auth.data.authenticated) {
    currentUser = auth.data.username;
    showDashboard();
  } else {
    showAuth();
  }
});

// Auth tabs
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    if (target === 'login') {
      $('login-form').classList.remove('hidden');
      $('register-form').classList.add('hidden');
    } else {
      $('login-form').classList.add('hidden');
      $('register-form').classList.remove('hidden');
    }
  });
});

// Register
$('register-btn').addEventListener('click', async () => {
  const username = $('reg-username').value.trim();
  const password = $('reg-password').value;

  if (!username || !password) return showError('Fill in all fields');
  if (username.length < 3) return showError('Username must be at least 3 characters');
  if (password.length < 6) return showError('Password must be at least 6 characters');

  const { data, ok } = await api('/api/auth/register', { method: 'POST', body: { username, password } });
  if (!ok) return showError(data.error);

  currentUser = data.username;
  showDashboard();
});

// Login
$('login-btn').addEventListener('click', async () => {
  const username = $('login-username').value.trim();
  const password = $('login-password').value;

  if (!username || !password) return showError('Fill in all fields');

  const { data, ok } = await api('/api/auth/login', { method: 'POST', body: { username, password } });
  if (!ok) return showError(data.error);

  currentUser = data.username;
  showDashboard();
});

// Logout
$('logout-btn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  showAuth();
});

function showAuth() {
  $('auth-section').classList.remove('hidden');
  $('dashboard').classList.add('hidden');
  $('user-display').classList.add('hidden');
  $('logout-btn').classList.add('hidden');
}

function showDashboard() {
  $('auth-section').classList.add('hidden');
  $('dashboard').classList.remove('hidden');
  $('user-display').classList.remove('hidden');
  $('logout-btn').classList.remove('hidden');
  $('user-display').innerHTML = `<i class="fa-solid fa-user"></i> ${currentUser}`;

  loadTlds();
  loadMyDomains();
}

// TLD Management
async function loadTlds() {
  const { data } = await api('/api/tlds');
  const list = $('tld-list');
  list.innerHTML = '';

  data.forEach(tld => {
    const pill = document.createElement('div');
    pill.className = 'tld-pill';
    pill.innerHTML = `
      <span class="tld-name">.${tld.name}</span>
      <span class="tld-owner">by ${tld.owner}</span>
      ${tld.owner === currentUser ? `<button data-tld="${tld.name}"><i class="fa-solid fa-trash"></i></button>` : ''}
    `;
    list.appendChild(pill);
  });

  list.querySelectorAll('button[data-tld]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tld = btn.dataset.tld;
      if (!confirm(`Delete TLD .${tld}? This may affect registered domains.`)) return;
      const { ok, data } = await api(`/api/tlds/${tld}`, { method: 'DELETE' });
      if (!ok) return showError(data.error);
      loadTlds();
      loadMyDomains();
    });
  });

  // Update TLD select in register form
  const select = $('reg-tld');
  select.innerHTML = '<option value="">Select TLD</option>';
  data.forEach(tld => {
    const opt = document.createElement('option');
    opt.value = tld.name;
    opt.textContent = `.${tld.name}`;
    select.appendChild(opt);
  });
}

$('add-tld-btn').addEventListener('click', async () => {
  const name = $('tld-input').value.trim().toLowerCase().replace(/^\./, '');
  if (!name) return showError('Enter a TLD name');

  const { data, ok } = await api('/api/tlds', { method: 'POST', body: { name } });
  if (!ok) return showError(data.error);

  $('tld-input').value = '';
  loadTlds();
});

// Domain Registration
document.querySelectorAll('.radio-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.radio-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    const val = card.dataset.value;
    $('dns-type').value = val;

    if (val === 'custom') {
      $('custom-ip-group').classList.remove('hidden');
      $('custom-content-group').classList.add('hidden');
    } else {
      $('custom-ip-group').classList.add('hidden');
      $('custom-content-group').classList.remove('hidden');
    }
  });
});

$('register-domain-btn').addEventListener('click', async () => {
  const namePart = $('reg-domain').value.trim().toLowerCase();
  const tldPart = $('reg-tld').value;
  const dnsType = $('dns-type').value;
  const ip = $('custom-ip').value.trim();
  const customContent = $('custom-content').value;

  if (!namePart || !tldPart) return showError('Enter domain name and select TLD');

  const domain = `${namePart}.${tldPart}`;
  const payload = {
    domain,
    dnsType,
    ip: dnsType === 'custom' ? ip : '127.0.0.1',
    customContent: dnsType === 'local' ? customContent : ''
  };

  const { data, ok } = await api('/api/domains', { method: 'POST', body: payload });
  if (!ok) return showError(data.error);

  $('reg-domain').value = '';
  $('custom-ip').value = '';
  $('custom-content').value = '';
  loadMyDomains();
});

// My Domains
async function loadMyDomains() {
  const { data } = await api('/api/domains/me');
  const list = $('domains-list');
  const empty = $('empty-domains');
  list.innerHTML = '';

  if (data.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  // Update records domain select
  const select = $('records-domain-select');
  select.innerHTML = '<option value="">Select a domain...</option>';
  data.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.domain;
    opt.textContent = d.domain;
    select.appendChild(opt);
  });

  data.forEach(record => {
    const tr = document.createElement('tr');
    const dateStr = record.created ? new Date(record.created).toLocaleDateString() : 'N/A';

    tr.innerHTML = `
      <td class="domain-cell">${record.domain}</td>
      <td>
        <span class="badge ${record.dnsType === 'local' ? 'badge-local' : 'badge-custom'}">
          ${record.dnsType === 'local' ? '<i class="fa-solid fa-server"></i> Local' : '<i class="fa-solid fa-route"></i> Custom'}
        </span>
      </td>
      <td>${(record.records || []).length} record(s)</td>
      <td>${dateStr}</td>
      <td>
        <button class="btn-danger delete-domain-btn" data-domain="${record.domain}">
          <i class="fa-solid fa-trash"></i> Delete
        </button>
      </td>
    `;
    list.appendChild(tr);
  });

  list.querySelectorAll('.delete-domain-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.domain;
      if (!confirm(`Delete ${domain}?`)) return;
      const { ok, data } = await api(`/api/domains/${encodeURIComponent(domain)}`, { method: 'DELETE' });
      if (!ok) return showError(data.error);
      loadMyDomains();
    });
  });
}

// DNS Records
$('records-domain-select').addEventListener('change', async () => {
  const domain = $('records-domain-select').value;
  if (!domain) {
    $('records-panel').classList.add('hidden');
    return;
  }
  $('records-panel').classList.remove('hidden');
  loadRecords(domain);
});

async function loadRecords(domain) {
  const { data } = await api(`/api/domains/${encodeURIComponent(domain)}/records`);
  const list = $('records-list');
  list.innerHTML = '';

  if (data.length === 0) {
    list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">No DNS records configured</p>';
    return;
  }

  data.forEach(r => {
    const row = document.createElement('div');
    row.className = 'record-row';
    row.innerHTML = `
      <div class="record-info">
        <span class="record-type">${r.type}</span>
        <span class="record-value">${r.value}</span>
        <span class="record-ttl">TTL: ${r.ttl}s</span>
      </div>
      <button class="delete-record-btn" data-type="${r.type}" data-value="${encodeURIComponent(r.value)}">
        <i class="fa-solid fa-trash"></i>
      </button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll('.delete-record-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      const value = decodeURIComponent(btn.dataset.value);
      const { ok, data } = await api(`/api/domains/${encodeURIComponent(domain)}/records/${encodeURIComponent(type)}/${encodeURIComponent(value)}`, { method: 'DELETE' });
      if (!ok) return showError(data.error);
      loadRecords(domain);
    });
  });
}

$('add-record-btn').addEventListener('click', async () => {
  const domain = $('records-domain-select').value;
  if (!domain) return showError('Select a domain first');

  const type = $('record-type').value;
  const value = $('record-value').value.trim();
  const ttl = parseInt($('record-ttl').value) || 300;

  if (!value) return showError('Enter a record value');

  const { data, ok } = await api(`/api/domains/${encodeURIComponent(domain)}/records`, {
    method: 'POST',
    body: { type, value, ttl }
  });

  if (!ok) return showError(data.error);
  loadRecords(domain);
});
