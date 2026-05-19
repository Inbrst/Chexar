declare const process: {
  env: Record<string, string | undefined>;
};

type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => {
    json: (body: unknown) => void;
    end?: () => void;
  };
};

type TrackingType = "checkbox" | "quantity";
type RepeatMode = "once" | "daily" | "weekdays" | "selected_days";
type Period = "today" | "week" | "month" | "custom";

type ActionDraft = {
  intent: "create_action" | "mark_done" | "add_progress" | "unknown";
  title: string;
  icon: string;
  tracking_type: TrackingType;
  target_value: number | null;
  unit: string | null;
  repeat_mode: RepeatMode;
  period: Period;
  start_date: string | null;
  end_date: string | null;
  due_time: string | null;
  subitems: Array<{ title: string; target?: number | null }>;
  missing_fields: string[];
  clarifying_question?: string;
};

const fallbackEmojiRules: Array<[string[], string]> = [
  [["заряд", "трениров", "спорт", "gym", "workout"], "🏋️"],
  [["прогул", "ходьб", "walk"], "🚶"],
  [["бег", "run"], "🏃"],
  [["немец", "german", "deutsch"], "🇩🇪"],
  [["англий", "english"], "🇬🇧"],
  [["язык", "language"], "🌐"],
  [["чтен", "книг", "book", "read"], "📚"],
  [["вода", "water"], "💧"],
  [["медитац", "meditation"], "🧘"],
  [["магаз", "покуп", "shop", "grocery"], "🛒"],
  [["уборк", "clean"], "🧹"],
  [["сон", "sleep"], "😴"],
  [["работ", "проект", "work", "project"], "💻"],
  [["учеб", "курс", "study", "course"], "🎓"],
];

function inferEmoji(text: string): string {
  const normalized = text.toLocaleLowerCase();
  return fallbackEmojiRules.find(([keys]) => keys.some((key) => normalized.includes(key)))?.[1] ?? "✨";
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthEnd(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

function weekEnd(dateKey: string): string {
  return addDays(dateKey, 6);
}

function normalizeDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function sanitizeTitle(value: string, fallbackText: string): string {
  const cleaned = value
    .replace(/^["'“”«»]+|["'“”«»]+$/g, "")
    .replace(/\b(цель|задача|действие|goal|task|action)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned && cleaned.length > 1) {
    return cleaned.slice(0, 48);
  }

  return inferTitle(fallbackText);
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("No JSON object in AI response");
    }
    return JSON.parse(match[0]);
  }
}

function normalizeDueTime(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeDraft(raw: unknown, fallbackText: string): ActionDraft {
  const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const intent =
    record.intent === "create_action" || record.intent === "mark_done" || record.intent === "add_progress" || record.intent === "unknown"
      ? record.intent
      : "create_action";
  const tracking = record.tracking_type === "checkbox" || record.tracking_type === "quantity" ? record.tracking_type : "quantity";
  const repeatModes: RepeatMode[] = ["once", "daily", "weekdays", "selected_days"];
  const periods: Period[] = ["today", "week", "month", "custom"];
  const targetValue = Number(record.target_value);
  const subitems = Array.isArray(record.subitems)
    ? record.subitems
        .map((item) => {
          const subitem = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
          const title = normalizeText(subitem.title);
          const target = Number(subitem.target ?? subitem.targetCount);
          return title ? { title, target: Number.isFinite(target) && target > 1 ? Math.floor(target) : null } : null;
        })
        .filter((item): item is { title: string; target: number | null } => Boolean(item))
        .slice(0, 12)
    : [];

  const title = sanitizeTitle(normalizeText(record.title), fallbackText);
  const startDate = normalizeDate(record.start_date) ?? todayKey();
  const period = periods.includes(record.period as Period) ? (record.period as Period) : tracking === "checkbox" ? "today" : "month";
  const missingFields = Array.isArray(record.missing_fields)
    ? record.missing_fields.map(normalizeText).filter(Boolean).slice(0, 4)
    : [];

  if (intent === "create_action" && !title) {
    missingFields.push("title");
  }

  if (intent === "create_action" && tracking === "quantity" && (!Number.isFinite(targetValue) || targetValue <= 0)) {
    missingFields.push("target_value");
  }

  return {
    intent,
    title,
    icon: normalizeText(record.icon) || inferEmoji(title || fallbackText),
    tracking_type: tracking,
    target_value: tracking === "quantity" && Number.isFinite(targetValue) && targetValue > 0 ? targetValue : null,
    unit: tracking === "quantity" ? normalizeText(record.unit) || "раз" : null,
    repeat_mode: repeatModes.includes(record.repeat_mode as RepeatMode) ? (record.repeat_mode as RepeatMode) : tracking === "checkbox" ? "daily" : "daily",
    period,
    start_date: startDate,
    end_date: normalizeDate(record.end_date) ?? (period === "month" ? monthEnd(startDate) : period === "week" ? weekEnd(startDate) : startDate),
    due_time: normalizeDueTime(record.due_time),
    subitems,
    missing_fields: Array.from(new Set(missingFields)),
    clarifying_question: normalizeText(record.clarifying_question) || undefined,
  };
}

function localParseAction(text: string): ActionDraft {
  const normalized = text.toLocaleLowerCase();
  const commandOnly = /^(создай|создать|добавь|добавить|create|add)\s*$/i.test(normalized.trim());
  const intent: ActionDraft["intent"] = /^(отметь|закрой|выполн|mark)/i.test(normalized)
    ? "mark_done"
    : /^(добавь|запиши|прибавь|add)\s+\d/i.test(normalized)
      ? "add_progress"
      : commandOnly
        ? "unknown"
        : "create_action";
  const targetMatch = normalized.match(/(\d+(?:[.,]\d+)?)/);
  const targetValue = targetMatch ? Number(targetMatch[1].replace(",", ".")) : null;
  const quantity = Boolean(targetValue);
  const period: Period = /недел|week/.test(normalized) ? "week" : /сегодня|today/.test(normalized) ? "today" : "month";
  const repeatMode: RepeatMode = /будн|weekday/.test(normalized) ? "weekdays" : period === "today" && !quantity ? "once" : "daily";
  const unitMatch = normalized.match(/\d+(?:[.,]\d+)?\s+([а-яёa-z]+)/i);
  const title = inferTitle(text);
  const startDate = todayKey();

  return {
    intent,
    title,
    icon: inferEmoji(text),
    tracking_type: quantity ? "quantity" : "checkbox",
    target_value: quantity ? targetValue : null,
    unit: quantity ? unitMatch?.[1] ?? "раз" : null,
    repeat_mode: repeatMode,
    period,
    start_date: startDate,
    end_date: period === "month" ? monthEnd(startDate) : period === "week" ? weekEnd(startDate) : startDate,
    due_time: normalizeDueTime(normalized.match(/(?:до|before)\s*(\d{1,2}:\d{2})/)?.[1]),
    subitems: [],
    missing_fields: commandOnly ? ["title"] : [],
    clarifying_question: commandOnly ? "Что создать?" : undefined,
  };
}

function inferTitle(text: string): string {
  const normalized = text.replace(/\d+(?:[.,]\d+)?/g, "").replace(/\b(за|на|до|каждый|каждую|хочу|нужно|пройти|сделать|месяц|неделю|день)\b/gi, " ");
  const compact = normalized.replace(/\s+/g, " ").trim();
  const known = [
    "английский",
    "немецкий",
    "чтение",
    "зарядка",
    "тренировка",
    "бег",
    "ходьба",
    "вода",
    "медитация",
    "магазин",
    "уборка",
    "сон",
    "учеба",
    "проект",
  ].find((key) => text.toLocaleLowerCase().includes(key));

  if (known) {
    return known.charAt(0).toLocaleUpperCase() + known.slice(1);
  }

  const withoutGeneric = compact.replace(/\b(цель|задача|действие|goal|task|action)\b/gi, " ").replace(/\s+/g, " ").trim();

  return withoutGeneric ? withoutGeneric.charAt(0).toLocaleUpperCase() + withoutGeneric.slice(1, 42) : "Действие";
}

function localSubitems(title: string) {
  const normalized = title.toLocaleLowerCase();
  if (/заряд|трениров|спорт/.test(normalized)) {
    return [
      { title: "Разминка", target: 1 },
      { title: "Приседания", target: 3 },
      { title: "Отжимания", target: 3 },
      { title: "Пресс", target: 3 },
      { title: "Растяжка", target: 1 },
    ];
  }
  if (/магаз|покуп/.test(normalized)) {
    return [{ title: "Молоко" }, { title: "Хлеб" }, { title: "Яйца" }, { title: "Овощи" }];
  }
  if (/уборк/.test(normalized)) {
    return [{ title: "Пол" }, { title: "Пыль" }, { title: "Кухня" }, { title: "Вещи" }];
  }
  return [{ title: "Шаг 1" }, { title: "Шаг 2" }, { title: "Шаг 3" }];
}

async function callProvider(systemPrompt: string, userPrompt: string): Promise<unknown> {
  const provider = process.env.AI_PROVIDER ?? (process.env.OPENAI_API_KEY ? "openai" : process.env.MISTRAL_API_KEY ? "mistral" : process.env.OPENROUTER_API_KEY ? "openrouter" : "local");

  if (provider === "local") {
    throw new Error("No AI provider configured");
  }

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.1,
        messages,
      }),
    });
    return readProviderJson(response);
  }

  if (provider === "mistral") {
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.MISTRAL_MODEL ?? "mistral-small-latest",
        response_format: { type: "json_object" },
        temperature: 0.1,
        messages,
      }),
    });
    return readProviderJson(response);
  }

  if (provider === "openrouter") {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.1,
        messages,
      }),
    });
    return readProviderJson(response);
  }

  throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
}

async function readProviderJson(response: Response): Promise<unknown> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status}`);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("AI response has no content");
  }

  return extractJson(content);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
  const text = normalizeText(body.text);
  const title = normalizeText(body.title);

  try {
    if (title && !text) {
      const systemPrompt = "Return only JSON: {\"subitems\":[{\"title\":\"...\",\"target\":1}]}. Suggest 3-7 compact checklist subitems for the user's action. target is optional and numeric.";
      const raw = await callProvider(systemPrompt, `Action title: ${title}`);
      const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
      const subitems = Array.isArray(record.subitems) ? record.subitems : localSubitems(title);
      res.status(200).json({ subitems: normalizeDraft({ title, tracking_type: "checkbox", subitems }, title).subitems });
      return;
    }

    if (!text) {
      res.status(400).json({ error: "Text is required" });
      return;
    }

    const systemPrompt = [
      "Return only JSON for a Telegram Mini App daily tracker.",
      "Schema: {\"intent\":\"create_action|mark_done|add_progress|unknown\",\"title\":\"string\",\"icon\":\"emoji\",\"tracking_type\":\"checkbox|quantity\",\"target_value\":number|null,\"unit\":\"string|null\",\"repeat_mode\":\"once|daily|weekdays|selected_days\",\"period\":\"today|week|month|custom\",\"start_date\":\"YYYY-MM-DD|null\",\"end_date\":\"YYYY-MM-DD|null\",\"due_time\":\"HH:mm|null\",\"subitems\":[],\"missing_fields\":[],\"clarifying_question\":\"string|null\"}.",
      "Use checkbox for done/not done habits, quantity when a number target is mentioned.",
      "Keep title short and natural. Never use goal/task/action/цель/задача as title unless the user explicitly quoted it as the title.",
      "For 'создай немецкий 50 уроков на месяц': title Немецкий, icon 🇩🇪, quantity, target_value 50, unit уроков, daily, month.",
      "If required fields are missing, set intent unknown or create_action with missing_fields and one short clarifying_question.",
    ].join(" ");
    const raw = await callProvider(systemPrompt, text);
    res.status(200).json(normalizeDraft(raw, text));
  } catch {
    if (title && !text) {
      res.status(200).json({ subitems: localSubitems(title) });
      return;
    }

    if (text) {
      res.status(200).json(localParseAction(text));
      return;
    }

    res.status(500).json({ error: "AI parse failed" });
  }
}
