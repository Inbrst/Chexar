import { isCronAuthorized, sendDailyReminders } from "../../server/telegramBot.js";

type ApiRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => {
    json: (body: unknown) => void;
  };
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method && req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!isCronAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized cron request" });
    return;
  }

  try {
    const result = await sendDailyReminders();
    console.log("[telegram:cron] Request completed", {
      method: (req.method ?? "GET").toUpperCase(),
      status: 200,
      sent: result.sent,
      skipped: result.skipped,
    });
    res.status(200).json({ ok: true, ...result });
  } catch {
    console.error("[telegram:cron] Request failed", {
      method: (req.method ?? "GET").toUpperCase(),
      status: 500,
    });
    res.status(500).json({ error: "Reminder request failed" });
  }
}
