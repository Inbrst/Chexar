import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Clock3,
  Droplet,
  Dumbbell,
  Filter,
  Flame,
  Footprints,
  GraduationCap,
  Globe2,
  Home,
  Info,
  Languages,
  Lightbulb,
  Mail,
  Monitor,
  Moon,
  Phone,
  Pill,
  Plus,
  Shield,
  ShoppingCart,
  Sun,
  Star,
  Target,
  TrendingUp,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties, FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  calculateDailyProgress,
  clampPercent,
  getCurrentStreak,
  getDailyCompletionPercent,
  getGoalSchedulePreview,
  getGoalProgressPercent,
  getLastNDaysCompletionTrend,
  getMonthRange,
  getMonthAverageCompletion,
  getRequiredToday,
  getTaskSubitemProgress,
  getTodayLoggedAmount,
  getWeekRange,
  getWeekAverageCompletion,
  hasTaskSubitems,
  isGoalDueOnDate,
  isTaskCompletedOnDate,
  isTaskDueOnDate,
  upsertDailyRecord,
} from "./calculations";
import { addDays, daysInclusive, parseDateKey, todayKey, toDateKey } from "./dateUtils";
import {
  createEmptyDailyRecords,
  createEmptyState,
  loadAppState,
  loadDailyRecords,
  loadSettings,
  resetChexarStorage,
  saveAppState,
  saveDailyRecords,
  saveSettings,
} from "./storage";
import type { ActionSubitem, ActionSubitemState, AppScreen, AppSettings, AppState, GoalRepeatMode, Priority, ProgressEntry, ProgressGoal, TaskItem, TaskOccurrence, TaskRepeatMode } from "./types";
import { mergeDuplicateActions, normalizeActionTitle } from "./actionMerge";
import { hasRemotePersistence, loadRemoteData, saveRemoteSnapshot } from "./supabaseData";
import { getTelegramConnectionStatus, getTelegramUser, initTelegramWebApp } from "./lib/telegram";
import type { TelegramConnectionStatus, TelegramUser } from "./lib/telegram";

declare global {
  interface Window {
    chexarResetDemo?: () => void;
  }
}

const APP_VERSION = "0.1.0";

const onboardingCopy = {
  en: {
    appLabel: "Chexar",
    title: "First launch",
    subtitle: "Let’s quickly set up the app and show how it works.",
    language: "Language",
    russian: "Russian",
    english: "English",
    theme: "Theme",
    lightTheme: "Light",
    darkTheme: "Dark",
    systemTheme: "System",
    hints: "Hints",
    hintsText: "Show short tips at the right moment",
    howItWorks: "How it works",
    learningPoints: [
      "Create actions for a day, week, month, or custom period.",
      "Track progress.",
      "Follow your daily rhythm, calendar, and statistics.",
    ],
    continue: "Continue",
  },
  ru: {
    appLabel: "Chexar",
    title: "Первый запуск",
    subtitle: "Быстро настроим приложение и покажем, как всё работает.",
    language: "Язык",
    russian: "Русский",
    english: "English",
    theme: "Тема",
    lightTheme: "Светлая",
    darkTheme: "Темная",
    systemTheme: "Системная",
    hints: "Подсказки",
    hintsText: "Показывать короткие подсказки в нужный момент",
    howItWorks: "Как это работает",
    learningPoints: [
      "Создавай действия на день, неделю, месяц или свой период.",
      "Отмечай прогресс.",
      "Следи за ритмом дня, календарём и статистикой.",
    ],
    continue: "Продолжить",
  },
} as const;

const profileCopy = {
  en: {
    profile: "Profile",
    profileSubtitle: "Settings and appearance",
    profileAria: "Profile",
    account: "Account",
    telegramConnected: "Telegram connected",
    browserModeTitle: "Test user",
    browserModeSubtitle: "Open through Telegram Mini App to link your account",
    browserModeStatus: "Browser mode",
    interface: "Interface",
    language: "Language",
    english: "English",
    russian: "Russian",
    theme: "Theme",
    lightTheme: "Light",
    darkTheme: "Dark",
    systemTheme: "System",
    data: "Data",
    storage: "Data storage",
    onDevice: "On this device",
    actionsCount: "Actions count",
    quantityActionsCount: "Quantity actions count",
    checklistActionsCount: "Checklist actions count",
    dayRecordsCount: "Day records count",
    export: "Export",
    soon: "Soon",
    reminders: "Reminders",
    later: "Later",
    about: "About",
    version: "Version",
    telegram: "Telegram Mini App",
    connected: "Connected",
    notFound: "Not found",
    browserMode: "Browser mode",
    resetData: "Reset data",
    hintsOn: "Hints enabled",
    hintsOff: "Hints disabled",
    hintsText: "We will show useful tips at the right moment.",
    resetTitle: "Reset data?",
    resetText: "This will delete actions and progress on this device.",
    resetConfirm: "Reset",
    cancel: "Cancel",
  },
  ru: {
    profile: "Профиль",
    profileSubtitle: "Настройки и внешний вид",
    profileAria: "Профиль",
    account: "Аккаунт",
    telegramConnected: "Telegram подключен",
    browserModeTitle: "Тестовый пользователь",
    browserModeSubtitle: "Открой через Telegram Mini App, чтобы привязать аккаунт",
    browserModeStatus: "Браузерный режим",
    interface: "Интерфейс",
    language: "Язык",
    english: "English",
    russian: "Русский",
    theme: "Тема",
    lightTheme: "Светлая",
    darkTheme: "Темная",
    systemTheme: "Системная",
    data: "Данные",
    storage: "Хранение данных",
    onDevice: "На этом устройстве",
    actionsCount: "Всего действий",
    quantityActionsCount: "Количественные действия",
    checklistActionsCount: "Чек-лист действия",
    dayRecordsCount: "Записи дней",
    export: "Экспорт",
    soon: "Скоро",
    reminders: "Напоминания",
    later: "Позже",
    about: "О приложении",
    version: "Версия",
    telegram: "Telegram Mini App",
    connected: "Подключено",
    notFound: "Не найдено",
    browserMode: "Browser mode",
    resetData: "Сбросить данные",
    hintsOn: "Подсказки включены",
    hintsOff: "Подсказки выключены",
    hintsText: "Мы покажем полезные советы в нужный момент.",
    resetTitle: "Сбросить данные?",
    resetText: "Это удалит цели, задачи и прогресс на этом устройстве.",
    resetConfirm: "Сбросить",
    cancel: "Отмена",
  },
} as const;

const navCopy = {
  en: {
    today: "Today",
    calendar: "Calendar",
    progress: "Progress",
    profile: "Profile",
    aria: "Main navigation",
  },
  ru: {
    today: "Сегодня",
    calendar: "Календарь",
    progress: "Прогресс",
    profile: "Профиль",
    aria: "Основная навигация",
  },
} as const;

const calendarCopy = {
  en: {
    title: "Calendar",
    subtitle: "How the days are going",
    resetToToday: "Back to current month",
    filter: "Filter active days",
    monthPicker: "Month picker",
    previousMonth: "Previous",
    nextMonth: "Next",
    today: "Today",
    openDay: "Open day",
    closed: "Closed",
    partial: "Partial",
    skipped: "Skipped",
    selectedToday: "Today",
    dayClosed: (percent: number) => `${percent}% of day closed`,
    completed: "Completed",
    remaining: "Remaining",
    missed: "Missed",
    progressEntries: "Progress entries",
    noCompleted: "Nothing completed yet",
    noRemaining: "Nothing left",
    noMissed: "No misses",
    noProgressEntries: "No progress entries",
    emptyMonthTitle: "Calendar is empty",
    emptyMonthText: "Complete actions to see your daily rhythm here.",
    bestDay: "Best day",
    average: "Average",
    streak: "Streak",
    progress: "progress",
    emptyDay: "No actions for this day",
    thisMonth: "This month",
    allDays: "All days",
    withActivity: "With activity",
    completedFilter: "Completed",
    partialFilter: "Partial",
    missedFilter: "Missed",
  },
  ru: {
    title: "Календарь",
    subtitle: "Как идут дни",
    resetToToday: "Вернуться к текущему месяцу",
    filter: "Фильтр активных дней",
    monthPicker: "Выбор месяца",
    previousMonth: "Назад",
    nextMonth: "Вперед",
    today: "Сегодня",
    openDay: "Открыть день",
    closed: "Закрыт",
    partial: "Частично",
    skipped: "Пропуск",
    selectedToday: "Сегодня",
    dayClosed: (percent: number) => `${percent}% дня закрыто`,
    completed: "Выполнено",
    remaining: "Осталось",
    missed: "Пропущено",
    progressEntries: "Записи прогресса",
    noCompleted: "Пока ничего",
    noRemaining: "Ничего не осталось",
    noMissed: "Без пропусков",
    noProgressEntries: "Записей прогресса нет",
    emptyMonthTitle: "Календарь пока пустой",
    emptyMonthText: "Отмечай действия — здесь появится ритм по дням.",
    bestDay: "Лучший день",
    average: "Среднее",
    streak: "Streak",
    progress: "прогресс",
    emptyDay: "На этот день действий нет",
  },
} as const;

const progressCopy = {
  en: {
    title: "Progress",
    subtitle: "Dynamics for the selected period",
    add: "Add action",
    week: "Week",
    month: "Month",
    year: "Year",
    period: "Period",
    completion: "Completion",
    comparedToPrevious: (delta: number) => `${delta >= 0 ? "+" : ""}${delta}% vs previous period`,
    streak: "Streak",
    streakCaption: "days in a row",
    onTrack: "On track",
    days: "days",
    behind: "Behind",
    day: "day",
    periodRhythm: "Period rhythm",
    stable: "Stable",
    moving: "Moving",
    uneven: "Uneven",
    justStart: "Just starting",
    rhythmDescription: (percent: number) => `You complete ${percent}% of the plan for this period.`,
    dynamics: "Completion dynamics",
    taskBalance: "Action balance",
    progress: "Quantity",
    checklist: "Marked",
    misses: "Misses",
    bestDays: "Best days",
    bestActions: "What works best",
    emptyTitle: "Progress is empty",
    emptyText: "Complete actions to see period dynamics here.",
    noActions: "No completed actions yet",
    actionsLabel: "actions",
  },
  ru: {
    title: "Прогресс",
    subtitle: "Динамика за выбранный период",
    add: "Добавить действие",
    week: "Неделя",
    month: "Месяц",
    year: "Год",
    period: "Период",
    completion: "Выполнение",
    comparedToPrevious: (delta: number) => `${delta >= 0 ? "+" : ""}${delta}% к прошлому периоду`,
    streak: "Streak",
    streakCaption: "дня подряд",
    onTrack: "В графике",
    days: "дня",
    behind: "Отстают",
    day: "день",
    periodRhythm: "Ритм периода",
    stable: "Стабильный",
    moving: "В движении",
    uneven: "Неровный",
    justStart: "Начало",
    rhythmDescription: (percent: number) => `Ты выполняешь ${percent}% плана за период.`,
    dynamics: "Динамика выполнения",
    taskBalance: "Баланс действий",
    progress: "С числом",
    checklist: "С отметкой",
    misses: "Пропуски",
    bestDays: "Лучшие дни",
    bestActions: "Что получается лучше всего",
    emptyTitle: "Прогресс пока пустой",
    emptyText: "Отмечай действия — здесь появится динамика периода.",
    noActions: "Пока нет выполненных действий",
    actionsLabel: "действий",
  },
} as const;

const uiCopy = {
  en: {
    add: "Add",
    close: "Close",
    save: "Save",
    cancel: "Cancel",
    yes: "Yes",
    yesDone: "Yes, done",
    viewAll: "View all",
    actionsSection: "Actions",
    progressSection: "With progress",
    checklistSection: "Checklist",
    rhythmAria: "Day rhythm and statistics",
    rhythmTitle: "Day rhythm",
    actionsCount: (completed: number, total: number) => `${completed} of ${total} actions`,
    left: "Left",
    allClosed: "All closed",
    addFirstAction: "Add the first action",
    backToCalendar: "Calendar",
    plannedDay: "Planned day",
    pastDay: "Past day",
    week: "Week",
    month: "Month",
    streak: "Streak",
    progress: "progress",
    miniStatsAria: "Week, month, and streak statistics",
    todayLabel: "Today",
    done: "Done",
    goalClosed: "Goal closed",
    pace: "Pace",
    perDay: "per day",
    enter: "Enter",
    allGoals: "All goals",
    allTasks: "All tasks",
    noGoalsToday: "No goals due today.",
    noTasksToday: "No tasks due today.",
    emptyChecklistTitle: "No tasks yet",
    emptyChecklistText: "Add a done / not done action.",
    emptyProgressTitle: "No progress goals yet",
    emptyProgressText: "Add an action with a quantity.",
    emptySelectedDayTitle: "Nothing for this day",
    emptySelectedDayText: "Add an action or choose another day.",
    deleteAction: "Delete action",
    deleteActionTitle: "Delete action?",
    deleteActionText: "This will delete the action and its progress.",
    deleteConfirm: "Delete",
    deleteToday: "Only this day",
    deletePeriod: "Whole period",
    deleteTodayText: "Hide it only on the selected date.",
    deletePeriodText: "Delete the action and all its progress.",
    editAction: "Edit action",
    addProgress: "Add progress",
    requiredToday: "Required today",
    toFinishDaily: "To finish",
    recommendedToFinish: (value: string) => `rec. ${value}`,
    completedInput: "Completed",
    note: "Note",
    comment: "Comment",
    optional: "Optional",
    markDoneTitle: "Mark as done?",
    undoDoneTitle: "Undo completion?",
    rhythmTrendAria: "7-day rhythm trend",
    dayStatuses: ["Start day", "In progress", "Can catch up", "Good pace", "Day closed"],
    addSheetTitle: "What to add?",
    addSheetSubtitle: "Create an action for a day or period",
    name: "Name",
    namePlaceholder: "For example, English",
    group: "Group",
    groupPlaceholder: "Home, health, study",
    templates: "Templates",
    icon: "Icon",
    changeIcon: "Change icon",
    chooseIcon: "Choose icon",
    emojiHint: "Choose one emoji from the list or type it from the keyboard.",
    emojiWarning: "Use an emoji here.",
    iconPickerAria: "Icon selection",
    noIcon: "No icon",
    tracking: "How to track?",
    doneNotDone: "Done / not done",
    countQuantity: "Count quantity",
    repeat: "How to repeat?",
    everyDay: "Every day",
    weekdays: "Weekdays",
    selectedDays: "Selected days",
    period: "Period",
    today: "Today",
    weekOption: "Week",
    monthOption: "Month",
    custom: "Custom",
    startDate: "Start date",
    endDate: "End date",
    total: "Total",
    unit: "Unit",
    unitPlaceholder: "lessons",
    alreadyDone: "Already done",
    currentAmount: "Done now",
    quickButtons: "Quick buttons",
    preview: "Preview",
    inDay: "Per day",
    inWeek: "Per week",
    format: "Format",
    dueBefore: "Do before",
    addDueTime: "Do before time",
    dueOnTime: "on time",
    dueLate: "late",
    dueOverdue: "overdue",
    dueLeft: "left",
    advanced: "More",
    progressTemplates: "With progress",
    checklistTemplates: "Checklist",
    validationTitle: "Add a name.",
    validationPositive: "Enter a value above 0.",
    validationUnit: "Enter a unit.",
    validationCurrent: "Already done cannot be below 0.",
    validationDate: "End date must not be before start date.",
    validationDays: "Choose at least one weekday.",
    validationDuplicate: "An action with this name already exists for this day. Change the name or open the existing action.",
    syncLoading: "Loading Supabase data...",
    syncSaving: "Saving...",
    syncError: "Supabase is unavailable. Local mode is active.",
    syncLocal: "Local mode: add Supabase env variables to sync testers.",
    syncMissingEnv: "Supabase env is not configured on Vercel.",
    syncQueryError: "Supabase is connected, but the query failed. Check tables or access.",
    repeatOnce: "Once",
    lowPriority: "Low",
    mediumPriority: "Medium",
    highPriority: "High",
  },
  ru: {
    add: "Добавить",
    close: "Закрыть",
    save: "Сохранить",
    cancel: "Отмена",
    yes: "Да",
    yesDone: "Да, готово",
    viewAll: "См. все",
    actionsSection: "Действия",
    progressSection: "С прогрессом",
    checklistSection: "Чек-лист",
    rhythmAria: "Ритм дня и статистика",
    rhythmTitle: "Ритм дня",
    actionsCount: (completed: number, total: number) => `${completed} из ${total} действий`,
    left: "Осталось",
    allClosed: "Все закрыто",
    addFirstAction: "Добавь первое действие",
    backToCalendar: "К календарю",
    plannedDay: "Запланированный день",
    pastDay: "Прошлый день",
    week: "Неделя",
    month: "Месяц",
    streak: "Streak",
    progress: "прогресс",
    miniStatsAria: "Статистика недели, месяца и серии",
    todayLabel: "Сегодня",
    done: "Готово",
    goalClosed: "Цель закрыта",
    pace: "Темп",
    perDay: "в день",
    enter: "Ввести",
    allGoals: "Все цели",
    allTasks: "Все задачи",
    noGoalsToday: "На сегодня целей нет.",
    noTasksToday: "На сегодня задач нет.",
    emptyChecklistTitle: "Пока нет задач",
    emptyChecklistText: "Добавь действие с отметкой “готово / не готово”.",
    emptyProgressTitle: "Пока нет целей с прогрессом",
    emptyProgressText: "Добавь действие с количеством.",
    emptySelectedDayTitle: "На этот день пусто",
    emptySelectedDayText: "Добавь действие или выбери другой день.",
    deleteAction: "Удалить действие",
    deleteActionTitle: "Удалить действие?",
    deleteActionText: "Это удалит действие и его прогресс.",
    deleteConfirm: "Удалить",
    editAction: "Редактировать",
    addProgress: "Внести прогресс",
    requiredToday: "Нужно сегодня",
    toFinishDaily: "До финиша",
    recommendedToFinish: (value: string) => `рек. ${value}`,
    completedInput: "Выполнено",
    note: "Заметка",
    comment: "Комментарий",
    optional: "Необязательно",
    markDoneTitle: "Отметить выполненной?",
    undoDoneTitle: "Отменить выполнение?",
    rhythmTrendAria: "Тренд ритма за 7 дней",
    dayStatuses: ["Начни день", "В процессе", "Можно догнать", "Хороший темп", "День закрыт"],
    addSheetTitle: "Что добавим?",
    addSheetSubtitle: "Создай действие на день или период",
    name: "Название",
    namePlaceholder: "Например, Английский",
    group: "Группа",
    groupPlaceholder: "Дом, здоровье, учеба",
    templates: "Шаблоны",
    icon: "Иконка",
    changeIcon: "Изменить иконку",
    chooseIcon: "Выбрать иконку",
    emojiHint: "Выбери один emoji из списка или введи его с клавиатуры.",
    emojiWarning: "Здесь нужен именно emoji.",
    iconPickerAria: "Выбор иконки",
    noIcon: "Без иконки",
    tracking: "Как отмечать?",
    doneNotDone: "Готово / не готово",
    countQuantity: "Считать количество",
    repeat: "Как повторять?",
    everyDay: "Каждый день",
    weekdays: "Будни",
    selectedDays: "Выбранные дни",
    period: "На какой период?",
    today: "Сегодня",
    weekOption: "Неделя",
    monthOption: "Месяц",
    custom: "Свой",
    startDate: "Дата начала",
    endDate: "Дата окончания",
    total: "Сколько всего",
    unit: "Единица",
    unitPlaceholder: "уроков",
    alreadyDone: "Уже сделано",
    currentAmount: "Сделано сейчас",
    quickButtons: "Быстрые кнопки",
    preview: "Предпросмотр",
    inDay: "В день",
    inWeek: "В неделю",
    format: "Формат",
    remainingTime: "Осталось",
    dueBefore: "Сделать до",
    addDueTime: "Сделать до времени",
    dueOnTime: "вовремя",
    dueLate: "поздно",
    dueOverdue: "просрочено",
    dueLeft: "осталось",
    advanced: "Дополнительно",
    progressTemplates: "С прогрессом",
    checklistTemplates: "Чек-лист",
    validationTitle: "Добавьте название.",
    validationPositive: "Укажите значение больше 0.",
    validationUnit: "Укажите единицу измерения.",
    validationCurrent: "Уже сделано не может быть меньше 0.",
    validationDate: "Дата окончания должна быть не раньше даты начала.",
    validationDays: "Выберите хотя бы один день недели.",
    validationDuplicate: "Такое название уже есть на этот день. Измени название или открой существующее действие.",
    syncLoading: "Загружаем данные Supabase...",
    syncSaving: "Сохраняем...",
    syncError: "Supabase недоступен. Включен локальный режим.",
    syncLocal: "Локальный режим: добавь Supabase env для синхронизации тестеров.",
    syncMissingEnv: "Supabase env не настроен на Vercel.",
    syncQueryError: "Supabase подключен, но запрос не прошел. Проверь таблицы или доступ.",
    repeatOnce: "Один раз",
    lowPriority: "Низкий",
    mediumPriority: "Средний",
    highPriority: "Высокий",
  },
} as const;

type UiCopy = (typeof uiCopy)[AppSettings["language"]];
type SyncStatus = "local" | "missing-env" | "loading" | "ready" | "saving" | "query-error";
type AiTrackingType = "checkbox" | "quantity";
type AiRepeatMode = "once" | "daily" | "weekdays" | "selected_days";
type AiPeriod = "today" | "week" | "month" | "custom";

type AiSubitemDraft = {
  title: string;
  target?: number | null;
};

type AiActionDraft = {
  title: string;
  icon?: string;
  tracking_type: AiTrackingType;
  target_value?: number | null;
  unit?: string | null;
  repeat_mode: AiRepeatMode;
  period: AiPeriod;
  due_time?: string | null;
  subitems?: AiSubitemDraft[];
};

type AiPreviewState =
  | {
      type: "action";
      draft: AiActionDraft;
    }
  | {
      type: "subitems";
      subitems: AiSubitemDraft[];
    }
  | null;

type ProgressSheetState = {
  goal: ProgressGoal;
} | null;

type ConfirmState = {
  task: TaskItem;
  nextCompleted: boolean;
} | null;

type ViewAllState = "goals" | "tasks" | null;

type DeleteState =
  | {
      type: "goal";
      goal: ProgressGoal;
    }
  | {
      type: "task";
      task: TaskItem;
    }
  | null;

type EditState =
  | {
      type: "goal";
      goal: ProgressGoal;
    }
  | {
      type: "task";
      task: TaskItem;
    }
  | null;

type ActionSheetState =
  | {
      type: "goal";
      goal: ProgressGoal;
    }
  | {
      type: "task";
      task: TaskItem;
    }
  | null;

type TodayActionItem =
  | {
      type: "task";
      task: TaskItem;
      id: string;
      groupName?: string;
      sortOrder: number;
      completed: boolean;
      index: number;
    }
  | {
      type: "goal";
      goal: ProgressGoal;
      id: string;
      groupName?: string;
      sortOrder: number;
      completed: boolean;
      index: number;
    };

type TodayActionGroup = {
  key: string;
  title?: string;
  items: TodayActionItem[];
  order: number;
};

type CarryOverCandidate =
  | {
      type: "goal";
      goal: ProgressGoal;
      movedFromDate: string;
      detail: string;
    }
  | {
      type: "task";
      task: TaskItem;
      movedFromDate: string;
      detail?: string;
    };

type CalendarDayDetail = {
  id: string;
  title: string;
  detail?: string;
};

type CalendarDayDetails = {
  percent: number;
  completedActions: number;
  totalActions: number;
  completed: CalendarDayDetail[];
  remaining: CalendarDayDetail[];
  missed: CalendarDayDetail[];
  progressEntries: CalendarDayDetail[];
  hasData: boolean;
};

type ProgressPeriod = "week" | "month" | "year" | "period";
type ProgressPanelId = "metrics" | "rhythm" | "chart" | "balance" | "days" | "actions";
type CalendarFilterMode = "all" | "activity" | "closed" | "partial" | "missed";

type ProgressChartPoint = {
  label: string;
  value: number;
  hasData: boolean;
};

type ReorderPlacement = "before" | "after";

type ProgressActionRank = {
  id: string;
  title: string;
  emoji?: string;
  iconKey?: string;
  percent: number;
};

function createId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
}

function capitalizeLabel(value: string): string {
  return value ? `${value.charAt(0).toLocaleUpperCase()}${value.slice(1)}` : value;
}

function reorderById<T extends { id: string }>(items: T[], sourceId: string, targetId: string, placement: ReorderPlacement = "before"): T[] {
  const ordered = [...items].sort((first, second) => {
    const firstOrder = Number((first as { sortOrder?: number }).sortOrder ?? items.indexOf(first) + 1);
    const secondOrder = Number((second as { sortOrder?: number }).sortOrder ?? items.indexOf(second) + 1);

    return firstOrder - secondOrder;
  });
  const sourceIndex = ordered.findIndex((item) => item.id === sourceId);
  const targetIndex = ordered.findIndex((item) => item.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1) {
    return items;
  }

  const [source] = ordered.splice(sourceIndex, 1);
  const nextTargetIndex = ordered.findIndex((item) => item.id === targetId);

  if (nextTargetIndex === -1) {
    return items;
  }

  ordered.splice(placement === "after" ? nextTargetIndex + 1 : nextTargetIndex, 0, source);

  return ordered;
}

function normalizeDueTimeInput(value: string): string | undefined {
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

function getDueDateTime(dateKey: string, dueTime: string): Date {
  const date = parseDateKey(dateKey);
  const [hours, minutes] = dueTime.split(":").map(Number);
  date.setHours(hours || 0, minutes || 0, 0, 0);

  return date;
}

function isLateForDueTime(dateKey: string, dueTime: string | undefined, completedAt: string): boolean {
  if (!dueTime) {
    return false;
  }

  return new Date(completedAt).getTime() > getDueDateTime(dateKey, dueTime).getTime();
}

function formatDueMeta(
  dueTime: string | undefined,
  dateKey: string,
  completed: boolean,
  completedAt: string | undefined,
  isLate: boolean,
  nowMs: number,
  copy: UiCopy,
): string | undefined {
  if (!dueTime) {
    return undefined;
  }

  if (completed) {
    return `${copy.dueBefore} ${dueTime} · ${isLate ? copy.dueLate : copy.dueOnTime}`;
  }

  const dueMs = getDueDateTime(dateKey, dueTime).getTime();
  const today = todayKey();

  if (dateKey > today) {
    return `${copy.dueBefore} ${dueTime}`;
  }

  if (completedAt) {
    return `${copy.dueBefore} ${dueTime} · ${isLateForDueTime(dateKey, dueTime, completedAt) ? copy.dueLate : copy.dueOnTime}`;
  }

  if (nowMs > dueMs || dateKey < today) {
    return `${copy.dueBefore} ${dueTime} · ${copy.dueOverdue}`;
  }

  const remainingMinutes = Math.max(Math.ceil((dueMs - nowMs) / 60000), 0);

  return `${copy.dueBefore} ${dueTime} · ${copy.dueLeft} ${formatShortMinutes(remainingMinutes)}`;
}

function formatShortMinutes(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    return rest > 0 ? `${hours}ч ${rest}м` : `${hours}ч`;
  }

  return `${minutes} мин`;
}

function getActiveDate(selectedDate: string | null, todayDateKey: string): string {
  return selectedDate ?? todayDateKey;
}

function getDayPlural(value: number, language: AppSettings["language"] = "ru"): string {
  if (language === "en") {
    return value === 1 ? "day" : "days";
  }

  const mod10 = Math.abs(value) % 10;
  const mod100 = Math.abs(value) % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return "день";
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "дня";
  }

  return "дней";
}

function getDefaultQuickValues(unit: string): number[] {
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

function getFillToneStyle(percent: number): CSSProperties {
  const clamped = clampPercent(percent);
  const hue = Math.round(4 + clamped * 1.42);
  const secondHue = Math.min(hue + 18, 156);

  return {
    "--fill-hue": `${hue}`,
    "--fill-hue-2": `${secondHue}`,
    "--rhythm-hue-start": `${hue}`,
    "--rhythm-hue-end": `${secondHue}`,
  } as CSSProperties;
}

const emojiPattern = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u;

const actionEmojiOptions = [
  "✅", "❌", "⭐", "🔥", "🎯", "📌", "📚", "📝", "💡", "🧠",
  "🌐", "🎓", "💻", "📞", "✉️", "📅", "⏰", "💊", "💧", "🥗",
  "☕", "🍎", "🏃", "🚶", "💪", "🧘", "🏋️", "⚽", "🚴", "🏊",
  "🏠", "🧹", "🛒", "💼", "💰", "📈", "🎧", "🎵", "🎨", "📷",
  "🌙", "☀️", "🌿", "🛡️", "🚗", "✈️", "🎁", "❤️", "🧩", "🔧",
  "🍞", "🥛", "🥚", "🧺", "🛏️", "🪴", "📖", "🔤", "🧪", "🔒",
  "🧾", "🗂️", "🧭", "🏆", "🚀", "🪙", "🧼", "🦷", "👟", "🕯️",
];

const iconEmojiMap: Record<string, string> = {
  book: "📚",
  target: "🎯",
  dumbbell: "💪",
  run: "🏃",
  home: "🏠",
  cart: "🛒",
  language: "🌐",
  star: "⭐",
  fire: "🔥",
  plus: "✅",
  graduation: "🎓",
  droplet: "💧",
  clock: "⏰",
  calendar: "📅",
  moon: "🌙",
  pill: "💊",
  shield: "🛡️",
  phone: "📞",
  mail: "✉️",
};

function getIconEmoji(iconKey?: string): string | undefined {
  return iconKey ? iconEmojiMap[iconKey] : undefined;
}

function normalizeEmojiChoice(value: string): string | undefined {
  const normalized = Array.from(value.trim()).filter((char) => emojiPattern.test(char)).slice(0, 2).join("");

  return normalized || undefined;
}

function inferEmojiFromTitle(title: string): string | undefined {
  const normalized = title.trim().toLocaleLowerCase("ru-RU");

  if (!normalized) {
    return undefined;
  }

  const rules: Array<[string[], string]> = [
    [["англ", "язык", "english", "lesson", "урок"], "🌐"],
    [["чтен", "книг", "book", "read", "страниц"], "📚"],
    [["бег", "ходь", "шаг", "walk", "run", "прогул"], "🏃"],
    [["трен", "зал", "спорт", "заряд", "workout"], "💪"],
    [["убор", "дом", "home", "clean"], "🏠"],
    [["магаз", "покуп", "shop", "grocery"], "🛒"],
    [["сон", "sleep"], "🌙"],
    [["витамин", "таблет", "pill"], "💊"],
    [["вода", "water"], "💧"],
    [["медит", "дыхан", "medit"], "🧘"],
    [["почт", "mail", "email"], "✉️"],
    [["звон", "созвон", "call"], "📞"],
    [["план", "кален", "date"], "📅"],
    [["проект", "задач", "focus"], "🎯"],
  ];

  return rules.find(([keywords]) => keywords.some((keyword) => normalized.includes(keyword)))?.[1];
}

function getActionEmoji(action: Pick<ProgressGoal | TaskItem, "emoji" | "iconKey" | "title">, fallback = "✅"): string {
  return action.emoji?.trim() || getIconEmoji(action.iconKey) || inferEmojiFromTitle(action.title) || fallback;
}

const aiFallbackEmojiRules: Array<[string[], string]> = [
  [["зарядка", "тренировка", "спорт"], "🏋️"],
  [["прогулка", "ходьба"], "🚶"],
  [["бег"], "🏃"],
  [["английский", "язык"], "🇬🇧"],
  [["чтение", "книга"], "📚"],
  [["вода"], "💧"],
  [["медитация"], "🧘"],
  [["магазин", "покупки"], "🛒"],
  [["уборка"], "🧹"],
  [["сон"], "😴"],
  [["работа", "проект"], "💻"],
  [["учеба", "курс"], "🎓"],
];

function inferAiEmoji(text: string): string {
  const normalized = text.toLocaleLowerCase("ru-RU");

  return aiFallbackEmojiRules.find(([keywords]) => keywords.some((keyword) => normalized.includes(keyword)))?.[1] ?? "✨";
}

function buildLocalAiDraft(text: string): AiActionDraft {
  const normalized = text.toLocaleLowerCase("ru-RU");
  const targetMatch = normalized.match(/(\d+(?:[.,]\d+)?)/);
  const targetValue = targetMatch ? Number(targetMatch[1].replace(",", ".")) : null;
  const hasQuantity = Boolean(targetValue && Number.isFinite(targetValue));
  const period: AiPeriod = /недел|week/.test(normalized) ? "week" : /сегодня|today/.test(normalized) ? "today" : "month";
  const repeatMode: AiRepeatMode = /будн|weekday/.test(normalized) ? "weekdays" : !hasQuantity && period === "today" ? "once" : "daily";
  const unitMatch = normalized.match(/\d+(?:[.,]\d+)?\s+([а-яёa-z]+)/i);
  const dueTime = normalized.match(/(?:до|before)\s*(\d{1,2}:\d{2})/)?.[1] ?? null;
  const knownTitle = [
    "английский",
    "немецкий",
    "чтение",
    "зарядка",
    "тренировка",
    "бег",
    "ходьба",
    "вода",
    "медитация",
    "магазин",
    "уборка",
    "сон",
    "учеба",
    "проект",
  ].find((keyword) => normalized.includes(keyword));
  const fallbackTitle = text
    .replace(/\d+(?:[.,]\d+)?/g, "")
    .replace(/\b(за|на|до|каждый|каждую|хочу|нужно|пройти|сделать|месяц|неделю|день)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const title = knownTitle ?? fallbackTitle ?? text.trim() ?? "Действие";
  const normalizedTitle = title.charAt(0).toLocaleUpperCase("ru-RU") + title.slice(1, 42);

  return {
    title: normalizedTitle,
    icon: inferAiEmoji(text),
    tracking_type: hasQuantity ? "quantity" : "checkbox",
    target_value: hasQuantity ? targetValue : null,
    unit: hasQuantity ? unitMatch?.[1] ?? "раз" : null,
    repeat_mode: repeatMode,
    period,
    due_time: dueTime,
    subitems: [],
  };
}

function buildLocalSubitems(title: string): AiSubitemDraft[] {
  const normalized = title.toLocaleLowerCase("ru-RU");

  if (/заряд|трениров|спорт/.test(normalized)) {
    return [
      { title: "Разминка", target: 1 },
      { title: "Приседания", target: 3 },
      { title: "Отжимания", target: 3 },
      { title: "Пресс", target: 3 },
      { title: "Растяжка", target: 1 },
    ];
  }

  if (/магаз|покуп/.test(normalized)) {
    return [{ title: "Молоко" }, { title: "Хлеб" }, { title: "Яйца" }, { title: "Овощи" }];
  }

  if (/уборк/.test(normalized)) {
    return [{ title: "Пол" }, { title: "Пыль" }, { title: "Кухня" }, { title: "Вещи" }];
  }

  return [{ title: "Шаг 1" }, { title: "Шаг 2" }, { title: "Шаг 3" }];
}

function normalizeAiActionDraft(value: unknown, fallbackText: string): AiActionDraft {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const local = buildLocalAiDraft(fallbackText);
  const target = Number(record.target_value);
  const subitems = Array.isArray(record.subitems)
    ? record.subitems
        .map((item) => {
          const subitem = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
          const title = typeof subitem.title === "string" ? subitem.title.trim() : "";
          const count = Number(subitem.target ?? subitem.targetCount);

          return title ? { title, target: Number.isFinite(count) && count > 1 ? Math.floor(count) : undefined } : null;
        })
        .filter((item): item is AiSubitemDraft => Boolean(item))
        .slice(0, 12)
    : [];

  return {
    title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : local.title,
    icon: typeof record.icon === "string" && record.icon.trim() ? record.icon.trim() : local.icon,
    tracking_type: record.tracking_type === "checkbox" || record.tracking_type === "quantity" ? record.tracking_type : local.tracking_type,
    target_value: Number.isFinite(target) && target > 0 ? target : local.target_value,
    unit: typeof record.unit === "string" && record.unit.trim() ? record.unit.trim() : local.unit,
    repeat_mode: record.repeat_mode === "once" || record.repeat_mode === "daily" || record.repeat_mode === "weekdays" || record.repeat_mode === "selected_days" ? record.repeat_mode : local.repeat_mode,
    period: record.period === "today" || record.period === "week" || record.period === "month" || record.period === "custom" ? record.period : local.period,
    due_time: typeof record.due_time === "string" && record.due_time.trim() ? record.due_time.trim() : local.due_time,
    subitems,
  };
}

function normalizeAiSubitems(value: unknown, title: string): AiSubitemDraft[] {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const rawSubitems = Array.isArray(record.subitems) ? record.subitems : buildLocalSubitems(title);

  return rawSubitems
    .map((item) => {
      const subitem = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
      const subitemTitle = typeof subitem.title === "string" ? subitem.title.trim() : "";
      const count = Number(subitem.target ?? subitem.targetCount);

      return subitemTitle ? { title: subitemTitle, target: Number.isFinite(count) && count > 1 ? Math.floor(count) : undefined } : null;
    })
    .filter((item): item is AiSubitemDraft => Boolean(item))
    .slice(0, 12);
}

function getAiLabels(language: AppSettings["language"]) {
  return language === "en"
    ? {
        parse: "Parse with AI",
        suggestList: "Suggest list",
        loading: "Thinking...",
        understood: "I understood it as:",
        apply: "Apply",
        edit: "Edit",
        cancel: "Cancel",
        failed: "AI could not parse the action. Try a simpler phrase.",
        describeFirst: "Type a phrase first.",
        tracking: "Tracking",
        quantity: "Quantity",
        checkbox: "Done / not done",
        target: "Target",
        period: "Period",
        repeat: "Repeat",
        due: "Do before",
        subitems: "List",
      }
    : {
        parse: "Разобрать через ИИ",
        suggestList: "Предложить список",
        loading: "Думаю...",
        understood: "Я понял так:",
        apply: "Применить",
        edit: "Изменить",
        cancel: "Отмена",
        failed: "ИИ не смог разобрать действие. Попробуй проще.",
        describeFirst: "Сначала введи описание.",
        tracking: "Формат",
        quantity: "Количество",
        checkbox: "Готово / не готово",
        target: "Цель",
        period: "Период",
        repeat: "Повтор",
        due: "Сделать до",
        subitems: "Список",
      };
}

function EmojiPickerPanel({
  value,
  title,
  copy,
  inputRef,
  onChange,
}: {
  value?: string;
  title: string;
  copy: UiCopy;
  inputRef?: RefObject<HTMLInputElement | null>;
  onChange: (emoji?: string) => void;
}) {
  const [draftValue, setDraftValue] = useState(value ?? "");
  const suggestedEmoji = inferEmojiFromTitle(title);
  const showWarning = draftValue.trim().length > 0 && !normalizeEmojiChoice(draftValue);

  useEffect(() => {
    setDraftValue(value ?? "");
  }, [value]);

  function handleInputChange(nextValue: string) {
    setDraftValue(nextValue);

    const normalized = normalizeEmojiChoice(nextValue);
    if (normalized) {
      onChange(normalized);
      return;
    }

    if (!nextValue.trim()) {
      onChange(undefined);
    }
  }

  function selectEmoji(nextEmoji?: string) {
    setDraftValue(nextEmoji ?? "");
    onChange(nextEmoji);
  }

  return (
    <div className="emoji-picker-panel">
      <label className="native-emoji-field">
        <span>{copy.chooseIcon}</span>
        <input
          ref={inputRef}
          value={draftValue}
          inputMode="text"
          autoComplete="off"
          placeholder={suggestedEmoji ?? "🙂"}
          aria-describedby="emoji-picker-hint"
          onChange={(event) => handleInputChange(event.target.value)}
        />
      </label>
      <p id="emoji-picker-hint" className={`emoji-input-hint ${showWarning ? "warning" : ""}`}>
        {showWarning ? copy.emojiWarning : copy.emojiHint}
      </p>
      <div className="emoji-choice-grid" role="listbox" aria-label={copy.iconPickerAria}>
        <button
          type="button"
          className={`emoji-choice ${!value ? "active" : ""}`}
          aria-selected={!value}
          onClick={() => selectEmoji(undefined)}
        >
          <span aria-hidden="true">×</span>
        </button>
        {actionEmojiOptions.map((option) => (
          <button
            type="button"
            className={`emoji-choice ${value === option ? "active" : ""}`}
            aria-selected={value === option}
            key={option}
            onClick={() => selectEmoji(option)}
          >
            <span aria-hidden="true">{option}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function getScheduledGoalsForDate(state: AppState, dateKey: string): ProgressGoal[] {
  const date = parseDateKey(dateKey);
  const skippedIds = new Set(
    (state.occurrences ?? [])
      .filter((occurrence) => occurrence.itemType === "goal" && occurrence.date === dateKey && occurrence.status === "skipped")
      .map((occurrence) => occurrence.itemId),
  );
  const scheduled = state.goals.filter((goal) => !skippedIds.has(goal.id) && isGoalDueOnDate(goal, date, dateKey));
  const scheduledIds = new Set(scheduled.map((goal) => goal.id));
  const carried = (state.occurrences ?? [])
    .filter((occurrence) => occurrence.itemType === "goal" && occurrence.date === dateKey && occurrence.status !== "skipped" && !scheduledIds.has(occurrence.itemId) && !skippedIds.has(occurrence.itemId))
    .map((occurrence) => state.goals.find((goal) => goal.id === occurrence.itemId))
    .filter((goal): goal is ProgressGoal => Boolean(goal))
    .map((goal) => ({
      ...goal,
      startDate: dateKey,
      endDate: dateKey,
      repeatMode: "everyDay" as GoalRepeatMode,
      selectedDays: undefined,
    }));

  return [...scheduled, ...carried];
}

function getScheduledTasksForDate(state: AppState, dateKey: string): TaskItem[] {
  const date = parseDateKey(dateKey);
  const skippedIds = new Set(
    (state.occurrences ?? [])
      .filter((occurrence) => occurrence.itemType === "task" && occurrence.date === dateKey && occurrence.status === "skipped")
      .map((occurrence) => occurrence.itemId),
  );
  const scheduled = state.tasks.filter((task) => !skippedIds.has(task.id) && isTaskDueOnDate(task, date, dateKey));
  const scheduledIds = new Set(scheduled.map((task) => task.id));
  const carried = (state.occurrences ?? [])
    .filter((occurrence) => occurrence.itemType === "task" && occurrence.date === dateKey && occurrence.status !== "skipped" && !scheduledIds.has(occurrence.itemId) && !skippedIds.has(occurrence.itemId))
    .map((occurrence) => state.tasks.find((task) => task.id === occurrence.itemId))
    .filter((task): task is TaskItem => Boolean(task))
    .map((task) => ({
      ...task,
      startDate: dateKey,
      endDate: dateKey,
      date: dateKey,
      repeatMode: "once" as TaskRepeatMode,
      selectedDays: undefined,
    }));

  return [...scheduled, ...carried];
}

function getEffectiveStateForDate(state: AppState, dateKey: string): AppState {
  return {
    ...state,
    goals: getScheduledGoalsForDate(state, dateKey),
    tasks: getScheduledTasksForDate(state, dateKey),
  };
}

function getCarryOverCandidates(state: AppState, todayDateKey: string, language: AppSettings["language"]): CarryOverCandidate[] {
  const yesterday = addDays(todayDateKey, -1);
  const yesterdayDate = parseDateKey(yesterday);
  const todayDate = parseDateKey(todayDateKey);
  const alreadyCarried = new Set(
    (state.occurrences ?? [])
      .filter((occurrence) => occurrence.date === todayDateKey && occurrence.status !== "skipped")
      .map((occurrence) => occurrence.itemId),
  );
  const candidates: CarryOverCandidate[] = [];

  state.tasks.forEach((task) => {
    if (
      alreadyCarried.has(task.id) ||
      !isTaskDueOnDate(task, yesterdayDate, yesterday) ||
      isTaskDueOnDate(task, todayDate, todayDateKey) ||
      isTaskCompletedOnDate(task, yesterday)
    ) {
      return;
    }

    candidates.push({
      type: "task",
      task,
      movedFromDate: yesterday,
      detail: language === "en" ? "not done" : "не выполнено",
    });
  });

  state.goals.forEach((goal) => {
    if (alreadyCarried.has(goal.id) || !isGoalDueOnDate(goal, yesterdayDate, yesterday) || isGoalDueOnDate(goal, todayDate, todayDateKey)) {
      return;
    }

    const required = getRequiredToday(goal, yesterday);
    const logged = getTodayLoggedAmount(goal, yesterday);
    const completed = required <= 0 || logged >= required;

    if (completed) {
      return;
    }

    candidates.push({
      type: "goal",
      goal,
      movedFromDate: yesterday,
      detail: `${formatNumber(logged)} / ${formatNumber(required)} ${goal.unit}`,
    });
  });

  return candidates;
}

function createCarryOverOccurrence(candidate: CarryOverCandidate, dateKey: string): TaskOccurrence {
  return {
    id: createId("occurrence"),
    itemId: candidate.type === "goal" ? candidate.goal.id : candidate.task.id,
    itemType: candidate.type,
    date: dateKey,
    status: "active",
    source: "carry_over",
    movedFromDate: candidate.movedFromDate,
    isCarryOver: true,
    createdAt: new Date().toISOString(),
  };
}

function createDateSkipOccurrence(itemId: string, itemType: TaskOccurrence["itemType"], dateKey: string): TaskOccurrence {
  return {
    id: createId("occurrence"),
    itemId,
    itemType,
    date: dateKey,
    status: "skipped",
    source: "date_skip",
    isCarryOver: false,
    createdAt: new Date().toISOString(),
  };
}

function getSubitemCopy(language: AppSettings["language"]) {
  return language === "en"
    ? {
        addList: "Add checklist",
        addItem: "Add item",
        titlePlaceholder: "Item",
        countPlaceholder: "Count",
        remove: "Remove",
        progress: "done",
        reset: "Reset",
      }
    : {
        addList: "Добавить список",
        addItem: "Добавить пункт",
        titlePlaceholder: "Пункт",
        countPlaceholder: "Кол-во",
        remove: "Удалить",
        progress: "выполнено",
        reset: "Сбросить",
      };
}

function parseQuickValues(value: string, unit: string): number[] {
  const parsed = value
    .split(/[,\s]+/)
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part) && part > 0);

  if (parsed.length > 0) {
    return parsed;
  }

  return getDefaultQuickValues(unit);
}

function formatDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parseDateKey(dateKey));
}

const ruWeekdaysShort = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const ruMonthsShort = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."];
const ruMonthsLong = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const ruMonthsGenitive = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const ruWeekdaysLower = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const enWeekdaysShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const enMonthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
const enMonthsLong = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const enWeekdaysLong = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTodayDate(date: Date, language: AppSettings["language"]): string {
  if (language === "en") {
    return `${enWeekdaysShort[date.getDay()]}, ${enMonthsShort[date.getMonth()]} ${date.getDate()}`;
  }

  return `${ruWeekdaysShort[date.getDay()]}, ${date.getDate()} ${ruMonthsShort[date.getMonth()]}`;
}

function formatCalendarMonth(date: Date, language: AppSettings["language"]): string {
  if (language === "en") {
    return `${enMonthsLong[date.getMonth()]} ${date.getFullYear()}`;
  }

  return `${ruMonthsLong[date.getMonth()]} ${date.getFullYear()}`;
}

function formatCalendarSelectedDate(date: Date, language: AppSettings["language"]): string {
  if (language === "en") {
    return `${enMonthsLong[date.getMonth()]} ${date.getDate()}`;
  }

  return `${date.getDate()} ${ruMonthsGenitive[date.getMonth()]}`;
}

function formatCalendarBestWeekday(date: Date | null, language: AppSettings["language"]): string {
  if (!date) {
    return "—";
  }

  return language === "en" ? enWeekdaysLong[date.getDay()].toLowerCase() : ruWeekdaysLower[date.getDay()];
}

function getCalendarWeekdayLabels(language: AppSettings["language"]): string[] {
  return language === "en" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
}

function getCalendarMonthGrid(monthDate: Date): Date[] {
  const firstDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const lastDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const start = new Date(firstDate);
  start.setDate(firstDate.getDate() - ((firstDate.getDay() + 6) % 7));
  const end = new Date(lastDate);
  end.setDate(lastDate.getDate() + (7 - (lastDate.getDay() || 7)));

  const dates: Date[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function getCalendarDayDetails(
  date: Date,
  appState: AppState,
  dayRecords: Array<{ date: string; percent: number }>,
  today: string,
  todayPercent: number,
): CalendarDayDetails {
  const dateKey = toDateKey(date);
  const record = dayRecords.find((item) => item.date === dateKey);
  const dueGoals = getScheduledGoalsForDate(appState, dateKey);
  const dueTasks = getScheduledTasksForDate(appState, dateKey);
  const completed: CalendarDayDetail[] = [];
  const remaining: CalendarDayDetail[] = [];
  const missed: CalendarDayDetail[] = [];
  const progressEntries: CalendarDayDetail[] = [];
  const isPast = dateKey < today;

  dueGoals.forEach((goal) => {
    const required = getCalendarRequiredForDate(goal, dateKey);
    const logged = getCalendarLoggedAmount(goal, dateKey);
    const completedGoal = required <= 0 || logged >= required || getCalendarGoalValueAtEndOfDate(goal, dateKey) >= goal.targetValue;
    const detail = required > 0 ? `${formatNumber(logged)} / ${formatNumber(required)}` : `${formatNumber(logged)} ${goal.unit}`;
    const item = {
      id: goal.id,
      title: goal.title,
      detail,
    };

    if (completedGoal) {
      completed.push(item);
    } else {
      remaining.push(item);
    }
  });

  appState.goals.forEach((goal) => {
    goal.progressEntries
      .filter((entry) => entry.date === dateKey)
      .forEach((entry) => {
        progressEntries.push({
          id: entry.id,
          title: goal.title,
          detail: `+${formatNumber(entry.amount)} ${goal.unit}${entry.note ? ` · ${entry.note}` : ""}`,
        });
      });
  });

  dueTasks.forEach((task) => {
    const item = {
      id: task.id,
      title: task.title,
    };

    if (isTaskCompletedOnDate(task, dateKey)) {
      completed.push(item);
    } else if (isPast) {
      missed.push(item);
    } else {
      remaining.push(item);
    }
  });

  const completedActions = completed.length;
  const totalActions = dueGoals.length + dueTasks.length;
  const percent = totalActions === 0 ? 0 : clampPercent((completedActions / totalActions) * 100);
  const hasActivity =
    appState.goals.some((goal) => goal.progressEntries.some((entry) => entry.date === dateKey)) ||
    appState.tasks.some((task) => isTaskCompletedOnDate(task, dateKey));
  const hasData = totalActions > 0 || hasActivity || Boolean(record);

  return {
    percent,
    completedActions,
    totalActions,
    completed,
    remaining,
    missed,
    progressEntries,
    hasData,
  };
}

function getCalendarLoggedAmount(goal: ProgressGoal, dateKey: string): number {
  return goal.progressEntries
    .filter((entry) => entry.date === dateKey)
    .reduce((total, entry) => total + entry.amount, 0);
}

function getCalendarEntriesTotal(goal: ProgressGoal, predicate: (dateKey: string) => boolean): number {
  return goal.progressEntries
    .filter((entry) => predicate(entry.date))
    .reduce((total, entry) => total + entry.amount, 0);
}

function getCalendarGoalBaseline(goal: ProgressGoal): number {
  return Math.max(goal.currentValue - getCalendarEntriesTotal(goal, () => true), 0);
}

function getCalendarGoalValueBeforeDate(goal: ProgressGoal, dateKey: string): number {
  return getCalendarGoalBaseline(goal) + getCalendarEntriesTotal(goal, (entryDate) => entryDate < dateKey);
}

function getCalendarGoalValueAtEndOfDate(goal: ProgressGoal, dateKey: string): number {
  if (dateKey === todayKey()) {
    return goal.currentValue;
  }

  return getCalendarGoalBaseline(goal) + getCalendarEntriesTotal(goal, (entryDate) => entryDate <= dateKey);
}

function countCalendarActiveDays(goal: ProgressGoal, startDate: string): number {
  if (startDate > goal.endDate) {
    return 0;
  }

  let count = 0;
  let cursor = startDate;

  while (cursor <= goal.endDate) {
    if (isGoalDueOnDate(goal, parseDateKey(cursor), cursor)) {
      count += 1;
    }

    cursor = addDays(cursor, 1);
  }

  return count;
}

function getCalendarRequiredForDate(goal: ProgressGoal, dateKey: string): number {
  if (!isGoalDueOnDate(goal, parseDateKey(dateKey), dateKey)) {
    return 0;
  }

  if (dateKey === todayKey()) {
    return getRequiredToday(goal, dateKey);
  }

  const valueAtStart = getCalendarGoalValueBeforeDate(goal, dateKey);
  const remaining = Math.max(goal.targetValue - valueAtStart, 0);
  const remainingActiveDays = countCalendarActiveDays(goal, dateKey);

  if (remaining <= 0) {
    return 0;
  }

  return remainingActiveDays <= 0 ? remaining : Math.ceil(remaining / remainingActiveDays);
}

function getCalendarDayTone(percent: number, hasData: boolean): "closed" | "partial" | "missed" | "empty" {
  if (!hasData) {
    return "empty";
  }

  if (percent >= 100) {
    return "closed";
  }

  if (percent > 0) {
    return "partial";
  }

  return "missed";
}

function getCalendarFilterMatch(mode: CalendarFilterMode, details: CalendarDayDetails, tone: ReturnType<typeof getCalendarDayTone>): boolean {
  if (mode === "all") {
    return true;
  }

  if (mode === "activity") {
    return details.hasData;
  }

  if (mode === "closed") {
    return tone === "closed";
  }

  if (mode === "partial") {
    return tone === "partial";
  }

  return tone === "missed" || details.missed.length > 0;
}

function getCalendarMonthStats(
  monthDate: Date,
  appState: AppState,
  dayRecords: Array<{ date: string; percent: number }>,
  today: string,
  todayPercent: number,
) {
  const days = Array.from(
    { length: new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate() },
    (_, index) => new Date(monthDate.getFullYear(), monthDate.getMonth(), index + 1),
  );
  const summaries = days
    .filter((date) => toDateKey(date) <= today)
    .map((date) => ({
      date,
      ...getCalendarDayDetails(date, appState, dayRecords, today, todayPercent),
    }))
    .filter((summary) => summary.hasData);

  if (summaries.length === 0) {
    return {
      average: 0,
      bestDay: null as Date | null,
    };
  }

  const best = summaries.reduce((currentBest, summary) => (summary.percent > currentBest.percent ? summary : currentBest), summaries[0]);
  const total = summaries.reduce((sum, summary) => sum + summary.percent, 0);

  return {
    average: Math.round(total / summaries.length),
    bestDay: best.date,
  };
}

function getProgressRange(period: ProgressPeriod, date: Date): Date[] {
  if (period === "week") {
    return getWeekRange(date);
  }

  if (period === "month") {
    return getMonthRange(date);
  }

  if (period === "year") {
    const days: Date[] = [];
    const cursor = new Date(date.getFullYear(), 0, 1);

    while (cursor.getFullYear() === date.getFullYear()) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    return days;
  }

  return Array.from({ length: 30 }, (_, index) => parseDateKey(addDays(toDateKey(date), index - 29)));
}

function getPreviousProgressRange(period: ProgressPeriod, date: Date): Date[] {
  if (period === "week") {
    const previous = new Date(date);
    previous.setDate(date.getDate() - 7);

    return getProgressRange(period, previous);
  }

  if (period === "month") {
    return getMonthRange(new Date(date.getFullYear(), date.getMonth() - 1, 1));
  }

  if (period === "year") {
    return getProgressRange(period, new Date(date.getFullYear() - 1, date.getMonth(), date.getDate()));
  }

  return Array.from({ length: 30 }, (_, index) => parseDateKey(addDays(toDateKey(date), index - 59)));
}

function getProgressRangeFromKeys(startDate: string, endDate: string): Date[] {
  if (endDate < startDate) {
    return [];
  }

  const totalDays = Math.min(daysInclusive(startDate, endDate), 3660);

  return Array.from({ length: totalDays }, (_, index) => parseDateKey(addDays(startDate, index)));
}

function getPreviousProgressRangeFromKeys(startDate: string, endDate: string): Date[] {
  if (endDate < startDate) {
    return [];
  }

  const totalDays = Math.min(daysInclusive(startDate, endDate), 3660);
  const previousEnd = addDays(startDate, -1);
  const previousStart = addDays(previousEnd, -(totalDays - 1));

  return getProgressRangeFromKeys(previousStart, previousEnd);
}

function getProgressAverage(
  range: Date[],
  appState: AppState,
  dayRecords: Array<{ date: string; percent: number }>,
  today: string,
  todayPercent: number,
) {
  const summaries = range
    .filter((date) => toDateKey(date) <= today)
    .map((date) => getCalendarDayDetails(date, appState, dayRecords, today, todayPercent))
    .filter((summary) => summary.hasData);

  if (summaries.length === 0) {
    return {
      average: 0,
      completedDays: 0,
      behindDays: 0,
      daysWithData: 0,
    };
  }

  const total = summaries.reduce((sum, summary) => sum + summary.percent, 0);

  return {
    average: clampPercent(total / summaries.length),
    completedDays: summaries.filter((summary) => summary.percent >= 100).length,
    behindDays: summaries.filter((summary) => summary.percent < 100).length,
    daysWithData: summaries.length,
  };
}

function bucketDates(dates: Date[], bucketCount: number): Date[][] {
  const cleanCount = Math.max(Math.floor(bucketCount), 1);
  const bucketSize = Math.max(Math.ceil(dates.length / cleanCount), 1);
  const buckets: Date[][] = [];

  for (let index = 0; index < dates.length; index += bucketSize) {
    buckets.push(dates.slice(index, index + bucketSize));
  }

  return buckets;
}

function getProgressChartPoints(
  period: ProgressPeriod,
  range: Date[],
  appState: AppState,
  dayRecords: Array<{ date: string; percent: number }>,
  today: string,
  todayPercent: number,
  language: AppSettings["language"],
): ProgressChartPoint[] {
  if (period === "week") {
    const labels = getCalendarWeekdayLabels(language);

    return range.map((date, index) => {
      const details = getCalendarDayDetails(date, appState, dayRecords, today, todayPercent);
      const future = toDateKey(date) > today;

      return {
        label: labels[index] ?? String(date.getDate()),
        value: future || !details.hasData ? 0 : details.percent,
        hasData: !future && details.hasData,
      };
    });
  }

  if (period === "year") {
    return Array.from({ length: 12 }, (_, month) => {
      const monthRange = getMonthRange(new Date(range[0]?.getFullYear() ?? new Date().getFullYear(), month, 1));
      const summary = getProgressAverage(monthRange, appState, dayRecords, today, todayPercent);

      return {
        label: language === "en" ? enMonthsShort[month] : ruMonthsShort[month],
        value: summary.average,
        hasData: summary.daysWithData > 0,
      };
    });
  }

  return bucketDates(range, 7).map((bucket) => {
    const summary = getProgressAverage(bucket, appState, dayRecords, today, todayPercent);
    const first = bucket[0] ?? new Date();

    return {
      label: String(first.getDate()),
      value: summary.average,
      hasData: summary.daysWithData > 0,
    };
  });
}

function getWeekdayAverages(
  range: Date[],
  appState: AppState,
  dayRecords: Array<{ date: string; percent: number }>,
  today: string,
  todayPercent: number,
  language: AppSettings["language"],
) {
  const buckets = Array.from({ length: 7 }, (_, index) => ({
    label: getCalendarWeekdayLabels(language)[index],
    total: 0,
    count: 0,
  }));

  range
    .filter((date) => toDateKey(date) <= today)
    .forEach((date) => {
      const details = getCalendarDayDetails(date, appState, dayRecords, today, todayPercent);

      if (!details.hasData) {
        return;
      }

      const mondayIndex = (date.getDay() + 6) % 7;
      buckets[mondayIndex].total += details.percent;
      buckets[mondayIndex].count += 1;
    });

  return buckets.map((bucket) => ({
    label: bucket.label,
    value: bucket.count === 0 ? 0 : clampPercent(bucket.total / bucket.count),
  }));
}

function getProgressBalance(range: Date[], appState: AppState, today: string, todayPercent: number, dayRecords: Array<{ date: string; percent: number }>) {
  let progressDue = 0;
  let checklistDue = 0;
  let misses = 0;

  range
    .filter((date) => toDateKey(date) <= today)
    .forEach((date) => {
      const dateKey = toDateKey(date);
      const dueGoals = appState.goals.filter((goal) => isGoalDueOnDate(goal, date, dateKey));
      const dueTasks = appState.tasks.filter((task) => isTaskDueOnDate(task, date, dateKey));
      const details = getCalendarDayDetails(date, appState, dayRecords, today, todayPercent);

      progressDue += dueGoals.length;
      checklistDue += dueTasks.length;
      misses += details.missed.length;
    });

  const total = progressDue + checklistDue + misses;

  return {
    totalActions: progressDue + checklistDue,
    progressShare: total === 0 ? 0 : clampPercent((progressDue / total) * 100),
    checklistShare: total === 0 ? 0 : clampPercent((checklistDue / total) * 100),
    missShare: total === 0 ? 0 : clampPercent((misses / total) * 100),
  };
}

function getProgressActionRanks(range: Date[], appState: AppState, today: string): ProgressActionRank[] {
  const activeRange = range.filter((date) => toDateKey(date) <= today);
  const goalRanks = appState.goals.map((goal) => {
    const dueDates = activeRange.filter((date) => isGoalDueOnDate(goal, date, toDateKey(date)));
    const completed = dueDates.filter((date) => {
      const dateKey = toDateKey(date);
      const required = getCalendarRequiredForDate(goal, dateKey);
      const logged = getCalendarLoggedAmount(goal, dateKey);

      return required <= 0 || logged >= required || getCalendarGoalValueAtEndOfDate(goal, dateKey) >= goal.targetValue;
    }).length;

    return {
      id: goal.id,
      title: goal.title,
      emoji: goal.emoji,
      iconKey: goal.iconKey,
      percent: dueDates.length === 0 ? 0 : clampPercent((completed / dueDates.length) * 100),
      dueCount: dueDates.length,
    };
  });
  const taskRanks = appState.tasks.map((task) => {
    const dueDates = activeRange.filter((date) => isTaskDueOnDate(task, date, toDateKey(date)));
    const completed = dueDates.filter((date) => isTaskCompletedOnDate(task, toDateKey(date))).length;

    return {
      id: task.id,
      title: task.title,
      emoji: task.emoji,
      iconKey: task.iconKey,
      percent: dueDates.length === 0 ? 0 : clampPercent((completed / dueDates.length) * 100),
      dueCount: dueDates.length,
    };
  });

  return [...goalRanks, ...taskRanks]
    .filter((rank) => rank.dueCount > 0)
    .sort((left, right) => right.percent - left.percent)
    .slice(0, 5)
    .map(({ dueCount: _dueCount, ...rank }) => rank);
}

function getProgressRhythmTitle(percent: number, language: AppSettings["language"]): string {
  const copy = progressCopy[language];

  if (percent >= 75) {
    return copy.stable;
  }

  if (percent >= 50) {
    return copy.moving;
  }

  if (percent > 0) {
    return copy.uneven;
  }

  return copy.justStart;
}

function getLocalizedDayStatus(percent: number, language: AppSettings["language"]): string {
  const statuses = uiCopy[language].dayStatuses;

  if (percent === 0) {
    return statuses[0];
  }

  if (percent < 40) {
    return statuses[1];
  }

  if (percent < 70) {
    return statuses[2];
  }

  if (percent < 100) {
    return statuses[3];
  }

  return statuses[4];
}

function dedupeTodayTasks(tasks: TaskItem[], dateKey: string): TaskItem[] {
  const seen = new Set<string>();

  return tasks.filter((task) => {
    const key = [task.title.trim().toLowerCase(), dateKey, task.repeatMode ?? "once"].join("|");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function sortTasksForToday(tasks: TaskItem[], dateKey: string): TaskItem[] {
  return tasks
    .map((task, index) => ({ task, index, completed: isTaskCompletedOnDate(task, dateKey), sortOrder: task.sortOrder ?? index + 1 }))
    .sort((first, second) => {
      if (first.completed !== second.completed) {
        return first.completed ? 1 : -1;
      }

      return first.sortOrder - second.sortOrder || first.index - second.index;
    })
    .map((item) => item.task);
}

function sortGoalsForToday(goals: ProgressGoal[], dateKey: string): ProgressGoal[] {
  return goals
    .map((goal, index) => {
      const required = getRequiredToday(goal, dateKey);
      const logged = getTodayLoggedAmount(goal, dateKey);
      const completed = goal.currentValue >= goal.targetValue || logged >= required;
      const overRatio = required <= 0 ? (completed ? Number.POSITIVE_INFINITY : 0) : logged / required;

      return {
        goal,
        index,
        sortOrder: goal.sortOrder ?? index + 1,
        completed,
        overRatio,
      };
    })
    .sort((first, second) => {
      if (first.completed !== second.completed) {
        return first.completed ? 1 : -1;
      }

      if (first.completed && second.completed && first.overRatio !== second.overRatio) {
        return first.overRatio - second.overRatio;
      }

      return first.sortOrder - second.sortOrder || first.index - second.index;
    })
    .map((item) => item.goal);
}

function normalizeActionGroupName(value?: string): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function groupTodayActions(tasks: TaskItem[], goals: ProgressGoal[], dateKey: string): TodayActionGroup[] {
  const items: TodayActionItem[] = [
    ...tasks.map((task, index) => ({
      type: "task" as const,
      task,
      id: task.id,
      groupName: normalizeActionGroupName(task.groupName) || undefined,
      sortOrder: task.sortOrder ?? index + 1,
      completed: isTaskCompletedOnDate(task, dateKey),
      index,
    })),
    ...goals.map((goal, index) => {
      const required = getRequiredToday(goal, dateKey);
      const logged = getTodayLoggedAmount(goal, dateKey);

      return {
        type: "goal" as const,
        goal,
        id: goal.id,
        groupName: normalizeActionGroupName(goal.groupName) || undefined,
        sortOrder: goal.sortOrder ?? index + 1,
        completed: goal.currentValue >= goal.targetValue || logged >= required,
        index,
      };
    }),
  ].sort((first, second) => {
    if (first.completed !== second.completed) {
      return first.completed ? 1 : -1;
    }

    return first.sortOrder - second.sortOrder || (first.type === "task" ? 0 : 1) - (second.type === "task" ? 0 : 1) || first.index - second.index;
  });

  const grouped = new Map<string, TodayActionGroup>();

  items.forEach((item) => {
    const title = normalizeActionGroupName(item.groupName);
    const key = title.toLocaleLowerCase();
    const existing = grouped.get(key);

    if (existing) {
      existing.items.push(item);
      existing.order = Math.min(existing.order, item.sortOrder);
      return;
    }

    grouped.set(key, {
      key,
      title: title || undefined,
      items: [item],
      order: item.sortOrder,
    });
  });

  return Array.from(grouped.values()).sort((first, second) => {
    if (!first.title && second.title) {
      return -1;
    }

    if (first.title && !second.title) {
      return 1;
    }

    return first.order - second.order || (first.title ?? "").localeCompare(second.title ?? "");
  });
}

export default function App() {
  const [today, setToday] = useState(() => todayKey());
  const [appState, setAppState] = useState<AppState>(() => loadAppState());
  const [dayRecords, setDayRecords] = useState(() => loadDailyRecords());
    const [progressSheet, setProgressSheet] = useState<ProgressSheetState>(null);
    const [actionSheet, setActionSheet] = useState<ActionSheetState>(null);
    const [confirmState, setConfirmState] = useState<ConfirmState>(null);
    const [deleteState, setDeleteState] = useState<DeleteState>(null);
    const [editState, setEditState] = useState<EditState>(null);
    const [timerNow, setTimerNow] = useState(() => Date.now());
    const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});
    const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [carryOverOpen, setCarryOverOpen] = useState(false);
  const [viewAllSheet, setViewAllSheet] = useState<ViewAllState>(null);
  const [activeScreen, setActiveScreen] = useState<AppScreen>("today");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(() => getTelegramUser());
  const [telegramStatus, setTelegramStatus] = useState<TelegramConnectionStatus>(() => getTelegramConnectionStatus());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    hasRemotePersistence() ? "loading" : import.meta.env.PROD ? "missing-env" : "local",
  );
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const activeProfileCopy = profileCopy[settings.language];
  const activeUiCopy = uiCopy[settings.language];
  const activeDate = getActiveDate(selectedDate, today);
  const activeDateDate = useMemo(() => parseDateKey(activeDate), [activeDate]);
  const activeDateState = useMemo(() => getEffectiveStateForDate(appState, activeDate), [activeDate, appState]);
  const actualTodayState = useMemo(() => getEffectiveStateForDate(appState, today), [appState, today]);
  const activeDateLabel = useMemo(() => formatTodayDate(activeDateDate, settings.language), [activeDateDate, settings.language]);
  const isSelectedDateMode = selectedDate !== null;
  const selectedDateNote =
    selectedDate && activeDate > today
      ? activeUiCopy.plannedDay
      : selectedDate && activeDate < today
        ? activeUiCopy.pastDay
        : undefined;
  const daily = useMemo(
    () => calculateDailyProgress(activeDateState.goals, activeDateState.tasks, activeDate),
    [activeDate, activeDateState.goals, activeDateState.tasks],
  );
  const actualTodayDaily = useMemo(
    () => (activeDate === today ? daily : calculateDailyProgress(actualTodayState.goals, actualTodayState.tasks, today)),
    [activeDate, actualTodayState.goals, actualTodayState.tasks, daily, today],
  );
  const todayGoals = useMemo(
    () => activeDateState.goals,
    [activeDateState.goals],
  );
  const todayTasks = useMemo(
    () => activeDateState.tasks,
    [activeDateState.tasks],
  );
  const sortedTodayGoals = useMemo(() => sortGoalsForToday(todayGoals, activeDate), [activeDate, todayGoals]);
  const visibleTodayTasks = useMemo(() => sortTasksForToday(dedupeTodayTasks(todayTasks, activeDate), activeDate), [activeDate, todayTasks]);
  const groupedTodayActions = useMemo(
    () => groupTodayActions(visibleTodayTasks, sortedTodayGoals, activeDate),
    [activeDate, sortedTodayGoals, visibleTodayTasks],
  );
  const hasActiveDateItems = sortedTodayGoals.length > 0 || visibleTodayTasks.length > 0;
  const viewAllGoals = useMemo(
    () => activeDateState.goals.filter((goal) => isGoalDueOnDate(goal, activeDateDate, activeDate) || goal.currentValue >= goal.targetValue),
    [activeDate, activeDateDate, activeDateState.goals],
  );
  const carryOverCandidates = useMemo(
    () => (activeDate === today ? getCarryOverCandidates(appState, today, settings.language) : []),
    [activeDate, appState, settings.language, today],
  );
  const rhythmTrend = useMemo(
    () => getLastNDaysCompletionTrend(7, dayRecords, daily.percent, activeDate),
    [activeDate, daily.percent, dayRecords],
  );
  useEffect(() => {
    setAppState((state) => mergeDuplicateActions(state));
  }, []);

  useEffect(() => {
    initTelegramWebApp();
    setTelegramUser(getTelegramUser());
    setTelegramStatus(getTelegramConnectionStatus());
  }, []);

  useEffect(() => {
    if (!hasRemotePersistence()) {
      setSyncStatus(import.meta.env.PROD ? "missing-env" : "local");
      return;
    }

    let cancelled = false;

    setSyncStatus("loading");
    loadRemoteData(settings)
      .then((remote) => {
        if (cancelled) {
          return;
        }

        setRemoteUserId(remote.user.id);
        setAppState(remote.appState);
        setSettings(remote.settings);
        setDayRecords(remote.dayRecords);
        setRemoteReady(true);
        setSyncStatus("ready");
      })
      .catch((error) => {
        console.error("Failed to load Supabase data", error);
        if (!cancelled) {
          setRemoteReady(false);
          setSyncStatus("query-error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

    useEffect(() => {
      saveAppState(appState);
    }, [appState]);

  useEffect(() => {
    if (!remoteReady || !remoteUserId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSyncStatus("saving");
      saveRemoteSnapshot(remoteUserId, appState, settings)
        .then(() => setSyncStatus("ready"))
        .catch((error) => {
          console.error("Failed to save Supabase data", error);
          setSyncStatus("query-error");
        });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [appState, remoteReady, remoteUserId, settings]);

  useEffect(() => {
    setDayRecords((records) => {
      if (daily.totalTodayItems === 0 && daily.percent === 0) {
        return records.filter((record) => record.date !== activeDate);
      }

      return upsertDailyRecord(records, activeDate, daily.percent);
    });
  }, [activeDate, daily.percent, daily.totalTodayItems]);

  useEffect(() => {
    saveDailyRecords(dayRecords);
  }, [dayRecords]);

  useEffect(() => {
    saveSettings(settings);
    document.documentElement.dataset.themePreference = settings.theme;
    document.documentElement.lang = settings.language === "ru" ? "ru" : "en";

    const media = window.matchMedia("(prefers-color-scheme: light)");
    const applyResolvedTheme = () => {
      document.documentElement.dataset.resolvedTheme =
        settings.theme === "system" ? (media.matches ? "light" : "dark") : settings.theme;
    };

    applyResolvedTheme();

    if (settings.theme === "system") {
      media.addEventListener("change", applyResolvedTheme);

      return () => media.removeEventListener("change", applyResolvedTheme);
    }
  }, [settings]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setTimerNow(Date.now()), 60000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setToday((currentToday) => {
        const nextToday = todayKey();

        return nextToday === currentToday ? currentToday : nextToday;
      });
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) {
      window.chexarResetDemo = () => {
        resetChexarStorage();
        window.location.reload();
      };
    }
  }, []);

  function resetDemoData() {
    const emptyState = createEmptyState();
    const emptyRecords = createEmptyDailyRecords();

    resetChexarStorage();
    setAppState(emptyState);
    setDayRecords(emptyRecords);
    saveAppState(emptyState);
    saveDailyRecords(emptyRecords);
    setSettings((current) => ({
      ...current,
      onboardingCompleted: false,
    }));
    setResetConfirmOpen(false);
    setAddSheetOpen(false);
    setProgressSheet(null);
      setConfirmState(null);
      setDeleteState(null);
      setEditState(null);
      setActionSheet(null);
      setViewAllSheet(null);
      setCarryOverOpen(false);
      setExpandedTaskIds({});
    setSelectedDate(null);
    setActiveScreen("today");
  }

    function deleteActionForPeriod() {
      if (!deleteState) {
        return;
      }

    if (deleteState.type === "goal") {
      setAppState((state) => ({
        ...state,
        goals: state.goals.filter((goal) => goal.id !== deleteState.goal.id),
        occurrences: (state.occurrences ?? []).filter((occurrence) => occurrence.itemId !== deleteState.goal.id),
      }));
    } else {
      setAppState((state) => ({
        ...state,
        tasks: state.tasks.filter((task) => task.id !== deleteState.task.id),
        occurrences: (state.occurrences ?? []).filter((occurrence) => occurrence.itemId !== deleteState.task.id),
      }));
    }

      setDeleteState(null);
      setActionSheet(null);
    }

    function deleteActionForActiveDate() {
      if (!deleteState) {
        return;
      }

      const itemId = deleteState.type === "goal" ? deleteState.goal.id : deleteState.task.id;
      const itemType = deleteState.type;

      setAppState((state) => {
        const existingSkip = (state.occurrences ?? []).some(
          (occurrence) => occurrence.itemId === itemId && occurrence.itemType === itemType && occurrence.date === activeDate && occurrence.status === "skipped",
        );
        const occurrences = existingSkip
          ? state.occurrences ?? []
          : [...(state.occurrences ?? []), createDateSkipOccurrence(itemId, itemType, activeDate)];

        if (itemType === "goal") {
          return {
            ...state,
            goals: state.goals.map((goal) => {
              if (goal.id !== itemId) {
                return goal;
              }

              const removedAmount = goal.progressEntries
                .filter((entry) => entry.date === activeDate)
                .reduce((total, entry) => total + entry.amount, 0);
              const completedAtByDate = { ...(goal.completedAtByDate ?? {}) };
              const lateDates = new Set(goal.lateDates ?? []);

              delete completedAtByDate[activeDate];
              lateDates.delete(activeDate);

              return {
                ...goal,
                currentValue: Math.max(goal.currentValue - removedAmount, 0),
                progressEntries: goal.progressEntries.filter((entry) => entry.date !== activeDate),
                completedAtByDate: Object.keys(completedAtByDate).length > 0 ? completedAtByDate : undefined,
                lateDates: Array.from(lateDates).sort(),
              };
            }),
            occurrences,
          };
        }

        return {
          ...state,
          tasks: state.tasks.map((task) => {
            if (task.id !== itemId) {
              return task;
            }

            const completedDates = new Set(task.completedDates ?? []);
            const completedAtByDate = { ...(task.completedAtByDate ?? {}) };
            const lateDates = new Set(task.lateDates ?? []);
            const subitemStateByDate = { ...(task.subitemStateByDate ?? {}) };

            completedDates.delete(activeDate);
            delete completedAtByDate[activeDate];
            lateDates.delete(activeDate);
            delete subitemStateByDate[activeDate];

            return {
              ...task,
              completedDates: Array.from(completedDates).sort(),
              completedAtByDate: Object.keys(completedAtByDate).length > 0 ? completedAtByDate : undefined,
              lateDates: Array.from(lateDates).sort(),
              subitemStateByDate: Object.keys(subitemStateByDate).length > 0 ? subitemStateByDate : undefined,
              completed: task.date === activeDate ? false : task.completed,
            };
          }),
          occurrences,
        };
      });

      setDeleteState(null);
      setActionSheet(null);
    }

    function updateGoal(
      goalId: string,
      update: {
        title: string;
        groupName?: string;
        note?: string;
        emoji?: string;
        iconKey?: string;
        repeatMode: GoalRepeatMode;
        selectedDays?: number[];
        dueTime?: string;
        targetValue: number;
        currentValue: number;
        unit: string;
        quickAddValues: number[];
      },
    ) {
      setAppState((state) =>
        mergeDuplicateActions({
          ...state,
          goals: state.goals.map((goal) =>
            goal.id === goalId
              ? {
                  ...goal,
                  title: update.title.trim(),
                  groupName: update.groupName?.trim() || undefined,
                  note: update.note?.trim() || undefined,
                  emoji: update.emoji,
                  iconType: update.iconKey === "book" ? "book" : update.iconKey ? "custom" : "letter",
                  iconKey: update.iconKey,
                  targetValue: update.targetValue,
                  currentValue: update.currentValue,
                  unit: update.unit.trim(),
                  repeatMode: update.repeatMode,
                  selectedDays: update.repeatMode === "selectedDays" ? update.selectedDays : undefined,
                  dueTime: update.dueTime,
                  quickAddValues: update.quickAddValues,
                }
              : goal,
          ),
        }),
      );
    }

    function updateTask(taskId: string, update: { title: string; groupName?: string; note?: string; emoji?: string; iconKey?: string; repeatMode: TaskRepeatMode; selectedDays?: number[]; dueTime?: string }) {
      setAppState((state) =>
        mergeDuplicateActions({
          ...state,
          tasks: state.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  title: update.title.trim(),
                  groupName: update.groupName?.trim() || undefined,
                  note: update.note?.trim() || undefined,
                  emoji: update.emoji,
                  iconType: update.iconKey ? "custom" : "letter",
                  iconKey: update.iconKey,
                  repeatMode: update.repeatMode,
                  selectedDays: update.repeatMode === "selectedDays" ? update.selectedDays : undefined,
                  dueTime: update.dueTime,
                }
              : task,
          ),
        }),
      );
    }

  function addProgress(goalId: string, amount: number, note?: string) {
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    setAppState((state) => {
      let completedCarryOver = false;
      const goals = state.goals.map((goal) => {
        if (goal.id !== goalId) {
          return goal;
        }

        const required = getRequiredToday(goal, activeDate);
        const previousLogged = getTodayLoggedAmount(goal, activeDate);
        const nextLogged = previousLogged + amount;
        const completedNow = required > 0 && previousLogged < required && nextLogged >= required;
        const completedAt = completedNow ? new Date().toISOString() : goal.completedAtByDate?.[activeDate];
        const lateDates = new Set(goal.lateDates ?? []);

        if (completedNow && completedAt && isLateForDueTime(activeDate, goal.dueTime, completedAt)) {
          lateDates.add(activeDate);
        }

        completedCarryOver = required > 0 && nextLogged >= required;

        return {
          ...goal,
          currentValue: goal.currentValue + amount,
          progressEntries: [
            ...goal.progressEntries,
            {
              id: createId("entry"),
              date: activeDate,
              amount,
              note: note?.trim() || undefined,
            },
          ],
          completedAtByDate: completedAt
            ? {
                ...(goal.completedAtByDate ?? {}),
                [activeDate]: completedAt,
              }
            : goal.completedAtByDate,
          lateDates: Array.from(lateDates).sort(),
        };
      });

      return {
        ...state,
        goals,
        occurrences: (state.occurrences ?? []).map((occurrence) =>
          occurrence.itemId === goalId && occurrence.date === activeDate && completedCarryOver
            ? { ...occurrence, status: "completed" }
            : occurrence,
        ),
      };
    });
  }

  function setProgressForDate(goalId: string, nextAmount: number, note?: string) {
    if (!Number.isFinite(nextAmount) || nextAmount < 0) {
      return;
    }

    setAppState((state) => {
      let completedCarryOver = false;
      const goals = state.goals.map((goal) => {
        if (goal.id !== goalId) {
          return goal;
        }

        const normalizedAmount = Math.max(nextAmount, 0);
        const previousLogged = getTodayLoggedAmount(goal, activeDate);
        const delta = normalizedAmount - previousLogged;
        const required = getRequiredToday(goal, activeDate);
        const nextCurrentValue = Math.max(goal.currentValue + delta, 0);
        const completedForDay = required > 0 ? normalizedAmount >= required : normalizedAmount > 0 || nextCurrentValue >= goal.targetValue;
        const completedAtByDate = { ...(goal.completedAtByDate ?? {}) };
        const lateDates = new Set(goal.lateDates ?? []);
        const completedAt = completedForDay ? (completedAtByDate[activeDate] ?? new Date().toISOString()) : undefined;

        if (completedAt) {
          completedAtByDate[activeDate] = completedAt;

          if (isLateForDueTime(activeDate, goal.dueTime, completedAt)) {
            lateDates.add(activeDate);
          } else {
            lateDates.delete(activeDate);
          }
        } else {
          delete completedAtByDate[activeDate];
          lateDates.delete(activeDate);
        }

        completedCarryOver = completedForDay;

        return {
          ...goal,
          currentValue: nextCurrentValue,
          progressEntries: [
            ...goal.progressEntries.filter((entry) => entry.date !== activeDate),
            ...(normalizedAmount > 0
              ? [
                  {
                    id: createId("entry"),
                    date: activeDate,
                    amount: normalizedAmount,
                    note: note?.trim() || undefined,
                  },
                ]
              : []),
          ].sort((first, second) => first.date.localeCompare(second.date)),
          completedAtByDate: Object.keys(completedAtByDate).length > 0 ? completedAtByDate : undefined,
          lateDates: Array.from(lateDates).sort(),
        };
      });

      return {
        ...state,
        goals,
        occurrences: (state.occurrences ?? []).map((occurrence) =>
          occurrence.itemId === goalId && occurrence.date === activeDate
            ? { ...occurrence, status: completedCarryOver ? "completed" : "active" }
            : occurrence,
        ),
      };
    });
  }

  function setTaskCompleted(taskId: string, completed: boolean) {
    setAppState((state) => ({
      ...state,
      tasks: state.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const completedDates = new Set(task.completedDates ?? []);

        if (completed) {
          completedDates.add(activeDate);
        } else {
          completedDates.delete(activeDate);
        }

        const completedAtByDate = { ...(task.completedAtByDate ?? {}) };
        const lateDates = new Set(task.lateDates ?? []);
        const completedAt = completed ? new Date().toISOString() : undefined;

        if (completedAt) {
          completedAtByDate[activeDate] = completedAt;

          if (isLateForDueTime(activeDate, task.dueTime, completedAt)) {
            lateDates.add(activeDate);
          } else {
            lateDates.delete(activeDate);
          }
        } else {
          delete completedAtByDate[activeDate];
          lateDates.delete(activeDate);
        }

        return {
          ...task,
          completed: completedDates.has(today),
          completedDates: Array.from(completedDates).sort(),
          completedAtByDate: Object.keys(completedAtByDate).length > 0 ? completedAtByDate : undefined,
          lateDates: Array.from(lateDates).sort(),
        };
      }),
      occurrences: (state.occurrences ?? []).map((occurrence) =>
        occurrence.itemId === taskId && occurrence.date === activeDate
          ? { ...occurrence, status: completed ? "completed" : "active" }
          : occurrence,
      ),
    }));
  }

  function updateTaskSubitem(taskId: string, subitemId: string, nextState: ActionSubitemState) {
    setAppState((state) => {
      let occurrenceCompleted = false;
      const tasks = state.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const subitems = task.subitems ?? [];
        const dayState = {
          ...(task.subitemStateByDate?.[activeDate] ?? {}),
          [subitemId]: nextState,
        };
        const subitemStateByDate = {
          ...(task.subitemStateByDate ?? {}),
          [activeDate]: dayState,
        };
        const allComplete =
          subitems.length > 0 &&
          subitems.every((subitem) => {
            const state = dayState[subitem.id];

            if (subitem.targetCount && subitem.targetCount > 1) {
              return Number(state?.count ?? 0) >= subitem.targetCount;
            }

            return state?.completed === true;
          });
        const completedDates = new Set(task.completedDates ?? []);

        if (allComplete) {
          completedDates.add(activeDate);
        } else {
          completedDates.delete(activeDate);
        }
        occurrenceCompleted = allComplete;

        const completedAtByDate = { ...(task.completedAtByDate ?? {}) };
        const lateDates = new Set(task.lateDates ?? []);
        const completedAt = allComplete ? (completedAtByDate[activeDate] ?? new Date().toISOString()) : undefined;

        if (completedAt) {
          completedAtByDate[activeDate] = completedAt;

          if (isLateForDueTime(activeDate, task.dueTime, completedAt)) {
            lateDates.add(activeDate);
          } else {
            lateDates.delete(activeDate);
          }
        } else {
          delete completedAtByDate[activeDate];
          lateDates.delete(activeDate);
        }

        return {
          ...task,
          subitemStateByDate,
          completedDates: Array.from(completedDates).sort(),
          completedAtByDate: Object.keys(completedAtByDate).length > 0 ? completedAtByDate : undefined,
          lateDates: Array.from(lateDates).sort(),
          completed: completedDates.has(today),
        };
      });

      return {
        ...state,
        tasks,
        occurrences: (state.occurrences ?? []).map((occurrence) =>
          occurrence.itemId === taskId && occurrence.date === activeDate
            ? { ...occurrence, status: occurrenceCompleted ? "completed" : "active" }
            : occurrence,
        ),
      };
    });
  }

  function advanceTaskSubitem(taskId: string, subitemId: string) {
    const task = appState.tasks.find((item) => item.id === taskId);
    const subitem = task?.subitems?.find((item) => item.id === subitemId);

    if (!task || !subitem) {
      return;
    }

    const currentState = task.subitemStateByDate?.[activeDate]?.[subitemId] ?? {};

    if (subitem.targetCount && subitem.targetCount > 1) {
      const nextCount = Math.min(Number(currentState.count ?? 0) + 1, subitem.targetCount);
      updateTaskSubitem(taskId, subitemId, {
        count: nextCount,
        completed: nextCount >= subitem.targetCount,
      });
      return;
    }

    updateTaskSubitem(taskId, subitemId, { completed: true });
  }

  function reorderTasks(sourceId: string, targetId: string, placement: ReorderPlacement = "before") {
    if (sourceId === targetId) {
      return;
    }

    setAppState((state) => ({
      ...state,
      tasks: reorderById(state.tasks, sourceId, targetId, placement).map((task, index) => ({
        ...task,
        sortOrder: index + 1,
      })),
    }));
  }

  function reorderGoals(sourceId: string, targetId: string, placement: ReorderPlacement = "before") {
    if (sourceId === targetId) {
      return;
    }

    setAppState((state) => ({
      ...state,
      goals: reorderById(state.goals, sourceId, targetId, placement).map((goal, index) => ({
        ...goal,
        sortOrder: index + 1,
      })),
    }));
  }

  function reorderTodayActions(sourceId: string, targetId: string, placement: ReorderPlacement = "before") {
    if (sourceId === targetId) {
      return;
    }

    setAppState((state) => {
      const actionRefs = [
        ...state.tasks.map((task, index) => ({
          id: `task:${task.id}`,
          itemId: task.id,
          type: "task" as const,
          sortOrder: task.sortOrder ?? index + 1,
        })),
        ...state.goals.map((goal, index) => ({
          id: `goal:${goal.id}`,
          itemId: goal.id,
          type: "goal" as const,
          sortOrder: goal.sortOrder ?? index + 1,
        })),
      ].sort((first, second) => first.sortOrder - second.sortOrder);
      const orderMap = new Map(reorderById(actionRefs, sourceId, targetId, placement).map((item, index) => [item.id, index + 1]));

      return {
        ...state,
        tasks: state.tasks.map((task) => ({
          ...task,
          sortOrder: orderMap.get(`task:${task.id}`) ?? task.sortOrder,
        })),
        goals: state.goals.map((goal) => ({
          ...goal,
          sortOrder: orderMap.get(`goal:${goal.id}`) ?? goal.sortOrder,
        })),
      };
    });
  }

  function reorderTaskSubitems(taskId: string, sourceId: string, targetId: string, placement: ReorderPlacement = "before") {
    if (sourceId === targetId) {
      return;
    }

    setAppState((state) => ({
      ...state,
      tasks: state.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              subitems: reorderById(task.subitems ?? [], sourceId, targetId, placement).map((subitem, index) => ({
                ...subitem,
                sortOrder: index + 1,
              })),
            }
          : task,
      ),
    }));
  }

  function createGoal(goal: {
    title: string;
    groupName?: string;
    emoji?: string;
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
  }) {
    const title = goal.title.trim();
    const unit = goal.unit.trim();
    const initialEntry: ProgressEntry[] =
      goal.currentValue > 0
        ? [
            {
              id: createId("entry"),
              date: goal.startDate,
              amount: goal.currentValue,
            },
          ]
        : [];

    setAppState((state) => ({
      ...state,
      goals: [
        ...state.goals,
        {
          id: createId("goal"),
          title,
          groupName: goal.groupName?.trim() || undefined,
          emoji: goal.emoji,
          iconType: goal.iconKey === "book" ? "book" : goal.iconKey ? "custom" : "letter",
          iconKey: goal.iconKey,
          targetValue: goal.targetValue,
          currentValue: goal.currentValue,
          unit,
          startDate: goal.startDate,
          endDate: goal.endDate,
          repeatMode: goal.repeatMode,
          selectedDays: goal.repeatMode === "selectedDays" ? goal.selectedDays : undefined,
          dueTime: goal.dueTime,
          quickAddValues: goal.quickAddValues,
          progressEntries: initialEntry,
          sortOrder: state.goals.length + 1,
        },
      ],
    }));
  }

  function createTask(task: {
    title: string;
    groupName?: string;
    emoji?: string;
    iconKey?: string;
    priority?: Priority;
    startDate: string;
    endDate: string;
    repeatMode: TaskRepeatMode;
    selectedDays?: number[];
    subitems?: ActionSubitem[];
    dueTime?: string;
  }) {
    setAppState((state) => ({
      ...state,
      tasks: [
        ...state.tasks,
        {
          id: createId("task"),
          title: task.title.trim(),
          groupName: task.groupName?.trim() || undefined,
          emoji: task.emoji,
          iconType: task.iconKey ? "custom" : "letter",
          iconKey: task.iconKey,
          priority: task.priority,
          startDate: task.startDate,
          endDate: task.endDate,
          repeatMode: task.repeatMode,
          selectedDays: task.repeatMode === "selectedDays" ? task.selectedDays : undefined,
          dueTime: task.dueTime,
          date: task.startDate,
          completed: false,
          completedDates: [],
          subitems:
            task.subitems && task.subitems.length > 0
              ? task.subitems.map((subitem, index) => ({ ...subitem, sortOrder: subitem.sortOrder ?? index + 1 }))
              : undefined,
          subitemStateByDate: undefined,
          sortOrder: state.tasks.length + 1,
        },
      ],
    }));
  }

  function moveCarryOverToToday(candidates: CarryOverCandidate[]) {
    if (candidates.length === 0) {
      return;
    }

    setAppState((state) => {
      const existingKeys = new Set((state.occurrences ?? []).map((occurrence) => `${occurrence.itemId}|${occurrence.date}|${occurrence.source}`));
      const nextOccurrences = candidates
        .map((candidate) => createCarryOverOccurrence(candidate, today))
        .filter((occurrence) => !existingKeys.has(`${occurrence.itemId}|${occurrence.date}|${occurrence.source}`));

      return {
        ...state,
        occurrences: [...(state.occurrences ?? []), ...nextOccurrences],
      };
    });
  }

  function selectScreen(screen: AppScreen) {
    setSelectedDate(null);
    setActiveScreen(screen);
  }

  function openSelectedDate(dateKey: string) {
    setSelectedDate(dateKey);
    setActiveScreen("today");
    setViewAllSheet(null);
  }

  function returnToCalendar() {
    setSelectedDate(null);
    setActiveScreen("calendar");
  }

  function shiftActiveDateBySwipe(dayDelta: number) {
    const nextDate = addDays(activeDate, dayDelta);
    setSelectedDate(nextDate === today ? null : nextDate);
    setActiveScreen("today");
    setViewAllSheet(null);
  }

  return (
    <div className="app-shell">
      <div className="background-glow" />
      <SyncBanner status={syncStatus} copy={activeUiCopy} />
      {!settings.onboardingCompleted ? (
        <OnboardingScreen
          settings={settings}
          onSettingsChange={(nextSettings) => setSettings((current) => ({ ...current, ...nextSettings }))}
          onComplete={() => {
            setSettings((current) => ({
              ...current,
              onboardingCompleted: true,
            }));
            setActiveScreen("today");
          }}
        />
      ) : (
        <>
          {activeScreen === "profile" ? (
            <ProfileScreen
              settings={settings}
              telegramUser={telegramUser}
              telegramStatus={telegramStatus}
              onSettingsChange={(nextSettings) => setSettings((current) => ({ ...current, ...nextSettings }))}
              onResetRequest={() => setResetConfirmOpen(true)}
            />
          ) : activeScreen === "calendar" ? (
            <CalendarScreen
              appState={appState}
              dayRecords={dayRecords}
              today={today}
              todayPercent={actualTodayDaily.percent}
              language={settings.language}
              onSelectDate={openSelectedDate}
            />
          ) : activeScreen === "progress" ? (
            <ProgressScreen
              appState={appState}
              dayRecords={dayRecords}
              today={today}
              todayPercent={actualTodayDaily.percent}
              language={settings.language}
            />
          ) : (
            <main className="today-screen">
              <Header
                copy={activeUiCopy}
                dateLabel={activeDateLabel}
                dateNote={selectedDateNote}
                selectedMode={isSelectedDateMode}
                onBackToCalendar={returnToCalendar}
                onAdd={() => setAddSheetOpen(true)}
                onDateSwipe={shiftActiveDateBySwipe}
              />
              <RhythmCard
                daily={daily}
                trend={rhythmTrend}
                copy={activeUiCopy}
              />
              {carryOverCandidates.length > 0 && (
                <CarryOverBanner
                  count={carryOverCandidates.length}
                  language={settings.language}
                  onReview={() => setCarryOverOpen(true)}
                />
              )}
              <section className="section-block unified-actions-section">
                <div className="action-list">
                  {groupedTodayActions.map((group) => (
                    <div key={group.key || "ungrouped"} className={`action-group ${group.title ? "has-title" : "is-ungrouped"}`}>
                      {group.title && <div className="action-group-title">{group.title}</div>}
                      {group.items.map((item) => {
                        if (item.type === "task") {
                          const task = item.task;
                          const completedToday = isTaskCompletedOnDate(task, activeDate);
                          const taskHasSubitems = hasTaskSubitems(task);

                          return (
                            <ReorderableItem key={`task-${task.id}`} id={`task:${task.id}`} scope="today-actions" onMove={reorderTodayActions}>
                              <TaskRow
                                task={task}
                                completed={completedToday}
                                dateKey={activeDate}
                                isToday={activeDate === today}
                                expanded={taskHasSubitems && expandedTaskIds[task.id] === true}
                                nowMs={timerNow}
                                copy={activeUiCopy}
                                editLabel={activeUiCopy.editAction}
                                toggleLabel={completedToday ? activeUiCopy.undoDoneTitle : activeUiCopy.markDoneTitle}
                                onClick={() => undefined}
                                onToggle={() => {
                                  setConfirmState({
                                    task,
                                    nextCompleted: !completedToday,
                                  });
                                }}
                                onSubitemAdvance={(subitemId) => advanceTaskSubitem(task.id, subitemId)}
                                onSubitemMove={(sourceId, targetId) => reorderTaskSubitems(task.id, sourceId, targetId)}
                                onEdit={() => setEditState({ type: "task", task })}
                              />
                            </ReorderableItem>
                          );
                        }

                        const goal = item.goal;

                        return (
                          <ReorderableItem key={`goal-${goal.id}`} id={`goal:${goal.id}`} scope="today-actions" onMove={reorderTodayActions}>
                            <GoalCard
                              goal={goal}
                              today={activeDate}
                              copy={activeUiCopy}
                              nowMs={timerNow}
                              onOpenManual={() => setProgressSheet({ goal })}
                              onQuickAdd={(amount) => addProgress(goal.id, amount)}
                              onEdit={() => setEditState({ type: "goal", goal })}
                            />
                          </ReorderableItem>
                        );
                      })}
                    </div>
                  ))}
                  {!hasActiveDateItems && (
                    <EmptySectionCard
                      title={activeUiCopy.emptySelectedDayTitle}
                      text={activeUiCopy.emptySelectedDayText}
                      buttonLabel={activeUiCopy.add}
                      onAdd={() => setAddSheetOpen(true)}
                    />
                  )}
                </div>
              </section>
            </main>
          )}

          <BottomNav activeScreen={activeScreen} language={settings.language} onSelect={selectScreen} />

          {resetConfirmOpen && (
            <ConfirmDialog
              title={activeProfileCopy.resetTitle}
              description={activeProfileCopy.resetText}
              confirmLabel={activeProfileCopy.resetConfirm}
              cancelLabel={activeProfileCopy.cancel}
              danger
              onCancel={() => setResetConfirmOpen(false)}
              onConfirm={resetDemoData}
            />
          )}

          {progressSheet && (
            <ProgressSheet
              goal={progressSheet.goal}
              today={activeDate}
              copy={activeUiCopy}
              onClose={() => setProgressSheet(null)}
              onSave={(amount, note) => {
                setProgressForDate(progressSheet.goal.id, amount, note);
                setProgressSheet(null);
              }}
            />
          )}

          {confirmState && (
            <ConfirmDialog
              title={confirmState.nextCompleted ? activeUiCopy.markDoneTitle : activeUiCopy.undoDoneTitle}
              description={confirmState.task.note}
              confirmLabel={confirmState.nextCompleted ? activeUiCopy.yesDone : activeUiCopy.yes}
              cancelLabel={activeUiCopy.cancel}
              onCancel={() => setConfirmState(null)}
              onConfirm={() => {
                setTaskCompleted(confirmState.task.id, confirmState.nextCompleted);
                setConfirmState(null);
              }}
            />
          )}

          {actionSheet && actionSheet.type === "task" && (
            <TaskActionSheet
              task={actionSheet.task}
              completed={isTaskCompletedOnDate(actionSheet.task, activeDate)}
              copy={activeUiCopy}
              onClose={() => setActionSheet(null)}
              onToggle={() => {
                setConfirmState({
                  task: actionSheet.task,
                  nextCompleted: !isTaskCompletedOnDate(actionSheet.task, activeDate),
                });
                setActionSheet(null);
              }}
              onEdit={() => {
                setEditState({ type: "task", task: actionSheet.task });
                setActionSheet(null);
              }}
            />
          )}

            {deleteState && (
              <DeleteActionSheet
                state={deleteState}
                dateLabel={activeDateLabel}
                language={settings.language}
                copy={activeUiCopy}
                onClose={() => setDeleteState(null)}
                onDeleteToday={deleteActionForActiveDate}
                onDeletePeriod={deleteActionForPeriod}
              />
            )}

            {editState && (
              <EditActionSheet
                state={editState}
                copy={activeUiCopy}
                language={settings.language}
                onClose={() => setEditState(null)}
                onDelete={() => {
                  setDeleteState(editState);
                  setEditState(null);
                }}
                onSave={(update) => {
                  if (editState.type === "goal") {
                    updateGoal(editState.goal.id, {
                      title: update.title,
                      groupName: update.groupName,
                      note: update.note,
                      emoji: update.emoji,
                      iconKey: update.iconKey,
                      repeatMode: update.repeatMode as GoalRepeatMode,
                      selectedDays: update.selectedDays,
                      dueTime: update.dueTime,
                      targetValue: update.targetValue ?? editState.goal.targetValue,
                      currentValue: update.currentValue ?? editState.goal.currentValue,
                      unit: update.unit ?? editState.goal.unit,
                      quickAddValues: update.quickAddValues ?? editState.goal.quickAddValues,
                    });
                  } else {
                    updateTask(editState.task.id, {
                      title: update.title,
                      groupName: update.groupName,
                      note: update.note,
                      emoji: update.emoji,
                      iconKey: update.iconKey,
                      repeatMode: update.repeatMode,
                      selectedDays: update.selectedDays,
                      dueTime: update.dueTime,
                    });
                  }

                  setEditState(null);
                }}
              />
            )}

            {addSheetOpen && (
            <AddSheet
              today={activeDate}
              language={settings.language}
              copy={activeUiCopy}
              existingGoals={appState.goals}
              existingTasks={appState.tasks}
              onClose={() => setAddSheetOpen(false)}
              onCreateGoal={(goal) => {
                createGoal(goal);
                setAddSheetOpen(false);
              }}
              onCreateTask={(task) => {
                createTask(task);
                setAddSheetOpen(false);
              }}
            />
          )}

          {carryOverOpen && (
            <CarryOverReviewSheet
              candidates={carryOverCandidates}
              language={settings.language}
              onClose={() => setCarryOverOpen(false)}
              onMove={(selected) => {
                moveCarryOverToToday(selected);
                setCarryOverOpen(false);
              }}
            />
          )}

          {viewAllSheet && (
            <ViewAllSheet
              type={viewAllSheet}
              today={activeDate}
              goals={viewAllGoals}
              tasks={visibleTodayTasks}
              copy={activeUiCopy}
              nowMs={timerNow}
              onClose={() => setViewAllSheet(null)}
              onOpenManual={(goal) => {
                setViewAllSheet(null);
                setProgressSheet({ goal });
              }}
              onQuickAddGoal={(goal, amount) => addProgress(goal.id, amount)}
              onToggleTask={(task) => {
                const completedToday = isTaskCompletedOnDate(task, activeDate);

                setViewAllSheet(null);
                setConfirmState({
                  task,
                  nextCompleted: !completedToday,
                });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function OnboardingScreen({
  settings,
  onSettingsChange,
  onComplete,
}: {
  settings: AppSettings;
  onSettingsChange: (settings: Partial<AppSettings>) => void;
  onComplete: () => void;
}) {
  const copy = onboardingCopy[settings.language];
  const learningIcons: Array<LucideIcon | null> = [CirclePlus, null, BarChart3];

  return (
    <main className="onboarding-screen">
      <header className="onboarding-header">
        <p className="brand">{copy.appLabel}</p>
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
      </header>

      <section className="onboarding-card" aria-labelledby="onboarding-settings-title">
        <h2 id="onboarding-settings-title" className="sr-only">
          {copy.title}
        </h2>

        <div className="onboarding-setting-row">
          <span className="onboarding-setting-label">
            <Languages size={23} aria-hidden="true" />
            {copy.language}
          </span>
          <div className="onboarding-segmented" role="group" aria-label={copy.language}>
            <button
              type="button"
              className={settings.language === "ru" ? "active" : ""}
              aria-pressed={settings.language === "ru"}
              onClick={() => onSettingsChange({ language: "ru" })}
            >
              {copy.russian}
            </button>
            <button
              type="button"
              className={settings.language === "en" ? "active" : ""}
              aria-pressed={settings.language === "en"}
              onClick={() => onSettingsChange({ language: "en" })}
            >
              {copy.english}
            </button>
          </div>
        </div>

        <div className="onboarding-setting-row">
          <span className="onboarding-setting-label">
            <Monitor size={23} aria-hidden="true" />
            {copy.theme}
          </span>
          <ThemeIconSelector
            value={settings.theme}
            labels={{
              light: copy.lightTheme,
              dark: copy.darkTheme,
              system: copy.systemTheme,
            }}
            includeSystem
            onChange={(theme) => onSettingsChange({ theme })}
          />
        </div>

        <button
          type="button"
          className={`onboarding-toggle ${settings.hintsEnabled ? "enabled" : ""}`}
          aria-pressed={settings.hintsEnabled}
          onClick={() => onSettingsChange({ hintsEnabled: !settings.hintsEnabled })}
        >
          <span className="onboarding-toggle-copy">
            <strong>{copy.hints}</strong>
            <small>{copy.hintsText}</small>
          </span>
          <span className="toggle-switch" aria-hidden="true">
            <span>
              <Check size={15} />
            </span>
          </span>
        </button>

        <div className="onboarding-learn-card">
          <h2>{copy.howItWorks}</h2>
            <div className="onboarding-learn-list">
              {copy.learningPoints.map((point, index) => {
                const Icon = learningIcons[index];

                return (
                  <div className="onboarding-learn-row" key={point}>
                    <span className="onboarding-learn-icon" aria-hidden="true">
                      {Icon === null ? <ChexarCheckboxMark /> : <Icon size={21} />}
                    </span>
                    <p>{point}</p>
                  </div>
                );
            })}
          </div>
        </div>

        <button type="button" className="onboarding-continue" onClick={onComplete}>
          {copy.continue}
        </button>
      </section>
    </main>
  );
}

function ChexarCheckboxMark() {
  return (
    <span className="onboarding-chexar-checkbox">
      <span className="task-x-mark">
        <span />
        <span />
      </span>
    </span>
  );
}

function BrandLogo({ size = "compact", ariaLabel = "Chexar" }: { size?: "compact" | "hero"; ariaLabel?: string }) {
  return (
    <div className={`brand brand-logo brand-logo-${size}`} aria-label={ariaLabel}>
      <span className="brand-logo-text">Che</span>
      <span className="brand-logo-box" aria-hidden="true">
        <span className="task-x-mark brand-logo-x">
          <span />
          <span />
        </span>
      </span>
      <span className="brand-logo-text">ar</span>
    </div>
  );
}

function SyncBanner({ status, copy }: { status: SyncStatus; copy: UiCopy }) {
  if (status === "ready") {
    return null;
  }

  const text =
    status === "loading"
      ? copy.syncLoading
      : status === "saving"
        ? copy.syncSaving
        : status === "missing-env"
          ? copy.syncMissingEnv
          : status === "query-error"
            ? copy.syncQueryError
            : copy.syncLocal;

  return <div className={`sync-banner ${status}`}>{text}</div>;
}

function Header({
  copy,
  dateLabel,
  dateNote,
  selectedMode = false,
  onBackToCalendar,
  onAdd,
  onDateSwipe,
}: {
  copy: UiCopy;
  dateLabel: string;
  dateNote?: string;
  selectedMode?: boolean;
  onBackToCalendar?: () => void;
  onAdd: () => void;
  onDateSwipe?: (dayDelta: number) => void;
}) {
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  function handleDatePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    swipeStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function handleDatePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    swipeStart.current = null;

    if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!start || !onDateSwipe) {
      return;
    }

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;

    if (Math.abs(deltaX) < 44 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) {
      return;
    }

    onDateSwipe(deltaX < 0 ? 1 : -1);
  }

  return (
    <header className="hero-header">
      <div>
        {selectedMode && onBackToCalendar ? (
          <button type="button" className="calendar-back-button" onClick={onBackToCalendar}>
            <ArrowLeft size={16} aria-hidden="true" />
            {copy.backToCalendar}
          </button>
        ) : null}
        {dateNote && <p className="selected-date-note">{dateNote}</p>}
      </div>
      <div
        className="hero-date"
        aria-label={dateLabel}
        onPointerDown={handleDatePointerDown}
        onPointerUp={handleDatePointerUp}
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
      >
        {dateLabel}
      </div>
      <div className="header-actions">
        <button className="icon-button primary-action" type="button" aria-label={copy.add} onClick={onAdd}>
          <span className="header-plus-mark" aria-hidden="true">
            <span />
            <span />
          </span>
        </button>
      </div>
    </header>
  );
}

function RhythmCard({
  daily,
  trend,
  copy,
}: {
  daily: ReturnType<typeof calculateDailyProgress>;
  trend: number[];
  copy: UiCopy;
}) {
  const cardStyle = {
    "--daily-percent": `${daily.percent}%`,
    ...getFillToneStyle(daily.percent),
  } as CSSProperties;

  return (
    <section
      className="rhythm-card"
      style={cardStyle}
      aria-label={`${copy.rhythmAria}: ${daily.percent}%`}
    >
      <div className="rhythm-fill" />
      <strong className="rhythm-percent">{daily.percent}%</strong>
      <MiniRhythmChart values={trend} ariaLabel={copy.rhythmTrendAria} />
    </section>
  );
}

function MiniRhythmChart({ values, ariaLabel }: { values: number[]; ariaLabel: string }) {
  const width = 118;
  const height = 42;
  const padding = 4;
  const safeValues = values.length > 0 ? values : [0, 0, 0, 0, 0, 0, 0];
  const points = safeValues.map((value, index) => {
    const clamped = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 100);
    const x = safeValues.length === 1 ? width / 2 : (index / (safeValues.length - 1)) * width;
    const y = height - padding - (clamped / 100) * (height - padding * 2);

    return {
      x,
      y,
    };
  });
  const linePoints = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const lastPoint = points[points.length - 1] ?? { x: width, y: height - padding };

  return (
    <svg className="rhythm-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
      <defs>
        <linearGradient id="rhythm-chart-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#18d4b0" />
          <stop offset="100%" stopColor="#5cffb1" />
        </linearGradient>
        <filter id="rhythm-chart-glow" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <polyline className="rhythm-chart-shadow" points={linePoints} />
      <polyline className="rhythm-chart-line" points={linePoints} />
      <circle className="rhythm-chart-dot-glow" cx={lastPoint.x} cy={lastPoint.y} r="6" />
      <circle className="rhythm-chart-dot" cx={lastPoint.x} cy={lastPoint.y} r="3.2" />
    </svg>
  );
}

function SectionHeader({ title, viewAllLabel, onViewAll }: { title: string; viewAllLabel?: string; onViewAll?: () => void }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      {onViewAll && viewAllLabel && (
        <button type="button" className="view-all" onClick={onViewAll}>
          {viewAllLabel}
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}

function EmptySectionCard({
  title,
  text,
  buttonLabel,
  onAdd,
}: {
  title: string;
  text: string;
  buttonLabel: string;
  onAdd: () => void;
}) {
  return (
    <div className="empty-section-card">
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
      <button type="button" onClick={onAdd}>
        <Plus size={17} aria-hidden="true" />
        {buttonLabel}
      </button>
    </div>
  );
}

function GoalCard({
  goal,
  today,
  copy,
  nowMs,
  onOpenManual,
  onEdit,
}: {
  goal: ProgressGoal;
  today: string;
  copy: UiCopy;
  nowMs: number;
  onOpenManual: () => void;
  onQuickAdd?: (amount: number) => void;
  onEdit?: () => void;
}) {
  const progressPercent = getGoalProgressPercent(goal);
  const requiredToday = getRequiredToday(goal, today);
  const loggedToday = getTodayLoggedAmount(goal, today);
  const isGoalCompleted = goal.currentValue >= goal.targetValue;
  const isTodayDone = isGoalCompleted || loggedToday >= requiredToday;
  const dueMeta = formatDueMeta(goal.dueTime, today, isTodayDone, goal.completedAtByDate?.[today], goal.lateDates?.includes(today) ?? false, nowMs, copy);
  const progressStyle = { "--goal-progress": `${progressPercent}%`, ...getFillToneStyle(progressPercent) } as CSSProperties;
  const requiredLine = requiredToday > 0 ? `${formatNumber(requiredToday)} ${goal.unit} ${copy.perDay}` : "";
  const titleLine = !isTodayDone && requiredLine ? `${goal.title} (${copy.recommendedToFinish(requiredLine)})` : goal.title;

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenManual();
    }
  }

  return (
    <SwipeDeleteShell deleteLabel={copy.enter} editLabel={copy.editAction} deleteTone="complete" onDelete={onOpenManual} onEdit={onEdit} onTap={onOpenManual}>
      <article
        className={`goal-card ${isTodayDone ? "is-done" : ""} ${isGoalCompleted ? "is-complete" : ""}`}
        style={progressStyle}
        role="button"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className="goal-top">
          <span className="action-emoji" aria-hidden="true">{getActionEmoji(goal, "📈")}</span>
          <div className="goal-content">
            <div className="goal-title-row">
              <div className="goal-title-progress">
                <div className="goal-main-line">
                  <h3 title={titleLine}>{titleLine}</h3>
                  {dueMeta && <small className="due-meta">{dueMeta}</small>}
                </div>
                <div className="goal-progress-stack">
                  <span className="goal-numbers">
                    {formatNumber(goal.currentValue)} / {formatNumber(goal.targetValue)} ({formatNumber(Math.round(progressPercent))}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </article>
    </SwipeDeleteShell>
  );
}

function TaskRow({
  task,
  completed,
  dateKey,
  isToday,
  copy,
  expanded = false,
  nowMs,
  editLabel,
  toggleLabel,
  onClick,
  onToggle,
  onSubitemAdvance,
  onSubitemMove,
  onEdit,
}: {
  task: TaskItem;
  completed: boolean;
  dateKey: string;
  isToday: boolean;
  copy: UiCopy;
  expanded?: boolean;
  nowMs: number;
  editLabel?: string;
  toggleLabel: string;
  onClick: () => void;
  onToggle?: () => void;
  onSubitemAdvance?: (subitemId: string) => void;
  onSubitemMove?: (sourceId: string, targetId: string, placement?: ReorderPlacement) => void;
  onEdit?: () => void;
}) {
  const subitemProgress = hasTaskSubitems(task) ? getTaskSubitemProgress(task, dateKey) : null;
  const subitems = [...(task.subitems ?? [])].sort((first, second) => (first.sortOrder ?? 0) - (second.sortOrder ?? 0));
  const dayState = task.subitemStateByDate?.[dateKey] ?? {};
  const dueMeta = formatDueMeta(task.dueTime, dateKey, completed, task.completedAtByDate?.[dateKey], task.lateDates?.includes(dateKey) ?? false, nowMs, copy);

  return (
    <SwipeDeleteShell deleteLabel={toggleLabel} editLabel={editLabel} deleteTone={completed ? "undo" : "complete"} onDelete={onToggle ?? onClick} onEdit={onEdit}>
      <div className={`task-card-inline ${expanded ? "expanded" : ""}`}>
      <div className={`task-row ${completed ? "completed" : ""} ${subitemProgress ? "with-subitems" : ""} priority-${task.priority ?? "medium"}`}>
        <div
          className="task-row-main"
        >
          <span className="action-emoji" aria-hidden="true">{getActionEmoji(task)}</span>
          <span className="task-title">
            {task.title}
            {subitemProgress && <small>{subitemProgress.completed}/{subitemProgress.total}</small>}
            {dueMeta && <small className="due-meta">{dueMeta}</small>}
            {!isToday && <small>{task.date}</small>}
          </span>
        </div>
        <button
          type="button"
          className="task-check-button"
          aria-label={toggleLabel}
          aria-pressed={completed}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            if (event.detail > 1) {
              return;
            }

            (onToggle ?? onClick)();
          }}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <span className="task-check" aria-hidden="true">
            {completed && (
              <span className="task-x-mark">
                <span />
                <span />
              </span>
            )}
          </span>
        </button>
      </div>
      {expanded && subitems.length > 0 && (
        <div className="inline-subitems" aria-label={task.title}>
          {subitems.map((subitem) => {
            const state = dayState[subitem.id] ?? {};
            const target = subitem.targetCount && subitem.targetCount > 1 ? subitem.targetCount : 1;
            const current = subitem.targetCount && subitem.targetCount > 1 ? Math.min(Number(state.count ?? 0), target) : state.completed ? 1 : 0;
            const percent = target > 0 ? clampPercent((current / target) * 100) : 0;
            const isComplete = current >= target;

            return (
              <ReorderableItem key={subitem.id} id={subitem.id} scope={`subitems-${task.id}`} onMove={(sourceId, targetId, placement) => onSubitemMove?.(sourceId, targetId, placement)}>
                <SwipeAdvanceShell onAdvance={() => onSubitemAdvance?.(subitem.id)}>
                  <div className={`inline-subitem-row ${isComplete ? "completed" : ""}`}>
                    <div className="inline-subitem-head">
                      <span>{subitem.title}</span>
                      <strong>{current}/{target}</strong>
                    </div>
                    <div className="mini-progress-track" style={{ "--mini-progress": `${percent}%`, ...getFillToneStyle(percent) } as CSSProperties}>
                      <span />
                    </div>
                  </div>
                </SwipeAdvanceShell>
              </ReorderableItem>
            );
          })}
        </div>
      )}
      </div>
    </SwipeDeleteShell>
  );
}

function SubitemsSheet({
  task,
  dateKey,
  language,
  onClose,
  onChange,
}: {
  task: TaskItem;
  dateKey: string;
  language: AppSettings["language"];
  onClose: () => void;
  onChange: (taskId: string, subitemId: string, state: ActionSubitemState) => void;
}) {
  const copy = getSubitemCopy(language);
  const subitems = task.subitems ?? [];
  const progress = getTaskSubitemProgress(task, dateKey);
  const dayState = task.subitemStateByDate?.[dateKey] ?? {};

  function isComplete(subitem: ActionSubitem): boolean {
    const state = dayState[subitem.id];

    if (subitem.targetCount && subitem.targetCount > 1) {
      return Number(state?.count ?? 0) >= subitem.targetCount;
    }

    return state?.completed === true;
  }

  return (
    <BottomSheet
      title={task.title}
      subtitle={language === "en" ? `${progress.completed} of ${progress.total} ${copy.progress}` : `${progress.completed} из ${progress.total} ${copy.progress}`}
      closeLabel={language === "en" ? "Close" : "Закрыть"}
      onClose={onClose}
    >
      <div className="subitems-sheet-list">
        {subitems.map((subitem) => {
          const state = dayState[subitem.id] ?? {};
          const target = subitem.targetCount && subitem.targetCount > 1 ? subitem.targetCount : undefined;
          const count = Math.min(Number(state.count ?? 0), target ?? 1);
          const completed = isComplete(subitem);

          return (
            <div key={subitem.id} className={`subitem-sheet-row ${completed ? "completed" : ""}`}>
              <button
                type="button"
                className="subitem-toggle"
                onClick={() =>
                  onChange(task.id, subitem.id, target ? { count: completed ? 0 : target, completed: !completed } : { completed: !completed })
                }
              >
                <span className="task-check" aria-hidden="true">
                  {completed && (
                    <span className="task-x-mark">
                      <span />
                      <span />
                    </span>
                  )}
                </span>
                <strong>{subitem.title}</strong>
              </button>
              {target && (
                <div className="subitem-counter">
                  <span>
                    {count}/{target}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChange(task.id, subitem.id, {
                        count: Math.min(count + 1, target),
                        completed: count + 1 >= target,
                      })
                    }
                  >
                    <Plus size={15} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
}

function ReorderableItem({
  id,
  scope,
  onMove,
  children,
}: {
  id: string;
  scope: string;
  onMove: (sourceId: string, targetId: string, placement?: ReorderPlacement) => void;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const startPoint = useRef<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const activeRef = useRef(false);
  const suppressClick = useRef(false);
  const lastMoveRef = useRef<string | null>(null);
  const previousBodyOverflow = useRef<string | null>(null);

  function clearLongPress() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function endDrag() {
    clearLongPress();
    activeRef.current = false;
    startPoint.current = null;
    lastMoveRef.current = null;
    if (previousBodyOverflow.current !== null) {
      document.body.style.overflow = previousBodyOverflow.current;
      previousBodyOverflow.current = null;
    }
    setDragOffset({ x: 0, y: 0 });
    setDragging(false);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const target = event.currentTarget;
    startPoint.current = { x: event.clientX, y: event.clientY };
    suppressClick.current = false;
    longPressTimer.current = window.setTimeout(() => {
      activeRef.current = true;
      suppressClick.current = true;
      setDragging(true);
      previousBodyOverflow.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      try {
        target?.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture can fail if the WebView has already released the pointer.
      }
    }, 420);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = startPoint.current;

    if (!start) {
      return;
    }

    if (!activeRef.current && (Math.abs(event.clientX - start.x) > 10 || Math.abs(event.clientY - start.y) > 10)) {
      clearLongPress();
      return;
    }

    if (!activeRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDragOffset({
      x: event.clientX - start.x,
      y: event.clientY - start.y,
    });

    const draggedElement = event.currentTarget;
    const previousPointerEvents = draggedElement.style.pointerEvents;
    draggedElement.style.pointerEvents = "none";
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>(`[data-reorder-scope="${scope}"][data-reorder-id]`);
    draggedElement.style.pointerEvents = previousPointerEvents;
    const targetId = target?.dataset.reorderId;

    if (targetId && targetId !== id) {
      const targetRect = target.getBoundingClientRect();
      const placement: ReorderPlacement = event.clientY > targetRect.top + targetRect.height / 2 ? "after" : "before";
      const moveKey = `${targetId}:${placement}`;

      if (lastMoveRef.current !== moveKey) {
        lastMoveRef.current = moveKey;
        onMove(id, targetId, placement);
      }
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const wasDragging = activeRef.current;

    if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    endDrag();

    if (wasDragging) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  return (
    <div
      className={`reorderable-item ${dragging ? "is-dragging" : ""}`}
      data-reorder-id={id}
      data-reorder-scope={scope}
      style={
        {
          "--reorder-x": `${dragOffset.x}px`,
          "--reorder-y": `${dragOffset.y}px`,
        } as CSSProperties
      }
      onPointerDownCapture={handlePointerDown}
      onPointerMoveCapture={handlePointerMove}
      onPointerUpCapture={handlePointerEnd}
      onPointerCancelCapture={handlePointerEnd}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      }}
    >
      {children}
    </div>
  );
}

function SwipeAdvanceShell({ children, onAdvance }: { children: ReactNode; onAdvance?: () => void }) {
  const [offset, setOffset] = useState(0);
  const startPoint = useRef<{ x: number; y: number } | null>(null);
  const offsetRef = useRef(0);
  const suppressClick = useRef(false);

  if (!onAdvance) {
    return <>{children}</>;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    startPoint.current = { x: event.clientX, y: event.clientY };
    suppressClick.current = false;
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!startPoint.current) {
      return;
    }

    const deltaX = event.clientX - startPoint.current.x;
    const deltaY = event.clientY - startPoint.current.y;

    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
      offsetRef.current = 0;
      setOffset(0);
      return;
    }

    if (deltaX < -6) {
      event.preventDefault();
      suppressClick.current = true;
      const nextOffset = Math.max(deltaX, -82);
      offsetRef.current = nextOffset;
      setOffset(nextOffset);
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const shouldAdvance = offsetRef.current <= -54;
    startPoint.current = null;
    offsetRef.current = 0;

    if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setOffset(0);

    if (shouldAdvance) {
      suppressClick.current = true;
      onAdvance?.();
    }
  }

  return (
    <div
      className={`swipe-advance-shell ${offset < -4 ? "is-advancing" : ""}`}
      style={
        {
          "--advance-x": `${offset}px`,
          "--advance-progress": Math.min(Math.abs(offset) / 82, 1),
        } as CSSProperties
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      }}
    >
      <div className="swipe-advance-backdrop" aria-hidden="true">
        <Plus size={16} />
      </div>
      <div className="swipe-advance-content">{children}</div>
    </div>
  );
}

function SwipeDeleteShell({
  children,
  deleteLabel,
  editLabel,
  deleteTone = "complete",
  onDelete,
  onEdit,
  onTap,
}: {
  children: ReactNode;
  deleteLabel: string;
  editLabel?: string;
  deleteTone?: "complete" | "undo" | "danger";
  onDelete?: () => void;
  onEdit?: () => void;
  onTap?: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const startPoint = useRef<{ x: number; y: number } | null>(null);
  const offsetRef = useRef(0);
  const suppressClick = useRef(false);
  const lastTapAt = useRef(0);
  const isSwiping = Math.abs(offset) > 4;
  const isEditing = offset > 4;
  const isDeleting = offset < -4;
  const progress = Math.min(Math.abs(offset) / 84, 1);

  if (!onDelete && !onEdit && !onTap) {
    return <>{children}</>;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    startPoint.current = { x: event.clientX, y: event.clientY };
    suppressClick.current = false;
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!startPoint.current) {
      return;
    }

    const deltaX = event.clientX - startPoint.current.x;
    const deltaY = event.clientY - startPoint.current.y;

    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
      offsetRef.current = 0;
      setOffset(0);
      return;
    }

    if (deltaX < -6 && onDelete) {
      event.preventDefault();
      suppressClick.current = true;
      const nextOffset = Math.max(deltaX, -96);
      offsetRef.current = nextOffset;
      setOffset(nextOffset);
    } else if (deltaX > 6 && onEdit) {
      event.preventDefault();
      suppressClick.current = true;
      const nextOffset = Math.min(deltaX, 96);
      offsetRef.current = nextOffset;
      setOffset(nextOffset);
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const shouldDelete = offsetRef.current <= -72;
    const shouldEdit = offsetRef.current >= 72;
    const shouldSuppressClick = Math.abs(offsetRef.current) > 18 || shouldDelete || shouldEdit;

    startPoint.current = null;
    offsetRef.current = 0;

    if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setOffset(0);

    if (shouldDelete && onDelete) {
      suppressClick.current = true;
      onDelete();
    } else if (shouldEdit && onEdit) {
      suppressClick.current = true;
      onEdit();
    } else {
      suppressClick.current = shouldSuppressClick;

      if (!shouldSuppressClick && onTap) {
        const now = Date.now();

        if (now - lastTapAt.current < 320) {
          suppressClick.current = true;
          return;
        }

        lastTapAt.current = now;
        onTap();
      }
    }
  }

  return (
    <div
      className={`swipe-delete-shell delete-tone-${deleteTone} ${isSwiping ? "is-swiping" : ""} ${isEditing ? "is-editing" : ""} ${isDeleting ? "is-deleting" : ""}`}
      style={
        {
          "--swipe-x": `${offset}px`,
          "--swipe-progress": progress,
        } as CSSProperties
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      }}
      onDoubleClickCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = true;
      }}
    >
      <div className="swipe-edit-backdrop" aria-hidden="true">
        <span>{editLabel}</span>
      </div>
      <div className="swipe-delete-backdrop" aria-hidden="true">
        <span>{deleteLabel}</span>
      </div>
      <div className="swipe-delete-content">{children}</div>
    </div>
  );
}

function ActionIconBadge({
  emoji,
  iconKey,
  title,
  className,
}: {
  emoji?: string;
  iconKey?: string;
  title: string;
  className: string;
}) {
  return (
    <span className={className} aria-hidden="true">
      {getActionEmoji({ emoji, iconKey, title })}
    </span>
  );
}

function ActionIconGlyph({ iconKey, size = 18 }: { iconKey: string; size?: number }) {
  const icon = getActionIcon(iconKey);
  const Icon = icon.Icon;

  return <Icon size={size} aria-hidden="true" />;
}

function EditActionSheet({
  state,
  copy,
  language,
  onClose,
  onDelete,
  onSave,
}: {
  state: Exclude<EditState, null>;
  copy: UiCopy;
  language: AppSettings["language"];
  onClose: () => void;
  onDelete?: () => void;
  onSave: (update: {
    title: string;
    groupName?: string;
    note?: string;
    emoji?: string;
    iconKey?: string;
    repeatMode: TaskRepeatMode;
    selectedDays?: number[];
    dueTime?: string;
    targetValue?: number;
    currentValue?: number;
    unit?: string;
    quickAddValues?: number[];
  }) => void;
}) {
  const isGoal = state.type === "goal";
  const action = isGoal ? state.goal : state.task;
  const initialRepeatMode = isGoal ? state.goal.repeatMode : state.task.repeatMode;
  const [title, setTitle] = useState(action.title);
  const [groupName, setGroupName] = useState(action.groupName ?? "");
  const [note, setNote] = useState(action.note ?? "");
  const [iconKey, setIconKey] = useState<string | undefined>(action.iconKey);
  const [emoji, setEmoji] = useState(action.emoji);
  const [repeatMode, setRepeatMode] = useState<TaskRepeatMode>(initialRepeatMode);
  const [selectedDays, setSelectedDays] = useState<number[]>(action.selectedDays ?? defaultGoalSelectedDays);
  const [dueTimeEnabled, setDueTimeEnabled] = useState(Boolean(action.dueTime));
  const [dueTime, setDueTime] = useState(action.dueTime ?? "11:00");
  const [targetValue, setTargetValue] = useState(isGoal ? String(state.goal.targetValue) : "");
  const [currentValue, setCurrentValue] = useState(isGoal ? String(state.goal.currentValue) : "");
  const [unit, setUnit] = useState(isGoal ? state.goal.unit : "");
  const [quickValues, setQuickValues] = useState(isGoal ? state.goal.quickAddValues.join(", ") : "");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const emojiInputRef = useRef<HTMLInputElement>(null);
  const selectedEmoji = emoji ?? getIconEmoji(iconKey) ?? inferEmojiFromTitle(title);
  const titleIsValid = title.trim().length > 0;
  const numericTarget = Number(targetValue);
  const numericCurrent = Number(currentValue);
  const progressSettingsValid =
    !isGoal ||
    (Number.isFinite(numericTarget) &&
      numericTarget > 0 &&
      Number.isFinite(numericCurrent) &&
      numericCurrent >= 0 &&
      unit.trim().length > 0);

  function handleRepeatChange(nextRepeatMode: TaskRepeatMode) {
    setRepeatMode(nextRepeatMode);
  }

  function toggleWeekdaySelection(day: number) {
    setSelectedDays((days) => toggleWeekday(days, day));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!titleIsValid || !progressSettingsValid) {
      return;
    }

    const update = {
      title,
      groupName: groupName.trim() || undefined,
      note,
      emoji,
      iconKey,
      repeatMode,
      selectedDays: repeatMode === "selectedDays" ? selectedDays : undefined,
      dueTime: dueTimeEnabled ? normalizeDueTimeInput(dueTime) : undefined,
    };

    onSave(
      isGoal
        ? {
            ...update,
            targetValue: numericTarget,
            currentValue: numericCurrent,
            unit,
            quickAddValues: parseQuickValues(quickValues, unit),
          }
        : update,
    );
  }

  function openEmojiInput() {
    setIconPickerOpen(true);
    window.setTimeout(() => emojiInputRef.current?.focus(), 0);
  }

  return (
    <BottomSheet title={copy.editAction} closeLabel={copy.close} onClose={onClose}>
      <form className="sheet-form edit-action-form" onSubmit={handleSubmit}>
        <label>
          <span>{copy.name}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </label>

        <label className="compact-group-field">
          <span>{copy.group}</span>
          <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder={copy.groupPlaceholder} />
        </label>

        <div className="field-group">
          <span>{copy.icon}</span>
          <button type="button" className="icon-picker-trigger emoji-picker-trigger" onClick={openEmojiInput}>
            <span className="emoji-picker-preview" aria-hidden="true">{selectedEmoji ?? "＋"}</span>
            {selectedEmoji ? copy.changeIcon : copy.chooseIcon}
          </button>
          {iconPickerOpen && (
            <EmojiPickerPanel
              value={emoji}
              title={title}
              copy={copy}
              inputRef={emojiInputRef}
              onChange={(nextEmoji) => {
                setEmoji(nextEmoji);
                setIconKey(undefined);
              }}
            />
          )}
        </div>

        <div className="field-group">
          <span>{copy.repeat}</span>
          <div className={`segmented-control compact-segment ${isGoal ? "segment-three" : "segment-four"}`}>
            {!isGoal && (
              <button type="button" className={repeatMode === "once" ? "active" : ""} onClick={() => handleRepeatChange("once")}>
                {copy.repeatOnce}
              </button>
            )}
            <button type="button" className={repeatMode === "everyDay" ? "active" : ""} onClick={() => handleRepeatChange("everyDay")}>
              {copy.everyDay}
            </button>
            <button type="button" className={repeatMode === "weekdays" ? "active" : ""} onClick={() => handleRepeatChange("weekdays")}>
              {copy.weekdays}
            </button>
            <button type="button" className={repeatMode === "selectedDays" ? "active" : ""} onClick={() => handleRepeatChange("selectedDays")}>
              {copy.selectedDays}
            </button>
          </div>
        </div>

        {repeatMode === "selectedDays" && <WeekdayChips selectedDays={selectedDays} language={language} onToggle={toggleWeekdaySelection} />}

        <div className={`due-time-builder ${dueTimeEnabled ? "open" : ""}`}>
          <button type="button" className="due-time-toggle" onClick={() => setDueTimeEnabled((enabled) => !enabled)}>
            <span>{copy.addDueTime}</span>
            <Clock3 size={16} aria-hidden="true" />
          </button>
          {dueTimeEnabled && (
            <label className="due-time-row">
              <span>{copy.dueBefore}</span>
              <input type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} />
            </label>
          )}
        </div>

        {isGoal && (
          <>
            <div className="date-grid compact-two-column">
              <label>
                <span>{copy.total}</span>
                <input type="number" min="1" step="any" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} />
              </label>
              <label>
                <span>{copy.unit}</span>
                <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder={copy.unitPlaceholder} />
              </label>
            </div>
            <div className="date-grid compact-two-column">
              <label>
                <span>{copy.currentAmount}</span>
                <input type="number" min="0" step="any" value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} />
              </label>
              <label>
                <span>{copy.quickButtons}</span>
                <input value={quickValues} onChange={(event) => setQuickValues(event.target.value)} placeholder="1, 5, 10" />
              </label>
            </div>
          </>
        )}

        <label>
          <span>{copy.comment}</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder={copy.optional} />
        </label>

        <div className="sheet-actions">
          <button
            type="submit"
            className="primary-sheet-button"
            disabled={!titleIsValid || !progressSettingsValid || (repeatMode === "selectedDays" && selectedDays.length === 0)}
          >
            {copy.save}
          </button>
          {onDelete && (
            <button type="button" className="primary-sheet-button danger-action" onClick={onDelete}>
              {copy.deleteConfirm}
            </button>
          )}
          <button type="button" className="ghost-sheet-button" onClick={onClose}>
            {copy.cancel}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}

function getTitleFallbackLetter(title: string): string {
  return title.trim().slice(0, 1).toLocaleUpperCase("ru-RU") || "•";
}

function ViewAllSheet({
  type,
  today,
  goals,
  tasks,
  copy,
  nowMs,
  onClose,
  onOpenManual,
  onQuickAddGoal,
  onToggleTask,
}: {
  type: Exclude<ViewAllState, null>;
  today: string;
  goals: ProgressGoal[];
  tasks: TaskItem[];
  copy: UiCopy;
  nowMs: number;
  onClose: () => void;
  onOpenManual: (goal: ProgressGoal) => void;
  onQuickAddGoal: (goal: ProgressGoal, amount: number) => void;
  onToggleTask: (task: TaskItem) => void;
}) {
  const isGoals = type === "goals";

  return (
    <BottomSheet title={isGoals ? copy.allGoals : copy.allTasks} closeLabel={copy.close} onClose={onClose}>
      <div className="view-all-list">
        {isGoals &&
          goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              today={today}
              copy={copy}
              nowMs={nowMs}
              onOpenManual={() => onOpenManual(goal)}
              onQuickAdd={(amount) => onQuickAddGoal(goal, amount)}
            />
          ))}
        {!isGoals &&
          tasks.map((task) => {
            const completedToday = isTaskCompletedOnDate(task, today);

            return (
              <TaskRow
                key={task.id}
                task={task}
                completed={completedToday}
                dateKey={today}
                isToday
                copy={copy}
                nowMs={nowMs}
                toggleLabel={completedToday ? copy.undoDoneTitle : copy.markDoneTitle}
                onClick={() => onToggleTask(task)}
              />
            );
          })}
        {((isGoals && goals.length === 0) || (!isGoals && tasks.length === 0)) && (
          <p className="empty-sheet-state">{isGoals ? copy.noGoalsToday : copy.noTasksToday}</p>
        )}
      </div>
    </BottomSheet>
  );
}

function MiniStatsPanel({
  weekPercent,
  monthPercent,
  streak,
  copy,
  language,
}: {
  weekPercent: number;
  monthPercent: number;
  streak: number;
  copy: UiCopy;
  language: AppSettings["language"];
}) {
  return (
    <section className="mini-stats-panel" aria-label={copy.miniStatsAria}>
      <div className="mini-stat-item">
        <CalendarDays size={17} aria-hidden="true" />
        <span>{copy.week}</span>
        <strong>{weekPercent}%</strong>
        <p>{copy.progress}</p>
      </div>
      <div className="mini-stat-item">
        <BarChart3 size={17} aria-hidden="true" />
        <span>{copy.month}</span>
        <strong>{monthPercent}%</strong>
        <p>{copy.progress}</p>
      </div>
      <div className="mini-stat-item">
        <Flame size={17} aria-hidden="true" />
        <span>{copy.streak}</span>
        <strong>{streak}</strong>
        <p>{getDayPlural(streak, language)}</p>
      </div>
    </section>
  );
}

function ProgressScreen({
  appState,
  dayRecords,
  today,
  todayPercent,
  language,
}: {
  appState: AppState;
  dayRecords: Array<{ date: string; percent: number }>;
  today: string;
  todayPercent: number;
  language: AppSettings["language"];
}) {
  const copy = progressCopy[language];
  const todayDate = useMemo(() => parseDateKey(today), [today]);
  const [period, setPeriod] = useState<ProgressPeriod>("week");
  const [rangeSheetOpen, setRangeSheetOpen] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<ProgressPanelId | null>(null);
  const [customRange, setCustomRange] = useState(() => ({
    startDate: addDays(today, -29),
    endDate: today,
  }));
  const range = useMemo(
    () => (period === "period" ? getProgressRangeFromKeys(customRange.startDate, customRange.endDate) : getProgressRange(period, todayDate)),
    [customRange.endDate, customRange.startDate, period, todayDate],
  );
  const previousRange = useMemo(
    () => (period === "period" ? getPreviousProgressRangeFromKeys(customRange.startDate, customRange.endDate) : getPreviousProgressRange(period, todayDate)),
    [customRange.endDate, customRange.startDate, period, todayDate],
  );
  const summary = useMemo(
    () => getProgressAverage(range, appState, dayRecords, today, todayPercent),
    [appState, dayRecords, range, today, todayPercent],
  );
  const previousSummary = useMemo(
    () => getProgressAverage(previousRange, appState, dayRecords, today, todayPercent),
    [appState, dayRecords, previousRange, today, todayPercent],
  );
  const chartPoints = useMemo(
    () => getProgressChartPoints(period, range, appState, dayRecords, today, todayPercent, language),
    [appState, dayRecords, language, period, range, today, todayPercent],
  );
  const weekdayAverages = useMemo(
    () => getWeekdayAverages(range, appState, dayRecords, today, todayPercent, language),
    [appState, dayRecords, language, range, today, todayPercent],
  );
  const balance = useMemo(
    () => getProgressBalance(range, appState, today, todayPercent, dayRecords),
    [appState, dayRecords, range, today, todayPercent],
  );
  const actionRanks = useMemo(() => getProgressActionRanks(range, appState, today), [appState, range, today]);
  const streak = useMemo(() => getCurrentStreak(todayDate, appState.goals, appState.tasks), [appState.goals, appState.tasks, todayDate]);
  const delta = summary.average - previousSummary.average;
  const trendValues = chartPoints.map((point) => point.value);
  const hasAnyData = summary.daysWithData > 0;
  const periodOptions: Array<{ value: ProgressPeriod; label: string }> = [
    { value: "week", label: copy.week },
    { value: "month", label: copy.month },
    { value: "year", label: copy.year },
    { value: "period", label: "..." },
  ];
  const handlePeriodSelect = (value: ProgressPeriod) => {
    if (value === "period") {
      setPeriod("period");
      setRangeSheetOpen(true);
      return;
    }

    setPeriod(value);
  };
  const getPanelClass = (panelId: ProgressPanelId) =>
    `progress-panel ${expandedPanel === panelId ? "is-expanded" : expandedPanel ? "is-compressed" : ""}`;
  const togglePanel = (panelId: ProgressPanelId) => {
    setExpandedPanel((currentPanel) => (currentPanel === panelId ? null : panelId));
  };

  return (
    <main className={`progress-screen ${!hasAnyData ? "progress-screen-empty" : ""} ${expandedPanel ? "has-expanded-panel" : ""}`}>
      <div className="progress-period-tabs" role="group" aria-label={copy.period}>
        {periodOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={period === option.value ? "active" : ""}
            aria-pressed={period === option.value}
            onClick={() => handlePeriodSelect(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {!hasAnyData && (
        <section className="progress-empty-card">
          <BarChart3 size={24} aria-hidden="true" />
          <strong>{copy.emptyTitle}</strong>
          <p>{copy.emptyText}</p>
        </section>
      )}

      <section className={`progress-kpi-grid ${getPanelClass("metrics")}`} onClick={() => togglePanel("metrics")}>
        <ProgressKpiCard
          title={copy.completion}
          value={`${summary.average}%`}
          caption={copy.comparedToPrevious(delta)}
          icon={TrendingUp}
          tone={delta >= 0 ? "mint" : "amber"}
        />
        <ProgressKpiCard
          title={copy.streak}
          value={formatNumber(streak)}
          caption={`${getDayPlural(streak, language)} ${language === "en" ? "in a row" : "подряд"}`}
          icon={Flame}
          tone="rose"
        />
        <ProgressKpiCard
          title={copy.onTrack}
          value={formatNumber(summary.completedDays)}
          caption={getDayPlural(summary.completedDays, language)}
          icon={Check}
          tone="mint"
        />
        <ProgressKpiCard
          title={copy.behind}
          value={formatNumber(summary.behindDays)}
          caption={getDayPlural(summary.behindDays, language)}
          icon={Clock3}
          tone="amber"
        />
      </section>

      <section className={getPanelClass("rhythm") + " progress-rhythm-card"} onClick={() => togglePanel("rhythm")}>
        <div>
          <span>{copy.periodRhythm}</span>
          <strong>{getProgressRhythmTitle(summary.average, language)}</strong>
          <p>{copy.rhythmDescription(summary.average)}</p>
        </div>
        <MiniRhythmChart values={trendValues} ariaLabel={copy.dynamics} />
      </section>

      <section className={getPanelClass("chart") + " progress-chart-card"} onClick={() => togglePanel("chart")}>
        <h2>{copy.dynamics}</h2>
        <div className="progress-chart-summary" aria-hidden={expandedPanel !== "chart"}>
          <span>{copy.completion}: {summary.average}%</span>
          <span>{summary.completedDays}/{range.length} {language === "en" ? "days" : "дней"}</span>
        </div>
        <ProgressLineChart points={chartPoints} />
      </section>

      <section className="progress-insight-grid">
        <ProgressBalanceCard balance={balance} copy={copy} className={getPanelClass("balance")} onClick={() => togglePanel("balance")} />
        <ProgressBestDaysCard days={weekdayAverages} copy={copy} className={getPanelClass("days")} onClick={() => togglePanel("days")} />
      </section>

      <section className={getPanelClass("actions") + " progress-best-card"} onClick={() => togglePanel("actions")}>
        <h2>{copy.bestActions}</h2>
        <div className="progress-rank-list">
          {actionRanks.length > 0 ? actionRanks.map((action, index) => (
            <div className="progress-rank-row" key={action.id}>
              <span className="progress-rank-index">{index + 1}</span>
              <ActionIconBadge className="progress-rank-icon" emoji={action.emoji} iconKey={action.iconKey} title={action.title} />
              <strong>{action.title}</strong>
              <div className="progress-rank-track" style={{ "--rank-progress": `${action.percent}%`, ...getFillToneStyle(action.percent) } as CSSProperties}>
                <span />
              </div>
              <em>{action.percent}%</em>
            </div>
          )) : (
            <p className="progress-no-actions">{copy.noActions}</p>
          )}
        </div>
      </section>

      {rangeSheetOpen && (
        <ProgressRangeSheet
          language={language}
          value={customRange}
          onApply={(nextRange) => {
            setCustomRange(nextRange);
            setPeriod("period");
            setRangeSheetOpen(false);
          }}
          onClose={() => setRangeSheetOpen(false)}
        />
      )}
    </main>
  );
}

function ProgressRangeSheet({
  language,
  value,
  onApply,
  onClose,
}: {
  language: AppSettings["language"];
  value: { startDate: string; endDate: string };
  onApply: (value: { startDate: string; endDate: string }) => void;
  onClose: () => void;
}) {
  const common = uiCopy[language];
  const copy = language === "en"
    ? {
      title: "Custom range",
      subtitle: "Filter progress from date to date",
      from: "From",
      to: "To",
      days: "days in range",
      invalid: "End date must be after start date",
      apply: "Apply",
    }
    : {
      title: "Промежуток",
      subtitle: "Фильтр прогресса от даты до даты",
      from: "От",
      to: "До",
      days: "дней в промежутке",
      invalid: "Дата окончания должна быть позже даты начала",
      apply: "Применить",
    };
  const [startDate, setStartDate] = useState(value.startDate);
  const [endDate, setEndDate] = useState(value.endDate);
  const invalidRange = endDate < startDate;
  const rangeLength = invalidRange ? 0 : daysInclusive(startDate, endDate);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (invalidRange) {
      return;
    }

    onApply({ startDate, endDate });
  };

  return (
    <BottomSheet title={copy.title} subtitle={copy.subtitle} closeLabel={common.close} onClose={onClose}>
      <form className="sheet-form progress-range-form" onSubmit={handleSubmit}>
        <div className="progress-range-fields">
          <label>
            {copy.from}
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            {copy.to}
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>
        <p className={`progress-range-note ${invalidRange ? "error" : ""}`}>
          {invalidRange ? copy.invalid : `${rangeLength} ${copy.days}`}
        </p>
        <button type="submit" className="primary-sheet-button" disabled={invalidRange}>
          {copy.apply}
        </button>
      </form>
    </BottomSheet>
  );
}

function ProgressKpiCard({
  title,
  value,
  caption,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  caption: string;
  icon: LucideIcon;
  tone: "violet" | "mint" | "amber" | "rose";
}) {
  return (
    <article className={`progress-kpi-card tone-${tone}`}>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <p>{caption}</p>
      </div>
      <Icon size={18} aria-hidden="true" />
    </article>
  );
}

function ProgressLineChart({ points }: { points: ProgressChartPoint[] }) {
  const width = 330;
  const height = 108;
  const left = 30;
  const right = 10;
  const top = 13;
  const bottom = 20;
  const safePoints = points.length > 0 ? points : [{ label: "-", value: 0, hasData: false }];
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const coordinates = safePoints.map((point, index) => {
    const x = safePoints.length === 1 ? left + plotWidth / 2 : left + (index / (safePoints.length - 1)) * plotWidth;
    const y = top + (1 - Math.min(Math.max(point.value, 0), 100) / 100) * plotHeight;

    return { x, y, ...point };
  });
  const linePoints = coordinates.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const areaPoints = `${left},${height - bottom} ${linePoints} ${width - right},${height - bottom}`;
  const showPointLabels = safePoints.length <= 8;

  return (
    <svg className="progress-line-chart" viewBox={`0 0 ${width} ${height}`} role="img">
      <defs>
        <linearGradient id="progress-line-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff5c5c" />
          <stop offset="48%" stopColor="#ffb85c" />
          <stop offset="100%" stopColor="#22c98a" />
        </linearGradient>
        <linearGradient id="progress-area-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(34, 201, 138, 0.24)" />
          <stop offset="100%" stopColor="rgba(255, 92, 92, 0)" />
        </linearGradient>
      </defs>
      {[100, 75, 50, 25, 0].map((tick) => {
        const y = top + (1 - tick / 100) * plotHeight;

        return (
          <g key={tick}>
            <text className="progress-chart-y-label" x="0" y={y + 4}>{tick}%</text>
            <line className="progress-chart-grid-line" x1={left} x2={width - right} y1={y} y2={y} />
          </g>
        );
      })}
      <polygon className="progress-chart-area" points={areaPoints} />
      <polyline className="progress-chart-line-glow" points={linePoints} />
      <polyline className="progress-chart-line" points={linePoints} />
      {coordinates.map((point) => (
        <g key={`${point.label}-${point.x}`}>
          <circle className={`progress-chart-point ${point.hasData ? "" : "empty"}`} cx={point.x} cy={point.y} r="3.2" style={getFillToneStyle(point.value)} />
          {showPointLabels && point.hasData && <text className="progress-chart-value-label" x={point.x} y={point.y - 8}>{point.value}%</text>}
          <text className="progress-chart-x-label" x={point.x} y={height - 8}>{point.label}</text>
        </g>
      ))}
    </svg>
  );
}

function ProgressBalanceCard({
  balance,
  copy,
  className,
  onClick,
}: {
  balance: ReturnType<typeof getProgressBalance>;
  copy: (typeof progressCopy)[AppSettings["language"]];
  className?: string;
  onClick?: () => void;
}) {
  const checklistStart = balance.progressShare;
  const missesStart = Math.min(balance.progressShare + balance.checklistShare, 100);

  return (
    <section className={`progress-balance-card ${className ?? ""}`} onClick={onClick}>
      <h2>{copy.taskBalance}</h2>
      <div className="progress-balance-content">
        <div
          className="progress-donut"
          style={{
            "--progress-part": `${checklistStart}%`,
            "--checklist-part": `${missesStart}%`,
          } as CSSProperties}
        >
          <span>
            <strong>{formatNumber(balance.totalActions)}</strong>
            <small>{copy.actionsLabel}</small>
          </span>
        </div>
        <div className="progress-balance-legend">
          <ProgressLegendItem className="violet" label={copy.progress} value={balance.progressShare} />
          <ProgressLegendItem className="cyan" label={copy.checklist} value={balance.checklistShare} />
          <ProgressLegendItem className="amber" label={copy.misses} value={balance.missShare} />
        </div>
      </div>
    </section>
  );
}

function ProgressLegendItem({ className, label, value }: { className: string; label: string; value: number }) {
  return (
    <div className="progress-legend-row">
      <span className={className} aria-hidden="true" />
      <p>{label}</p>
      <strong>{value}%</strong>
    </div>
  );
}

function ProgressBestDaysCard({
  days,
  copy,
  className,
  onClick,
}: {
  days: Array<{ label: string; value: number }>;
  copy: (typeof progressCopy)[AppSettings["language"]];
  className?: string;
  onClick?: () => void;
}) {
  const maxValue = Math.max(...days.map((day) => day.value), 0);

  return (
    <section className={`progress-best-days-card ${className ?? ""}`} onClick={onClick}>
      <h2>{copy.bestDays}</h2>
      <div className="progress-day-bars">
        {days.map((day) => (
          <div className={`progress-day-bar ${day.value === maxValue && maxValue > 0 ? "best" : ""}`} key={day.label}>
            <span>{day.value > 0 ? `${day.value}%` : ""}</span>
            <i style={{ "--bar-value": `${day.value}%`, ...getFillToneStyle(day.value) } as CSSProperties} />
            <small>{day.label}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function BottomNav({
  activeScreen,
  language,
  onSelect,
}: {
  activeScreen: AppScreen;
  language: AppSettings["language"];
  onSelect: (screen: AppScreen) => void;
}) {
  const copy = navCopy[language];
  const navItems = [
    { label: copy.today, icon: Sun, screen: "today", disabled: false },
    { label: copy.calendar, icon: CalendarDays, screen: "calendar", disabled: false },
    { label: copy.progress, icon: BarChart3, screen: "progress", disabled: false },
    { label: copy.profile, icon: UserRound, screen: "profile", disabled: false },
  ];

  return (
    <nav className="bottom-nav" aria-label={copy.aria}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = activeScreen === item.screen;

        return (
          <button
            key={item.label}
            type="button"
            className={active ? "active" : ""}
            disabled={item.disabled}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            title={item.label}
            onClick={() => onSelect(item.screen as AppScreen)}
          >
            <Icon size={23} />
          </button>
        );
      })}
    </nav>
  );
}

function CalendarScreen({
  appState,
  dayRecords,
  today,
  todayPercent,
  language,
  onSelectDate,
}: {
  appState: AppState;
  dayRecords: Array<{ date: string; percent: number }>;
  today: string;
  todayPercent: number;
  language: AppSettings["language"];
  onSelectDate: (dateKey: string) => void;
}) {
  const copy = calendarCopy[language];
  const ui = uiCopy[language];
  const todayDate = parseDateKey(today);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
  const [selectedDateKey, setSelectedDateKey] = useState(today);
  const [activeFilter, setActiveFilter] = useState<CalendarFilterMode>("all");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const calendarDays = useMemo(() => getCalendarMonthGrid(visibleMonth), [visibleMonth]);
  const monthLabel = formatCalendarMonth(visibleMonth, language);

  function shiftMonth(offset: number) {
    setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + offset, 1));
  }

  function jumpToToday() {
    setVisibleMonth(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
    setSelectedDateKey(today);
  }

  const calendarMenuItems = [
    {
      label: copy.today,
      icon: Sun,
      onClick: jumpToToday,
    },
    {
      label: language === "en" ? "This month" : "Этот месяц",
      icon: CalendarDays,
      onClick: () => setVisibleMonth(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)),
    },
    {
      label: copy.previousMonth,
      icon: ChevronLeft,
      onClick: () => shiftMonth(-1),
    },
    {
      label: copy.nextMonth,
      icon: ChevronRight,
      onClick: () => shiftMonth(1),
    },
  ];
  const filterItems: Array<{ value: CalendarFilterMode; label: string; icon: LucideIcon }> = [
    { value: "all", label: language === "en" ? "All days" : "Все дни", icon: CalendarDays },
    { value: "activity", label: language === "en" ? "With activity" : "Только с активностью", icon: BarChart3 },
    { value: "closed", label: language === "en" ? "Completed" : "Закрытые", icon: Check },
    { value: "partial", label: language === "en" ? "Partial" : "Частичные", icon: Clock3 },
    { value: "missed", label: language === "en" ? "Missed" : "Пропуски", icon: X },
  ];

  return (
    <main className="calendar-screen">
      <header className="calendar-header">
        <div className="calendar-header-actions">
          <button
            type="button"
            className={`icon-button calendar-icon-button ${activeFilter !== "all" ? "active" : ""}`}
            aria-label={copy.filter}
            aria-pressed={activeFilter !== "all"}
            onClick={() => setFilterMenuOpen(true)}
          >
            <Filter size={25} />
          </button>
        </div>
      </header>

      <div className="calendar-month-nav" aria-label={copy.monthPicker}>
        <button type="button" aria-label={copy.previousMonth} onClick={() => shiftMonth(-1)}>
          <ChevronLeft size={19} aria-hidden="true" />
        </button>
        <button type="button" className="calendar-month-label" onClick={jumpToToday}>
          <CalendarDays size={18} aria-hidden="true" />
          <span>{monthLabel}</span>
        </button>
        <button type="button" aria-label={copy.nextMonth} onClick={() => shiftMonth(1)}>
          <ChevronRight size={19} aria-hidden="true" />
        </button>
      </div>

      <section className="calendar-grid-card" aria-label={monthLabel}>
        <div className="calendar-weekdays">
          {getCalendarWeekdayLabels(language).map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {calendarDays.map((date) => {
            const dateKey = toDateKey(date);
            const dayDetails = getCalendarDayDetails(date, appState, dayRecords, today, todayPercent);
            const inMonth = date.getMonth() === visibleMonth.getMonth();
            const selected = selectedDateKey === dateKey;
            const isToday = today === dateKey;
            const isFuture = dateKey > today;
            const filterDetails = isFuture ? { ...dayDetails, percent: 0, hasData: false } : dayDetails;
            const tone = isFuture ? "empty" : getCalendarDayTone(dayDetails.percent, dayDetails.hasData);
            const matchesFilter = getCalendarFilterMatch(activeFilter, filterDetails, tone);
            const hasActions = dayDetails.totalActions > 0;
            const showCompletion = !isFuture && hasActions;
            const showPlanned = isFuture && hasActions;

            return (
              <button
                type="button"
                key={dateKey}
                className={[
                  "calendar-day",
                  `tone-${tone}`,
                    inMonth ? "" : "outside-month",
                    selected ? "selected" : "",
                    isToday ? "is-today" : "",
                    isFuture ? "future-day" : "",
                    activeFilter !== "all" && !matchesFilter ? "filtered" : "",
                  ].filter(Boolean).join(" ")}
                aria-current={isToday ? "date" : undefined}
                onClick={() => {
                  setSelectedDateKey(dateKey);
                  if (!inMonth) {
                    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                  }
                  onSelectDate(dateKey);
                }}
                >
                  <strong>{date.getDate()}</strong>
                  {showCompletion && <span className="calendar-day-percent">{dayDetails.percent}%</span>}
                  {showCompletion && (
                    <small className="calendar-day-count">
                      {dayDetails.completedActions}/{dayDetails.totalActions}
                    </small>
                  )}
                  {showPlanned && <small className="calendar-day-planned">{dayDetails.totalActions}</small>}
                </button>
              );
            })}
        </div>
      </section>

      <section className="calendar-legend" aria-label="Legend">
        <CalendarLegendItem className="closed" label={copy.closed} />
        <CalendarLegendItem className="partial" label={copy.partial} />
        <CalendarLegendItem className="missed" label={copy.skipped} />
        <CalendarLegendItem className="today" label={copy.selectedToday} />
      </section>
      {filterMenuOpen && (
        <BottomSheet title={copy.filter} closeLabel={ui.close} onClose={() => setFilterMenuOpen(false)}>
          <div className="calendar-sheet-actions">
            {filterItems.map((item) => {
              const Icon = item.icon;
              const active = activeFilter === item.value;

              return (
                <button
                  key={item.value}
                  type="button"
                  className={`calendar-sheet-row ${active ? "active" : ""}`}
                  onClick={() => {
                    setActiveFilter(item.value);
                    setFilterMenuOpen(false);
                  }}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                  {active && <Check size={16} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </BottomSheet>
      )}
    </main>
  );
}

function CalendarLegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className={`calendar-legend-item ${className}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

function CalendarProgressRing({ percent }: { percent: number }) {
  const radius = 21;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(Math.max(percent, 0), 100) / 100) * circumference;

  return (
    <div className="calendar-progress-ring" aria-label={`${percent}%`}>
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r={radius} />
        <circle cx="28" cy="28" r={radius} style={{ strokeDasharray: circumference, strokeDashoffset: offset }} />
      </svg>
      <strong>{percent}%</strong>
    </div>
  );
}

function CalendarDetailColumn({
  title,
  icon: Icon,
  tone,
  items,
  emptyText,
}: {
  title: string;
  icon: LucideIcon;
  tone: "done" | "partial" | "missed";
  items: CalendarDayDetail[];
  emptyText: string;
}) {
  return (
    <div className={`calendar-detail-column tone-${tone}`}>
      <h3>{title}</h3>
      <div className="calendar-detail-list">
        {items.length > 0 ? items.map((item) => (
          <div className="calendar-detail-row" key={item.id}>
            <span aria-hidden="true">
              <Icon size={13} />
            </span>
            <p>
              {item.title}
              {item.detail && <small>{item.detail}</small>}
            </p>
          </div>
        )) : (
          <p className="calendar-detail-empty">{emptyText}</p>
        )}
      </div>
    </div>
  );
}

function CalendarProgressEntrySection({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: CalendarDayDetail[];
  emptyText: string;
}) {
  return (
    <div className="calendar-progress-entry-section">
      <h3>{title}</h3>
      <div className="calendar-progress-entry-list">
        {items.length > 0 ? items.map((item) => (
          <div className="calendar-progress-entry-row" key={item.id}>
            <span aria-hidden="true">
              <TrendingUp size={14} />
            </span>
            <p>
              {item.title}
              {item.detail && <small>{item.detail}</small>}
            </p>
          </div>
        )) : (
          <p className="calendar-detail-empty">{emptyText}</p>
        )}
      </div>
    </div>
  );
}

function ProfileScreen({
  settings,
  telegramUser,
  telegramStatus,
  onSettingsChange,
  onResetRequest,
}: {
  settings: AppSettings;
  telegramUser: TelegramUser | null;
  telegramStatus: TelegramConnectionStatus;
  onSettingsChange: (settings: Partial<AppSettings>) => void;
  onResetRequest: () => void;
}) {
  const copy = profileCopy[settings.language];

  useEffect(() => {
    if (settings.theme === "system") {
      onSettingsChange({ theme: "dark" });
    }
  }, [onSettingsChange, settings.theme]);

  return (
    <main className="profile-screen">
      <ProfileHeader
        telegramUser={telegramUser}
        telegramStatus={telegramStatus}
        copy={copy}
        language={settings.language}
      />

      <ProfileCard title={copy.interface}>
        <div className="profile-setting-block">
          <div className="profile-setting-heading">
            <span className="profile-row-icon accent-violet" aria-hidden="true">
              <Globe2 size={20} />
            </span>
            <span className="profile-row-label">{copy.language}</span>
          </div>
          <ProfileSegmented
            value={settings.language}
            options={[
              { value: "en", label: "EN" },
              { value: "ru", label: "RU" },
            ]}
            onChange={(value) => onSettingsChange({ language: value as AppSettings["language"] })}
            compact
          />
        </div>
        <div className="profile-setting-block">
          <div className="profile-setting-heading">
            <span className="profile-row-icon accent-cyan" aria-hidden="true">
              <Moon size={20} />
            </span>
            <span className="profile-row-label">{copy.theme}</span>
          </div>
          <ThemeIconSelector
            value={settings.theme}
            labels={{
              light: copy.lightTheme,
              dark: copy.darkTheme,
            }}
            onChange={(value) => onSettingsChange({ theme: value as AppSettings["theme"] })}
          />
        </div>
      </ProfileCard>

      <ProfileCard title={copy.about}>
        <ProfileRow icon={Info} label={copy.version} value={APP_VERSION} accent="violet" />
      </ProfileCard>

      <button type="button" className="danger-reset-button" onClick={onResetRequest}>
        <Trash2 size={22} aria-hidden="true" />
        <span>{copy.resetData}</span>
      </button>

      <button
        type="button"
        className={`hints-card ${settings.hintsEnabled ? "enabled" : ""}`}
        aria-pressed={settings.hintsEnabled}
        onClick={() => onSettingsChange({ hintsEnabled: !settings.hintsEnabled })}
      >
        <span className="profile-row-icon accent-violet" aria-hidden="true">
          <Lightbulb size={21} />
        </span>
        <span>
          <strong>{settings.hintsEnabled ? copy.hintsOn : copy.hintsOff}</strong>
          <small>{copy.hintsText}</small>
        </span>
        <span className="toggle-switch" aria-hidden="true">
          <span>{settings.hintsEnabled && <Check size={18} />}</span>
        </span>
      </button>
    </main>
  );
}

function ProfileHeader({
  telegramUser,
  telegramStatus,
  copy,
  language,
}: {
  telegramUser: TelegramUser | null;
  telegramStatus: TelegramConnectionStatus;
  copy: (typeof profileCopy)[AppSettings["language"]];
  language: AppSettings["language"];
}) {
  const displayName = telegramUser ? [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(" ").trim() : "";
  const title = displayName || copy.browserModeTitle;
  const subtitle = telegramUser?.username ? `@${telegramUser.username}` : copy.browserModeSubtitle;
  const isConnected = telegramStatus === "connected";
  const status =
    telegramStatus === "connected"
      ? copy.telegramConnected
      : telegramStatus === "missing-user"
        ? language === "en"
          ? "Telegram is open, but user was not passed"
          : "Telegram открыт, но пользователь не передан"
        : copy.browserModeStatus;

  return (
    <header className="profile-header">
      <div className="profile-header-copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <ProfileHeaderAvatar telegramUser={telegramUser} label={copy.profileAria} />
      <span className={`profile-account-status ${isConnected ? "connected" : "browser"}`}>{status}</span>
    </header>
  );
}

function ProfileCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="profile-card">
      <h2>{title}</h2>
      <div className="profile-card-rows">{children}</div>
    </section>
  );
}

function ProfileHeaderAvatar({ telegramUser, label }: { telegramUser: TelegramUser | null; label: string }) {
  const fallbackLetter = (telegramUser?.first_name?.trim() || "A").charAt(0).toUpperCase() || "A";

  return (
    <div className="profile-header-avatar" aria-label={label}>
      {telegramUser?.photo_url ? <img src={telegramUser.photo_url} alt="" /> : <span>{fallbackLetter}</span>}
    </div>
  );
}

function ProfileRow({
  icon: Icon,
  label,
  value,
  onClick,
  muted = false,
  accent = "violet",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onClick?: () => void;
  muted?: boolean;
  accent?: "violet" | "cyan" | "mint";
}) {
  const content = (
    <>
      <span className={`profile-row-icon accent-${accent}`} aria-hidden="true">
        <Icon size={20} />
      </span>
      <span className="profile-row-label">{label}</span>
      <span className={`profile-row-value ${muted ? "muted" : ""}`}>{value}</span>
      {onClick && <ChevronRight size={20} aria-hidden="true" />}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className="profile-row profile-row-button" onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className="profile-row">{content}</div>;
}

function ProfileSegmented({
  value,
  options,
  onChange,
  compact = false,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={`profile-segmented ${compact ? "compact" : ""}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ThemeIconSelector({
  value,
  labels,
  includeSystem = false,
  onChange,
}: {
  value: AppSettings["theme"];
  labels: Record<"light" | "dark", string> & Partial<Record<"system", string>>;
  includeSystem?: boolean;
  onChange: (value: AppSettings["theme"]) => void;
}) {
  const options: Array<{ value: AppSettings["theme"]; icon: LucideIcon }> = [
    { value: "light", icon: Sun },
    { value: "dark", icon: Moon },
  ];

  if (includeSystem) {
    options.push({ value: "system", icon: Monitor });
  }

  return (
    <div className={`theme-icon-selector ${includeSystem ? "with-system" : ""}`} role="group" aria-label={labels[value] ?? labels.dark}>
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            className={active ? "active" : ""}
            aria-label={labels[option.value]}
            title={labels[option.value]}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            <Icon size={19} />
          </button>
        );
      })}
    </div>
  );
}

function ProgressSheet({
  goal,
  today,
  copy,
  onClose,
  onSave,
}: {
  goal: ProgressGoal;
  today: string;
  copy: UiCopy;
  onClose: () => void;
  onSave: (amount: number, note?: string) => void;
}) {
  const requiredToday = getRequiredToday(goal, today);
  const loggedToday = getTodayLoggedAmount(goal, today);
  const [amount, setAmount] = useState(String(loggedToday || 0));
  const [note, setNote] = useState("");
  const numericDraftAmount = Number(amount);
  const previewAmount = Number.isFinite(numericDraftAmount) && numericDraftAmount >= 0 ? numericDraftAmount : loggedToday;
  const todayPercent = requiredToday > 0 ? clampPercent((previewAmount / requiredToday) * 100) : getGoalProgressPercent(goal);
  const progressTitle = capitalizeLabel(copy.progress);
  const targetLabel = copy.save === "Save" ? "target" : "цель";
  const todayNeedLabel = copy.save === "Save" ? copy.requiredToday : "Сегодня нужно";
  const progressStyle = {
    "--entry-progress": `${todayPercent}%`,
  } as CSSProperties;

  function adjustAmount(delta: number) {
    setAmount((current) => {
      const numeric = Number(current);
      const next = Math.max((Number.isFinite(numeric) ? numeric : 0) + delta, 0);

      return String(next);
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      return;
    }

    onSave(numericAmount, note);
  }

  return (
    <BottomSheet title={progressTitle} closeLabel={copy.close} onClose={onClose} className="progress-entry-bottom-sheet">
      <form className="progress-entry-form" onSubmit={handleSubmit}>
        <section className="progress-entry-task">
          <div className="progress-entry-task-head">
            <span className="progress-entry-emoji" aria-hidden="true">{getActionEmoji(goal, "📈")}</span>
            <div>
              <h3>{goal.title}</h3>
              <p>{goal.note ? `${goal.note} · ` : ""}{targetLabel} {formatNumber(goal.targetValue)} {goal.unit}</p>
            </div>
          </div>
          <strong>{todayNeedLabel}: {formatNumber(requiredToday)} {goal.unit}</strong>
        </section>

        <div className="progress-entry-fill" style={progressStyle}>
          <span />
          <strong>{formatNumber(previewAmount)} / {formatNumber(requiredToday)} {goal.unit}</strong>
          <em>{formatNumber(todayPercent)}%</em>
        </div>

        <div className="progress-entry-stepper">
          <button type="button" aria-label="minus" onClick={() => adjustAmount(-1)}>
            −
          </button>
          <input
            autoFocus
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0"
          />
          <button type="button" aria-label="plus" onClick={() => adjustAmount(1)}>
            +
          </button>
        </div>

        <label className="progress-entry-note">
          <span>{copy.note}</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={copy.optional} />
        </label>

        <button type="submit" className="progress-entry-save">
          {copy.save}
        </button>
      </form>
    </BottomSheet>
  );
}

function DeleteActionSheet({
  state,
  dateLabel,
  language,
  copy,
  onClose,
  onDeleteToday,
  onDeletePeriod,
}: {
  state: Exclude<DeleteState, null>;
  dateLabel: string;
  language: AppSettings["language"];
  copy: UiCopy;
  onClose: () => void;
  onDeleteToday: () => void;
  onDeletePeriod: () => void;
}) {
  const action = state.type === "goal" ? state.goal : state.task;
  const deleteTodayLabel = language === "en" ? "Only this day" : "Только сегодня";
  const deletePeriodLabel = language === "en" ? "Whole period" : "На весь период";
  const deleteTodayText = language === "en" ? `Hide from ${dateLabel}.` : `Скрыть на ${dateLabel}.`;
  const deletePeriodText = language === "en" ? "Delete the action and all progress." : "Удалить действие и весь прогресс.";

  return (
    <BottomSheet title={copy.deleteActionTitle} subtitle={action.title} closeLabel={copy.close} onClose={onClose}>
      <div className="delete-choice-sheet">
        <button type="button" className="delete-choice-button" onClick={onDeleteToday}>
          <CalendarDays size={18} aria-hidden="true" />
          <span>
            <strong>{deleteTodayLabel}</strong>
            <small>{deleteTodayText}</small>
          </span>
        </button>
        <button type="button" className="delete-choice-button danger" onClick={onDeletePeriod}>
          <Trash2 size={18} aria-hidden="true" />
          <span>
            <strong>{deletePeriodLabel}</strong>
            <small>{deletePeriodText}</small>
          </span>
        </button>
        <button type="button" className="ghost-sheet-button" onClick={onClose}>
          {copy.cancel}
        </button>
      </div>
    </BottomSheet>
  );
}

function TaskActionSheet({
  task,
  completed,
  copy,
  onClose,
  onToggle,
  onEdit,
}: {
  task: TaskItem;
  completed: boolean;
  copy: UiCopy;
  onClose: () => void;
  onToggle: () => void;
  onEdit: () => void;
}) {
  return (
    <BottomSheet title={task.title} subtitle={task.note} closeLabel={copy.close} onClose={onClose}>
      <div className="task-action-sheet">
        <button type="button" className="sheet-row-action primary" onClick={onToggle}>
          <span className="action-emoji" aria-hidden="true">{getActionEmoji(task)}</span>
          {completed ? copy.undoDoneTitle : copy.markDoneTitle}
        </button>
        <button type="button" className="sheet-row-action" onClick={onEdit}>
          <span aria-hidden="true">✎</span>
          {copy.editAction}
        </button>
      </div>
    </BottomSheet>
  );
}

function CarryOverBanner({
  count,
  language,
  onReview,
}: {
  count: number;
  language: AppSettings["language"];
  onReview: () => void;
}) {
  return (
    <section className="carry-over-banner">
      <span>{language === "en" ? `${count} missed from yesterday` : `${count} пропущено вчера`}</span>
      <button type="button" onClick={onReview}>
        {language === "en" ? "Review" : "Разобрать"}
      </button>
    </section>
  );
}

function CarryOverReviewSheet({
  candidates,
  language,
  onClose,
  onMove,
}: {
  candidates: CarryOverCandidate[];
  language: AppSettings["language"];
  onClose: () => void;
  onMove: (selected: CarryOverCandidate[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set(candidates.map((candidate) => (candidate.type === "goal" ? candidate.goal.id : candidate.task.id))));

  function getCandidateId(candidate: CarryOverCandidate): string {
    return candidate.type === "goal" ? candidate.goal.id : candidate.task.id;
  }

  function toggleCandidate(candidate: CarryOverCandidate) {
    const id = getCandidateId(candidate);
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  const selected = candidates.filter((candidate) => selectedIds.has(getCandidateId(candidate)));

  return (
    <BottomSheet
      title={language === "en" ? "Move missed tasks?" : "Перенести пропущенное?"}
      subtitle={language === "en" ? "Create one-time items for today." : "Создадим разовые пункты на сегодня."}
      closeLabel={language === "en" ? "Close" : "Закрыть"}
      onClose={onClose}
    >
      <div className="carry-review-list">
        {candidates.map((candidate) => {
          const action = candidate.type === "goal" ? candidate.goal : candidate.task;
          const id = getCandidateId(candidate);

          return (
            <button key={id} type="button" className={`carry-review-row ${selectedIds.has(id) ? "selected" : ""}`} onClick={() => toggleCandidate(candidate)}>
              <span className="action-emoji" aria-hidden="true">{getActionEmoji(action)}</span>
              <span>
                <strong>{action.title}</strong>
                <small>{candidate.detail}</small>
              </span>
              <span className="carry-check" aria-hidden="true">{selectedIds.has(id) ? "✓" : ""}</span>
            </button>
          );
        })}
      </div>
      <div className="sheet-actions">
        <button type="button" className="primary-sheet-button" disabled={selected.length === 0} onClick={() => onMove(selected)}>
          {language === "en" ? "Move selected to today" : "Перенести выбранное"}
        </button>
        <button type="button" className="ghost-sheet-button" onClick={onClose}>
          {language === "en" ? "Skip" : "Пропустить"}
        </button>
      </div>
    </BottomSheet>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger = false,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div className={`confirm-card ${danger ? "danger" : ""}`} role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(event) => event.stopPropagation()}>
        <div className="confirm-icon">
          {danger ? <Trash2 size={25} /> : <Check size={26} />}
        </div>
        <h2 id="confirm-title">{title}</h2>
        {description && <p className="confirm-description">{description}</p>}
        <div className="sheet-actions">
          <button type="button" className="ghost-sheet-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={`primary-sheet-button ${danger ? "danger-action" : ""}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

type ActionTrackingMode = "done" | "amount";
type ActionPeriod = "today" | "week" | "month" | "custom";
type GoalPeriod = ActionPeriod;
type TaskPeriod = ActionPeriod;

type ActionIconOption = {
  key: string;
  title: string;
  Icon: LucideIcon;
};

type ActionTemplate = {
  group: "progress" | "checklist";
  title: string;
  iconKey: string;
  trackingMode: ActionTrackingMode;
  period: ActionPeriod;
  repeatMode: GoalRepeatMode;
  targetValue?: number;
  unit?: string;
  quickValues?: number[];
  selectedDays?: number[];
  priority?: Priority;
};

const weekdays = [
  { label: "Пн", value: 1 },
  { label: "Вт", value: 2 },
  { label: "Ср", value: 3 },
  { label: "Чт", value: 4 },
  { label: "Пт", value: 5 },
  { label: "Сб", value: 6 },
  { label: "Вс", value: 7 },
];

const weekdaysEn = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 7 },
];

const defaultGoalSelectedDays = [1, 2, 3, 4, 5];

const actionIcons: ActionIconOption[] = [
  { key: "book", title: "Книга", Icon: BookOpen },
  { key: "target", title: "Фокус", Icon: Target },
  { key: "dumbbell", title: "Тренировка", Icon: Dumbbell },
  { key: "run", title: "Бег", Icon: Footprints },
  { key: "home", title: "Дом", Icon: Home },
  { key: "cart", title: "Покупки", Icon: ShoppingCart },
  { key: "language", title: "Язык", Icon: Languages },
  { key: "star", title: "Звезда", Icon: Star },
  { key: "fire", title: "Огонь", Icon: Flame },
  { key: "plus", title: "Плюс", Icon: CirclePlus },
  { key: "graduation", title: "Учеба", Icon: GraduationCap },
  { key: "droplet", title: "Вода", Icon: Droplet },
  { key: "clock", title: "Время", Icon: Clock3 },
  { key: "calendar", title: "Календарь", Icon: CalendarDays },
  { key: "moon", title: "Сон", Icon: Moon },
  { key: "pill", title: "Здоровье", Icon: Pill },
  { key: "shield", title: "Защита", Icon: Shield },
  { key: "phone", title: "Созвон", Icon: Phone },
  { key: "mail", title: "Почта", Icon: Mail },
];

const actionTemplates: ActionTemplate[] = [
  { group: "progress", title: "Английский", iconKey: "language", trackingMode: "amount", targetValue: 30, unit: "уроков", period: "month", repeatMode: "everyDay", quickValues: [1, 2] },
  { group: "progress", title: "Чтение", iconKey: "book", trackingMode: "amount", targetValue: 1000, unit: "страниц", period: "month", repeatMode: "everyDay", quickValues: [10, 25] },
  { group: "progress", title: "Бег", iconKey: "run", trackingMode: "amount", targetValue: 50, unit: "км", period: "month", repeatMode: "weekdays", quickValues: [1, 5] },
  { group: "progress", title: "Тренировки", iconKey: "dumbbell", trackingMode: "amount", targetValue: 20, unit: "тренировок", period: "month", repeatMode: "weekdays", quickValues: [1, 2] },
  { group: "progress", title: "Учеба", iconKey: "graduation", trackingMode: "amount", targetValue: 40, unit: "занятий", period: "month", repeatMode: "everyDay", quickValues: [1, 2] },
  { group: "progress", title: "Вода", iconKey: "droplet", trackingMode: "amount", targetValue: 60, unit: "стаканов", period: "month", repeatMode: "everyDay", quickValues: [1, 2] },
  { group: "progress", title: "Медитация", iconKey: "clock", trackingMode: "amount", targetValue: 300, unit: "минут", period: "month", repeatMode: "everyDay", quickValues: [5, 10] },
  { group: "progress", title: "Проект", iconKey: "target", trackingMode: "amount", targetValue: 30, unit: "задач", period: "month", repeatMode: "weekdays", quickValues: [1, 3] },
  { group: "progress", title: "Книга", iconKey: "book", trackingMode: "amount", targetValue: 300, unit: "страниц", period: "month", repeatMode: "everyDay", quickValues: [10, 20] },
  { group: "progress", title: "Ходьба", iconKey: "run", trackingMode: "amount", targetValue: 150000, unit: "шагов", period: "month", repeatMode: "everyDay", quickValues: [1000, 5000] },
  { group: "checklist", title: "Зарядка", iconKey: "fire", trackingMode: "done", period: "month", repeatMode: "everyDay", priority: "medium" },
  { group: "checklist", title: "Уборка", iconKey: "home", trackingMode: "done", period: "week", repeatMode: "selectedDays", selectedDays: [6], priority: "medium" },
  { group: "checklist", title: "Сходить в магазин", iconKey: "cart", trackingMode: "done", period: "today", repeatMode: "everyDay", priority: "medium" },
  { group: "checklist", title: "Сон до 23:00", iconKey: "moon", trackingMode: "done", period: "month", repeatMode: "everyDay", priority: "medium" },
  { group: "checklist", title: "Витамины", iconKey: "pill", trackingMode: "done", period: "month", repeatMode: "everyDay", priority: "medium" },
  { group: "checklist", title: "План дня", iconKey: "calendar", trackingMode: "done", period: "month", repeatMode: "everyDay", priority: "medium" },
  { group: "checklist", title: "Без сахара", iconKey: "shield", trackingMode: "done", period: "month", repeatMode: "everyDay", priority: "medium" },
  { group: "checklist", title: "Прогулка", iconKey: "run", trackingMode: "done", period: "month", repeatMode: "everyDay", priority: "medium" },
  { group: "checklist", title: "Созвон", iconKey: "phone", trackingMode: "done", period: "week", repeatMode: "selectedDays", selectedDays: [1], priority: "medium" },
  { group: "checklist", title: "Разобрать почту", iconKey: "mail", trackingMode: "done", period: "week", repeatMode: "weekdays", priority: "medium" },
];

const templateEnglishCopy: Record<string, { title: string; unit?: string }> = {
  Английский: { title: "English", unit: "lessons" },
  Чтение: { title: "Reading", unit: "pages" },
  Бег: { title: "Running", unit: "km" },
  Тренировки: { title: "Workouts", unit: "workouts" },
  Учеба: { title: "Study", unit: "sessions" },
  Вода: { title: "Water", unit: "glasses" },
  Медитация: { title: "Meditation", unit: "minutes" },
  Проект: { title: "Project", unit: "tasks" },
  Книга: { title: "Book", unit: "pages" },
  Ходьба: { title: "Walking", unit: "steps" },
  Зарядка: { title: "Morning exercise" },
  Уборка: { title: "Cleaning" },
  "Сходить в магазин": { title: "Grocery run" },
  "Сон до 23:00": { title: "Sleep by 23:00" },
  Витамины: { title: "Vitamins" },
  "План дня": { title: "Day plan" },
  "Без сахара": { title: "No sugar" },
  Прогулка: { title: "Walk" },
  Созвон: { title: "Call" },
  "Разобрать почту": { title: "Inbox cleanup" },
};

function getTemplateTitle(template: ActionTemplate, language: AppSettings["language"]): string {
  return language === "en" ? (templateEnglishCopy[template.title]?.title ?? template.title) : template.title;
}

function getTemplateUnit(template: ActionTemplate, language: AppSettings["language"]): string | undefined {
  return language === "en" ? (templateEnglishCopy[template.title]?.unit ?? template.unit) : template.unit;
}

function AiDraftPreview({
  state,
  labels,
  language,
  onApply,
  onEdit,
  onCancel,
}: {
  state: Exclude<AiPreviewState, null>;
  labels: ReturnType<typeof getAiLabels>;
  language: AppSettings["language"];
  onApply: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const periodLabel = (period: AiPeriod) => {
    if (period === "today") return language === "en" ? "Today" : "Сегодня";
    if (period === "week") return language === "en" ? "Week" : "Неделя";
    if (period === "month") return language === "en" ? "Month" : "Месяц";
    return language === "en" ? "Custom" : "Свой";
  };
  const repeatLabel = (repeat: AiRepeatMode) => {
    if (repeat === "once") return language === "en" ? "Once" : "Один раз";
    if (repeat === "weekdays") return language === "en" ? "Weekdays" : "Будни";
    if (repeat === "selected_days") return language === "en" ? "Selected days" : "Выбранные дни";
    return language === "en" ? "Every day" : "Каждый день";
  };

  return (
    <div className="ai-preview-card">
      <strong>{labels.understood}</strong>
      {state.type === "action" ? (
        <div className="ai-preview-fields">
          <span>
            <b>{state.draft.icon ?? inferAiEmoji(state.draft.title)}</b>
            {state.draft.title}
          </span>
          <small>{labels.tracking}: {state.draft.tracking_type === "quantity" ? labels.quantity : labels.checkbox}</small>
          {state.draft.tracking_type === "quantity" && (
            <small>{labels.target}: {formatNumber(Number(state.draft.target_value ?? 0))} {state.draft.unit}</small>
          )}
          <small>{labels.period}: {periodLabel(state.draft.period)} · {labels.repeat}: {repeatLabel(state.draft.repeat_mode)}</small>
          {state.draft.due_time && <small>{labels.due}: {state.draft.due_time}</small>}
          {state.draft.subitems && state.draft.subitems.length > 0 && <small>{labels.subitems}: {state.draft.subitems.length}</small>}
        </div>
      ) : (
        <div className="ai-preview-fields">
          {state.subitems.map((subitem) => (
            <span key={`${subitem.title}-${subitem.target ?? ""}`}>
              {subitem.title}
              {subitem.target && subitem.target > 1 ? <small>{subitem.target}</small> : null}
            </span>
          ))}
        </div>
      )}
      <div className="ai-preview-actions">
        <button type="button" onClick={onApply}>{labels.apply}</button>
        <button type="button" onClick={onEdit}>{labels.edit}</button>
        <button type="button" onClick={onCancel}>{labels.cancel}</button>
      </div>
    </div>
  );
}

function AddSheet({
  today,
  language,
  copy,
  existingGoals,
  existingTasks,
  onClose,
  onCreateGoal,
  onCreateTask,
}: {
  today: string;
  language: AppSettings["language"];
  copy: UiCopy;
  existingGoals: ProgressGoal[];
  existingTasks: TaskItem[];
  onClose: () => void;
  onCreateGoal: (goal: {
    title: string;
    groupName?: string;
    emoji?: string;
    targetValue: number;
    currentValue: number;
    unit: string;
    startDate: string;
    endDate: string;
    repeatMode: GoalRepeatMode;
    selectedDays?: number[];
    dueTime?: string;
    quickAddValues: number[];
    iconKey?: string;
  }) => void;
  onCreateTask: (task: {
    title: string;
    groupName?: string;
    emoji?: string;
    iconKey?: string;
    priority?: Priority;
    startDate: string;
    endDate: string;
    repeatMode: TaskRepeatMode;
    selectedDays?: number[];
    dueTime?: string;
    subitems?: ActionSubitem[];
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [groupName, setGroupName] = useState("");
  const [iconKey, setIconKey] = useState<string | undefined>(undefined);
  const [emoji, setEmoji] = useState<string | undefined>(undefined);
  const [trackingMode, setTrackingMode] = useState<ActionTrackingMode>("amount");
  const [targetValue, setTargetValue] = useState("");
  const [currentValue, setCurrentValue] = useState("0");
  const [unit, setUnit] = useState("");
  const [period, setPeriod] = useState<ActionPeriod>("month");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 29));
  const [repeatMode, setRepeatMode] = useState<GoalRepeatMode>("everyDay");
  const [selectedDays, setSelectedDays] = useState<number[]>(defaultGoalSelectedDays);
  const [quickValues, setQuickValues] = useState("");
  const [subitemsEnabled, setSubitemsEnabled] = useState(false);
  const [subitemDrafts, setSubitemDrafts] = useState<ActionSubitem[]>([]);
  const [dueTimeEnabled, setDueTimeEnabled] = useState(false);
  const [dueTime, setDueTime] = useState("11:00");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState<"action" | "subitems" | null>(null);
  const [aiPreview, setAiPreview] = useState<AiPreviewState>(null);
  const [aiError, setAiError] = useState("");
  const emojiInputRef = useRef<HTMLInputElement>(null);

  const selectedEmoji = emoji ?? getIconEmoji(iconKey) ?? inferEmojiFromTitle(title);
  const subitemCopy = getSubitemCopy(language);
  const aiLabels = getAiLabels(language);
  const dates = getPeriodDates(today, period, startDate, endDate);
  const numericTarget = Number(targetValue);
  const numericCurrent = Number(currentValue) || 0;
  const normalizedDueTime = dueTimeEnabled ? normalizeDueTimeInput(dueTime) : undefined;
  const taskRepeatMode: TaskRepeatMode = trackingMode === "done" && period === "today" ? "once" : repeatMode;
  const activeSelectedDays = repeatMode === "selectedDays" ? selectedDays : undefined;
  const goalPreview = getGoalSchedulePreview({
    targetValue: numericTarget || 0,
    currentValue: numericCurrent,
    unit,
    startDate: dates.startDate,
    endDate: dates.endDate,
    repeatMode,
    selectedDays: activeSelectedDays,
  });
  const taskPreviewItem: TaskItem = {
    id: "preview-task",
    title: title || (language === "en" ? "Action" : "Действие"),
    priority: "medium",
    startDate: dates.startDate,
    endDate: dates.endDate,
    repeatMode: taskRepeatMode,
    selectedDays: taskRepeatMode === "selectedDays" ? selectedDays : undefined,
    date: dates.startDate,
    completed: false,
    completedDates: [],
  };
  const taskAppearsToday = isTaskDueOnDate(taskPreviewItem, parseDateKey(today), today);
  const baseErrors =
    trackingMode === "amount"
      ? getGoalValidationErrors({
          title,
          targetValue: numericTarget,
          currentValue: numericCurrent,
          unit,
          startDate: dates.startDate,
          endDate: dates.endDate,
          repeatMode,
          selectedDays,
        }, copy)
      : getTaskValidationErrors({
          title,
          startDate: dates.startDate,
          endDate: dates.endDate,
          repeatMode: taskRepeatMode,
          selectedDays,
        }, copy);
  const duplicateError =
    title.trim() && !baseErrors.includes(copy.validationDate) && !baseErrors.includes(copy.validationDays)
      ? hasDuplicateActionForSchedule(
          {
            title,
            startDate: dates.startDate,
            endDate: dates.endDate,
            repeatMode: trackingMode === "amount" ? repeatMode : taskRepeatMode,
            selectedDays: trackingMode === "amount" ? activeSelectedDays : taskRepeatMode === "selectedDays" ? selectedDays : undefined,
          },
          existingGoals,
          existingTasks,
        )
      : false;
  const errors = duplicateError ? [...baseErrors, copy.validationDuplicate] : baseErrors;
  const hasUnsavedChanges =
    title.trim() !== "" ||
    groupName.trim() !== "" ||
    targetValue !== "" ||
    currentValue !== "0" ||
    unit.trim() !== "" ||
    trackingMode !== "amount" ||
    period !== "month" ||
    repeatMode !== "everyDay" ||
    quickValues.trim() !== "" ||
    subitemsEnabled ||
    subitemDrafts.some((subitem) => subitem.title.trim()) ||
    dueTimeEnabled ||
    iconKey !== undefined ||
    emoji !== undefined;

  function applyTemplate(template: ActionTemplate) {
    setTitle(getTemplateTitle(template, language));
    setIconKey(template.iconKey);
    setEmoji(getIconEmoji(template.iconKey) ?? inferEmojiFromTitle(getTemplateTitle(template, language)));
    setTrackingMode(template.trackingMode);
    setPeriod(template.period);
    setRepeatMode(template.repeatMode);
    setSelectedDays(template.selectedDays ?? defaultGoalSelectedDays);
    setTargetValue(template.targetValue ? String(template.targetValue) : "");
    setUnit(getTemplateUnit(template, language) ?? "");
    setCurrentValue("0");
    setQuickValues(template.quickValues?.join(", ") ?? "");
    setSubitemsEnabled(false);
    setSubitemDrafts([]);
    setDueTimeEnabled(false);
    setDueTime("11:00");
    setAdvancedOpen(false);
    setTemplatePickerOpen(false);
    setIconPickerOpen(false);
  }

  function openEmojiInput() {
    setIconPickerOpen(true);
    window.setTimeout(() => emojiInputRef.current?.focus(), 0);
  }

  function changeTrackingMode(nextTrackingMode: ActionTrackingMode) {
    setTrackingMode(nextTrackingMode);

    if (nextTrackingMode === "done") {
      setPeriod("today");
      return;
    }

    if (!targetValue.trim()) {
      setTargetValue("50");
    }

    if (!unit.trim()) {
      setUnit(language === "en" ? "times" : "раз");
    }

    setPeriod("month");
    setSubitemsEnabled(false);
  }

  function addSubitemDraft() {
    setSubitemsEnabled(true);
    setSubitemDrafts((items) => [...items, { id: createId("subitem"), title: "" }]);
  }

  function updateSubitemDraft(id: string, update: Partial<ActionSubitem>) {
    setSubitemDrafts((items) => items.map((item) => (item.id === id ? { ...item, ...update } : item)));
  }

  function removeSubitemDraft(id: string) {
    setSubitemDrafts((items) => items.filter((item) => item.id !== id));
  }

  function toggleWeekdaySelection(day: number) {
    setSelectedDays((days) => toggleWeekday(days, day));
  }

  async function requestAiJson(body: Record<string, unknown>): Promise<unknown> {
    const response = await fetch("/api/ai/parse-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, language }),
    });

    if (!response.ok) {
      throw new Error("AI request failed");
    }

    return response.json();
  }

  async function parseActionWithAi() {
    const text = title.trim();

    if (!text) {
      setAiError(aiLabels.describeFirst);
      return;
    }

    setAiLoading("action");
    setAiError("");

    try {
      const payload = await requestAiJson({ text });
      setAiPreview({ type: "action", draft: normalizeAiActionDraft(payload, text) });
    } catch {
      setAiPreview({ type: "action", draft: buildLocalAiDraft(text) });
    } finally {
      setAiLoading(null);
    }
  }

  async function suggestSubitemsWithAi() {
    const sourceTitle = title.trim();

    if (!sourceTitle) {
      setAiError(aiLabels.describeFirst);
      return;
    }

    setAiLoading("subitems");
    setAiError("");

    try {
      const payload = await requestAiJson({ title: sourceTitle });
      setAiPreview({ type: "subitems", subitems: normalizeAiSubitems(payload, sourceTitle) });
    } catch {
      setAiPreview({ type: "subitems", subitems: buildLocalSubitems(sourceTitle) });
    } finally {
      setAiLoading(null);
    }
  }

  function applyAiActionDraft(draft: AiActionDraft) {
    const nextTrackingMode: ActionTrackingMode = draft.tracking_type === "quantity" ? "amount" : "done";
    const nextPeriod: ActionPeriod = draft.period === "custom" ? "month" : draft.period;
    const nextRepeatMode: GoalRepeatMode =
      draft.repeat_mode === "weekdays" ? "weekdays" : draft.repeat_mode === "selected_days" ? "selectedDays" : "everyDay";
    const nextUnit = draft.unit?.trim() || unit || (language === "en" ? "times" : "раз");
    const normalizedEmoji = normalizeEmojiChoice(draft.icon ?? "") ?? inferAiEmoji(`${draft.title} ${draft.unit ?? ""}`);
    const nextSubitems = normalizeAiSubitems({ subitems: draft.subitems ?? [] }, draft.title).map((subitem, index) => ({
      id: createId("subitem"),
      title: subitem.title,
      targetCount: subitem.target && subitem.target > 1 ? subitem.target : undefined,
      sortOrder: index + 1,
    }));

    setTitle(draft.title);
    setEmoji(normalizedEmoji);
    setIconKey(undefined);
    setTrackingMode(nextTrackingMode);
    setPeriod(nextPeriod);
    setRepeatMode(nextRepeatMode);
    setSelectedDays(defaultGoalSelectedDays);
    setTargetValue(nextTrackingMode === "amount" ? String(draft.target_value && draft.target_value > 0 ? draft.target_value : 50) : "");
    setUnit(nextTrackingMode === "amount" ? nextUnit : "");
    setCurrentValue("0");
    setQuickValues(nextTrackingMode === "amount" ? getDefaultQuickValues(nextUnit).join(", ") : "");
    setDueTimeEnabled(Boolean(draft.due_time));
    setDueTime(draft.due_time ?? "11:00");
    setSubitemsEnabled(nextTrackingMode === "done" && nextSubitems.length > 0);
    setSubitemDrafts(nextTrackingMode === "done" ? nextSubitems : []);
    setAdvancedOpen(false);
    setTemplatePickerOpen(false);
    setIconPickerOpen(false);
    setAiPreview(null);
  }

  function applyAiSubitems(subitems: AiSubitemDraft[]) {
    setTrackingMode("done");
    setSubitemsEnabled(true);
    setSubitemDrafts(
      subitems.map((subitem, index) => ({
        id: createId("subitem"),
        title: subitem.title,
        targetCount: subitem.target && subitem.target > 1 ? subitem.target : undefined,
        sortOrder: index + 1,
      })),
    );
    setAiPreview(null);
  }

  function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (errors.length > 0) {
      return;
    }

    if (trackingMode === "amount") {
      onCreateGoal({
        title,
        groupName: groupName.trim() || undefined,
        emoji: emoji ?? inferEmojiFromTitle(title),
        iconKey,
        targetValue: numericTarget,
        currentValue: numericCurrent,
        unit,
        startDate: dates.startDate,
        endDate: dates.endDate,
        repeatMode,
        selectedDays: activeSelectedDays,
        dueTime: normalizedDueTime,
        quickAddValues: parseQuickValues(quickValues, unit),
      });
      return;
    }

    onCreateTask({
      title,
      groupName: groupName.trim() || undefined,
      emoji: emoji ?? inferEmojiFromTitle(title),
      iconKey,
      priority: "medium",
      startDate: dates.startDate,
      endDate: dates.endDate,
      repeatMode: taskRepeatMode,
      selectedDays: taskRepeatMode === "selectedDays" ? selectedDays : undefined,
      dueTime: normalizedDueTime,
      subitems: subitemsEnabled
        ? subitemDrafts
            .map((subitem) => ({
              ...subitem,
              title: subitem.title.trim(),
              targetCount: subitem.targetCount && subitem.targetCount > 1 ? Math.floor(subitem.targetCount) : undefined,
            }))
            .map((subitem, index) => ({ ...subitem, sortOrder: index + 1 }))
            .filter((subitem) => subitem.title)
        : undefined,
    });
  }

  return (
    <BottomSheet title={copy.addSheetTitle} subtitle={copy.addSheetSubtitle} closeLabel={copy.close} onClose={onClose} closeOnOverlay={!hasUnsavedChanges}>
      {templatePickerOpen && <TemplatePicker templates={actionTemplates} copy={copy} language={language} onSelect={applyTemplate} />}

      <form className="sheet-form creation-form unified-action-form" onSubmit={submitAction}>
        <div className="name-template-row">
          <label>
            <span>{copy.name}</span>
            <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={copy.namePlaceholder} />
          </label>
          <button type="button" className="template-trigger" onClick={() => setTemplatePickerOpen((open) => !open)}>
            {copy.templates}
          </button>
        </div>

        <div className="ai-assist-row">
          <button type="button" className="ai-assist-button" disabled={aiLoading !== null || !title.trim()} onClick={parseActionWithAi}>
            {aiLoading === "action" ? aiLabels.loading : aiLabels.parse}
          </button>
          {aiError && <small className="ai-assist-error">{aiError}</small>}
        </div>

        {aiPreview && (
          <AiDraftPreview
            state={aiPreview}
            labels={aiLabels}
            language={language}
            onApply={() => {
              if (aiPreview.type === "action") {
                applyAiActionDraft(aiPreview.draft);
              } else {
                applyAiSubitems(aiPreview.subitems);
              }
            }}
            onEdit={() => setAiPreview(null)}
            onCancel={() => setAiPreview(null)}
          />
        )}

        <label className="compact-group-field">
          <span>{copy.group}</span>
          <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder={copy.groupPlaceholder} />
        </label>

        <div className="field-group">
          <span>{copy.icon}</span>
          <button type="button" className="icon-picker-trigger emoji-picker-trigger" onClick={openEmojiInput}>
            <span className="emoji-picker-preview" aria-hidden="true">{selectedEmoji ?? "＋"}</span>
            {selectedEmoji ? copy.changeIcon : copy.chooseIcon}
          </button>
          {iconPickerOpen && (
            <EmojiPickerPanel
              value={emoji}
              title={title}
              copy={copy}
              inputRef={emojiInputRef}
              onChange={(nextEmoji) => {
                setEmoji(nextEmoji);
                setIconKey(undefined);
              }}
            />
          )}
        </div>

        <div className="field-group">
          <span>{copy.tracking}</span>
          <div className="segmented-control compact-segment segment-two">
            <button type="button" className={trackingMode === "done" ? "active" : ""} onClick={() => changeTrackingMode("done")}>
              {copy.doneNotDone}
            </button>
            <button type="button" className={trackingMode === "amount" ? "active" : ""} onClick={() => changeTrackingMode("amount")}>
              {copy.countQuantity}
            </button>
          </div>
        </div>

        {trackingMode === "done" && (
          <div className={`subitems-builder ${subitemsEnabled ? "open" : ""}`}>
            <button
              type="button"
              className="subitems-toggle"
              onClick={() => {
                const nextEnabled = !subitemsEnabled;
                setSubitemsEnabled(nextEnabled);

                if (nextEnabled && subitemDrafts.length === 0) {
                  setSubitemDrafts([{ id: createId("subitem"), title: "" }]);
                }

                if (nextEnabled) {
                }
              }}
            >
              <span>{subitemCopy.addList}</span>
              <Plus size={16} aria-hidden="true" />
            </button>
            {subitemsEnabled && (
              <div className="subitems-draft-list">
                <button type="button" className="ai-suggest-subitems-button" disabled={aiLoading !== null || !title.trim()} onClick={suggestSubitemsWithAi}>
                  {aiLoading === "subitems" ? aiLabels.loading : aiLabels.suggestList}
                </button>
                {subitemDrafts.map((subitem) => (
                  <div key={subitem.id} className="subitem-draft-row">
                    <input
                      value={subitem.title}
                      onChange={(event) => updateSubitemDraft(subitem.id, { title: event.target.value })}
                      placeholder={subitemCopy.titlePlaceholder}
                    />
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={subitem.targetCount ?? ""}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        updateSubitemDraft(subitem.id, { targetCount: Number.isFinite(value) && value > 1 ? Math.floor(value) : undefined });
                      }}
                      placeholder={subitemCopy.countPlaceholder}
                      aria-label={subitemCopy.countPlaceholder}
                    />
                    <button type="button" aria-label={subitemCopy.remove} onClick={() => removeSubitemDraft(subitem.id)}>
                      <X size={15} aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <button type="button" className="subitem-add-row" onClick={addSubitemDraft}>
                  <Plus size={15} aria-hidden="true" />
                  {subitemCopy.addItem}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="field-group">
          <span>{copy.repeat}</span>
          <div className="segmented-control compact-segment segment-three">
            <button type="button" className={repeatMode === "everyDay" ? "active" : ""} onClick={() => setRepeatMode("everyDay")}>
              {copy.everyDay}
            </button>
            <button type="button" className={repeatMode === "weekdays" ? "active" : ""} onClick={() => setRepeatMode("weekdays")}>
              {copy.weekdays}
            </button>
            <button type="button" className={repeatMode === "selectedDays" ? "active" : ""} onClick={() => setRepeatMode("selectedDays")}>
              {copy.selectedDays}
            </button>
          </div>
        </div>
        {repeatMode === "selectedDays" && <WeekdayChips selectedDays={selectedDays} language={language} onToggle={toggleWeekdaySelection} />}

        <div className="field-group">
          <span>{copy.period}</span>
          <div className="segmented-control compact-segment segment-four">
            <button type="button" className={period === "today" ? "active" : ""} onClick={() => setPeriod("today")}>
              {copy.today}
            </button>
            <button type="button" className={period === "week" ? "active" : ""} onClick={() => setPeriod("week")}>
              {copy.weekOption}
            </button>
            <button type="button" className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>
              {copy.monthOption}
            </button>
            <button type="button" className={period === "custom" ? "active" : ""} onClick={() => setPeriod("custom")}>
              {copy.custom}
            </button>
          </div>
        </div>
        {period === "custom" && (
          <div className="date-grid">
            <label>
              <span>{copy.startDate}</span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label>
              <span>{copy.endDate}</span>
              <input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
        )}

        <div className={`due-time-builder ${dueTimeEnabled ? "open" : ""}`}>
          <button type="button" className="due-time-toggle" onClick={() => setDueTimeEnabled((enabled) => !enabled)}>
            <span>{copy.addDueTime}</span>
            <Clock3 size={16} aria-hidden="true" />
          </button>
          {dueTimeEnabled && (
            <label className="due-time-row">
              <span>{copy.dueBefore}</span>
              <input type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} />
            </label>
          )}
        </div>

        {trackingMode === "amount" && (
          <>
            <div className="date-grid compact-two-column">
              <label>
                <span>{copy.total}</span>
                <input type="number" min="1" step="any" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} placeholder="50" />
              </label>
              <label>
                <span>{copy.unit}</span>
                <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder={copy.unitPlaceholder} />
              </label>
            </div>
            <AdvancedSection label={copy.advanced} open={advancedOpen} onToggle={() => setAdvancedOpen((open) => !open)}>
              <div className="date-grid">
                <label>
                  <span>{copy.alreadyDone}</span>
                  <input type="number" min="0" step="any" value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} placeholder="0" />
                </label>
                <label>
                  <span>{copy.quickButtons}</span>
                  <input value={quickValues} onChange={(event) => setQuickValues(event.target.value)} placeholder="+1, +5" />
                </label>
              </div>
            </AdvancedSection>
          </>
        )}

        <div className="sheet-summary preview-card">
          <span>{copy.preview}</span>
          {trackingMode === "amount" ? (
            <>
              <PreviewRow icon={<Flame size={16} />} label={copy.inDay} value={`${formatNumber(goalPreview.neededPerDay)} ${unit || copy.unit}`} />
              <PreviewRow icon={<CalendarDays size={16} />} label={copy.inWeek} value={`${formatNumber(goalPreview.neededPerWeek)} ${unit || copy.unit}`} />
              <PreviewRow icon={<BarChart3 size={16} />} label={copy.period} value={getPeriodSummary(period, dates.startDate, dates.endDate, language)} />
              {normalizedDueTime && <PreviewRow icon={<Clock3 size={16} />} label={copy.dueBefore} value={normalizedDueTime} />}
            </>
          ) : (
            <>
              <PreviewRow icon={<CalendarDays size={16} />} label={copy.period} value={getPeriodSummary(period, dates.startDate, dates.endDate, language)} />
              <PreviewRow icon={<TrendingUp size={16} />} label={copy.repeat} value={getActionRepeatLabel(period, repeatMode, language)} />
              <PreviewRow icon={<Check size={16} />} label={copy.format} value={copy.doneNotDone} />
              {normalizedDueTime && <PreviewRow icon={<Clock3 size={16} />} label={copy.dueBefore} value={normalizedDueTime} />}
            </>
          )}
        </div>

        <ValidationMessages errors={errors} />
        <div className="sheet-actions creation-actions single-action">
          <button type="submit" className="primary-sheet-button" disabled={errors.length > 0}>
            {copy.save}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}

function TemplatePicker({
  templates,
  copy,
  language,
  onSelect,
}: {
  templates: ActionTemplate[];
  copy: UiCopy;
  language: AppSettings["language"];
  onSelect: (template: ActionTemplate) => void;
}) {
  const progressTemplates = templates.filter((template) => template.group === "progress");
  const checklistTemplates = templates.filter((template) => template.group === "checklist");
  const mixedTemplates = Array.from({ length: Math.max(progressTemplates.length, checklistTemplates.length) }).flatMap((_, index) =>
    [progressTemplates[index], checklistTemplates[index]].filter((template): template is ActionTemplate => Boolean(template)),
  );

  return (
    <div className="template-picker">
      <TemplateGroup templates={mixedTemplates} language={language} onSelect={onSelect} />
    </div>
  );
}

function TemplateGroup({
  templates,
  language,
  onSelect,
}: {
  templates: ActionTemplate[];
  language: AppSettings["language"];
  onSelect: (template: ActionTemplate) => void;
}) {
  return (
    <div className="template-section">
      <div className="template-list">
        {templates.map((template) => {
          const title = getTemplateTitle(template, language);
          const unit = getTemplateUnit(template, language);
          const summary =
            template.trackingMode === "amount"
              ? `${formatNumber(template.targetValue ?? 0)} ${unit ?? ""} · ${getPeriodSummary(template.period, "", "", language)}`
              : `${getPeriodSummary(template.period, "", "", language)} · ${getActionRepeatLabel(template.period, template.repeatMode, language)}`;

          return (
            <button key={`${template.group}-${template.title}`} type="button" className="template-button" onClick={() => onSelect(template)}>
              <span className="template-icon" aria-hidden="true">
                {getIconEmoji(template.iconKey) ?? inferEmojiFromTitle(title) ?? "✅"}
              </span>
              <span>
                <strong>{title}</strong>
                <small>{summary}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreviewRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="preview-row">
      <span className="preview-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}:</span>
      <strong>{value}</strong>
    </div>
  );
}

function AdvancedSection({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`advanced-section ${open ? "open" : ""}`}>
      <button type="button" className="advanced-toggle" onClick={onToggle}>
        <span>{label}</span>
        <ChevronRight size={16} />
      </button>
      {open && <div className="advanced-content">{children}</div>}
    </div>
  );
}

function WeekdayChips({
  selectedDays,
  language,
  onToggle,
}: {
  selectedDays: number[];
  language: AppSettings["language"];
  onToggle: (day: number) => void;
}) {
  const options = language === "en" ? weekdaysEn : weekdays;
  const ariaLabel = language === "en" ? "Selected days" : "Выбранные дни";

  return (
    <div className="weekday-grid" aria-label={ariaLabel}>
      {options.map((day) => (
        <button
          key={day.value}
          type="button"
          className={selectedDays.includes(day.value) ? "active" : ""}
          onClick={() => onToggle(day.value)}
        >
          {day.label}
        </button>
      ))}
    </div>
  );
}

function ValidationMessages({ errors }: { errors: string[] }) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="validation-list" role="status">
      {errors.map((error) => (
        <span key={error}>{error}</span>
      ))}
    </div>
  );
}

function getGoalValidationErrors(goal: {
  title: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  startDate: string;
  endDate: string;
  repeatMode: GoalRepeatMode;
  selectedDays: number[];
}, copy: UiCopy): string[] {
  const errors: string[] = [];

  if (!goal.title.trim()) {
    errors.push(copy.validationTitle);
  }

  if (!Number.isFinite(goal.targetValue) || goal.targetValue <= 0) {
    errors.push(copy.validationPositive);
  }

  if (!goal.unit.trim()) {
    errors.push(copy.validationUnit);
  }

  if (!Number.isFinite(goal.currentValue) || goal.currentValue < 0) {
    errors.push(copy.validationCurrent);
  }

  if (goal.endDate < goal.startDate) {
    errors.push(copy.validationDate);
  }

  if (goal.repeatMode === "selectedDays" && goal.selectedDays.length === 0) {
    errors.push(copy.validationDays);
  }

  return errors;
}

function getTaskValidationErrors(task: {
  title: string;
  startDate: string;
  endDate: string;
  repeatMode: TaskRepeatMode;
  selectedDays: number[];
}, copy: UiCopy): string[] {
  const errors: string[] = [];

  if (!task.title.trim()) {
    errors.push(copy.validationTitle);
  }

  if (task.endDate < task.startDate) {
    errors.push(copy.validationDate);
  }

  if (task.repeatMode === "selectedDays" && task.selectedDays.length === 0) {
    errors.push(copy.validationDays);
  }

  return errors;
}

function hasDuplicateActionForSchedule(
  candidate: {
    title: string;
    startDate: string;
    endDate: string;
    repeatMode: GoalRepeatMode | TaskRepeatMode;
    selectedDays?: number[];
  },
  goals: ProgressGoal[],
  tasks: TaskItem[],
): boolean {
  const normalizedTitle = normalizeActionTitle(candidate.title);

  if (!normalizedTitle || candidate.startDate > candidate.endDate) {
    return false;
  }

  const goalMatches = goals.some((goal) => {
    if (normalizeActionTitle(goal.title) !== normalizedTitle) {
      return false;
    }

    return schedulesOverlapOnDueDate(candidate, {
      startDate: goal.startDate,
      endDate: goal.endDate,
      repeatMode: goal.repeatMode,
      selectedDays: goal.selectedDays,
    });
  });

  if (goalMatches) {
    return true;
  }

  return tasks.some((task) => {
    if (normalizeActionTitle(task.title) !== normalizedTitle) {
      return false;
    }

    return schedulesOverlapOnDueDate(candidate, {
      startDate: task.startDate,
      endDate: task.endDate,
      repeatMode: task.repeatMode,
      selectedDays: task.selectedDays,
    });
  });
}

function schedulesOverlapOnDueDate(
  first: {
    startDate: string;
    endDate: string;
    repeatMode: GoalRepeatMode | TaskRepeatMode;
    selectedDays?: number[];
  },
  second: {
    startDate: string;
    endDate: string;
    repeatMode: GoalRepeatMode | TaskRepeatMode;
    selectedDays?: number[];
  },
): boolean {
  const startDate = first.startDate > second.startDate ? first.startDate : second.startDate;
  const endDate = first.endDate < second.endDate ? first.endDate : second.endDate;

  if (startDate > endDate) {
    return false;
  }

  let cursor = startDate;
  let guard = 0;

  while (cursor <= endDate && guard < 3700) {
    const date = parseDateKey(cursor);

    if (isScheduleDueOnDate(first, date, cursor) && isScheduleDueOnDate(second, date, cursor)) {
      return true;
    }

    cursor = addDays(cursor, 1);
    guard += 1;
  }

  return false;
}

function isScheduleDueOnDate(
  schedule: {
    startDate: string;
    endDate: string;
    repeatMode: GoalRepeatMode | TaskRepeatMode;
    selectedDays?: number[];
  },
  date: Date,
  dateKey: string,
): boolean {
  if (schedule.repeatMode === "once") {
    return dateKey === schedule.startDate;
  }

  return isGoalDueOnDate(
    {
      id: "schedule-check",
      title: "",
      iconType: "letter",
      targetValue: 1,
      currentValue: 0,
      unit: "",
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      repeatMode: schedule.repeatMode,
      selectedDays: schedule.selectedDays,
      quickAddValues: [],
      progressEntries: [],
    },
    date,
    dateKey,
  );
}

function getRepeatLabel(repeatMode: TaskRepeatMode | GoalRepeatMode, language: AppSettings["language"] = "ru"): string {
  const copy = uiCopy[language];

  if (repeatMode === "once") {
    return copy.repeatOnce;
  }

  if (repeatMode === "weekdays") {
    return copy.weekdays;
  }

  if (repeatMode === "selectedDays") {
    return copy.selectedDays;
  }

  return copy.everyDay;
}

function getPriorityLabel(priority: Priority, language: AppSettings["language"] = "ru"): string {
  const copy = uiCopy[language];

  if (priority === "low") {
    return copy.lowPriority;
  }

  if (priority === "high") {
    return copy.highPriority;
  }

  return copy.mediumPriority;
}

function getActionIcon(iconKey: string): ActionIconOption {
  return actionIcons.find((icon) => icon.key === iconKey) ?? actionIcons[actionIcons.length - 1];
}

function getActionRepeatLabel(period: ActionPeriod, repeatMode: GoalRepeatMode, language: AppSettings["language"] = "ru"): string {
  const copy = uiCopy[language];

  if (period === "today") {
    return copy.today;
  }

  return getRepeatLabel(repeatMode, language);
}

function toggleWeekday(days: number[], day: number): number[] {
  if (days.includes(day)) {
    return days.filter((value) => value !== day);
  }

  return [...days, day].sort((a, b) => a - b);
}

function getPeriodSummary(period: GoalPeriod | TaskPeriod, startDate: string, endDate: string, language: AppSettings["language"] = "ru"): string {
  const copy = uiCopy[language];

  if (period === "today") {
    return copy.today;
  }

  if (period === "week") {
    return language === "en" ? "1 week" : "1 неделя";
  }

  if (period === "month") {
    return language === "en" ? "1 month" : "1 месяц";
  }

  return `${formatDateLabel(startDate)} — ${formatDateLabel(endDate)}`;
}

function getPeriodDates(today: string, period: GoalPeriod, customStart: string, customEnd: string) {
  if (period === "today") {
    return {
      startDate: today,
      endDate: today,
    };
  }

  if (period === "week") {
    return {
      startDate: today,
      endDate: addDays(today, 6),
    };
  }

  if (period === "month") {
    return {
      startDate: today,
      endDate: addDays(today, 29),
    };
  }

  return {
    startDate: customStart,
    endDate: customEnd,
  };
}

function getTaskPeriodDates(today: string, period: TaskPeriod, customStart: string, customEnd: string) {
  if (period === "today") {
    return {
      startDate: today,
      endDate: today,
    };
  }

  if (period === "week") {
    return {
      startDate: today,
      endDate: addDays(today, 6),
    };
  }

  if (period === "month") {
    return {
      startDate: today,
      endDate: addDays(today, 29),
    };
  }

  return {
    startDate: customStart,
    endDate: customEnd,
  };
}

function BottomSheet({
  title,
  subtitle,
  children,
  onClose,
  closeLabel = "Close",
  closeOnOverlay = true,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  closeLabel?: string;
  closeOnOverlay?: boolean;
  className?: string;
}) {
  return (
    <div className="modal-overlay sheet-overlay" role="presentation" onClick={closeOnOverlay ? onClose : undefined}>
      <div className={`bottom-sheet ${className ?? ""}`} role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div>
            <h2 id="sheet-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="sheet-close" aria-label={closeLabel} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
