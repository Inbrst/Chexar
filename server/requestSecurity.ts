export type RequestHeaderValue = string | string[] | undefined;
export type RequestHeaders = Record<string, RequestHeaderValue> | undefined;
export type RequestAuthorizationResult = "authorized" | "unauthorized" | "server_misconfigured";
export type TelegramUpdateEvent =
  | "message"
  | "successful_payment"
  | "callback_query"
  | "pre_checkout_query"
  | "unknown";

export const TELEGRAM_WEBHOOK_SECRET_HEADER = "x-telegram-bot-api-secret-token";

function normalizeConfiguredSecret(value: string | undefined): string | null {
  const secret = value?.trim();
  return secret ? secret : null;
}

function getSingleHeader(headers: RequestHeaders, name: string): string | null {
  if (!headers) {
    return null;
  }

  const normalizedName = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === normalizedName);
  if (!entry) {
    return null;
  }

  const value = entry[1];
  if (Array.isArray(value)) {
    return value.length === 1 ? value[0] ?? null : null;
  }

  return typeof value === "string" ? value : null;
}

function secretsMatch(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

export function getTelegramWebhookAuthorization(
  headers: RequestHeaders,
  configuredSecret: string | undefined,
): RequestAuthorizationResult {
  const secret = normalizeConfiguredSecret(configuredSecret);
  if (!secret) {
    return "server_misconfigured";
  }

  const providedSecret = getSingleHeader(headers, TELEGRAM_WEBHOOK_SECRET_HEADER);
  return providedSecret && secretsMatch(providedSecret, secret) ? "authorized" : "unauthorized";
}

export function getCronAuthorization(
  headers: RequestHeaders,
  configuredSecret: string | undefined,
): RequestAuthorizationResult {
  const secret = normalizeConfiguredSecret(configuredSecret);
  if (!secret) {
    return "server_misconfigured";
  }

  const authorization = getSingleHeader(headers, "authorization");
  return authorization && secretsMatch(authorization, `Bearer ${secret}`) ? "authorized" : "unauthorized";
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export function getSafeTelegramUpdateLog(update: unknown): { eventType: TelegramUpdateEvent } {
  const record = asRecord(update);
  const message = asRecord(record.message);

  if (Object.keys(asRecord(message.successful_payment)).length > 0) {
    return { eventType: "successful_payment" };
  }

  if (Object.keys(asRecord(record.pre_checkout_query)).length > 0) {
    return { eventType: "pre_checkout_query" };
  }

  if (Object.keys(asRecord(record.callback_query)).length > 0) {
    return { eventType: "callback_query" };
  }

  if (Object.keys(message).length > 0) {
    return { eventType: "message" };
  }

  return { eventType: "unknown" };
}
