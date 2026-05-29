declare const process: {
  env: Record<string, string | undefined>;
};

type TrackingType = "checkbox" | "quantity";
type RepeatMode = "once" | "daily" | "weekdays" | "selected_days";
type Period = "today" | "week" | "month" | "custom";

type TelegramUser = {
  id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};

type TelegramChat = {
  id?: number | string;
};

type TelegramMessage = {
  message_id?: number;
  chat?: TelegramChat;
  from?: TelegramUser;
  text?: string;
};

type TelegramCallbackQuery = {
  id?: string;
  from?: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

type RemoteUser = {
  id: string;
  telegram_id: string;
  username: string | null;
  first_name: string | null;
  last_name?: string | null;
  language_code?: string | null;
};

type RemoteSettings = {
  user_id: string;
  language: string | null;
  telegram_bot_enabled?: boolean | null;
  telegram_reminders_enabled?: boolean | null;
  telegram_chat_id?: string | null;
};

type RemoteItem = {
  id: string;
  user_id: string;
  title: string;
  emoji?: string | null;
  icon?: string | null;
  tracking_type: TrackingType;
  repeat_mode: RepeatMode;
  start_date: string;
  end_date: string | null;
  selected_days: number[] | null;
  due_time?: string | null;
  target_value: number | null;
  unit: string | null;
  quick_add_values?: number[] | null;
  subitems?: unknown;
  sort_order?: number | null;
  archived: boolean | null;
};

type RemoteDailyEntry = {
  id: string;
  user_id: string;
  item_id: string;
  date: string;
  checked: boolean | null;
  value_added: number | null;
  note?: string | null;
  completed_at?: string | null;
  is_late?: boolean | null;
  subitem_state?: unknown;
};

type AiActionDraft = {
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
};

type BotConfig = {
  telegramToken: string;
  supabaseUrl: string;
  supabaseKey: string;
  appUrl: string;
  timeZone: string;
};

type BotContext = {
  config: BotConfig;
  chatId: number | string;
  telegramId: string;
  telegramUser: TelegramUser | null;
  user: RemoteUser | null;
  settings: RemoteSettings | null;
};

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
};

export const WELCOME_MESSAGE = "Chexar connected ✅";
const DEFAULT_APP_URL = "https://chexar.vercel.app";
const MAX_CREATED_ACTIONS = 8;

const emojiRules: Array<[string[], string]> = [
  [["заряд", "трениров", "спорт", "workout", "gym"], "🏋️"],
  [["прогул", "ходьб", "walk"], "🚶"],
  [["бег", "run"], "🏃"],
  [["англий", "немец", "язык", "english", "language"], "🌐"],
  [["чтен", "книг", "прочита", "страниц", "book", "read"], "📚"],
  [["вода", "water"], "💧"],
  [["медит", "meditation"], "🧘"],
  [["магаз", "покуп", "shop", "grocery"], "🛒"],
  [["уборк", "clean"], "🧹"],
  [["сон", "sleep"], "😴"],
  [["работ", "проект", "work", "project"], "💻"],
  [["учеб", "курс", "lesson", "study"], "🎓"],
];

function safeLogPayload(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function logInfo(message: string, details?: unknown): void {
  if (details === undefined) {
    console.log(`[telegram:bot] ${message}`);
    return;
  }

  console.log(`[telegram:bot] ${message}`, safeLogPayload(details));
}

function readEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  const normalizedNames = new Set(names.map((name) => name.trim().toUpperCase()));
  const fallbackKey = Object.keys(process.env).find((key) => normalizedNames.has(key.trim().toUpperCase()));
  const fallbackValue = fallbackKey ? process.env[fallbackKey]?.trim() : undefined;

  return fallbackValue || undefined;
}

function getConfig(): BotConfig {
  const telegramToken = readEnv(["TELEGRAM_BOT_TOKEN"]);
  if (!telegramToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const supabaseUrl = readEnv([
    "SUPABASE_URL",
    "VITE_SUPABASE_URL",
    "NEXT_PUBLIC_Chexar_SUPABASE_URL",
    "Chexar_SUPABASE_URL",
  ]);
  const supabaseKey = readEnv([
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_Chexar_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_Chexar_SUPABASE_PUBLISHABLE_KEY",
    "Chexar_SUPABASE_SERVICE_ROLE_KEY",
    "Chexar_SUPABASE_SECRET_KEY",
    "Chexar_SUPABASE_ANON_KEY",
    "Chexar_SUPABASE_PUBLISHABLE_KEY",
  ]);
  const appUrl = readEnv(["CHEXAR_APP_URL", "VITE_CHEXAR_APP_URL", "NEXT_PUBLIC_CHEXAR_APP_URL"]) ?? DEFAULT_APP_URL;

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL or VITE_SUPABASE_URL is not configured");
  }

  if (!supabaseKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY is not configured");
  }

  return {
    telegramToken,
    supabaseUrl: supabaseUrl.replace(/\/+$/, ""),
    supabaseKey,
    appUrl: appUrl.replace(/\/+$/, ""),
    timeZone: readEnv(["CHEXAR_TIME_ZONE"]) ?? "Europe/Berlin",
  };
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function getCommand(text: string | undefined): string | null {
  const firstToken = text?.trim().split(/\s+/, 1)[0] ?? "";
  if (!firstToken.startsWith("/")) {
    return null;
  }

  return firstToken.slice(1).split("@", 1)[0]?.toLowerCase() ?? null;
}

function todayKey(config: Pick<BotConfig, "timeZone">): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

function addDays(dateKey: string, offset: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function endOfMonth(dateKey: string): string {
  const [year, month] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function getWeekday(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function countActiveDays(item: Pick<RemoteItem, "repeat_mode" | "selected_days">, startDate: string, endDate: string): number {
  let count = 0;
  for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 1)) {
    if (isRepeatActiveOnDate(item, cursor)) {
      count += 1;
    }
  }

  return Math.max(count, 1);
}

function isRepeatActiveOnDate(item: Pick<RemoteItem, "repeat_mode" | "selected_days">, dateKey: string): boolean {
  const weekday = getWeekday(dateKey);

  if (item.repeat_mode === "weekdays") {
    return weekday >= 1 && weekday <= 5;
  }

  if (item.repeat_mode === "selected_days") {
    return (item.selected_days ?? []).includes(weekday);
  }

  return true;
}

function isItemActiveOnDate(item: RemoteItem, dateKey: string): boolean {
  if (item.archived) {
    return false;
  }

  if (item.repeat_mode === "once") {
    return item.start_date === dateKey;
  }

  const endDate = item.end_date ?? "2099-12-31";
  return item.start_date <= dateKey && endDate >= dateKey && isRepeatActiveOnDate(item, dateKey);
}

function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripActionWords(value: string): string {
  return normalizeSearchText(value)
    .replace(
      /\b(отметь|отметить|выполнил|выполнено|сделал|сделано|готово|закрыл|завершил|добавь|добавить|плюс|создай|создать|задачу|задачи|цель|прогресс|done|complete|add|created|create)\b/giu,
      " ",
    )
    .replace(/\d+(?:[.,]\d+)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreItemMatch(item: RemoteItem, query: string): number {
  const normalizedTitle = normalizeSearchText(item.title);
  const normalizedQuery = stripActionWords(query);
  if (!normalizedQuery) {
    return 0;
  }

  if (normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle)) {
    return 100;
  }

  const titleTokens = new Set(normalizedTitle.split(" ").filter((token) => token.length > 2));
  return normalizedQuery
    .split(" ")
    .filter((token) => token.length > 2 && titleTokens.has(token))
    .length;
}

function findBestItem(items: RemoteItem[], text: string, trackingType?: TrackingType): RemoteItem | null {
  const candidates = trackingType ? items.filter((item) => item.tracking_type === trackingType) : items;
  const scored = candidates
    .map((item) => ({ item, score: scoreItemMatch(item, text) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.item ?? null;
}

function getAmountFromText(text: string): number | null {
  const match = text.replace(",", ".").match(/(?:^|\s|\+)(\d+(?:\.\d+)?)(?=\s|$|[^\d.])/);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function isDoneIntent(text: string): boolean {
  const normalized = normalizeSearchText(text);
  return /\b(отметь|отметить|выполнил|выполнено|сделал|сделано|готово|закрыл|завершил|done|complete)\b/iu.test(normalized);
}

function isProgressIntent(text: string): boolean {
  const normalized = normalizeSearchText(text);
  return (
    getAmountFromText(text) !== null &&
    /\b(добавь|добавить|плюс|прошел|прошёл|прочитал|сделал|урок|урока|уроков|страниц|страницы|км|раз|мин|add)\b/iu.test(normalized)
  );
}

function inferEmoji(text: string): string {
  const normalized = normalizeSearchText(text);
  return emojiRules.find(([keys]) => keys.some((key) => normalized.includes(key)))?.[1] ?? "✨";
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

function normalizeDateKey(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
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

function cleanAiActionRequest(value: string): string {
  return value
    .trim()
    .replace(/^\s*(?:[-*•]+|\d+[.)]|[a-zа-яё][.)])\s*/iu, "")
    .replace(/^["'“”«»]+|["'“”«»]+$/g, "")
    .trim();
}

function isAiInstructionRequest(value: string): boolean {
  const normalized = value.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return true;
  }

  const asksForList = /^(создай|создать|добавь|добавить|сделай|составь|create|add|make)(?:\s|$|[:,.!?])/i.test(normalized);
  const listWords = /(несколько|пару|список|задач|действи|tasks|actions|list)/i.test(normalized);
  const hasOwnQuantity = /\d+(?:[.,]\d+)?\s+[a-zа-яё]/i.test(normalized);

  return asksForList && listWords && !hasOwnQuantity;
}

function splitActionRequests(value: string): string[] {
  const normalizedList = value
    .replace(/\r\n/g, "\n")
    .replace(/([:：])\s*(?=\d+[.)]\s+)/g, "$1\n")
    .replace(/\s+(\d+[.)]\s+)/g, "\n$1")
    .replace(/\s+([-*•]\s+)/g, "\n$1");

  const items = normalizedList
    .split(/\n|;|•/g)
    .map((item) => cleanAiActionRequest(item))
    .filter((item) => item && !isAiInstructionRequest(item))
    .slice(0, MAX_CREATED_ACTIONS);

  return items.length > 0 ? items : [value.trim()].filter(Boolean);
}

function parseAiDueTimeFromText(normalized: string): string | null {
  const match = normalized.match(/(?:до|before)\s*(\d{1,2})(?::(\d{2}))?\s*(утра|дня|вечера|ночи|am|pm)?/i);
  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const suffix = match[3]?.toLocaleLowerCase("ru-RU") ?? "";

  if ((suffix === "вечера" || suffix === "pm") && hours < 12) {
    hours += 12;
  }

  if (suffix === "ночи" && hours === 12) {
    hours = 0;
  }

  return normalizeDueTime(`${hours}:${String(minutes).padStart(2, "0")}`);
}

function buildLocalDraft(text: string, config: BotConfig): AiActionDraft {
  const sourceText = cleanAiActionRequest(text) || text.trim();
  const normalized = sourceText.toLocaleLowerCase("ru-RU");
  const dueTime = parseAiDueTimeFromText(normalized);
  const targetSource = normalized.replace(/(?:до|before)\s*\d{1,2}(?::\d{2})?\s*(утра|дня|вечера|ночи|am|pm)?/gi, " ");
  const targetMatch = targetSource.match(/(\d+(?:[.,]\d+)?)/);
  const targetValue = targetMatch ? Number(targetMatch[1].replace(",", ".")) : undefined;
  const hasQuantity = Boolean(targetValue && Number.isFinite(targetValue));
  const hasTomorrow = /завтра|tomorrow/.test(normalized);
  const isOneDay = /сегодня|today/.test(normalized) || hasTomorrow;
  const period: Period = /недел|week/.test(normalized) ? "week" : isOneDay ? "today" : "month";
  const repeatMode: RepeatMode = /будн|weekday/.test(normalized) ? "weekdays" : !hasQuantity && isOneDay ? "once" : "daily";
  const unitMatch = targetSource.match(/\d+(?:[.,]\d+)?\s+([а-яёa-z]+)/i);
  const knownTitle = ([
    [/англий/i, "Английский"],
    [/немец/i, "Немецкий"],
    [/чтен|книг|прочита|страниц/i, "Чтение"],
    [/зарядк/i, "Зарядка"],
    [/трениров/i, "Тренировка"],
    [/бег/i, "Бег"],
    [/ходьб|прогул/i, "Ходьба"],
    [/вод/i, "Вода"],
    [/медит/i, "Медитация"],
    [/магаз|покуп/i, "Магазин"],
    [/уборк/i, "Уборка"],
    [/сон/i, "Сон"],
    [/учеб|курс/i, "Учеба"],
    [/проект|работ/i, "Проект"],
  ] satisfies Array<[RegExp, string]>).find(([pattern]) => pattern.test(normalized))?.[1];
  const fallbackTitle = sourceText
    .replace(/\d+(?:[.,]\d+)?/g, "")
    .replace(/\b(создай|создать|за|на|до|каждый|каждую|хочу|нужно|пройти|прочитать|сделать|месяц|неделю|день|завтра|сегодня|утра|дня|вечера|ночи)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const scheduledDate = hasTomorrow ? addDays(todayKey(config), 1) : todayKey(config);

  return {
    title: knownTitle ?? (fallbackTitle ? fallbackTitle.charAt(0).toLocaleUpperCase("ru-RU") + fallbackTitle.slice(1, 42) : "Действие"),
    icon: inferEmoji(sourceText),
    tracking_type: hasQuantity ? "quantity" : "checkbox",
    target_value: hasQuantity ? targetValue : undefined,
    unit: hasQuantity ? unitMatch?.[1] ?? "раз" : undefined,
    repeat_mode: repeatMode,
    period,
    start_date: scheduledDate,
    end_date: hasTomorrow ? scheduledDate : null,
    due_time: dueTime,
    subitems: [],
  };
}

function normalizeDraft(value: unknown, fallbackText: string, config: BotConfig): AiActionDraft | null {
  const record = normalizeRecord(value);
  const local = buildLocalDraft(fallbackText, config);
  const title = normalizeText(record.title) || local.title;
  const trackingType: TrackingType = record.tracking_type === "checkbox" || record.tracking_type === "quantity" ? record.tracking_type : local.tracking_type;
  const targetValue = Number(record.target_value);
  const repeatMode: RepeatMode =
    record.repeat_mode === "once" || record.repeat_mode === "daily" || record.repeat_mode === "weekdays" || record.repeat_mode === "selected_days"
      ? record.repeat_mode
      : local.repeat_mode;
  const period: Period = record.period === "today" || record.period === "week" || record.period === "month" || record.period === "custom" ? record.period : local.period;
  const subitems = Array.isArray(record.subitems)
    ? record.subitems
        .map((rawSubitem: unknown): { title: string; target?: number } | null => {
          const subitem = normalizeRecord(rawSubitem);
          const subitemTitle = normalizeText(subitem.title);
          const target = Number(subitem.target ?? subitem.targetCount);

          if (!subitemTitle) {
            return null;
          }

          const draft: { title: string; target?: number } = { title: subitemTitle };
          if (Number.isFinite(target) && target > 1) {
            draft.target = Math.floor(target);
          }

          return draft;
        })
        .filter((subitem): subitem is { title: string; target?: number } => subitem !== null)
        .slice(0, 12)
    : [];

  if (!title) {
    return null;
  }

  return {
    title,
    icon: normalizeText(record.icon) || local.icon,
    tracking_type: trackingType,
    target_value: trackingType === "quantity" && Number.isFinite(targetValue) && targetValue > 0 ? targetValue : local.target_value,
    unit: trackingType === "quantity" ? normalizeText(record.unit) || local.unit || "раз" : undefined,
    repeat_mode: repeatMode,
    period,
    start_date: normalizeDateKey(record.start_date) ?? local.start_date,
    end_date: normalizeDateKey(record.end_date) ?? local.end_date ?? null,
    due_time: normalizeDueTime(record.due_time) ?? local.due_time,
    subitems,
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

async function requestAiDrafts(text: string, config: BotConfig, language: string): Promise<AiActionDraft[]> {
  const prompts = splitActionRequests(text);

  if (!process.env.OPENAI_API_KEY) {
    return prompts.map((prompt) => buildLocalDraft(prompt, config));
  }

  const today = todayKey(config);
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
            "Schema: {\"actions\":[{\"title\":\"string\",\"icon\":\"emoji\",\"tracking_type\":\"checkbox|quantity\",\"target_value\":number|null,\"unit\":\"string|null\",\"repeat_mode\":\"once|daily|weekdays|selected_days\",\"period\":\"today|week|month|custom\",\"start_date\":\"YYYY-MM-DD\",\"end_date\":\"YYYY-MM-DD|null\",\"due_time\":\"HH:mm|null\",\"subitems\":[{\"title\":\"string\",\"target\":number|null}]}]}.",
            "Use checkbox for done/not done actions. Use quantity only when the user gives a numeric target.",
            "If the user asks to create several actions, do not convert that instruction line into an action.",
            "For numbered lists, ignore list numbers such as 1., 2., 3.; use only real quantities from the item text.",
            "Do not save anything. Only suggest drafts.",
          ].join(" "),
        },
        { role: "user", content: text },
      ],
    }),
  });

  if (!response.ok) {
    return prompts.map((prompt) => buildLocalDraft(prompt, config));
  }

  const payload = await response.json().catch(() => null);
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return prompts.map((prompt) => buildLocalDraft(prompt, config));
  }

  const record = normalizeRecord(extractJson(content));
  const rawActions = Array.isArray(record.actions) ? record.actions : [record];
  const drafts = rawActions
    .map((item: unknown, index: number) => normalizeDraft(item, prompts[index] ?? text, config))
    .filter((item): item is AiActionDraft => item !== null)
    .slice(0, MAX_CREATED_ACTIONS);

  return drafts.length > 0 ? drafts : prompts.map((prompt) => buildLocalDraft(prompt, config));
}

function getDefaultQuickValues(unit: string): number[] {
  const normalized = unit.toLocaleLowerCase("ru-RU");

  if (normalized.includes("стра")) {
    return [10, 25];
  }

  if (normalized.includes("км")) {
    return [1, 5];
  }

  if (normalized.includes("урок")) {
    return [1, 2];
  }

  return [1, 5];
}

function getDraftDates(draft: AiActionDraft, config: BotConfig): { startDate: string; endDate: string } {
  const today = todayKey(config);
  const startDate = normalizeDateKey(draft.start_date) ?? today;
  const endDate =
    normalizeDateKey(draft.end_date) ??
    (draft.period === "today" ? startDate : draft.period === "week" ? addDays(startDate, 6) : endOfMonth(startDate));

  return { startDate, endDate };
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getSupabaseHeaders(config: BotConfig, prefer?: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: config.supabaseKey,
    Authorization: `Bearer ${config.supabaseKey}`,
    "Content-Type": "application/json",
  };

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

async function supabaseFetch<T>(config: BotConfig, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...getSupabaseHeaders(config),
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.text();
  const data = payload ? JSON.parse(payload) : null;
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : `Supabase request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

function queryPath(table: string, params: Record<string, string>): string {
  const searchParams = new URLSearchParams(params);
  return `${table}?${searchParams.toString()}`;
}

async function getUserByTelegramId(config: BotConfig, telegramId: string): Promise<RemoteUser | null> {
  const rows = await supabaseFetch<RemoteUser[]>(
    config,
    queryPath("users", {
      telegram_id: `eq.${telegramId}`,
      select: "*",
      limit: "1",
    }),
  );

  return rows[0] ?? null;
}

async function updateUserFromTelegram(config: BotConfig, user: RemoteUser, telegramUser: TelegramUser | null): Promise<void> {
  if (!telegramUser) {
    return;
  }

  await supabaseFetch(
    config,
    queryPath("users", { id: `eq.${user.id}` }),
    {
      method: "PATCH",
      headers: getSupabaseHeaders(config, "return=minimal"),
      body: JSON.stringify({
        username: telegramUser.username ?? user.username ?? null,
        first_name: telegramUser.first_name ?? user.first_name ?? null,
        last_name: telegramUser.last_name ?? user.last_name ?? null,
        language_code: telegramUser.language_code ?? user.language_code ?? null,
      }),
    },
  );
}

async function getSettings(config: BotConfig, userId: string): Promise<RemoteSettings | null> {
  const rows = await supabaseFetch<RemoteSettings[]>(
    config,
    queryPath("settings", {
      user_id: `eq.${userId}`,
      select: "*",
      limit: "1",
    }),
  );

  return rows[0] ?? null;
}

async function updateBotChatId(config: BotConfig, userId: string, chatId: number | string): Promise<void> {
  try {
    await supabaseFetch(
      config,
      queryPath("settings", { user_id: `eq.${userId}` }),
      {
        method: "PATCH",
        headers: getSupabaseHeaders(config, "return=minimal"),
        body: JSON.stringify({
          telegram_chat_id: String(chatId),
          telegram_last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/telegram_chat_id|telegram_last_seen_at|Could not find.*column|column .* does not exist/i.test(message)) {
      return;
    }

    throw error;
  }
}

async function getItems(config: BotConfig, userId: string): Promise<RemoteItem[]> {
  return supabaseFetch<RemoteItem[]>(
    config,
    queryPath("items", {
      user_id: `eq.${userId}`,
      archived: "eq.false",
      select: "*",
      order: "sort_order.asc.nullslast,created_at.asc",
    }),
  );
}

async function getEntriesForDate(config: BotConfig, userId: string, dateKey: string): Promise<RemoteDailyEntry[]> {
  return supabaseFetch<RemoteDailyEntry[]>(
    config,
    queryPath("daily_entries", {
      user_id: `eq.${userId}`,
      date: `eq.${dateKey}`,
      select: "*",
    }),
  );
}

async function getEntriesForItem(config: BotConfig, userId: string, itemId: string): Promise<RemoteDailyEntry[]> {
  return supabaseFetch<RemoteDailyEntry[]>(
    config,
    queryPath("daily_entries", {
      user_id: `eq.${userId}`,
      item_id: `eq.${itemId}`,
      select: "*",
    }),
  );
}

async function getEntry(config: BotConfig, userId: string, itemId: string, dateKey: string): Promise<RemoteDailyEntry | null> {
  const rows = await supabaseFetch<RemoteDailyEntry[]>(
    config,
    queryPath("daily_entries", {
      user_id: `eq.${userId}`,
      item_id: `eq.${itemId}`,
      date: `eq.${dateKey}`,
      select: "*",
      limit: "1",
    }),
  );

  return rows[0] ?? null;
}

async function upsertDailyEntry(config: BotConfig, row: Omit<RemoteDailyEntry, "id">): Promise<void> {
  const existing = await getEntry(config, row.user_id, row.item_id, row.date);
  const body = {
    checked: row.checked,
    value_added: row.value_added,
    note: row.note ?? null,
    completed_at: row.completed_at ?? null,
    is_late: row.is_late ?? false,
    subitem_state: row.subitem_state ?? null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabaseFetch(
      config,
      queryPath("daily_entries", { id: `eq.${existing.id}` }),
      {
        method: "PATCH",
        headers: getSupabaseHeaders(config, "return=minimal"),
        body: JSON.stringify(body),
      },
    );
    return;
  }

  await supabaseFetch(
    config,
    "daily_entries",
    {
      method: "POST",
      headers: getSupabaseHeaders(config, "return=minimal"),
      body: JSON.stringify({
        user_id: row.user_id,
        item_id: row.item_id,
        date: row.date,
        ...body,
      }),
    },
  );
}

async function getMaxSortOrder(config: BotConfig, userId: string): Promise<number> {
  const rows = await supabaseFetch<Array<{ sort_order: number | null }>>(
    config,
    queryPath("items", {
      user_id: `eq.${userId}`,
      select: "sort_order",
      order: "sort_order.desc.nullslast",
      limit: "1",
    }),
  );

  return Number(rows[0]?.sort_order ?? 0);
}

async function createItemsFromDrafts(config: BotConfig, userId: string, drafts: AiActionDraft[]): Promise<RemoteItem[]> {
  const maxSortOrder = await getMaxSortOrder(config, userId);
  const rows = drafts.map((draft, index) => {
    const dates = getDraftDates(draft, config);
    const unit = draft.unit?.trim() || "раз";
    const subitems = (draft.subitems ?? []).map((subitem, subitemIndex) => ({
      id: randomId(),
      title: subitem.title,
      targetCount: subitem.target && subitem.target > 1 ? subitem.target : undefined,
      sortOrder: subitemIndex + 1,
    }));

    return {
      id: randomId(),
      user_id: userId,
      title: draft.title.trim(),
      emoji: draft.icon ?? inferEmoji(draft.title),
      icon: null,
      tracking_type: draft.tracking_type,
      repeat_mode: draft.tracking_type === "checkbox" && draft.period === "today" ? "once" : draft.repeat_mode,
      start_date: dates.startDate,
      end_date: dates.endDate,
      selected_days: draft.repeat_mode === "selected_days" ? [1, 2, 3, 4, 5] : null,
      due_time: normalizeDueTime(draft.due_time) ?? null,
      target_value: draft.tracking_type === "quantity" ? Math.max(1, Number(draft.target_value ?? 50)) : null,
      unit: draft.tracking_type === "quantity" ? unit : null,
      quick_add_values: draft.tracking_type === "quantity" ? getDefaultQuickValues(unit) : null,
      subitems: draft.tracking_type === "checkbox" && subitems.length > 0 ? subitems : null,
      sort_order: maxSortOrder + index + 1,
      archived: false,
      updated_at: new Date().toISOString(),
    };
  });

  if (rows.length === 0) {
    return [];
  }

  return supabaseFetch<RemoteItem[]>(
    config,
    "items",
    {
      method: "POST",
      headers: getSupabaseHeaders(config, "return=representation"),
      body: JSON.stringify(rows),
    },
  );
}

async function sendTelegram(config: BotConfig, method: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${config.telegramToken}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const responseText = await response.text().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to read Telegram response body: ${message}`;
  });

  logInfo("Telegram API response", {
    method,
    status: response.status,
    ok: response.ok,
    body: responseText.slice(0, 1200),
  });

  if (!response.ok) {
    throw new Error(`Telegram ${method} failed with status ${response.status}: ${responseText.slice(0, 300)}`);
  }
}

async function sendMessage(config: BotConfig, chatId: number | string, text: string, replyMarkup?: Record<string, unknown>): Promise<void> {
  await sendTelegram(config, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function sendChatAction(config: BotConfig, chatId: number | string, action = "typing"): Promise<void> {
  await sendTelegram(config, "sendChatAction", {
    chat_id: chatId,
    action,
  }).catch(() => undefined);
}

async function deleteMessage(config: BotConfig, chatId: number | string, messageId: number | undefined): Promise<void> {
  if (!messageId) {
    return;
  }

  await sendTelegram(config, "deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  }).catch((error: unknown) => {
    logInfo("Could not delete Telegram message", {
      messageId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

async function answerCallback(config: BotConfig, callbackId: string | undefined, text?: string): Promise<void> {
  if (!callbackId) {
    return;
  }

  await sendTelegram(config, "answerCallbackQuery", {
    callback_query_id: callbackId,
    text,
  });
}

function openChexarButton(config: BotConfig) {
  return {
    text: "Open Chexar",
    web_app: {
      url: config.appUrl,
    },
  };
}

function openChexarMarkup(config: BotConfig) {
  return {
    inline_keyboard: [
      [
        openChexarButton(config),
      ],
    ],
  };
}

function messagePanelMarkup(config: BotConfig) {
  return {
    keyboard: [
      [
        openChexarButton(config),
      ],
      [
        { text: "📋 Сегодня" },
        { text: "✨ Создать" },
      ],
      [
        { text: "❔ Помощь" },
        { text: "⚙️ Профиль" },
      ],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "Напиши задачу или выбери действие",
  };
}

function secondaryMenuMarkup(config: BotConfig) {
  return {
    inline_keyboard: [
      [
        { text: "📋 Сегодня", callback_data: "menu:today" },
        { text: "🏠 Меню", callback_data: "menu:home" },
      ],
      [
        openChexarButton(config),
      ],
    ],
  };
}

function shortButtonTitle(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 28 ? `${trimmed.slice(0, 27)}…` : trimmed;
}

function todayListMarkup(config: BotConfig, items: RemoteItem[]) {
  const rows: Array<Array<Record<string, unknown>>> = [];

  items.slice(0, 12).forEach((item) => {
    const title = shortButtonTitle(item.title);

    if (item.tracking_type === "quantity") {
      const quick = (item.quick_add_values ?? [1, 5]).slice(0, 2).filter((value) => Number.isFinite(Number(value)) && Number(value) > 0);
      const buttons = quick.length > 0 ? quick : [1];
      rows.push([
        {
          text: `➕ ${getEmoji(item)} ${title}`,
          callback_data: `hint:${item.id}`,
        },
      ]);
      rows.push(buttons.map((amount) => ({
        text: `+${amount} ${item.unit ?? ""}`.trim(),
        callback_data: `progress:${item.id}:${amount}`,
      })));
      return;
    }

    rows.push([
      {
        text: `✓ Отметить · ${getEmoji(item)} ${title}`,
        callback_data: `done:${item.id}`,
      },
    ]);
  });

  rows.push([
    { text: "🔄 Обновить", callback_data: "menu:today" },
    { text: "🏠 Меню", callback_data: "menu:home" },
  ]);
  rows.push([
    openChexarButton(config),
  ]);

  return {
    inline_keyboard: rows,
  };
}

function getEmoji(item: RemoteItem): string {
  return item.emoji?.trim() || item.icon?.trim() || inferEmoji(item.title);
}

function entryByItem(entries: RemoteDailyEntry[]): Map<string, RemoteDailyEntry> {
  const result = new Map<string, RemoteDailyEntry>();
  entries.forEach((entry) => result.set(entry.item_id, entry));
  return result;
}

async function getQuantityStatus(config: BotConfig, userId: string, item: RemoteItem, dateKey: string): Promise<{ loggedToday: number; requiredToday: number; remaining: number }> {
  const entries = await getEntriesForItem(config, userId, item.id);
  const totalLogged = entries.reduce((sum, entry) => sum + Number(entry.value_added ?? 0), 0);
  const loggedToday = entries.filter((entry) => entry.date === dateKey).reduce((sum, entry) => sum + Number(entry.value_added ?? 0), 0);
  const target = Math.max(0, Number(item.target_value ?? 0));
  const remaining = Math.max(0, target - totalLogged);
  const endDate = item.end_date ?? endOfMonth(dateKey);
  const remainingDays = countActiveDays(item, dateKey, endDate);
  const requiredToday = remaining > 0 ? Math.ceil(remaining / remainingDays) : 0;

  return { loggedToday, requiredToday, remaining };
}

async function formatTodayList(config: BotConfig, userId: string, items: RemoteItem[], entries: RemoteDailyEntry[], dateKey: string): Promise<{ text: string; actionable: RemoteItem[] }> {
  const entriesMap = entryByItem(entries);
  const lines = [`📋 Сегодня · ${dateKey}`, ""];
  const actionable: RemoteItem[] = [];

  for (const item of items) {
    const entry = entriesMap.get(item.id);

    if (item.tracking_type === "checkbox") {
      const done = entry?.checked === true;
      lines.push(`${done ? "✅" : "□"} ${getEmoji(item)} ${item.title}`);
      if (!done) {
        actionable.push(item);
      }
      continue;
    }

    const status = await getQuantityStatus(config, userId, item, dateKey);
    const target = Number(item.target_value ?? 0);
    const done = target > 0 && status.remaining <= 0;
    lines.push(
      `${done ? "✅" : "□"} ${getEmoji(item)} ${item.title}: ${status.loggedToday}/${status.requiredToday || 0} ${item.unit ?? ""} сегодня`,
    );
    if (!done) {
      actionable.push(item);
    }
  }

  if (items.length === 0) {
    return {
      text: "📋 Сегодня пусто.\n\nМожно написать: «Создай задачу выпить воду» или открыть Chexar.",
      actionable: [],
    };
  }

  return {
    text: lines.join("\n"),
    actionable,
  };
}

async function getContext(config: BotConfig, chatId: number | string, telegramUser: TelegramUser | null): Promise<BotContext> {
  const telegramId = telegramUser?.id ? String(telegramUser.id) : String(chatId);
  const user = await getUserByTelegramId(config, telegramId);
  const settings = user ? await getSettings(config, user.id) : null;

  if (user) {
    await updateUserFromTelegram(config, user, telegramUser);
    await updateBotChatId(config, user.id, chatId);
  }

  return {
    config,
    chatId,
    telegramId,
    telegramUser,
    user,
    settings,
  };
}

function isBotEnabled(settings: RemoteSettings | null): boolean {
  return settings?.telegram_bot_enabled === true;
}

function getLanguage(settings: RemoteSettings | null): string {
  return settings?.language === "en" ? "en" : "ru";
}

async function sendWelcome(ctx: BotContext): Promise<void> {
  await sendMessage(
    ctx.config,
    ctx.chatId,
    [
      WELCOME_MESSAGE,
      "",
      "Кнопки теперь закреплены у поля сообщения.",
      "Выбери действие внизу или напиши задачу обычным текстом.",
    ].join("\n"),
    messagePanelMarkup(ctx.config),
  );
}

async function sendHelp(ctx: BotContext): Promise<void> {
  await sendMessage(
    ctx.config,
    ctx.chatId,
    [
      "❔ Chexar bot",
      "",
      "/menu — открыть кнопки",
      "/today — задачи на сегодня",
      "/help — подсказки",
      "",
      "Примеры:",
      "• Отметь вода",
      "• +10 чтение",
      "• Прочитал 2 урока немецкого",
      "• Создай задачи: вода, тренировка, чтение 20 страниц",
      "",
      "Бот включается в профиле Chexar.",
    ].join("\n"),
    messagePanelMarkup(ctx.config),
  );
}

async function sendCreateGuide(ctx: BotContext): Promise<void> {
  await sendMessage(
    ctx.config,
    ctx.chatId,
    [
      "✨ Создание через чат",
      "",
      "Напиши задачу обычным текстом. Я разберу название, эмодзи, период и формат.",
      "",
      "Примеры:",
      "• Создай немецкий 50 уроков на месяц",
      "• Добавь воду каждый день",
      "• Создай список: уборка, спорт, чтение 20 страниц",
    ].join("\n"),
    messagePanelMarkup(ctx.config),
  );
}

async function sendSettingsGuide(ctx: BotContext): Promise<void> {
  await sendMessage(
    ctx.config,
    ctx.chatId,
    [
      "⚙️ Профиль",
      "",
      "Настройки бота, напоминания и связь аккаунта находятся в профиле Chexar.",
    ].join("\n"),
    messagePanelMarkup(ctx.config),
  );
}

async function handleToday(ctx: BotContext): Promise<void> {
  if (!ctx.user) {
    await sendMessage(ctx.config, ctx.chatId, "Открой Chexar внутри Telegram, чтобы связать профиль.", messagePanelMarkup(ctx.config));
    return;
  }

  if (!isBotEnabled(ctx.settings)) {
    await sendMessage(ctx.config, ctx.chatId, "Бот выключен в профиле Chexar. Включи его в настройках профиля.", messagePanelMarkup(ctx.config));
    return;
  }

  const dateKey = todayKey(ctx.config);
  const items = (await getItems(ctx.config, ctx.user.id)).filter((item) => isItemActiveOnDate(item, dateKey));
  const entries = await getEntriesForDate(ctx.config, ctx.user.id, dateKey);
  const list = await formatTodayList(ctx.config, ctx.user.id, items, entries, dateKey);

  await sendMessage(ctx.config, ctx.chatId, list.text, list.actionable.length > 0 ? todayListMarkup(ctx.config, list.actionable) : secondaryMenuMarkup(ctx.config));
}

async function completeItem(ctx: BotContext, itemId: string): Promise<string> {
  if (!ctx.user) {
    return "Сначала открой Chexar Mini App, чтобы связать аккаунт.";
  }

  const dateKey = todayKey(ctx.config);
  const items = await getItems(ctx.config, ctx.user.id);
  const item = items.find((candidate) => candidate.id === itemId && candidate.tracking_type === "checkbox");
  if (!item) {
    return "Не нашёл эту задачу.";
  }

  await upsertDailyEntry(ctx.config, {
    user_id: ctx.user.id,
    item_id: item.id,
    date: dateKey,
    checked: true,
    value_added: 0,
    note: null,
    completed_at: new Date().toISOString(),
    is_late: false,
    subitem_state: null,
  });

  return `Готово: ${item.title}`;
}

async function addProgress(ctx: BotContext, itemId: string, amount: number): Promise<string> {
  if (!ctx.user) {
    return "Сначала открой Chexar Mini App, чтобы связать аккаунт.";
  }

  const dateKey = todayKey(ctx.config);
  const items = await getItems(ctx.config, ctx.user.id);
  const item = items.find((candidate) => candidate.id === itemId && candidate.tracking_type === "quantity");
  if (!item) {
    return "Не нашёл количественную задачу.";
  }

  const existing = await getEntry(ctx.config, ctx.user.id, item.id, dateKey);
  const nextValue = Number(existing?.value_added ?? 0) + amount;

  await upsertDailyEntry(ctx.config, {
    user_id: ctx.user.id,
    item_id: item.id,
    date: dateKey,
    checked: null,
    value_added: nextValue,
    note: existing?.note ?? null,
    completed_at: new Date().toISOString(),
    is_late: false,
    subitem_state: existing?.subitem_state ?? null,
  });

  return `Добавил ${amount} ${item.unit ?? ""}: ${item.title}`;
}

async function handleActionText(ctx: BotContext, text: string): Promise<void> {
  if (!ctx.user) {
    await sendMessage(ctx.config, ctx.chatId, "Открой Chexar внутри Telegram, чтобы связать профиль.", messagePanelMarkup(ctx.config));
    return;
  }

  if (!isBotEnabled(ctx.settings)) {
    await sendMessage(ctx.config, ctx.chatId, "Бот выключен в профиле Chexar. Включи его в настройках профиля.", messagePanelMarkup(ctx.config));
    return;
  }

  await sendChatAction(ctx.config, ctx.chatId);

  const dateKey = todayKey(ctx.config);
  const todayItems = (await getItems(ctx.config, ctx.user.id)).filter((item) => isItemActiveOnDate(item, dateKey));

  if (isProgressIntent(text)) {
    const amount = getAmountFromText(text);
    const item = findBestItem(todayItems, text, "quantity");
    if (item && amount) {
      await sendMessage(ctx.config, ctx.chatId, await addProgress(ctx, item.id, amount));
      return;
    }
  }

  if (isDoneIntent(text)) {
    const item = findBestItem(todayItems, text, "checkbox");
    if (item) {
      await sendMessage(ctx.config, ctx.chatId, await completeItem(ctx, item.id));
      return;
    }
  }

  const drafts = await requestAiDrafts(text, ctx.config, getLanguage(ctx.settings));
  const created = await createItemsFromDrafts(ctx.config, ctx.user.id, drafts);

  if (created.length === 0) {
    await sendMessage(ctx.config, ctx.chatId, "Не разобрал сообщение. Попробуй: «Создай задачу выпить воду» или нажми «Помощь».", messagePanelMarkup(ctx.config));
    return;
  }

  await sendMessage(
    ctx.config,
    ctx.chatId,
    [`✨ Создал в Chexar:`, "", ...created.map((item) => `${getEmoji(item)} ${item.title}`)].join("\n"),
    messagePanelMarkup(ctx.config),
  );
}

async function handleCallback(config: BotConfig, callback: TelegramCallbackQuery): Promise<void> {
  const chatId = callback.message?.chat?.id;
  if (chatId === undefined) {
    await answerCallback(config, callback.id, "Нет chat_id.");
    return;
  }

  const ctx = await getContext(config, chatId, callback.from ?? null);
  const [kind, itemId, rawAmount] = (callback.data ?? "").split(":");

  if (kind === "menu") {
    await answerCallback(config, callback.id);
    await sendChatAction(config, chatId);
    await deleteMessage(config, chatId, callback.message?.message_id);

    if (itemId === "home") {
      await sendWelcome(ctx);
      return;
    }

    if (itemId === "help") {
      await sendHelp(ctx);
      return;
    }

    if (itemId === "create") {
      await sendCreateGuide(ctx);
      return;
    }

    if (itemId === "settings") {
      await sendSettingsGuide(ctx);
      return;
    }

    if (itemId === "today") {
      await handleToday(ctx);
      return;
    }
  }

  if (kind === "hint") {
    await answerCallback(config, callback.id, "Выбери количество на кнопках ниже.");
    return;
  }

  if (!isBotEnabled(ctx.settings)) {
    await answerCallback(config, callback.id, "Бот выключен в профиле.");
    return;
  }

  if (kind === "done" && itemId) {
    const message = await completeItem(ctx, itemId);
    await answerCallback(config, callback.id, message);
    await sendChatAction(config, chatId);
    await deleteMessage(config, chatId, callback.message?.message_id);
    await handleToday(ctx);
    return;
  }

  if (kind === "progress" && itemId) {
    const amount = Number(rawAmount);
    const message = await addProgress(ctx, itemId, Number.isFinite(amount) && amount > 0 ? amount : 1);
    await answerCallback(config, callback.id, message);
    await sendChatAction(config, chatId);
    await deleteMessage(config, chatId, callback.message?.message_id);
    await handleToday(ctx);
    return;
  }

  await answerCallback(config, callback.id, "Команда устарела.");
}

export async function handleTelegramWebhook(update: TelegramUpdate): Promise<void> {
  const config = getConfig();

  if (update.callback_query) {
    await handleCallback(config, update.callback_query);
    return;
  }

  const message = update.message;
  const chatId = message?.chat?.id;
  if (chatId === undefined) {
    return;
  }

  const ctx = await getContext(config, chatId, message?.from ?? null);
  const command = getCommand(message?.text);

  if (command === "start" || command === "menu") {
    await sendWelcome(ctx);
    return;
  }

  if (command === "help") {
    await sendHelp(ctx);
    return;
  }

  if (command === "create") {
    await sendCreateGuide(ctx);
    return;
  }

  if (command === "settings") {
    await sendSettingsGuide(ctx);
    return;
  }

  if (command === "today" || command === "tasks") {
    await handleToday(ctx);
    return;
  }

  const text = message?.text?.trim();
  if (text) {
    const normalized = normalizeSearchText(text);
    if (normalized === "меню" || normalized === "menu") {
      await sendWelcome(ctx);
      return;
    }

    if (normalized === "сегодня" || normalized === "today") {
      await handleToday(ctx);
      return;
    }

    if (normalized === "помощь" || normalized === "help") {
      await sendHelp(ctx);
      return;
    }

    if (normalized === "создать" || normalized === "create") {
      await sendCreateGuide(ctx);
      return;
    }

    if (normalized === "профиль" || normalized === "настройки" || normalized === "settings") {
      await sendSettingsGuide(ctx);
      return;
    }

    await handleActionText(ctx, text);
  }
}

export function isCronAuthorized(req: RequestLike): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return true;
  }

  const rawHeader = req.headers?.authorization ?? req.headers?.Authorization;
  const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  return header === `Bearer ${secret}`;
}

async function getReminderSettings(config: BotConfig): Promise<RemoteSettings[]> {
  return supabaseFetch<RemoteSettings[]>(
    config,
    queryPath("settings", {
      telegram_bot_enabled: "eq.true",
      telegram_reminders_enabled: "eq.true",
      select: "*",
    }),
  );
}

export async function sendDailyReminders(): Promise<{ sent: number; skipped: number }> {
  const config = getConfig();
  const dateKey = todayKey(config);
  const settingsRows = await getReminderSettings(config);
  let sent = 0;
  let skipped = 0;

  for (const settings of settingsRows) {
    try {
      const users = await supabaseFetch<RemoteUser[]>(
        config,
        queryPath("users", {
          id: `eq.${settings.user_id}`,
          select: "*",
          limit: "1",
        }),
      );
      const user = users[0];
      if (!user) {
        skipped += 1;
        continue;
      }

      const chatId = settings.telegram_chat_id ?? user.telegram_id;
      const items = (await getItems(config, user.id)).filter((item) => isItemActiveOnDate(item, dateKey));
      const entries = await getEntriesForDate(config, user.id, dateKey);
      const list = await formatTodayList(config, user.id, items, entries, dateKey);

      if (items.length === 0) {
        skipped += 1;
        continue;
      }

      await sendMessage(config, chatId, `Напоминание Chexar\n\n${list.text}`, list.actionable.length > 0 ? todayListMarkup(config, list.actionable) : secondaryMenuMarkup(config));
      sent += 1;
    } catch {
      skipped += 1;
    }
  }

  return { sent, skipped };
}
