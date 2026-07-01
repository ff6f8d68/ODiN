const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'domains.json');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'odin_salt_2026').digest('hex');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

function initDb() {
  if (!fs.existsSync(DB_PATH)) {
    const initialData = {
      users: {
        'admin': {
          password: hashPassword('admin'),
          created: new Date().toISOString()
        }
      },
      tlds: {
        'odin': {
          name: 'odin',
          owner: 'admin',
          created: new Date().toISOString()
        }
      },
      'registry.odin': {
        domain: 'registry.odin',
        dnsType: 'local',
        ip: '127.0.0.1',
        customContent: 'System Registry Server',
        owner: 'admin',
        created: new Date().toISOString(),
        records: [
          { type: 'A', value: '127.0.0.1', ttl: 300 }
        ]
      }
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
    return;
  }

  const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  let changed = false;

  if (!data.users) {
    data.users = { 'admin': { password: hashPassword('admin'), created: new Date().toISOString() } };
    changed = true;
  }
  if (!data.tlds) {
    data.tlds = { 'odin': { name: 'odin', owner: 'admin', created: new Date().toISOString() } };
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

  if (changed) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  }
}

function getData() {
  initDb();
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (err) {
    console.error('Error reading database:', err);
    return { users: {}, tlds: {} };
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Error writing database:', err);
    return false;
  }
}

function getUsers() { return getData().users || {}; }
function getUser(username) { return getData().users?.[username]; }

function createUser(username, password) {
  const data = getData();
  if (!data.users) data.users = {};
  if (data.users[username]) return false;
  data.users[username] = { password: hashPassword(password), created: new Date().toISOString() };
  return saveData(data);
}

function verifyUser(username, password) {
  const user = getUser(username);
  if (!user) return false;
  return verifyPassword(password, user.password);
}

function getTlds() { return getData().tlds || {}; }
function getTld(name) { return getData().tlds?.[name]; }

function createTld(name, owner) {
  const data = getData();
  if (!data.tlds) data.tlds = {};
  if (data.tlds[name]) return false;
  data.tlds[name] = { name, owner, created: new Date().toISOString() };
  return saveData(data);
}

function deleteTld(name) {
  const data = getData();
  if (!data.tlds?.[name]) return false;
  delete data.tlds[name];
  return saveData(data);
}

function getDomains() {
  const data = getData();
  const result = {};
  for (const [key, val] of Object.entries(data)) {
    if (key === 'users' || key === 'tlds') continue;
    if (typeof val === 'object' && val.domain) result[key] = val;
  }
  return result;
}

function getDomain(domain) {
  return getData()[domain.toLowerCase().replace(/\.$/, '')];
}

function registerDomain(domain, options = {}) {
  const data = getData();
  const cleanDomain = domain.toLowerCase().replace(/\.$/, '');
  if (data[cleanDomain]) return false;

  const record = {
    domain: cleanDomain,
    dnsType: options.dnsType || 'local',
    ip: options.ip || '127.0.0.1',
    customContent: options.customContent || '',
    owner: options.owner || 'admin',
    created: new Date().toISOString(),
    records: options.records || (options.dnsType === 'custom' ? [{ type: 'A', value: options.ip || '127.0.0.1', ttl: 300 }] : [{ type: 'A', value: '127.0.0.1', ttl: 300 }])
  };

  data[cleanDomain] = record;
  return saveData(data);
}

function deleteDomain(domain) {
  const data = getData();
  const cleanDomain = domain.toLowerCase().replace(/\.$/, '');
  if (!data[cleanDomain]) return false;
  delete data[cleanDomain];
  return saveData(data);
}

function addRecord(domain, type, value, ttl = 300) {
  const data = getData();
  const cleanDomain = domain.toLowerCase().replace(/\.$/, '');
  const record = data[cleanDomain];
  if (!record) return false;
  if (!record.records) record.records = [];
  record.records = record.records.filter(r => !(r.type === type && r.value === value));
  record.records.push({ type, value, ttl });
  return saveData(data);
}

function deleteRecord(domain, type, value) {
  const data = getData();
  const cleanDomain = domain.toLowerCase().replace(/\.$/, '');
  const record = data[cleanDomain];
  if (!record || !record.records) return false;
  record.records = record.records.filter(r => !(r.type === type && r.value === value));
  return saveData(data);
}

function getRecords(domain) {
  const record = getDomain(domain);
  if (!record) return [];
  return record.records || [];
}

module.exports = {
  initDb,
  hashPassword,
  verifyPassword,
  getUsers,
  getUser,
  createUser,
  verifyUser,
  getTlds,
  getTld,
  createTld,
  deleteTld,
  getDomains,
  getDomain,
  registerDomain,
  deleteDomain,
  addRecord,
  deleteRecord,
  getRecords
};
