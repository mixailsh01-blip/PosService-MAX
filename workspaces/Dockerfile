FROM node:24-bookworm-slim
WORKDIR /app
COPY workspaces/package.json workspaces/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY workspaces/*.mjs workspaces/schema.sql ./
COPY workspaces/public ./public
COPY iiko/iiko-cloud-api.collection.json ./data/collection.json
COPY iiko/iiko-cloud-api.environment.json ./data/environment.json
USER node
EXPOSE 8082
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=6 CMD node -e "fetch('http://127.0.0.1:8082/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.mjs"]
