import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CirclePlus,
  Clock3,
  Database,
  Droplet,
  Dumbbell,
  ExternalLink,
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
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  calculateDailyProgress,
  getCurrentStreak,
  getGoalSchedulePreview,
  getGoalProgressPercent,
  getLastNDaysCompletionTrend,
  getMonthAverageCompletion,
  getRequiredToday,
  getTodayLoggedAmount,
  getWeekAverageCompletion,
  isGoalDueOnDate,
  isTaskCompletedOnDate,
  isTaskDueOnDate,
  upsertDailyRecord,
} from "./calculations";
import { addDays, parseDateKey, todayKey } from "./dateUtils";
import {
  createSeedDailyRecords,
  createSeedState,
  loadAppState,
  loadDailyRecords,
  loadSettings,
  resetPerDayStorage,
  saveAppState,
  saveDailyRecords,
  saveSettings,
} from "./storage";
import type { AppScreen, AppSettings, AppState, GoalRepeatMode, Priority, ProgressGoal, TaskItem, TaskRepeatMode } from "./types";

declare global {
  interface Window {
    perDayResetDemo?: () => void;
    Telegram?: {
      WebApp?: unknown;
    };
  }
}

const APP_VERSION = "0.1.0";

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
    addProgress: "Add progress",
    requiredToday: "Required today",
    completedInput: "Completed",
    note: "Note",
    optional: "Optional",
    markDoneTitle: "Mark as done?",
    undoDoneTitle: "Undo completion?",
    rhythmTrendAria: "7-day rhythm trend",
    dayStatuses: ["Start small", "Needs a push", "Can catch up", "Good pace", "Day closed"],
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
    addProgress: "Внести прогресс",
    requiredToday: "Нужно сегодня",
    completedInput: "Выполнено",
    note: "Заметка",
    optional: "Необязательно",
    markDoneTitle: "Отметить выполненной?",
    undoDoneTitle: "Отменить выполнение?",
    rhythmTrendAria: "Тренд ритма за 7 дней",
    dayStatuses: ["Начни с малого", "Нужен рывок", "Можно догнать", "Хороший темп", "День закрыт"],
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
    repeatOnce: "Один раз",
    lowPriority: "Низкий",
    mediumPriority: "Средний",
    highPriority: "Высокий",
  },
} as const;

type UiCopy = (typeof uiCopy)[AppSettings["language"]];

type ProfileCounts = {
  actions: number;
  quantityActions: number;
  checklistActions: number;
  dayRecords: number;
};

type ProgressSheetState = {
  goal: ProgressGoal;
} | null;

type ConfirmState = {
  task: TaskItem;
  nextCompleted: boolean;
} | null;

type ViewAllState = "goals" | "tasks" | null;

function createId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
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
const enWeekdaysShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const enMonthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

function formatTodayDate(date: Date, language: AppSettings["language"]): string {
  if (language === "en") {
    return `${enWeekdaysShort[date.getDay()]}, ${enMonthsShort[date.getMonth()]} ${date.getDate()}`;
  }

  return `${ruWeekdaysShort[date.getDay()]}, ${date.getDate()} ${ruMonthsShort[date.getMonth()]}`;
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

export default function App() {
  const today = useMemo(() => todayKey(), []);
  const todayDate = useMemo(() => parseDateKey(today), [today]);
  const [appState, setAppState] = useState<AppState>(() => loadAppState());
  const [dayRecords, setDayRecords] = useState(() => loadDailyRecords());
  const [progressSheet, setProgressSheet] = useState<ProgressSheetState>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [viewAllSheet, setViewAllSheet] = useState<ViewAllState>(null);
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [activeScreen, setActiveScreen] = useState<AppScreen>("today");
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const todayLabel = useMemo(() => formatTodayDate(todayDate, settings.language), [settings.language, todayDate]);
  const isTelegramMiniApp = typeof window !== "undefined" && Boolean(window.Telegram?.WebApp);

  const daily = useMemo(
    () => calculateDailyProgress(appState.goals, appState.tasks, today),
    [appState.goals, appState.tasks, today],
  );
  const miniStats = useMemo(() => {
    return {
      weekPercent: getWeekAverageCompletion(todayDate, appState.goals, appState.tasks),
      monthPercent: getMonthAverageCompletion(todayDate, appState.goals, appState.tasks),
      streak: getCurrentStreak(todayDate, appState.goals, appState.tasks),
    };
  }, [appState.goals, appState.tasks, todayDate]);
  const todayGoals = useMemo(
    () => appState.goals.filter((goal) => isGoalDueOnDate(goal, todayDate, today)),
    [appState.goals, today, todayDate],
  );
  const todayTasks = useMemo(
    () => appState.tasks.filter((task) => isTaskDueOnDate(task, todayDate, today)),
    [appState.tasks, today, todayDate],
  );
  const visibleTodayTasks = useMemo(() => dedupeTodayTasks(todayTasks, today), [todayTasks, today]);
  const viewAllGoals = useMemo(
    () => appState.goals.filter((goal) => isGoalDueOnDate(goal, todayDate, today) || goal.currentValue >= goal.targetValue),
    [appState.goals, today, todayDate],
  );
  const rhythmTrend = useMemo(
    () => getLastNDaysCompletionTrend(7, dayRecords, daily.percent, today),
    [daily.percent, dayRecords, today],
  );
  const profileCounts = useMemo(
    () => ({
      actions: appState.goals.length + appState.tasks.length,
      quantityActions: appState.goals.length,
      checklistActions: appState.tasks.length,
      dayRecords: dayRecords.length,
    }),
    [appState.goals.length, appState.tasks.length, dayRecords.length],
  );
  const activeProfileCopy = profileCopy[settings.language];
  const activeUiCopy = uiCopy[settings.language];

  useEffect(() => {
    saveAppState(appState);
  }, [appState]);

  useEffect(() => {
    setDayRecords((records) => upsertDailyRecord(records, today, daily.percent));
  }, [daily.percent, today]);

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
      window.perDayResetDemo = () => {
        resetPerDayStorage();
        window.location.reload();
      };
    }
  }, []);

  function resetDemoData() {
    const seedState = createSeedState();
    const seedRecords = createSeedDailyRecords();

    resetPerDayStorage();
    setAppState(seedState);
    setDayRecords(seedRecords);
    saveAppState(seedState);
    saveDailyRecords(seedRecords);
    setResetConfirmOpen(false);
    setActiveScreen("today");
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
                  date: today,
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
          completedDates.add(today);
        } else {
          completedDates.delete(today);
        }

        return {
          ...task,
          completed,
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
          progressEntries: [],
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

  return (
    <div className="app-shell">
      <div className="background-glow" />
      {activeScreen === "profile" ? (
        <ProfileScreen
          settings={settings}
          counts={profileCounts}
          isTelegramMiniApp={isTelegramMiniApp}
          onSettingsChange={(nextSettings) => setSettings((current) => ({ ...current, ...nextSettings }))}
          onResetRequest={() => setResetConfirmOpen(true)}
        />
      ) : (
        <main className="today-screen">
          <Header dateLabel={todayLabel} copy={activeUiCopy} onAdd={() => setAddSheetOpen(true)} />
          <RhythmCard
            daily={daily}
            trend={rhythmTrend}
            copy={activeUiCopy}
            language={settings.language}
            statsExpanded={statsExpanded}
            onToggleStats={() => setStatsExpanded((expanded) => !expanded)}
          />
          {statsExpanded && (
            <MiniStatsPanel
              weekPercent={miniStats.weekPercent}
              monthPercent={miniStats.monthPercent}
              streak={miniStats.streak}
              copy={activeUiCopy}
              language={settings.language}
            />
          )}

          <section className="section-block">
            <SectionHeader title={activeUiCopy.progressSection} viewAllLabel={activeUiCopy.viewAll} onViewAll={() => setViewAllSheet("goals")} />
            <div className="goal-list">
              {todayGoals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  today={today}
                  copy={activeUiCopy}
                  onQuickAdd={(amount) => addProgress(goal.id, amount)}
                  onOpenManual={() => setProgressSheet({ goal })}
                />
              ))}
            </div>
          </section>

          <section className="section-block">
            <SectionHeader title={activeUiCopy.checklistSection} viewAllLabel={activeUiCopy.viewAll} onViewAll={() => setViewAllSheet("tasks")} />
            <div className="task-list">
              {visibleTodayTasks.map((task) => {
                const completedToday = isTaskCompletedOnDate(task, today);

                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    completed={completedToday}
                    isToday
                    onClick={() =>
                      setConfirmState({
                        task,
                        nextCompleted: !completedToday,
                      })
                    }
                  />
                );
              })}
            </div>
          </section>
        </main>
      )}

      <BottomNav activeScreen={activeScreen} language={settings.language} onSelect={setActiveScreen} />

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
          today={today}
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
          confirmLabel={confirmState.nextCompleted ? activeUiCopy.yesDone : activeUiCopy.yes}
          cancelLabel={activeUiCopy.cancel}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => {
            setTaskCompleted(confirmState.task.id, confirmState.nextCompleted);
            setConfirmState(null);
          }}
        />
      )}

      {addSheetOpen && (
        <AddSheet
          today={today}
          language={settings.language}
          copy={activeUiCopy}
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
          today={today}
          goals={viewAllGoals}
          tasks={visibleTodayTasks}
          copy={activeUiCopy}
          onClose={() => setViewAllSheet(null)}
          onQuickAdd={(goalId, amount) => addProgress(goalId, amount)}
          onOpenManual={(goal) => {
            setViewAllSheet(null);
            setProgressSheet({ goal });
          }}
          onToggleTask={(task) => {
            const completedToday = isTaskCompletedOnDate(task, today);

            setViewAllSheet(null);
            setConfirmState({
              task,
              nextCompleted: !completedToday,
            });
          }}
        />
      )}
    </div>
  );
}

function Header({ dateLabel, copy, onAdd }: { dateLabel: string; copy: UiCopy; onAdd: () => void }) {
  return (
    <header className="hero-header">
      <div>
        <p className="brand">PerDay</p>
        <h1>{dateLabel}</h1>
      </div>
      <div className="header-actions">
        <button className="icon-button primary-action" type="button" aria-label={copy.add} onClick={onAdd}>
          <Plus size={34} strokeWidth={2.1} />
        </button>
      </div>
    </header>
  );
}

function RhythmCard({
  daily,
  trend,
  copy,
  language,
  statsExpanded,
  onToggleStats,
}: {
  daily: ReturnType<typeof calculateDailyProgress>;
  trend: number[];
  copy: UiCopy;
  language: AppSettings["language"];
  statsExpanded: boolean;
  onToggleStats: () => void;
}) {
  const cardStyle = { "--daily-percent": `${daily.percent}%` } as CSSProperties;
  const nextAction = daily.remainingItems === 0 ? copy.allClosed : daily.nextAction;

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggleStats();
    }
  }

  return (
    <section
      className="rhythm-card"
      style={cardStyle}
      role="button"
      tabIndex={0}
      aria-expanded={statsExpanded}
      aria-label={copy.rhythmAria}
      onClick={onToggleStats}
      onKeyDown={handleKeyDown}
    >
      <div className="rhythm-fill" />
      <div className="rhythm-main">
        <span className="eyebrow">{copy.rhythmTitle}</span>
        <strong>{daily.percent}%</strong>
        <p>{copy.actionsCount(daily.completedTodayItems, daily.totalTodayItems)}</p>
      </div>
      <div className="rhythm-summary">
        <span className="chip">{getLocalizedDayStatus(daily.percent, language)}</span>
        <MiniRhythmChart values={trend} ariaLabel={copy.rhythmTrendAria} />
        <div className="summary-stack">
          <span>{copy.left}: {daily.remainingItems}</span>
          <strong>{nextAction}</strong>
        </div>
        <ChevronRight className={`rhythm-toggle ${statsExpanded ? "open" : ""}`} size={18} aria-hidden="true" />
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

function SectionHeader({ title, viewAllLabel, onViewAll }: { title: string; viewAllLabel: string; onViewAll?: () => void }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      {onViewAll && (
        <button type="button" className="view-all" onClick={onViewAll}>
          {viewAllLabel}
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}

function GoalCard({
  goal,
  today,
  copy,
  onQuickAdd,
  onOpenManual,
}: {
  goal: ProgressGoal;
  today: string;
  copy: UiCopy;
  onQuickAdd: (amount: number) => void;
  onOpenManual: () => void;
}) {
  const progressPercent = getGoalProgressPercent(goal);
  const requiredToday = getRequiredToday(goal, today);
  const loggedToday = getTodayLoggedAmount(goal, today);
  const isGoalCompleted = goal.currentValue >= goal.targetValue;
  const isTodayDone = isGoalCompleted || loggedToday >= requiredToday;
  const progressStyle = { "--goal-progress": `${progressPercent}%` } as CSSProperties;

  return (
    <article className={`goal-card ${isTodayDone ? "is-done" : ""} ${isGoalCompleted ? "is-complete" : ""}`}>
      <div className="goal-top">
        <ActionIconBadge className="goal-icon" iconKey={goal.iconKey ?? (goal.iconType === "book" ? "book" : undefined)} title={goal.title} />
        <div className="goal-content">
          <div className="goal-title-row">
            <h3>{goal.title}</h3>
            <span className="today-need">
              {isGoalCompleted ? copy.done : `${copy.todayLabel}: ${formatNumber(requiredToday)} ${goal.unit}`}
            </span>
          </div>
          <div className="goal-numbers">
            <strong>{formatNumber(goal.currentValue)}</strong>
            <span>/ {formatNumber(goal.targetValue)}</span>
            <em>{isGoalCompleted ? copy.goalClosed : `${copy.pace}: ${formatNumber(requiredToday)} ${copy.perDay}`}</em>
          </div>
          <div className="progress-track" style={progressStyle}>
            <span />
          </div>
          <div className="goal-actions">
            {goal.quickAddValues.map((value) => (
              <button key={value} type="button" onClick={() => onQuickAdd(value)}>
                +{formatNumber(value)}
              </button>
            ))}
            {goal.quickAddValues.length === 0 && (
              <button type="button" onClick={() => onQuickAdd(getDefaultQuickValues(goal.unit)[0])}>
                +{formatNumber(getDefaultQuickValues(goal.unit)[0])}
              </button>
            )}
              <button type="button" className="manual-button" onClick={onOpenManual}>
                {copy.enter}
              </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function TaskRow({
  task,
  completed,
  isToday,
  onClick,
}: {
  task: TaskItem;
  completed: boolean;
  isToday: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`task-row ${completed ? "completed" : ""} priority-${task.priority ?? "medium"}`}
      onClick={onClick}
    >
      <ActionIconBadge className="task-icon" iconKey={task.iconKey} title={task.title} />
      <span className="task-title">
        {task.title}
        {!isToday && <small>{task.date}</small>}
      </span>
      <span className="task-check" aria-hidden="true">
        {completed && <Check size={23} />}
      </span>
    </button>
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
  onQuickAdd,
  onOpenManual,
  onToggleTask,
}: {
  type: Exclude<ViewAllState, null>;
  today: string;
  goals: ProgressGoal[];
  tasks: TaskItem[];
  copy: UiCopy;
  onClose: () => void;
  onQuickAdd: (goalId: string, amount: number) => void;
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
              onQuickAdd={(amount) => onQuickAdd(goal.id, amount)}
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
    { label: copy.calendar, icon: CalendarDays, screen: "calendar", disabled: true },
    { label: copy.progress, icon: BarChart3, screen: "progress", disabled: true },
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

function ProfileScreen({
  settings,
  counts,
  isTelegramMiniApp,
  onSettingsChange,
  onResetRequest,
}: {
  settings: AppSettings;
  counts: ProfileCounts;
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
          <p className="brand">PerDay</p>
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
        <ProfileRow icon={BarChart3} label={copy.actionsCount} value={formatNumber(counts.actions)} accent="cyan" />
        <ProfileRow icon={Target} label={copy.quantityActionsCount} value={formatNumber(counts.quantityActions)} accent="mint" />
        <ProfileRow icon={Check} label={copy.checklistActionsCount} value={formatNumber(counts.checklistActions)} accent="violet" />
        <ProfileRow icon={CalendarDays} label={copy.dayRecordsCount} value={formatNumber(counts.dayRecords)} accent="cyan" />
        <ProfileRow icon={ExternalLink} label={copy.export} value={copy.soon} muted accent="cyan" />
        <ProfileRow icon={Bell} label={copy.reminders} value={copy.later} muted accent="violet" />
      </ProfileCard>

      <ProfileCard title={copy.about}>
        <ProfileRow icon={Info} label={copy.version} value={APP_VERSION} accent="violet" />
        <ProfileRow icon={Send} label={copy.telegram} value={isTelegramMiniApp ? copy.connected : copy.notFound} accent="cyan" />
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
  onClose,
  onCreateGoal,
  onCreateTask,
}: {
  today: string;
  language: AppSettings["language"];
  copy: UiCopy;
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
  const errors =
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
