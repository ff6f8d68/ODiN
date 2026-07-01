const os = require('os');
const dnsServer = require('./dns-server');
const webServer = require('./web-server');

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const LOCAL_IP = getLocalIp();
const DNS_PORT = parseInt(process.env.DNS_PORT || '53', 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '80', 10);

console.log('=============================================');
console.log('      ODiN DNS & Domain Registry Server     ');
console.log('=============================================');

try {
  const dnsInstance = dnsServer.start(DNS_PORT);
  const webInstance = webServer.start(HTTP_PORT, LOCAL_IP);

  const shutdown = () => {
    console.log('\n[System] Shutting down ODiN services...');
    webInstance.close(() => console.log('[System] HTTP Web Server stopped.'));
    console.log('[System] DNS Server stopped.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (err) {
  console.error('[System] Error starting ODiN engine:', err);
  process.exit(1);
}
