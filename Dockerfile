# Lightweight Node.js image
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

ENV DNS_PORT=3001
ENV HTTP_PORT=3002
ENV REGISTRY_PORT=3003
ENV UPSTREAM_DNS=8.8.8.8
ENV RESOLVE_IP=127.0.0.1

EXPOSE 3001/udp
EXPOSE 3002/tcp
EXPOSE 3003/tcp

CMD ["npm", "start"]
