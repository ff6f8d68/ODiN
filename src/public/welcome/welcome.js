document.addEventListener('DOMContentLoaded', async () => {
  const originEl = document.getElementById('origin-dns');
  const nearestEl = document.getElementById('nearest-dns');
  const statusText = document.getElementById('status-text');
  const statusDot = document.querySelector('.status-dot');
  const registerUrlEl = document.getElementById('register-url');

  registerUrlEl.textContent = `${window.location.origin}/api/peers/register`;
  originEl.textContent = originEl.dataset.origin || '—';

  nearestEl.textContent = 'discovering…';
  statusText.textContent = 'Finding nearest peer…';

  try {
    const res = await fetch('/api/nearest-peer');
    const data = await res.json();

    if (data.endpoint) {
      nearestEl.textContent = data.endpoint;
      statusText.textContent = `Connected · ${data.peerCount ?? 1} peer${(data.peerCount ?? 1) === 1 ? '' : 's'} online`;
      statusDot.classList.add('online');
    } else {
      nearestEl.textContent = 'no peers';
      statusText.textContent = 'No peers on the network yet';
    }
  } catch {
    nearestEl.textContent = 'unavailable';
    statusText.textContent = 'Network unreachable';
  }
});
