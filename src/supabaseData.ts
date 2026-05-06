import { supabase } from "./lib/supabase";
import { getTelegramUser, isBrowserFallbackAllowed, isTelegramUserMissing } from "./lib/telegram";
import { getDailyCompletionPercent } from "./calculations";
import { addDays, parseDateKey, todayKey } from "./dateUtils";
import type { ActionSubitem, ActionSubitemStateByDate, ActionSubitemState, ActionTimerStateByDate, AppSettings, AppState, DailyRecord, GoalRepeatMode, ProgressEntry, ProgressGoal, TaskItem, TaskRepeatMode } from "./types";

const BROWSER_USER_KEY = "chexar:browser-user-id";

type RemoteUser = {
  id: string;
  telegram_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  language_code: string | null;
};

type RemoteItem = {
  id: string;
  user_id: string;
  title: string;
  note?: string | null;
  icon: string | null;
  tracking_type: "checkbox" | "quantity";
  repeat_mode: "once" | "daily" | "weekdays" | "selected_days";
  start_date: string;
  end_date: string | null;
  selected_days: number[] | null;
  due_time?: string | null;
  target_value: number | null;
  unit: string | null;
  quick_add_values?: number[] | null;
  subitems?: unknown;
  timer_minutes?: number | null;
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
  timer_seconds_done?: number | null;
  timer_completed?: boolean | null;
};

type RemoteSettings = {
  user_id: string;
  language: string | null;
  theme: string | null;
  tips_enabled: boolean | null;
  onboarding_completed: boolean | null;
};

export type RemoteLoadResult = {
  user: RemoteUser;
  appState: AppState;
  settings: AppSettings;
  dayRecords: DailyRecord[];
};

export function hasRemotePersistence(): boolean {
  return supabase !== null;
}

export async function loadRemoteData(currentSettings: AppSettings): Promise<RemoteLoadResult> {
  const client = requireSupabase();
  await runSupabaseStep("health check", async () => {
    const result = await client.from("users").select("id").limit(1);
    throwIfPostgrestError("health check", result.error);
  });

  const userIdentity = getUserIdentity();
  const user = await runSupabaseStep("user bootstrap", () => findOrCreateUser(userIdentity));
  const [{ data: itemRows, error: itemsError }, { data: entryRows, error: entriesError }, settingsResult] = await runSupabaseStep(
    "load user data",
    () =>
      Promise.all([
        client
          .from("items")
          .select("*")
          .eq("user_id", user.id)
          .eq("archived", false)
          .order("created_at", { ascending: true }),
        client
          .from("daily_entries")
          .select("*")
          .eq("user_id", user.id)
          .order("date", { ascending: true }),
        client
          .from("settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]),
  );

  throwIfPostgrestError("load items", itemsError);
  throwIfPostgrestError("load daily_entries", entriesError);
  throwIfPostgrestError("load settings", settingsResult.error);

  const settings = normalizeSettings(settingsResult.data as RemoteSettings | null, currentSettings);

  if (!settingsResult.data) {
    await runSupabaseStep("settings bootstrap", () => saveRemoteSettings(user.id, settings));
  }

  const appState = rowsToAppState((itemRows ?? []) as RemoteItem[], (entryRows ?? []) as RemoteDailyEntry[]);

  return {
    user,
    appState,
    settings,
    dayRecords: deriveDailyRecords(appState),
  };
}

export async function saveRemoteSnapshot(userId: string, appState: AppState, settings: AppSettings): Promise<void> {
  const client = requireSupabase();
  const itemRows = appStateToItemRows(userId, appState);
  const entryRows = appStateToEntryRows(userId, appState);
  const existingItems = await client.from("items").select("id").eq("user_id", userId);

  if (existingItems.error) {
    throw existingItems.error;
  }

  const nextItemIds = new Set(itemRows.map((item) => item.id));
  const itemIdsToArchive = (existingItems.data ?? [])
    .map((item) => item.id as string)
    .filter((id) => !nextItemIds.has(id));

  if (itemRows.length > 0) {
    const { error } = await client.from("items").upsert(itemRows, { onConflict: "id" });

    if (error) {
      throw error;
    }
  }

  if (itemIdsToArchive.length > 0) {
    const { error } = await client
      .from("items")
      .update({ archived: true, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("id", itemIdsToArchive);

    if (error) {
      throw error;
    }
  }

  const deleteEntries = await client.from("daily_entries").delete().eq("user_id", userId);

  if (deleteEntries.error) {
    throw deleteEntries.error;
  }

  if (entryRows.length > 0) {
    const { error } = await client.from("daily_entries").insert(entryRows);

    if (error) {
      throw error;
    }
  }

  await saveRemoteSettings(userId, settings);
}

async function runSupabaseStep<T>(stage: string, action: () => Promise<T>): Promise<T> {
  try {
    const result = await action();

    if (import.meta.env.DEV) {
      console.info(`[supabase] ${stage} ok`);
    }

    return result;
  } catch (error) {
    console.error(`[supabase] ${stage} failed`, getSupabaseErrorDetails(error));
    throw error;
  }
}

function throwIfPostgrestError(stage: string, error: unknown): void {
  if (!error) {
    return;
  }

  console.error(`[supabase] ${stage} query failed`, getSupabaseErrorDetails(error));
  throw error;
}

function getSupabaseErrorDetails(error: unknown) {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;

    return {
      message: typeof record.message === "string" ? record.message : String(error),
      code: record.code,
      details: record.details,
      hint: record.hint,
    };
  }

  return {
    message: String(error),
  };
}

export async function saveRemoteSettings(userId: string, settings: AppSettings): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("settings").upsert(
    {
      user_id: userId,
      language: settings.language,
      theme: settings.theme,
      tips_enabled: settings.hintsEnabled,
      onboarding_completed: settings.onboardingCompleted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw error;
  }
}

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  return supabase;
}

async function findOrCreateUser(identity: Omit<RemoteUser, "id">): Promise<RemoteUser> {
  const client = requireSupabase();
  const existing = await client
    .from("users")
    .select("*")
    .eq("telegram_id", identity.telegram_id)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data) {
    const updated = await client
      .from("users")
      .update({
        username: identity.username,
        first_name: identity.first_name,
        last_name: identity.last_name,
        photo_url: identity.photo_url,
        language_code: identity.language_code,
      })
      .eq("id", (existing.data as RemoteUser).id)
      .select("*")
      .single();

    if (updated.error) {
      throw updated.error;
    }

    return updated.data as RemoteUser;
  }

  const created = await client
    .from("users")
    .insert(identity)
    .select("*")
    .single();

  if (created.error) {
    throw created.error;
  }

  return created.data as RemoteUser;
}

function getUserIdentity(): Omit<RemoteUser, "id"> {
  const telegramUser = getTelegramUser();

  if (telegramUser) {
    return {
      telegram_id: String(telegramUser.id),
      username: telegramUser.username ?? null,
      first_name: telegramUser.first_name ?? null,
      last_name: telegramUser.last_name ?? null,
      photo_url: telegramUser.photo_url ?? null,
      language_code: telegramUser.language_code ?? null,
    };
  }

  if (isTelegramUserMissing()) {
    throw new Error("Telegram WebApp is open, but initDataUnsafe.user is missing.");
  }

  if (!isBrowserFallbackAllowed()) {
    throw new Error("Telegram user is required outside local development and Vercel preview.");
  }

  return {
    telegram_id: `browser:${getBrowserUserId()}`,
    username: "browser",
    first_name: "Browser",
    last_name: null,
    photo_url: null,
    language_code: null,
  };
}

function getBrowserUserId(): string {
  const existing = localStorage.getItem(BROWSER_USER_KEY);

  if (existing) {
    return existing;
  }

  const next = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  localStorage.setItem(BROWSER_USER_KEY, next);

  return next;
}

function normalizeSettings(row: RemoteSettings | null, fallback: AppSettings): AppSettings {
  return {
    language: row?.language === "en" || row?.language === "ru" ? row.language : fallback.language,
    theme: row?.theme === "light" || row?.theme === "dark" || row?.theme === "system" ? row.theme : fallback.theme,
    hintsEnabled: typeof row?.tips_enabled === "boolean" ? row.tips_enabled : fallback.hintsEnabled,
    onboardingCompleted: typeof row?.onboarding_completed === "boolean" ? row.onboarding_completed : fallback.onboardingCompleted,
  };
}

function rowsToAppState(items: RemoteItem[], entries: RemoteDailyEntry[]): AppState {
  const entriesByItem = new Map<string, RemoteDailyEntry[]>();

  entries.forEach((entry) => {
    entriesByItem.set(entry.item_id, [...(entriesByItem.get(entry.item_id) ?? []), entry]);
  });

  const goals: ProgressGoal[] = [];
  const tasks: TaskItem[] = [];
  const currentToday = todayKey();

  items.forEach((item) => {
    const itemEntries = entriesByItem.get(item.id) ?? [];

    if (item.tracking_type === "quantity") {
      const progressEntries: ProgressEntry[] = itemEntries
        .filter((entry) => Number(entry.value_added ?? 0) > 0)
        .map((entry) => ({
          id: entry.id,
          date: entry.date,
          amount: Number(entry.value_added ?? 0),
          note: entry.note?.trim() || undefined,
        }));

      goals.push({
        id: item.id,
        title: item.title,
        note: item.note?.trim() || undefined,
        iconType: item.icon ? "custom" : "letter",
        iconKey: item.icon ?? undefined,
        targetValue: Number(item.target_value ?? 0),
        currentValue: progressEntries.reduce((total, entry) => total + entry.amount, 0),
        unit: item.unit ?? "",
        startDate: item.start_date,
        endDate: getRemoteEffectiveEndDate(item),
        repeatMode: fromRemoteGoalRepeat(item.repeat_mode),
        selectedDays: item.repeat_mode === "selected_days" ? (item.selected_days ?? []) : undefined,
        dueTime: normalizeRemoteDueTime(item.due_time),
        quickAddValues: sanitizeQuickValues(item.quick_add_values, item.unit ?? ""),
        progressEntries,
        completedAtByDate: getCompletedAtByDate(itemEntries),
        lateDates: getLateDates(itemEntries),
      });

      return;
    }

    const subitems = normalizeRemoteSubitems(item.subitems);
    const subitemStateByDate = normalizeRemoteSubitemStateByDate(itemEntries, subitems);
    const timerMinutes = subitems.length === 0 ? normalizeRemoteTimerMinutes(item.timer_minutes) : undefined;
    const timerStateByDate = timerMinutes ? normalizeRemoteTimerStateByDate(itemEntries, timerMinutes) : {};
    const completedDates = itemEntries
      .filter(
        (entry) =>
          entry.checked === true ||
          isRemoteSubitemEntryComplete(subitems, subitemStateByDate[entry.date]) ||
          timerStateByDate[entry.date]?.completed === true,
      )
      .map((entry) => entry.date)
      .sort();

    tasks.push({
      id: item.id,
      title: item.title,
      note: item.note?.trim() || undefined,
      iconType: item.icon ? "custom" : "letter",
      iconKey: item.icon ?? undefined,
      priority: "medium",
      startDate: item.start_date,
      endDate: getRemoteEffectiveEndDate(item),
      repeatMode: fromRemoteTaskRepeat(item.repeat_mode),
      selectedDays: item.repeat_mode === "selected_days" ? (item.selected_days ?? []) : undefined,
      dueTime: normalizeRemoteDueTime(item.due_time),
      date: item.start_date,
      completed: completedDates.includes(currentToday),
      completedDates,
      completedAtByDate: getCompletedAtByDate(itemEntries),
      lateDates: getLateDates(itemEntries),
      subitems: subitems.length > 0 ? subitems : undefined,
      subitemStateByDate: Object.keys(subitemStateByDate).length > 0 ? subitemStateByDate : undefined,
      timerMinutes,
      timerStateByDate: Object.keys(timerStateByDate).length > 0 ? timerStateByDate : undefined,
    });
  });

  return { goals, tasks };
}

function appStateToItemRows(userId: string, appState: AppState) {
  return [
    ...appState.goals.map((goal) => ({
      id: goal.id,
      user_id: userId,
      title: goal.title.trim(),
      note: goal.note?.trim() || null,
      icon: goal.iconKey ?? null,
      tracking_type: "quantity",
      repeat_mode: toRemoteRepeat(goal.repeatMode),
      start_date: goal.startDate,
      end_date: goal.endDate,
      selected_days: goal.repeatMode === "selectedDays" ? (goal.selectedDays ?? []) : null,
      due_time: goal.dueTime ?? null,
      target_value: goal.targetValue,
      unit: goal.unit,
      quick_add_values: goal.quickAddValues,
      subitems: null,
      timer_minutes: null,
      archived: false,
      updated_at: new Date().toISOString(),
    })),
    ...appState.tasks.map((task) => ({
      id: task.id,
      user_id: userId,
      title: task.title.trim(),
      note: task.note?.trim() || null,
      icon: task.iconKey ?? null,
      tracking_type: "checkbox",
      repeat_mode: toRemoteRepeat(task.repeatMode),
      start_date: task.startDate,
      end_date: task.endDate,
      selected_days: task.repeatMode === "selectedDays" ? (task.selectedDays ?? []) : null,
      due_time: task.dueTime ?? null,
      target_value: null,
      unit: null,
      quick_add_values: null,
      subitems: normalizeRemoteSubitems(task.subitems),
      timer_minutes: task.subitems && task.subitems.length > 0 ? null : (task.timerMinutes ?? null),
      archived: false,
      updated_at: new Date().toISOString(),
    })),
  ];
}

function appStateToEntryRows(userId: string, appState: AppState) {
  const quantityEntries = appState.goals.flatMap((goal) => {
    const grouped = new Map<string, { amount: number; notes: string[] }>();

    goal.progressEntries.forEach((entry) => {
      const existing = grouped.get(entry.date) ?? { amount: 0, notes: [] };
      existing.amount += entry.amount;

      if (entry.note?.trim()) {
        existing.notes.push(entry.note.trim());
      }

      grouped.set(entry.date, existing);
    });

    return Array.from(grouped.entries()).map(([date, entry]) => ({
      user_id: userId,
      item_id: goal.id,
      date,
      checked: null,
      value_added: entry.amount,
      subitem_state: null,
      timer_seconds_done: null,
      timer_completed: null,
      completed_at: goal.completedAtByDate?.[date] ?? null,
      is_late: goal.lateDates?.includes(date) ?? false,
      note: entry.notes.length > 0 ? Array.from(new Set(entry.notes)).join(" · ") : null,
      updated_at: new Date().toISOString(),
    }));
  });

  const checkboxEntries = appState.tasks.flatMap((task) => {
    const dates = new Set([...(task.completedDates ?? []), ...Object.keys(task.subitemStateByDate ?? {}), ...Object.keys(task.timerStateByDate ?? {})]);

    return Array.from(dates)
      .sort()
      .map((date) => ({
        user_id: userId,
        item_id: task.id,
        date,
        checked: (task.completedDates?.includes(date) ?? false) || task.timerStateByDate?.[date]?.completed === true,
        value_added: 0,
        note: null,
        subitem_state: task.subitemStateByDate?.[date] ?? null,
        timer_seconds_done: task.timerStateByDate?.[date]?.secondsDone ?? null,
        timer_completed: task.timerStateByDate?.[date]?.completed ?? false,
        completed_at: task.completedAtByDate?.[date] ?? null,
        is_late: task.lateDates?.includes(date) ?? false,
        updated_at: new Date().toISOString(),
      }));
  });

  return [...quantityEntries, ...checkboxEntries];
}

function deriveDailyRecords(appState: AppState): DailyRecord[] {
  const dates = new Set<string>();

  appState.goals.forEach((goal) => goal.progressEntries.forEach((entry) => dates.add(entry.date)));
  appState.goals.forEach((goal) => Object.keys(goal.completedAtByDate ?? {}).forEach((date) => dates.add(date)));
  appState.tasks.forEach((task) => task.completedDates?.forEach((date) => dates.add(date)));
  appState.tasks.forEach((task) => Object.keys(task.subitemStateByDate ?? {}).forEach((date) => dates.add(date)));
  appState.tasks.forEach((task) => Object.keys(task.timerStateByDate ?? {}).forEach((date) => dates.add(date)));

  return Array.from(dates)
    .sort()
    .map((date) => {
      const percent = getDailyCompletionPercent(parseDateKey(date), appState.goals, appState.tasks);

      return {
        date,
        percent,
        active: percent > 0,
      };
    });
}

function toRemoteRepeat(repeatMode: GoalRepeatMode | TaskRepeatMode): RemoteItem["repeat_mode"] {
  if (repeatMode === "everyDay") {
    return "daily";
  }

  if (repeatMode === "selectedDays") {
    return "selected_days";
  }

  return repeatMode;
}

function fromRemoteGoalRepeat(repeatMode: RemoteItem["repeat_mode"]): GoalRepeatMode {
  if (repeatMode === "daily" || repeatMode === "once") {
    return "everyDay";
  }

  if (repeatMode === "selected_days") {
    return "selectedDays";
  }

  return repeatMode;
}

function fromRemoteTaskRepeat(repeatMode: RemoteItem["repeat_mode"]): TaskRepeatMode {
  if (repeatMode === "daily") {
    return "everyDay";
  }

  if (repeatMode === "selected_days") {
    return "selectedDays";
  }

  return repeatMode;
}

function getRemoteEffectiveEndDate(item: RemoteItem): string {
  if (item.end_date) {
    return item.end_date;
  }

  if (item.repeat_mode === "once") {
    return item.start_date;
  }

  return addDays(item.start_date, 29);
}

function normalizeRemoteSubitems(value: unknown): ActionSubitem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((subitem): ActionSubitem | null => {
      if (!subitem || typeof subitem !== "object") {
        return null;
      }

      const record = subitem as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title.trim() : "";

      if (!title) {
        return null;
      }

      const targetCount = Number(record.targetCount);

      const normalized: ActionSubitem = {
        id: typeof record.id === "string" && record.id.trim() ? record.id : globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2),
        title,
      };

      if (Number.isFinite(targetCount) && targetCount > 1) {
        normalized.targetCount = Math.floor(targetCount);
      }

      return normalized;
    })
    .filter((subitem): subitem is ActionSubitem => subitem !== null);
}

function normalizeRemoteSubitemStateByDate(entries: RemoteDailyEntry[], subitems: ActionSubitem[]): ActionSubitemStateByDate {
  const subitemIds = new Set(subitems.map((subitem) => subitem.id));
  const result: ActionSubitemStateByDate = {};

  entries.forEach((entry) => {
    if (!entry.subitem_state || typeof entry.subitem_state !== "object") {
      return;
    }

    const dayState: Record<string, ActionSubitemState> = {};

    Object.entries(entry.subitem_state as Record<string, unknown>).forEach(([subitemId, state]) => {
      if (!subitemIds.has(subitemId) || !state || typeof state !== "object") {
        return;
      }

      const record = state as Record<string, unknown>;
      const count = Number(record.count);
      dayState[subitemId] = {
        completed: record.completed === true,
        count: Number.isFinite(count) && count > 0 ? count : undefined,
      };
    });

    if (Object.keys(dayState).length > 0) {
      result[entry.date] = dayState;
    }
  });

  return result;
}

function isRemoteSubitemEntryComplete(subitems: ActionSubitem[], state: Record<string, ActionSubitemState> | undefined): boolean {
  return (
    subitems.length > 0 &&
    subitems.every((subitem) => {
      const subitemState = state?.[subitem.id];

      if (subitem.targetCount && subitem.targetCount > 1) {
        return Number(subitemState?.count ?? 0) >= subitem.targetCount;
      }

      return subitemState?.completed === true;
    })
  );
}

function normalizeRemoteTimerMinutes(value: unknown): number | undefined {
  const minutes = Number(value);

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return undefined;
  }

  return Math.max(Math.round(minutes * 100) / 100, 0);
}

function normalizeRemoteTimerStateByDate(entries: RemoteDailyEntry[], timerMinutes: number): ActionTimerStateByDate {
  const result: ActionTimerStateByDate = {};
  const totalSeconds = Math.max(Math.round(timerMinutes * 60), 1);

  entries.forEach((entry) => {
    const secondsDone = Math.max(Math.round(Number(entry.timer_seconds_done ?? 0)), 0);
    const completed = entry.timer_completed === true || secondsDone >= totalSeconds;

    if (secondsDone > 0 || completed || entry.checked === true) {
      result[entry.date] = {
        secondsDone: secondsDone > 0 ? Math.min(secondsDone, totalSeconds) : undefined,
        completed: completed || entry.checked === true,
      };
    }
  });

  return result;
}

function normalizeRemoteDueTime(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const match = value.match(/^(\d{1,2}):(\d{2})/);

  if (!match) {
    return undefined;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return undefined;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getCompletedAtByDate(entries: RemoteDailyEntry[]): Record<string, string> | undefined {
  const result: Record<string, string> = {};

  entries.forEach((entry) => {
    if (entry.completed_at) {
      result[entry.date] = entry.completed_at;
    }
  });

  return Object.keys(result).length > 0 ? result : undefined;
}

function getLateDates(entries: RemoteDailyEntry[]): string[] | undefined {
  const dates = entries.filter((entry) => entry.is_late === true).map((entry) => entry.date).sort();

  return dates.length > 0 ? dates : undefined;
}

function sanitizeQuickValues(values: number[] | null | undefined, unit: string): number[] {
  const parsed = Array.from(new Set((values ?? []).map(Number).filter((value) => Number.isFinite(value) && value > 0))).sort((a, b) => a - b);

  if (parsed.length > 0) {
    return parsed;
  }

  const normalizedUnit = unit.toLowerCase();

  if (normalizedUnit.includes("стра")) {
    return [10, 25];
  }

  if (normalizedUnit.includes("км")) {
    return [1, 5];
  }

  if (normalizedUnit.includes("урок")) {
    return [1, 2];
  }

  return [1, 5];
}
