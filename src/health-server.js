const http = require('http');

function startHealthServer(getStatus) {
  const port = parseInt(process.env.PORT || process.env.HTTP_PORT || '3002', 10);

  const server = http.createServer((req, res) => {
    const path = (req.url || '/').split('?')[0];
    if (path === '/' || path === '/health') {
      const status = getStatus ? getStatus() : { ok: true };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[HEALTH] HTTP status on 0.0.0.0:${port}`);
  });

  return server;
}

module.exports = { startHealthServer };
