# Family dashboard: Vite frontend + Node server. Built for umbrelOS (pulled, never built there).
FROM node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS build
WORKDIR /app
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

FROM node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d
ENV NODE_ENV=production DATA_DIR=/data PORT=8790
WORKDIR /app
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY dashboard/server ./server
# The node image's "node" user is uid 1000, matching the umbrel-owned /data bind mount.
USER 1000:1000
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8790)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "server/index.mjs"]
