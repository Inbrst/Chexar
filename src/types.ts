export type IconType = "letter" | "book" | "custom";
export type GoalRepeatMode = "everyDay" | "weekdays" | "selectedDays";
export type TaskRepeatMode = "once" | GoalRepeatMode;
export type Priority = "low" | "medium" | "high";
export type AppLanguage = "ru" | "en";
export type ThemePreference = "light" | "dark" | "system";
export type AppScreen = "today" | "calendar" | "progress" | "profile";

export type ProgressEntry = {
  id: string;
  date: string;
  amount: number;
  note?: string;
};

export type ProgressGoal = {
  id: string;
  title: string;
  note?: string;
  iconType: IconType;
  iconLabel?: string;
  iconKey?: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  startDate: string;
  endDate: string;
  repeatMode: GoalRepeatMode;
  selectedDays?: number[];
  quickAddValues: number[];
  progressEntries: ProgressEntry[];
};

export type TaskItem = {
  id: string;
  title: string;
  note?: string;
  iconType?: IconType;
  iconLabel?: string;
  iconKey?: string;
  priority?: Priority;
  startDate: string;
  endDate: string;
  repeatMode: TaskRepeatMode;
  selectedDays?: number[];
  date: string;
  completed: boolean;
  completedDates?: string[];
};

export type AppState = {
  goals: ProgressGoal[];
  tasks: TaskItem[];
};

export type DailyRecord = {
  date: string;
  percent: number;
  active: boolean;
};

export type AppSettings = {
  language: AppLanguage;
  theme: ThemePreference;
  hintsEnabled: boolean;
  onboardingCompleted: boolean;
};
