export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

export function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)'));
  return match ? match[2] : null;
}

export function sessionCookieHeader(sessionId, maxAge) {
  const secure = maxAge > 0 ? '; Secure; SameSite=Lax' : '';
  return `odin_session=${sessionId}; HttpOnly; Path=/; Max-Age=${maxAge}${secure}`;
}

export async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export const DOMAIN_REGEX = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,10}$/i;
