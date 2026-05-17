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
  sortOrder?: number;
};

export type ActionSubitemState = {
  completed?: boolean;
  count?: number;
};

export type ActionSubitemStateByDate = Record<string, Record<string, ActionSubitemState>>;

export type ProgressGoal = {
  id: string;
  title: string;
  groupName?: string;
  note?: string;
  emoji?: string;
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
  sortOrder?: number;
};

export type TaskItem = {
  id: string;
  title: string;
  groupName?: string;
  note?: string;
  emoji?: string;
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
  sortOrder?: number;
};

export type TaskOccurrence = {
  id: string;
  itemId: string;
  itemType: "goal" | "task";
  date: string;
  status: "active" | "completed" | "skipped";
  source: "carry_over" | "date_skip";
  movedFromDate?: string;
  isCarryOver: boolean;
  createdAt: string;
};

export type AppState = {
  goals: ProgressGoal[];
  tasks: TaskItem[];
  occurrences: TaskOccurrence[];
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

export type OnboardingQuestStep =
  | "swipeRightTriggered"
  | "swipeLeftTriggered"
  | "taskCreated"
  | "taskCompleted"
  | "quantitativeGoalCreated"
  | "numericProgressEntered"
  | "calendarOpened"
  | "statsOpened";

export type OnboardingQuestState = {
  enabled: boolean;
  completedSteps: OnboardingQuestStep[];
  hidden: boolean;
  finished: boolean;
};
