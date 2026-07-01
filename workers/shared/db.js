const DB_KEY = 'odin:data';
const SALT = 'odin_salt_2026';

async function hashPassword(password) {
  const data = new TextEncoder().encode(password + SALT);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyPassword(password, hash) {
  return (await hashPassword(password)) === hash;
}

function createInitialDb() {
  const now = new Date().toISOString();
  return {
    users: { admin: { password: null, created: now } },
    tlds: { odin: { name: 'odin', owner: 'admin', created: now } },
    'registry.odin': {
      domain: 'registry.odin',
      dnsType: 'local',
      ip: '127.0.0.1',
      customContent: 'System Registry Server',
      owner: 'admin',
      created: now,
      records: [{ type: 'A', value: '127.0.0.1', ttl: 300 }],
    },
  };
}

async function initDb(kv) {
  let data = await kv.get(DB_KEY, 'json');
  if (!data) {
    data = createInitialDb();
    data.users.admin.password = await hashPassword('admin');
    await kv.put(DB_KEY, JSON.stringify(data));
    return data;
  }

  let changed = false;
  if (!data.users) {
    data.users = { admin: { password: await hashPassword('admin'), created: new Date().toISOString() } };
    changed = true;
  }
  if (!data.tlds) {
    data.tlds = { odin: { name: 'odin', owner: 'admin', created: new Date().toISOString() } };
    changed = true;
  }

  for (const [key, val] of Object.entries(data)) {
    if (key === 'users' || key === 'tlds') continue;
    if (typeof val === 'object' && val.domain) {
      if (!val.owner) {
        val.owner = 'admin';
        changed = true;
      }
      if (!val.records) {
        val.records =
          val.dnsType === 'custom'
            ? [{ type: 'A', value: val.ip || '127.0.0.1', ttl: 300 }]
            : [{ type: 'A', value: '127.0.0.1', ttl: 300 }];
        changed = true;
      }
    }
  }

  if (changed) await kv.put(DB_KEY, JSON.stringify(data));
  return data;
}

export function createDb(kv) {
  async function getData() {
    return initDb(kv);
  }

  async function saveData(data) {
    await kv.put(DB_KEY, JSON.stringify(data));
    return true;
  }

  return {
    hashPassword,
    verifyPassword,
    getUsers: async () => (await getData()).users || {},
    getUser: async (u) => (await getData()).users?.[u],
    createUser: async (u, p) => {
      const d = await getData();
      if (!d.users) d.users = {};
      if (d.users[u]) return false;
      d.users[u] = { password: await hashPassword(p), created: new Date().toISOString() };
      return saveData(d);
    },
    verifyUser: async (u, p) => {
      const user = (await getData()).users?.[u];
      return user ? verifyPassword(p, user.password) : false;
    },
    getTlds: async () => (await getData()).tlds || {},
    getTld: async (t) => (await getData()).tlds?.[t],
    createTld: async (t, o) => {
      const d = await getData();
      if (!d.tlds) d.tlds = {};
      if (d.tlds[t]) return false;
      d.tlds[t] = { name: t, owner: o, created: new Date().toISOString() };
      return saveData(d);
    },
    deleteTld: async (t) => {
      const d = await getData();
      if (!d.tlds?.[t]) return false;
      delete d.tlds[t];
      return saveData(d);
    },
    getDomains: async () => {
      const d = await getData();
      const r = {};
      for (const [k, v] of Object.entries(d)) {
        if (k === 'users' || k === 'tlds') continue;
        if (typeof v === 'object' && v.domain) r[k] = v;
      }
      return r;
    },
    getDomain: async (domain) => (await getData())[domain.toLowerCase().replace(/\.$/, '')],
    registerDomain: async (domain, opts) => {
      const data = await getData();
      const c = domain.toLowerCase().replace(/\.$/, '');
      if (data[c]) return false;
      data[c] = {
        domain: c,
        dnsType: opts.dnsType || 'local',
        ip: opts.ip || '127.0.0.1',
        customContent: opts.customContent || '',
        owner: opts.owner || 'admin',
        created: new Date().toISOString(),
        records:
          opts.records ||
          (opts.dnsType === 'custom'
            ? [{ type: 'A', value: opts.ip || '127.0.0.1', ttl: 300 }]
            : [{ type: 'A', value: '127.0.0.1', ttl: 300 }]),
      };
      return saveData(data);
    },
    deleteDomain: async (domain) => {
      const data = await getData();
      const c = domain.toLowerCase().replace(/\.$/, '');
      if (!data[c]) return false;
      delete data[c];
      return saveData(data);
    },
    addRecord: async (domain, type, value, ttl = 300) => {
      const data = await getData();
      const c = domain.toLowerCase().replace(/\.$/, '');
      const r = data[c];
      if (!r) return false;
      if (!r.records) r.records = [];
      r.records = r.records.filter((x) => !(x.type === type && x.value === value));
      r.records.push({ type, value, ttl });
      return saveData(data);
    },
    deleteRecord: async (domain, type, value) => {
      const data = await getData();
      const c = domain.toLowerCase().replace(/\.$/, '');
      const r = data[c];
      if (!r || !r.records) return false;
      r.records = r.records.filter((x) => !(x.type === type && x.value === value));
      return saveData(data);
    },
  };
}
