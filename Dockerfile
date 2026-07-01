# Use lightweight Alpine-based Node.js image
FROM node:20-alpine

# Set production environment
ENV NODE_ENV=production

# Set up working directory
WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies (production only, clean install)
RUN npm ci --only=production

# Copy application source files
COPY src/ ./src/

# Default port configuration
ENV DNS_PORT=53
ENV HTTP_PORT=80
ENV UPSTREAM_DNS=8.8.8.8
ENV RESOLVE_IP=127.0.0.1

# Expose DNS (UDP) and Web server (TCP)
EXPOSE 53/udp
EXPOSE 80/tcp

# Run the server
CMD [ "npm", "start" ]
