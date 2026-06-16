import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { rm, mkdir } from "node:fs/promises";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(artifactDir, "../../firebase-functions/lib");

async function buildFunctions() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/functions.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: path.resolve(outDir, "functions.mjs"),
    logLevel: "info",
    external: [
      "*.node",
      "firebase-admin",
      "firebase-functions",
      "sharp", "better-sqlite3", "sqlite3", "canvas", "bcrypt", "argon2",
      "fsevents", "re2", "farmhash", "xxhash-addon", "bufferutil",
      "utf-8-validate", "ssh2", "cpu-features", "dtrace-provider",
      "isolated-vm", "lightningcss", "pg-native", "oracledb",
      "mongodb-client-encryption", "nodemailer", "handlebars",
      "knex", "typeorm", "protobufjs", "onnxruntime-node",
      "@tensorflow/*", "@prisma/client", "@mikro-orm/*", "@grpc/*",
      "@swc/*", "@aws-sdk/*", "@azure/*", "@opentelemetry/*",
      "@google-cloud/*", "@google/*", "googleapis", "@parcel/watcher",
      "@sentry/profiling-node", "@tree-sitter/*", "aws-sdk",
      "classic-level", "dd-trace", "ffi-napi", "grpc", "hiredis",
      "kerberos", "leveldown", "miniflare", "mysql2", "newrelic",
      "odbc", "piscina", "realm", "ref-napi", "rocksdb", "sass-embedded",
      "sequelize", "serialport", "snappy", "tinypool", "usb", "workerd",
      "wrangler", "zeromq", "zeromq-prebuilt", "playwright", "puppeteer",
      "puppeteer-core", "electron", "stripe-replit-sync",
      "pino", "pino-http", "pino-pretty", "thread-stream",
    ],
    sourcemap: false,
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
`,
    },
  });
}

buildFunctions().catch((err) => {
  console.error(err);
  process.exit(1);
});
