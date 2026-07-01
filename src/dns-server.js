const dns2 = require('dns2');
const db = require('./db');
const { Packet } = dns2;

const UPSTREAM_DNS = process.env.UPSTREAM_DNS || '8.8.8.8';
const RESOLVE_IP = process.env.RESOLVE_IP || '127.0.0.1';
const PORT = parseInt(process.env.DNS_PORT || '3001', 10);

const TYPE_MAP = { 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV' };
function getTypeString(n) { return TYPE_MAP[n] || Object.entries(Packet.TYPE || {}).find(([, v]) => v === n)?.[0] || 'A'; }

const upstream = new dns2({ nameServers: [UPSTREAM_DNS] });

async function handle(req, send, rinfo) {
  const res = Packet.createResponseFromRequest(req);
  const q = req.questions[0];
  if (!q) { send(res); return; }

  const domain = q.name.toLowerCase().replace(/\.$/, '');
  console.log(`[DNS] ${domain} (${getTypeString(q.type)})`);

  const record = db.getDomain(domain);
  if (record) {
    if (q.type === Packet.TYPE.A) {
      const ip = record.dnsType === 'local' ? RESOLVE_IP : record.ip;
      res.answers.push({ name: q.name, type: Packet.TYPE.A, class: Packet.CLASS.IN, ttl: 300, address: ip });
    } else if (record.records) {
      for (const r of record.records) {
        if (r.type === getTypeString(q.type)) {
          const ans = { name: q.name, type: Packet.TYPE[r.type] || q.type, class: Packet.CLASS.IN, ttl: r.ttl || 300 };
          if (r.type === 'A' || r.type === 'AAAA') ans.address = r.value; else ans.data = r.value;
          res.answers.push(ans);
        }
      }
    }
    send(res);
    return;
  }

  const tld = domain.split('.').pop();
  if (tld && db.getTld(tld)) {
    console.log(`[DNS] NXDOMAIN: ${domain} (TLD .${tld} exists but domain not registered)`);
    res.header.rcode = Packet.RCODE.NXDOMAIN;
    send(res);
    return;
  }

  try {
    const typeStr = getTypeString(q.type);
    const upstreamRes = await upstream.resolve(domain, typeStr);
    if (upstreamRes?.answers) res.answers.push(...upstreamRes.answers);
    if (upstreamRes?.authorities) res.authorities.push(...upstreamRes.authorities);
    if (upstreamRes?.additionals) res.additionals.push(...upstreamRes.additionals);
    send(res);
  } catch (err) {
    console.error(`[DNS] Upstream failed for ${domain}:`, err.message);
    res.header.rcode = Packet.RCODE.NXDOMAIN;
    send(res);
  }
}

const server = dns2.createServer({ udp: true, handle });
server.on('error', e => console.error('[DNS] Error:', e));

const PEER_HEARTBEAT_MS = 5 * 60 * 1000;

async function registerAsPeer() {
  const registerUrl = process.env.PEER_REGISTER_URL;
  const host = process.env.PEER_HOST;
  if (!registerUrl || !host) return;

  const body = {
    host,
    port: PORT,
    colo: process.env.PEER_COLO || undefined,
    id: process.env.PEER_ID || host,
  };

  try {
    const res = await fetch(registerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) console.log(`[DNS] Registered as P2P peer: ${host}:${PORT}`);
    else console.warn(`[DNS] Peer registration failed: ${res.status}`);
  } catch (err) {
    console.warn('[DNS] Peer registration error:', err.message);
  }
}

server.on('listening', () => {
  console.log(`[DNS] Listening on port ${PORT} (UDP)`);
  console.log(`[DNS] Upstream: ${UPSTREAM_DNS}`);
  if (process.env.PEER_REGISTER_URL && process.env.PEER_HOST) {
    registerAsPeer();
    setInterval(registerAsPeer, PEER_HEARTBEAT_MS);
    console.log(`[DNS] Peer mode: registering as ${process.env.PEER_HOST}:${PORT}`);
  } else {
    console.log('[DNS] Standalone mode — set PEER_REGISTER_URL + PEER_HOST to join the peer mesh');
  }
});
const mode = process.env.ODIN_MODE || 'all';
if (mode === 'dns_backend' || mode === 'all') {
  server.listen({ udp: PORT });
}

module.exports = { server };