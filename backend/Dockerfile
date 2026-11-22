FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DATA_FILE=/data/db.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
# Persistent storage lives in a volume so data survives container restarts.
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1
CMD ["node", "src/server.js"]
