import { createDb } from '../../shared/db.js';
import { createAuth } from '../../shared/auth.js';
import { json, parseBody, DOMAIN_REGEX } from '../../shared/utils.js';

export default {
  async fetch(request, env) {
    const db = createDb(env.ODIN_DB);
    const auth = createAuth(env.ODIN_DB);
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === '/api/auth/me' && method === 'GET') {
      const session = await auth.getSession(request);
      return json({ authenticated: !!session, username: session?.username });
    }

    if (pathname === '/api/auth/register' && method === 'POST') {
      const body = await parseBody(request);
      const { username, password } = body;
      if (!username || !password) return json({ error: 'Username and password required' }, 400);
      if (username.length < 3) return json({ error: 'Username must be at least 3 characters' }, 400);
      if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
      if (!(await db.createUser(username, password))) return json({ error: 'Username already exists' }, 409);
      const sid = await auth.createSession(username);
      return auth.authResponse({ success: true, username }, sid);
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await parseBody(request);
      const { username, password } = body;
      if (!username || !password) return json({ error: 'Username and password required' }, 400);
      if (!(await db.verifyUser(username, password))) return json({ error: 'Invalid username or password' }, 401);
      const sid = await auth.createSession(username);
      return auth.authResponse({ success: true, username }, sid);
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      await auth.deleteSession(request);
      return auth.logoutResponse();
    }

    if (pathname === '/api/tlds' && method === 'GET') {
      const tlds = await db.getTlds();
      return json(Object.values(tlds).map((t) => ({ name: t.name, owner: t.owner, created: t.created })));
    }

    if (pathname === '/api/tlds' && method === 'POST') {
      const session = await auth.getSession(request);
      if (!session) return json({ error: 'Unauthorized' }, 401);
      const body = await parseBody(request);
      const name = body.name?.toLowerCase().replace(/^\./, '');
      if (!name) return json({ error: 'TLD name required' }, 400);
      if (!(await db.createTld(name, session.username))) return json({ error: 'TLD already exists' }, 409);
      return json({ success: true, tld: name });
    }

    if (pathname.match(/^\/api\/tlds\/[^/]+$/) && method === 'DELETE') {
      const session = await auth.getSession(request);
      if (!session) return json({ error: 'Unauthorized' }, 401);
      const tld = pathname.split('/')[3];
      const tldRecord = await db.getTld(tld);
      if (!tldRecord) return json({ error: 'TLD not found' }, 404);
      if (tldRecord.owner !== session.username) return json({ error: 'Not authorized' }, 403);
      if (!(await db.deleteTld(tld))) return json({ error: 'Failed to delete' }, 500);
      return json({ success: true });
    }

    if (pathname === '/api/domains/me' && method === 'GET') {
      const session = await auth.getSession(request);
      if (!session) return json({ error: 'Unauthorized' }, 401);
      const domains = await db.getDomains();
      return json(Object.values(domains).filter((d) => d.owner === session.username));
    }

    if (pathname === '/api/domains' && method === 'POST') {
      const session = await auth.getSession(request);
      if (!session) return json({ error: 'Unauthorized' }, 401);
      const body = await parseBody(request);
      const domain = body.domain?.trim().toLowerCase();
      if (!domain) return json({ success: false, error: 'Domain is required' }, 400);
      if (!DOMAIN_REGEX.test(domain)) return json({ success: false, error: 'Invalid domain format' }, 400);
      if (domain === 'registry.odin') return json({ success: false, error: 'Cannot register registry.odin' }, 400);

      const tld = domain.split('.').pop();
      if (!(await db.getTld(tld))) return json({ success: false, error: `TLD .${tld} is not part of the ODiN network` }, 400);
      if (await db.getDomain(domain)) return json({ success: false, error: 'Domain already registered' }, 400);

      const success = await db.registerDomain(domain, {
        dnsType: body.dnsType || 'local',
        ip: body.ip || '127.0.0.1',
        customContent: body.customContent || '',
        owner: session.username,
        records:
          body.dnsType === 'custom'
            ? [{ type: 'A', value: body.ip || '127.0.0.1', ttl: 300 }]
            : [{ type: 'A', value: '127.0.0.1', ttl: 300 }],
      });

      if (success) return json({ success: true, domain });
      return json({ success: false, error: 'Failed to write database' }, 500);
    }

    if (pathname.match(/^\/api\/domains\/[^/]+$/) && method === 'DELETE') {
      const session = await auth.getSession(request);
      if (!session) return json({ error: 'Unauthorized' }, 401);
      const domain = decodeURIComponent(pathname.split('/')[3]);
      if (domain === 'registry.odin') return json({ success: false, error: 'Cannot delete registry.odin' }, 400);
      const record = await db.getDomain(domain);
      if (!record) return json({ success: false, error: 'Domain not found' }, 404);
      if (record.owner !== session.username) return json({ success: false, error: 'Not authorized' }, 403);
      if (await db.deleteDomain(domain)) return json({ success: true });
      return json({ success: false, error: 'Could not delete' }, 400);
    }

    if (pathname.match(/^\/api\/domains\/[^/]+\/records$/) && method === 'GET') {
      const session = await auth.getSession(request);
      if (!session) return json({ error: 'Unauthorized' }, 401);
      const domain = decodeURIComponent(pathname.split('/')[3]);
      const record = await db.getDomain(domain);
      if (!record) return json({ error: 'Not found' }, 404);
      if (record.owner !== session.username) return json({ error: 'Not authorized' }, 403);
      return json(record.records || []);
    }

    if (pathname.match(/^\/api\/domains\/[^/]+\/records$/) && method === 'POST') {
      const session = await auth.getSession(request);
      if (!session) return json({ error: 'Unauthorized' }, 401);
      const domain = decodeURIComponent(pathname.split('/')[3]);
      const body = await parseBody(request);
      const { type, value, ttl } = body;
      if (!type || !value) return json({ error: 'Type and value required' }, 400);

      const record = await db.getDomain(domain);
      if (!record) return json({ error: 'Not found' }, 404);
      if (record.owner !== session.username) return json({ error: 'Not authorized' }, 403);

      if (await db.addRecord(domain, type.toUpperCase(), value, parseInt(ttl) || 300)) {
        return json({ success: true });
      }
      return json({ error: 'Failed' }, 500);
    }

    if (pathname.match(/^\/api\/domains\/[^/]+\/records\/[^/]+\/[^/]+$/) && method === 'DELETE') {
      const session = await auth.getSession(request);
      if (!session) return json({ error: 'Unauthorized' }, 401);
      const parts = pathname.split('/');
      const domain = decodeURIComponent(parts[3]);
      const type = decodeURIComponent(parts[5]);
      const value = decodeURIComponent(parts[6]);
      const record = await db.getDomain(domain);
      if (!record) return json({ error: 'Not found' }, 404);
      if (record.owner !== session.username) return json({ error: 'Not authorized' }, 403);

      if (await db.deleteRecord(domain, type, value)) return json({ success: true });
      return json({ error: 'Failed' }, 500);
    }

    return env.ASSETS.fetch(request);
  },
};
