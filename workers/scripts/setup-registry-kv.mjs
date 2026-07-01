#!/usr/bin/env node
/**
 * Creates a Cloudflare KV namespace for the registry worker and updates wrangler.toml.
 * Requires: wrangler CLI authenticated (wrangler login).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wranglerPath = path.join(__dirname, '../registry/wrangler.toml');

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }).trim();
}

function extractId(output) {
  const match = output.match(/id\s*=\s*"([^"]+)"/);
  if (!match) throw new Error(`Could not parse KV namespace id from:\n${output}`);
  return match[1];
}

let toml = fs.readFileSync(wranglerPath, 'utf8');

if (!toml.includes('REPLACE_WITH_KV')) {
  console.log('KV namespace already configured in wrangler.toml');
  process.exit(0);
}

console.log('Creating production KV namespace ODIN_DB...');
const prodOut = run('npx wrangler kv namespace create ODIN_DB');
const prodId = extractId(prodOut);

console.log('Creating preview KV namespace ODIN_DB...');
const previewOut = run('npx wrangler kv namespace create ODIN_DB --preview');
const previewId = extractId(previewOut);

toml = toml
  .replace('REPLACE_WITH_KV_NAMESPACE_ID', prodId)
  .replace('REPLACE_WITH_KV_PREVIEW_ID', previewId);

fs.writeFileSync(wranglerPath, toml);
console.log(`Updated ${wranglerPath}`);
console.log(`  production id: ${prodId}`);
console.log(`  preview id:    ${previewId}`);
