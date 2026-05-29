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
const CHEXAR_APP_URL = "https://chexar.vercel.app";
const START_REPLY = "Chexar connected ✅";
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

function readTelegramBotToken(): string | undefined {
  const exactToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (exactToken) {
    return exactToken;
  }

  const fallbackKey = Object.keys(process.env).find((key) => key.trim().toUpperCase() === "TELEGRAM_BOT_TOKEN");
  const fallbackToken = fallbackKey ? process.env[fallbackKey]?.trim() : undefined;
  if (fallbackToken) {
    logInfo("Using fallback TELEGRAM_BOT_TOKEN env key", { fallbackKey });
    return fallbackToken;
  }

  return undefined;
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

function getCommand(text: string | undefined): string | null {
  const firstToken = text?.trim().split(/\s+/, 1)[0] ?? "";
  if (!firstToken.startsWith("/")) {
    return null;
  }

  return firstToken.slice(1).split("@", 1)[0]?.toLowerCase() ?? null;
}

function openChexarKeyboard(): Record<string, unknown> {
  return {
    inline_keyboard: [
      [
        {
          text: "Open Chexar",
          url: CHEXAR_APP_URL,
        },
      ],
    ],
  };
}

async function sendTelegramMessage(token: string, chatId: number | string, text: string, replyMarkup?: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
  const responseText = await response.text().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to read Telegram response body: ${message}`;
  });

  logInfo("Telegram API response", {
    method: "sendMessage",
    status: response.status,
    ok: response.ok,
    body: responseText.slice(0, 1200),
  });

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed with status ${response.status}: ${responseText.slice(0, 300)}`);
  }
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

    const token = readTelegramBotToken();
    if (!token) {
      logError("Missing TELEGRAM_BOT_TOKEN", envDiagnostics);
      sendJson(res, 500, { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" });
      return;
    }

    const update = parseUpdate(req.body);
    const message = update.message;
    const chatId = message?.chat?.id;
    const text = message?.text;
    const command = getCommand(message?.text);

    logInfo("Incoming update", update);
    logInfo("Parsed message", {
      chatId,
      text,
      command,
      hasToken: Boolean(token),
    });

    if (command === "start") {
      if (chatId === undefined || chatId === null) {
        logError("Missing chat id for /start", update);
        sendJson(res, 200, { ok: true, handled: false, reason: "Missing chat id" });
        return;
      }

      await sendTelegramMessage(token, chatId, START_REPLY, openChexarKeyboard());
      sendJson(res, 200, { ok: true, handled: true, command: "start" });
      return;
    }

    sendJson(res, 200, { ok: true, handled: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram webhook failed";
    logError("Unhandled webhook error", {
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    sendJson(res, 500, { ok: false, error: message });
  }
}
