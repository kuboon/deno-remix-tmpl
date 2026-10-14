/**
 * Cloudflare deployment config, read by the `cf` CLI (`deno task cf deploy`).
 *
 * Cloudflare serves the static build (`web/dist`) as Workers static assets and runs only the
 * server-only routes in the Worker (`web/server/worker.ts`, bundled to `web/worker-dist/worker.js`
 * by `deno task build:worker`). `deno task build:cf` makes both.
 */

import { bindings, defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "deno-remix-tmpl",
    compatibilityDate: "2026-10-01",
    entrypoint: "./web/worker-dist/worker.js",
    assets: {
      htmlHandling: "auto-trailing-slash",
      notFoundHandling: "none",
      // Only these reach the Worker; every other path is a static file.
      runWorkerFirst: ["/api/*", "/.well-known/jwks.json"],
    },
    env: {
      IDP_ORIGIN: bindings.text("https://id.kbn.one"),
      // RP_ORIGIN: bindings.text("https://<your-worker-domain>"),
      // Secrets (`cf workers secrets ...`): RP_SIGNING_KEY_JWK, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
    },
  },
});
