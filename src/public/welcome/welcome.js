document.addEventListener('DOMContentLoaded', async () => {
  const originEl = document.getElementById('origin-dns');
  const nearestEl = document.getElementById('nearest-dns');
  const statusText = document.getElementById('status-text');
  const statusDot = document.querySelector('.status-dot');
  const registerUrlEl = document.getElementById('register-url');

  registerUrlEl.textContent = `${window.location.origin}/api/peers/register`;

  nearestEl.textContent = 'discovering…';
  statusText.textContent = 'Finding nearest peer…';

  try {
    const [configRes, nearestRes] = await Promise.all([
      fetch('/api/config'),
      fetch('/api/nearest-peer'),
    ]);

    const config = await configRes.json();
    originEl.textContent = config.originDns || '—';

    const data = await nearestRes.json();
    if (data.endpoint) {
      nearestEl.textContent = data.endpoint;
      statusText.textContent = `Connected · ${data.peerCount ?? 1} peer${(data.peerCount ?? 1) === 1 ? '' : 's'} online`;
      statusDot.classList.add('online');
    } else {
      nearestEl.textContent = 'no peers';
      statusText.textContent = 'No peers on the network yet';
    }
  } catch {
    originEl.textContent = 'unavailable';
    nearestEl.textContent = 'unavailable';
    statusText.textContent = 'Network unreachable';
  }
});
