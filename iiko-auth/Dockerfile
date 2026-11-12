FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
USER node
ENV PORT=8081
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8081/health || exit 1
CMD ["node", "server.js"]
