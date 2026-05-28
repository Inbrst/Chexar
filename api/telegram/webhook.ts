declare const process: {
  env: Record<string, string | undefined>;
};

type TelegramChat = {
  id?: number | string;
};

type TelegramMessage = {
  chat?: TelegramChat;
  text?: string;
};

type TelegramUpdate = {
  message?: TelegramMessage;
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

const TELEGRAM_API_BASE = "https://api.telegram.org";
const START_REPLY = "Chexar bot connected";
const ALIVE_REPLY = "Telegram webhook alive";

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

function getCommand(text: string | undefined): string | null {
  const firstToken = text?.trim().split(/\s+/, 1)[0] ?? "";
  if (!firstToken.startsWith("/")) {
    return null;
  }

  return firstToken.slice(1).split("@", 1)[0]?.toLowerCase() ?? null;
}

async function sendTelegramMessage(token: string, chatId: number | string, text: string): Promise<void> {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed with status ${response.status}`);
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const method = (req.method ?? "GET").toUpperCase();

    if (method === "GET") {
      sendText(res, 200, ALIVE_REPLY);
      return;
    }

    if (method !== "POST") {
      sendJson(res, 405, { ok: false, error: "Method not allowed" });
      return;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      sendJson(res, 500, { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" });
      return;
    }

    const update = parseUpdate(req.body);
    const message = update.message;
    const chatId = message?.chat?.id;
    const command = getCommand(message?.text);

    if (command === "start") {
      if (chatId === undefined || chatId === null) {
        sendJson(res, 200, { ok: true, handled: false, reason: "Missing chat id" });
        return;
      }

      await sendTelegramMessage(token, chatId, START_REPLY);
      sendJson(res, 200, { ok: true, handled: true, command: "start" });
      return;
    }

    sendJson(res, 200, { ok: true, handled: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram webhook failed";
    sendJson(res, 500, { ok: false, error: message });
  }
}
