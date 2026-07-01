#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wranglerPath = path.join(__dirname, '../welcome/wrangler.toml');

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }).trim();
}

function extractId(output) {
  const match = output.match(/id\s*=\s*"([^"]+)"/) || output.match(/"id":\s*"([^"]+)"/);
  if (!match) throw new Error(`Could not parse KV namespace id from:\n${output}`);
  return match[1];
}

function findNamespaceId(title) {
  const list = run('npx wrangler kv namespace list');
  const namespaces = JSON.parse(list);
  return namespaces.find((ns) => ns.title === title)?.id;
}

function createOrFind(title, preview = false) {
  const existing = findNamespaceId(title);
  if (existing) {
    console.log(`Using existing namespace "${title}": ${existing}`);
    return existing;
  }

  const flag = preview ? ' --preview' : '';
  console.log(`Creating ${preview ? 'preview ' : ''}KV namespace ${title}...`);
  const out = run(`npx wrangler kv namespace create ODIN_PEERS${flag}`);
  return extractId(out);
}

let toml = fs.readFileSync(wranglerPath, 'utf8');

if (!toml.includes('REPLACE_WITH_KV')) {
  console.log('KV namespace already configured in wrangler.toml');
  process.exit(0);
}

const prodId = createOrFind('worker-ODIN_PEERS');
const previewId = createOrFind('worker-ODIN_PEERS_preview', true);

toml = toml
  .replace('REPLACE_WITH_KV_NAMESPACE_ID', prodId)
  .replace('REPLACE_WITH_KV_PREVIEW_ID', previewId);

fs.writeFileSync(wranglerPath, toml);
console.log(`Updated ${wranglerPath}`);
console.log(`  production id: ${prodId}`);
console.log(`  preview id:    ${previewId}`);
