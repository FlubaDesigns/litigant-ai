FROM node:22-slim AS builder
RUN npm install -g pnpm@10
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY artifacts/api-server/package.json artifacts/api-server/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/db/package.json lib/db/
RUN pnpm install --frozen-lockfile --filter @workspace/api-server...
COPY artifacts/api-server/ artifacts/api-server/
COPY lib/api-zod/ lib/api-zod/
COPY lib/db/ lib/db/
RUN pnpm --filter @workspace/api-server run build

FROM node:22-slim
WORKDIR /workspace/artifacts/api-server
# Preserve pnpm's package-local links and their root virtual store.
COPY --from=builder /workspace/node_modules /workspace/node_modules
COPY --from=builder /workspace/artifacts/api-server/node_modules ./node_modules
COPY --from=builder /workspace/artifacts/api-server/dist ./dist
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/server-cloudrun.mjs"]
