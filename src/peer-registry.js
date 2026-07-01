const fs = require('fs');
const path = require('path');

const PEERS_FILE = path.join(__dirname, 'peers.json');
const PEER_TTL_MS = 3600 * 1000;

function load() {
  if (!fs.existsSync(PEERS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(PEERS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(peers) {
  fs.writeFileSync(PEERS_FILE, JSON.stringify(peers, null, 2));
}

function registerPeer({ host, port = 53, colo, lat, lon, id }) {
  if (!host) return null;
  const peers = load();
  const peerId = id || host.replace(/[^a-z0-9]/gi, '-');
  peers[peerId] = {
    host,
    port,
    colo: colo || undefined,
    lat: lat != null ? lat : undefined,
    lon: lon != null ? lon : undefined,
    lastSeen: Date.now(),
  };
  save(peers);
  return peerId;
}

function listActivePeers() {
  const now = Date.now();
  return Object.values(load()).filter((p) => p.host && now - p.lastSeen < PEER_TTL_MS);
}

module.exports = { registerPeer, listActivePeers };
