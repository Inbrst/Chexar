import {
  ArrowLeft,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Clock3,
  Database,
  Droplet,
  Dumbbell,
  ExternalLink,
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
  Send,
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
import type { CSSProperties, FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
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
  getTodayLoggedAmount,
  getWeekRange,
  getWeekAverageCompletion,
  isGoalDueOnDate,
  isTaskCompletedOnDate,
  isTaskDueOnDate,
  upsertDailyRecord,
} from "./calculations";
import { addDays, parseDateKey, todayKey, toDateKey } from "./dateUtils";
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
import type { AppScreen, AppSettings, AppState, GoalRepeatMode, Priority, ProgressEntry, ProgressGoal, TaskItem, TaskRepeatMode } from "./types";
import { mergeDuplicateActions, normalizeActionTitle } from "./actionMerge";
import { hasRemotePersistence, loadRemoteData, saveRemoteSnapshot } from "./supabaseData";
import { getTelegramUserId, initTelegramWebApp } from "./lib/telegram";

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
    progress: "Progress",
    checklist: "Checklist",
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
    progress: "Прогресс",
    checklist: "Чек-лист",
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
    editAction: "Edit action",
    addProgress: "Add progress",
    requiredToday: "Required today",
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
    templates: "Templates",
    icon: "Icon",
    changeIcon: "Change icon",
    chooseIcon: "Choose icon",
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
    advanced: "More",
    progressTemplates: "With progress",
    checklistTemplates: "Checklist",
    validationTitle: "Add an action name.",
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
    templates: "Шаблоны",
    icon: "Иконка",
    changeIcon: "Изменить иконку",
    chooseIcon: "Выбрать иконку",
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
    advanced: "Дополнительно",
    progressTemplates: "С прогрессом",
    checklistTemplates: "Чек-лист",
    validationTitle: "Добавьте название действия.",
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

type CalendarDayDetail = {
  id: string;
  title: string;
  detail?: string;
};

type CalendarDayDetails = {
  percent: number;
  completed: CalendarDayDetail[];
  remaining: CalendarDayDetail[];
  missed: CalendarDayDetail[];
  progressEntries: CalendarDayDetail[];
  hasData: boolean;
};

type ProgressPeriod = "week" | "month" | "year" | "period";
type CalendarFilterMode = "all" | "activity" | "closed" | "partial" | "missed";

type ProgressChartPoint = {
  label: string;
  value: number;
  hasData: boolean;
};

type ProgressActionRank = {
  id: string;
  title: string;
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
  const dueGoals = appState.goals.filter((goal) => isGoalDueOnDate(goal, date, dateKey));
  const dueTasks = appState.tasks.filter((task) => isTaskDueOnDate(task, date, dateKey));
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

  const computedPercent = getDailyCompletionPercent(date, appState.goals, appState.tasks);
  const percent = dateKey === today ? todayPercent : (record?.percent ?? computedPercent);
  const hasActivity =
    appState.goals.some((goal) => goal.progressEntries.some((entry) => entry.date === dateKey)) ||
    appState.tasks.some((task) => isTaskCompletedOnDate(task, dateKey));
  const hasData = dueGoals.length + dueTasks.length > 0 || hasActivity || Boolean(record);

  return {
    percent,
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
      iconKey: task.iconKey,
      percent: dueDates.length === 0 ? 0 : clampPercent((completed / dueDates.length) * 100),
      dueCount: dueDates.length,
    };
  });

  return [...goalRanks, ...taskRanks]
    .filter((rank) => rank.dueCount > 0)
    .sort((left, right) => right.percent - left.percent)
    .slice(0, 3)
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
    .map((task, index) => ({ task, index, completed: isTaskCompletedOnDate(task, dateKey) }))
    .sort((first, second) => {
      if (first.completed !== second.completed) {
        return first.completed ? 1 : -1;
      }

      return first.index - second.index;
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

      return first.index - second.index;
    })
    .map((item) => item.goal);
}

export default function App() {
  const today = useMemo(() => todayKey(), []);
  const [appState, setAppState] = useState<AppState>(() => loadAppState());
  const [dayRecords, setDayRecords] = useState(() => loadDailyRecords());
    const [progressSheet, setProgressSheet] = useState<ProgressSheetState>(null);
    const [confirmState, setConfirmState] = useState<ConfirmState>(null);
    const [deleteState, setDeleteState] = useState<DeleteState>(null);
    const [editState, setEditState] = useState<EditState>(null);
    const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [viewAllSheet, setViewAllSheet] = useState<ViewAllState>(null);
  const [activeScreen, setActiveScreen] = useState<AppScreen>("today");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    hasRemotePersistence() ? "loading" : import.meta.env.PROD ? "missing-env" : "local",
  );
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const activeProfileCopy = profileCopy[settings.language];
  const activeUiCopy = uiCopy[settings.language];
  const activeDate = getActiveDate(selectedDate, today);
  const activeDateDate = useMemo(() => parseDateKey(activeDate), [activeDate]);
  const activeDateLabel = useMemo(() => formatTodayDate(activeDateDate, settings.language), [activeDateDate, settings.language]);
  const isSelectedDateMode = selectedDate !== null;
  const selectedDateNote =
    selectedDate && activeDate > today
      ? activeUiCopy.plannedDay
      : selectedDate && activeDate < today
        ? activeUiCopy.pastDay
        : undefined;
  const isTelegramMiniApp = Boolean(getTelegramUserId());

  const daily = useMemo(
    () => calculateDailyProgress(appState.goals, appState.tasks, activeDate),
    [activeDate, appState.goals, appState.tasks],
  );
  const actualTodayDaily = useMemo(
    () => (activeDate === today ? daily : calculateDailyProgress(appState.goals, appState.tasks, today)),
    [activeDate, appState.goals, appState.tasks, daily, today],
  );
  const miniStats = useMemo(() => {
    return {
      weekPercent: getWeekAverageCompletion(activeDateDate, appState.goals, appState.tasks),
      monthPercent: getMonthAverageCompletion(activeDateDate, appState.goals, appState.tasks),
      streak: getCurrentStreak(activeDateDate, appState.goals, appState.tasks),
    };
  }, [activeDateDate, appState.goals, appState.tasks]);
  const todayGoals = useMemo(
    () => appState.goals.filter((goal) => isGoalDueOnDate(goal, activeDateDate, activeDate)),
    [activeDate, activeDateDate, appState.goals],
  );
  const todayTasks = useMemo(
    () => appState.tasks.filter((task) => isTaskDueOnDate(task, activeDateDate, activeDate)),
    [activeDate, activeDateDate, appState.tasks],
  );
  const sortedTodayGoals = useMemo(() => sortGoalsForToday(todayGoals, activeDate), [activeDate, todayGoals]);
  const visibleTodayTasks = useMemo(() => sortTasksForToday(dedupeTodayTasks(todayTasks, activeDate), activeDate), [activeDate, todayTasks]);
  const hasActiveDateItems = sortedTodayGoals.length > 0 || visibleTodayTasks.length > 0;
  const viewAllGoals = useMemo(
    () => appState.goals.filter((goal) => isGoalDueOnDate(goal, activeDateDate, activeDate) || goal.currentValue >= goal.targetValue),
    [activeDate, activeDateDate, appState.goals],
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
      setViewAllSheet(null);
    setSelectedDate(null);
    setActiveScreen("today");
  }

    function deleteAction() {
      if (!deleteState) {
        return;
      }

    if (deleteState.type === "goal") {
      setAppState((state) => ({
        ...state,
        goals: state.goals.filter((goal) => goal.id !== deleteState.goal.id),
      }));
    } else {
      setAppState((state) => ({
        ...state,
        tasks: state.tasks.filter((task) => task.id !== deleteState.task.id),
      }));
    }

      setDeleteState(null);
    }

    function updateGoal(
      goalId: string,
      update: {
        title: string;
        note?: string;
        iconKey?: string;
        repeatMode: GoalRepeatMode;
        selectedDays?: number[];
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
                  note: update.note?.trim() || undefined,
                  iconType: update.iconKey === "book" ? "book" : update.iconKey ? "custom" : "letter",
                  iconKey: update.iconKey,
                  targetValue: update.targetValue,
                  currentValue: update.currentValue,
                  unit: update.unit.trim(),
                  repeatMode: update.repeatMode,
                  selectedDays: update.repeatMode === "selectedDays" ? update.selectedDays : undefined,
                  quickAddValues: update.quickAddValues,
                }
              : goal,
          ),
        }),
      );
    }

    function updateTask(taskId: string, update: { title: string; note?: string; iconKey?: string; repeatMode: TaskRepeatMode; selectedDays?: number[] }) {
      setAppState((state) =>
        mergeDuplicateActions({
          ...state,
          tasks: state.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  title: update.title.trim(),
                  note: update.note?.trim() || undefined,
                  iconType: update.iconKey ? "custom" : "letter",
                  iconKey: update.iconKey,
                  repeatMode: update.repeatMode,
                  selectedDays: update.repeatMode === "selectedDays" ? update.selectedDays : undefined,
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

    setAppState((state) => ({
      ...state,
      goals: state.goals.map((goal) =>
        goal.id === goalId
          ? {
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
            }
          : goal,
      ),
    }));
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

        return {
          ...task,
          completed: completedDates.has(today),
          completedDates: Array.from(completedDates).sort(),
        };
      }),
    }));
  }

  function createGoal(goal: {
    title: string;
    iconKey?: string;
    targetValue: number;
    currentValue: number;
    unit: string;
    startDate: string;
    endDate: string;
    repeatMode: GoalRepeatMode;
    selectedDays?: number[];
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
          iconType: goal.iconKey === "book" ? "book" : goal.iconKey ? "custom" : "letter",
          iconKey: goal.iconKey,
          targetValue: goal.targetValue,
          currentValue: goal.currentValue,
          unit,
          startDate: goal.startDate,
          endDate: goal.endDate,
          repeatMode: goal.repeatMode,
          selectedDays: goal.repeatMode === "selectedDays" ? goal.selectedDays : undefined,
          quickAddValues: goal.quickAddValues,
          progressEntries: initialEntry,
        },
      ],
    }));
  }

  function createTask(task: {
    title: string;
    iconKey?: string;
    priority?: Priority;
    startDate: string;
    endDate: string;
    repeatMode: TaskRepeatMode;
    selectedDays?: number[];
  }) {
    setAppState((state) => ({
      ...state,
      tasks: [
        ...state.tasks,
        {
          id: createId("task"),
          title: task.title.trim(),
          iconType: task.iconKey ? "custom" : "letter",
          iconKey: task.iconKey,
          priority: task.priority,
          startDate: task.startDate,
          endDate: task.endDate,
          repeatMode: task.repeatMode,
          selectedDays: task.repeatMode === "selectedDays" ? task.selectedDays : undefined,
          date: task.startDate,
          completed: false,
          completedDates: [],
        },
      ],
    }));
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
              isTelegramMiniApp={isTelegramMiniApp}
              onSettingsChange={(nextSettings) => setSettings((current) => ({ ...current, ...nextSettings }))}
              onResetRequest={() => setResetConfirmOpen(true)}
            />
          ) : activeScreen === "calendar" ? (
            <CalendarScreen
              appState={appState}
              dayRecords={dayRecords}
              today={today}
              todayPercent={actualTodayDaily.percent}
              streak={miniStats.streak}
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
                dateNote={selectedDateNote}
                selectedMode={isSelectedDateMode}
                onBackToCalendar={returnToCalendar}
                onAdd={() => setAddSheetOpen(true)}
              />
              <RhythmCard
                daily={daily}
                trend={rhythmTrend}
                copy={activeUiCopy}
                dateLabel={activeDateLabel}
                language={settings.language}
              />
              <MiniStatsPanel
                weekPercent={miniStats.weekPercent}
                monthPercent={miniStats.monthPercent}
                streak={miniStats.streak}
                copy={activeUiCopy}
                language={settings.language}
              />

              {isSelectedDateMode && !hasActiveDateItems ? (
                <section className="section-block">
                  <EmptySectionCard
                    title={activeUiCopy.emptySelectedDayTitle}
                    text={activeUiCopy.emptySelectedDayText}
                    buttonLabel={activeUiCopy.add}
                    onAdd={() => setAddSheetOpen(true)}
                  />
                </section>
              ) : (
                <>
                  <section className="section-block">
                    <SectionHeader title={activeUiCopy.checklistSection} />
                    <div className="task-list">
                      {visibleTodayTasks.length > 0 ? visibleTodayTasks.map((task) => {
                        const completedToday = isTaskCompletedOnDate(task, activeDate);

                        return (
                          <TaskRow
                            key={task.id}
                            task={task}
                              completed={completedToday}
                              isToday={activeDate === today}
                              deleteLabel={activeUiCopy.deleteConfirm}
                              editLabel={activeUiCopy.editAction}
                              toggleLabel={completedToday ? activeUiCopy.undoDoneTitle : activeUiCopy.markDoneTitle}
                              onClick={() =>
                              setConfirmState({
                                task,
                                nextCompleted: !completedToday,
                              })
                            }
                            onDelete={() => setDeleteState({ type: "task", task })}
                            onEdit={() => setEditState({ type: "task", task })}
                          />
                        );
                      }) : (
                        <EmptySectionCard title={activeUiCopy.emptyChecklistTitle} text={activeUiCopy.emptyChecklistText} buttonLabel={activeUiCopy.add} onAdd={() => setAddSheetOpen(true)} />
                      )}
                    </div>
                  </section>

                  <section className="section-block">
                      <SectionHeader title={activeUiCopy.progressSection} />
                      <div className="goal-list">
                        {sortedTodayGoals.length > 0 ? sortedTodayGoals.map((goal) => (
                          <GoalCard
                            key={goal.id}
                            goal={goal}
                          today={activeDate}
                            copy={activeUiCopy}
                            onOpenManual={() => setProgressSheet({ goal })}
                            onDelete={() => setDeleteState({ type: "goal", goal })}
                            onEdit={() => setEditState({ type: "goal", goal })}
                          />
                      )) : (
                        <EmptySectionCard title={activeUiCopy.emptyProgressTitle} text={activeUiCopy.emptyProgressText} buttonLabel={activeUiCopy.add} onAdd={() => setAddSheetOpen(true)} />
                      )}
                    </div>
                  </section>
                </>
              )}
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
                addProgress(progressSheet.goal.id, amount, note);
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

            {deleteState && (
              <ConfirmDialog
                title={activeUiCopy.deleteActionTitle}
              description={activeUiCopy.deleteActionText}
              confirmLabel={activeUiCopy.deleteConfirm}
              cancelLabel={activeUiCopy.cancel}
              danger
              onCancel={() => setDeleteState(null)}
                onConfirm={deleteAction}
              />
            )}

            {editState && (
              <EditActionSheet
                state={editState}
                copy={activeUiCopy}
                language={settings.language}
                onClose={() => setEditState(null)}
                onSave={(update) => {
                  if (editState.type === "goal") {
                    updateGoal(editState.goal.id, {
                      title: update.title,
                      note: update.note,
                      iconKey: update.iconKey,
                      repeatMode: update.repeatMode as GoalRepeatMode,
                      selectedDays: update.selectedDays,
                      targetValue: update.targetValue ?? editState.goal.targetValue,
                      currentValue: update.currentValue ?? editState.goal.currentValue,
                      unit: update.unit ?? editState.goal.unit,
                      quickAddValues: update.quickAddValues ?? editState.goal.quickAddValues,
                    });
                  } else {
                    updateTask(editState.task.id, {
                      title: update.title,
                      note: update.note,
                      iconKey: update.iconKey,
                      repeatMode: update.repeatMode,
                      selectedDays: update.selectedDays,
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

          {viewAllSheet && (
            <ViewAllSheet
              type={viewAllSheet}
              today={activeDate}
              goals={viewAllGoals}
              tasks={visibleTodayTasks}
              copy={activeUiCopy}
              onClose={() => setViewAllSheet(null)}
              onOpenManual={(goal) => {
                setViewAllSheet(null);
                setProgressSheet({ goal });
              }}
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
  dateNote,
  selectedMode = false,
  onBackToCalendar,
  onAdd,
}: {
  copy: UiCopy;
  dateNote?: string;
  selectedMode?: boolean;
  onBackToCalendar?: () => void;
  onAdd: () => void;
}) {
  return (
    <header className="hero-header">
      <div>
        {selectedMode && onBackToCalendar ? (
          <button type="button" className="calendar-back-button" onClick={onBackToCalendar}>
            <ArrowLeft size={16} aria-hidden="true" />
            {copy.backToCalendar}
          </button>
        ) : (
          <p className="brand">Chexar</p>
        )}
        {dateNote && <p className="selected-date-note">{dateNote}</p>}
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
  dateLabel,
  language,
}: {
  daily: ReturnType<typeof calculateDailyProgress>;
  trend: number[];
  copy: UiCopy;
  dateLabel: string;
  language: AppSettings["language"];
}) {
  const cardStyle = { "--daily-percent": `${daily.percent}%` } as CSSProperties;

  return (
    <section
      className="rhythm-card"
      style={cardStyle}
      aria-label={copy.rhythmAria}
    >
      <div className="rhythm-fill" />
      <div className="rhythm-main">
        <div className="rhythm-label-row">
          <span className="eyebrow">{copy.rhythmTitle}</span>
          <span className="eyebrow rhythm-date">{dateLabel}</span>
        </div>
        <strong>{daily.percent}%</strong>
        <p>{copy.actionsCount(daily.completedTodayItems, daily.totalTodayItems)}</p>
      </div>
      <div className="rhythm-summary">
        <span className="chip">{getLocalizedDayStatus(daily.percent, language)}</span>
        <MiniRhythmChart values={trend} ariaLabel={copy.rhythmTrendAria} />
        <div className="summary-stack">
          <span>{copy.left}</span>
          <em>{daily.remainingItems}</em>
        </div>
      </div>
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
          <stop offset="0%" stopColor="#8f77ff" />
          <stop offset="100%" stopColor="#7fddff" />
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
  onOpenManual,
  onDelete,
  onEdit,
}: {
  goal: ProgressGoal;
  today: string;
  copy: UiCopy;
  onOpenManual: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  const progressPercent = getGoalProgressPercent(goal);
  const requiredToday = getRequiredToday(goal, today);
  const loggedToday = getTodayLoggedAmount(goal, today);
  const isGoalCompleted = goal.currentValue >= goal.targetValue;
  const isTodayDone = isGoalCompleted || loggedToday >= requiredToday;
  const progressStyle = { "--goal-progress": `${progressPercent}%` } as CSSProperties;

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenManual();
    }
  }

  return (
    <SwipeDeleteShell deleteLabel={copy.deleteConfirm} editLabel={copy.editAction} onDelete={onDelete} onEdit={onEdit} onTap={onOpenManual}>
      <article
        className={`goal-card ${isTodayDone ? "is-done" : ""} ${isGoalCompleted ? "is-complete" : ""}`}
        role="button"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className="goal-top">
          <ActionIconBadge className="goal-icon" iconKey={goal.iconKey ?? (goal.iconType === "book" ? "book" : undefined)} title={goal.title} />
          <div className="goal-content">
            <div className="goal-title-row">
              <div className="goal-title-progress">
                <div className="goal-main-line">
                  <h3 title={goal.title}>{goal.title}</h3>
                  <span className="today-need">
                    {isGoalCompleted ? (
                      copy.done
                    ) : (
                      <>
                        <span>{copy.todayLabel}</span>
                        <strong>{formatNumber(requiredToday)} {goal.unit}</strong>
                      </>
                    )}
                  </span>
                </div>
                <div className="goal-progress-stack">
                  <div className="progress-track" style={progressStyle}>
                    <span />
                  </div>
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
  isToday,
  deleteLabel,
  editLabel,
  toggleLabel,
  onClick,
  onDelete,
  onEdit,
}: {
  task: TaskItem;
  completed: boolean;
  isToday: boolean;
  deleteLabel: string;
  editLabel?: string;
  toggleLabel: string;
  onClick: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  return (
    <SwipeDeleteShell deleteLabel={deleteLabel} editLabel={editLabel} onDelete={onDelete} onEdit={onEdit}>
      <div className={`task-row ${completed ? "completed" : ""} priority-${task.priority ?? "medium"}`}>
        <button type="button" className="task-row-main" onClick={onClick}>
          <ActionIconBadge className="task-icon" iconKey={task.iconKey} title={task.title} />
          <span className="task-title">
            {task.title}
            {!isToday && <small>{task.date}</small>}
          </span>
        </button>
        <button
          type="button"
          className="task-check-button"
          aria-label={toggleLabel}
          aria-pressed={completed}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
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
    </SwipeDeleteShell>
  );
}

function SwipeDeleteShell({
  children,
  deleteLabel,
  editLabel,
  onDelete,
  onEdit,
  onTap,
}: {
  children: ReactNode;
  deleteLabel: string;
  editLabel?: string;
  onDelete?: () => void;
  onEdit?: () => void;
  onTap?: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const startPoint = useRef<{ x: number; y: number } | null>(null);
  const offsetRef = useRef(0);
  const suppressClick = useRef(false);
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
    event.currentTarget.setPointerCapture(event.pointerId);
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

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
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
        onTap();
      }
    }
  }

  return (
    <div
      className={`swipe-delete-shell ${isSwiping ? "is-swiping" : ""} ${isEditing ? "is-editing" : ""} ${isDeleting ? "is-deleting" : ""}`}
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
  iconKey,
  title,
  className,
}: {
  iconKey?: string;
  title: string;
  className: string;
}) {
  const icon = iconKey ? getActionIcon(iconKey) : undefined;

  if (icon) {
    const Icon = icon.Icon;

    return (
      <span className={className} aria-hidden="true">
        <Icon size={21} />
      </span>
    );
  }

  return (
    <span className={className} aria-hidden="true">
      {getTitleFallbackLetter(title)}
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
  onSave,
}: {
  state: Exclude<EditState, null>;
  copy: UiCopy;
  language: AppSettings["language"];
  onClose: () => void;
  onSave: (update: {
    title: string;
    note?: string;
    iconKey?: string;
    repeatMode: TaskRepeatMode;
    selectedDays?: number[];
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
  const [note, setNote] = useState(action.note ?? "");
  const [iconKey, setIconKey] = useState<string | undefined>(action.iconKey);
  const [repeatMode, setRepeatMode] = useState<TaskRepeatMode>(initialRepeatMode);
  const [selectedDays, setSelectedDays] = useState<number[]>(action.selectedDays ?? defaultGoalSelectedDays);
  const [targetValue, setTargetValue] = useState(isGoal ? String(state.goal.targetValue) : "");
  const [currentValue, setCurrentValue] = useState(isGoal ? String(state.goal.currentValue) : "");
  const [unit, setUnit] = useState(isGoal ? state.goal.unit : "");
  const [quickValues, setQuickValues] = useState(isGoal ? state.goal.quickAddValues.join(", ") : "");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const selectedIcon = iconKey ? getActionIcon(iconKey) : undefined;
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
      note,
      iconKey,
      repeatMode,
      selectedDays: repeatMode === "selectedDays" ? selectedDays : undefined,
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

  return (
    <BottomSheet title={copy.editAction} closeLabel={copy.close} onClose={onClose}>
      <form className="sheet-form edit-action-form" onSubmit={handleSubmit}>
        <label>
          <span>{copy.name}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </label>

        <div className="field-group">
          <span>{copy.icon}</span>
          <button type="button" className="icon-picker-trigger" onClick={() => setIconPickerOpen((open) => !open)}>
            {selectedIcon ? (
              <>
                <ActionIconGlyph iconKey={selectedIcon.key} size={17} />
                {copy.changeIcon}
              </>
            ) : (
              copy.chooseIcon
            )}
          </button>
          {iconPickerOpen && (
            <div className="icon-choice-grid" aria-label={copy.iconPickerAria}>
              <button
                type="button"
                className={iconKey === undefined ? "active" : ""}
                title={copy.noIcon}
                aria-label={copy.noIcon}
                onClick={() => setIconKey(undefined)}
              >
                <X size={18} />
              </button>
              {actionIcons.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={iconKey === option.key ? "active" : ""}
                  title={option.title}
                  aria-label={option.title}
                  onClick={() => setIconKey(option.key)}
                >
                  <ActionIconGlyph iconKey={option.key} size={18} />
                </button>
              ))}
            </div>
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
  onClose,
  onOpenManual,
  onToggleTask,
}: {
  type: Exclude<ViewAllState, null>;
  today: string;
  goals: ProgressGoal[];
  tasks: TaskItem[];
  copy: UiCopy;
  onClose: () => void;
  onOpenManual: (goal: ProgressGoal) => void;
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
              onOpenManual={() => onOpenManual(goal)}
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
                isToday
                deleteLabel={copy.deleteConfirm}
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
  const range = useMemo(() => getProgressRange(period, todayDate), [period, todayDate]);
  const previousRange = useMemo(() => getPreviousProgressRange(period, todayDate), [period, todayDate]);
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
    { value: "period", label: copy.period },
  ];

  return (
    <main className="progress-screen">
      <header className="progress-header">
        <div>
          <p className="brand">Chexar</p>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
      </header>

      <div className="progress-period-tabs" role="group" aria-label={copy.period}>
        {periodOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={period === option.value ? "active" : ""}
            aria-pressed={period === option.value}
            onClick={() => setPeriod(option.value)}
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

      <section className="progress-kpi-grid">
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

      <section className="progress-rhythm-card">
        <div>
          <span>{copy.periodRhythm}</span>
          <strong>{getProgressRhythmTitle(summary.average, language)}</strong>
          <p>{copy.rhythmDescription(summary.average)}</p>
        </div>
        <MiniRhythmChart values={trendValues} ariaLabel={copy.dynamics} />
      </section>

      <section className="progress-chart-card">
        <h2>{copy.dynamics}</h2>
        <ProgressLineChart points={chartPoints} />
      </section>

      <section className="progress-insight-grid">
        <ProgressBalanceCard balance={balance} copy={copy} />
        <ProgressBestDaysCard days={weekdayAverages} copy={copy} />
      </section>

      <section className="progress-best-card">
        <h2>{copy.bestActions}</h2>
        <div className="progress-rank-list">
          {actionRanks.length > 0 ? actionRanks.map((action, index) => (
            <div className="progress-rank-row" key={action.id}>
              <span className="progress-rank-index">{index + 1}</span>
              <ActionIconBadge className="progress-rank-icon" iconKey={action.iconKey} title={action.title} />
              <strong>{action.title}</strong>
              <div className="progress-rank-track" style={{ "--rank-progress": `${action.percent}%` } as CSSProperties}>
                <span />
              </div>
              <em>{action.percent}%</em>
            </div>
          )) : (
            <p className="progress-no-actions">{copy.noActions}</p>
          )}
        </div>
      </section>
    </main>
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
      <Icon size={25} aria-hidden="true" />
    </article>
  );
}

function ProgressLineChart({ points }: { points: ProgressChartPoint[] }) {
  const width = 330;
  const height = 156;
  const left = 36;
  const right = 12;
  const top = 18;
  const bottom = 30;
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
          <stop offset="0%" stopColor="#7c5cff" />
          <stop offset="100%" stopColor="#61d7ff" />
        </linearGradient>
        <linearGradient id="progress-area-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(124, 92, 255, 0.34)" />
          <stop offset="100%" stopColor="rgba(124, 92, 255, 0)" />
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
          <circle className={`progress-chart-point ${point.hasData ? "" : "empty"}`} cx={point.x} cy={point.y} r="4.2" />
          {showPointLabels && point.hasData && <text className="progress-chart-value-label" x={point.x} y={point.y - 10}>{point.value}%</text>}
          <text className="progress-chart-x-label" x={point.x} y={height - 8}>{point.label}</text>
        </g>
      ))}
    </svg>
  );
}

function ProgressBalanceCard({
  balance,
  copy,
}: {
  balance: ReturnType<typeof getProgressBalance>;
  copy: (typeof progressCopy)[AppSettings["language"]];
}) {
  const checklistStart = balance.progressShare;
  const missesStart = Math.min(balance.progressShare + balance.checklistShare, 100);

  return (
    <section className="progress-balance-card">
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

function ProgressBestDaysCard({ days, copy }: { days: Array<{ label: string; value: number }>; copy: (typeof progressCopy)[AppSettings["language"]] }) {
  const maxValue = Math.max(...days.map((day) => day.value), 0);

  return (
    <section className="progress-best-days-card">
      <h2>{copy.bestDays}</h2>
      <div className="progress-day-bars">
        {days.map((day) => (
          <div className={`progress-day-bar ${day.value === maxValue && maxValue > 0 ? "best" : ""}`} key={day.label}>
            <span>{day.value > 0 ? `${day.value}%` : ""}</span>
            <i style={{ "--bar-value": `${day.value}%` } as CSSProperties} />
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
            aria-current={active ? "page" : undefined}
            onClick={() => onSelect(item.screen as AppScreen)}
          >
            <Icon size={28} />
            <span>{item.label}</span>
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
  streak,
  language,
  onSelectDate,
}: {
  appState: AppState;
  dayRecords: Array<{ date: string; percent: number }>;
  today: string;
  todayPercent: number;
  streak: number;
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
  const selectedDate = useMemo(() => parseDateKey(selectedDateKey), [selectedDateKey]);
  const selectedDetails = useMemo(
    () => getCalendarDayDetails(selectedDate, appState, dayRecords, today, todayPercent),
    [appState, dayRecords, selectedDate, today, todayPercent],
  );
  const monthStats = useMemo(
    () => getCalendarMonthStats(visibleMonth, appState, dayRecords, today, todayPercent),
    [appState, dayRecords, today, todayPercent, visibleMonth],
  );
  const monthHasData = useMemo(
    () => calendarDays
      .filter((date) => date.getMonth() === visibleMonth.getMonth())
      .some((date) => getCalendarDayDetails(date, appState, dayRecords, today, todayPercent).hasData),
    [appState, calendarDays, dayRecords, today, todayPercent, visibleMonth],
  );
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
        <div>
          <p className="brand">Chexar</p>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
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
            const displayDetails = isFuture ? { ...dayDetails, percent: 0, hasData: false } : dayDetails;
            const tone = getCalendarDayTone(displayDetails.percent, displayDetails.hasData);
            const matchesFilter = getCalendarFilterMatch(activeFilter, displayDetails, tone);

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
                  {!isFuture && <span>{displayDetails.hasData ? `${displayDetails.percent}%` : "-"}</span>}
                  {!isFuture && <i aria-hidden="true" />}
                </button>
              );
            })}
        </div>
      </section>

      {!monthHasData && (
        <section className="calendar-empty-month">
          <CalendarDays size={24} aria-hidden="true" />
          <strong>{copy.emptyMonthTitle}</strong>
          <p>{copy.emptyMonthText}</p>
        </section>
      )}

      <section className="calendar-legend" aria-label="Legend">
        <CalendarLegendItem className="closed" label={copy.closed} />
        <CalendarLegendItem className="partial" label={copy.partial} />
        <CalendarLegendItem className="missed" label={copy.skipped} />
        <CalendarLegendItem className="today" label={copy.selectedToday} />
      </section>

      <section className="calendar-day-card calendar-overview-card">
        <div className="calendar-day-card-header">
          <div>
            <h2>{formatCalendarSelectedDate(selectedDate, language)}</h2>
            <p>{selectedDetails.hasData ? copy.dayClosed(selectedDetails.percent) : copy.emptyDay}</p>
          </div>
          <CalendarProgressRing percent={selectedDetails.percent} />
        </div>
        <div className="calendar-overview-summary">
          <div>
            <span>{copy.completed}</span>
            <strong>{selectedDetails.completed.length}</strong>
          </div>
          <div>
            <span>{copy.remaining}</span>
            <strong>{selectedDetails.remaining.length}</strong>
          </div>
          <div>
            <span>{copy.missed}</span>
            <strong>{selectedDetails.missed.length}</strong>
          </div>
        </div>
      </section>

      <section className="calendar-summary-card">
        <div className="calendar-summary-item">
          <Star size={28} aria-hidden="true" />
          <span>{copy.bestDay}</span>
          <strong>{formatCalendarBestWeekday(monthStats.bestDay, language)}</strong>
        </div>
        <div className="calendar-summary-item">
          <BarChart3 size={28} aria-hidden="true" />
          <span>{copy.average}</span>
          <strong>{monthStats.average}%</strong>
        </div>
        <div className="calendar-summary-item">
          <Flame size={28} aria-hidden="true" />
          <span>{copy.streak}</span>
          <strong>{streak}</strong>
        </div>
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
  isTelegramMiniApp,
  onSettingsChange,
  onResetRequest,
}: {
  settings: AppSettings;
  isTelegramMiniApp: boolean;
  onSettingsChange: (settings: Partial<AppSettings>) => void;
  onResetRequest: () => void;
}) {
  const [languageOpen, setLanguageOpen] = useState(false);
  const copy = profileCopy[settings.language];

  return (
    <main className="profile-screen">
      <header className="profile-header">
        <div>
          <p className="brand">Chexar</p>
          <h1>{copy.profile}</h1>
          <p>{copy.profileSubtitle}</p>
        </div>
        <div className="profile-avatar" aria-label={copy.profileAria}>
          A
        </div>
      </header>

      <ProfileCard title={copy.interface}>
        <ProfileRow
          icon={Globe2}
          label={copy.language}
          value={settings.language === "ru" ? copy.russian : copy.english}
          onClick={() => setLanguageOpen((open) => !open)}
          accent="violet"
        />
        {languageOpen && (
          <ProfileSegmented
            value={settings.language}
            options={[
              { value: "en", label: copy.english },
              { value: "ru", label: copy.russian },
            ]}
            onChange={(value) => {
              onSettingsChange({ language: value as AppSettings["language"] });
              setLanguageOpen(false);
            }}
          />
        )}
        <div className="profile-row theme-setting-row">
          <span className="profile-row-icon accent-cyan" aria-hidden="true">
            <Monitor size={22} />
          </span>
          <span className="profile-row-label">{copy.theme}</span>
          <ThemeIconSelector
            value={settings.theme}
            labels={{
              light: copy.lightTheme,
              dark: copy.darkTheme,
              system: copy.systemTheme,
            }}
            onChange={(value) => onSettingsChange({ theme: value as AppSettings["theme"] })}
          />
        </div>
      </ProfileCard>

      <ProfileCard title={copy.data}>
        <ProfileRow icon={Database} label={copy.storage} value={copy.onDevice} accent="violet" />
        <ProfileRow icon={ExternalLink} label={copy.export} value={copy.soon} muted accent="cyan" />
        <ProfileRow icon={Bell} label={copy.reminders} value={copy.later} muted accent="violet" />
      </ProfileCard>

      <ProfileCard title={copy.about}>
        <ProfileRow icon={Info} label={copy.version} value={APP_VERSION} accent="violet" />
        <ProfileRow icon={Send} label={copy.telegram} value={isTelegramMiniApp ? copy.connected : copy.browserMode} accent="cyan" />
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

function ProfileCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="profile-card">
      <h2>{title}</h2>
      <div className="profile-card-rows">{children}</div>
    </section>
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
  onChange,
}: {
  value: AppSettings["theme"];
  labels: Record<AppSettings["theme"], string>;
  onChange: (value: AppSettings["theme"]) => void;
}) {
  const options: Array<{ value: AppSettings["theme"]; icon: LucideIcon }> = [
    { value: "light", icon: Sun },
    { value: "dark", icon: Moon },
    { value: "system", icon: Monitor },
  ];

  return (
    <div className="theme-icon-selector" role="group" aria-label={labels[value]}>
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
  const [amount, setAmount] = useState(requiredToday > 0 ? String(requiredToday) : "");
  const [note, setNote] = useState("");
  const amountTemplates = [1, 5, 10];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return;
    }

    onSave(numericAmount, note);
  }

  return (
    <BottomSheet title={copy.addProgress} closeLabel={copy.close} onClose={onClose}>
      <form className="sheet-form" onSubmit={handleSubmit}>
        <div className="sheet-summary">
          <span>{goal.title}</span>
          <strong>{copy.requiredToday}: {formatNumber(requiredToday)} {goal.unit}</strong>
          {goal.note && <p className="action-comment">{goal.note}</p>}
        </div>
        <div className="progress-template-buttons" aria-label={copy.completedInput}>
          {amountTemplates.map((value) => (
            <button key={value} type="button" onClick={() => setAmount(String(value))}>
              <span className="quick-plus-mark" aria-hidden="true">
                <span />
                <span />
              </span>
              <span>{formatNumber(value)}</span>
            </button>
          ))}
        </div>
        <label>
          <span>{copy.completedInput}</span>
          <input
            autoFocus
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0"
          />
        </label>
        <label>
          <span>{copy.note}</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={copy.optional} />
        </label>
        <div className="sheet-actions">
          <button type="submit" className="primary-sheet-button">
            {copy.save}
          </button>
          <button type="button" className="ghost-sheet-button" onClick={onClose}>
            {copy.cancel}
          </button>
        </div>
      </form>
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
    targetValue: number;
    currentValue: number;
    unit: string;
    startDate: string;
    endDate: string;
    repeatMode: GoalRepeatMode;
    selectedDays?: number[];
    quickAddValues: number[];
    iconKey?: string;
  }) => void;
  onCreateTask: (task: {
    title: string;
    iconKey?: string;
    priority?: Priority;
    startDate: string;
    endDate: string;
    repeatMode: TaskRepeatMode;
    selectedDays?: number[];
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [iconKey, setIconKey] = useState<string | undefined>(undefined);
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const selectedIcon = iconKey ? getActionIcon(iconKey) : undefined;
  const dates = getPeriodDates(today, period, startDate, endDate);
  const numericTarget = Number(targetValue);
  const numericCurrent = Number(currentValue) || 0;
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
    targetValue !== "" ||
    currentValue !== "0" ||
    unit.trim() !== "" ||
    trackingMode !== "amount" ||
    period !== "month" ||
    repeatMode !== "everyDay" ||
    quickValues.trim() !== "" ||
    iconKey !== undefined;

  function applyTemplate(template: ActionTemplate) {
    setTitle(getTemplateTitle(template, language));
    setIconKey(template.iconKey);
    setTrackingMode(template.trackingMode);
    setPeriod(template.period);
    setRepeatMode(template.repeatMode);
    setSelectedDays(template.selectedDays ?? defaultGoalSelectedDays);
    setTargetValue(template.targetValue ? String(template.targetValue) : "");
    setUnit(getTemplateUnit(template, language) ?? "");
    setCurrentValue("0");
    setQuickValues(template.quickValues?.join(", ") ?? "");
    setAdvancedOpen(false);
    setTemplatePickerOpen(false);
    setIconPickerOpen(false);
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
  }

  function toggleWeekdaySelection(day: number) {
    setSelectedDays((days) => toggleWeekday(days, day));
  }

  function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (errors.length > 0) {
      return;
    }

    if (trackingMode === "amount") {
      onCreateGoal({
        title,
        iconKey,
        targetValue: numericTarget,
        currentValue: numericCurrent,
        unit,
        startDate: dates.startDate,
        endDate: dates.endDate,
        repeatMode,
        selectedDays: activeSelectedDays,
        quickAddValues: parseQuickValues(quickValues, unit),
      });
      return;
    }

    onCreateTask({
      title,
      iconKey,
      priority: "medium",
      startDate: dates.startDate,
      endDate: dates.endDate,
      repeatMode: taskRepeatMode,
      selectedDays: taskRepeatMode === "selectedDays" ? selectedDays : undefined,
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

        <div className="field-group">
          <span>{copy.icon}</span>
          <button type="button" className="icon-picker-trigger" onClick={() => setIconPickerOpen((open) => !open)}>
            {selectedIcon ? (
              <>
                <ActionIconGlyph iconKey={selectedIcon.key} size={17} />
                {copy.changeIcon}
              </>
            ) : (
              copy.chooseIcon
            )}
          </button>
          {iconPickerOpen && (
            <div className="icon-choice-grid" aria-label={copy.iconPickerAria}>
              <button
                type="button"
                className={iconKey === undefined ? "active" : ""}
                title={copy.noIcon}
                aria-label={copy.noIcon}
                onClick={() => setIconKey(undefined)}
              >
                <X size={18} />
              </button>
              {actionIcons.map((option) => (
              <button
                key={option.key}
                type="button"
                className={iconKey === option.key ? "active" : ""}
                title={option.title}
                aria-label={option.title}
                onClick={() => setIconKey(option.key)}
              >
                <ActionIconGlyph iconKey={option.key} size={18} />
              </button>
              ))}
            </div>
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
            </>
          ) : (
            <>
              <PreviewRow icon={<CalendarDays size={16} />} label={copy.period} value={getPeriodSummary(period, dates.startDate, dates.endDate, language)} />
              <PreviewRow icon={<TrendingUp size={16} />} label={copy.repeat} value={getActionRepeatLabel(period, repeatMode, language)} />
              <PreviewRow icon={<Check size={16} />} label={copy.format} value={copy.doneNotDone} />
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

  return (
    <div className="template-picker">
      <TemplateGroup title={copy.progressTemplates} templates={progressTemplates} language={language} onSelect={onSelect} />
      <TemplateGroup title={copy.checklistTemplates} templates={checklistTemplates} language={language} onSelect={onSelect} />
    </div>
  );
}

function TemplateGroup({
  title,
  templates,
  language,
  onSelect,
}: {
  title: string;
  templates: ActionTemplate[];
  language: AppSettings["language"];
  onSelect: (template: ActionTemplate) => void;
}) {
  return (
    <div className="template-section">
      <span className="sheet-caption">{title}</span>
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
                <ActionIconGlyph iconKey={template.iconKey} size={17} />
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
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  closeLabel?: string;
  closeOnOverlay?: boolean;
}) {
  return (
    <div className="modal-overlay sheet-overlay" role="presentation" onClick={closeOnOverlay ? onClose : undefined}>
      <div className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(event) => event.stopPropagation()}>
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
