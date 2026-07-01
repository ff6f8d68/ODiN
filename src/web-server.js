const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');
const db = require('./db');
const { handlePeerRoutes } = require('./peer-api');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = parseInt(process.env.HTTP_PORT || '3002', 10);

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

const LOCAL_IP = getLocalIp();

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function getCookie(req, name) {
  const match = req.headers.cookie?.match(new RegExp('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)'));
  return match ? match[2] : null;
}

const server = http.createServer(async (req, res) => {
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  const parsed = url.parse(req.url, true);

  console.log(`[WEB] ${req.method} ${parsed.pathname} (Host: ${host})`);

  if (parsed.pathname === '/api/domains' && req.method === 'GET') {
    return json(res, 200, Object.values(db.getDomains()));
  }

  if (parsed.pathname === '/api/domains/check' && req.method === 'GET') {
    const domain = parsed.query.domain?.trim().toLowerCase();
    if (!domain) return json(res, 400, { available: false, reason: 'No domain provided' });

    const regex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,10}$/i;
    if (!regex.test(domain)) return json(res, 200, { available: false, reason: 'Invalid domain format' });
    if (domain === 'registry.odin') return json(res, 200, { available: false, reason: 'Reserved domain' });

    const tld = domain.split('.').pop();
    if (!db.getTld(tld)) return json(res, 200, { available: false, reason: `TLD .${tld} is not part of the ODiN network` });

    if (db.getDomain(domain)) return json(res, 200, { available: false, reason: 'Already registered' });
    return json(res, 200, { available: true });
  }

  if (parsed.pathname === '/api/domains/me' && req.method === 'GET') {
    const sessionId = getCookie(req, 'odin_session');
    // Session validation would require a session store; for now public read is handled by /api/domains
    return json(res, 200, []);
  }

  if (parsed.pathname === '/api/domains' && req.method === 'POST') {
    const body = await parseBody(req);
    const domain = body.domain?.trim().toLowerCase();
    if (!domain) return json(res, 400, { success: false, error: 'Domain is required' });

    const regex = /^[a-z0-9]+([\-\.]{1}[z0-9]+)*\.[a-z]{2,10}$/i;
    if (!regex.test(domain)) return json(res, 400, { success: false, error: 'Invalid domain format' });
    if (domain === 'registry.odin') return json(res, 400, { success: false, error: 'Cannot register registry.odin' });

    const tld = domain.split('.').pop();
    if (!db.getTld(tld)) return json(res, 400, { success: false, error: `TLD .${tld} is not part of the ODiN network` });
    if (db.getDomain(domain)) return json(res, 400, { success: false, error: 'Domain already registered' });

    const success = db.registerDomain(domain, {
      dnsType: body.dnsType || 'local',
      ip: body.ip || '127.0.0.1',
      customContent: body.customContent || '',
      owner: body.owner || 'admin',
      records: body.dnsType === 'custom' ? [{ type: 'A', value: body.ip || '127.0.0.1', ttl: 300 }] : [{ type: 'A', value: '127.0.0.1', ttl: 300 }]
    });

    if (success) { console.log(`[WEB] Registered: ${domain}`); return json(res, 200, { success: true, domain }); }
    return json(res, 500, { success: false, error: 'Failed to write database' });
  }

  if (parsed.pathname.startsWith('/api/domains/') && req.method === 'DELETE') {
    const domain = parsed.pathname.split('/')[3];
    if (!domain) return json(res, 400, { success: false, error: 'Domain required' });
    if (domain === 'registry.odin') return json(res, 400, { success: false, error: 'Cannot delete registry.odin' });
    if (db.deleteDomain(domain)) { console.log(`[WEB] Deleted: ${domain}`); return json(res, 200, { success: true }); }
    return json(res, 400, { success: false, error: 'Domain not found' });
  }

  if (await handlePeerRoutes(req, res, parsed, { parseBody, json })) return;

  if (parsed.pathname === '/ODiN.png') {
    return serveStatic(res, path.join(PUBLIC_DIR, 'ODiN.png'));
  }

  const welcomeAsset = parsed.pathname.replace(/^\//, '');
  const welcomeAssetPath = path.join(PUBLIC_DIR, 'welcome', welcomeAsset);
  if (
    welcomeAsset &&
    welcomeAssetPath.startsWith(path.join(PUBLIC_DIR, 'welcome')) &&
    ['welcome.css', 'welcome.js', 'index.html'].includes(welcomeAsset)
  ) {
    if (welcomeAsset === 'index.html') {
      fs.readFile(welcomeAssetPath, 'utf8', (err, html) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      });
      return;
    }
    return serveStatic(res, welcomeAssetPath);
  }

  // Host-based routing
  if (host === 'registry.odin') {
    const filePath = path.join(PUBLIC_DIR, 'registry', 'index.html');
    return serveStatic(res, filePath);
  }

  const record = db.getDomain(host);
  if (record) {
    if (record.dnsType === 'local') {
      const templatePath = path.join(PUBLIC_DIR, 'site', 'site.html');
      fs.readFile(templatePath, 'utf8', (err, html) => {
        if (err) { res.writeHead(500); return res.end('Error'); }
        const rendered = html.replace(/{{domain}}/g, record.domain).replace(/{{content}}/g, record.customContent || 'Welcome!');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(rendered);
      });
      return;
    }
    return json(res, 200, { message: `Domain points to ${record.ip}` });
  }

  const welcomePath = path.join(PUBLIC_DIR, 'welcome', 'index.html');
  fs.readFile(welcomePath, 'utf8', (err, html) => {
    if (err) { res.writeHead(500); return res.end('Error'); }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });
});

// Create a server specifically for the welcome website (only serves welcome page)
const welcomeServer = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  console.log(`[WELCOME] ${req.method} ${parsed.pathname}`);

  if (await handlePeerRoutes(req, res, parsed, { parseBody, json })) return;

  if (parsed.pathname === '/ODiN.png') {
    return serveStatic(res, path.join(PUBLIC_DIR, 'ODiN.png'));
  }

  if (parsed.pathname === '/' || parsed.pathname === '/index.html' || parsed.pathname === '/welcome') {
    const welcomePath = path.join(PUBLIC_DIR, 'welcome', 'index.html');
    fs.readFile(welcomePath, 'utf8', (err, html) => {
      if (err) { res.writeHead(500); return res.end('Error'); }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });
    return;
  }

  const assetPath = parsed.pathname.replace(/^\//, '');
  const filePath = path.join(PUBLIC_DIR, 'welcome', assetPath);
  if (filePath.startsWith(path.join(PUBLIC_DIR, 'welcome'))) {
    return serveStatic(res, filePath);
  }

  res.writeHead(404);
  res.end('Not Found');
});

const mode = process.env.ODIN_MODE || 'all';
if (mode === 'all') {
  server.listen(PORT, () => console.log(`[WEB] Website server on port ${PORT}`));
}

// Export both servers
module.exports = { 
  server, 
  welcomeServer,
  // Also export the PORT for consistency
  PORT
};

