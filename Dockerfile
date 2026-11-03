FROM node:24-bookworm-slim AS source
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/globe/package.json packages/globe/package.json
RUN npm ci --no-audit --no-fund
COPY . .

FROM source AS api-build
RUN npm run build -w @ourworld/contracts && npm run build -w @ourworld/api
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/package.json ./package.json
COPY --from=api-build /app/apps/api ./apps/api
COPY --from=api-build /app/packages/contracts ./packages/contracts
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]

FROM source AS web-build
RUN node scripts/generate-openapi.mjs && npm run build -w @ourworld/contracts && npm run build -w @ourworld/globe && node scripts/sync-globe.mjs --web-only && npm run build -w @ourworld/web

FROM nginx:1.28-alpine AS web
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
