import { handleTelegramWebhook, type TelegramUpdate } from "../../server/telegramBot.js";
import {
  getSafeTelegramUpdateLog,
  getTelegramWebhookAuthorization,
  type RequestHeaders,
} from "../../server/requestSecurity.js";

declare const process: {
  env: Record<string, string | undefined>;
};

type ApiRequest = {
  method?: string;
  headers?: RequestHeaders;
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

function logInfo(message: string, details: Record<string, unknown>): void {
  console.log(`[telegram:webhook] ${message}`, details);
}

function logError(message: string, details: Record<string, unknown>): void {
  console.error(`[telegram:webhook] ${message}`, details);
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const method = (req.method ?? "GET").toUpperCase();

  try {
    if (method === "GET") {
      logInfo("Request completed", { method, status: 200 });
      sendText(res, 200, ALIVE_REPLY);
      return;
    }

    if (method !== "POST") {
      sendJson(res, 405, { ok: false, error: "Method not allowed" });
      return;
    }

    const authorization = getTelegramWebhookAuthorization(
      req.headers,
      process.env.TELEGRAM_WEBHOOK_SECRET,
    );
    if (authorization === "server_misconfigured") {
      logError("Request rejected", { method, status: 503 });
      sendJson(res, 503, { ok: false, error: "Webhook unavailable" });
      return;
    }
    if (authorization !== "authorized") {
      logInfo("Request rejected", { method, status: 401 });
      sendJson(res, 401, { ok: false, error: "Unauthorized webhook request" });
      return;
    }

    const update = parseUpdate(req.body);
    const safeUpdateLog = getSafeTelegramUpdateLog(update);
    logInfo("Update received", safeUpdateLog);

    if (!update.message && !update.callback_query && !update.pre_checkout_query) {
      logInfo("Request completed", {
        method,
        status: 200,
        eventType: safeUpdateLog.eventType,
        handled: false,
      });
      sendJson(res, 200, { ok: true, handled: false });
      return;
    }

    await handleTelegramWebhook(update);
    logInfo("Request completed", {
      method,
      status: 200,
      eventType: safeUpdateLog.eventType,
      handled: true,
    });
    sendJson(res, 200, {
      ok: true,
      handled: true,
      command: getCommand(update.message?.text) ?? undefined,
    });
  } catch {
    logError("Request failed", { method, status: 500 });
    sendJson(res, 500, { ok: false, error: "Webhook processing failed" });
  }
}
