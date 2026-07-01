const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./db');

const PUBLIC_DIR = path.join(__dirname, 'public');

const sessions = new Map();

function createSession(username) {
  const sessionId = crypto.randomBytes(16).toString('hex');
  sessions.set(sessionId, { username, createdAt: Date.now() });
  return sessionId;
}

function getSession(req) {
  const sessionId = req.cookies?.['odin_session'];
  if (!sessionId) return null;
  return sessions.get(sessionId) || null;
}

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  req.user = session;
  next();
}

function start(port = 80, serverIp = '127.0.0.1') {
  const app = express();
  const DNS_PORT = parseInt(process.env.DNS_PORT || '53', 10);

  app.use((req, res, next) => {
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      req.cookies = {};
      cookieHeader.split(';').forEach(c => {
        const [name, ...rest] = c.trim().split('=');
        req.cookies[name] = decodeURIComponent(rest.join('='));
      });
    }
    next();
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    const hostHeader = req.headers.host || '';
    const host = hostHeader.split(':')[0].toLowerCase();
    console.log(`[HTTP] ${req.method} ${req.url} (Host: ${host})`);
    next();
  });

  app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const success = db.createUser(username, password);
    if (!success) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const sessionId = createSession(username);
    res.cookie('odin_session', sessionId, { httpOnly: true, maxAge: 86400000 });
    res.json({ success: true, username });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (!db.verifyUser(username, password)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const sessionId = createSession(username);
    res.cookie('odin_session', sessionId, { httpOnly: true, maxAge: 86400000 });
    res.json({ success: true, username });
  });

  app.post('/api/auth/logout', (req, res) => {
    const sessionId = req.cookies?.['odin_session'];
    if (sessionId) sessions.delete(sessionId);
    res.clearCookie('odin_session');
    res.json({ success: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ authenticated: false });
    res.json({ authenticated: true, username: session.username });
  });

  app.get('/api/tlds', (req, res) => {
    const tlds = db.getTlds();
    res.json(Object.values(tlds).map(t => ({ name: t.name, owner: t.owner, created: t.created })));
  });

  app.post('/api/tlds', requireAuth, (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'TLD name required' });

    const cleanTld = name.toLowerCase().replace(/^\./, '');
    const success = db.createTld(cleanTld, req.user.username);
    if (!success) {
      return res.status(409).json({ error: 'TLD already exists' });
    }
    res.json({ success: true, tld: cleanTld });
  });

  app.delete('/api/tlds/:tld', requireAuth, (req, res) => {
    const { tld } = req.params;
    const cleanTld = tld.toLowerCase().replace(/^\./, '');
    const tldRecord = db.getTld(cleanTld);
    if (!tldRecord) return res.status(404).json({ error: 'TLD not found' });
    if (tldRecord.owner !== req.user.username) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const success = db.deleteTld(cleanTld);
    if (!success) return res.status(500).json({ error: 'Failed to delete TLD' });
    res.json({ success: true });
  });

  app.get('/api/domains', (req, res) => {
    const domains = db.getDomains();
    res.json(Object.values(domains));
  });

  app.get('/api/domains/check', (req, res) => {
    const { domain } = req.query;
    if (!domain) return res.status(400).json({ available: false, reason: 'No domain provided' });

    const cleanDomain = domain.trim().toLowerCase();
    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,10}$/i;
    if (!domainRegex.test(cleanDomain)) {
      return res.status(200).json({ available: false, reason: 'Invalid domain format' });
    }

    if (cleanDomain === 'registry.odin') {
      return res.status(200).json({ available: false, reason: 'Reserved domain' });
    }

    const tld = cleanDomain.split('.').pop();
    const tldRecord = db.getTld(tld);
    if (!tldRecord) {
      return res.status(200).json({ available: false, reason: `TLD .${tld} is not part of the ODiN network` });
    }

    const record = db.getDomain(cleanDomain);
    if (record) {
      return res.status(200).json({ available: false, reason: 'Already registered' });
    }

    return res.json({ available: true });
  });

  app.post('/api/domains', requireAuth, (req, res) => {
    const { domain, dnsType, ip, customContent } = req.body;

    if (!domain) {
      return res.status(400).json({ success: false, error: 'Domain is required' });
    }

    const cleanDomain = domain.trim().toLowerCase();

    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,10}$/i;
    if (!domainRegex.test(cleanDomain)) {
      return res.status(400).json({ success: false, error: 'Invalid domain format' });
    }

    if (cleanDomain === 'registry.odin') {
      return res.status(400).json({ success: false, error: 'Cannot register registry.odin' });
    }

    const tld = cleanDomain.split('.').pop();
    const tldRecord = db.getTld(tld);
    if (!tldRecord) {
      return res.status(400).json({ success: false, error: `TLD .${tld} is not part of the ODiN network` });
    }

    const existing = db.getDomain(cleanDomain);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Domain already registered' });
    }

    const success = db.registerDomain(cleanDomain, {
      dnsType: dnsType || 'local',
      ip: ip || '127.0.0.1',
      customContent: customContent || '',
      owner: req.user.username,
      records: dnsType === 'custom' ? [{ type: 'A', value: ip || '127.0.0.1', ttl: 300 }] : [{ type: 'A', value: '127.0.0.1', ttl: 300 }]
    });

    if (success) {
      console.log(`[HTTP] Registered domain: ${cleanDomain} (${dnsType}) by ${req.user.username}`);
      res.json({ success: true, domain: cleanDomain });
    } else {
      res.status(500).json({ success: false, error: 'Failed to write database' });
    }
  });

  app.get('/api/domains/me', requireAuth, (req, res) => {
    const domains = db.getDomains();
    const userDomains = Object.values(domains).filter(d => d.owner === req.user.username);
    res.json(userDomains);
  });

  app.delete('/api/domains/:domain', requireAuth, (req, res) => {
    const { domain } = req.params;
    const cleanDomain = domain.trim().toLowerCase();

    if (cleanDomain === 'registry.odin') {
      return res.status(400).json({ success: false, error: 'Cannot delete registry.odin' });
    }

    const record = db.getDomain(cleanDomain);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Domain not found' });
    }
    if (record.owner !== req.user.username) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const success = db.deleteDomain(cleanDomain);
    if (success) {
      console.log(`[HTTP] Deleted domain: ${cleanDomain} by ${req.user.username}`);
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: 'Domain not found or could not be deleted' });
    }
  });

  app.get('/api/domains/:domain/records', requireAuth, (req, res) => {
    const { domain } = req.params;
    const record = db.getDomain(domain);
    if (!record) return res.status(404).json({ error: 'Domain not found' });
    if (record.owner !== req.user.username) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    res.json(record.records || []);
  });

  app.post('/api/domains/:domain/records', requireAuth, (req, res) => {
    const { domain } = req.params;
    const { type, value, ttl } = req.body;

    if (!type || !value) {
      return res.status(400).json({ error: 'Type and value required' });
    }

    const cleanDomain = domain.toLowerCase().replace(/\.$/, '');
    const record = db.getDomain(cleanDomain);
    if (!record) return res.status(404).json({ error: 'Domain not found' });
    if (record.owner !== req.user.username) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const success = db.addRecord(cleanDomain, type.toUpperCase(), value, parseInt(ttl) || 300);
    if (!success) return res.status(500).json({ error: 'Failed to add record' });

    res.json({ success: true });
  });

  app.delete('/api/domains/:domain/records/:type/:value', requireAuth, (req, res) => {
    const { domain, type, value } = req.params;
    const cleanDomain = domain.toLowerCase().replace(/\.$/, '');

    const record = db.getDomain(cleanDomain);
    if (!record) return res.status(404).json({ error: 'Domain not found' });
    if (record.owner !== req.user.username) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const success = db.deleteRecord(cleanDomain, decodeURIComponent(type), decodeURIComponent(value));
    if (!success) return res.status(500).json({ error: 'Failed to delete record' });

    res.json({ success: true });
  });

  // Direct access to registry panel
  app.get('/registry*', (req, res, next) => {
    const host = req.headers.host.split(':')[0].toLowerCase();
    if (host === 'registry.odin') return next();
    const registryPath = path.join(PUBLIC_DIR, 'registry', 'index.html');
    fs.readFile(registryPath, 'utf8', (err, html) => {
      if (err) return res.status(500).send('Internal Server Error');
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    });
  });

  app.use((req, res, next) => {
    const hostHeader = req.headers.host || '';
    const host = hostHeader.split(':')[0].toLowerCase();

    if (host === 'registry.odin') {
      return express.static(path.join(PUBLIC_DIR, 'registry'))(req, res, next);
    }

    const record = db.getDomain(host);
    if (record) {
      if (record.dnsType === 'local') {
        const templatePath = path.join(PUBLIC_DIR, 'site', 'site.html');
        fs.readFile(templatePath, 'utf8', (err, html) => {
          if (err) {
            console.error('Error reading site template:', err);
            return res.status(500).send('Internal Server Error');
          }

          let renderedHtml = html
            .replace(/{{domain}}/g, record.domain)
            .replace(/{{content}}/g, record.customContent || 'Welcome to this site!');

          res.setHeader('Content-Type', 'text/html');
          res.send(renderedHtml);
        });
        return;
      } else {
        return res.send(`Domain ${record.domain} is pointing to custom IP ${record.ip}. If you see this, you accessed this host directly.`);
      }
    }

    const welcomePath = path.join(PUBLIC_DIR, 'welcome', 'index.html');
    fs.readFile(welcomePath, 'utf8', (err, html) => {
      if (err) {
        console.error('Error reading welcome page:', err);
        return res.status(500).send('Internal Server Error');
      }

      let renderedHtml = html
        .replace(/\{\{server_ip\}\}/g, serverIp)
        .replace(/\{\{dns_port\}\}/g, String(process.env.DNS_PORT || 53))
        .replace(/\{\{http_port\}\}/g, String(process.env.HTTP_PORT || 80));

      res.setHeader('Content-Type', 'text/html');
      res.send(renderedHtml);
    });
  });

  app.use('/site', express.static(path.join(PUBLIC_DIR, 'site')));
  app.use('/welcome', express.static(path.join(PUBLIC_DIR, 'welcome')));
  app.use('/registry', express.static(path.join(PUBLIC_DIR, 'registry')));

  const server = app.listen(port, () => {
    console.log(`[HTTP] Web server listening on port ${port}`);
    console.log(`[HTTP] Server IP: ${serverIp}`);
  });

  return server;
}

module.exports = { start };
