import { handleTelegramWebhook, type TelegramUpdate } from "../../server/telegramBot.js";

declare const process: {
  env: Record<string, string | undefined>;
};

type ApiRequest = {
  method?: string;
  body?: unknown;
};

type JsonResponder = {
  json?: (body: unknown) => void;
  send?: (body: unknown) => void;
  end?: (body?: unknown) => void;
};

type ApiResponse = {
  setHeader?: (name: string, value: string) => void;
  status: (code: number) => JsonResponder;
};

const ALIVE_REPLY = "Telegram webhook alive";

function safeLogPayload(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function logInfo(message: string, details?: unknown): void {
  if (details === undefined) {
    console.log(`[telegram:webhook] ${message}`);
    return;
  }

  console.log(`[telegram:webhook] ${message}`, safeLogPayload(details));
}

function logError(message: string, details?: unknown): void {
  if (details === undefined) {
    console.error(`[telegram:webhook] ${message}`);
    return;
  }

  console.error(`[telegram:webhook] ${message}`, safeLogPayload(details));
}

function getTelegramEnvDiagnostics(): Record<string, unknown> {
  const env = process.env ?? {};
  const telegramEnvKeys = Object.keys(env)
    .filter((key) => key.toUpperCase().includes("TELEGRAM"))
    .sort();

  return {
    telegramEnvKeys,
    hasExactTelegramBotToken: Boolean(env.TELEGRAM_BOT_TOKEN),
    vercelEnv: env.VERCEL_ENV ?? null,
    nodeEnv: env.NODE_ENV ?? null,
  };
}

function sendJson(res: ApiResponse, statusCode: number, body: Record<string, unknown>): void {
  res.setHeader?.("Content-Type", "application/json; charset=utf-8");

  const responder = res.status(statusCode);
  if (typeof responder.json === "function") {
    responder.json(body);
    return;
  }

  const payload = JSON.stringify(body);
  if (typeof responder.send === "function") {
    responder.send(payload);
    return;
  }

  responder.end?.(payload);
}

function sendText(res: ApiResponse, statusCode: number, body: string): void {
  res.setHeader?.("Content-Type", "text/plain; charset=utf-8");

  const responder = res.status(statusCode);
  if (typeof responder.send === "function") {
    responder.send(body);
    return;
  }

  responder.end?.(body);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function parseUpdate(body: unknown): TelegramUpdate {
  if (typeof body === "string") {
    return asRecord(safeJsonParse(body)) as TelegramUpdate;
  }

  if (ArrayBuffer.isView(body)) {
    const text = new TextDecoder().decode(body);
    return asRecord(safeJsonParse(text)) as TelegramUpdate;
  }

  return asRecord(body) as TelegramUpdate;
}

function getCommand(text: unknown): string | null {
  if (typeof text !== "string") {
    return null;
  }

  const firstToken = text?.trim().split(/\s+/, 1)[0] ?? "";
  if (!firstToken.startsWith("/")) {
    return null;
  }

  return firstToken.slice(1).split("@", 1)[0]?.toLowerCase() ?? null;
}

function getParsedUpdateInfo(update: TelegramUpdate): Record<string, unknown> {
  const message = update.message;
  const callback = update.callback_query;
  const preCheckout = update.pre_checkout_query;
  const chatId = message?.chat?.id ?? callback?.message?.chat?.id ?? null;
  const text = message?.text ?? null;

  return {
    chatId,
    text,
    command: getCommand(text),
    hasCallback: Boolean(callback),
    callbackData: callback?.data ?? null,
    hasPreCheckout: Boolean(preCheckout),
    preCheckoutPayload: preCheckout?.invoice_payload ?? null,
    hasSuccessfulPayment: Boolean(message?.successful_payment),
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const method = (req.method ?? "GET").toUpperCase();

    if (method === "GET") {
      logInfo("GET alive check");
      logInfo("Telegram env diagnostics", getTelegramEnvDiagnostics());
      sendText(res, 200, ALIVE_REPLY);
      return;
    }

    if (method !== "POST") {
      sendJson(res, 405, { ok: false, error: "Method not allowed" });
      return;
    }

    const envDiagnostics = getTelegramEnvDiagnostics();
    logInfo("Telegram env diagnostics", envDiagnostics);

    const update = parseUpdate(req.body);
    logInfo("Incoming update", update);
    const parsed = getParsedUpdateInfo(update);
    logInfo("Parsed update", parsed);

    if (!update.message && !update.callback_query && !update.pre_checkout_query) {
      sendJson(res, 200, { ok: true, handled: false });
      return;
    }

    await handleTelegramWebhook(update);
    sendJson(res, 200, { ok: true, handled: true, command: parsed.command ?? undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram webhook failed";
    logError("Unhandled webhook error", {
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    sendJson(res, 500, { ok: false, error: message });
  }
}
