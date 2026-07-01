# ODiN DNS & Domain Registry Engine

ODiN is a decentralized DNS and domain registry system built on top of Cloudflare Workers and P2P networking.

## Features

- **Decentralized DNS**: Built-in DNS server with P2P mesh networking
- **Domain Registration**: Register custom domains within the ODiN network
- **Cloudflare Workers Support**: Deploy registry and welcome sites as Cloudflare Workers
- **Multiple TLDs**: Support for custom top-level domains
- **API Access**: RESTful API for domain management

## Architecture

ODiN consists of three main components:

1. **DNS Backend** (`--mode=dns_backend`): Handles DNS queries and P2P mesh networking
2. **Registry Website** (`--mode=website_registry`): Domain registration and management interface
3. **Welcome Website** (`--mode=website_welcome`): User onboarding and information portal

## Installation

```bash
git clone <repository-url>
cd odin
npm install
```

## Usage

### Running in Different Modes

ODiN supports three operational modes via the `--mode` flag:

```bash
# Start DNS backend only
npm run start:dns

# Start registry website only  
npm run start:registry

# Start welcome website only
npm run start:web

# Start all services
npm run start:all
```

### Cloudflare Worker Deployment

ODiN includes Cloudflare Workers for both the registry and welcome sites:

```bash
# Deploy registry worker
npm run deploy:registry

# Deploy welcome worker
npm run deploy:web

# Develop registry worker locally
npm run dev:registry

# Develop welcome worker locally
npm run dev:web
```

### Environment Variables

- `DNS_PORT`: Port for DNS server (default: 3001)
- `HTTP_PORT`: Port for web server (default: 3002) 
- `REGISTRY_PORT`: Port for registry server (default: 3003)
- `PEER_HOST`: Public hostname for P2P registration
- `PEER_REGISTER_URL`: URL to register P2P node
- `ORIGIN_DNS`: Origin DNS server address
- `UPSTREAM_DNS`: Upstream DNS server (default: 8.8.8.8)

## Registry Service

The registry service allows users to register domains within the ODiN network. It's available both as a local server and as a Cloudflare Worker.

When deployed as a Cloudflare Worker, the registry can be accessed at `registry.odin` (when properly configured with DNS).

## Development

The project follows a single-entry architecture with multiple operational modes, as specified in the project requirements. All services share the same codebase and are controlled via the `--mode` parameter.

To contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT