const dns2 = require('dns2');
const db = require('./db');
const { Packet } = dns2;

const UPSTREAM_DNS = process.env.UPSTREAM_DNS || '8.8.8.8';
const RESOLVE_IP = process.env.RESOLVE_IP || '127.0.0.1';

const TYPE_MAP = {
  1: 'A',
  2: 'NS',
  5: 'CNAME',
  6: 'SOA',
  12: 'PTR',
  15: 'MX',
  16: 'TXT',
  28: 'AAAA',
  33: 'SRV'
};

function getTypeString(typeNumber) {
  if (TYPE_MAP[typeNumber]) return TYPE_MAP[typeNumber];
  for (const [key, value] of Object.entries(Packet.TYPE || {})) {
    if (value === typeNumber) return key;
  }
  return 'A';
}

const upstreamResolver = new dns2({
  nameServers: [UPSTREAM_DNS]
});

async function handleDnsQuery(request, send, rinfo) {
  const response = Packet.createResponseFromRequest(request);
  const [question] = request.questions;

  if (!question) {
    send(response);
    return;
  }

  const domainName = question.name;
  const cleanDomain = domainName.toLowerCase().replace(/\.$/, '');
  const record = db.getDomain(cleanDomain);

  console.log(`[DNS] Query: ${cleanDomain} (Type: ${getTypeString(question.type)})`);

  if (record) {
    if (question.type === Packet.TYPE.A) {
      const targetIp = record.dnsType === 'local' ? RESOLVE_IP : record.ip;
      console.log(`[DNS] Local match: ${cleanDomain} -> A record -> ${targetIp}`);
      response.answers.push({
        name: domainName,
        type: Packet.TYPE.A,
        class: Packet.CLASS.IN,
        ttl: 300,
        address: targetIp
      });
    } else {
      console.log(`[DNS] Local match: ${cleanDomain} -> Type ${getTypeString(question.type)} requested`);
      if (record.records) {
        for (const r of record.records) {
          if (r.type === getTypeString(question.type)) {
            const typeNum = Packet.TYPE[r.type] || question.type;
            const answer = {
              name: domainName,
              type: typeNum,
              class: Packet.CLASS.IN,
              ttl: r.ttl || 300
            };
            if (r.type === 'A') answer.address = r.value;
            else if (r.type === 'AAAA') answer.address = r.value;
            else answer.data = r.value;
            response.answers.push(answer);
          }
        }
      }
    }
    send(response);
  } else {
    const parts = cleanDomain.split('.');
    const tld = parts.length > 1 ? parts[parts.length - 1] : null;

    if (tld && db.getTld(tld)) {
      console.log(`[DNS] TLD .${tld} is in ODiN network, domain not registered: NXDOMAIN`);
      response.header.rcode = Packet.RCODE.NXDOMAIN;
      send(response);
      return;
    }

    try {
      const typeStr = getTypeString(question.type);
      console.log(`[DNS] Forwarding upstream: ${cleanDomain} (Type: ${typeStr})`);

      const upstreamResponse = await upstreamResolver.resolve(cleanDomain, typeStr);

      if (upstreamResponse && upstreamResponse.answers) {
        response.answers.push(...upstreamResponse.answers);
      }
      if (upstreamResponse && upstreamResponse.authorities) {
        response.authorities.push(...upstreamResponse.authorities);
      }
      if (upstreamResponse && upstreamResponse.additionals) {
        response.additionals.push(...upstreamResponse.additionals);
      }

      send(response);
    } catch (err) {
      console.error(`[DNS] Upstream resolution failed for ${cleanDomain}:`, err.message);
      response.header.rcode = Packet.RCODE.NXDOMAIN;
      send(response);
    }
  }
}

function start(port = 53) {
  const server = dns2.createServer({
    udp: true,
    handle: handleDnsQuery
  });

  server.on('error', (err) => {
    console.error('[DNS] Server Error:', err);
  });

  server.on('listening', () => {
    console.log(`[DNS] Server listening on port ${port} (UDP)`);
    console.log(`[DNS] Upstream DNS configured: ${UPSTREAM_DNS}`);
    console.log(`[DNS] Default resolving IP: ${RESOLVE_IP}`);
  });

  server.listen({ udp: port });
  return server;
}

module.exports = { start };
