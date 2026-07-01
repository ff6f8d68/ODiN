# ODiN Registry Deployment Guide

## Deploying the Registry Worker to Cloudflare

To deploy the ODiN registry as a Cloudflare Worker accessible at `registry.odin`, follow these steps:

### Prerequisites
- Install Wrangler CLI: `npm install -g wrangler`
- Log in to Cloudflare: `wrangler login`

### Step 1: Set up the KV Namespace
The registry worker uses Cloudflare KV for persistent storage.

```bash
npm run setup:registry-kv
```

This will create a KV namespace for the registry database. After running this command, you'll need to update the `wrangler.toml` file with the generated namespace IDs.

### Step 2: Update wrangler.toml
After running the setup script, update `workers/registry/wrangler.toml` with the actual KV namespace IDs:

```toml
# Replace these placeholder values with actual IDs from the setup script
[[kv_namespaces]]
binding = "ODIN_DB"
id = "YOUR_ACTUAL_KV_NAMESPACE_ID_HERE"
preview_id = "YOUR_ACTUAL_PREVIEW_NAMESPACE_ID_HERE"
```

### Step 3: Deploy the Worker
Deploy the registry worker to Cloudflare:

```bash
npm run deploy:registry
```

### Step 4: Configure DNS for registry.odin
To make the registry accessible at `registry.odin`, you have two options:

#### Option A: Using Cloudflare Pages Custom Domains (Recommended)
1. Go to your Cloudflare dashboard
2. Navigate to the Workers & Pages section
3. Find your `odin-registry` worker
4. Go to the "Triggers" tab
5. Add `registry.odin` as a custom domain
6. Follow Cloudflare's instructions to update your DNS records

#### Option B: Direct DNS Configuration
If you control the DNS for `registry.odin`, point it to your Cloudflare Worker:
1. In your domain registrar, create a CNAME record for `registry.odin` pointing to your worker's subdomain (e.g., `your-worker.your-subdomain.workers.dev`)

### Step 5: Verify Deployment
Once deployed and DNS is propagated, you should be able to access:
- Registry UI: https://registry.odin
- Registry API: https://registry.odin/api/*

## Running Locally for Development
To run the registry locally during development:

```bash
npm run start:registry
```

This will start the registry server on the configured port (default: 3003).

## Testing the Local Registry
When running locally, the registry will be available at:
- UI: http://localhost:3003
- API: http://localhost:3003/api/*

## Development Commands
- `npm run dev:registry` - Run the registry worker in development mode
- `npm run build:registry` - Build the registry worker (dry run)
- `npm run deploy:registry` - Deploy the registry worker to production