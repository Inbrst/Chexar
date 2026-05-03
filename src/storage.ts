import type { AppSettings, AppState, DailyRecord } from "./types";
import { addDays, todayKey } from "./dateUtils";

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
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
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

  return {
    goals: state.goals.map((goal) => {
      const startDate = goal.startDate ?? today;
      const endDate = goal.endDate ?? addDays(today, 29);

      return {
        ...goal,
        startDate,
        endDate,
        iconKey: goal.iconKey ?? (goal.iconType === "book" ? "book" : undefined),
        repeatMode: goal.repeatMode ?? "everyDay",
        selectedDays: Array.isArray(goal.selectedDays) ? goal.selectedDays : undefined,
        progressEntries: Array.isArray(goal.progressEntries) ? goal.progressEntries : [],
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

      return {
        ...task,
        startDate,
        endDate,
        repeatMode: task.repeatMode ?? "once",
        selectedDays: Array.isArray(task.selectedDays) ? task.selectedDays : undefined,
        iconType: task.iconKey ? "custom" : (task.iconType ?? "letter"),
        iconKey: task.iconKey,
        date: task.date ?? startDate,
        completedDates,
        completed: completedDates.includes(today),
      };
    }),
  };
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

export function resetPerDayStorage(): void {
  localStorage.removeItem(PERDAY_APP_STATE_KEY);
  localStorage.removeItem(PERDAY_DAILY_RECORDS_KEY);
}
