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
  };
};

type TrackingType = "checkbox" | "quantity";
type RepeatMode = "once" | "daily" | "weekdays" | "selected_days";
type Period = "today" | "week" | "month" | "custom";

type AiActionDraft = {
  intent?: "create_action" | "mark_done" | "add_progress" | "unknown";
  title: string;
  icon?: string;
  tracking_type: TrackingType;
  target_value?: number;
  unit?: string;
  repeat_mode: RepeatMode;
  period: Period;
  start_date?: string;
  end_date?: string | null;
  due_time?: string | null;
  subitems?: Array<{ title: string; target?: number }>;
  missing_fields?: string[];
  clarifying_question?: string | null;
};

type AiSubitemDraft = {
  title: string;
  target?: number;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dateKey(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function dueTime(value: unknown): string | null {
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

function cleanTitle(value: string, fallbackTitle: string): string {
  const cleaned = value
    .replace(/^["'“”«»]+|["'“”«»]+$/g, "")
    .replace(/\b(цель|задача|действие|goal|task|action)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned) {
    return cleaned.slice(0, 48);
  }

  return fallbackTitle
    .replace(/\b(цель|задача|действие|goal|task|action)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function normalizeDraft(value: unknown, fallbackTitle: string): AiActionDraft | null {
  const item = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const title = cleanTitle(text(item.title), fallbackTitle);
  if (!title) {
    return null;
  }

  const trackingType: TrackingType = item.tracking_type === "checkbox" || item.tracking_type === "quantity" ? item.tracking_type : "checkbox";
  const targetValue = Number(item.target_value);
  const repeatMode: RepeatMode =
    item.repeat_mode === "once" || item.repeat_mode === "daily" || item.repeat_mode === "weekdays" || item.repeat_mode === "selected_days"
      ? item.repeat_mode
      : "daily";
  const period: Period = item.period === "today" || item.period === "week" || item.period === "month" || item.period === "custom" ? item.period : "today";
  const subitems = Array.isArray(item.subitems)
    ? item.subitems
        .map((rawSubitem: unknown): AiSubitemDraft | null => {
          const subitem = typeof rawSubitem === "object" && rawSubitem !== null ? (rawSubitem as Record<string, unknown>) : {};
          const subitemTitle = text(subitem.title);
          const target = Number(subitem.target ?? subitem.targetCount);
          if (!subitemTitle) {
            return null;
          }

          const draft: AiSubitemDraft = { title: subitemTitle };
          if (Number.isFinite(target) && target > 1) {
            draft.target = Math.floor(target);
          }
          return draft;
        })
        .filter((subitem): subitem is AiSubitemDraft => subitem !== null)
        .slice(0, 12)
    : [];

  return {
    intent:
      item.intent === "create_action" || item.intent === "mark_done" || item.intent === "add_progress" || item.intent === "unknown"
        ? item.intent
        : "create_action",
    title,
    icon: text(item.icon) || undefined,
    tracking_type: trackingType,
    target_value: trackingType === "quantity" && Number.isFinite(targetValue) && targetValue > 0 ? targetValue : undefined,
    unit: trackingType === "quantity" ? text(item.unit) || undefined : undefined,
    repeat_mode: repeatMode,
    period,
    start_date: dateKey(item.start_date),
    end_date: dateKey(item.end_date) ?? null,
    due_time: dueTime(item.due_time),
    subitems,
    missing_fields: Array.isArray(item.missing_fields) ? item.missing_fields.map(text).filter(Boolean).slice(0, 4) : [],
    clarifying_question: text(item.clarifying_question) || null,
  };
}

function extractJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("No JSON in AI response");
    }
    return JSON.parse(match[0]);
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({ error: "ИИ пока не настроен." });
    return;
  }

  const body = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
  const prompt = text(body.text);
  const language = text(body.language) || "ru";
  const today = new Date().toISOString().slice(0, 10);

  if (!prompt) {
    res.status(400).json({ error: "Text is required" });
    return;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.15,
        messages: [
          {
            role: "system",
            content: [
              "You create Chexar action drafts for a Telegram Mini App. Return only JSON.",
              `Today is ${today}. User language is ${language}.`,
              "Schema: {\"actions\":[{\"intent\":\"create_action|mark_done|add_progress|unknown\",\"title\":\"string\",\"icon\":\"emoji\",\"tracking_type\":\"checkbox|quantity\",\"target_value\":number|null,\"unit\":\"string|null\",\"repeat_mode\":\"once|daily|weekdays|selected_days\",\"period\":\"today|week|month|custom\",\"start_date\":\"YYYY-MM-DD\",\"end_date\":\"YYYY-MM-DD|null\",\"due_time\":\"HH:mm|null\",\"subitems\":[{\"title\":\"string\",\"target\":number|null}],\"missing_fields\":[],\"clarifying_question\":\"string|null\"}],\"question\":\"string|null\"}.",
              "Use checkbox for done/not done actions. Use quantity only when the user gives a numeric target.",
              "Example: 'создай немецкий 50 уроков на месяц' -> title 'Немецкий', icon '🇩🇪', quantity, target_value 50, unit 'уроков', daily, month.",
              "Never use goal/task/action/цель/задача as title unless the user explicitly quoted it as the title.",
              "If important fields are missing, return no low-quality action and set a one-sentence question.",
              "If the user asks to create several actions, do not convert that instruction line into an action.",
              "For numbered lists, ignore list numbers such as 1., 2., 3.; use only real quantities from the item text.",
              "For tomorrow, set start_date and end_date to tomorrow and period to today.",
              "Do not save anything. Only suggest drafts.",
            ].join(" "),
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      res.status(response.status).json({ error: "ИИ не смог разобрать действие. Попробуй проще." });
      return;
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      res.status(502).json({ error: "ИИ не смог разобрать действие. Попробуй проще." });
      return;
    }

    const parsed = extractJson(content);
    const record = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    const rawActions = Array.isArray(record.actions) ? record.actions : [record];
    const actions = rawActions
      .map((item: unknown) => normalizeDraft(item, prompt))
      .filter((item): item is AiActionDraft => item !== null)
      .slice(0, 8);

    res.status(200).json({ actions });
  } catch {
    res.status(500).json({ error: "ИИ не смог разобрать действие. Попробуй проще." });
  }
}
