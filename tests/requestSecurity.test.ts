import {
  getCronAuthorization,
  getSafeTelegramUpdateLog,
  getTelegramWebhookAuthorization,
} from "../server/requestSecurity.js";
import { isCronAuthorized } from "../server/telegramBot.js";
import telegramWebhookHandler from "../api/telegram/webhook.js";

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

function assert(condition: boolean, label: string): void {
  if (!condition) {
    throw new Error(label);
  }

  console.log(`ok - ${label}`);
}

const webhookSecret = "telegram-webhook-secret";

assert(
  getTelegramWebhookAuthorization(
    { "x-telegram-bot-api-secret-token": webhookSecret },
    webhookSecret,
  ) === "authorized",
  "webhook accepts a valid secret",
);
assert(
  getTelegramWebhookAuthorization({}, webhookSecret) === "unauthorized",
  "webhook rejects a missing request secret",
);
assert(
  getTelegramWebhookAuthorization(
    { "X-Telegram-Bot-Api-Secret-Token": "wrong-secret" },
    webhookSecret,
  ) === "unauthorized",
  "webhook rejects an invalid request secret",
);
assert(
  getTelegramWebhookAuthorization(
    { "x-telegram-bot-api-secret-token": webhookSecret },
    undefined,
  ) === "server_misconfigured",
  "webhook fails closed when the server secret is missing",
);

const cronSecret = "cron-secret";

assert(
  getCronAuthorization({ authorization: `Bearer ${cronSecret}` }, cronSecret) === "authorized",
  "cron accepts a valid bearer token",
);
assert(
  getCronAuthorization({}, cronSecret) === "unauthorized",
  "cron rejects a missing bearer token",
);
assert(
  getCronAuthorization({ Authorization: "Bearer wrong-secret" }, cronSecret) === "unauthorized",
  "cron rejects an invalid bearer token",
);
assert(
  getCronAuthorization({ authorization: `Bearer ${cronSecret}` }, undefined) === "server_misconfigured",
  "cron fails closed when CRON_SECRET is missing",
);

const previousCronSecret = process.env.CRON_SECRET;
process.env.CRON_SECRET = cronSecret;
assert(
  isCronAuthorized({ headers: { authorization: `Bearer ${cronSecret}` } }),
  "cron endpoint wiring accepts a valid bearer token",
);
assert(
  !isCronAuthorized({ headers: {} }),
  "cron endpoint wiring rejects a missing bearer token",
);
assert(
  !isCronAuthorized({ headers: { authorization: "Bearer wrong-secret" } }),
  "cron endpoint wiring rejects an invalid bearer token",
);
delete process.env.CRON_SECRET;
assert(
  !isCronAuthorized({ headers: { authorization: `Bearer ${cronSecret}` } }),
  "cron endpoint wiring fails closed when CRON_SECRET is missing",
);
if (previousCronSecret !== undefined) {
  process.env.CRON_SECRET = previousCronSecret;
}

const sensitiveUpdate = {
  message: {
    text: "private message text",
    successful_payment: {
      invoice_payload: "private invoice payload",
      telegram_payment_charge_id: "private payment charge",
    },
  },
  callback_query: {
    data: "private callback payload",
  },
};
const safeLog = getSafeTelegramUpdateLog(sensitiveUpdate);
const serializedSafeLog = JSON.stringify(safeLog);

assert(safeLog.eventType === "successful_payment", "redaction helper keeps only the update event type");
assert(!serializedSafeLog.includes("private message text"), "redaction helper removes message text");
assert(!serializedSafeLog.includes("private callback payload"), "redaction helper removes callback payload");
assert(!serializedSafeLog.includes("private invoice payload"), "redaction helper removes invoice payload");
assert(!serializedSafeLog.includes("private payment charge"), "redaction helper removes payment charge IDs");

function createWebhookResponse() {
  const result: { status: number | null; body: unknown } = {
    status: null,
    body: null,
  };

  return {
    result,
    response: {
      setHeader: () => undefined,
      status: (status: number) => {
        result.status = status;
        return {
          json: (body: unknown) => {
            result.body = body;
          },
          send: (body: unknown) => {
            result.body = body;
          },
          end: (body?: unknown) => {
            result.body = body;
          },
        };
      },
    },
  };
}

async function verifyWebhookBoundary(): Promise<void> {
  const previousSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  try {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const missingServerSecret = createWebhookResponse();
    await telegramWebhookHandler(
      { method: "POST", headers: {}, body: {} },
      missingServerSecret.response,
    );
    assert(missingServerSecret.result.status === 503, "webhook handler returns 503 when server secret is missing");

    process.env.TELEGRAM_WEBHOOK_SECRET = webhookSecret;
    const invalidRequestSecret = createWebhookResponse();
    await telegramWebhookHandler(
      {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": "wrong-secret" },
        body: {},
      },
      invalidRequestSecret.response,
    );
    assert(invalidRequestSecret.result.status === 401, "webhook handler returns 401 for an invalid request secret");

    const validRequestSecret = createWebhookResponse();
    await telegramWebhookHandler(
      {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": webhookSecret },
        body: {},
      },
      validRequestSecret.response,
    );
    assert(validRequestSecret.result.status === 200, "webhook handler accepts a valid request secret");
    assert(
      JSON.stringify(validRequestSecret.result.body).includes("\"handled\":false"),
      "webhook handler preserves the existing empty-update response",
    );
  } finally {
    if (previousSecret === undefined) {
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
    } else {
      process.env.TELEGRAM_WEBHOOK_SECRET = previousSecret;
    }
  }
}

void verifyWebhookBoundary().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
