/**
 * Server-initiated push: deliver a notification to one or more users' devices
 * through the IdP's `POST /rp/notifications`.
 *
 * The RP server authenticates with a `private_key_jwt` client assertion
 * (RFC 7521 §4.2 / RFC 7523): a short-lived, single-use JWS signed with the
 * RP's ES256 key (`lib/signing-key.ts`). The IdP verifies it against the RP's
 * own JWKS (`/.well-known/jwks.json`), so no shared secret is exchanged. The
 * RP's `clientId` is its origin (`RP_ORIGIN`), which must be whitelisted on
 * the IdP.
 */

import { SignJWT } from "jose";

import { getSigningKey } from "../signing-key.ts";
import { getConfig } from "../../config.ts";

const CLIENT_ASSERTION_TYP = "client-assertion+jwt";

/** Notification content — matches the IdP's `pushNotificationContentSchema`. */
export interface PushNotificationContent {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  /** App badge count (Badging API); the IdP forwards it to the device. */
  badgeCount?: number;
  tag?: string;
  requireInteraction?: boolean;
  data?: unknown;
  urgency?: "very-low" | "low" | "normal" | "high";
  ttl?: number;
  topic?: string;
}

export interface SendNotificationInput {
  /** Target users; the IdP fans out to every device of each named user. */
  userIds: string[];
  notification: PushNotificationContent;
}

/** Per-device delivery result, as returned by the IdP. */
export interface SendNotificationResult {
  userId: string;
  subscriptionId: string;
  ok: boolean;
  throttled?: boolean;
  removed?: boolean;
  warnings?: string[];
  error?: string;
}

/** Build a single-use `private_key_jwt` client assertion for the IdP. */
const buildClientAssertion = async (
  fallbackOrigin?: string,
): Promise<string> => {
  const config = getConfig();
  const rpOrigin = config.rpOrigin || fallbackOrigin;
  const { idpOrigin } = config;
  if (!rpOrigin) {
    throw new Error(
      "RP_ORIGIN is not configured — set it to this app's public origin (a clientId whitelisted on the IdP).",
    );
  }
  const { privateKey, kid } = await getSigningKey();
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", typ: CLIENT_ASSERTION_TYP, kid })
    .setIssuer(rpOrigin)
    .setSubject(rpOrigin)
    .setAudience(idpOrigin)
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .setJti(crypto.randomUUID())
    .sign(privateKey);
};

/**
 * Send a notification to the given users via the IdP.
 *
 * `options.origin` is the origin the request reached this app on. It stands in for `RP_ORIGIN`
 * when that is unset, so a deploy needs no config for it: the app's public origin is where the
 * IdP fetches `/.well-known/jwks.json` from anyway. Set `RP_ORIGIN` to pin one origin when the
 * app answers on several (e.g. `*.workers.dev` and a custom domain).
 *
 * @throws when the assertion can't be built or the IdP rejects the request.
 */
export const sendRpNotification = async (
  input: SendNotificationInput,
  options: { origin?: string } = {},
): Promise<SendNotificationResult[]> => {
  const assertion = await buildClientAssertion(options.origin);
  const { idpOrigin } = getConfig();
  const res = await fetch(`${idpOrigin}/rp/notifications`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${assertion}`,
    },
    body: JSON.stringify(input),
  });

  const data = await res.json().catch(() => ({})) as {
    message?: string;
    results?: SendNotificationResult[];
  };
  if (!res.ok) {
    throw new Error(
      data.message ?? `IdP rejected the notification (${res.status})`,
    );
  }
  return data.results ?? [];
};
