import type { ActionSubitem, DailyRecord, GoalRepeatMode, ProgressGoal, TaskItem, TaskRepeatMode } from "./types";
import { addDays, daysInclusive, parseDateKey, toDateKey, todayKey } from "./dateUtils";

type DailyCompletionDetails = {
  percent: number;
  completedItems: number;
  totalItems: number;
  hasData: boolean;
};

type GoalPreviewInput = {
  targetValue: number;
  currentValue: number;
  unit: string;
  startDate: string;
  endDate: string;
  repeatMode: GoalRepeatMode;
  selectedDays?: number[];
};

type SchedulableItem = {
  startDate: string;
  endDate?: string | null;
  repeatMode: GoalRepeatMode | TaskRepeatMode;
  selectedDays?: number[];
};

export type GoalDailyMetrics = {
  totalCompleted: number;
  targetAmount: number;
  todayCompleted: number;
  dailyPlan: number;
  dailyRemaining: number;
  progressPercent: number;
};

export type GoalSchedulePreview = {
  neededPerDay: number;
  neededPerWeek: number;
  activeDays: number;
  activeDaysPerWeek: number;
  workload: "Нормальная" | "Высокая" | "Риск";
};

export function getDateKey(date: Date): string {
  return toDateKey(date);
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(Math.round(value), 0), 100);
}

export function getWeekRange(date: Date): Date[] {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);

    return day;
  });
}

export function getMonthRange(date: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(date.getFullYear(), date.getMonth(), 1);

  while (cursor.getMonth() === date.getMonth()) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

export function getGoalProgressPercent(goal: ProgressGoal): number {
  if (goal.targetValue <= 0) {
    return 0;
  }

  return clampPercent((goal.currentValue / goal.targetValue) * 100);
}

// Date-only schedule examples:
// daily 2026-05-01..2026-05-31 on 2026-05-04 -> true
// weekdays 2026-05-01..2026-05-31 on Saturday -> false
// once 2026-05-04 on 2026-05-05 -> false
export function isItemActiveOnDate(item: SchedulableItem, selectedDate: string): boolean {
  if (!item.startDate) {
    return false;
  }

  if (item.repeatMode === "once") {
    return selectedDate === item.startDate;
  }

  const endDate = getEffectiveEndDate(item);

  if (selectedDate < item.startDate || selectedDate > endDate) {
    return false;
  }

  return repeatMatchesDate(item.repeatMode, item.selectedDays, parseDateKey(selectedDate));
}

export function isGoalDueOnDate(goal: ProgressGoal, date: Date, dateKey = getDateKey(date)): boolean {
  return isItemActiveOnDate(goal, dateKey);
}

export function isTaskDueOnDate(task: TaskItem, date: Date, dateKey = getDateKey(date)): boolean {
  return isItemActiveOnDate(task, dateKey);
}

export function isTaskCompletedOnDate(task: TaskItem, dateKey: string): boolean {
  if (hasTaskSubitems(task)) {
    const progress = getTaskSubitemProgress(task, dateKey);

    return progress.total > 0 && progress.completed >= progress.total;
  }

  if (task.completedDates?.includes(dateKey)) {
    return true;
  }

  return !task.completedDates && task.completed && task.date === dateKey;
}

export function hasTaskSubitems(task: TaskItem): boolean {
  return Array.isArray(task.subitems) && task.subitems.length > 0;
}

export function getTaskSubitemProgress(task: TaskItem, dateKey: string): { completed: number; total: number } {
  const subitems = normalizeTaskSubitems(task.subitems);
  const state = task.subitemStateByDate?.[dateKey] ?? {};

  return {
    total: subitems.length,
    completed: subitems.filter((subitem) => isSubitemComplete(subitem, state[subitem.id])).length,
  };
}

export function getRequiredToday(goal: ProgressGoal, today: string): number {
  return getGoalDailyMetrics(goal, today).dailyPlan;
}

export function getGoalDailyRecommendation(goal: ProgressGoal, dateKey: string, currentDateKey = todayKey()): number {
  return getGoalDailyMetrics(goal, dateKey, currentDateKey).dailyPlan;
}

export function getGoalDailyMetrics(goal: ProgressGoal, dateKey: string, currentDateKey = todayKey()): GoalDailyMetrics {
  const date = parseDateKey(dateKey);
  const targetAmount = Math.max(goal.targetValue, 0);
  const totalCompleted = Math.max(dateKey >= currentDateKey ? goal.currentValue : getGoalHistoricalValueAtEndOfDate(goal, dateKey), 0);
  const todayCompleted = Math.max(getLoggedAmountForDate(goal, dateKey), 0);
  const progressPercent = targetAmount <= 0 ? 0 : clampPercent((totalCompleted / targetAmount) * 100);

  if (!isGoalDueOnDate(goal, date, dateKey)) {
    return {
      totalCompleted,
      targetAmount,
      todayCompleted,
      dailyPlan: 0,
      dailyRemaining: 0,
      progressPercent,
    };
  }

  const remainingAmount = Math.max(targetAmount - totalCompleted, 0);
  const remainingActiveDays = countActiveDays(dateKey, goal.endDate, goal.repeatMode, goal.selectedDays);
  const dailyPlan = remainingAmount > 0 && remainingActiveDays > 0 ? Math.ceil(remainingAmount / remainingActiveDays) : 0;

  return {
    totalCompleted,
    targetAmount,
    todayCompleted,
    dailyPlan,
    dailyRemaining: Math.max(dailyPlan - todayCompleted, 0),
    progressPercent,
  };
}

export function getTodayLoggedAmount(goal: ProgressGoal, today: string): number {
  return getLoggedAmountForDate(goal, today);
}

export function getDailyCompletionPercent(date: Date, goals: ProgressGoal[], tasks: TaskItem[]): number {
  return getDailyCompletionDetails(date, goals, tasks).percent;
}

export function getWeekAverageCompletion(date: Date, goals: ProgressGoal[], tasks: TaskItem[]): number {
  return getAverageCompletion(getWeekRange(date), date, goals, tasks);
}

export function getMonthAverageCompletion(date: Date, goals: ProgressGoal[], tasks: TaskItem[]): number {
  return getAverageCompletion(getMonthRange(date), date, goals, tasks);
}

export function getCurrentStreak(date: Date, goals: ProgressGoal[], tasks: TaskItem[]): number {
  let streak = 0;
  let cursorKey = getDateKey(date);

  for (let index = 0; index < 365; index += 1) {
    const details = getDailyCompletionDetails(parseDateKey(cursorKey), goals, tasks);

    if (!details.hasData || details.percent < 100) {
      break;
    }

    streak += 1;
    cursorKey = addDays(cursorKey, -1);
  }

  return streak;
}

export function getLastNDaysCompletionTrend(
  days = 7,
  dayRecords: DailyRecord[] = [],
  todayCompletionPercent = 0,
  today = todayKey(),
): number[] {
  const totalDays = Math.max(Math.floor(days), 1);
  const recordMap = new Map(dayRecords.map((record) => [record.date, clampPercent(record.percent)]));

  return Array.from({ length: totalDays }, (_, index) => {
    const date = addDays(today, index - totalDays + 1);

    if (date === today) {
      return clampPercent(todayCompletionPercent);
    }

    return recordMap.get(date) ?? 0;
  });
}

export function getGoalSchedulePreview(input: GoalPreviewInput): GoalSchedulePreview {
  const remaining = Math.max(input.targetValue - input.currentValue, 0);
  const activeDays = countActiveDays(input.startDate, input.endDate, input.repeatMode, input.selectedDays);
  const activeDaysPerWeek = getActiveDaysPerWeek(input.repeatMode, input.selectedDays);
  const neededPerDay = activeDays <= 0 ? 0 : Math.ceil(remaining / activeDays);
  const neededPerWeek = neededPerDay * activeDaysPerWeek;
  const calendarDays = daysInclusive(input.startDate, input.endDate);
  const evenDailyLoad = calendarDays <= 0 ? remaining : remaining / calendarDays;
  let workload: GoalSchedulePreview["workload"] = "Нормальная";

  if (activeDays <= 0 || neededPerDay >= Math.max(50, evenDailyLoad * 4)) {
    workload = "Риск";
  } else if (neededPerDay >= Math.max(12, evenDailyLoad * 2)) {
    workload = "Высокая";
  }

  return {
    neededPerDay,
    neededPerWeek,
    activeDays,
    activeDaysPerWeek,
    workload,
  };
}

export function getDayStatus(percent: number): string {
  if (percent === 0) {
    return "Начни с малого";
  }

  if (percent < 40) {
    return "Нужен рывок";
  }

  if (percent < 70) {
    return "Можно догнать";
  }

  if (percent < 100) {
    return "Хороший темп";
  }

  return "День закрыт";
}

export function calculateDailyProgress(goals: ProgressGoal[], tasks: TaskItem[], today: string) {
  const todayDate = parseDateKey(today);
  const dailyDetails = getDailyCompletionDetails(todayDate, goals, tasks);
  const todayTasks = tasks.filter((task) => isTaskDueOnDate(task, todayDate, today));
  const completedTasks = todayTasks.filter((task) => isTaskCompletedOnDate(task, today)).length;
  const nextGoal = goals.find(
    (goal) =>
      isGoalDueOnDate(goal, todayDate, today) &&
      !isGoalCompletedOnDate(goal, todayDate, today),
  );
  const nextTask = todayTasks.find((task) => !isTaskCompletedOnDate(task, today));
  let nextAction = "Все закрыто";

  if (nextGoal) {
    const metrics = getGoalDailyMetrics(nextGoal, today);
    nextAction = `${metrics.dailyRemaining} / ${metrics.dailyPlan} ${nextGoal.unit} · ${nextGoal.title}`;
  } else if (nextTask) {
    nextAction = nextTask.title;
  }

  return {
    percent: dailyDetails.percent,
    status: getDayStatus(dailyDetails.percent),
    completedTodayItems: dailyDetails.completedItems,
    totalTodayItems: dailyDetails.totalItems,
    remainingItems: Math.max(dailyDetails.totalItems - dailyDetails.completedItems, 0),
    todayTasks,
    completedTasks,
    taskPercent: todayTasks.length === 0 ? 0 : clampPercent((completedTasks / todayTasks.length) * 100),
    nextAction,
  };
}

function getAverageCompletion(range: Date[], throughDate: Date, goals: ProgressGoal[], tasks: TaskItem[]): number {
  const throughKey = getDateKey(throughDate);
  const daysWithData = range
    .filter((date) => getDateKey(date) <= throughKey)
    .map((date) => getDailyCompletionDetails(date, goals, tasks))
    .filter((details) => details.hasData);

  if (daysWithData.length === 0) {
    return 0;
  }

  const total = daysWithData.reduce((sum, details) => sum + details.percent, 0);

  return clampPercent(total / daysWithData.length);
}

function getDailyCompletionDetails(date: Date, goals: ProgressGoal[], tasks: TaskItem[]): DailyCompletionDetails {
  const dateKey = getDateKey(date);
  const dueGoals = goals.filter((goal) => isGoalDueOnDate(goal, date, dateKey));
  const dueTasks = tasks.filter((task) => isTaskDueOnDate(task, date, dateKey));
  const completedGoals = dueGoals.filter((goal) => isGoalCompletedOnDate(goal, date, dateKey)).length;
  const completedTasks = dueTasks.filter((task) => isTaskCompletedOnDate(task, dateKey)).length;
  const totalItems = dueGoals.length + dueTasks.length;
  const completedItems = completedGoals + completedTasks;
  const hasActivity = hasActivityOnDate(dateKey, goals, tasks);

  return {
    percent: totalItems === 0 ? 0 : clampPercent((completedItems / totalItems) * 100),
    completedItems,
    totalItems,
    hasData: totalItems > 0 || hasActivity,
  };
}

function isGoalCompletedOnDate(goal: ProgressGoal, date: Date, dateKey: string): boolean {
  if (!isGoalDueOnDate(goal, date, dateKey)) {
    return false;
  }

  const required = getRequiredForDate(goal, dateKey);
  const logged = getLoggedAmountForDate(goal, dateKey);
  const metrics = getGoalDailyMetrics(goal, dateKey);

  return required <= 0 || logged >= required || metrics.totalCompleted >= metrics.targetAmount;
}

function getRequiredForDate(goal: ProgressGoal, dateKey: string): number {
  return getGoalDailyRecommendation(goal, dateKey);
}

function getGoalValueBeforeDate(goal: ProgressGoal, dateKey: string): number {
  return getGoalBaseline(goal) + getEntriesTotal(goal, (entryDate) => entryDate < dateKey);
}

function getGoalValueAtEndOfDate(goal: ProgressGoal, dateKey: string): number {
  if (dateKey === todayKey()) {
    return goal.currentValue;
  }

  return getGoalHistoricalValueAtEndOfDate(goal, dateKey);
}

function getGoalHistoricalValueAtEndOfDate(goal: ProgressGoal, dateKey: string): number {
  return getGoalBaseline(goal) + getEntriesTotal(goal, (entryDate) => entryDate <= dateKey);
}

function getGoalBaseline(goal: ProgressGoal): number {
  const loggedTotal = getEntriesTotal(goal, () => true);

  return Math.max(goal.currentValue - loggedTotal, 0);
}

function getLoggedAmountForDate(goal: ProgressGoal, dateKey: string): number {
  return goal.progressEntries
    .filter((entry) => entry.date === dateKey)
    .reduce((total, entry) => total + entry.amount, 0);
}

function getEntriesTotal(goal: ProgressGoal, predicate: (dateKey: string) => boolean): number {
  return goal.progressEntries
    .filter((entry) => predicate(entry.date))
    .reduce((total, entry) => total + entry.amount, 0);
}

function getEffectiveEndDate(item: SchedulableItem): string {
  if (item.endDate) {
    return item.endDate;
  }

  if (item.repeatMode === "once") {
    return item.startDate;
  }

  return addDays(item.startDate, 29);
}

function countActiveDays(
  startDate: string,
  endDate: string,
  repeatMode: GoalRepeatMode | Exclude<TaskRepeatMode, "once">,
  selectedDays?: number[],
): number {
  if (startDate > endDate) {
    return 0;
  }

  let count = 0;
  let cursor = startDate;

  while (cursor <= endDate) {
    const date = parseDateKey(cursor);

    if (repeatMatchesDate(repeatMode, selectedDays, date)) {
      count += 1;
    }

    cursor = addDays(cursor, 1);
  }

  return count;
}

function getActiveDaysPerWeek(repeatMode: GoalRepeatMode, selectedDays?: number[]): number {
  if (repeatMode === "everyDay") {
    return 7;
  }

  if (repeatMode === "weekdays") {
    return 5;
  }

  return Math.max(new Set(selectedDays ?? []).size, 0);
}

function repeatMatchesDate(
  repeatMode: GoalRepeatMode | Exclude<TaskRepeatMode, "once">,
  selectedDays: number[] | undefined,
  date: Date,
): boolean {
  const jsDay = date.getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;

  if (repeatMode === "everyDay") {
    return true;
  }

  if (repeatMode === "weekdays") {
    return isoDay >= 1 && isoDay <= 5;
  }

  return selectedDays?.includes(jsDay) || selectedDays?.includes(isoDay) || false;
}

function hasActivityOnDate(dateKey: string, goals: ProgressGoal[], tasks: TaskItem[]): boolean {
  return (
    goals.some((goal) => goal.progressEntries.some((entry) => entry.date === dateKey)) ||
    tasks.some((task) => isTaskCompletedOnDate(task, dateKey) || Boolean(task.subitemStateByDate?.[dateKey]))
  );
}

function normalizeTaskSubitems(subitems: TaskItem["subitems"]): ActionSubitem[] {
  return (subitems ?? []).filter((subitem) => subitem.title.trim());
}

function isSubitemComplete(subitem: ActionSubitem, state: { completed?: boolean; count?: number } | undefined): boolean {
  if (subitem.targetCount && subitem.targetCount > 1) {
    return Number(state?.count ?? 0) >= subitem.targetCount;
  }

  return state?.completed === true;
}

export function upsertDailyRecord(records: DailyRecord[], date: string, percent: number): DailyRecord[] {
  const nextRecord = {
    date,
    percent,
    active: percent > 0,
  };
  const existingIndex = records.findIndex((record) => record.date === date);

  if (existingIndex === -1) {
    return [...records, nextRecord].sort((a, b) => a.date.localeCompare(b.date));
  }

  return records.map((record, index) => (index === existingIndex ? nextRecord : record));
}

export function calculateStreak(records: DailyRecord[], today: string): number {
  let streak = 0;

  for (let offset = 0; offset > -365; offset -= 1) {
    const date = addDays(today, offset);
    const record = records.find((item) => item.date === date);

    if (!record?.active) {
      break;
    }

    streak += 1;
  }

  return streak;
}
