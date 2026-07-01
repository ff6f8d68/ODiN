const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const db = require('./db');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = parseInt(process.env.REGISTRY_PORT || '3003', 10);

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

const sessions = new Map();
const SESSION_COOKIE = 'odin_session';
const SESSION_TTL = 86400000;

function createSession(username) {
  const id = crypto.randomBytes(16).toString('hex');
  sessions.set(id, { username, expires: Date.now() + SESSION_TTL });
  return id;
}

function getSession(req) {
  const id = getCookie(req, SESSION_COOKIE);
  if (!id) return null;
  const s = sessions.get(id);
  if (!s || s.expires < Date.now()) { sessions.delete(id); return null; }
  return s;
}

function getCookie(req, name) {
  const m = req.headers.cookie?.match(new RegExp('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)'));
  return m ? m[2] : null;
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) return json(res, 401, { error: 'Unauthorized' });
  return session;
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  console.log(`[REG] ${req.method} ${pathname}`);

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const s = getSession(req);
    return json(res, 200, { authenticated: !!s, username: s?.username });
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    const body = await parseBody(req);
    const { username, password } = body;
    if (!username || !password) return json(res, 400, { error: 'Username and password required' });
    if (username.length < 3) return json(res, 400, { error: 'Username must be at least 3 characters' });
    if (password.length < 6) return json(res, 400, { error: 'Password must be at least 6 characters' });
    if (!db.createUser(username, password)) return json(res, 409, { error: 'Username already exists' });
    const sid = createSession(username);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `${SESSION_COOKIE}=${sid}; HttpOnly; Path=/; Max-Age=${SESSION_TTL}` });
    return res.end(JSON.stringify({ success: true, username }));
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await parseBody(req);
    const { username, password } = body;
    if (!username || !password) return json(res, 400, { error: 'Username and password required' });
    if (!db.verifyUser(username, password)) return json(res, 401, { error: 'Invalid username or password' });
    const sid = createSession(username);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `${SESSION_COOKIE}=${sid}; HttpOnly; Path=/; Max-Age=${SESSION_TTL}` });
    return res.end(JSON.stringify({ success: true, username }));
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const sid = getCookie(req, SESSION_COOKIE);
    if (sid) sessions.delete(sid);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0` });
    return res.end(JSON.stringify({ success: true }));
  }

  if (pathname === '/api/tlds' && req.method === 'GET') {
    return json(res, 200, Object.values(db.getTlds()).map(t => ({ name: t.name, owner: t.owner, created: t.created })));
  }

  if (pathname === '/api/tlds' && req.method === 'POST') {
    const session = requireAuth(req, res); if (!session) return;
    const body = await parseBody(req);
    const name = body.name?.toLowerCase().replace(/^\./, '');
    if (!name) return json(res, 400, { error: 'TLD name required' });
    if (!db.createTld(name, session.username)) return json(res, 409, { error: 'TLD already exists' });
    return json(res, 200, { success: true, tld: name });
  }

  if (pathname.match(/^\/api\/tlds\/[^\/]+$/) && req.method === 'DELETE') {
    const session = requireAuth(req, res); if (!session) return;
    const tld = pathname.split('/')[3];
    const tldRecord = db.getTld(tld);
    if (!tldRecord) return json(res, 404, { error: 'TLD not found' });
    if (tldRecord.owner !== session.username) return json(res, 403, { error: 'Not authorized' });
    if (!db.deleteTld(tld)) return json(res, 500, { error: 'Failed to delete' });
    return json(res, 200, { success: true });
  }

  if (pathname === '/api/domains/me' && req.method === 'GET') {
    const session = requireAuth(req, res); if (!session) return;
    const domains = db.getDomains();
    return json(res, 200, Object.values(domains).filter(d => d.owner === session.username));
  }

  if (pathname === '/api/domains' && req.method === 'POST') {
    const session = requireAuth(req, res); if (!session) return;
    const body = await parseBody(req);
    const domain = body.domain?.trim().toLowerCase();
    if (!domain) return json(res, 400, { success: false, error: 'Domain is required' });

    const regex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,10}$/i;
    if (!regex.test(domain)) return json(res, 400, { success: false, error: 'Invalid domain format' });
    if (domain === 'registry.odin') return json(res, 400, { success: false, error: 'Cannot register registry.odin' });

    const tld = domain.split('.').pop();
    if (!db.getTld(tld)) return json(res, 400, { success: false, error: `TLD .${tld} is not part of the ODiN network` });
    if (db.getDomain(domain)) return json(res, 400, { success: false, error: 'Domain already registered' });

    const success = db.registerDomain(domain, {
      dnsType: body.dnsType || 'local', ip: body.ip || '127.0.0.1',
      customContent: body.customContent || '', owner: session.username,
      records: body.dnsType === 'custom' ? [{ type: 'A', value: body.ip || '127.0.0.1', ttl: 300 }] : [{ type: 'A', value: '127.0.0.1', ttl: 300 }]
    });

    if (success) { console.log(`[REG] Registered: ${domain} by ${session.username}`); return json(res, 200, { success: true, domain }); }
    return json(res, 500, { success: false, error: 'Failed to write database' });
  }

  if (pathname.match(/^\/api\/domains\/[^\/]+$/) && req.method === 'DELETE') {
    const session = requireAuth(req, res); if (!session) return;
    const domain = decodeURIComponent(pathname.split('/')[3]);
    if (domain === 'registry.odin') return json(res, 400, { success: false, error: 'Cannot delete registry.odin' });
    const record = db.getDomain(domain);
    if (!record) return json(res, 404, { success: false, error: 'Domain not found' });
    if (record.owner !== session.username) return json(res, 403, { success: false, error: 'Not authorized' });
    if (db.deleteDomain(domain)) { console.log(`[REG] Deleted: ${domain}`); return json(res, 200, { success: true }); }
    return json(res, 400, { success: false, error: 'Could not delete' });
  }

  if (pathname.match(/^\/api\/domains\/[^\/]+\/records$/) && req.method === 'GET') {
    const session = requireAuth(req, res); if (!session) return;
    const domain = decodeURIComponent(pathname.split('/')[3]);
    const record = db.getDomain(domain);
    if (!record) return json(res, 404, { error: 'Not found' });
    if (record.owner !== session.username) return json(res, 403, { error: 'Not authorized' });
    return json(res, 200, record.records || []);
  }

  if (pathname.match(/^\/api\/domains\/[^\/]+\/records$/) && req.method === 'POST') {
    const session = requireAuth(req, res); if (!session) return;
    const domain = decodeURIComponent(pathname.split('/')[3]);
    const body = await parseBody(req);
    const { type, value, ttl } = body;
    if (!type || !value) return json(res, 400, { error: 'Type and value required' });

    const record = db.getDomain(domain);
    if (!record) return json(res, 404, { error: 'Not found' });
    if (record.owner !== session.username) return json(res, 403, { error: 'Not authorized' });

    if (db.addRecord(domain, type.toUpperCase(), value, parseInt(ttl) || 300)) return json(res, 200, { success: true });
    return json(res, 500, { error: 'Failed' });
  }

  if (pathname.match(/^\/api\/domains\/[^\/]+\/records\/[^\/]+\/[^\/]+$/) && req.method === 'DELETE') {
    const session = requireAuth(req, res); if (!session) return;
    const parts = pathname.split('/');
    const domain = decodeURIComponent(parts[3]);
    const type = decodeURIComponent(parts[5]);
    const value = decodeURIComponent(parts[6]);
    const record = db.getDomain(domain);
    if (!record) return json(res, 404, { error: 'Not found' });
    if (record.owner !== session.username) return json(res, 403, { error: 'Not authorized' });

    if (db.deleteRecord(domain, type, value)) return json(res, 200, { success: true });
    return json(res, 500, { error: 'Failed' });
  }

  // Serve registry frontend
  const indexPath = path.join(PUBLIC_DIR, 'registry', 'index.html');
  serveStatic(res, indexPath);
});

// Create a server specifically for the registry website (only serves registry page)
const registryServer = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  console.log(`[REGISTRY] ${req.method} ${parsed.pathname}`);

  if (parsed.pathname === '/' || parsed.pathname === '/index.html') {
    return serveStatic(res, path.join(PUBLIC_DIR, 'registry', 'index.html'));
  }

  const assetPath = parsed.pathname.replace(/^\//, '');
  const filePath = path.join(PUBLIC_DIR, 'registry', assetPath);
  if (filePath.startsWith(path.join(PUBLIC_DIR, 'registry'))) {
    return serveStatic(res, filePath);
  }

  res.writeHead(404);
  res.end('Not Found');
});

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}

const mode = process.env.ODIN_MODE || 'all';
if (mode === 'all') {
  server.listen(PORT, () => console.log(`[REG] Registry server on port ${PORT}`));
}

// Export both servers
module.exports = { 
  server, 
  registryServer,
  // Also export the PORT for consistency
  PORT
};

