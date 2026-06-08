import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  Flame,
  Infinity as InfinityIcon,
  Monitor,
  Plus,
  Search,
  SlidersHorizontal,
  Sun,
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
  getGoalSchedulePreview,
  getGoalProgressPercent,
  getGoalDailyMetrics,
  getMonthRange,
  getRequiredToday,
  getTaskSubitemProgress,
  getTodayLoggedAmount,
  getWeekRange,
  hasTaskSubitems,
  isGoalDueOnDate,
  isTaskCompletedOnDate,
  isTaskDueOnDate,
  upsertDailyRecord,
} from "./calculations";
import { addDays, daysInclusive, parseDateKey, todayKey, toDateKey } from "./dateUtils";
import { DirectionReviewScreen } from "./DirectionReviewScreen";
import {
  createDirectionCheckInRecord,
  upsertDirectionCheckInRecord,
  type DirectionCheckInCandidate,
  type DirectionCheckInDecision,
} from "./directionCheckIn";
import { normalizeSemanticQuantityUnit } from "./semanticUnits";
import {
  createEmptyDailyRecords,
  createEmptyState,
  loadAppState,
  loadDailyRecords,
  loadDirectionCheckIns,
  loadOnboardingQuestState,
  loadSettings,
  createOnboardingQuestState,
  resetChexarStorage,
  saveAppState,
  saveDailyRecords,
  saveDirectionCheckIns,
  saveOnboardingQuestState,
  saveSettings,
} from "./storage";
import type { ActionSubitem, ActionSubitemState, AppScreen, AppSettings, AppState, GoalPeriodType, GoalRepeatMode, LifeAreaKey, OnboardingQuestState, OnboardingQuestStep, Priority, ProgressEntry, ProgressGoal, TaskItem, TaskOccurrence, TaskRepeatMode } from "./types";
import { mergeDuplicateActions, normalizeActionTitle } from "./actionMerge";
import { hasRemotePersistence, loadRemoteData, saveRemoteSnapshot } from "./supabaseData";
import {
  getTelegramConnectionStatus,
  getTelegramUser,
  hasTelegramMainButton,
  initTelegramWebApp,
  isTelegramMiniApp,
  setupTelegramBackButton,
  setupTelegramMainButton,
  showTelegramConfirm,
  telegramImpact,
  telegramNotification,
  telegramSelectionChanged,
} from "./lib/telegram";
import type { TelegramConnectionStatus, TelegramUser } from "./lib/telegram";
import { productLanguage } from "./productLanguage";
import {
  buildTodayOrientation,
  getNextRhythmCardMode,
  mapRhythmCardModePreference,
  type RhythmCardMode,
} from "./todayPresentation";

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
    questQuestion: "Want to see quick function tips?",
    questYes: "Yes",
    questNo: "No",
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
    questQuestion: "Хочешь посмотреть подсказки по функциям?",
    questYes: "Да",
    questNo: "Нет",
    continue: "Продолжить",
  },
} as const;

const onboardingQuestSteps: OnboardingQuestStep[] = [
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

const onboardingQuestStepGroups: OnboardingQuestStep[][] = [
  ["questTaskCompleted"],
  ["questTaskDeleted"],
  ["questPairTimerSet", "questPairEmojiChanged", "questPairReordered"],
  ["questMiniListOpened", "questMiniListCompleted"],
  ["questProgressEntered"],
  ["questTaskCreated"],
];

const onboardingQuestStepPrerequisites: Partial<Record<OnboardingQuestStep, OnboardingQuestStep[]>> = {
  questPairReordered: ["questPairTimerSet", "questPairEmojiChanged"],
  questMiniListCompleted: ["questMiniListOpened"],
};

function canCompleteOnboardingQuestStep(step: OnboardingQuestStep, completedSteps: OnboardingQuestStep[]): boolean {
  const completed = new Set(completedSteps);

  if (completed.has(step)) {
    return false;
  }

  const groupIndex = onboardingQuestStepGroups.findIndex((group) => group.includes(step));

  if (groupIndex === -1) {
    return false;
  }

  const previousGroupsCompleted = onboardingQuestStepGroups
    .slice(0, groupIndex)
    .every((group) => group.every((groupStep) => completed.has(groupStep)));

  if (!previousGroupsCompleted) {
    return false;
  }

  const prerequisites = onboardingQuestStepPrerequisites[step] ?? [];

  return prerequisites.every((requiredStep) => completed.has(requiredStep));
}

type OnboardingQuestScenarioCopy = {
  title: string;
  meta: string;
};

type OnboardingQuestCopy = {
  title: string;
  subtitle: string;
  hide: string;
  mastered: string;
  done: string;
  edit: string;
  open: string;
  save: string;
  cancel: string;
  deleteAction: string;
  create: string;
  completedLabel: string;
  progressLabel: string;
  progressPlaceholder: string;
  scenarios: {
    complete: OnboardingQuestScenarioCopy;
    delete: OnboardingQuestScenarioCopy & { editorTitle: string; editorMeta: string };
    pair: OnboardingQuestScenarioCopy & {
      firstTitle: string;
      secondTitle: string;
      timerTitle: string;
      emojiTitle: string;
      reorderHint: string;
    };
    miniList: OnboardingQuestScenarioCopy & { rows: string[] };
    progress: OnboardingQuestScenarioCopy;
    create: OnboardingQuestScenarioCopy;
  };
};

const onboardingQuestCopy: Record<AppSettings["language"], OnboardingQuestCopy> = {
  en: {
    title: "Start Quest",
    subtitle: "Complete each training task in order.",
    hide: "Hide tips",
    mastered: "Chexar mastered",
    done: "Done",
    edit: "Edit",
    open: "Open",
    save: "Save",
    cancel: "Cancel",
    deleteAction: "Delete task",
    create: "Create",
    completedLabel: "Completed",
    progressLabel: "Completed tasks",
    progressPlaceholder: "2",
    scenarios: {
      complete: { title: "Mark this task done", meta: "Swipe left or tap the checkbox." },
      delete: { title: "Delete this task", meta: "Swipe right to open the editor, then delete it.", editorTitle: "Task editor", editorMeta: "This is a training task." },
      pair: {
        title: "Edit and swap two tasks",
        meta: "Set a timer for one task, change emoji on the other, then long-press to swap them.",
        firstTitle: "Set timer",
        secondTitle: "Change emoji",
        timerTitle: "Timer editor",
        emojiTitle: "Emoji editor",
        reorderHint: "Long-press and move the tasks",
      },
      miniList: { title: "Open the mini list", meta: "Mark the first two items inside this task.", rows: ["Task 1 is done", "Task 2 is deleted", "Keep going"] },
      progress: { title: "Enter progress", meta: "Write how many quest tasks are already complete." },
      create: { title: "Create the first task", meta: "Finish the quest from this training row." },
    },
  },
  ru: {
    title: "Старт-квест",
    subtitle: "Проходи тренировочные задачи по очереди.",
    hide: "Скрыть подсказки",
    mastered: "Chexar освоен",
    done: "Готово",
    edit: "Редактировать",
    open: "Открыть",
    save: "Сохранить",
    cancel: "Отмена",
    deleteAction: "Удалить задачу",
    create: "Создать",
    completedLabel: "Выполнено",
    progressLabel: "Сколько задач пройдено",
    progressPlaceholder: "2",
    scenarios: {
      complete: { title: "Отметить эту задачу", meta: "Свайпни влево или нажми чекбокс." },
      delete: { title: "Удалить эту задачу", meta: "Свайпни вправо, зайди в редактор и удали её.", editorTitle: "Редактор задачи", editorMeta: "Это тренировочная задача старт-квеста." },
      pair: {
        title: "Поменять две задачи местами",
        meta: "Одной поставь таймер, другой поменяй emoji, потом зажми и поменяй их местами.",
        firstTitle: "Поставить таймер",
        secondTitle: "Поменять emoji",
        timerTitle: "Таймер задачи",
        emojiTitle: "Emoji задачи",
        reorderHint: "Зажми и перетащи вверх или вниз",
      },
      miniList: { title: "Открыть мини-список", meta: "Отметь внутри первые два пункта.", rows: ["Задача 1 выполнена", "Задача 2 удалена", "Идём дальше"] },
      progress: { title: "Ввести прогресс", meta: "Напиши числом, сколько задач квеста уже пройдено." },
      create: { title: "Создать первую задачу", meta: "Заверши старт-квест из этой тренировочной строки." },
    },
  },
};

function isOnboardingQuestStep(value: unknown): value is OnboardingQuestStep {
  return typeof value === "string" && onboardingQuestSteps.includes(value as OnboardingQuestStep);
}

function emitOnboardingQuestEvent(type: OnboardingQuestStep) {
  window.dispatchEvent(new CustomEvent("chexar:onboarding-event", { detail: { type } }));
}

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
    telegramBotOn: "Telegram bot enabled",
    telegramBotOff: "Telegram bot disabled",
    telegramBotText: "AI chat, task reminders, checkboxes, and quantity progress in Telegram.",
    carryOversOn: "Missed actions enabled",
    carryOversOff: "Missed actions hidden",
    carryOversText: "Show a small banner when previous days have unfinished actions.",
    restartQuest: "Open Start Quest",
    restartQuestText: "Show the onboarding checklist again.",
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
    browserMode: "Браузерный режим",
    resetData: "Сбросить данные",
    hintsOn: "Подсказки включены",
    hintsOff: "Подсказки выключены",
    hintsText: "Мы покажем полезные советы в нужный момент.",
    telegramBotOn: "Telegram-бот включен",
    telegramBotOff: "Telegram-бот выключен",
    telegramBotText: "AI-чат, напоминания, чекбоксы и количественный прогресс в Telegram.",
    carryOversOn: "Пропущенные включены",
    carryOversOff: "Пропущенные скрыты",
    carryOversText: "Показывать короткий баннер, если в прошлые дни остались незакрытые задачи.",
    restartQuest: "Открыть старт-квест",
    restartQuestText: "Показать обучающий чек-лист ещё раз.",
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
    progress: "Direction",
    profile: "Profile",
    aria: "Main navigation",
  },
  ru: {
    today: "Сегодня",
    calendar: "Календарь",
    progress: "Направление",
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
    streak: "Серия",
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
    streak: "Серия",
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
    requiredToday: "Recommended",
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
    streak: "Серия",
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
    requiredToday: "Рекомендовано",
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
  target?: number;
};

type AiActionDraft = {
  intent?: "create_action" | "mark_done" | "add_progress" | "unknown";
  title: string;
  icon?: string;
  tracking_type: AiTrackingType;
  target_value?: number;
  unit?: string;
  repeat_mode: AiRepeatMode;
  period: AiPeriod;
  start_date: string;
  end_date?: string | null;
  due_time?: string | null;
  subitems?: AiSubitemDraft[];
  missing_fields?: string[];
  clarifying_question?: string | null;
};

type ProgressSheetState = {
  goal: ProgressGoal;
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

type EditActionUpdate = {
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
};

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

function hasEditActionChanges(state: Exclude<EditState, null>, update: EditActionUpdate): boolean {
  const action = state.type === "goal" ? state.goal : state.task;
  const nextSelectedDays = update.repeatMode === "selectedDays" ? update.selectedDays ?? [] : [];
  const currentSelectedDays = action.repeatMode === "selectedDays" ? action.selectedDays ?? [] : [];

  if (
    update.title.trim() !== action.title ||
    (update.groupName?.trim() || undefined) !== action.groupName ||
    (update.note?.trim() || undefined) !== action.note ||
    update.emoji !== action.emoji ||
    update.iconKey !== action.iconKey ||
    update.repeatMode !== action.repeatMode ||
    nextSelectedDays.join(",") !== currentSelectedDays.join(",") ||
    update.dueTime !== action.dueTime
  ) {
    return true;
  }

  if (state.type !== "goal") {
    return false;
  }

  return (
    (update.targetValue ?? state.goal.targetValue) !== state.goal.targetValue ||
    (update.currentValue ?? state.goal.currentValue) !== state.goal.currentValue ||
    (update.unit?.trim() ?? state.goal.unit) !== state.goal.unit ||
    (update.quickAddValues ?? state.goal.quickAddValues).join(",") !== state.goal.quickAddValues.join(",")
  );
}

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

type TodaySortMode = "manual" | "alphabet" | "top" | "antiTop" | "type";
type TodayGroupMode = "group" | "none" | "type" | "status" | "subitems";
type TodayFilterMode = "checkbox" | "quantity" | "subitems" | "active" | "done" | "behind";
type TodayOverviewMode = "day" | "week" | "month";

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

function getRussianCountForm(value: number, forms: [string, string, string]): string {
  const integer = Math.abs(Math.trunc(value));
  const lastTwo = integer % 100;
  const last = integer % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return forms[2];
  }

  if (last === 1) {
    return forms[0];
  }

  if (last >= 2 && last <= 4) {
    return forms[1];
  }

  return forms[2];
}

function formatGoalAmount(value: number, unit: string): string {
  const normalizedUnit = unit.trim().toLocaleLowerCase("ru-RU");
  const russianForms: Record<string, [string, string, string]> = {
    "урок": ["урок", "урока", "уроков"],
    "урока": ["урок", "урока", "уроков"],
    "уроков": ["урок", "урока", "уроков"],
    "страница": ["страница", "страницы", "страниц"],
    "страницы": ["страница", "страницы", "страниц"],
    "страниц": ["страница", "страницы", "страниц"],
    "задача": ["задача", "задачи", "задач"],
    "задачи": ["задача", "задачи", "задач"],
    "задач": ["задача", "задачи", "задач"],
    "тренировка": ["тренировка", "тренировки", "тренировок"],
    "тренировки": ["тренировка", "тренировки", "тренировок"],
    "тренировок": ["тренировка", "тренировки", "тренировок"],
    "минута": ["минута", "минуты", "минут"],
    "минуты": ["минута", "минуты", "минут"],
    "минут": ["минута", "минуты", "минут"],
    "час": ["час", "часа", "часов"],
    "часа": ["час", "часа", "часов"],
    "часов": ["час", "часа", "часов"],
    "шаг": ["шаг", "шага", "шагов"],
    "шага": ["шаг", "шага", "шагов"],
    "шагов": ["шаг", "шага", "шагов"],
    "стакан": ["стакан", "стакана", "стаканов"],
    "стакана": ["стакан", "стакана", "стаканов"],
    "стаканов": ["стакан", "стакана", "стаканов"],
  };
  const displayUnit = russianForms[normalizedUnit] ? getRussianCountForm(value, russianForms[normalizedUnit]) : unit.trim();

  return `${formatNumber(value)} ${displayUnit}`.trim();
}

function getGoalDisplayUnit(goal: ProgressGoal, language: AppSettings["language"] = "ru"): string {
  return normalizeSemanticQuantityUnit({
    title: goal.title,
    unit: goal.unit,
    sourceText: `${goal.title} ${goal.note ?? ""}`,
    targetValue: goal.targetValue,
    language,
    mode: "display",
  });
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

const emojiSegmentPattern =
  /(?:\p{Regional_Indicator}{2})|(?:[#*0-9]\uFE0F?\u20E3)|(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:[\uFE0F\uFE0E]|\p{Emoji_Modifier})?(?:\u200D[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:[\uFE0F\uFE0E]|\p{Emoji_Modifier})?)*)/gu;

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
  plus: "➕",
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
  return iconKey ? iconEmojiMap[iconKey] ?? normalizeEmojiChoice(iconKey) : undefined;
}

function normalizeEmojiChoice(value: string): string | undefined {
  const normalized = Array.from(value.trim().matchAll(emojiSegmentPattern), (match) => match[0]).slice(0, 2).join("");

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

function getActionEmoji(action: Pick<ProgressGoal | TaskItem, "emoji" | "iconKey" | "title">, fallback = "•"): string {
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
  const readableRules: Array<[string[], string]> = [
    [["заряд", "трениров", "спорт"], "🏋️"],
    [["прогул", "ходьб"], "🚶"],
    [["бег"], "🏃"],
    [["немец", "german", "deutsch"], "🇩🇪"],
    [["англий", "english"], "🇬🇧"],
    [["язык", "language"], "🌐"],
    [["чтен", "книг", "прочита", "страниц"], "📚"],
    [["вода"], "💧"],
    [["медит"], "🧘"],
    [["магаз", "покуп"], "🛒"],
    [["уборк"], "🧹"],
    [["сон"], "😴"],
    [["работ", "проект"], "💻"],
    [["учеб", "курс"], "🎓"],
  ];
  const readableMatch = readableRules.find(([keywords]) => keywords.some((keyword) => normalized.includes(keyword)))?.[1];
  if (readableMatch) {
    return readableMatch;
  }

  return aiFallbackEmojiRules.find(([keywords]) => keywords.some((keyword) => normalized.includes(keyword)))?.[1] ?? "✨";
}

function normalizeAiDateKey(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const date = parseDateKey(value);
  return toDateKey(date) === value ? value : undefined;
}

function parseAiDueTimeFromText(normalized: string): string | null {
  const match = normalized.match(/(?:до|before)\s*(\d{1,2})(?::(\d{2}))?\s*(утра|дня|вечера|ночи|am|pm)?/i);
  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const suffix = match[3]?.toLocaleLowerCase("ru-RU") ?? "";

  if ((suffix === "вечера" || suffix === "pm") && hours < 12) {
    hours += 12;
  }

  if (suffix === "ночи" && hours === 12) {
    hours = 0;
  }

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function cleanAiActionRequest(value: string): string {
  return value
    .trim()
    .replace(/^\s*(?:[-*•]+|\d+[.)]|[a-zа-яё][.)])\s*/iu, "")
    .replace(/^["'“”«»]+|["'“”«»]+$/g, "")
    .trim();
}

function isAiInstructionRequest(value: string): boolean {
  const normalized = value.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return true;
  }

  const asksForList = /^(создай|создать|добавь|добавить|сделай|составь|create|add|make)(?:\s|$|[:,.!?])/i.test(normalized);
  const listWords = /(несколько|пару|список|задач|действи|tasks|actions|list)/i.test(normalized);
  const hasOwnQuantity = /\d+(?:[.,]\d+)?\s+[a-zа-яё]/i.test(normalized);

  return asksForList && listWords && !hasOwnQuantity;
}

function buildLocalAiDraft(text: string): AiActionDraft {
  const sourceText = cleanAiActionRequest(text) || text.trim();
  const normalized = sourceText.toLocaleLowerCase("ru-RU");
  const commandOnly = /^(создай|создать|добавь|добавить|create|add)\s*$/i.test(normalized.trim());
  const dueTime = parseAiDueTimeFromText(normalized);
  const targetSource = normalized.replace(/(?:до|before)\s*\d{1,2}(?::\d{2})?\s*(утра|дня|вечера|ночи|am|pm)?/gi, " ");
  const targetMatch = targetSource.match(/(\d+(?:[.,]\d+)?)/);
  const targetValue = targetMatch ? Number(targetMatch[1].replace(",", ".")) : undefined;
  const hasQuantity = Boolean(targetValue && Number.isFinite(targetValue));
  const hasTomorrow = /завтра|tomorrow/.test(normalized);
  const isOneDay = /сегодня|today/.test(normalized) || hasTomorrow;
  const period: AiPeriod = /недел|week/.test(normalized) ? "week" : isOneDay ? "today" : "month";
  const repeatMode: AiRepeatMode = /будн|weekday/.test(normalized) ? "weekdays" : !hasQuantity && isOneDay ? "once" : "daily";
  const unitMatch = targetSource.match(/\d+(?:[.,]\d+)?\s+([а-яёa-z]+)/i);
  const canonicalTitle = ([
    [/англий/i, "английский"],
    [/немец/i, "немецкий"],
    [/чтен|книг|прочита|страниц/i, "чтение"],
    [/зарядк/i, "зарядка"],
    [/трениров/i, "тренировка"],
    [/бег/i, "бег"],
    [/ходьб|прогул/i, "ходьба"],
    [/вод/i, "вода"],
    [/медит/i, "медитация"],
    [/магаз|покуп/i, "магазин"],
    [/уборк/i, "уборка"],
    [/сон/i, "сон"],
    [/учеб|курс/i, "учеба"],
    [/проект|работ/i, "проект"],
  ] satisfies Array<[RegExp, string]>).find(([pattern]) => pattern.test(normalized))?.[1];
  const knownTitle = canonicalTitle ?? [
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
  const fallbackTitle = sourceText
    .replace(/\d+(?:[.,]\d+)?/g, "")
    .replace(/\b(создай|создать|добавь|добавить|за|на|до|каждый|каждую|хочу|нужно|пройти|прочитать|сделать|месяц|неделю|день|завтра|сегодня|утра|дня|вечера|ночи|цель|задача|действие)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const title = knownTitle ?? fallbackTitle ?? sourceText.trim() ?? "Действие";
  const normalizedTitle = title.charAt(0).toLocaleUpperCase("ru-RU") + title.slice(1, 42);
  const scheduledDate = hasTomorrow ? addDays(todayKey(), 1) : todayKey();
  const semanticUnit = hasQuantity
    ? normalizeSemanticQuantityUnit({
        title: normalizedTitle,
        unit: unitMatch?.[1],
        sourceText,
        targetValue,
        language: "ru",
        mode: "draft",
      })
    : undefined;

  return {
    intent: commandOnly ? "unknown" : "create_action",
    title: normalizedTitle,
    icon: inferAiEmoji(sourceText),
    tracking_type: hasQuantity ? "quantity" : "checkbox",
    target_value: hasQuantity ? targetValue : undefined,
    unit: semanticUnit,
    repeat_mode: repeatMode,
    period,
    start_date: scheduledDate,
    end_date: hasTomorrow ? scheduledDate : null,
    due_time: dueTime,
    subitems: [],
    missing_fields: commandOnly ? ["title"] : [],
    clarifying_question: commandOnly ? "Что создать?" : null,
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
  const rawTitle = typeof record.title === "string" ? record.title.trim() : "";
  const cleanedTitle = rawTitle
    .replace(/^["'“”«»]+|["'“”«»]+$/g, "")
    .replace(/\b(цель|задача|действие|goal|task|action)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const toSubitemDraft = (item: unknown): AiSubitemDraft | null => {
    const subitem = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
    const title = typeof subitem.title === "string" ? subitem.title.trim() : "";
    const count = Number(subitem.target ?? subitem.targetCount);

    if (!title) {
      return null;
    }

    const draft: AiSubitemDraft = { title };
    if (Number.isFinite(count) && count > 1) {
      draft.target = Math.floor(count);
    }

    return draft;
  };
  const subitems = Array.isArray(record.subitems)
    ? record.subitems
        .map(toSubitemDraft)
        .filter((item): item is AiSubitemDraft => item !== null)
        .slice(0, 12)
    : [];
  const trackingType = record.tracking_type === "checkbox" || record.tracking_type === "quantity" ? record.tracking_type : local.tracking_type;
  const normalizedTitle = cleanedTitle || local.title;
  const normalizedTargetValue = Number.isFinite(target) && target > 0 ? target : local.target_value;
  const rawUnit = typeof record.unit === "string" && record.unit.trim() ? record.unit.trim() : local.unit;
  const normalizedUnit =
    trackingType === "quantity"
      ? normalizeSemanticQuantityUnit({
          title: normalizedTitle,
          unit: rawUnit,
          sourceText: fallbackText,
          targetValue: normalizedTargetValue,
          language: "ru",
          mode: "draft",
        })
      : undefined;

  return {
    intent:
      record.intent === "create_action" || record.intent === "mark_done" || record.intent === "add_progress" || record.intent === "unknown"
        ? record.intent
        : "create_action",
    title: normalizedTitle,
    icon: typeof record.icon === "string" && record.icon.trim() ? record.icon.trim() : local.icon,
    tracking_type: trackingType,
    target_value: normalizedTargetValue,
    unit: normalizedUnit,
    repeat_mode: record.repeat_mode === "once" || record.repeat_mode === "daily" || record.repeat_mode === "weekdays" || record.repeat_mode === "selected_days" ? record.repeat_mode : local.repeat_mode,
    period: record.period === "today" || record.period === "week" || record.period === "month" || record.period === "custom" ? record.period : local.period,
    start_date: normalizeAiDateKey(record.start_date) ?? local.start_date,
    end_date: normalizeAiDateKey(record.end_date) ?? local.end_date,
    due_time: typeof record.due_time === "string" && record.due_time.trim() ? record.due_time.trim() : local.due_time,
    subitems,
    missing_fields: Array.isArray(record.missing_fields) ? record.missing_fields.filter((field): field is string => typeof field === "string" && field.trim().length > 0).slice(0, 4) : [],
    clarifying_question: typeof record.clarifying_question === "string" && record.clarifying_question.trim() ? record.clarifying_question.trim() : null,
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

      if (!subitemTitle) {
        return null;
      }

      const draft: AiSubitemDraft = { title: subitemTitle };
      if (Number.isFinite(count) && count > 1) {
        draft.target = Math.floor(count);
      }

      return draft;
    })
    .filter((item): item is AiSubitemDraft => item !== null)
    .slice(0, 12);
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

function isCarryOverGoalCompleted(goal: ProgressGoal, dateKey: string): boolean {
  return isCalendarGoalCompletedByTarget(goal, dateKey);
}

const carryOverLookbackDays = 30;

function getCarryOverLookbackDates(todayDateKey: string): string[] {
  return Array.from({ length: carryOverLookbackDays }, (_, index) => addDays(todayDateKey, -(index + 1)));
}

function getCarryOverCandidates(state: AppState, todayDateKey: string, language: AppSettings["language"]): CarryOverCandidate[] {
  const yesterday = addDays(todayDateKey, -1);
  const yesterdayDate = parseDateKey(yesterday);
  const todayDate = parseDateKey(todayDateKey);
  const pastDates = getCarryOverLookbackDates(todayDateKey);
  const alreadyCarried = new Set(
    (state.occurrences ?? [])
      .filter((occurrence) => occurrence.date === todayDateKey && occurrence.status !== "skipped")
      .map((occurrence) => `${occurrence.itemType}:${occurrence.itemId}`),
  );
  const candidates: CarryOverCandidate[] = [];
  const candidateKeys = new Set<string>();
  const addCandidate = (candidate: CarryOverCandidate) => {
    const id = candidate.type === "goal" ? candidate.goal.id : candidate.task.id;
    const key = `${candidate.type}:${id}`;

    if (alreadyCarried.has(key) || candidateKeys.has(key)) {
      return;
    }

    candidateKeys.add(key);
    candidates.push(candidate);
  };

  (state.occurrences ?? [])
    .filter((occurrence) => occurrence.date < todayDateKey && occurrence.source === "carry_over" && occurrence.status === "active")
    .sort((left, right) => right.date.localeCompare(left.date))
    .forEach((occurrence) => {
      if (occurrence.itemType === "task") {
        const task = state.tasks.find((item) => item.id === occurrence.itemId);

        if (!task || isTaskDueOnDate(task, todayDate, todayDateKey) || isTaskCompletedOnDate(task, occurrence.date)) {
          return;
        }

        addCandidate({
          type: "task",
          task,
          movedFromDate: occurrence.movedFromDate ?? occurrence.date,
          detail: language === "en" ? "carried over" : "перенесено",
        });
        return;
      }

      const goal = state.goals.find((item) => item.id === occurrence.itemId);

      if (!goal || isGoalDueOnDate(goal, todayDate, todayDateKey) || isCarryOverGoalCompleted(goal, occurrence.date)) {
        return;
      }

      const remaining = Math.max(goal.targetValue - getCalendarGoalValueAtEndOfDate(goal, occurrence.date), 0);
      const displayUnit = getGoalDisplayUnit(goal, language);
      addCandidate({
        type: "goal",
        goal,
        movedFromDate: occurrence.movedFromDate ?? occurrence.date,
        detail:
          language === "en"
            ? `${formatGoalAmount(remaining, displayUnit)} still left`
            : `Еще осталось ${formatGoalAmount(remaining, displayUnit)}`,
      });
    });

  state.tasks.forEach((task) => {
    if (
      alreadyCarried.has(`task:${task.id}`) ||
      !isTaskDueOnDate(task, yesterdayDate, yesterday) ||
      isTaskDueOnDate(task, todayDate, todayDateKey) ||
      isTaskCompletedOnDate(task, yesterday)
    ) {
      return;
    }

    addCandidate({
      type: "task",
      task,
      movedFromDate: yesterday,
      detail: language === "en" ? "not done" : "не выполнено",
    });
  });

  state.goals.forEach((goal) => {
    const displayUnit = getGoalDisplayUnit(goal, language);

    if (alreadyCarried.has(`goal:${goal.id}`) || !isGoalDueOnDate(goal, yesterdayDate, yesterday) || isGoalDueOnDate(goal, todayDate, todayDateKey)) {
      return;
    }

    const required = getRequiredToday(goal, yesterday);
    const logged = getTodayLoggedAmount(goal, yesterday);
    const completed = isCalendarGoalCompletedByTarget(goal, yesterday);

    if (completed) {
      return;
    }

    addCandidate({
      type: "goal",
      goal,
      movedFromDate: yesterday,
      detail: `${formatNumber(logged)} / ${formatNumber(required)} ${displayUnit}`,
    });
  });

  pastDates
    .filter((dateKey) => dateKey !== yesterday)
    .forEach((dateKey) => {
      const date = parseDateKey(dateKey);

      state.tasks.forEach((task) => {
        if (
          alreadyCarried.has(`task:${task.id}`) ||
          !isTaskDueOnDate(task, date, dateKey) ||
          isTaskDueOnDate(task, todayDate, todayDateKey) ||
          isTaskCompletedOnDate(task, dateKey)
        ) {
          return;
        }

        addCandidate({
          type: "task",
          task,
          movedFromDate: dateKey,
          detail: language === "en" ? "not done" : "не выполнено",
        });
      });

      state.goals.forEach((goal) => {
        const displayUnit = getGoalDisplayUnit(goal, language);

        if (alreadyCarried.has(`goal:${goal.id}`) || !isGoalDueOnDate(goal, date, dateKey) || isGoalDueOnDate(goal, todayDate, todayDateKey)) {
          return;
        }

        const required = getRequiredToday(goal, dateKey);
        const logged = getTodayLoggedAmount(goal, dateKey);
        const completed = isCalendarGoalCompletedByTarget(goal, dateKey);

        if (completed) {
          return;
        }

        addCandidate({
          type: "goal",
          goal,
          movedFromDate: dateKey,
          detail: `${formatNumber(logged)} / ${formatNumber(required)} ${displayUnit}`,
        });
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

function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  return toDateKey(parseDateKey(value)) === value;
}

function formatDateLabel(dateKey: string): string {
  if (!isDateKey(dateKey)) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parseDateKey(dateKey));
}

const ruWeekdaysShort = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const ruMonthsShort = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."];
const ruMonthsLong = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const enWeekdaysShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const enMonthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
const enMonthsLong = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
    const metrics = getGoalDailyMetrics(goal, dateKey);
    const completedGoal = isCalendarGoalDailySuccess(goal, dateKey);
    const displayUnit = getGoalDisplayUnit(goal);
    const detail = metrics.dailyPlan > 0 ? `${formatNumber(metrics.todayCompleted)} / ${formatNumber(metrics.dailyPlan)}` : formatGoalAmount(metrics.todayCompleted, displayUnit);
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
  const percent = dateKey === today ? clampPercent(todayPercent) : totalActions === 0 ? 0 : clampPercent((completedActions / totalActions) * 100);
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

function isCalendarGoalCompletedByTarget(goal: ProgressGoal, dateKey: string): boolean {
  return getCalendarGoalValueAtEndOfDate(goal, dateKey) >= goal.targetValue;
}

function isCalendarGoalDailySuccess(goal: ProgressGoal, dateKey: string): boolean {
  const metrics = getGoalDailyMetrics(goal, dateKey);

  return metrics.dailyPlan <= 0 || metrics.todayCompleted >= metrics.dailyPlan || metrics.totalCompleted >= metrics.targetAmount;
}

function getCalendarRequiredForDate(goal: ProgressGoal, dateKey: string): number {
  return getGoalDailyMetrics(goal, dateKey).dailyPlan;
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
      return isCalendarGoalDailySuccess(goal, dateKey);
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
      const metrics = getGoalDailyMetrics(goal, dateKey);
      const completed = metrics.totalCompleted >= metrics.targetAmount;
      const overRatio = metrics.dailyPlan <= 0 ? (completed ? Number.POSITIVE_INFINITY : 0) : metrics.todayCompleted / metrics.dailyPlan;

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
      return {
        type: "goal" as const,
        goal,
        id: goal.id,
        groupName: normalizeActionGroupName(goal.groupName) || undefined,
        sortOrder: goal.sortOrder ?? index + 1,
        completed: goal.currentValue >= goal.targetValue,
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

function useTelegramNativeMainButton({
  active,
  text,
  disabled,
  loading = false,
  onClick,
}: {
  active: boolean;
  text: string;
  disabled: boolean;
  loading?: boolean;
  onClick: () => void;
}): boolean {
  const available = isTelegramMiniApp() && hasTelegramMainButton();

  useEffect(() => {
    if (!active || !available) {
      return undefined;
    }

    return setupTelegramMainButton({
      visible: true,
      text,
      disabled,
      loading,
      onClick,
    });
  }, [active, available, disabled, loading, onClick, text]);

  return active && available;
}

const WIDE_LAYOUT_QUERY = "(min-width: 820px)";

function getWideLayoutMatch(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(WIDE_LAYOUT_QUERY).matches;
}

function useWideLayoutMode(): boolean {
  const [wide, setWide] = useState(getWideLayoutMatch);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(WIDE_LAYOUT_QUERY);
    const update = () => setWide(mediaQuery.matches);

    update();
    mediaQuery.addEventListener?.("change", update);

    return () => mediaQuery.removeEventListener?.("change", update);
  }, []);

  return wide;
}

export default function App() {
  const [today, setToday] = useState(() => todayKey());
  const [appState, setAppState] = useState<AppState>(() => loadAppState());
  const [dayRecords, setDayRecords] = useState(() => loadDailyRecords());
  const [directionCheckIns, setDirectionCheckIns] = useState(() => loadDirectionCheckIns());
  const [pendingDirectionAdjustment, setPendingDirectionAdjustment] = useState<DirectionCheckInCandidate | null>(null);
    const [progressSheet, setProgressSheet] = useState<ProgressSheetState>(null);
    const [actionSheet, setActionSheet] = useState<ActionSheetState>(null);
    const [deleteState, setDeleteState] = useState<DeleteState>(null);
    const [editState, setEditState] = useState<EditState>(null);
    const [timerNow, setTimerNow] = useState(() => Date.now());
    const [subitemsSheetTaskId, setSubitemsSheetTaskId] = useState<string | null>(null);
    const [subitemsPanelActivity, setSubitemsPanelActivity] = useState(0);
    const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [aiCreateOpen, setAiCreateOpen] = useState(false);
  const [todaySearchOpen, setTodaySearchOpen] = useState(false);
  const [todaySearchQuery, setTodaySearchQuery] = useState("");
  const [todayListSettingsOpen, setTodayListSettingsOpen] = useState(false);
  const [todaySortMode, setTodaySortMode] = useState<TodaySortMode>("manual");
  const [todayGroupMode, setTodayGroupMode] = useState<TodayGroupMode>("group");
  const [todayFilterModes, setTodayFilterModes] = useState<TodayFilterMode[]>([]);
  const [todayOverviewMode, setTodayOverviewMode] = useState<TodayOverviewMode>("day");
  const [carryOverOpen, setCarryOverOpen] = useState(false);
  const [viewAllSheet, setViewAllSheet] = useState<ViewAllState>(null);
  const [activeScreen, setActiveScreen] = useState<AppScreen>("today");
  const [carryOverMessageIndex, setCarryOverMessageIndex] = useState(0);
  const previousScreenRef = useRef<AppScreen>("today");
  const carryOverScreenRef = useRef<AppScreen>("today");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [onboardingQuest, setOnboardingQuest] = useState<OnboardingQuestState>(() => loadOnboardingQuestState());
  const [questMasteredVisible, setQuestMasteredVisible] = useState(false);
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(() => getTelegramUser());
  const [telegramStatus, setTelegramStatus] = useState<TelegramConnectionStatus>(() => getTelegramConnectionStatus());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    hasRemotePersistence() ? "loading" : import.meta.env.PROD ? "missing-env" : "local",
  );
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const wideLayoutMode = useWideLayoutMode();
  const bottomNavSuppressed = Boolean(
    resetConfirmOpen ||
      progressSheet ||
      actionSheet ||
      deleteState ||
      editState ||
      addSheetOpen ||
      aiCreateOpen ||
      todayListSettingsOpen ||
      carryOverOpen ||
      viewAllSheet ||
      subitemsSheetTaskId,
  );
  const shellClassName = `app-shell ${telegramStatus === "connected" ? "is-telegram-shell" : "is-browser-shell"} ${
    wideLayoutMode ? "is-wide-shell" : "is-compact-shell"
  } ${bottomNavSuppressed ? "has-nav-suppressed" : ""}`;
  const activeProfileCopy = profileCopy[settings.language];
  const activeUiCopy = uiCopy[settings.language];
  const activeTodayOrientationCopy = productLanguage[settings.language].todayOrientation;
  const activeDate = getActiveDate(selectedDate, today);
  const activeDateDate = useMemo(() => parseDateKey(activeDate), [activeDate]);
  const activeDateState = useMemo(() => getEffectiveStateForDate(appState, activeDate), [activeDate, appState]);
  const actualTodayState = useMemo(() => getEffectiveStateForDate(appState, today), [appState, today]);
  const activeDateLabel = useMemo(() => formatTodayDate(activeDateDate, settings.language), [activeDateDate, settings.language]);
  const todayHeaderLabel = useMemo(() => formatTodayHeaderLabel(activeDateDate, settings.language, todayOverviewMode), [activeDateDate, settings.language, todayOverviewMode]);
  const inlinePeriodDates = useMemo(
    () => {
      if (todayOverviewMode === "day") {
        return [];
      }

      const weeks = getPeriodOverviewWeeks(activeDateDate, todayOverviewMode);

      if (todayOverviewMode === "month") {
        return weeks.map((week) => week[0]).filter(Boolean);
      }

      return weeks.flat();
    },
    [activeDateDate, todayOverviewMode],
  );
  const periodSourceDateKeys = useMemo(() => {
    if (todayOverviewMode === "day") {
      return [];
    }

    return getPeriodOverviewWeeks(activeDateDate, todayOverviewMode).flat().map((date) => toDateKey(date));
  }, [activeDateDate, todayOverviewMode]);
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
  const periodTasks = useMemo(() => {
    if (periodSourceDateKeys.length === 0) {
      return visibleTodayTasks;
    }

    const tasksById = new Map<string, TaskItem>();

    periodSourceDateKeys.forEach((dateKey) => {
      getScheduledTasksForDate(appState, dateKey).forEach((task) => {
        if (!tasksById.has(task.id)) {
          tasksById.set(task.id, task);
        }
      });
    });

    return sortTasksForToday(Array.from(tasksById.values()), activeDate);
  }, [activeDate, appState, periodSourceDateKeys, visibleTodayTasks]);
  const periodOverviewActive = periodSourceDateKeys.length > 0;
  const actionListTasks = periodOverviewActive ? periodTasks : visibleTodayTasks;
  const actionListGoals = periodOverviewActive ? [] : sortedTodayGoals;
  const groupedTodayActions = useMemo(
    () => groupTodayActions(actionListTasks, actionListGoals, activeDate),
    [activeDate, actionListGoals, actionListTasks],
  );
  const normalizedTodaySearch = todaySearchQuery.trim().toLocaleLowerCase();
  const displayedTodayActionGroups = useMemo(() => {
    const getItemTitle = (item: TodayActionItem) => (item.type === "task" ? item.task.title : item.goal.title);
    const getItemScore = (item: TodayActionItem) => {
      if (item.type === "task") {
        if (hasTaskSubitems(item.task)) {
          const progress = getTaskSubitemProgress(item.task, activeDate);
          return progress.total > 0 ? (progress.completed / progress.total) * 100 : item.completed ? 100 : 0;
        }

        return item.completed ? 100 : 0;
      }

      const metrics = getGoalDailyMetrics(item.goal, activeDate);
      return metrics.dailyPlan > 0 ? clampPercent((metrics.todayCompleted / metrics.dailyPlan) * 100) : metrics.progressPercent;
    };
    const getItemGroup = (item: TodayActionItem): Pick<TodayActionGroup, "key" | "title" | "order"> => {
      if (todayGroupMode === "none") {
        return { key: "all", title: undefined, order: 0 };
      }

      if (todayGroupMode === "type") {
        return item.type === "task"
          ? { key: "type:checkbox", title: settings.language === "en" ? "Checklist" : "Чек-бокс", order: 1 }
          : { key: "type:quantity", title: settings.language === "en" ? "Quantity" : "С прогрессом", order: 2 };
      }

      if (todayGroupMode === "status") {
        return item.completed
          ? { key: "status:done", title: settings.language === "en" ? "Done" : "Выполнено", order: 2 }
          : { key: "status:active", title: settings.language === "en" ? "Active" : "В работе", order: 1 };
      }

      if (todayGroupMode === "subitems") {
        if (item.type === "task" && hasTaskSubitems(item.task)) {
          return { key: "subitems:with", title: settings.language === "en" ? "With list" : "С доп. списком", order: 1 };
        }

        if (item.type === "task") {
          return { key: "subitems:simple", title: settings.language === "en" ? "Simple checkbox" : "Обычные чек-боксы", order: 2 };
        }

        return { key: "subitems:quantity", title: settings.language === "en" ? "Quantity" : "С прогрессом", order: 3 };
      }

      const title = normalizeActionGroupName(item.groupName);
      return {
        key: `group:${title.toLocaleLowerCase()}`,
        title: title || undefined,
        order: item.sortOrder,
      };
    };
    const matchesFilter = (item: TodayActionItem) => {
      if (todayFilterModes.length === 0) {
        return true;
      }

      return todayFilterModes.some((mode) => {
        if (mode === "checkbox") {
          return item.type === "task";
        }

        if (mode === "quantity") {
          return item.type === "goal";
        }

        if (mode === "subitems") {
          return item.type === "task" && hasTaskSubitems(item.task);
        }

        if (mode === "active") {
          return !item.completed;
        }

        if (mode === "done") {
          return item.completed;
        }

        return getItemScore(item) < 100;
      });
    };
    const matchesSearch = (item: TodayActionItem, groupTitle?: string) => {
      if (!normalizedTodaySearch) {
        return true;
      }

      const source =
        item.type === "task"
          ? `${item.task.title} ${item.task.groupName ?? ""} ${item.task.note ?? ""} ${item.task.emoji ?? ""}`
          : `${item.goal.title} ${item.goal.groupName ?? ""} ${item.goal.note ?? ""} ${item.goal.emoji ?? ""} ${item.goal.unit}`;

      return `${groupTitle} ${source}`.toLocaleLowerCase().includes(normalizedTodaySearch);
    };
    const sortItems = (items: TodayActionItem[]) => {
      return [...items].sort((left, right) => {
        if (todaySortMode === "alphabet") {
          return getItemTitle(left).localeCompare(getItemTitle(right)) || left.sortOrder - right.sortOrder;
        }

        if (todaySortMode === "top") {
          return getItemScore(right) - getItemScore(left) || getItemTitle(left).localeCompare(getItemTitle(right));
        }

        if (todaySortMode === "antiTop") {
          return getItemScore(left) - getItemScore(right) || getItemTitle(left).localeCompare(getItemTitle(right));
        }

        if (todaySortMode === "type") {
          return (left.type === "task" ? 0 : 1) - (right.type === "task" ? 0 : 1) || left.sortOrder - right.sortOrder;
        }

        if (left.completed !== right.completed) {
          return left.completed ? 1 : -1;
        }

        return left.sortOrder - right.sortOrder || left.index - right.index;
      });
    };
    const grouped = new Map<string, TodayActionGroup>();

    groupedTodayActions
      .flatMap((group) => group.items.map((item) => ({ item, groupTitle: group.title })))
      .filter(({ item, groupTitle }) => matchesFilter(item) && matchesSearch(item, groupTitle))
      .forEach(({ item }) => {
        const group = getItemGroup(item);
        const existing = grouped.get(group.key);

        if (existing) {
          existing.items.push(item);
          existing.order = Math.min(existing.order, group.order);
          return;
        }

        grouped.set(group.key, {
          ...group,
          items: [item],
        });
      });

    return Array.from(grouped.values())
      .map((group) => ({ ...group, items: sortItems(group.items) }))
      .sort((first, second) => first.order - second.order || (first.title ?? "").localeCompare(second.title ?? ""))
      .filter((group) => group.items.length > 0);
  }, [activeDate, groupedTodayActions, normalizedTodaySearch, periodOverviewActive, settings.language, todayFilterModes, todayGroupMode, todaySortMode]);
  const hasActiveDateItems = actionListGoals.length > 0 || actionListTasks.length > 0;
  const displayedTodayItemCount = displayedTodayActionGroups.reduce((count, group) => count + group.items.length, 0);
  const hasDisplayedTodayItems = displayedTodayActionGroups.some((group) => group.items.length > 0);
  const hasPeriodGridItems = periodOverviewActive && displayedTodayActionGroups.some((group) => group.items.some((item) => item.type === "task"));
  const actionCardWidthPercent = hasPeriodGridItems ? 100 : Math.max(78, 84 - Math.max(0, displayedTodayItemCount - 4) * 2);
  const actionListStyle = {
    "--action-card-width": `${actionCardWidthPercent}%`,
    "--action-card-count": displayedTodayItemCount,
    ...(hasPeriodGridItems ? { "--period-days": inlinePeriodDates.length } : {}),
  } as CSSProperties;
  const todayListSettingsActive = todaySortMode !== "manual" || todayGroupMode !== "group" || todayFilterModes.length > 0;

  useEffect(() => {
    if (!subitemsSheetTaskId) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSubitemsSheetTaskId((currentTaskId) => (currentTaskId === subitemsSheetTaskId ? null : currentTaskId));
    }, 6500);

    return () => window.clearTimeout(timeoutId);
  }, [subitemsPanelActivity, subitemsSheetTaskId]);

  useEffect(() => {
    const previousScreen = carryOverScreenRef.current;

    if (previousScreen !== activeScreen && activeScreen === "today") {
      setCarryOverMessageIndex((current) => current + 1);
    }

    carryOverScreenRef.current = activeScreen;
  }, [activeScreen]);

  const viewAllGoals = useMemo(
    () => activeDateState.goals.filter((goal) => isGoalDueOnDate(goal, activeDateDate, activeDate) || goal.currentValue >= goal.targetValue),
    [activeDate, activeDateDate, activeDateState.goals],
  );
  const carryOverCandidates = useMemo(
    () => (activeDate === today && settings.carryOversEnabled ? getCarryOverCandidates(appState, today, settings.language) : []),
    [activeDate, appState, settings.carryOversEnabled, settings.language, today],
  );
  const rhythmWeekTrend = useMemo(() => {
    const recordMap = new Map(dayRecords.map((record) => [record.date, clampPercent(record.percent)]));

    return getWeekRange(activeDateDate).map((date) => {
      const dateKey = toDateKey(date);

      if (dateKey === activeDate) {
        return daily.percent;
      }

      return recordMap.get(dateKey) ?? 0;
    });
  }, [activeDate, activeDateDate, daily.percent, dayRecords]);
  const telegramBackVisible =
    settings.onboardingCompleted &&
    Boolean(
      resetConfirmOpen ||
        progressSheet ||
        actionSheet ||
        deleteState ||
        editState ||
        addSheetOpen ||
        aiCreateOpen ||
        todayListSettingsOpen ||
        carryOverOpen ||
        viewAllSheet ||
        isSelectedDateMode,
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
    return setupTelegramBackButton(telegramBackVisible, () => {
      if (closeTelegramBackTarget()) {
        return;
      }

      if (isSelectedDateMode) {
        returnToCalendar();
        return;
      }

      if (previousScreenRef.current !== activeScreen) {
        setActiveScreen(previousScreenRef.current);
      }
    });
  }, [
    actionSheet,
    activeScreen,
    addSheetOpen,
    aiCreateOpen,
    carryOverOpen,
    deleteState,
    editState,
    isSelectedDateMode,
    progressSheet,
    resetConfirmOpen,
    settings.language,
    telegramBackVisible,
    todayListSettingsOpen,
    viewAllSheet,
  ]);

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
          telegramNotification("error");
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
    saveDirectionCheckIns(directionCheckIns);
  }, [directionCheckIns]);

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
    saveOnboardingQuestState(onboardingQuest);
  }, [onboardingQuest]);

  useEffect(() => {
    if (!onboardingQuest.enabled || onboardingQuest.hidden || !onboardingQuest.finished) {
      return;
    }

    setQuestMasteredVisible(true);
    const toastTimeout = window.setTimeout(() => setQuestMasteredVisible(false), 1800);
    const hideTimeout = window.setTimeout(() => {
      setOnboardingQuest((current) => ({
        ...current,
        enabled: false,
        hidden: true,
      }));
    }, 1500);

    return () => {
      window.clearTimeout(toastTimeout);
      window.clearTimeout(hideTimeout);
    };
  }, [onboardingQuest.enabled, onboardingQuest.finished, onboardingQuest.hidden]);

  useEffect(() => {
    function handleQuestEvent(event: Event) {
      const detail = (event as CustomEvent<{ type?: unknown }>).detail;

      if (isOnboardingQuestStep(detail?.type)) {
        completeOnboardingQuestStep(detail.type);
      }
    }

    window.addEventListener("chexar:onboarding-event", handleQuestEvent);

    return () => window.removeEventListener("chexar:onboarding-event", handleQuestEvent);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setTimerNow(Date.now()), 60000);

    return () => window.clearInterval(intervalId);
  }, []);

  function startOnboardingQuest(enabled: boolean) {
    setOnboardingQuest(createOnboardingQuestState(enabled));
  }

  function hideOnboardingQuest() {
    setOnboardingQuest((current) => ({
      ...current,
      enabled: false,
      hidden: true,
    }));
  }

  function restartOnboardingQuest() {
    setOnboardingQuest(createOnboardingQuestState(true));
    setActiveScreen("today");
  }

  function completeOnboardingQuestStep(step: OnboardingQuestStep) {
    setOnboardingQuest((current) => {
      if (!current.enabled || current.hidden || current.finished || !canCompleteOnboardingQuestStep(step, current.completedSteps)) {
        return current;
      }

      const completedSteps = [...current.completedSteps, step];

      return {
        ...current,
        completedSteps,
        finished: onboardingQuestSteps.every((questStep) => completedSteps.includes(questStep)),
      };
    });
  }

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

  function closeTelegramBackTarget(): boolean {
    if (viewAllSheet) {
      setViewAllSheet(null);
      return true;
    }

    if (carryOverOpen) {
      setCarryOverOpen(false);
      return true;
    }

    if (todayListSettingsOpen) {
      setTodayListSettingsOpen(false);
      return true;
    }

    if (aiCreateOpen) {
      setAiCreateOpen(false);
      return true;
    }

    if (addSheetOpen) {
      void showTelegramConfirm(settings.language === "en" ? "Discard unsaved changes?" : "Закрыть без сохранения?").then((confirmed) => {
        if (confirmed) {
          setAddSheetOpen(false);
        }
      });
      return true;
    }

    if (editState) {
      void showTelegramConfirm(settings.language === "en" ? "Discard unsaved changes?" : "Закрыть без сохранения?").then((confirmed) => {
        if (confirmed) {
          setEditState(null);
          setPendingDirectionAdjustment(null);
        }
      });
      return true;
    }

    if (deleteState) {
      setDeleteState(null);
      return true;
    }

    if (actionSheet) {
      setActionSheet(null);
      return true;
    }

    if (subitemsSheetTaskId) {
      setSubitemsSheetTaskId(null);
      return true;
    }

    if (progressSheet) {
      setProgressSheet(null);
      return true;
    }

    if (resetConfirmOpen) {
      setResetConfirmOpen(false);
      return true;
    }

    return false;
  }

  function resetDemoData() {
    const emptyState = createEmptyState();
    const emptyRecords = createEmptyDailyRecords();

    resetChexarStorage();
    setAppState(emptyState);
    setDayRecords(emptyRecords);
    setDirectionCheckIns([]);
    saveAppState(emptyState);
    saveDailyRecords(emptyRecords);
    setSettings((current) => ({
      ...current,
      onboardingCompleted: false,
    }));
    setOnboardingQuest(createOnboardingQuestState(false));
    setQuestMasteredVisible(false);
    setResetConfirmOpen(false);
    setAddSheetOpen(false);
    setProgressSheet(null);
      setDeleteState(null);
      setEditState(null);
      setPendingDirectionAdjustment(null);
      setActionSheet(null);
      setViewAllSheet(null);
      setCarryOverOpen(false);
      setSubitemsSheetTaskId(null);
    setSelectedDate(null);
    setActiveScreen("today");
  }

    async function deleteActionForPeriod() {
      if (!deleteState) {
        return;
      }

      const confirmed = await showTelegramConfirm(
        settings.language === "en"
          ? "Delete action? This will delete the action and its progress."
          : "Удалить действие? Это удалит действие и его прогресс.",
      );

      if (!confirmed) {
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

    async function deleteActionForActiveDate() {
      if (!deleteState) {
        return;
      }

      const confirmed = await showTelegramConfirm(
        settings.language === "en" ? "Remove action only from this day?" : "Удалить действие только на этот день?",
      );

      if (!confirmed) {
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
      telegramNotification("success");
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
      telegramNotification("success");
    }

  function addProgress(goalId: string, amount: number, note?: string) {
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    telegramImpact("light");
    setAppState((state) => {
      let completedCarryOver = false;
      const goals = state.goals.map((goal) => {
        if (goal.id !== goalId) {
          return goal;
        }

        const carryOverOccurrence = (state.occurrences ?? []).find(
          (occurrence) => occurrence.itemType === "goal" && occurrence.itemId === goalId && occurrence.date === activeDate && occurrence.source === "carry_over" && occurrence.status !== "skipped",
        );
        const nextGoalValue = goal.currentValue + amount;
        const completedNow = goal.currentValue < goal.targetValue && nextGoalValue >= goal.targetValue;
        const completedAt = completedNow ? new Date().toISOString() : goal.completedAtByDate?.[activeDate];
        const lateDates = new Set(goal.lateDates ?? []);

        if (completedNow && completedAt && isLateForDueTime(activeDate, goal.dueTime, completedAt)) {
          lateDates.add(activeDate);
        }

        completedCarryOver = Boolean(carryOverOccurrence) && nextGoalValue >= goal.targetValue;

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
    completeOnboardingQuestStep("numericProgressEntered");
  }

  function setGoalProgressForDate(goalId: string, dateKey: string, nextAmount: number, note?: string) {
    if (!Number.isFinite(nextAmount) || nextAmount < 0) {
      return;
    }

    telegramImpact("light");
    setAppState((state) => {
      let completedCarryOver = false;
      const goals = state.goals.map((goal) => {
        if (goal.id !== goalId) {
          return goal;
        }

        const normalizedAmount = Math.max(nextAmount, 0);
        const previousLogged = getCalendarLoggedAmount(goal, dateKey);
        const delta = normalizedAmount - previousLogged;
        const carryOverOccurrence = (state.occurrences ?? []).find(
          (occurrence) => occurrence.itemType === "goal" && occurrence.itemId === goalId && occurrence.date === dateKey && occurrence.source === "carry_over" && occurrence.status !== "skipped",
        );
        const nextCurrentValue = Math.max(goal.currentValue + delta, 0);
        const completedForDay = nextCurrentValue >= goal.targetValue;
        const completedAtByDate = { ...(goal.completedAtByDate ?? {}) };
        const lateDates = new Set(goal.lateDates ?? []);
        const completedAt = completedForDay ? (completedAtByDate[dateKey] ?? new Date().toISOString()) : undefined;

        if (completedAt) {
          completedAtByDate[dateKey] = completedAt;

          if (isLateForDueTime(dateKey, goal.dueTime, completedAt)) {
            lateDates.add(dateKey);
          } else {
            lateDates.delete(dateKey);
          }
        } else {
          delete completedAtByDate[dateKey];
          lateDates.delete(dateKey);
        }

        completedCarryOver = Boolean(carryOverOccurrence) && completedForDay;

        return {
          ...goal,
          currentValue: nextCurrentValue,
          progressEntries: [
            ...goal.progressEntries.filter((entry) => entry.date !== dateKey),
            ...(normalizedAmount > 0
              ? [
                  {
                    id: createId("entry"),
                    date: dateKey,
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
          occurrence.itemId === goalId && occurrence.date === dateKey
            ? { ...occurrence, status: completedCarryOver ? "completed" : "active" }
            : occurrence,
        ),
      };
    });
    if (nextAmount > 0) {
      completeOnboardingQuestStep("numericProgressEntered");
    }
  }

  function setProgressForDate(goalId: string, nextAmount: number, note?: string) {
    setGoalProgressForDate(goalId, activeDate, nextAmount, note);
  }

  function isSubitemStateEmpty(state: ActionSubitemState): boolean {
    return state.completed !== true && Number(state.count ?? 0) <= 0;
  }

  function getCompleteSubitemState(subitem: ActionSubitem): ActionSubitemState {
    if (subitem.targetCount && subitem.targetCount > 1) {
      return {
        count: subitem.targetCount,
        completed: true,
      };
    }

    return { completed: true };
  }

  function isActionSubitemComplete(subitem: ActionSubitem, state: ActionSubitemState | undefined): boolean {
    if (subitem.targetCount && subitem.targetCount > 1) {
      return Number(state?.count ?? 0) >= subitem.targetCount;
    }

    return state?.completed === true;
  }

  function areTaskSubitemsComplete(subitems: ActionSubitem[], dayState: Record<string, ActionSubitemState>): boolean {
    return subitems.length > 0 && subitems.every((subitem) => isActionSubitemComplete(subitem, dayState[subitem.id]));
  }

  function getNextSubitemClickState(subitem: ActionSubitem, currentState: ActionSubitemState): ActionSubitemState {
    if (subitem.targetCount && subitem.targetCount > 1) {
      const target = subitem.targetCount;
      const currentCount = Math.min(Number(currentState.count ?? 0), target);
      const nextCount = currentCount >= target ? 0 : Math.min(currentCount + 1, target);

      return {
        count: nextCount,
        completed: nextCount >= target,
      };
    }

    return { completed: currentState.completed !== true };
  }

  function toggleGoalCompletedForDate(goalId: string, dateKey: string, completed: boolean) {
    const goal = appState.goals.find((item) => item.id === goalId);

    if (!goal) {
      return;
    }

    const required = getCalendarRequiredForDate(goal, dateKey);
    const remainingToTarget = Math.max(goal.targetValue - getCalendarGoalValueBeforeDate(goal, dateKey), 1);
    setGoalProgressForDate(goalId, dateKey, completed ? Math.max(remainingToTarget, required, 1) : 0);
  }

  function setTaskCompletedForDate(taskId: string, dateKey: string, completed: boolean) {
    telegramImpact("light");
    setAppState((state) => ({
      ...state,
      tasks: state.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const completedDates = new Set(task.completedDates ?? []);
        const subitems = task.subitems ?? [];
        const subitemStateByDate = { ...(task.subitemStateByDate ?? {}) };

        if (completed) {
          completedDates.add(dateKey);
          if (subitems.length > 0) {
            subitemStateByDate[dateKey] = Object.fromEntries(subitems.map((subitem) => [subitem.id, getCompleteSubitemState(subitem)]));
          }
        } else {
          completedDates.delete(dateKey);
          if (subitems.length > 0) {
            delete subitemStateByDate[dateKey];
          }
        }

        const completedAtByDate = { ...(task.completedAtByDate ?? {}) };
        const lateDates = new Set(task.lateDates ?? []);
        const completedAt = completed ? new Date().toISOString() : undefined;

        if (completedAt) {
          completedAtByDate[dateKey] = completedAt;

          if (isLateForDueTime(dateKey, task.dueTime, completedAt)) {
            lateDates.add(dateKey);
          } else {
            lateDates.delete(dateKey);
          }
        } else {
          delete completedAtByDate[dateKey];
          lateDates.delete(dateKey);
        }

        return {
          ...task,
          completed: completedDates.has(today),
          completedDates: Array.from(completedDates).sort(),
          completedAtByDate: Object.keys(completedAtByDate).length > 0 ? completedAtByDate : undefined,
          lateDates: Array.from(lateDates).sort(),
          subitemStateByDate: Object.keys(subitemStateByDate).length > 0 ? subitemStateByDate : undefined,
        };
      }),
      occurrences: (state.occurrences ?? []).map((occurrence) =>
        occurrence.itemId === taskId && occurrence.date === dateKey
          ? { ...occurrence, status: completed ? "completed" : "active" }
          : occurrence,
      ),
    }));
    if (completed) {
      completeOnboardingQuestStep("taskCompleted");
    }
  }

  function setTaskCompleted(taskId: string, completed: boolean) {
    setTaskCompletedForDate(taskId, activeDate, completed);
  }

  function updateTaskSubitem(taskId: string, subitemId: string, nextState: ActionSubitemState) {
    setAppState((state) => {
      let occurrenceCompleted = false;
      const tasks = state.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const subitems = task.subitems ?? [];
        const dayState: Record<string, ActionSubitemState> = {
          ...(task.subitemStateByDate?.[activeDate] ?? {}),
        };
        if (isSubitemStateEmpty(nextState)) {
          delete dayState[subitemId];
        } else {
          dayState[subitemId] = nextState;
        }
        const subitemStateByDate = { ...(task.subitemStateByDate ?? {}) };
        if (Object.keys(dayState).length > 0) {
          subitemStateByDate[activeDate] = dayState;
        } else {
          delete subitemStateByDate[activeDate];
        }
        const allComplete = areTaskSubitemsComplete(subitems, dayState);
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
          subitemStateByDate: Object.keys(subitemStateByDate).length > 0 ? subitemStateByDate : undefined,
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
    const dayState = task.subitemStateByDate?.[activeDate] ?? {};
    const nextState = getNextSubitemClickState(subitem, currentState);
    const nextDayState = { ...dayState, [subitemId]: nextState };
    if (isSubitemStateEmpty(nextState)) {
      delete nextDayState[subitemId];
    }
    const willCompleteAll = areTaskSubitemsComplete(task.subitems ?? [], nextDayState);

    telegramImpact("light");
    updateTaskSubitem(taskId, subitemId, nextState);
    if (willCompleteAll) {
      completeOnboardingQuestStep("taskCompleted");
    }
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
    periodType: GoalPeriodType;
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
          periodType: goal.periodType,
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
    telegramNotification("success");
    completeOnboardingQuestStep("taskCreated");
    completeOnboardingQuestStep("questTaskCreated");
    completeOnboardingQuestStep("quantitativeGoalCreated");
    if (goal.dueTime) {
      completeOnboardingQuestStep("dueTimeActionCreated");
    }
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
    telegramNotification("success");
    completeOnboardingQuestStep("taskCreated");
    completeOnboardingQuestStep("questTaskCreated");
    if (task.subitems && task.subitems.length > 0) {
      completeOnboardingQuestStep("subitemListCreated");
    }
    if (task.dueTime) {
      completeOnboardingQuestStep("dueTimeActionCreated");
    }
  }

  function createActionFromAiDraft(draft: AiActionDraft) {
    const title = draft.title.trim();
    if (!title) {
      return;
    }

    const period: ActionPeriod = draft.period === "custom" ? "month" : draft.period;
    const generatedDates = getPeriodDates(activeDate, period, activeDate, addDays(activeDate, 29));
    const draftStartDate = normalizeAiDateKey(draft.start_date);
    const draftEndDate = normalizeAiDateKey(draft.end_date);
    const dates = {
      startDate: draftStartDate ?? generatedDates.startDate,
      endDate: draftEndDate ?? draftStartDate ?? generatedDates.endDate,
    };
    const repeatMode: GoalRepeatMode =
      draft.repeat_mode === "weekdays" ? "weekdays" : draft.repeat_mode === "selected_days" ? "selectedDays" : "everyDay";
    const taskRepeatMode: TaskRepeatMode = draft.tracking_type === "checkbox" && period === "today" ? "once" : repeatMode;
    const emoji = normalizeEmojiChoice(draft.icon ?? "") ?? inferAiEmoji(`${draft.title} ${draft.unit ?? ""}`);

    if (draft.tracking_type === "quantity") {
      const targetValue = Number(draft.target_value);
      const normalizedTargetValue = Number.isFinite(targetValue) && targetValue > 0 ? targetValue : 50;
      const unit = normalizeSemanticQuantityUnit({
        title,
        unit: draft.unit,
        sourceText: `${draft.title} ${draft.unit ?? ""}`,
        fallbackUnit: settings.language === "en" ? "times" : "раз",
        targetValue: normalizedTargetValue,
        language: settings.language,
        mode: "draft",
      });

      createGoal({
        title,
        emoji,
        targetValue: normalizedTargetValue,
        currentValue: 0,
        unit,
        periodType: period,
        startDate: dates.startDate,
        endDate: dates.endDate,
        repeatMode,
        selectedDays: repeatMode === "selectedDays" ? defaultGoalSelectedDays : undefined,
        dueTime: normalizeDueTimeInput(draft.due_time ?? ""),
        quickAddValues: getDefaultQuickValues(unit),
      });
      return;
    }

    const subitems = normalizeAiSubitems({ subitems: draft.subitems ?? [] }, title).map((subitem, index) => ({
      id: createId("subitem"),
      title: subitem.title,
      targetCount: subitem.target && subitem.target > 1 ? subitem.target : undefined,
      sortOrder: index + 1,
    }));

    createTask({
      title,
      emoji,
      startDate: dates.startDate,
      endDate: dates.endDate,
      repeatMode: taskRepeatMode,
      selectedDays: taskRepeatMode === "selectedDays" ? defaultGoalSelectedDays : undefined,
      dueTime: normalizeDueTimeInput(draft.due_time ?? ""),
      subitems: subitems.length > 0 ? subitems : undefined,
      priority: "medium",
    });
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

  function createNextPeriodFromCarryOver(candidates: CarryOverCandidate[]) {
    const goalCandidates = candidates.filter((candidate): candidate is Extract<CarryOverCandidate, { type: "goal" }> => candidate.type === "goal");

    if (goalCandidates.length === 0) {
      return;
    }

    setAppState((state) => {
      const nextGoals = goalCandidates.reduce<ProgressGoal[]>((items, { goal }) => {
        const remaining = Math.max(goal.targetValue - goal.currentValue, 0);

        if (remaining <= 0) {
          return items;
        }

        const periodLength = Math.max(daysInclusive(goal.startDate, goal.endDate), 1);

        items.push({
          ...goal,
          id: createId("goal"),
          targetValue: remaining,
          currentValue: 0,
          startDate: today,
          endDate: addDays(today, periodLength - 1),
          progressEntries: [],
          completedAtByDate: undefined,
          lateDates: undefined,
          sortOrder: state.goals.length + items.length + 1,
        });

        return items;
      }, []);

      return {
        ...state,
        goals: [...state.goals, ...nextGoals],
      };
    });
    telegramNotification("success");
  }

  function selectScreen(screen: AppScreen) {
    if (screen !== activeScreen) {
      previousScreenRef.current = activeScreen;
    }
    telegramSelectionChanged();
    setSelectedDate(null);
    setActiveScreen(screen);
    if (screen === "calendar") {
      completeOnboardingQuestStep("calendarOpened");
    }
    if (screen === "progress") {
      completeOnboardingQuestStep("statsOpened");
    }
  }

  function updateLifeArea(
    itemType: "goal" | "task",
    itemId: string,
    area: LifeAreaKey | undefined,
    customLabel?: string,
  ) {
    const lifeAreaCustomLabel = area === "custom" ? customLabel?.trim().slice(0, 40) || undefined : undefined;

    setAppState((state) => {
      if (itemType === "goal") {
        return {
          ...state,
          goals: state.goals.map((goal) =>
            goal.id === itemId
              ? { ...goal, lifeAreaOverride: area, lifeAreaCustomLabel }
              : goal,
          ),
        };
      }

      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === itemId
            ? { ...task, lifeAreaOverride: area, lifeAreaCustomLabel }
            : task,
        ),
      };
    });
    telegramSelectionChanged();
  }

  function recordDirectionCheckIn(
    candidate: DirectionCheckInCandidate,
    decision: DirectionCheckInDecision,
  ) {
    const record = createDirectionCheckInRecord(
      candidate,
      decision,
      createId("direction-check-in"),
      new Date().toISOString(),
    );

    setDirectionCheckIns((records) => upsertDirectionCheckInRecord(records, record));
  }

  function openDirectionCheckInAdjustment(candidate: DirectionCheckInCandidate) {
    if (candidate.itemType === "goal") {
      const goal = appState.goals.find((item) => item.id === candidate.itemId);

      if (!goal) {
        return;
      }

      setPendingDirectionAdjustment(candidate);
      setEditState({ type: "goal", goal });
      return;
    }

    const task = appState.tasks.find((item) => item.id === candidate.itemId);

    if (!task) {
      return;
    }

    setPendingDirectionAdjustment(candidate);
    setEditState({ type: "task", task });
  }

  function openSelectedDate(dateKey: string) {
    previousScreenRef.current = activeScreen;
    telegramSelectionChanged();
    setSelectedDate(dateKey);
    setActiveScreen("today");
    setViewAllSheet(null);
  }

  function returnToCalendar() {
    previousScreenRef.current = activeScreen;
    telegramSelectionChanged();
    setSelectedDate(null);
    setActiveScreen("calendar");
    completeOnboardingQuestStep("calendarOpened");
  }

  function shiftActiveDateBySwipe(dayDelta: number) {
    const nextDate = addDays(activeDate, dayDelta);
    setSelectedDate(nextDate === today ? null : nextDate);
    setActiveScreen("today");
    setViewAllSheet(null);
  }

  return (
    <div className={shellClassName}>
      <div className="background-glow" />
      {wideLayoutMode && (
        <div className="layout-mode-badge" aria-label={settings.language === "en" ? "PC mode" : "Режим ПК"}>
          <Monitor size={12} aria-hidden="true" />
          <span>{settings.language === "en" ? "PC" : "ПК"}</span>
        </div>
      )}
      <SyncBanner status={syncStatus} copy={activeUiCopy} />
      {!settings.onboardingCompleted ? (
        <OnboardingScreen
          settings={settings}
          onSettingsChange={(nextSettings) => setSettings((current) => ({ ...current, ...nextSettings }))}
          onComplete={(showQuest) => {
            startOnboardingQuest(showQuest);
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
              onRestartOnboarding={restartOnboardingQuest}
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
            <DirectionReviewScreen
              appState={appState}
              today={today}
              language={settings.language}
              onAreaChange={updateLifeArea}
              checkInRecords={directionCheckIns}
              onCheckInFits={(candidate) => recordDirectionCheckIn(candidate, "fits")}
              onCheckInDismiss={(candidate) => recordDirectionCheckIn(candidate, "dismissed")}
              onCheckInAdjust={openDirectionCheckInAdjustment}
            />
          ) : (
            <main className="today-screen">
              <Header
                copy={activeUiCopy}
                dateLabel={todayHeaderLabel}
                dateNote={selectedDateNote}
                selectedMode={isSelectedDateMode}
                onBackToCalendar={returnToCalendar}
                onAdd={() => setAddSheetOpen(true)}
                onDateSwipe={shiftActiveDateBySwipe}
                showAdd={false}
              />
              <RhythmCard
                daily={daily}
                weekTrend={rhythmWeekTrend}
                copy={activeUiCopy}
                activeDate={activeDate}
                today={today}
                language={settings.language}
              />
              <TodayQuickMenu
                language={settings.language}
                searchOpen={todaySearchOpen}
                searchQuery={todaySearchQuery}
                settingsActive={todayListSettingsActive}
                overviewMode={todayOverviewMode}
                doneFilterActive={todayFilterModes.includes("done")}
                onAdd={() => setAddSheetOpen(true)}
                onAiCreate={() => setAiCreateOpen(true)}
                onSearchChange={setTodaySearchQuery}
                onToggleSearch={() => setTodaySearchOpen((value) => !value)}
                onOpenSettings={() => setTodayListSettingsOpen(true)}
                onOverviewModeChange={setTodayOverviewMode}
                onToggleDoneFilter={() => {
                  setTodayFilterModes((current) => (current.includes("done") ? current.filter((item) => item !== "done") : [...current, "done"]));
                }}
              />
              {carryOverCandidates.length > 0 && (
                <CarryOverBanner
                  count={carryOverCandidates.length}
                  language={settings.language}
                  messageIndex={carryOverMessageIndex}
                  onReview={() => setCarryOverOpen(true)}
                />
              )}
              <section className="section-block unified-actions-section">
                <div
                  className={`action-list ${hasPeriodGridItems ? "with-period" : ""}`}
                  style={actionListStyle}
                >
                  {onboardingQuest.enabled && !onboardingQuest.hidden && (
                    <InteractiveStartQuestBlock
                      state={onboardingQuest}
                      language={settings.language}
                      onHide={hideOnboardingQuest}
                      onCreateAction={() => setAddSheetOpen(true)}
                    />
                  )}
                  {hasPeriodGridItems && hasDisplayedTodayItems && (
                    <PeriodInlineHeader
                      mode={todayOverviewMode}
                      dates={inlinePeriodDates}
                      activeDate={activeDate}
                      today={today}
                      language={settings.language}
                      onSelectDate={openSelectedDate}
                    />
                  )}
                  {displayedTodayActionGroups.map((group) => (
                    <div
                      key={group.key || "ungrouped"}
                      data-group-key={group.key}
                      className={`action-group ${group.title ? "has-title" : "is-ungrouped"} ${
                        hasPeriodGridItems && group.items.some((groupItem) => groupItem.type === "task") ? "has-period-grid" : ""
                      }`}
                    >
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
                                nowMs={timerNow}
                                copy={activeUiCopy}
                                expanded={taskHasSubitems && subitemsSheetTaskId === task.id}
                                editLabel={activeUiCopy.editAction}
                                toggleLabel={completedToday ? activeUiCopy.undoDoneTitle : activeUiCopy.markDoneTitle}
                                onClick={() => {
                                  if (taskHasSubitems) {
                                    setSubitemsSheetTaskId((current) => (current === task.id ? null : task.id));
                                    setSubitemsPanelActivity(Date.now());
                                    return;
                                  }

                                  setActionSheet({ type: "task", task });
                                }}
                                onToggle={() => {
                                  setTaskCompleted(task.id, !completedToday);
                                }}
                                onSubitemAdvance={(subitemId) => {
                                  setSubitemsPanelActivity(Date.now());
                                  advanceTaskSubitem(task.id, subitemId);
                                }}
                                onSubitemActivity={() => setSubitemsPanelActivity(Date.now())}
                                onSubitemMove={(sourceId, targetId) => reorderTaskSubitems(task.id, sourceId, targetId)}
                                onEdit={() => setEditState({ type: "task", task })}
                                periodCells={hasPeriodGridItems ? (
                                  <PeriodInlineCells
                                    mode={todayOverviewMode}
                                    item={{ type: "task", task }}
                                    dates={inlinePeriodDates}
                                    appState={appState}
                                    today={today}
                                    onSelectDate={openSelectedDate}
                                    onToggleTaskDate={setTaskCompletedForDate}
                                    onToggleGoalDate={toggleGoalCompletedForDate}
                                  />
                                ) : undefined}
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
                  {!hasDisplayedTodayItems && (
                    <EmptySectionCard
                      title={hasActiveDateItems ? (settings.language === "en" ? "Nothing found" : "Ничего не найдено") : activeTodayOrientationCopy.emptyListTitle}
                      text={hasActiveDateItems ? (settings.language === "en" ? "Try another search query." : "Попробуй другой запрос.") : activeTodayOrientationCopy.emptyListBody}
                      buttonLabel={activeUiCopy.add}
                      onAdd={() => setAddSheetOpen(true)}
                    />
                  )}
                </div>
              </section>
              {questMasteredVisible && (
                <div className="start-quest-toast" role="status">
                  {onboardingQuestCopy[settings.language].mastered}
                </div>
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
                setProgressForDate(progressSheet.goal.id, amount, note);
                setProgressSheet(null);
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
                setTaskCompleted(actionSheet.task.id, !isTaskCompletedOnDate(actionSheet.task, activeDate));
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
                onClose={() => {
                  setEditState(null);
                  setPendingDirectionAdjustment(null);
                }}
                onDelete={() => {
                  setDeleteState(editState);
                  setEditState(null);
                  setPendingDirectionAdjustment(null);
                }}
                onSave={(update) => {
                  const adjustedCandidate =
                    pendingDirectionAdjustment &&
                    pendingDirectionAdjustment.itemType === editState.type &&
                    pendingDirectionAdjustment.itemId ===
                      (editState.type === "goal" ? editState.goal.id : editState.task.id)
                      ? pendingDirectionAdjustment
                      : null;
                  const adjustmentWasChanged = adjustedCandidate
                    ? hasEditActionChanges(editState, update)
                    : false;

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

                  if (adjustedCandidate && adjustmentWasChanged) {
                    recordDirectionCheckIn(adjustedCandidate, "adjusted");
                  }

                  setEditState(null);
                  setPendingDirectionAdjustment(null);
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

          {aiCreateOpen && (
            <AiCreationSheet
              language={settings.language}
              onClose={() => setAiCreateOpen(false)}
              onCreateDrafts={(drafts) => {
                drafts.forEach(createActionFromAiDraft);
                setAiCreateOpen(false);
              }}
            />
          )}

          {todayListSettingsOpen && (
            <TodayListSettingsSheet
              language={settings.language}
              sortMode={todaySortMode}
              groupMode={todayGroupMode}
              filterModes={todayFilterModes}
              onSortChange={setTodaySortMode}
              onGroupChange={setTodayGroupMode}
              onFilterToggle={(value) => {
                setTodayFilterModes((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
              }}
              onReset={() => {
                setTodaySortMode("manual");
                setTodayGroupMode("group");
                setTodayFilterModes([]);
              }}
              onClose={() => setTodayListSettingsOpen(false)}
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
              onCreateNextPeriod={(selected) => {
                createNextPeriodFromCarryOver(selected);
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
                setTaskCompleted(task.id, !completedToday);
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
  onComplete: (showQuest: boolean) => void;
}) {
  const copy = onboardingCopy[settings.language];
  const [showQuest, setShowQuest] = useState(true);
  const learningSprites: StartMenuSpriteType[] = ["plus", "check", "chart"];

  return (
    <main className="onboarding-screen start-menu-screen">
      <section className="start-menu-shell" aria-labelledby="start-menu-title">
        <header className="start-menu-hero">
          <span className="start-menu-brand">{copy.appLabel}</span>
          <h1 id="start-menu-title">{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </header>

        <div className="start-menu-panel" aria-label={copy.title}>
          <div className="start-menu-row">
            <div className="start-menu-row-title">
              <span className="start-menu-row-emoji" aria-hidden="true">🌐</span>
              <span>{copy.language}</span>
            </div>
            <div className="start-menu-segmented" role="group" aria-label={copy.language}>
              <button
                type="button"
                className={settings.language === "en" ? "active" : ""}
                aria-pressed={settings.language === "en"}
                aria-label={copy.english}
                onClick={() => onSettingsChange({ language: "en" })}
              >
                <span className="start-menu-flag start-menu-flag-en" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={settings.language === "ru" ? "active" : ""}
                aria-pressed={settings.language === "ru"}
                aria-label={copy.russian}
                onClick={() => onSettingsChange({ language: "ru" })}
              >
                <span className="start-menu-flag start-menu-flag-ru" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="start-menu-row">
            <div className="start-menu-row-title">
              <span className="start-menu-row-emoji" aria-hidden="true">🌓</span>
              <span>{copy.theme}</span>
            </div>
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
            className={`start-menu-toggle ${settings.hintsEnabled ? "enabled" : ""}`}
            aria-pressed={settings.hintsEnabled}
            onClick={() => onSettingsChange({ hintsEnabled: !settings.hintsEnabled })}
          >
            <span className="start-menu-toggle-icon" aria-hidden="true">💡</span>
            <span className="start-menu-toggle-copy">
              <strong>{copy.hints}</strong>
              <small>{copy.hintsText}</small>
            </span>
            <span className="start-menu-switch" aria-hidden="true">
              <span />
            </span>
          </button>
        </div>

        <section className="start-menu-guide" aria-labelledby="start-menu-guide-title">
          <h2 id="start-menu-guide-title">{copy.howItWorks}</h2>
          <div className="start-menu-guide-list">
            {copy.learningPoints.map((point, index) => {
              const spriteType = learningSprites[index] ?? "plus";

              return (
                <div className="start-menu-guide-row" key={point}>
                  <span className="start-menu-guide-icon" aria-hidden={spriteType === "check" ? undefined : true}>
                    <StartMenuSprite type={spriteType} />
                  </span>
                  <p>{point}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="start-menu-quest" aria-label={copy.questQuestion}>
          <div>
            <strong>{copy.questQuestion}</strong>
            <small>{onboardingQuestCopy[settings.language].title}</small>
          </div>
          <div className="start-menu-segmented compact" role="group" aria-label={copy.questQuestion}>
            <button type="button" className={showQuest ? "active" : ""} aria-pressed={showQuest} onClick={() => setShowQuest(true)}>
              {copy.questYes}
            </button>
            <button type="button" className={!showQuest ? "active" : ""} aria-pressed={!showQuest} onClick={() => setShowQuest(false)}>
              {copy.questNo}
            </button>
          </div>
        </section>

        <button type="button" className="start-menu-continue" onClick={() => onComplete(showQuest)}>
          {copy.continue}
        </button>
      </section>
    </main>
  );
}

type StartMenuSpriteType = "plus" | "check" | "chart";

function StartMenuSprite({ type }: { type: StartMenuSpriteType }) {
  const [checked, setChecked] = useState(true);

  if (type === "check") {
    return (
      <button
        type="button"
        className={`task-check-button start-menu-demo-check-button ${checked ? "checked" : ""}`}
        aria-label="Demo checkbox"
        aria-pressed={checked}
        onClick={(event) => {
          event.stopPropagation();
          setChecked((value) => !value);
        }}
      >
        <span className="task-check" aria-hidden="true">
          {checked && (
            <span className="task-x-mark">
              <span />
              <span />
            </span>
          )}
        </span>
      </button>
    );
  }

  if (type === "chart") {
    return <span className="start-menu-sprite start-menu-sprite-emoji">📊</span>;
  }

  return <span className="start-menu-sprite start-menu-sprite-emoji">➕</span>;
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
  showAdd = true,
}: {
  copy: UiCopy;
  dateLabel: string;
  dateNote?: string;
  selectedMode?: boolean;
  onBackToCalendar?: () => void;
  onAdd: () => void;
  onDateSwipe?: (dayDelta: number) => void;
  showAdd?: boolean;
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
        {showAdd && (
          <button className="icon-button primary-action" type="button" aria-label={copy.add} onClick={onAdd}>
            <span className="header-plus-mark" aria-hidden="true">
              <span />
              <span />
            </span>
          </button>
        )}
      </div>
    </header>
  );
}

function formatTodayHeaderLabel(date: Date, language: AppSettings["language"], mode: TodayOverviewMode): string {
  if (mode === "day") {
    return formatTodayDate(date, language);
  }

  if (mode === "week") {
    const range = getWeekRange(date);
    const start = range[0];
    const end = range[range.length - 1];
    const prefix = language === "en" ? "Week" : "Неделя";

    return `${prefix} ${getWeekOfMonth(date)} · ${formatDateLabel(toDateKey(start))}–${formatDateLabel(toDateKey(end))}`;
  }

  return formatCalendarMonth(date, language);
}

function getWeekOfMonth(date: Date): number {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

function getPeriodOverviewWeeks(date: Date, mode: TodayOverviewMode): Date[][] {
  if (mode === "day") {
    return [[date]];
  }

  if (mode === "week") {
    return [getWeekRange(date)];
  }

  const monthDays = getMonthRange(date);
  const weeks: Date[][] = [];

  for (let index = 0; index < monthDays.length; index += 7) {
    weeks.push(monthDays.slice(index, index + 7));
  }

  return weeks;
}

function PeriodInlineHeader({
  mode,
  dates,
  activeDate,
  today,
  language,
  onSelectDate,
}: {
  mode: TodayOverviewMode;
  dates: Date[];
  activeDate: string;
  today: string;
  language: AppSettings["language"];
  onSelectDate: (dateKey: string) => void;
}) {
  const labels = getCalendarWeekdayLabels(language);

  return (
    <div className={`period-inline-header mode-${mode}`} aria-label={language === "en" ? "Period dates" : "Дни периода"}>
      <div className="period-inline-left-label">
        {mode === "month" ? formatCalendarMonth(parseDateKey(activeDate), language) : formatTodayHeaderLabel(parseDateKey(activeDate), language, "week")}
      </div>
      <div className="period-inline-cells period-inline-head-cells" aria-hidden="false">
        {dates.map((date) => {
          const dateKey = toDateKey(date);
          const weekday = labels[(date.getDay() + 6) % 7];

          return (
            <button
              key={dateKey}
              type="button"
              className={`period-inline-day-head ${dateKey === activeDate ? "active" : ""} ${dateKey > today ? "future" : ""}`}
              onClick={() => onSelectDate(dateKey)}
              aria-label={`${formatDateLabel(dateKey)} ${weekday}`}
            >
              {mode === "month" ? (
                <>
                  <strong>{language === "en" ? `W${getWeekOfMonth(date)}` : `Н${getWeekOfMonth(date)}`}</strong>
                  <small>{date.getDate()}</small>
                </>
              ) : (
                <>
                  <strong>{date.getDate()}</strong>
                  <small>{weekday}</small>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PeriodInlineCells({
  mode,
  item,
  dates,
  appState,
  today,
  onSelectDate,
  onToggleTaskDate,
  onToggleGoalDate,
}: {
  mode: TodayOverviewMode;
  item: { type: "task"; task: TaskItem } | { type: "goal"; goal: ProgressGoal };
  dates: Date[];
  appState: AppState;
  today: string;
  onSelectDate: (dateKey: string) => void;
  onToggleTaskDate: (taskId: string, dateKey: string, completed: boolean) => void;
  onToggleGoalDate: (goalId: string, dateKey: string, completed: boolean) => void;
}) {
  return (
    <div className="period-inline-cells" aria-label={item.type === "task" ? item.task.title : item.goal.title}>
      {dates.map((date) => {
        const dateKey = toDateKey(date);
        const isFuture = dateKey > today;

        if (item.type === "task") {
          if (mode === "month") {
            const weekDates = getWeekRange(date).map((weekDate) => toDateKey(weekDate));
            const scheduled = weekDates
              .map((weekDateKey) => getScheduledTasksForDate(appState, weekDateKey).find((scheduledTask) => scheduledTask.id === item.task.id))
              .filter((task): task is TaskItem => Boolean(task));

            if (scheduled.length === 0) {
              return <span key={dateKey} className="period-inline-check off" aria-hidden="true" />;
            }

            const completedCount = weekDates.filter((weekDateKey) => {
              const task = getScheduledTasksForDate(appState, weekDateKey).find((scheduledTask) => scheduledTask.id === item.task.id);
              return task ? isTaskCompletedOnDate(task, weekDateKey) : false;
            }).length;
            const checked = completedCount >= scheduled.length;
            const partial = completedCount > 0 && !checked;

            return (
              <button
                key={dateKey}
                type="button"
                className={`period-inline-check week-cell ${checked ? "checked" : ""} ${partial ? "partial" : ""} ${isFuture ? "future" : ""} readonly`}
                aria-pressed={checked}
                aria-label={`${item.task.title} · ${formatDateLabel(dateKey)}`}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectDate(dateKey);
                }}
              >
                <span aria-hidden="true">{checked ? "✓" : partial ? "•" : ""}</span>
              </button>
            );
          }

          const task = getScheduledTasksForDate(appState, dateKey).find((scheduledTask) => scheduledTask.id === item.task.id);

          if (!task) {
            return <span key={dateKey} className="period-inline-check off" aria-hidden="true" />;
          }

          const checked = isTaskCompletedOnDate(task, dateKey);
          const disabled = hasTaskSubitems(task);

          return (
            <button
              key={dateKey}
              type="button"
              className={`period-inline-check ${checked ? "checked" : ""} ${isFuture ? "future" : ""} ${disabled ? "readonly" : ""}`}
              aria-pressed={checked}
              aria-label={`${task.title} · ${formatDateLabel(dateKey)}`}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();

                if (disabled) {
                  onSelectDate(dateKey);
                  return;
                }

                onToggleTaskDate(task.id, dateKey, !checked);
              }}
            >
              <span aria-hidden="true">{checked ? "✓" : ""}</span>
            </button>
          );
        }

        const goal = getScheduledGoalsForDate(appState, dateKey).find((scheduledGoal) => scheduledGoal.id === item.goal.id);

        if (!goal) {
          return <span key={dateKey} className="period-inline-check off" aria-hidden="true" />;
        }

        const checked = isCalendarGoalDailySuccess(goal, dateKey);

        return (
          <button
            key={dateKey}
            type="button"
            className={`period-inline-check ${checked ? "checked" : ""} ${isFuture ? "future" : ""}`}
            aria-pressed={checked}
            aria-label={`${goal.title} · ${formatDateLabel(dateKey)}`}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleGoalDate(goal.id, dateKey, !checked);
            }}
          >
            <span aria-hidden="true">{checked ? "✓" : ""}</span>
          </button>
        );
      })}
    </div>
  );
}

function TodayQuickMenu({
  language,
  searchOpen,
  searchQuery,
  settingsActive,
  overviewMode,
  doneFilterActive,
  onAdd,
  onAiCreate,
  onSearchChange,
  onToggleSearch,
  onOpenSettings,
  onOverviewModeChange,
  onToggleDoneFilter,
}: {
  language: AppSettings["language"];
  searchOpen: boolean;
  searchQuery: string;
  settingsActive: boolean;
  overviewMode: TodayOverviewMode;
  doneFilterActive: boolean;
  onAdd: () => void;
  onAiCreate: () => void;
  onSearchChange: (value: string) => void;
  onToggleSearch: () => void;
  onOpenSettings: () => void;
  onOverviewModeChange: (mode: TodayOverviewMode) => void;
  onToggleDoneFilter: () => void;
}) {
  const labels =
    language === "en"
      ? {
          add: "Add action",
          ai: "Create with AI",
          sort: "List settings",
          search: "Search",
          day: "Day",
          week: "Week",
          month: "Month",
          done: "Completed",
          placeholder: "Search actions",
        }
      : {
          add: "Добавить действие",
          ai: "Создать через ИИ",
          sort: "Сортировать по названию",
          search: "Поиск",
          day: "День",
          week: "Неделя",
          month: "Месяц",
          done: "Отмеченные",
          placeholder: "Поиск действий",
        };
  const overviewModeLabels: Record<TodayOverviewMode, string> = {
    day: labels.day,
    week: labels.week,
    month: labels.month,
  };
  const nextOverviewMode: Record<TodayOverviewMode, TodayOverviewMode> = {
    day: "week",
    week: "month",
    month: "day",
  };

  return (
    <div className="today-quick-menu-wrap">
      <div className="today-quick-menu" aria-label={language === "en" ? "Quick actions" : "Быстрое меню"}>
        <button
          type="button"
          className={`today-menu-button today-menu-period ${overviewMode !== "day" ? "is-active" : ""}`}
          onClick={() => onOverviewModeChange(nextOverviewMode[overviewMode])}
          aria-label={overviewModeLabels[overviewMode]}
        >
          {overviewModeLabels[overviewMode]}
        </button>
        <button
          type="button"
          className={`today-menu-button ${doneFilterActive ? "is-active" : ""}`}
          onClick={onToggleDoneFilter}
          aria-pressed={doneFilterActive}
          aria-label={labels.done}
        >
          <Check size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`today-menu-button ${settingsActive ? "is-active" : ""}`}
          onClick={onOpenSettings}
          aria-pressed={settingsActive}
          aria-label={labels.sort}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`today-menu-button ${searchOpen ? "is-active" : ""}`}
          onClick={onToggleSearch}
          aria-pressed={searchOpen}
          aria-label={labels.search}
        >
          <Search size={17} aria-hidden="true" />
        </button>
        <button type="button" className="today-menu-button today-menu-ai" onClick={onAiCreate} aria-label={labels.ai}>
          <span aria-hidden="true">🤖</span>
        </button>
        <button type="button" className="today-menu-button today-menu-add" onClick={onAdd} aria-label={labels.add}>
          <span aria-hidden="true">+</span>
        </button>
      </div>
      {searchOpen && (
        <label className="today-search-field">
          <Search size={15} aria-hidden="true" />
          <input
            value={searchQuery}
            placeholder={labels.placeholder}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      )}
    </div>
  );
}

function TodayListSettingsSheet({
  language,
  sortMode,
  groupMode,
  filterModes,
  onSortChange,
  onGroupChange,
  onFilterToggle,
  onReset,
  onClose,
}: {
  language: AppSettings["language"];
  sortMode: TodaySortMode;
  groupMode: TodayGroupMode;
  filterModes: TodayFilterMode[];
  onSortChange: (value: TodaySortMode) => void;
  onGroupChange: (value: TodayGroupMode) => void;
  onFilterToggle: (value: TodayFilterMode) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const copy =
    language === "en"
      ? {
          title: "List settings",
          subtitle: "Sort, group and filter today's actions.",
          sort: "Sort",
          group: "Group",
          filter: "Filter",
          reset: "Reset",
          sortOptions: [
            ["manual", "Manual order"],
            ["alphabet", "Alphabet"],
            ["top", "Top completion"],
            ["antiTop", "Anti-top"],
            ["type", "By type"],
          ] as Array<[TodaySortMode, string]>,
          groupOptions: [
            ["group", "By folders"],
            ["none", "One list"],
            ["type", "By type"],
            ["status", "By status"],
            ["subitems", "By sublist"],
          ] as Array<[TodayGroupMode, string]>,
          filterOptions: [
            ["checkbox", "Checkbox"],
            ["quantity", "Progress"],
            ["subitems", "With sublist"],
            ["active", "Active"],
            ["done", "Done"],
            ["behind", "Behind"],
          ] as Array<[TodayFilterMode, string]>,
        }
      : {
          title: "Настройки списка",
          subtitle: "Сортировка, группы и фильтры для задач дня.",
          sort: "Сортировка",
          group: "Группировка",
          filter: "Фильтр",
          reset: "Сбросить",
          sortOptions: [
            ["manual", "Вручную"],
            ["alphabet", "Алфавит"],
            ["top", "Топ выполнения"],
            ["antiTop", "Антитоп"],
            ["type", "По виду"],
          ] as Array<[TodaySortMode, string]>,
          groupOptions: [
            ["group", "По группам"],
            ["none", "Один список"],
            ["type", "По видам"],
            ["status", "По статусу"],
            ["subitems", "С доп. списком"],
          ] as Array<[TodayGroupMode, string]>,
          filterOptions: [
            ["checkbox", "Чек-боксы"],
            ["quantity", "Прогресс"],
            ["subitems", "С доп. списком"],
            ["active", "В работе"],
            ["done", "Выполнено"],
            ["behind", "Отстают"],
          ] as Array<[TodayFilterMode, string]>,
        };

  return (
    <BottomSheet title={copy.title} subtitle={copy.subtitle} closeLabel="Close" onClose={onClose} className="today-list-settings-sheet">
      <div className="today-settings-body">
        <TodaySettingsOptionGroup title={copy.sort} options={copy.sortOptions} value={sortMode} onChange={onSortChange} />
        <TodaySettingsOptionGroup title={copy.group} options={copy.groupOptions} value={groupMode} onChange={onGroupChange} />
        <TodaySettingsMultiOptionGroup title={copy.filter} options={copy.filterOptions} values={filterModes} onToggle={onFilterToggle} />
        <button type="button" className="today-settings-reset" onClick={onReset}>
          {copy.reset}
        </button>
      </div>
    </BottomSheet>
  );
}

function TodaySettingsMultiOptionGroup<TValue extends string>({
  title,
  options,
  values,
  onToggle,
}: {
  title: string;
  options: Array<[TValue, string]>;
  values: TValue[];
  onToggle: (value: TValue) => void;
}) {
  return (
    <section className="today-settings-group">
      <strong>{title}</strong>
      <div className="today-settings-options">
        {options.map(([optionValue, label]) => (
          <button
            type="button"
            key={optionValue}
            className={values.includes(optionValue) ? "is-active" : ""}
            aria-pressed={values.includes(optionValue)}
            onClick={() => onToggle(optionValue)}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function TodaySettingsOptionGroup<TValue extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: Array<[TValue, string]>;
  value: TValue;
  onChange: (value: TValue) => void;
}) {
  return (
    <section className="today-settings-group">
      <strong>{title}</strong>
      <div className="today-settings-options">
        {options.map(([optionValue, label]) => (
          <button
            type="button"
            key={optionValue}
            className={value === optionValue ? "is-active" : ""}
            onClick={() => onChange(optionValue)}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function AiCreationSheet({
  language,
  onClose,
  onCreateDrafts,
}: {
  language: AppSettings["language"];
  onClose: () => void;
  onCreateDrafts: (drafts: AiActionDraft[]) => void;
}) {
  const labels =
    language === "en"
      ? {
          title: "AI creation",
          subtitle: "Chat with Chexar. Nothing is saved without confirmation.",
          assistant: "I am Chexar. Tell me what you want to track, and I will ask the right questions if details are missing.",
          followup: "You can write one action or several actions, each on a new line.",
          placeholder: "Example: English 50 lessons this month",
          send: "Preview",
          sendAria: "Send message",
          loading: "Thinking...",
          preview: "Preview",
          create: (count: number) => `Create selected (${count})`,
          clear: "Clear",
          error: "AI could not parse this. Try simpler.",
          empty: "Write what you want to track first.",
          questions: ["What do you want to improve?", "For what period?", "How will you mark progress?"],
          samples: ["English: 50 lessons this month", "Morning exercise every day before 11:00", "Read 1000 pages in a month"],
          checkbox: "checkbox",
          quantity: "quantity",
          today: "today",
          week: "week",
          month: "month",
          custom: "period",
          daily: "every day",
          weekdays: "weekdays",
          selectedDays: "selected days",
          once: "once",
          due: "due",
          subitems: "steps",
        }
      : {
          title: "Создание с ИИ",
          subtitle: "Чат с Chexar. Без подтверждения ничего не сохранится.",
          assistant: "Я Chexar. Напиши, что хочешь отслеживать, а если деталей мало — я уточню.",
          followup: "Можно написать одно действие или несколько, каждое с новой строки.",
          placeholder: "Например: Английский 50 уроков за месяц",
          send: "Предпросмотр",
          sendAria: "Отправить сообщение",
          loading: "Думаю...",
          preview: "Предпросмотр",
          create: (count: number) => `Создать выбранные (${count})`,
          clear: "Очистить",
          error: "ИИ не смог разобрать действие. Попробуй проще.",
          empty: "Сначала напиши, что хочешь отслеживать.",
          questions: ["Что хочешь улучшить?", "На какой период?", "Как отмечать прогресс?"],
          samples: ["Английский: 50 уроков за месяц", "Зарядка каждый день до 11:00", "Прочитать 1000 страниц за месяц"],
          checkbox: "галочка",
          quantity: "число",
          today: "день",
          week: "неделя",
          month: "месяц",
          custom: "период",
          daily: "каждый день",
          weekdays: "будни",
          selectedDays: "выбранные дни",
          once: "разово",
          due: "до",
          subitems: "пункты",
        };
  type AiChatMessage = {
    id: string;
    role: "assistant" | "user";
    content: string;
  };

  const [text, setText] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>(() => [
    { id: "assistant-welcome", role: "assistant", content: labels.assistant },
    { id: "assistant-followup", role: "assistant", content: labels.followup },
  ]);
  const [drafts, setDrafts] = useState<AiActionDraft[]>([]);
  const [selectedDraftIndexes, setSelectedDraftIndexes] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedDrafts = drafts.filter((_: AiActionDraft, index: number) => selectedDraftIndexes.has(index));
  const getDraftPeriodLabel = (period: AiActionDraft["period"]) => {
    if (period === "today") return labels.today;
    if (period === "week") return labels.week;
    if (period === "month") return labels.month;
    return labels.custom;
  };
  const getDraftRepeatLabel = (repeat: AiActionDraft["repeat_mode"]) => {
    if (repeat === "once") return labels.once;
    if (repeat === "weekdays") return labels.weekdays;
    if (repeat === "selected_days") return labels.selectedDays;
    return labels.daily;
  };
  const getDraftMeta = (draft: AiActionDraft) =>
    [
      draft.tracking_type === "quantity"
        ? `${formatNumber(Number(draft.target_value ?? 0))} ${draft.unit ?? ""}`.trim()
        : labels.checkbox,
      getDraftPeriodLabel(draft.period),
      getDraftRepeatLabel(draft.repeat_mode),
      draft.due_time ? `${labels.due} ${draft.due_time}` : "",
      draft.subitems?.length ? `${labels.subitems}: ${draft.subitems.length}` : "",
    ].filter(Boolean).join(" · ");

  function splitActionRequests(value: string): string[] {
    const normalizedList = value
      .replace(/\r\n/g, "\n")
      .replace(/([:：])\s*(?=\d+[.)]\s+)/g, "$1\n")
      .replace(/\s+(\d+[.)]\s+)/g, "\n$1")
      .replace(/\s+([-*•]\s+)/g, "\n$1");

    return normalizedList
      .split(/\n|;|•/g)
      .map((item) => cleanAiActionRequest(item))
      .filter((item) => item && !isAiInstructionRequest(item))
      .slice(0, 8);
  }

  async function requestDraft(prompt: string): Promise<AiActionDraft[]> {
    let response: Response;
    try {
      response = await fetch("/api/ai/chat-create-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: prompt, language }),
      });
    } catch {
      if (import.meta.env.DEV) {
        return [buildLocalAiDraft(prompt)];
      }
      throw new Error("AI request failed");
    }

    if (!response.ok) {
      if (response.status === 404 && import.meta.env.DEV) {
        return [buildLocalAiDraft(prompt)];
      }
      const payload = await response.json().catch(() => null);
      throw new Error(typeof payload?.error === "string" ? payload.error : "AI request failed");
    }

    const payload = await response.json();
    const rawDrafts = Array.isArray(payload?.actions) ? payload.actions : [payload];
    return rawDrafts.map((draft: unknown) => normalizeAiActionDraft(draft, prompt));
  }

  async function parseDrafts() {
    const message = text.trim();
    const prompts = splitActionRequests(text);
    if (prompts.length === 0) {
      setError(labels.empty);
      return;
    }

    setLoading(true);
    setError("");
    setText("");
    setMessages((items: AiChatMessage[]) => [...items, { id: `user-${Date.now()}`, role: "user", content: message }]);

    try {
      const parsedGroups = await Promise.all(
        prompts.map(async (prompt: string) => requestDraft(prompt)),
      );
      const parsed = parsedGroups.flat();
      const now = Date.now();
      const startIndex = drafts.length;
      setDrafts((items: AiActionDraft[]) => [...items, ...parsed]);
      setSelectedDraftIndexes((items: Set<number>) => {
        const next = new Set(items);
        parsed.forEach((_: AiActionDraft, index: number) => next.add(startIndex + index));
        return next;
      });
      setMessages((items: AiChatMessage[]) => [
        ...items,
        {
          id: `assistant-${now}`,
          role: "assistant",
          content: language === "en"
            ? `I prepared ${parsed.length} preview${parsed.length === 1 ? "" : "s"}. Check below.`
            : `Я подготовил ${parsed.length} предпросмотр${parsed.length === 1 ? "" : "а"}. Проверь ниже.`,
        },
      ]);
    } catch (requestError) {
      const message = requestError instanceof Error && requestError.message ? requestError.message : labels.error;
      setError(message);
      setMessages((items: AiChatMessage[]) => [...items, { id: `assistant-error-${Date.now()}`, role: "assistant", content: message }]);
    } finally {
      setLoading(false);
    }
  }

  function removeDraft(index: number) {
    setDrafts((items: AiActionDraft[]) => items.filter((_: AiActionDraft, itemIndex: number) => itemIndex !== index));
    setSelectedDraftIndexes((items: Set<number>) => {
      const next = new Set<number>();
      items.forEach((itemIndex: number) => {
        if (itemIndex < index) {
          next.add(itemIndex);
        } else if (itemIndex > index) {
          next.add(itemIndex - 1);
        }
      });
      return next;
    });
  }

  function toggleDraft(index: number) {
    setSelectedDraftIndexes((items: Set<number>) => {
      const next = new Set(items);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function resetAiChat() {
    setText("");
    setDrafts([]);
    setSelectedDraftIndexes(new Set());
    setError("");
    setMessages([
      { id: "assistant-welcome", role: "assistant", content: labels.assistant },
      { id: "assistant-followup", role: "assistant", content: labels.followup },
    ]);
  }

  return (
    <BottomSheet title={labels.title} subtitle={labels.subtitle} closeLabel="Close" onClose={onClose} className="ai-chat-sheet">
      <div className="ai-chat-body">
        <div className="ai-chat-agent">
          <span className="ai-chat-agent-avatar" aria-hidden="true">🤖</span>
          <div>
            <strong>Chexar</strong>
            <small>{language === "en" ? "AI assistant" : "AI-помощник"}</small>
          </div>
        </div>
        <div className="ai-chat-thread" aria-live="polite">
          {messages.map((message: AiChatMessage) => (
            <div key={message.id} className={`ai-chat-message ${message.role}`}>
              <span>{message.content}</span>
            </div>
          ))}
        </div>
        <div className="ai-chat-composer">
          <label className="ai-chat-input">
            <textarea
              value={text}
              placeholder={labels.placeholder}
              rows={3}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!loading) {
                    void parseDrafts();
                  }
                }
              }}
            />
          </label>
          <button type="button" className="ai-chat-enter" aria-label={labels.sendAria} onClick={parseDrafts} disabled={loading}>
            ↵
          </button>
        </div>
        {error && <small className="ai-assist-error">{error}</small>}
        <div className="ai-chat-actions">
          <button
            type="button"
            onClick={resetAiChat}
          >
            {labels.clear}
          </button>
        </div>
        {drafts.length > 0 && (
          <div className="ai-chat-preview">
            <strong>{labels.preview}</strong>
            <div className="ai-chat-draft-list">
              {drafts.map((draft: AiActionDraft, index: number) => {
                const selected = selectedDraftIndexes.has(index);
                return (
                  <div key={`${draft.title}-${draft.start_date}-${index}`} className={`ai-chat-draft ${selected ? "selected" : ""}`}>
                    <button type="button" className="ai-chat-draft-check" aria-label="Select draft" aria-pressed={selected} onClick={() => toggleDraft(index)}>
                      <span aria-hidden="true" />
                    </button>
                    <div className="ai-preview-action-card ai-chat-draft-action">
                      <span className="action-emoji" aria-hidden="true">{draft.icon ?? inferAiEmoji(draft.title)}</span>
                      <span className="ai-preview-action-copy">
                        <b>{draft.title}</b>
                        <small>{getDraftMeta(draft)}</small>
                      </span>
                    </div>
                    <button type="button" aria-label="Remove" onClick={() => removeDraft(index)}>
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
            <button type="button" className="ai-chat-create" disabled={selectedDrafts.length === 0} onClick={() => onCreateDrafts(selectedDrafts)}>
              {labels.create(selectedDrafts.length)}
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

const RHYTHM_CARD_MODE_STORAGE_KEY = "chexar.rhythmCardMode";

function loadRhythmCardMode(): RhythmCardMode {
  if (typeof window === "undefined") {
    return "orientation";
  }

  try {
    const storedMode = window.localStorage.getItem(RHYTHM_CARD_MODE_STORAGE_KEY);
    return mapRhythmCardModePreference(storedMode);
  } catch {
    return "orientation";
  }
}

function saveRhythmCardMode(mode: RhythmCardMode): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(RHYTHM_CARD_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage errors in private or restricted browser contexts.
  }
}

function RhythmCard({
  daily,
  weekTrend,
  copy,
  activeDate,
  today,
  language,
}: {
  daily: ReturnType<typeof calculateDailyProgress>;
  weekTrend: number[];
  copy: UiCopy;
  activeDate: string;
  today: string;
  language: AppSettings["language"];
}) {
  const [mode, setMode] = useState<RhythmCardMode>(() => loadRhythmCardMode());
  const showWeeklyBars = mode === "bars";
  const isCompact = mode === "compact";
  const isOrientation = mode === "orientation";
  const dailyPercent = clampPercent(daily.percent);
  const orientation = buildTodayOrientation({
    activeDate,
    today,
    language,
    completed: daily.completedTodayItems,
    total: daily.totalTodayItems,
    percent: dailyPercent,
  });
  const orientationCopy = productLanguage[language].todayOrientation;
  const orientationAriaLabel = [orientationCopy.aria, orientation.title, orientation.metadata]
    .filter(Boolean)
    .join(". ");
  const cardStyle = {
    "--daily-percent": `${dailyPercent}%`,
    "--rhythm-ring-percent": `${dailyPercent}%`,
    ...getFillToneStyle(dailyPercent),
  } as CSSProperties;

  useEffect(() => {
    saveRhythmCardMode(mode);
  }, [mode]);

  return (
    <button
      type="button"
      className={`rhythm-card is-${mode}-view`}
      style={cardStyle}
      aria-label={showWeeklyBars ? `${copy.rhythmTrendAria}: ${dailyPercent}%` : orientationAriaLabel}
      aria-pressed={!isOrientation}
      onClick={() => setMode((currentMode) => getNextRhythmCardMode(currentMode))}
    >
      {!isOrientation && <div className="rhythm-fill" />}
      {showWeeklyBars ? (
        <div className="rhythm-bars-layout">
          <span className="rhythm-ring" aria-hidden="true">
            <span className="rhythm-ring-percent">{dailyPercent}%</span>
          </span>
          <RhythmWeekBars values={weekTrend} activeDate={activeDate} language={language} ariaLabel={copy.rhythmTrendAria} />
        </div>
      ) : isCompact ? (
        <span className="rhythm-compact-line" aria-hidden="true" />
      ) : (
        <span className="rhythm-orientation">
          <strong>{orientation.title}</strong>
          {orientation.metadata && <small>{orientation.metadata}</small>}
        </span>
      )}
    </button>
  );
}

function RhythmWeekBars({
  values,
  activeDate,
  language,
  ariaLabel,
}: {
  values: number[];
  activeDate: string;
  language: AppSettings["language"];
  ariaLabel: string;
}) {
  const weekDates = getWeekRange(parseDateKey(activeDate));
  const weekdayLabels = getCalendarWeekdayLabels(language);
  const safeValues = weekDates.map((date, index) => {
    const value = values[index] ?? 0;

    return {
      value: clampPercent(Number.isFinite(value) ? value : 0),
      dateKey: toDateKey(date),
      day: weekdayLabels[(date.getDay() + 6) % 7],
      date: String(date.getDate()),
    };
  });

  return (
    <div className="rhythm-week-bars" role="img" aria-label={ariaLabel}>
      {safeValues.map((day) => (
        <span key={day.dateKey} className="rhythm-week-column">
          <span className="rhythm-week-label">
            <b>{day.day}</b>
            <small>{day.date}</small>
          </span>
          <span
            className="rhythm-week-bar"
            style={{ "--rhythm-bar-height": `${day.value}%`, ...getFillToneStyle(day.value) } as CSSProperties}
          />
        </span>
      ))}
    </div>
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

function InteractiveStartQuestBlock({
  state,
  language,
  onHide,
  onCreateAction,
}: {
  state: OnboardingQuestState;
  language: AppSettings["language"];
  onHide: () => void;
  onCreateAction: () => void;
}) {
  const copy = onboardingQuestCopy[language];
  const completed = new Set(state.completedSteps);
  const [questEditorOpen, setQuestEditorOpen] = useState(false);
  const [pairEditor, setPairEditor] = useState<"timer" | "emoji" | null>(null);
  const [pairTime, setPairTime] = useState("18:00");
  const [pairEmoji, setPairEmoji] = useState("📌");
  const [pairOrder, setPairOrder] = useState<Array<"timer" | "emoji">>(["timer", "emoji"]);
  const [miniListOpen, setMiniListOpen] = useState(false);
  const [miniCheckedRows, setMiniCheckedRows] = useState<number[]>([]);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressValue, setProgressValue] = useState("");
  const scenarios: Array<{
    id: "complete" | "delete" | "pair" | "miniList" | "progress" | "create";
    icon: string;
    title: string;
    meta: string;
    steps: OnboardingQuestStep[];
  }> = [
    {
      id: "complete",
      icon: "☑️",
      title: copy.scenarios.complete.title,
      meta: copy.scenarios.complete.meta,
      steps: ["questTaskCompleted"],
    },
    {
      id: "delete",
      icon: "🗑️",
      title: copy.scenarios.delete.title,
      meta: copy.scenarios.delete.meta,
      steps: ["questTaskDeleted"],
    },
    {
      id: "pair",
      icon: "↕️",
      title: copy.scenarios.pair.title,
      meta: copy.scenarios.pair.meta,
      steps: ["questPairTimerSet", "questPairEmojiChanged", "questPairReordered"],
    },
    {
      id: "miniList",
      icon: "🧩",
      title: copy.scenarios.miniList.title,
      meta: copy.scenarios.miniList.meta,
      steps: ["questMiniListOpened", "questMiniListCompleted"],
    },
    {
      id: "progress",
      icon: "🔢",
      title: copy.scenarios.progress.title,
      meta: copy.scenarios.progress.meta,
      steps: ["questProgressEntered"],
    },
    {
      id: "create",
      icon: "➕",
      title: copy.scenarios.create.title,
      meta: copy.scenarios.create.meta,
      steps: ["questTaskCreated"],
    },
  ];
  const completedScenarioCount = scenarios.filter((scenario) => scenario.steps.every((step) => completed.has(step))).length;
  const activeScenario = scenarios.find((scenario) => !scenario.steps.every((step) => completed.has(step))) ?? null;

  useEffect(() => {
    if (state.completedSteps.length === 0) {
      setQuestEditorOpen(false);
      setPairEditor(null);
      setPairTime("18:00");
      setPairEmoji("📌");
      setPairOrder(["timer", "emoji"]);
      setMiniListOpen(false);
      setMiniCheckedRows([]);
      setProgressOpen(false);
      setProgressValue("");
    }
  }, [state.completedSteps.length]);

  function completeQuestStep(step: OnboardingQuestStep) {
    emitOnboardingQuestEvent(step);
  }

  function openMiniList() {
    completeQuestStep("questMiniListOpened");
    setMiniListOpen(true);
  }

  function toggleMiniRow(index: number) {
    const nextRows = miniCheckedRows.includes(index)
      ? miniCheckedRows.filter((row) => row !== index)
      : [...miniCheckedRows, index];

    setMiniCheckedRows(nextRows);

    if (nextRows.includes(0) && nextRows.includes(1)) {
      completeQuestStep("questMiniListCompleted");
      window.setTimeout(() => setMiniListOpen(false), 180);
    }
  }

  function savePairEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pairEditor === "timer") {
      completeQuestStep("questPairTimerSet");
    }

    if (pairEditor === "emoji") {
      completeQuestStep("questPairEmojiChanged");
    }

    setPairEditor(null);
  }

  function movePairQuestRow(sourceId: string, targetId: string, placement: ReorderPlacement = "before") {
    setPairOrder((current) => {
      const sourceIndex = current.indexOf(sourceId as "timer" | "emoji");
      const targetIndex = current.indexOf(targetId as "timer" | "emoji");

      if (sourceIndex === -1 || targetIndex === -1) {
        return current;
      }

      const next = [...current];
      const [source] = next.splice(sourceIndex, 1);
      const adjustedTargetIndex = next.indexOf(targetId as "timer" | "emoji");

      next.splice(placement === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex, 0, source);

      return next;
    });

    if (completed.has("questPairTimerSet") && completed.has("questPairEmojiChanged")) {
      completeQuestStep("questPairReordered");
    }
  }

  function submitProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (Number(progressValue) > 0) {
      completeQuestStep("questProgressEntered");
      setProgressOpen(false);
    }
  }

  function renderQuestRow(scenario: NonNullable<typeof activeScenario>, detail?: ReactNode, controls?: ReactNode) {
    return (
      <div className="task-card-inline start-quest-item">
        <div className="task-row start-quest-row">
          <div className="task-row-main">
            <span className="action-emoji start-quest-symbol" aria-hidden="true">
              {scenario.icon}
            </span>
            <span className="task-title start-quest-title">
              <strong>{scenario.title}</strong>
              <small>{scenario.meta}</small>
              {detail}
            </span>
          </div>
          {controls}
        </div>
      </div>
    );
  }

  function renderActiveQuest() {
    if (!activeScenario) {
      return renderQuestRow(
        {
          id: "create",
          icon: "✅",
          title: copy.mastered,
          meta: copy.completedLabel,
          steps: [],
        },
        undefined,
        <span className="task-check-button start-quest-check-button" aria-hidden="true">
          <span className="task-check">
            <span className="task-x-mark">
              <span />
              <span />
            </span>
          </span>
        </span>,
      );
    }

    if (activeScenario.id === "complete") {
      return (
        <SwipeDeleteShell deleteLabel={copy.done} deleteTone="complete" onDelete={() => completeQuestStep("questTaskCompleted")} onTap={() => completeQuestStep("questTaskCompleted")}>
          {renderQuestRow(
            activeScenario,
            <div className="start-quest-mini-chips">
              <span>←</span>
              <span>{copy.done}</span>
            </div>,
            <button
              type="button"
              className="task-check-button start-quest-check-button"
              aria-label={copy.done}
              onClick={(event) => {
                event.stopPropagation();
                completeQuestStep("questTaskCompleted");
              }}
            >
              <span className="task-check" aria-hidden="true" />
            </button>,
          )}
        </SwipeDeleteShell>
      );
    }

    if (activeScenario.id === "delete") {
      return (
        <SwipeDeleteShell deleteLabel={copy.done} editLabel={copy.edit} onEdit={() => setQuestEditorOpen(true)}>
          {renderQuestRow(
            activeScenario,
            <div className="start-quest-mini-chips">
              <span>→</span>
              <span>{copy.edit}</span>
            </div>,
            <span className="start-quest-count">1/1</span>,
          )}
        </SwipeDeleteShell>
      );
    }

    if (activeScenario.id === "pair") {
      const rows = pairOrder.map((rowId) => {
        const isTimer = rowId === "timer";
        const done = isTimer ? completed.has("questPairTimerSet") : completed.has("questPairEmojiChanged");
        const rowScenario = {
          ...activeScenario,
          icon: isTimer ? "⏰" : pairEmoji,
          title: isTimer ? copy.scenarios.pair.firstTitle : copy.scenarios.pair.secondTitle,
          meta: isTimer ? (done ? pairTime : copy.scenarios.pair.timerTitle) : (done ? pairEmoji : copy.scenarios.pair.emojiTitle),
        };

        return (
          <ReorderableItem key={rowId} id={rowId} scope="start-quest-pair" onMove={movePairQuestRow}>
            <SwipeDeleteShell deleteLabel={copy.done} editLabel={copy.edit} onDelete={() => undefined} onEdit={() => setPairEditor(isTimer ? "timer" : "emoji")}>
              {renderQuestRow(
                rowScenario,
                <div className="start-quest-mini-chips">
                  <span>→</span>
                  <span>{done ? copy.done : copy.edit}</span>
                </div>,
                <span className="start-quest-count">{done ? "1/1" : "0/1"}</span>,
              )}
            </SwipeDeleteShell>
          </ReorderableItem>
        );
      });

      return (
        <div className="start-quest-pair">
          {rows}
          <small className="start-quest-pair-hint">{copy.scenarios.pair.reorderHint}</small>
        </div>
      );
    }

    if (activeScenario.id === "miniList") {
      return (
        <div className="start-quest-inline-list-shell">
          <button type="button" className="start-quest-row-button" onClick={openMiniList}>
            {renderQuestRow(
              activeScenario,
              <div className="start-quest-mini-list">
                {copy.scenarios.miniList.rows.map((row: string, index: number) => (
                  <span key={row} className={miniCheckedRows.includes(index) ? "done" : ""}>
                    {row}
                  </span>
                ))}
              </div>,
              <span className="start-quest-count">{Math.min(miniCheckedRows.length, 2)}/2</span>,
            )}
          </button>
          {miniListOpen && (
            <div className="subitems-sheet-list start-quest-sheet-list start-quest-inline-list">
              {copy.scenarios.miniList.rows.map((row: string, index: number) => {
                const checked = miniCheckedRows.includes(index);

                return (
                  <div key={row} className={`subitem-sheet-row ${checked ? "completed" : ""}`}>
                    <button type="button" className="subitem-toggle" onClick={() => toggleMiniRow(index)}>
                      <span className="task-check" aria-hidden="true">
                        {checked && (
                          <span className="task-x-mark">
                            <span />
                            <span />
                          </span>
                        )}
                      </span>
                      <strong>{row}</strong>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    if (activeScenario.id === "progress") {
      return (
        <button type="button" className="start-quest-row-button" onClick={() => setProgressOpen(true)}>
          {renderQuestRow(
            activeScenario,
            <div className="start-quest-progress" style={{ "--quest-progress": `${Math.min((completedScenarioCount / scenarios.length) * 100, 100)}%` } as CSSProperties}>
              <span />
              <small>{completedScenarioCount}/{scenarios.length}</small>
            </div>,
            <span className="start-quest-count">{copy.open}</span>,
          )}
        </button>
      );
    }

    return (
      <button type="button" className="start-quest-row-button" onClick={onCreateAction}>
        {renderQuestRow(
          activeScenario,
          <div className="start-quest-mini-chips">
            <span>+</span>
            <span>{copy.create}</span>
          </div>,
          <span className="task-check-button start-quest-check-button" aria-hidden="true">
            <span className="task-check" />
          </span>,
        )}
      </button>
    );
  }

  return (
    <div className="action-group start-quest-group has-title" aria-label={copy.title}>
      <div className="action-group-title start-quest-group-title">
        <span>{copy.title}</span>
        <small>{completedScenarioCount}/{scenarios.length}</small>
        <button type="button" onClick={onHide}>
          {copy.hide}
        </button>
      </div>
      <div className="start-quest-list">{renderActiveQuest()}</div>
      {questEditorOpen && (
        <BottomSheet
          title={copy.scenarios.delete.editorTitle}
          subtitle={copy.scenarios.delete.editorMeta}
          closeLabel={copy.cancel}
          onClose={() => setQuestEditorOpen(false)}
        >
          <div className="task-action-sheet start-quest-editor-sheet">
            <button
              type="button"
              className="sheet-row-action danger"
              onClick={() => {
                completeQuestStep("questTaskDeleted");
                setQuestEditorOpen(false);
              }}
            >
              <Trash2 size={18} aria-hidden="true" />
              {copy.deleteAction}
            </button>
          </div>
        </BottomSheet>
      )}
      {pairEditor && (
        <BottomSheet
          title={pairEditor === "timer" ? copy.scenarios.pair.timerTitle : copy.scenarios.pair.emojiTitle}
          subtitle={copy.scenarios.pair.meta}
          closeLabel={copy.cancel}
          onClose={() => setPairEditor(null)}
        >
          <form className="sheet-form start-quest-editor-sheet" onSubmit={savePairEdit}>
            {pairEditor === "timer" ? (
              <label>
                <span>{copy.scenarios.pair.firstTitle}</span>
                <input type="time" value={pairTime} onChange={(event) => setPairTime(event.target.value)} autoFocus />
              </label>
            ) : (
              <label>
                <span>{copy.scenarios.pair.secondTitle}</span>
                <input
                  value={pairEmoji}
                  onChange={(event) => setPairEmoji(normalizeEmojiChoice(event.target.value) ?? event.target.value)}
                  placeholder="🙂"
                  autoFocus
                />
              </label>
            )}
            <button type="submit" className="primary-sheet-button">
              {copy.save}
            </button>
          </form>
        </BottomSheet>
      )}
      {progressOpen && (
        <BottomSheet title={copy.scenarios.progress.title} subtitle={copy.scenarios.progress.meta} closeLabel={copy.cancel} onClose={() => setProgressOpen(false)}>
          <form className="sheet-form start-quest-progress-form" onSubmit={submitProgress}>
            <label>
              <span>{copy.progressLabel}</span>
              <input
                type="number"
                min="1"
                step="1"
                value={progressValue}
                onChange={(event) => setProgressValue(event.target.value)}
                placeholder={copy.progressPlaceholder}
                autoFocus
              />
            </label>
            <button type="submit" className="primary-sheet-button" disabled={Number(progressValue) <= 0}>
              {copy.save}
            </button>
          </form>
        </BottomSheet>
      )}
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
  periodCells,
}: {
  goal: ProgressGoal;
  today: string;
  copy: UiCopy;
  nowMs: number;
  onOpenManual: () => void;
  onQuickAdd?: (amount: number) => void;
  onEdit?: () => void;
  periodCells?: ReactNode;
}) {
  const metrics = getGoalDailyMetrics(goal, today);
  const progressPercent = metrics.progressPercent;
  const isGoalCompleted = metrics.totalCompleted >= metrics.targetAmount;
  const isTodayDone = isGoalCompleted;
  const dueMeta = formatDueMeta(goal.dueTime, today, isTodayDone, goal.completedAtByDate?.[today], goal.lateDates?.includes(today) ?? false, nowMs, copy);
  const progressStyle = { "--goal-progress": `${progressPercent}%`, ...getFillToneStyle(progressPercent) } as CSSProperties;
  const swipeDeleteHandler = periodCells ? undefined : onOpenManual;
  const displayUnit = getGoalDisplayUnit(goal);
  const dailyPlanText = metrics.dailyPlan > 0 && metrics.dailyRemaining > 0 ? formatGoalAmount(metrics.dailyPlan, displayUnit) : "";
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenManual();
    }
  }

  return (
    <SwipeDeleteShell deleteLabel={copy.enter} editLabel={copy.editAction} deleteTone="complete" onDelete={swipeDeleteHandler} onEdit={onEdit} onTap={onOpenManual}>
      <article
        className={`goal-card ${isTodayDone ? "is-done" : ""} ${isGoalCompleted ? "is-complete" : ""} ${periodCells ? "period-expanded" : ""}`}
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
                  <h3 title={dailyPlanText ? `${goal.title} (${dailyPlanText})` : goal.title}>
                    <span className="goal-title-text">{goal.title}</span>
                    {dailyPlanText && <span className="goal-title-recommendation"> ({dailyPlanText})</span>}
                  </h3>
                  {dueMeta && <small className="due-meta">{dueMeta}</small>}
                </div>
                <div className="goal-progress-stack">
                  <span className="goal-numbers">
                    {formatNumber(metrics.totalCompleted)} / {formatNumber(metrics.targetAmount)} · {formatNumber(Math.round(progressPercent))}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        {periodCells}
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
  onSubitemActivity,
  onSubitemMove,
  onEdit,
  periodCells,
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
  onSubitemActivity?: () => void;
  onSubitemMove?: (sourceId: string, targetId: string, placement?: ReorderPlacement) => void;
  onEdit?: () => void;
  periodCells?: ReactNode;
}) {
  const subitemProgress = hasTaskSubitems(task) ? getTaskSubitemProgress(task, dateKey) : null;
  const subitems = [...(task.subitems ?? [])].sort((first, second) => (first.sortOrder ?? 0) - (second.sortOrder ?? 0));
  const dayState = task.subitemStateByDate?.[dateKey] ?? {};
  const dueMeta = formatDueMeta(task.dueTime, dateKey, completed, task.completedAtByDate?.[dateKey], task.lateDates?.includes(dateKey) ?? false, nowMs, copy);
  const swipeToggleHandler = periodCells ? undefined : onToggle ?? onClick;

  return (
    <SwipeDeleteShell deleteLabel={toggleLabel} editLabel={editLabel} deleteTone={completed ? "undo" : "complete"} onDelete={swipeToggleHandler} onEdit={onEdit} onTap={onClick}>
      <div className={`task-card-inline ${expanded ? "expanded" : ""}`}>
      <div className={`task-row ${completed ? "completed" : ""} ${subitemProgress ? "with-subitems" : ""} ${periodCells ? "period-expanded" : ""} priority-${task.priority ?? "medium"}`}>
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
        {periodCells ?? (
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
        )}
      </div>
      {expanded && subitems.length > 0 && (
        <div
          className="inline-subitems"
          aria-label={task.title}
          onPointerDownCapture={onSubitemActivity}
          onKeyDownCapture={onSubitemActivity}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {subitems.map((subitem) => {
            const state = dayState[subitem.id] ?? {};
            const target = subitem.targetCount && subitem.targetCount > 1 ? subitem.targetCount : 1;
            const current = subitem.targetCount && subitem.targetCount > 1 ? Math.min(Number(state.count ?? 0), target) : state.completed ? 1 : 0;
            const isComplete = current >= target;
            const showCount = target > 1 && current > 0;
            const advanceSubitem = () => {
              onSubitemActivity?.();
              onSubitemAdvance?.(subitem.id);
            };

            return (
              <ReorderableItem key={subitem.id} id={subitem.id} scope={`subitems-${task.id}`} onMove={(sourceId, targetId, placement) => onSubitemMove?.(sourceId, targetId, placement)}>
                <SwipeAdvanceShell onAdvance={advanceSubitem}>
                  <div
                    className={`inline-subitem-row ${isComplete ? "completed" : ""}`}
                    role="button"
                    tabIndex={0}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      advanceSubitem();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        advanceSubitem();
                      }
                    }}
                  >
                    <div className="inline-subitem-head">
                      <span className="inline-subitem-check" aria-hidden="true">{isComplete ? "✓" : ""}</span>
                      <span className="inline-subitem-title">{subitem.title}</span>
                      {showCount && <strong>{current}/{target}</strong>}
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
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const draggedRect = event.currentTarget.getBoundingClientRect();
    const rawY = event.clientY - start.y;
    const minY = 8 - draggedRect.top;
    const maxY = viewportHeight - draggedRect.bottom - 8;
    const clampedY = Math.min(Math.max(rawY, minY), maxY);
    setDragOffset({
      x: 0,
      y: clampedY,
    });

    const draggedElement = event.currentTarget;
    const previousPointerEvents = draggedElement.style.pointerEvents;
    draggedElement.style.pointerEvents = "none";
    const probeX = Math.min(Math.max(start.x, 1), Math.max(viewportWidth - 1, 1));
    const probeY = Math.min(Math.max(event.clientY, 1), Math.max(viewportHeight - 1, 1));
    const target = document
      .elementFromPoint(probeX, probeY)
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
    if (!startPoint.current) {
      return;
    }

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
      emitOnboardingQuestEvent("swipeLeftTriggered");
      onDelete();
    } else if (shouldEdit && onEdit) {
      suppressClick.current = true;
      emitOnboardingQuestEvent("swipeRightTriggered");
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
  onSave: (update: EditActionUpdate) => void;
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
  const editDisabled = !titleIsValid || !progressSettingsValid || (repeatMode === "selectedDays" && selectedDays.length === 0);
  const hasUnsavedChanges =
    title !== action.title ||
    groupName !== (action.groupName ?? "") ||
    note !== (action.note ?? "") ||
    iconKey !== action.iconKey ||
    emoji !== action.emoji ||
    repeatMode !== initialRepeatMode ||
    selectedDays.join(",") !== (action.selectedDays ?? defaultGoalSelectedDays).join(",") ||
    dueTimeEnabled !== Boolean(action.dueTime) ||
    dueTime !== (action.dueTime ?? "11:00") ||
    (isGoal &&
      (targetValue !== String(state.goal.targetValue) ||
        currentValue !== String(state.goal.currentValue) ||
        unit !== state.goal.unit ||
        quickValues !== state.goal.quickAddValues.join(", ")));
  const nativeMainButton = useTelegramNativeMainButton({
    active: true,
    text: copy.save,
    disabled: editDisabled,
    onClick: handleSubmit,
  });

  function handleRepeatChange(nextRepeatMode: TaskRepeatMode) {
    setRepeatMode(nextRepeatMode);
  }

  function toggleWeekdaySelection(day: number) {
    setSelectedDays((days) => toggleWeekday(days, day));
  }

  function handleSubmit(event?: FormEvent) {
    event?.preventDefault();

    if (editDisabled) {
      telegramNotification("error");
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

  function requestClose() {
    if (!hasUnsavedChanges) {
      onClose();
      return;
    }

    void showTelegramConfirm(language === "en" ? "Discard unsaved changes?" : "Закрыть без сохранения?").then((confirmed) => {
      if (confirmed) {
        onClose();
      }
    });
  }

  function openEmojiInput() {
    setIconPickerOpen(true);
    window.setTimeout(() => emojiInputRef.current?.focus(), 0);
  }

  return (
    <BottomSheet title={copy.editAction} closeLabel={copy.close} onClose={requestClose}>
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
          {!nativeMainButton && (
            <button type="submit" className="primary-sheet-button" disabled={editDisabled}>
              {copy.save}
            </button>
          )}
          {onDelete && (
            <button type="button" className="primary-sheet-button danger-action" onClick={onDelete}>
              {copy.deleteConfirm}
            </button>
          )}
          <button type="button" className="ghost-sheet-button" onClick={requestClose}>
            {copy.cancel}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
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
  }  const filterItems: Array<{ value: CalendarFilterMode; label: string; icon: LucideIcon }> = [
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

function ProfileScreen({
  settings,
  telegramUser,
  telegramStatus,
  onSettingsChange,
  onRestartOnboarding,
  onResetRequest,
}: {
  settings: AppSettings;
  telegramUser: TelegramUser | null;
  telegramStatus: TelegramConnectionStatus;
  onSettingsChange: (settings: Partial<AppSettings>) => void;
  onRestartOnboarding: () => void;
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
              🌐
            </span>
            <span className="profile-row-label">{copy.language}</span>
          </div>
          <ProfileSegmented
            value={settings.language}
            options={[
              { value: "en", label: <span className="profile-flag" aria-hidden="true">🇺🇸</span>, ariaLabel: "English" },
              { value: "ru", label: <span className="profile-flag" aria-hidden="true">🇷🇺</span>, ariaLabel: "Русский" },
            ]}
            onChange={(value) => onSettingsChange({ language: value as AppSettings["language"] })}
            compact
          />
        </div>
        <div className="profile-setting-block">
          <div className="profile-setting-heading">
            <span className="profile-row-icon accent-cyan" aria-hidden="true">
              🌗
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

      <button
        type="button"
        className={`hints-card ${settings.telegramBotEnabled ? "enabled" : ""}`}
        aria-pressed={settings.telegramBotEnabled}
        onClick={() => onSettingsChange({ telegramBotEnabled: !settings.telegramBotEnabled })}
      >
        <span className="profile-row-icon accent-cyan" aria-hidden="true">
          🤖
        </span>
        <span>
          <strong>{settings.telegramBotEnabled ? copy.telegramBotOn : copy.telegramBotOff}</strong>
          <small>{copy.telegramBotText}</small>
        </span>
        <span className="toggle-switch" aria-hidden="true">
          <span>{settings.telegramBotEnabled && <Check size={18} />}</span>
        </span>
      </button>

      <button
        type="button"
        className={`hints-card ${settings.carryOversEnabled ? "enabled" : ""}`}
        aria-pressed={settings.carryOversEnabled}
        onClick={() => onSettingsChange({ carryOversEnabled: !settings.carryOversEnabled })}
      >
        <span className="profile-row-icon accent-violet" aria-hidden="true">
          ↩
        </span>
        <span>
          <strong>{settings.carryOversEnabled ? copy.carryOversOn : copy.carryOversOff}</strong>
          <small>{copy.carryOversText}</small>
        </span>
        <span className="toggle-switch" aria-hidden="true">
          <span>{settings.carryOversEnabled && <Check size={18} />}</span>
        </span>
      </button>

      <ProfileCard title={copy.about}>
        <ProfileRow icon="ℹ️" label={copy.version} value={APP_VERSION} accent="violet" />
      </ProfileCard>

      <button type="button" className="danger-reset-button" onClick={onResetRequest}>
        <span className="profile-row-icon danger" aria-hidden="true">🗑️</span>
        <span>{copy.resetData}</span>
      </button>

      <button
        type="button"
        className={`hints-card ${settings.hintsEnabled ? "enabled" : ""}`}
        aria-pressed={settings.hintsEnabled}
        onClick={() => onSettingsChange({ hintsEnabled: !settings.hintsEnabled })}
      >
        <span className="profile-row-icon accent-violet" aria-hidden="true">
          💡
        </span>
        <span>
          <strong>{settings.hintsEnabled ? copy.hintsOn : copy.hintsOff}</strong>
          <small>{copy.hintsText}</small>
        </span>
        <span className="toggle-switch" aria-hidden="true">
          <span>{settings.hintsEnabled && <Check size={18} />}</span>
        </span>
      </button>

      <button type="button" className="hints-card start-quest-reopen-card" onClick={onRestartOnboarding}>
        <span className="profile-row-icon accent-violet" aria-hidden="true">
          ✨
        </span>
        <span>
          <strong>{copy.restartQuest}</strong>
          <small>{copy.restartQuestText}</small>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
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
  return (
    <div className="profile-header-avatar" aria-label={label}>
      {telegramUser?.photo_url ? <img src={telegramUser.photo_url} alt="" /> : <span>👤</span>}
    </div>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  onClick,
  muted = false,
  accent = "violet",
}: {
  icon: LucideIcon | string;
  label: string;
  value: string;
  onClick?: () => void;
  muted?: boolean;
  accent?: "violet" | "cyan" | "mint";
}) {
  const content = (
    <>
      <span className={`profile-row-icon accent-${accent}`} aria-hidden="true">
        {typeof icon === "string" ? icon : (() => {
          const Icon = icon;
          return <Icon size={20} />;
        })()}
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
  options: Array<{ value: string; label: ReactNode; ariaLabel?: string }>;
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
          aria-label={option.ariaLabel}
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
  const options: Array<{ value: AppSettings["theme"]; emoji: string }> = [
    { value: "light", emoji: "☀️" },
    { value: "dark", emoji: "🌙" },
  ];

  if (includeSystem) {
    options.push({ value: "system", emoji: "💻" });
  }

  return (
    <div className={`theme-icon-selector ${includeSystem ? "with-system" : ""}`} role="group" aria-label={labels[value] ?? labels.dark}>
      {options.map((option) => {
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
            <span aria-hidden="true">{option.emoji}</span>
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
  const metrics = getGoalDailyMetrics(goal, today);
  const requiredToday = metrics.dailyPlan;
  const loggedToday = metrics.todayCompleted;
  const [amount, setAmount] = useState(String(loggedToday || 0));
  const [note, setNote] = useState("");
  const numericDraftAmount = Number(amount);
  const previewAmount = Number.isFinite(numericDraftAmount) && numericDraftAmount >= 0 ? numericDraftAmount : loggedToday;
  const todayPercent = requiredToday > 0 ? clampPercent((previewAmount / requiredToday) * 100) : getGoalProgressPercent(goal);
  const progressTitle = capitalizeLabel(copy.progress);
  const targetLabel = copy.save === "Save" ? "target" : "цель";
  const todayNeedLabel = copy.requiredToday;
  const periodLabel = copy.save === "Save" ? "period until" : "период до";
  const displayUnit = getGoalDisplayUnit(goal, copy.save === "Save" ? "en" : "ru");
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
              <p>{goal.note ? `${goal.note} · ` : ""}{targetLabel} {formatGoalAmount(goal.targetValue, displayUnit)} · {periodLabel} {formatDateLabel(goal.endDate)}</p>
            </div>
          </div>
          <strong>{todayNeedLabel}: {formatGoalAmount(requiredToday, displayUnit)}</strong>
        </section>

        <div className="progress-entry-fill" style={progressStyle}>
          <span />
          <strong>{formatGoalAmount(previewAmount, displayUnit)} / {formatGoalAmount(requiredToday, displayUnit)}</strong>
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
  messageIndex,
  onReview,
}: {
  count: number;
  language: AppSettings["language"];
  messageIndex: number;
  onReview: () => void;
}) {
  const messages = useMemo(() => getCarryOverBannerMessages(count, language), [count, language]);
  const message = messages[messageIndex % messages.length] ?? messages[0];
  const countLabel = language === "en" ? `${count} missed` : `${count} пропущено`;

  return (
    <button type="button" className="carry-over-banner" onClick={onReview} aria-label={`${message}. ${countLabel}`}>
      <span>{message}</span>
    </button>
  );
}

function getCarryOverBannerMessages(count: number, language: AppSettings["language"]): string[] {
  if (language === "en") {
    return count === 1
      ? ["Missed earlier", "You skipped something", "One action is still open"]
      : ["Missed earlier", "You skipped something", "Some actions are still open"];
  }

  return count === 1
    ? ["Пропущено раньше", "Ты что-то пропустил", "Осталась незакрытая задача"]
    : ["Пропущено раньше", "Ты что-то пропустил", "Остались незакрытые задачи"];
}

function CarryOverReviewSheet({
  candidates,
  language,
  onClose,
  onMove,
  onCreateNextPeriod,
}: {
  candidates: CarryOverCandidate[];
  language: AppSettings["language"];
  onClose: () => void;
  onMove: (selected: CarryOverCandidate[]) => void;
  onCreateNextPeriod: (selected: CarryOverCandidate[]) => void;
}) {
  function getCandidateId(candidate: CarryOverCandidate): string {
    return `${candidate.type}:${candidate.type === "goal" ? candidate.goal.id : candidate.task.id}`;
  }

  const uniqueCandidates = useMemo(() => {
    const byId = new Map<string, CarryOverCandidate>();

    candidates.forEach((candidate) => {
      const id = getCandidateId(candidate);

      if (!byId.has(id)) {
        byId.set(id, candidate);
      }
    });

    return Array.from(byId.values());
  }, [candidates]);
  const [selectedIds, setSelectedIds] = useState(() => new Set(uniqueCandidates.map(getCandidateId)));

  useEffect(() => {
    setSelectedIds((current) => {
      const validIds = new Set(uniqueCandidates.map(getCandidateId));
      const next = new Set(Array.from(current).filter((id) => validIds.has(id)));

      return next.size > 0 ? next : validIds;
    });
  }, [uniqueCandidates]);

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

  function selectAll() {
    setSelectedIds(new Set(uniqueCandidates.map(getCandidateId)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const selected = uniqueCandidates.filter((candidate) => selectedIds.has(getCandidateId(candidate)));
  const selectedGoals = selected.filter((candidate) => candidate.type === "goal");
  const selectedCountLabel = language === "en" ? `${selected.length}/${uniqueCandidates.length} selected` : `${selected.length}/${uniqueCandidates.length} выбрано`;
  const yesterdayKey = addDays(todayKey(), -1);
  const groupedCandidates = useMemo(() => {
    const yesterdayCandidates = uniqueCandidates.filter((candidate) => candidate.movedFromDate === yesterdayKey);
    const periodCandidates = uniqueCandidates.filter((candidate) => candidate.movedFromDate !== yesterdayKey);

    return [
      {
        key: "yesterday",
        title: language === "en" ? "Yesterday" : "Вчера",
        items: yesterdayCandidates,
      },
      {
        key: "period",
        title: language === "en" ? "Whole period" : "Весь период",
        items: periodCandidates,
      },
    ].filter((group) => group.items.length > 0);
  }, [language, uniqueCandidates, yesterdayKey]);

  return (
    <BottomSheet
      title={language === "en" ? "Missed actions" : "Пропущенные"}
      subtitle={language === "en" ? "Choose what to bring back." : "Выбери, что вернуть."}
      closeLabel={language === "en" ? "Close" : "Закрыть"}
      onClose={onClose}
      className="carry-review-sheet"
    >
      <div className="carry-review-toolbar">
        <span>{selectedCountLabel}</span>
        <button type="button" onClick={selectAll}>
          {language === "en" ? "All" : "Все"}
        </button>
        <button type="button" onClick={clearSelection}>
          {language === "en" ? "None" : "Снять"}
        </button>
      </div>
      <div className="carry-review-list">
        {groupedCandidates.map((group) => (
          <section key={group.key} className="carry-review-group" aria-label={group.title}>
            <div className="carry-review-group-title">
              <span>{group.title}</span>
              <small>{group.items.length}</small>
            </div>
            <div className="carry-review-group-items">
              {group.items.map((candidate) => {
                const action = candidate.type === "goal" ? candidate.goal : candidate.task;
                const id = getCandidateId(candidate);
                const selectedCandidate = selectedIds.has(id);

                return (
                  <button
                    key={id}
                    type="button"
                    className={`carry-review-row ${selectedCandidate ? "selected" : ""}`}
                    aria-pressed={selectedCandidate}
                    onClick={() => toggleCandidate(candidate)}
                  >
                    <span className="action-emoji" aria-hidden="true">{getActionEmoji(action)}</span>
                    <span className="carry-review-copy">
                      <strong>{action.title}</strong>
                      <small>{formatDateLabel(candidate.movedFromDate)} · {candidate.detail}</small>
                    </span>
                    <span className={`carry-checkbox ${selectedCandidate ? "checked" : ""}`} aria-hidden="true">
                      {selectedCandidate && <X size={11} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <div className="sheet-actions carry-review-actions">
        <button type="button" className="primary-sheet-button" disabled={selected.length === 0} onClick={() => onMove(selected)}>
          {language === "en" ? "Move to today" : "На сегодня"}
        </button>
        <button type="button" className="ghost-sheet-button" disabled={selectedGoals.length === 0} onClick={() => onCreateNextPeriod(selected)}>
          {language === "en" ? "New period" : "Новый период"}
        </button>
        <button type="button" className="ghost-sheet-button" onClick={onClose}>
          {language === "en" ? "Later" : "Позже"}
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
type ActionPeriod = "today" | "week" | "month" | "forever" | "custom";
type GoalPeriod = ActionPeriod;
type TaskPeriod = ActionPeriod;

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
  dueTime?: string;
  subitems?: Array<{ title: string; targetCount?: number }>;
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

const actionTemplates: ActionTemplate[] = [
  { group: "progress", title: "Уроки за месяц", iconKey: "graduation", trackingMode: "amount", targetValue: 40, unit: "уроков", period: "month", repeatMode: "everyDay", quickValues: [1, 2] },
  { group: "progress", title: "Страницы за месяц", iconKey: "book", trackingMode: "amount", targetValue: 1000, unit: "страниц", period: "month", repeatMode: "everyDay", quickValues: [10, 25] },
  { group: "progress", title: "Километры за неделю", iconKey: "run", trackingMode: "amount", targetValue: 25, unit: "км", period: "week", repeatMode: "weekdays", quickValues: [1, 5] },
  { group: "progress", title: "Тренировки за месяц", iconKey: "dumbbell", trackingMode: "amount", targetValue: 20, unit: "тренировок", period: "month", repeatMode: "weekdays", quickValues: [1, 2] },
  { group: "progress", title: "Минуты медитации", iconKey: "clock", trackingMode: "amount", targetValue: 300, unit: "минут", period: "month", repeatMode: "everyDay", quickValues: [5, 10] },
  { group: "progress", title: "Шаги за неделю", iconKey: "run", trackingMode: "amount", targetValue: 70000, unit: "шагов", period: "week", repeatMode: "everyDay", quickValues: [1000, 5000] },
  { group: "progress", title: "Задачи проекта", iconKey: "target", trackingMode: "amount", targetValue: 30, unit: "задач", period: "month", repeatMode: "weekdays", quickValues: [1, 3] },
  { group: "progress", title: "Вода за день", iconKey: "droplet", trackingMode: "amount", targetValue: 8, unit: "стаканов", period: "today", repeatMode: "everyDay", quickValues: [1, 2] },
  { group: "progress", title: "Часы практики", iconKey: "star", trackingMode: "amount", targetValue: 20, unit: "часов", period: "custom", repeatMode: "selectedDays", selectedDays: [1, 3, 5], quickValues: [1, 2] },
  { group: "progress", title: "Бессрочный счетчик", iconKey: "plus", trackingMode: "amount", targetValue: 100, unit: "раз", period: "forever", repeatMode: "everyDay", quickValues: [1, 5] },
  { group: "checklist", title: "Разовая задача", iconKey: "plus", trackingMode: "done", period: "today", repeatMode: "everyDay", priority: "medium" },
  { group: "checklist", title: "Ежедневная привычка", iconKey: "fire", trackingMode: "done", period: "month", repeatMode: "everyDay", priority: "medium" },
  { group: "checklist", title: "Будний ритуал", iconKey: "calendar", trackingMode: "done", period: "month", repeatMode: "weekdays", priority: "medium" },
  { group: "checklist", title: "По выбранным дням", iconKey: "star", trackingMode: "done", period: "month", repeatMode: "selectedDays", selectedDays: [1, 3, 5], priority: "medium" },
  { group: "checklist", title: "До времени", iconKey: "clock", trackingMode: "done", period: "month", repeatMode: "everyDay", dueTime: "11:00", priority: "medium" },
  { group: "checklist", title: "С мини-списком", iconKey: "target", trackingMode: "done", period: "week", repeatMode: "everyDay", priority: "medium", subitems: [{ title: "Подготовка" }, { title: "Основной шаг" }, { title: "Закрыть" }] },
  { group: "checklist", title: "С повтором пункта", iconKey: "dumbbell", trackingMode: "done", period: "week", repeatMode: "everyDay", priority: "medium", subitems: [{ title: "Разминка" }, { title: "Подходы", targetCount: 3 }, { title: "Растяжка" }] },
  { group: "checklist", title: "Еженедельная уборка", iconKey: "home", trackingMode: "done", period: "week", repeatMode: "selectedDays", selectedDays: [6], priority: "medium" },
  { group: "checklist", title: "Сон до 23:00", iconKey: "moon", trackingMode: "done", period: "month", repeatMode: "everyDay", dueTime: "23:00", priority: "medium" },
  { group: "checklist", title: "Разобрать почту", iconKey: "mail", trackingMode: "done", period: "week", repeatMode: "weekdays", dueTime: "18:00", priority: "medium" },
  { group: "checklist", title: "Созвон", iconKey: "phone", trackingMode: "done", period: "week", repeatMode: "selectedDays", selectedDays: [1], priority: "medium" },
  { group: "checklist", title: "Покупки", iconKey: "cart", trackingMode: "done", period: "today", repeatMode: "everyDay", priority: "medium", subitems: [{ title: "Список" }, { title: "Магазин" }, { title: "Разложить" }] },
];

const templateEnglishCopy: Record<string, { title: string; unit?: string }> = {
  "Уроки за месяц": { title: "Monthly lessons", unit: "lessons" },
  "Страницы за месяц": { title: "Monthly pages", unit: "pages" },
  "Километры за неделю": { title: "Weekly kilometers", unit: "km" },
  "Тренировки за месяц": { title: "Monthly workouts", unit: "workouts" },
  "Минуты медитации": { title: "Meditation minutes", unit: "minutes" },
  "Шаги за неделю": { title: "Weekly steps", unit: "steps" },
  "Задачи проекта": { title: "Project tasks", unit: "tasks" },
  "Вода за день": { title: "Daily water", unit: "glasses" },
  "Часы практики": { title: "Practice hours", unit: "hours" },
  "Бессрочный счетчик": { title: "Open counter", unit: "times" },
  "Разовая задача": { title: "One-off task" },
  "Ежедневная привычка": { title: "Daily habit" },
  "Будний ритуал": { title: "Weekday ritual" },
  "По выбранным дням": { title: "Selected days" },
  "До времени": { title: "Due time" },
  "С мини-списком": { title: "Mini list" },
  "С повтором пункта": { title: "Counted list" },
  "Еженедельная уборка": { title: "Weekly cleaning" },
  "Сон до 23:00": { title: "Sleep by 23:00" },
  "Разобрать почту": { title: "Inbox cleanup" },
  Созвон: { title: "Call" },
  Покупки: { title: "Shopping" },
};

function getTemplateTitle(template: ActionTemplate, language: AppSettings["language"]): string {
  return language === "en" ? (templateEnglishCopy[template.title]?.title ?? template.title) : template.title;
}

function getTemplateUnit(template: ActionTemplate, language: AppSettings["language"]): string | undefined {
  return language === "en" ? (templateEnglishCopy[template.title]?.unit ?? template.unit) : template.unit;
}

function translateTemplateSubitem(title: string): string {
  const copy: Record<string, string> = {
    Подготовка: "Prepare",
    "Основной шаг": "Main step",
    Закрыть: "Close",
    Разминка: "Warm-up",
    Подходы: "Sets",
    Растяжка: "Stretch",
    Список: "List",
    Магазин: "Store",
    Разложить: "Put away",
  };

  return copy[title] ?? title;
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
    periodType: GoalPeriodType;
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
  const [trackingMode, setTrackingMode] = useState<ActionTrackingMode>("done");
  const [targetValue, setTargetValue] = useState("");
  const [currentValue, setCurrentValue] = useState("0");
  const [unit, setUnit] = useState("");
  const [period, setPeriod] = useState<ActionPeriod>("today");
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
  const emojiInputRef = useRef<HTMLInputElement>(null);

  const selectedEmoji = emoji ?? getIconEmoji(iconKey) ?? inferEmojiFromTitle(title);
  const subitemCopy = getSubitemCopy(language);
  const dates = getPeriodDates(today, period, startDate, endDate);
  const hasValidDateRange =
    isDateKey(dates.startDate) &&
    isDateKey(dates.endDate) &&
    dates.endDate >= dates.startDate;
  const previewDates = hasValidDateRange ? dates : { startDate: today, endDate: today };
  const numericTarget = Number(targetValue);
  const numericCurrent = Number(currentValue) || 0;
  const normalizedDueTime = dueTimeEnabled ? normalizeDueTimeInput(dueTime) : undefined;
  const taskRepeatMode: TaskRepeatMode = trackingMode === "done" && period === "today" ? "once" : repeatMode;
  const activeSelectedDays = repeatMode === "selectedDays" ? selectedDays : undefined;
  const goalPreview = getGoalSchedulePreview({
    targetValue: numericTarget || 0,
    currentValue: numericCurrent,
    unit,
    startDate: previewDates.startDate,
    endDate: previewDates.endDate,
    repeatMode,
    selectedDays: activeSelectedDays,
  });
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
    trackingMode !== "done" ||
    period !== "today" ||
    repeatMode !== "everyDay" ||
    quickValues.trim() !== "" ||
    subitemsEnabled ||
    subitemDrafts.some((subitem) => subitem.title.trim()) ||
    dueTimeEnabled ||
    iconKey !== undefined ||
    emoji !== undefined;
  const nativeMainButton = useTelegramNativeMainButton({
    active: true,
    text: language === "en" ? "Create" : "Создать",
    disabled: errors.length > 0,
    onClick: submitAction,
  });

  function applyTemplate(template: ActionTemplate) {
    const templateTitle = getTemplateTitle(template, language);
    const templateSubitems = template.subitems ?? [];

    setTitle(templateTitle);
    setIconKey(template.iconKey);
    setEmoji(getIconEmoji(template.iconKey) ?? inferEmojiFromTitle(templateTitle));
    setTrackingMode(template.trackingMode);
    setPeriod(template.period);
    setRepeatMode(template.repeatMode);
    setSelectedDays(template.selectedDays ?? defaultGoalSelectedDays);
    setTargetValue(template.targetValue ? String(template.targetValue) : "");
    setUnit(getTemplateUnit(template, language) ?? "");
    setCurrentValue("0");
    setQuickValues(template.quickValues?.join(", ") ?? "");
    setSubitemsEnabled(template.trackingMode === "done" && templateSubitems.length > 0);
    setSubitemDrafts(
      template.trackingMode === "done"
        ? templateSubitems.map((subitem, index) => ({
            id: createId("subitem"),
            title: language === "en" ? translateTemplateSubitem(subitem.title) : subitem.title,
            targetCount: subitem.targetCount,
            sortOrder: index + 1,
          }))
        : [],
    );
    setDueTimeEnabled(Boolean(template.dueTime));
    setDueTime(template.dueTime ?? "11:00");
    setAdvancedOpen(template.trackingMode === "amount" && Boolean(template.quickValues?.length));
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
  }  function submitAction(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (errors.length > 0) {
      telegramNotification("error");
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
        periodType: period,
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

  function requestClose() {
    if (!hasUnsavedChanges) {
      onClose();
      return;
    }

    void showTelegramConfirm(language === "en" ? "Discard unsaved changes?" : "Закрыть без сохранения?").then((confirmed) => {
      if (confirmed) {
        onClose();
      }
    });
  }

  return (
    <BottomSheet title={copy.addSheetTitle} closeLabel={copy.close} onClose={requestClose} closeOnOverlay={!hasUnsavedChanges} className="creation-bottom-sheet">
      {templatePickerOpen && <TemplatePicker templates={actionTemplates} language={language} onSelect={applyTemplate} />}

      <form className="sheet-form creation-form unified-action-form" onSubmit={submitAction}>
        <div className="creation-top-row">
          <label className="creation-title-field">
            <span>{copy.name}</span>
            <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={copy.namePlaceholder} />
          </label>
          <button type="button" className="icon-picker-trigger emoji-picker-trigger creation-icon-trigger" onClick={openEmojiInput} aria-label={copy.icon}>
            <span className="emoji-picker-preview" aria-hidden="true">{selectedEmoji ?? "＋"}</span>
          </button>
          <button type="button" className="template-trigger creation-template-trigger" onClick={() => setTemplatePickerOpen((open) => !open)}>
            {copy.templates}
          </button>
        </div>
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

        {trackingMode === "amount" && (
          <div className="date-grid compact-two-column creation-quantity-row">
            <label>
              <span>{copy.total}</span>
              <input type="number" min="1" step="any" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} placeholder="50" />
            </label>
            <label>
              <span>{copy.unit}</span>
              <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder={copy.unitPlaceholder} />
            </label>
          </div>
        )}

        <div className="field-group creation-period-field">
          <span>{copy.period}</span>
          <div className="segmented-control compact-segment segment-five period-segment">
            <button type="button" className={period === "today" ? "active" : ""} onClick={() => setPeriod("today")}>
              {copy.today}
            </button>
            <button type="button" className={period === "week" ? "active" : ""} onClick={() => setPeriod("week")}>
              {copy.weekOption}
            </button>
            <button type="button" className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>
              {copy.monthOption}
            </button>
            <button type="button" className={period === "forever" ? "active" : ""} onClick={() => setPeriod("forever")} aria-label={language === "en" ? "Forever" : "Всегда"}>
              <InfinityIcon size={17} aria-hidden="true" />
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

        <AdvancedSection label={copy.advanced} open={advancedOpen} onToggle={() => setAdvancedOpen((open) => !open)}>
          <label className="compact-group-field">
            <span>{copy.group}</span>
            <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder={copy.groupPlaceholder} />
          </label>

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
                }}
              >
                <span>{subitemCopy.addList}</span>
                <Plus size={16} aria-hidden="true" />
              </button>
              {subitemsEnabled && (
                <div className="subitems-draft-list">
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

          {trackingMode === "amount" && (
            <div className="date-grid compact-two-column">
              <label>
                <span>{copy.alreadyDone}</span>
                <input type="number" min="0" step="any" value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} placeholder="0" />
              </label>
              <label>
                <span>{copy.quickButtons}</span>
                <input value={quickValues} onChange={(event) => setQuickValues(event.target.value)} placeholder="+1, +5" />
              </label>
            </div>
          )}
        </AdvancedSection>

        <div className="sheet-summary preview-card">
          <span>{copy.preview}</span>
          {trackingMode === "amount" ? (
            <>
              <PreviewRow icon={<Flame size={16} />} label={copy.inDay} value={`${formatNumber(goalPreview.neededPerDay)} ${unit || copy.unit}`} />
              <PreviewRow icon={<BarChart3 size={16} />} label={copy.period} value={getPeriodSummary(period, dates.startDate, dates.endDate, language)} />
              {normalizedDueTime && <PreviewRow icon={<Clock3 size={16} />} label={copy.dueBefore} value={normalizedDueTime} />}
            </>
          ) : (
            <>
              <PreviewRow icon={<CalendarDays size={16} />} label={copy.period} value={getPeriodSummary(period, dates.startDate, dates.endDate, language)} />
              <PreviewRow icon={<TrendingUp size={16} />} label={copy.repeat} value={getActionRepeatLabel(period, repeatMode, language)} />
              {normalizedDueTime && <PreviewRow icon={<Clock3 size={16} />} label={copy.dueBefore} value={normalizedDueTime} />}
            </>
          )}
        </div>

        <ValidationMessages errors={errors} />
        {!nativeMainButton && (
          <div className="sheet-actions creation-actions single-action">
            <button type="submit" className="primary-sheet-button" disabled={errors.length > 0}>
              {copy.save}
            </button>
          </div>
        )}
      </form>
    </BottomSheet>
  );
}

function TemplatePicker({
  templates,
  language,
  onSelect,
}: {
  templates: ActionTemplate[];
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
          const periodSummary =
            template.period === "custom"
              ? language === "en" ? "Custom period" : "Свой период"
              : getPeriodSummary(template.period, "", "", language);
          const summary =
            template.trackingMode === "amount"
              ? `${formatNumber(template.targetValue ?? 0)} ${unit ?? ""} · ${periodSummary}`
              : template.period === "today"
                ? periodSummary
                : `${periodSummary} · ${getActionRepeatLabel(template.period, template.repeatMode, language)}`;
          const detail = [
            template.dueTime ? (language === "en" ? `before ${template.dueTime}` : `до ${template.dueTime}`) : "",
            template.subitems?.length ? (language === "en" ? "list" : "список") : "",
          ].filter(Boolean).join(" · ");

          return (
            <button key={`${template.group}-${template.title}`} type="button" className="template-button" onClick={() => onSelect(template)}>
              <span className="template-icon" aria-hidden="true">
                {getIconEmoji(template.iconKey) ?? inferEmojiFromTitle(title) ?? "✅"}
              </span>
              <span>
                <strong>{title}</strong>
                <small>{detail ? `${summary} · ${detail}` : summary}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreviewRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  const labelText = /[?:]$/.test(label) ? label : `${label}:`;

  return (
    <div className="preview-row">
      <span className="preview-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{labelText}</span>
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

  if (!isDateKey(goal.startDate) || !isDateKey(goal.endDate) || goal.endDate < goal.startDate) {
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

  if (!isDateKey(task.startDate) || !isDateKey(task.endDate) || task.endDate < task.startDate) {
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
      periodType: "custom",
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

function getActionRepeatLabel(period: ActionPeriod, repeatMode: GoalRepeatMode, language: AppSettings["language"] = "ru"): string {
  const copy = uiCopy[language];

  if (period === "today") {
    return copy.today;
  }

  if (period === "forever") {
    return language === "en" ? "Always" : "Всегда";
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

  if (period === "forever") {
    return language === "en" ? "Always" : "Всегда";
  }

  if (!isDateKey(startDate) || !isDateKey(endDate)) {
    return "—";
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
    const start = parseDateKey(today);

    return {
      startDate: today,
      endDate: toDateKey(new Date(start.getFullYear(), start.getMonth() + 1, 0)),
    };
  }

  if (period === "forever") {
    return {
      startDate: today,
      endDate: "2099-12-31",
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
