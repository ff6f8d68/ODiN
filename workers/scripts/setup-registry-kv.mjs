import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

async function setupRegistryKV() {
  console.log('Setting up KV namespace for ODiN Registry...');

  try {
    // Create the KV namespace
    console.log('Creating KV namespace...');
    const createResult = execSync('wrangler kv:namespace create "ODiN Registry Database" --env production', { encoding: 'utf-8' });
    console.log('KV namespace creation result:', createResult);

    // Update wrangler.toml with the new namespace ID
    const wranglerTomlPath = path.join(process.cwd(), 'workers/registry/wrangler.toml');
    let wranglerToml = fs.readFileSync(wranglerTomlPath, 'utf-8');
    
    // Extract namespace ID from the result (this is simplified - actual parsing would be more complex)
    // In practice, you'd need to parse the actual output of the wrangler command
    console.log('Please note: You will need to manually update the wrangler.toml file with the KV namespace IDs.');
    console.log('Look for the output from wrangler and copy the ID and preview_id to the wrangler.toml file.');

    console.log('\nDeployment steps:');
    console.log('1. Run: npm run setup:registry-kv');
    console.log('2. Copy the KV namespace IDs to workers/registry/wrangler.toml');
    console.log('3. Deploy the worker: npm run deploy:registry');
    console.log('4. Configure your DNS to point registry.odin to your deployed worker');
    
  } catch (error) {
    console.error('Error setting up KV namespace:', error.message);
    console.log('\nMake sure you have Wrangler installed and are logged in with: wrangler login');
  }
}

setupRegistryKV();