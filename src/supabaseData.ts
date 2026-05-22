import { supabase } from "./lib/supabase";
import { getTelegramUser, isBrowserFallbackAllowed, isTelegramUserMissing } from "./lib/telegram";
import { getDailyCompletionPercent } from "./calculations";
import { addDays, parseDateKey, todayKey } from "./dateUtils";
import type { ActionSubitem, ActionSubitemStateByDate, ActionSubitemState, AppSettings, AppState, DailyRecord, GoalPeriodType, GoalRepeatMode, ProgressEntry, ProgressGoal, TaskItem, TaskOccurrence, TaskRepeatMode } from "./types";

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
  group_name?: string | null;
  note?: string | null;
  emoji?: string | null;
  icon: string | null;
  tracking_type: "checkbox" | "quantity";
  period_type?: GoalPeriodType | null;
  repeat_mode: "once" | "daily" | "weekdays" | "selected_days";
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

type RemoteTaskOccurrence = {
  id: string;
  user_id: string;
  task_id: string;
  date: string;
  status: "active" | "completed" | "skipped";
  source: string | null;
  moved_from_date: string | null;
  is_carry_over: boolean | null;
  created_at: string | null;
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

type RemoteSettings = {
  user_id: string;
  language: string | null;
  theme: string | null;
  tips_enabled: boolean | null;
  onboarding_completed: boolean | null;
  telegram_bot_enabled?: boolean | null;
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
  const [{ data: itemRows, error: itemsError }, { data: entryRows, error: entriesError }, { data: occurrenceRows, error: occurrencesError }, settingsResult] = await runSupabaseStep(
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
          .from("task_occurrences")
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
  if (occurrencesError && !isMissingRelationError(occurrencesError)) {
    throwIfPostgrestError("load task_occurrences", occurrencesError);
  } else if (occurrencesError) {
    warnOptionalSchema("task_occurrences table is missing; carry-over/date-skip entries will stay local until the migration is applied.");
  }
  throwIfPostgrestError("load settings", settingsResult.error);

  const settings = normalizeSettings(settingsResult.data as RemoteSettings | null, currentSettings);

  if (!settingsResult.data) {
    await runSupabaseStep("settings bootstrap", () => saveRemoteSettings(user.id, settings));
  }

  const appState = rowsToAppState(
    sortRemoteItems((itemRows ?? []) as RemoteItem[]),
    (entryRows ?? []) as RemoteDailyEntry[],
    occurrencesError ? [] : (occurrenceRows ?? []) as RemoteTaskOccurrence[],
  );

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
  const occurrenceRows = appStateToOccurrenceRows(userId, appState);
  const existingItems = await client.from("items").select("id").eq("user_id", userId);

  if (existingItems.error) {
    throw existingItems.error;
  }

  const nextItemIds = new Set(itemRows.map((item) => item.id));
  const itemIdsToArchive = (existingItems.data ?? [])
    .map((item) => item.id as string)
    .filter((id) => !nextItemIds.has(id));

  if (itemRows.length > 0) {
    await upsertItemRowsWithFallback(client, itemRows);
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

  const deleteOccurrences = await client.from("task_occurrences").delete().eq("user_id", userId);
  const occurrenceTableAvailable = !deleteOccurrences.error || !isMissingRelationError(deleteOccurrences.error);

  if (deleteOccurrences.error) {
    if (isMissingRelationError(deleteOccurrences.error)) {
      warnOptionalSchema("task_occurrences table is missing; carry-over/date-skip entries will stay local until the migration is applied.");
    } else {
      throw deleteOccurrences.error;
    }
  }

  if (occurrenceTableAvailable && occurrenceRows.length > 0) {
    const { error } = await client.from("task_occurrences").insert(occurrenceRows);

    if (error) {
      if (isMissingRelationError(error)) {
        warnOptionalSchema("task_occurrences table is missing; carry-over/date-skip entries will stay local until the migration is applied.");
      } else {
        throw error;
      }
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
  const row = {
    user_id: userId,
    language: settings.language,
    theme: settings.theme,
    tips_enabled: settings.hintsEnabled,
    onboarding_completed: settings.onboardingCompleted,
    telegram_bot_enabled: settings.telegramBotEnabled,
    updated_at: new Date().toISOString(),
  };
  const { error } = await client.from("settings").upsert(row, { onConflict: "user_id" });

  if (error) {
    const missingColumn = getMissingColumnName(error);
    if (missingColumn === "telegram_bot_enabled") {
      warnOptionalSchema("settings.telegram_bot_enabled is missing; Telegram bot toggle will stay local until the migration is applied.");
      const fallbackRow = omitRemoteColumn(row, "telegram_bot_enabled");
      const fallback = await client.from("settings").upsert(fallbackRow, { onConflict: "user_id" });
      if (!fallback.error) {
        return;
      }
    }

    throw error;
  }
}

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  return supabase;
}

const OPTIONAL_ITEM_COLUMNS = new Set([
  "group_name",
  "note",
  "emoji",
  "period_type",
  "quick_add_values",
  "subitems",
  "sort_order",
  "due_time",
]);
const optionalSchemaWarnings = new Set<string>();
const knownIconKeys = new Set([
  "book",
  "target",
  "dumbbell",
  "run",
  "home",
  "cart",
  "language",
  "star",
  "fire",
  "plus",
  "graduation",
  "droplet",
  "clock",
  "calendar",
  "moon",
  "pill",
  "shield",
  "phone",
  "mail",
]);
const emojiSegmentPattern =
  /(?:\p{Regional_Indicator}{2})|(?:[#*0-9]\uFE0F?\u20E3)|(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:[\uFE0F\uFE0E]|\p{Emoji_Modifier})?(?:\u200D[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:[\uFE0F\uFE0E]|\p{Emoji_Modifier})?)*)/gu;

function normalizeEmoji(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return Array.from(value.trim().matchAll(emojiSegmentPattern), (match) => match[0]).slice(0, 2).join("") || undefined;
}

function normalizeIconValue(value: unknown): { iconKey?: string; emoji?: string } {
  const icon = typeof value === "string" ? value.trim() : "";

  if (!icon) {
    return {};
  }

  if (knownIconKeys.has(icon)) {
    return { iconKey: icon };
  }

  const emoji = normalizeEmoji(icon);

  return emoji ? { emoji } : { iconKey: icon };
}

function sortRemoteItems(items: RemoteItem[]): RemoteItem[] {
  return [...items].sort((left, right) => {
    const leftOrder = typeof left.sort_order === "number" ? left.sort_order : Number.POSITIVE_INFINITY;
    const rightOrder = typeof right.sort_order === "number" ? right.sort_order : Number.POSITIVE_INFINITY;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.start_date.localeCompare(right.start_date) || left.title.localeCompare(right.title);
  });
}

async function upsertItemRowsWithFallback(
  client: ReturnType<typeof requireSupabase>,
  itemRows: Array<Record<string, unknown>>,
): Promise<void> {
  let rows = itemRows.map((row) => ({ ...row }));
  const omittedColumns = new Set<string>();

  for (let attempt = 0; attempt <= OPTIONAL_ITEM_COLUMNS.size; attempt += 1) {
    const { error } = await client.from("items").upsert(rows, { onConflict: "id" });

    if (!error) {
      return;
    }

    const missingColumn = getMissingColumnName(error);

    if (!missingColumn || !OPTIONAL_ITEM_COLUMNS.has(missingColumn) || omittedColumns.has(missingColumn)) {
      throw error;
    }

    omittedColumns.add(missingColumn);
    rows = rows.map((row) => omitRemoteColumn(row, missingColumn));
    warnOptionalSchema(`items.${missingColumn} is missing; this field will stay local until the migration is applied.`);
  }
}

function omitRemoteColumn(row: Record<string, unknown>, column: string): Record<string, unknown> {
  const next = { ...row };
  delete next[column];
  return next;
}

function getMissingColumnName(error: unknown): string | null {
  const details = getSupabaseErrorDetails(error);
  const message = details.message;
  const schemaCacheMatch = message.match(/Could not find the '([^']+)' column/i);
  const sqlMatch = message.match(/column (?:items\.|settings\.)?([a-z_]+) does not exist/i);
  const column = schemaCacheMatch?.[1] ?? sqlMatch?.[1] ?? null;

  return column?.trim() || null;
}

function isMissingRelationError(error: unknown): boolean {
  const details = getSupabaseErrorDetails(error);
  const code = String(details.code ?? "");

  return code === "PGRST205" || /Could not find the table/i.test(details.message);
}

function warnOptionalSchema(message: string): void {
  if (import.meta.env.DEV && !optionalSchemaWarnings.has(message)) {
    optionalSchemaWarnings.add(message);
    console.warn(`[supabase] optional schema missing: ${message}`);
  }
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
    telegramBotEnabled: typeof row?.telegram_bot_enabled === "boolean" ? row.telegram_bot_enabled : fallback.telegramBotEnabled,
  };
}

function rowsToAppState(items: RemoteItem[], entries: RemoteDailyEntry[], occurrences: RemoteTaskOccurrence[]): AppState {
  const entriesByItem = new Map<string, RemoteDailyEntry[]>();

  entries.forEach((entry) => {
    entriesByItem.set(entry.item_id, [...(entriesByItem.get(entry.item_id) ?? []), entry]);
  });

  const goals: ProgressGoal[] = [];
  const tasks: TaskItem[] = [];
  const currentToday = todayKey();

  items.forEach((item) => {
    const itemEntries = entriesByItem.get(item.id) ?? [];
    const itemIcon = normalizeIconValue(item.icon);

    if (item.tracking_type === "quantity") {
      const endDate = getRemoteEffectiveEndDate(item);
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
        groupName: item.group_name?.trim() || undefined,
        note: item.note?.trim() || undefined,
        emoji: item.emoji?.trim() || itemIcon.emoji,
        iconType: itemIcon.iconKey ? "custom" : "letter",
        iconKey: itemIcon.iconKey,
        targetValue: Number(item.target_value ?? 0),
        currentValue: progressEntries.reduce((total, entry) => total + entry.amount, 0),
        unit: item.unit ?? "",
        periodType: normalizeRemoteGoalPeriodType(item.period_type, item.start_date, endDate),
        startDate: item.start_date,
        endDate,
        repeatMode: fromRemoteGoalRepeat(item.repeat_mode),
        selectedDays: item.repeat_mode === "selected_days" ? (item.selected_days ?? []) : undefined,
        dueTime: normalizeRemoteDueTime(item.due_time),
        quickAddValues: sanitizeQuickValues(item.quick_add_values, item.unit ?? ""),
        progressEntries,
        completedAtByDate: getCompletedAtByDate(itemEntries),
        lateDates: getLateDates(itemEntries),
        sortOrder: normalizeRemoteSortOrder(item.sort_order),
      });

      return;
    }

    const subitems = normalizeRemoteSubitems(item.subitems);
    const subitemStateByDate = normalizeRemoteSubitemStateByDate(itemEntries, subitems);
    const completedDates = itemEntries
      .filter(
        (entry) =>
          entry.checked === true ||
          isRemoteSubitemEntryComplete(subitems, subitemStateByDate[entry.date]),
      )
      .map((entry) => entry.date)
      .sort();

    tasks.push({
      id: item.id,
      title: item.title,
      groupName: item.group_name?.trim() || undefined,
      note: item.note?.trim() || undefined,
      emoji: item.emoji?.trim() || itemIcon.emoji,
      iconType: itemIcon.iconKey ? "custom" : "letter",
      iconKey: itemIcon.iconKey,
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
      sortOrder: normalizeRemoteSortOrder(item.sort_order),
    });
  });

  return { goals, tasks, occurrences: remoteOccurrencesToApp(occurrences, goals, tasks) };
}

function appStateToItemRows(userId: string, appState: AppState) {
  return [
    ...appState.goals.map((goal, index) => {
      const icon = normalizeIconValue(goal.iconKey);

      return {
        id: goal.id,
        user_id: userId,
        title: goal.title.trim(),
        group_name: goal.groupName?.trim() || null,
        note: goal.note?.trim() || null,
        emoji: goal.emoji ?? icon.emoji ?? null,
        icon: icon.iconKey ?? null,
        tracking_type: "quantity",
        period_type: goal.periodType,
        repeat_mode: toRemoteRepeat(goal.repeatMode),
        start_date: goal.startDate,
        end_date: goal.endDate,
        selected_days: goal.repeatMode === "selectedDays" ? (goal.selectedDays ?? []) : null,
        due_time: goal.dueTime ?? null,
        target_value: goal.targetValue,
        unit: goal.unit,
        quick_add_values: goal.quickAddValues,
        subitems: null,
        sort_order: goal.sortOrder ?? index + 1,
        archived: false,
        updated_at: new Date().toISOString(),
      };
    }),
    ...appState.tasks.map((task, index) => {
      const icon = normalizeIconValue(task.iconKey);

      return {
        id: task.id,
        user_id: userId,
        title: task.title.trim(),
        group_name: task.groupName?.trim() || null,
        note: task.note?.trim() || null,
        emoji: task.emoji ?? icon.emoji ?? null,
        icon: icon.iconKey ?? null,
        tracking_type: "checkbox",
        period_type: null,
        repeat_mode: toRemoteRepeat(task.repeatMode),
        start_date: task.startDate,
        end_date: task.endDate,
        selected_days: task.repeatMode === "selectedDays" ? (task.selectedDays ?? []) : null,
        due_time: task.dueTime ?? null,
        target_value: null,
        unit: null,
        quick_add_values: null,
        subitems: normalizeRemoteSubitems(task.subitems),
        sort_order: task.sortOrder ?? index + 1,
        archived: false,
        updated_at: new Date().toISOString(),
      };
    }),
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
      completed_at: goal.completedAtByDate?.[date] ?? null,
      is_late: goal.lateDates?.includes(date) ?? false,
      note: entry.notes.length > 0 ? Array.from(new Set(entry.notes)).join(" · ") : null,
      updated_at: new Date().toISOString(),
    }));
  });

  const checkboxEntries = appState.tasks.flatMap((task) => {
    const dates = new Set([...(task.completedDates ?? []), ...Object.keys(task.subitemStateByDate ?? {})]);

    return Array.from(dates)
      .sort()
      .map((date) => ({
        user_id: userId,
        item_id: task.id,
        date,
        checked: task.completedDates?.includes(date) ?? false,
        value_added: 0,
        note: null,
        subitem_state: task.subitemStateByDate?.[date] ?? null,
        completed_at: task.completedAtByDate?.[date] ?? null,
        is_late: task.lateDates?.includes(date) ?? false,
        updated_at: new Date().toISOString(),
      }));
  });

  return [...quantityEntries, ...checkboxEntries];
}

function appStateToOccurrenceRows(userId: string, appState: AppState) {
  return (appState.occurrences ?? []).map((occurrence) => ({
    id: occurrence.id,
    user_id: userId,
    task_id: occurrence.itemId,
    date: occurrence.date,
    status: occurrence.status,
    source: occurrence.source,
    moved_from_date: occurrence.movedFromDate ?? null,
    is_carry_over: occurrence.isCarryOver,
    updated_at: new Date().toISOString(),
  }));
}

function remoteOccurrencesToApp(occurrences: RemoteTaskOccurrence[], goals: ProgressGoal[], tasks: TaskItem[]): TaskOccurrence[] {
  const goalIds = new Set(goals.map((goal) => goal.id));
  const taskIds = new Set(tasks.map((task) => task.id));

  return occurrences
    .map((row): TaskOccurrence | null => {
      if (!row.task_id || !row.date) {
        return null;
      }

      const itemType = goalIds.has(row.task_id) ? "goal" : taskIds.has(row.task_id) ? "task" : null;

      if (!itemType) {
        return null;
      }

      const source = row.source === "date_skip" ? "date_skip" : "carry_over";

      return {
        id: row.id,
        itemId: row.task_id,
        itemType,
        date: row.date,
        status: row.status === "completed" || row.status === "skipped" ? row.status : "active",
        source,
        movedFromDate: row.moved_from_date ?? undefined,
        isCarryOver: row.is_carry_over ?? source === "carry_over",
        createdAt: row.created_at ?? new Date().toISOString(),
      };
    })
    .filter((occurrence): occurrence is TaskOccurrence => occurrence !== null);
}

function deriveDailyRecords(appState: AppState): DailyRecord[] {
  const dates = new Set<string>();

  appState.goals.forEach((goal) => goal.progressEntries.forEach((entry) => dates.add(entry.date)));
  appState.goals.forEach((goal) => Object.keys(goal.completedAtByDate ?? {}).forEach((date) => dates.add(date)));
  appState.tasks.forEach((task) => task.completedDates?.forEach((date) => dates.add(date)));
  appState.tasks.forEach((task) => Object.keys(task.subitemStateByDate ?? {}).forEach((date) => dates.add(date)));

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

  return item.start_date;
}

function normalizeRemoteGoalPeriodType(value: unknown, startDate: string, endDate: string): GoalPeriodType {
  if (value === "today" || value === "week" || value === "month" || value === "forever" || value === "custom") {
    return value;
  }

  if (startDate === endDate) {
    return "today";
  }

  if (endDate === "2099-12-31") {
    return "forever";
  }

  if (endDate === addDays(startDate, 6)) {
    return "week";
  }

  const start = parseDateKey(startDate);
  const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  if (endDate === `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`) {
    return "month";
  }

  return "custom";
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
      const sortOrder = Number(record.sortOrder);

      const normalized: ActionSubitem = {
        id: typeof record.id === "string" && record.id.trim() ? record.id : globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2),
        title,
      };

      if (Number.isFinite(targetCount) && targetCount > 1) {
        normalized.targetCount = Math.floor(targetCount);
      }

      if (Number.isFinite(sortOrder)) {
        normalized.sortOrder = sortOrder;
      }

      return normalized;
    })
    .filter((subitem): subitem is ActionSubitem => subitem !== null)
    .map((subitem, index) => ({
      ...subitem,
      sortOrder: normalizeRemoteSortOrder(subitem.sortOrder, index + 1),
    }))
    .sort((first, second) => (first.sortOrder ?? 0) - (second.sortOrder ?? 0));
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

function normalizeRemoteSortOrder(value: unknown, fallback = 0): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
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
