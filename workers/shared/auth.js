import { getCookie, sessionCookieHeader } from './utils.js';

const SESSION_PREFIX = 'odin:session:';
const SESSION_TTL = 86400;

function randomSessionId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function createAuth(kv) {
  return {
  async createSession(username) {
    const id = randomSessionId();
    await kv.put(
      SESSION_PREFIX + id,
      JSON.stringify({ username, expires: Date.now() + SESSION_TTL * 1000 }),
      { expirationTtl: SESSION_TTL }
    );
    return id;
  },

  async getSession(request) {
    const id = getCookie(request, 'odin_session');
    if (!id) return null;
    const raw = await kv.get(SESSION_PREFIX + id);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session.expires < Date.now()) {
      await kv.delete(SESSION_PREFIX + id);
      return null;
    }
    return session;
  },

  async deleteSession(request) {
    const id = getCookie(request, 'odin_session');
    if (id) await kv.delete(SESSION_PREFIX + id);
  },

  authResponse(data, sessionId) {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': sessionCookieHeader(sessionId, SESSION_TTL),
      },
    });
  },

  logoutResponse() {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': sessionCookieHeader('', 0),
      },
    });
  },
  };
}
