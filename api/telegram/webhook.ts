declare const process: {
  env: Record<string, string | undefined>;
};

import { handleTelegramWebhook, type TelegramUpdate } from "../../server/telegramBot";

type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => {
    json: (body: unknown) => void;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body === "string") {
    try {
      return asRecord(JSON.parse(body));
    } catch {
      return {};
    }
  }

  return asRecord(body);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    res.status(500).json({ error: "TELEGRAM_BOT_TOKEN is not configured" });
    return;
  }

  const update = parseBody(req.body) as TelegramUpdate;

  try {
    await handleTelegramWebhook(update);
    res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to handle Telegram update";
    const status = message.includes("configured") ? 500 : 502;
    res.status(status).json({ error: message });
  }
}
