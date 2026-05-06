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

export type ActionSubitem = {
  id: string;
  title: string;
  targetCount?: number;
};

export type ActionSubitemState = {
  completed?: boolean;
  count?: number;
};

export type ActionSubitemStateByDate = Record<string, Record<string, ActionSubitemState>>;

export type ActionTimerState = {
  secondsDone?: number;
  completed?: boolean;
};

export type ActionTimerStateByDate = Record<string, ActionTimerState>;

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
  dueTime?: string;
  quickAddValues: number[];
  progressEntries: ProgressEntry[];
  completedAtByDate?: Record<string, string>;
  lateDates?: string[];
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
  dueTime?: string;
  date: string;
  completed: boolean;
  completedDates?: string[];
  completedAtByDate?: Record<string, string>;
  lateDates?: string[];
  subitems?: ActionSubitem[];
  subitemStateByDate?: ActionSubitemStateByDate;
  timerMinutes?: number;
  timerStateByDate?: ActionTimerStateByDate;
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
