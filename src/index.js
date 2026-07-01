// Parse mode before loading servers so only the selected services start.
const args = process.argv.slice(2);
let mode = process.env.ODIN_MODE || 'all';

for (const arg of args) {
  if (arg.startsWith('--mode=')) {
    mode = arg.split('=')[1];
    break;
  }
}

process.env.ODIN_MODE = mode;

const dns = (mode === 'dns_backend' || mode === 'all') ? require('./dns-server') : null;
const web = (mode === 'website_welcome' || mode === 'all') ? require('./web-server') : null;
const reg = (mode === 'website_registry' || mode === 'all') ? require('./registry-server') : null;
const { startHealthServer } = require('./health-server');
const { resolvePeerConfig } = require('./peer-config');

const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3002', 10);
const REG_PORT = parseInt(process.env.REGISTRY_PORT || '3003', 10);
const DNS_PORT = parseInt(process.env.DNS_PORT || '3001', 10);

console.log('=============================================');
console.log('      ODiN DNS & Domain Registry Server     ');
console.log(`Mode: ${mode}`);
console.log('=============================================');

try {
  if (mode === 'dns_backend') {
    const peerConfig = resolvePeerConfig();
    const healthSrv = startHealthServer(() => ({
      ok: true,
      mode: 'dns_backend',
      dns: { port: DNS_PORT, protocol: 'udp' },
      peer: peerConfig.enabled
        ? { host: peerConfig.host, port: DNS_PORT, registerUrl: peerConfig.registerUrl }
        : null,
    }));

    const shutdown = () => {
      console.log('\n[System] Shutting down DNS backend...');
      healthSrv.close(() => console.log('[HEALTH] Stopped'));
      console.log('[DNS] Stopped');
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } else if (mode === 'website_welcome') {
    web.welcomeServer.listen(HTTP_PORT, () => {
      console.log(`[WELCOME] Welcome website on port ${HTTP_PORT}`);
    });

    const shutdown = () => {
      console.log('\n[System] Shutting down welcome website...');
      web.welcomeServer.close(() => console.log('[WEB] Welcome website stopped'));
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } else if (mode === 'website_registry') {
    reg.server.listen(REG_PORT, () => {
      console.log(`[REGISTRY] Registry website on port ${REG_PORT}`);
    });

    const shutdown = () => {
      console.log('\n[System] Shutting down registry website...');
      reg.server.close(() => console.log('[REG] Registry website stopped'));
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } else {
    const shutdown = () => {
      console.log('\n[System] Shutting down...');
      web.server.close(() => console.log('[WEB] Stopped'));
      reg.server.close(() => console.log('[REG] Stopped'));
      console.log('[DNS] Stopped');
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
} catch (err) {
  console.error('[System] Error:', err);
  process.exit(1);
}
