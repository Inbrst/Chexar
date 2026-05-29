import type { ActionSubitem, ActionSubitemStateByDate, AppSettings, AppState, DailyRecord, GoalPeriodType, OnboardingQuestState, OnboardingQuestStep, TaskOccurrence } from "./types";
import { addDays, todayKey } from "./dateUtils";
import { mergeDuplicateActions } from "./actionMerge";

export const PERDAY_APP_STATE_KEY = "perday:today-app-state:v1";
export const PERDAY_DAILY_RECORDS_KEY = "perday:daily-records:v1";
export const PERDAY_SETTINGS_KEY = "perday:settings:v1";
export const CHEXAR_ONBOARDING_KEY = "chexar:onboarding:v1";

const defaultSettings: AppSettings = {
  language: "ru",
  theme: "dark",
  hintsEnabled: true,
  onboardingCompleted: false,
  telegramBotEnabled: false,
  carryOversEnabled: true,
};

const onboardingSteps: OnboardingQuestStep[] = [
  "questTaskCompleted",
  "questTaskDeleted",
  "questPairTimerSet",
  "questPairEmojiChanged",
  "questPairReordered",
  "questMiniListOpened",
  "questMiniListCompleted",
  "questProgressEntered",
  "questTaskCreated",
];

const defaultOnboardingState: OnboardingQuestState = {
  enabled: false,
  completedSteps: [],
  hidden: false,
  finished: false,
};

function id(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Math.random().toString(36).slice(2)}`;
}

export function createEmptyState(): AppState {
  return {
    goals: [],
    tasks: [],
    occurrences: [],
  };
}

export function createEmptyDailyRecords(): DailyRecord[] {
  return [];
}

export function createSeedState(): AppState {
  const today = todayKey();
  const endDate = addDays(today, 25);

  return {
    goals: [
      {
        id: id("goal"),
        title: "Английский",
        iconType: "letter",
        targetValue: 50,
        currentValue: 12,
        unit: "урока",
        periodType: "custom",
        startDate: today,
        endDate,
        repeatMode: "everyDay",
        quickAddValues: [1, 2],
        progressEntries: [
          {
            id: id("entry"),
            date: today,
            amount: 2,
          },
        ],
      },
      {
        id: id("goal"),
        title: "Чтение",
        iconType: "book",
        iconKey: "book",
        targetValue: 1000,
        currentValue: 120,
        unit: "страницы",
        periodType: "custom",
        startDate: today,
        endDate,
        repeatMode: "everyDay",
        quickAddValues: [10, 25],
        progressEntries: [
          {
            id: id("entry"),
            date: today,
            amount: 34,
          },
        ],
      },
    ],
    tasks: [
      {
        id: id("task"),
        title: "Зарядка",
        iconType: "custom",
        iconKey: "fire",
        priority: "medium",
        startDate: today,
        endDate: today,
        repeatMode: "once",
        date: today,
        completed: true,
        completedDates: [today],
      },
      {
        id: id("task"),
        title: "Уборка",
        iconType: "custom",
        iconKey: "home",
        priority: "low",
        startDate: today,
        endDate: today,
        repeatMode: "once",
        date: today,
        completed: false,
        completedDates: [],
      },
      {
        id: id("task"),
        title: "Сходить в магазин",
        iconType: "custom",
        iconKey: "cart",
        priority: "medium",
        startDate: today,
        endDate: today,
        repeatMode: "once",
        date: today,
        completed: false,
        completedDates: [],
      },
    ],
    occurrences: [],
  };
}

export function createSeedDailyRecords(): DailyRecord[] {
  const today = todayKey();

  return [-3, -2, -1].map((offset) => ({
    date: addDays(today, offset),
    percent: 100,
    active: true,
  }));
}

export function loadAppState(): AppState {
  const stored = localStorage.getItem(PERDAY_APP_STATE_KEY);

  if (!stored) {
    return createEmptyState();
  }

  try {
    const parsed = JSON.parse(stored) as AppState;
    if (!Array.isArray(parsed.goals) || !Array.isArray(parsed.tasks)) {
      return createEmptyState();
    }

    return migrateAppState(parsed);
  } catch {
    return createEmptyState();
  }
}

function migrateAppState(state: AppState): AppState {
  const today = todayKey();

  return mergeDuplicateActions({
    goals: state.goals.map((goal) => {
      const goalIndex = state.goals.indexOf(goal);
      const startDate = goal.startDate ?? today;
      const endDate = goal.endDate ?? startDate;
      const periodType = normalizeGoalPeriodType((goal as { periodType?: unknown }).periodType, startDate, endDate);

      return {
        ...goal,
        startDate,
        endDate,
        periodType,
        note: typeof goal.note === "string" && goal.note.trim() ? goal.note.trim() : undefined,
        emoji: normalizeEmoji(goal.emoji),
        iconKey: goal.iconKey ?? (goal.iconType === "book" ? "book" : undefined),
        repeatMode: goal.repeatMode ?? "everyDay",
        selectedDays: Array.isArray(goal.selectedDays) ? goal.selectedDays : undefined,
        dueTime: normalizeDueTime(goal.dueTime),
        progressEntries: Array.isArray(goal.progressEntries) ? goal.progressEntries : [],
        completedAtByDate: normalizeDateStringMap(goal.completedAtByDate),
        lateDates: Array.isArray(goal.lateDates) ? Array.from(new Set(goal.lateDates)).sort() : undefined,
        sortOrder: normalizeSortOrder(goal.sortOrder, goalIndex + 1),
        quickAddValues: Array.isArray(goal.quickAddValues) ? goal.quickAddValues : [],
      };
    }),
    tasks: state.tasks.map((task) => {
      const taskIndex = state.tasks.indexOf(task);
      const completedDates = Array.isArray(task.completedDates)
        ? Array.from(new Set(task.completedDates))
        : task.completed
          ? [today]
          : [];
      const startDate = task.startDate ?? today;
      const endDate = task.endDate ?? today;
      const subitems = normalizeSubitems(task.subitems);
      const subitemStateByDate = normalizeSubitemStateByDate(task.subitemStateByDate, subitems);
      const mergedCompletedDates = Array.from(new Set(completedDates)).sort();

      return {
        ...task,
        startDate,
        endDate,
        note: typeof task.note === "string" && task.note.trim() ? task.note.trim() : undefined,
        emoji: normalizeEmoji(task.emoji),
        repeatMode: task.repeatMode ?? "once",
        selectedDays: Array.isArray(task.selectedDays) ? task.selectedDays : undefined,
        dueTime: normalizeDueTime(task.dueTime),
        iconType: task.iconKey ? "custom" : (task.iconType ?? "letter"),
        iconKey: task.iconKey,
        date: task.date ?? startDate,
        completedDates: mergedCompletedDates,
        completedAtByDate: normalizeDateStringMap(task.completedAtByDate),
        lateDates: Array.isArray(task.lateDates) ? Array.from(new Set(task.lateDates)).sort() : undefined,
        subitems: subitems.length > 0 ? subitems : undefined,
        subitemStateByDate: Object.keys(subitemStateByDate).length > 0 ? subitemStateByDate : undefined,
        sortOrder: normalizeSortOrder(task.sortOrder, taskIndex + 1),
        completed: mergedCompletedDates.includes(today),
      };
    }),
    occurrences: normalizeOccurrences((state as AppState & { occurrences?: unknown }).occurrences),
  });
}

function normalizeGoalPeriodType(value: unknown, startDate: string, endDate: string): GoalPeriodType {
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

  const start = new Date(`${startDate}T00:00:00`);
  const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  if (endDate === `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`) {
    return "month";
  }

  return "custom";
}

function normalizeOccurrences(value: unknown): TaskOccurrence[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): TaskOccurrence | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const itemId = typeof record.itemId === "string" ? record.itemId : typeof record.taskId === "string" ? record.taskId : "";
      const date = typeof record.date === "string" ? record.date : "";

      if (!itemId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return null;
      }

      const itemType = record.itemType === "goal" ? "goal" : "task";
      const status = record.status === "completed" || record.status === "skipped" ? record.status : "active";

      const source = record.source === "date_skip" ? "date_skip" : "carry_over";

      return {
        id: typeof record.id === "string" && record.id.trim() ? record.id : id("occurrence"),
        itemId,
        itemType,
        date,
        status,
        source,
        movedFromDate: typeof record.movedFromDate === "string" ? record.movedFromDate : undefined,
        isCarryOver: typeof record.isCarryOver === "boolean" ? record.isCarryOver : source === "carry_over",
        createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
      };
    })
    .filter((item): item is TaskOccurrence => item !== null);
}

function normalizeEmoji(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const emoji = value.trim();

  return emoji ? emoji.slice(0, 8) : undefined;
}

function normalizeSubitems(subitems: unknown): ActionSubitem[] {
  if (!Array.isArray(subitems)) {
    return [];
  }

  return subitems
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
        id: typeof record.id === "string" && record.id.trim() ? record.id : id("subitem"),
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
      sortOrder: normalizeSortOrder(subitem.sortOrder, index + 1),
    }))
    .sort((first, second) => (first.sortOrder ?? 0) - (second.sortOrder ?? 0));
}

function normalizeSubitemStateByDate(value: unknown, subitems: ActionSubitem[]): ActionSubitemStateByDate {
  if (!value || typeof value !== "object") {
    return {};
  }

  const subitemIds = new Set(subitems.map((subitem) => subitem.id));
  const result: ActionSubitemStateByDate = {};

  Object.entries(value as Record<string, unknown>).forEach(([date, states]) => {
    if (!states || typeof states !== "object") {
      return;
    }

    const dayState: ActionSubitemStateByDate[string] = {};

    Object.entries(states as Record<string, unknown>).forEach(([subitemId, state]) => {
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
      result[date] = dayState;
    }
  });

  return result;
}

function normalizeDueTime(value: unknown): string | undefined {
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

function normalizeSortOrder(value: unknown, fallback: number): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDateStringMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const result: Record<string, string> = {};

  Object.entries(value as Record<string, unknown>).forEach(([date, timestamp]) => {
    if (typeof timestamp === "string" && timestamp.trim()) {
      result[date] = timestamp;
    }
  });

  return Object.keys(result).length > 0 ? result : undefined;
}

export function saveAppState(state: AppState): void {
  localStorage.setItem(PERDAY_APP_STATE_KEY, JSON.stringify(state));
}

export function loadDailyRecords(): DailyRecord[] {
  const stored = localStorage.getItem(PERDAY_DAILY_RECORDS_KEY);

  if (!stored) {
    return createEmptyDailyRecords();
  }

  try {
    const parsed = JSON.parse(stored) as DailyRecord[];
    if (!Array.isArray(parsed)) {
      return createEmptyDailyRecords();
    }

    return parsed;
  } catch {
    return createEmptyDailyRecords();
  }
}

export function saveDailyRecords(records: DailyRecord[]): void {
  localStorage.setItem(PERDAY_DAILY_RECORDS_KEY, JSON.stringify(records));
}

export function loadSettings(): AppSettings {
  const stored = localStorage.getItem(PERDAY_SETTINGS_KEY);

  if (!stored) {
    return defaultSettings;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<AppSettings>;

    return {
      language: parsed.language === "en" || parsed.language === "ru" ? parsed.language : defaultSettings.language,
      theme: parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system" ? parsed.theme : defaultSettings.theme,
      hintsEnabled: typeof parsed.hintsEnabled === "boolean" ? parsed.hintsEnabled : defaultSettings.hintsEnabled,
      onboardingCompleted:
        typeof parsed.onboardingCompleted === "boolean"
          ? parsed.onboardingCompleted
          : defaultSettings.onboardingCompleted,
      telegramBotEnabled:
        typeof parsed.telegramBotEnabled === "boolean"
          ? parsed.telegramBotEnabled
          : defaultSettings.telegramBotEnabled,
      carryOversEnabled:
        typeof parsed.carryOversEnabled === "boolean"
          ? parsed.carryOversEnabled
          : defaultSettings.carryOversEnabled,
    };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(PERDAY_SETTINGS_KEY, JSON.stringify(settings));
}

export function createOnboardingQuestState(enabled: boolean): OnboardingQuestState {
  return {
    enabled,
    completedSteps: [],
    hidden: !enabled,
    finished: false,
  };
}

export function loadOnboardingQuestState(): OnboardingQuestState {
  const stored = localStorage.getItem(CHEXAR_ONBOARDING_KEY);

  if (!stored) {
    return defaultOnboardingState;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<OnboardingQuestState>;
    const completedSteps = Array.isArray(parsed.completedSteps)
      ? parsed.completedSteps.filter((step): step is OnboardingQuestStep => onboardingSteps.includes(step as OnboardingQuestStep))
      : [];

    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : defaultOnboardingState.enabled,
      completedSteps: Array.from(new Set(completedSteps)),
      hidden: typeof parsed.hidden === "boolean" ? parsed.hidden : defaultOnboardingState.hidden,
      finished: typeof parsed.finished === "boolean" ? parsed.finished : defaultOnboardingState.finished,
    };
  } catch {
    return defaultOnboardingState;
  }
}

export function saveOnboardingQuestState(state: OnboardingQuestState): void {
  localStorage.setItem(CHEXAR_ONBOARDING_KEY, JSON.stringify(state));
}

export function resetChexarStorage(): void {
  localStorage.removeItem(PERDAY_APP_STATE_KEY);
  localStorage.removeItem(PERDAY_DAILY_RECORDS_KEY);
  localStorage.removeItem(CHEXAR_ONBOARDING_KEY);
}
