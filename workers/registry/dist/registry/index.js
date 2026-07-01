var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../shared/db.js
var DB_KEY = "odin:data";
var SALT = "odin_salt_2026";
async function hashPassword(password) {
  const data = new TextEncoder().encode(password + SALT);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, hash) {
  return await hashPassword(password) === hash;
}
__name(verifyPassword, "verifyPassword");
function createInitialDb() {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    users: { admin: { password: null, created: now } },
    tlds: { odin: { name: "odin", owner: "admin", created: now } },
    "registry.odin": {
      domain: "registry.odin",
      dnsType: "local",
      ip: "127.0.0.1",
      customContent: "System Registry Server",
      owner: "admin",
      created: now,
      records: [{ type: "A", value: "127.0.0.1", ttl: 300 }]
    }
  };
}
__name(createInitialDb, "createInitialDb");
async function initDb(kv) {
  let data = await kv.get(DB_KEY, "json");
  if (!data) {
    data = createInitialDb();
    data.users.admin.password = await hashPassword("admin");
    await kv.put(DB_KEY, JSON.stringify(data));
    return data;
  }
  let changed = false;
  if (!data.users) {
    data.users = { admin: { password: await hashPassword("admin"), created: (/* @__PURE__ */ new Date()).toISOString() } };
    changed = true;
  }
  if (!data.tlds) {
    data.tlds = { odin: { name: "odin", owner: "admin", created: (/* @__PURE__ */ new Date()).toISOString() } };
    changed = true;
  }
  for (const [key, val] of Object.entries(data)) {
    if (key === "users" || key === "tlds")
      continue;
    if (typeof val === "object" && val.domain) {
      if (!val.owner) {
        val.owner = "admin";
        changed = true;
      }
      if (!val.records) {
        val.records = val.dnsType === "custom" ? [{ type: "A", value: val.ip || "127.0.0.1", ttl: 300 }] : [{ type: "A", value: "127.0.0.1", ttl: 300 }];
        changed = true;
      }
    }
  }
  if (changed)
    await kv.put(DB_KEY, JSON.stringify(data));
  return data;
}
__name(initDb, "initDb");
function createDb(kv) {
  async function getData() {
    return initDb(kv);
  }
  __name(getData, "getData");
  async function saveData(data) {
    await kv.put(DB_KEY, JSON.stringify(data));
    return true;
  }
  __name(saveData, "saveData");
  return {
    hashPassword,
    verifyPassword,
    getUsers: async () => (await getData()).users || {},
    getUser: async (u) => (await getData()).users?.[u],
    createUser: async (u, p) => {
      const d = await getData();
      if (!d.users)
        d.users = {};
      if (d.users[u])
        return false;
      d.users[u] = { password: await hashPassword(p), created: (/* @__PURE__ */ new Date()).toISOString() };
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
      if (!d.tlds)
        d.tlds = {};
      if (d.tlds[t])
        return false;
      d.tlds[t] = { name: t, owner: o, created: (/* @__PURE__ */ new Date()).toISOString() };
      return saveData(d);
    },
    deleteTld: async (t) => {
      const d = await getData();
      if (!d.tlds?.[t])
        return false;
      delete d.tlds[t];
      return saveData(d);
    },
    getDomains: async () => {
      const d = await getData();
      const r = {};
      for (const [k, v] of Object.entries(d)) {
        if (k === "users" || k === "tlds")
          continue;
        if (typeof v === "object" && v.domain)
          r[k] = v;
      }
      return r;
    },
    getDomain: async (domain) => (await getData())[domain.toLowerCase().replace(/\.$/, "")],
    registerDomain: async (domain, opts) => {
      const data = await getData();
      const c = domain.toLowerCase().replace(/\.$/, "");
      if (data[c])
        return false;
      data[c] = {
        domain: c,
        dnsType: opts.dnsType || "local",
        ip: opts.ip || "127.0.0.1",
        customContent: opts.customContent || "",
        owner: opts.owner || "admin",
        created: (/* @__PURE__ */ new Date()).toISOString(),
        records: opts.records || (opts.dnsType === "custom" ? [{ type: "A", value: opts.ip || "127.0.0.1", ttl: 300 }] : [{ type: "A", value: "127.0.0.1", ttl: 300 }])
      };
      return saveData(data);
    },
    deleteDomain: async (domain) => {
      const data = await getData();
      const c = domain.toLowerCase().replace(/\.$/, "");
      if (!data[c])
        return false;
      delete data[c];
      return saveData(data);
    },
    addRecord: async (domain, type, value, ttl = 300) => {
      const data = await getData();
      const c = domain.toLowerCase().replace(/\.$/, "");
      const r = data[c];
      if (!r)
        return false;
      if (!r.records)
        r.records = [];
      r.records = r.records.filter((x) => !(x.type === type && x.value === value));
      r.records.push({ type, value, ttl });
      return saveData(data);
    },
    deleteRecord: async (domain, type, value) => {
      const data = await getData();
      const c = domain.toLowerCase().replace(/\.$/, "");
      const r = data[c];
      if (!r || !r.records)
        return false;
      r.records = r.records.filter((x) => !(x.type === type && x.value === value));
      return saveData(data);
    }
  };
}
__name(createDb, "createDb");

// ../shared/utils.js
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders }
  });
}
__name(json, "json");
function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)"));
  return match ? match[2] : null;
}
__name(getCookie, "getCookie");
function sessionCookieHeader(sessionId, maxAge) {
  const secure = maxAge > 0 ? "; Secure; SameSite=Lax" : "";
  return `odin_session=${sessionId}; HttpOnly; Path=/; Max-Age=${maxAge}${secure}`;
}
__name(sessionCookieHeader, "sessionCookieHeader");
async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
__name(parseBody, "parseBody");
var DOMAIN_REGEX = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,10}$/i;

// ../shared/auth.js
var SESSION_PREFIX = "odin:session:";
var SESSION_TTL = 86400;
function randomSessionId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(randomSessionId, "randomSessionId");
function createAuth(kv) {
  return {
    async createSession(username) {
      const id = randomSessionId();
      await kv.put(
        SESSION_PREFIX + id,
        JSON.stringify({ username, expires: Date.now() + SESSION_TTL * 1e3 }),
        { expirationTtl: SESSION_TTL }
      );
      return id;
    },
    async getSession(request) {
      const id = getCookie(request, "odin_session");
      if (!id)
        return null;
      const raw = await kv.get(SESSION_PREFIX + id);
      if (!raw)
        return null;
      const session = JSON.parse(raw);
      if (session.expires < Date.now()) {
        await kv.delete(SESSION_PREFIX + id);
        return null;
      }
      return session;
    },
    async deleteSession(request) {
      const id = getCookie(request, "odin_session");
      if (id)
        await kv.delete(SESSION_PREFIX + id);
    },
    authResponse(data, sessionId) {
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": sessionCookieHeader(sessionId, SESSION_TTL)
        }
      });
    },
    logoutResponse() {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": sessionCookieHeader("", 0)
        }
      });
    }
  };
}
__name(createAuth, "createAuth");

// src/index.js
var src_default = {
  async fetch(request, env) {
    const db = createDb(env.ODIN_DB);
    const auth = createAuth(env.ODIN_DB);
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;
    if (pathname === "/api/auth/me" && method === "GET") {
      const session = await auth.getSession(request);
      return json({ authenticated: !!session, username: session?.username });
    }
    if (pathname === "/api/auth/register" && method === "POST") {
      const body = await parseBody(request);
      const { username, password } = body;
      if (!username || !password)
        return json({ error: "Username and password required" }, 400);
      if (username.length < 3)
        return json({ error: "Username must be at least 3 characters" }, 400);
      if (password.length < 6)
        return json({ error: "Password must be at least 6 characters" }, 400);
      if (!await db.createUser(username, password))
        return json({ error: "Username already exists" }, 409);
      const sid = await auth.createSession(username);
      return auth.authResponse({ success: true, username }, sid);
    }
    if (pathname === "/api/auth/login" && method === "POST") {
      const body = await parseBody(request);
      const { username, password } = body;
      if (!username || !password)
        return json({ error: "Username and password required" }, 400);
      if (!await db.verifyUser(username, password))
        return json({ error: "Invalid username or password" }, 401);
      const sid = await auth.createSession(username);
      return auth.authResponse({ success: true, username }, sid);
    }
    if (pathname === "/api/auth/logout" && method === "POST") {
      await auth.deleteSession(request);
      return auth.logoutResponse();
    }
    if (pathname === "/api/tlds" && method === "GET") {
      const tlds = await db.getTlds();
      return json(Object.values(tlds).map((t) => ({ name: t.name, owner: t.owner, created: t.created })));
    }
    if (pathname === "/api/tlds" && method === "POST") {
      const session = await auth.getSession(request);
      if (!session)
        return json({ error: "Unauthorized" }, 401);
      const body = await parseBody(request);
      const name = body.name?.toLowerCase().replace(/^\./, "");
      if (!name)
        return json({ error: "TLD name required" }, 400);
      if (!await db.createTld(name, session.username))
        return json({ error: "TLD already exists" }, 409);
      return json({ success: true, tld: name });
    }
    if (pathname.match(/^\/api\/tlds\/[^/]+$/) && method === "DELETE") {
      const session = await auth.getSession(request);
      if (!session)
        return json({ error: "Unauthorized" }, 401);
      const tld = pathname.split("/")[3];
      const tldRecord = await db.getTld(tld);
      if (!tldRecord)
        return json({ error: "TLD not found" }, 404);
      if (tldRecord.owner !== session.username)
        return json({ error: "Not authorized" }, 403);
      if (!await db.deleteTld(tld))
        return json({ error: "Failed to delete" }, 500);
      return json({ success: true });
    }
    if (pathname === "/api/domains/me" && method === "GET") {
      const session = await auth.getSession(request);
      if (!session)
        return json({ error: "Unauthorized" }, 401);
      const domains = await db.getDomains();
      return json(Object.values(domains).filter((d) => d.owner === session.username));
    }
    if (pathname === "/api/domains" && method === "POST") {
      const session = await auth.getSession(request);
      if (!session)
        return json({ error: "Unauthorized" }, 401);
      const body = await parseBody(request);
      const domain = body.domain?.trim().toLowerCase();
      if (!domain)
        return json({ success: false, error: "Domain is required" }, 400);
      if (!DOMAIN_REGEX.test(domain))
        return json({ success: false, error: "Invalid domain format" }, 400);
      if (domain === "registry.odin")
        return json({ success: false, error: "Cannot register registry.odin" }, 400);
      const tld = domain.split(".").pop();
      if (!await db.getTld(tld))
        return json({ success: false, error: `TLD .${tld} is not part of the ODiN network` }, 400);
      if (await db.getDomain(domain))
        return json({ success: false, error: "Domain already registered" }, 400);
      const success = await db.registerDomain(domain, {
        dnsType: body.dnsType || "local",
        ip: body.ip || "127.0.0.1",
        customContent: body.customContent || "",
        owner: session.username,
        records: body.dnsType === "custom" ? [{ type: "A", value: body.ip || "127.0.0.1", ttl: 300 }] : [{ type: "A", value: "127.0.0.1", ttl: 300 }]
      });
      if (success)
        return json({ success: true, domain });
      return json({ success: false, error: "Failed to write database" }, 500);
    }
    if (pathname.match(/^\/api\/domains\/[^/]+$/) && method === "DELETE") {
      const session = await auth.getSession(request);
      if (!session)
        return json({ error: "Unauthorized" }, 401);
      const domain = decodeURIComponent(pathname.split("/")[3]);
      if (domain === "registry.odin")
        return json({ success: false, error: "Cannot delete registry.odin" }, 400);
      const record = await db.getDomain(domain);
      if (!record)
        return json({ success: false, error: "Domain not found" }, 404);
      if (record.owner !== session.username)
        return json({ success: false, error: "Not authorized" }, 403);
      if (await db.deleteDomain(domain))
        return json({ success: true });
      return json({ success: false, error: "Could not delete" }, 400);
    }
    if (pathname.match(/^\/api\/domains\/[^/]+\/records$/) && method === "GET") {
      const session = await auth.getSession(request);
      if (!session)
        return json({ error: "Unauthorized" }, 401);
      const domain = decodeURIComponent(pathname.split("/")[3]);
      const record = await db.getDomain(domain);
      if (!record)
        return json({ error: "Not found" }, 404);
      if (record.owner !== session.username)
        return json({ error: "Not authorized" }, 403);
      return json(record.records || []);
    }
    if (pathname.match(/^\/api\/domains\/[^/]+\/records$/) && method === "POST") {
      const session = await auth.getSession(request);
      if (!session)
        return json({ error: "Unauthorized" }, 401);
      const domain = decodeURIComponent(pathname.split("/")[3]);
      const body = await parseBody(request);
      const { type, value, ttl } = body;
      if (!type || !value)
        return json({ error: "Type and value required" }, 400);
      const record = await db.getDomain(domain);
      if (!record)
        return json({ error: "Not found" }, 404);
      if (record.owner !== session.username)
        return json({ error: "Not authorized" }, 403);
      if (await db.addRecord(domain, type.toUpperCase(), value, parseInt(ttl) || 300)) {
        return json({ success: true });
      }
      return json({ error: "Failed" }, 500);
    }
    if (pathname.match(/^\/api\/domains\/[^/]+\/records\/[^/]+\/[^/]+$/) && method === "DELETE") {
      const session = await auth.getSession(request);
      if (!session)
        return json({ error: "Unauthorized" }, 401);
      const parts = pathname.split("/");
      const domain = decodeURIComponent(parts[3]);
      const type = decodeURIComponent(parts[5]);
      const value = decodeURIComponent(parts[6]);
      const record = await db.getDomain(domain);
      if (!record)
        return json({ error: "Not found" }, 404);
      if (record.owner !== session.username)
        return json({ error: "Not authorized" }, 403);
      if (await db.deleteRecord(domain, type, value))
        return json({ success: true });
      return json({ error: "Failed" }, 500);
    }
    return env.ASSETS.fetch(request);
  }
};
export {
  src_default as default
};
//# sourceMappingURL=index.js.map
