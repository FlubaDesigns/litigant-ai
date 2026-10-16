// Retired: every API build must use the canonical workspace build and Dockerfile.
console.error("Legacy build retired. Run pnpm --filter @workspace/api-server run build; production uses artifacts/api-server/Dockerfile through Authorization Engine.");
process.exit(1);
