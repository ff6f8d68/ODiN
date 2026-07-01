const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'domains.json');

const SALT = 'odin_salt_2026';

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + SALT).digest('hex');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

function initDb() {
  if (!fs.existsSync(DB_PATH)) {
    return createInitialDb();
  }

  const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  let changed = false;

  if (!data.users) {
    data.users = { admin: { password: hashPassword('admin'), created: new Date().toISOString() } };
    changed = true;
  }
  if (!data.tlds) {
    data.tlds = { odin: { name: 'odin', owner: 'admin', created: new Date().toISOString() } };
    changed = true;
  }

  for (const [key, val] of Object.entries(data)) {
    if (key === 'users' || key === 'tlds') continue;
    if (typeof val === 'object' && val.domain) {
      if (!val.owner) { val.owner = 'admin'; changed = true; }
      if (!val.records) {
        val.records = val.dnsType === 'custom'
          ? [{ type: 'A', value: val.ip || '127.0.0.1', ttl: 300 }]
          : [{ type: 'A', value: '127.0.0.1', ttl: 300 }];
        changed = true;
      }
    }
  }

  if (changed) fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function createInitialDb() {
  const data = {
    users: { admin: { password: hashPassword('admin'), created: new Date().toISOString() } },
    tlds: { odin: { name: 'odin', owner: 'admin', created: new Date().toISOString() } },
    'registry.odin': {
      domain: 'registry.odin', dnsType: 'local', ip: '127.0.0.1',
      customContent: 'System Registry Server', owner: 'admin',
      created: new Date().toISOString(), records: [{ type: 'A', value: '127.0.0.1', ttl: 300 }]
    }
  };
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getData() {
  initDb();
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch (err) { console.error('Error reading database:', err); return { users: {}, tlds: {} }; }
}

function saveData(data) {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); return true; }
  catch (err) { console.error('Error writing database:', err); return false; }
}

const db = {
  hashPassword, verifyPassword,
  getUsers: () => getData().users || {},
  getUser: (u) => getData().users?.[u],
  createUser: (u, p) => { const d = getData(); if (!d.users) d.users = {}; if (d.users[u]) return false; d.users[u] = { password: hashPassword(p), created: new Date().toISOString() }; return saveData(d); },
  verifyUser: (u, p) => { const user = db.getUser(u); return user ? verifyPassword(p, user.password) : false; },
  getTlds: () => getData().tlds || {},
  getTld: (t) => getData().tlds?.[t],
  createTld: (t, o) => { const d = getData(); if (!d.tlds) d.tlds = {}; if (d.tlds[t]) return false; d.tlds[t] = { name: t, owner: o, created: new Date().toISOString() }; return saveData(d); },
  deleteTld: (t) => { const d = getData(); if (!d.tlds?.[t]) return false; delete d.tlds[t]; return saveData(d); },
  getDomains: () => { const d = getData(); const r = {}; for (const [k, v] of Object.entries(d)) { if (k === 'users' || k === 'tlds') continue; if (typeof v === 'object' && v.domain) r[k] = v; } return r; },
  getDomain: (d) => getData()[d.toLowerCase().replace(/\.$/, '')],
  registerDomain: (d, opts) => { const data = getData(); const c = d.toLowerCase().replace(/\.$/, ''); if (data[c]) return false; data[c] = { domain: c, dnsType: opts.dnsType || 'local', ip: opts.ip || '127.0.0.1', customContent: opts.customContent || '', owner: opts.owner || 'admin', created: new Date().toISOString(), records: opts.records || (opts.dnsType === 'custom' ? [{ type: 'A', value: opts.ip || '127.0.0.1', ttl: 300 }] : [{ type: 'A', value: '127.0.0.1', ttl: 300 }]) }; return saveData(data); },
  deleteDomain: (d) => { const data = getData(); const c = d.toLowerCase().replace(/\.$/, ''); if (!data[c]) return false; delete data[c]; return saveData(data); },
  addRecord: (d, t, v, ttl = 300) => { const data = getData(); const c = d.toLowerCase().replace(/\.$/, ''); const r = data[c]; if (!r) return false; if (!r.records) r.records = []; r.records = r.records.filter(x => !(x.type === t && x.value === v)); r.records.push({ type: t, value: v, ttl }); return saveData(data); },
  deleteRecord: (d, t, v) => { const data = getData(); const c = d.toLowerCase().replace(/\.$/, ''); const r = data[c]; if (!r || !r.records) return false; r.records = r.records.filter(x => !(x.type === t && x.value === v)); return saveData(data); },
  getRecords: (d) => { const r = db.getDomain(d); return r ? (r.records || []) : []; }
};

module.exports = db;
