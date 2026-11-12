/**
 * Cloudflare deployment config, read by the `cf` CLI (`deno task cf deploy`).
 *
 * Cloudflare serves the static build (`web/dist`) as Workers static assets and runs only the
 * server-only routes in the Worker (`web/server/worker.ts`, bundled to `web/worker-dist/worker.js`
 * by `deno task build:worker`). `deno task build:cf` makes both.
 */

import { bindings, defineConfig } from "cf/config";

export default defineConfig({
  // Not a secret: it is only an identifier, and the API token is what authorizes.
  accountId: "ac92f36f0a2d84353b137574157f7480",
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
    // Only what has no default. `IDP_ORIGIN` defaults to https://id.kbn.one and `RP_ORIGIN` to the
    // origin a request arrives on (`web/server/config.ts`, `lib/push/client.ts`); add them here as
    // `bindings.text(...)` to override.
    env: {
      // [feature:server-send] Required, so a deploy without it fails rather than signing with a per-isolate key. The
      // `cloudflare` workflow generates it on the first deploy (`web/server/cf_secrets.ts`), and
      // the `rp-signing-key` workflow rotates it.
      RP_SIGNING_KEY_JWK: bindings.secret(),
      // [feature:turso] TURSO_AUTH_TOKEN is not declared: the `cloudflare` workflow uploads it from
      // the repo secret of the same name when that is set, and a deploy keeps existing secrets.
      TURSO_DATABASE_URL: bindings.text(
        "libsql://deno-remix-reference-kuboon.aws-ap-northeast-1.turso.io",
      ),
    },
  },
});
