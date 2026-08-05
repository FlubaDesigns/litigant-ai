# ── Stage 1: Build ──────────────────────────────────────────────────────────
# Install all workspace dependencies and run esbuild to produce the bundle.
FROM node:20-slim AS builder

RUN npm install -g pnpm@10

WORKDIR /workspace

# Copy workspace manifests first for better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy only the api-server package.json so pnpm can resolve the filter
COPY artifacts/api-server/package.json artifacts/api-server/

# Install dependencies for api-server and its workspace dependencies
RUN pnpm install --frozen-lockfile --filter @workspace/api-server...

# Copy full api-server source (after deps so source changes don't bust dep cache)
COPY artifacts/api-server/ artifacts/api-server/

# Produce the bundled output (dist/server-cloudrun.mjs + pino worker files)
RUN pnpm --filter @workspace/api-server run build

# ── Stage 2: Runtime ────────────────────────────────────────────────────────
# Minimal runtime image: only the compiled bundle and the packages esbuild
# externalised (firebase-admin, @google-cloud/*, @google/*, etc.).
FROM node:20-slim

WORKDIR /app

# The workspace root node_modules contains all the external runtime packages
# that esbuild did not bundle. Copy them into /app/node_modules so Node's
# standard resolution finds them when the bundle does `require('firebase-admin')`.
COPY --from=builder /workspace/node_modules ./node_modules

# The bundled server output (server-cloudrun.mjs + pino worker files)
COPY --from=builder /workspace/artifacts/api-server/dist ./dist

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "--enable-source-maps", "./dist/server-cloudrun.mjs"]
