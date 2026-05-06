import type { ActionSubitem, ActionSubitemStateByDate, ActionTimerStateByDate, AppSettings, AppState, DailyRecord } from "./types";
import { addDays, todayKey } from "./dateUtils";
import { mergeDuplicateActions } from "./actionMerge";

export const PERDAY_APP_STATE_KEY = "perday:today-app-state:v1";
export const PERDAY_DAILY_RECORDS_KEY = "perday:daily-records:v1";
export const PERDAY_SETTINGS_KEY = "perday:settings:v1";

const defaultSettings: AppSettings = {
  language: "ru",
  theme: "dark",
  hintsEnabled: true,
  onboardingCompleted: false,
};

function id(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Math.random().toString(36).slice(2)}`;
}

export function createEmptyState(): AppState {
  return {
    goals: [],
    tasks: [],
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
      const startDate = goal.startDate ?? today;
      const endDate = goal.endDate ?? addDays(today, 29);

      return {
        ...goal,
        startDate,
        endDate,
        note: typeof goal.note === "string" && goal.note.trim() ? goal.note.trim() : undefined,
        iconKey: goal.iconKey ?? (goal.iconType === "book" ? "book" : undefined),
        repeatMode: goal.repeatMode ?? "everyDay",
        selectedDays: Array.isArray(goal.selectedDays) ? goal.selectedDays : undefined,
        dueTime: normalizeDueTime(goal.dueTime),
        progressEntries: Array.isArray(goal.progressEntries) ? goal.progressEntries : [],
        completedAtByDate: normalizeDateStringMap(goal.completedAtByDate),
        lateDates: Array.isArray(goal.lateDates) ? Array.from(new Set(goal.lateDates)).sort() : undefined,
        quickAddValues: Array.isArray(goal.quickAddValues) ? goal.quickAddValues : [],
      };
    }),
    tasks: state.tasks.map((task) => {
      const completedDates = Array.isArray(task.completedDates)
        ? Array.from(new Set(task.completedDates))
        : task.completed
          ? [today]
          : [];
      const startDate = task.startDate ?? today;
      const endDate = task.endDate ?? today;
      const subitems = normalizeSubitems(task.subitems);
      const subitemStateByDate = normalizeSubitemStateByDate(task.subitemStateByDate, subitems);
      const timerMinutes = Number(task.timerMinutes);
      const hasTimer = subitems.length === 0 && Number.isFinite(timerMinutes) && timerMinutes > 0;
      const timerStateByDate = hasTimer ? normalizeTimerStateByDate(task.timerStateByDate) : {};
      const mergedCompletedDates = Array.from(
        new Set([
          ...completedDates,
          ...Object.entries(timerStateByDate)
            .filter(([, state]) => state.completed === true || Number(state.secondsDone ?? 0) >= timerMinutes * 60)
            .map(([date]) => date),
        ]),
      ).sort();

      return {
        ...task,
        startDate,
        endDate,
        note: typeof task.note === "string" && task.note.trim() ? task.note.trim() : undefined,
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
        timerMinutes: hasTimer ? timerMinutes : undefined,
        timerStateByDate: Object.keys(timerStateByDate).length > 0 ? timerStateByDate : undefined,
        completed: mergedCompletedDates.includes(today),
      };
    }),
  });
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

      const normalized: ActionSubitem = {
        id: typeof record.id === "string" && record.id.trim() ? record.id : id("subitem"),
        title,
      };

      if (Number.isFinite(targetCount) && targetCount > 1) {
        normalized.targetCount = Math.floor(targetCount);
      }

      return normalized;
    })
    .filter((subitem): subitem is ActionSubitem => subitem !== null);
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

function normalizeTimerStateByDate(value: unknown): ActionTimerStateByDate {
  if (!value || typeof value !== "object") {
    return {};
  }

  const result: ActionTimerStateByDate = {};

  Object.entries(value as Record<string, unknown>).forEach(([date, state]) => {
    if (!state || typeof state !== "object") {
      return;
    }

    const record = state as Record<string, unknown>;
    const secondsDone = Number(record.secondsDone);
    const dayState = {
      completed: record.completed === true,
      secondsDone: Number.isFinite(secondsDone) && secondsDone > 0 ? Math.round(secondsDone) : undefined,
    };

    if (dayState.completed || dayState.secondsDone) {
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
    };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(PERDAY_SETTINGS_KEY, JSON.stringify(settings));
}

export function resetChexarStorage(): void {
  localStorage.removeItem(PERDAY_APP_STATE_KEY);
  localStorage.removeItem(PERDAY_DAILY_RECORDS_KEY);
}
