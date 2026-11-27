ARG NODE_BASE=mirror.gcr.io/library/node@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
FROM ${NODE_BASE} AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/globe/package.json packages/globe/package.json
RUN --mount=type=cache,id=ourworld-backend-npm,target=/root/.npm \
    npm ci --workspace @ourworld/api --workspace @ourworld/contracts --prefer-offline --no-audit --no-fund
COPY . .
RUN chmod a+r apps/api/migrations/*.sql && npm run build -w @ourworld/contracts && npm run build -w @ourworld/api
RUN --mount=type=cache,id=ourworld-backend-npm,target=/root/.npm \
    npm prune --omit=dev --workspace @ourworld/api --workspace @ourworld/contracts --prefer-offline --no-audit --no-fund

FROM ${NODE_BASE} AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages/contracts ./packages/contracts
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
