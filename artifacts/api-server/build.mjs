import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { rm, cp } from "node:fs/promises";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const distDir = path.join(artifactDir, "dist");

try {
  await rm(distDir, { recursive: true, force: true });
  await build({
    entryPoints: ["src/index.ts", "src/server-cloudrun.ts"].map(p => path.join(artifactDir, p)),
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    sourcemap: "linked",
    logLevel: "info",
    // Keep npm packages in their pnpm dependency trees. Partially bundling SDKs
    // relocates their transitive imports and breaks runtime resolution/workers.
    packages: "external",
    plugins: [{
      name: "bundle-workspace-source",
      setup(builder) {
        builder.onResolve({filter: /^@workspace\//}, args => ({
          path: require.resolve(args.path, {paths: [artifactDir]}),
        }));
      },
    }],
  });
  await cp(path.join(artifactDir, "src/seats"), path.join(distDir, "seats"), {recursive: true});
} catch (error) {
  console.error(error);
  process.exit(1);
}
