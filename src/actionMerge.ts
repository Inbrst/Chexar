import { todayKey } from "./dateUtils";
import type { ActionSubitem, ActionSubitemStateByDate, ActionTimerStateByDate, AppState, GoalRepeatMode, ProgressEntry, ProgressGoal, TaskItem, TaskRepeatMode } from "./types";

export function normalizeActionTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function mergeDuplicateActions(state: AppState): AppState {
  return {
    goals: mergeActionList(state.goals, mergeProgressGoals),
    tasks: mergeActionList(state.tasks, mergeTasks),
  };
}

export function mergeGoalIntoState(state: AppState, goal: ProgressGoal): AppState {
  const existingIndex = state.goals.findIndex((item) => normalizeActionTitle(item.title) === normalizeActionTitle(goal.title));

  if (existingIndex === -1) {
    return {
      ...state,
      goals: [...state.goals, goal],
    };
  }

  return {
    ...state,
    goals: state.goals.map((item, index) => (index === existingIndex ? mergeProgressGoals(item, goal) : item)),
  };
}

export function mergeTaskIntoState(state: AppState, task: TaskItem): AppState {
  const existingIndex = state.tasks.findIndex((item) => normalizeActionTitle(item.title) === normalizeActionTitle(task.title));

  if (existingIndex === -1) {
    return {
      ...state,
      tasks: [...state.tasks, task],
    };
  }

  return {
    ...state,
    tasks: state.tasks.map((item, index) => (index === existingIndex ? mergeTasks(item, task) : item)),
  };
}

function mergeActionList<T extends { title: string }>(items: T[], merge: (existing: T, incoming: T) => T): T[] {
  return items.reduce<T[]>((merged, item) => {
    const existingIndex = merged.findIndex((existing) => normalizeActionTitle(existing.title) === normalizeActionTitle(item.title));

    if (existingIndex === -1) {
      return [...merged, item];
    }

    return merged.map((existing, index) => (index === existingIndex ? merge(existing, item) : existing));
  }, []);
}

function mergeProgressGoals(existing: ProgressGoal, incoming: ProgressGoal): ProgressGoal {
  const progressEntries = mergeProgressEntries(existing.progressEntries, incoming.progressEntries);
  const baseline = Math.max(getGoalBaseline(existing), getGoalBaseline(incoming));
  const currentValue = baseline + progressEntries.reduce((total, entry) => total + entry.amount, 0);
  const schedule = mergeGoalSchedule(existing, incoming);
  const quickAddValues = Array.from(new Set([...existing.quickAddValues, ...incoming.quickAddValues]))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  return {
    ...existing,
    title: existing.title.trim() || incoming.title.trim(),
    note: existing.note?.trim() || incoming.note?.trim() || undefined,
    iconType: existing.iconKey || incoming.iconKey ? "custom" : existing.iconType,
    iconKey: existing.iconKey ?? incoming.iconKey,
    iconLabel: existing.iconLabel ?? incoming.iconLabel,
    targetValue: Math.max(existing.targetValue, incoming.targetValue),
    currentValue,
    unit: existing.unit.trim() || incoming.unit.trim(),
    startDate: minDate(existing.startDate, incoming.startDate),
    endDate: maxDate(existing.endDate, incoming.endDate),
    repeatMode: schedule.repeatMode,
    selectedDays: schedule.selectedDays,
    dueTime: existing.dueTime ?? incoming.dueTime,
    quickAddValues: quickAddValues.length > 0 ? quickAddValues : existing.quickAddValues,
    progressEntries,
    completedAtByDate: mergeDateStringMap(existing.completedAtByDate, incoming.completedAtByDate),
    lateDates: Array.from(new Set([...(existing.lateDates ?? []), ...(incoming.lateDates ?? [])])).sort(),
  };
}

function mergeTasks(existing: TaskItem, incoming: TaskItem): TaskItem {
  const completedDates = Array.from(new Set([...(existing.completedDates ?? []), ...(incoming.completedDates ?? [])])).sort();
  const schedule = mergeTaskSchedule(existing, incoming);
  const subitems = mergeSubitems(existing.subitems, incoming.subitems);
  const subitemStateByDate = mergeSubitemStateByDate(existing.subitemStateByDate, incoming.subitemStateByDate);
  const timerMinutes = subitems.length === 0 ? Math.max(existing.timerMinutes ?? 0, incoming.timerMinutes ?? 0) : 0;
  const timerStateByDate = timerMinutes > 0 ? mergeTimerStateByDate(existing.timerStateByDate, incoming.timerStateByDate) : {};

  return {
    ...existing,
    title: existing.title.trim() || incoming.title.trim(),
    note: existing.note?.trim() || incoming.note?.trim() || undefined,
    iconType: existing.iconKey || incoming.iconKey ? "custom" : (existing.iconType ?? incoming.iconType),
    iconKey: existing.iconKey ?? incoming.iconKey,
    iconLabel: existing.iconLabel ?? incoming.iconLabel,
    priority: getHighestPriority(existing.priority, incoming.priority),
    startDate: minDate(existing.startDate, incoming.startDate),
    endDate: maxDate(existing.endDate, incoming.endDate),
    repeatMode: schedule.repeatMode,
    selectedDays: schedule.selectedDays,
    dueTime: existing.dueTime ?? incoming.dueTime,
    date: minDate(existing.date ?? existing.startDate, incoming.date ?? incoming.startDate),
    completed: completedDates.includes(todayKey()),
    completedDates,
    completedAtByDate: mergeDateStringMap(existing.completedAtByDate, incoming.completedAtByDate),
    lateDates: Array.from(new Set([...(existing.lateDates ?? []), ...(incoming.lateDates ?? [])])).sort(),
    subitems: subitems.length > 0 ? subitems : undefined,
    subitemStateByDate: Object.keys(subitemStateByDate).length > 0 ? subitemStateByDate : undefined,
    timerMinutes: timerMinutes > 0 ? timerMinutes : undefined,
    timerStateByDate: Object.keys(timerStateByDate).length > 0 ? timerStateByDate : undefined,
  };
}

function mergeDateStringMap(first?: Record<string, string>, second?: Record<string, string>): Record<string, string> | undefined {
  const result = {
    ...(first ?? {}),
    ...(second ?? {}),
  };

  return Object.keys(result).length > 0 ? result : undefined;
}

function mergeSubitems(first?: ActionSubitem[], second?: ActionSubitem[]): ActionSubitem[] {
  const byTitle = new Map<string, ActionSubitem>();

  [...(first ?? []), ...(second ?? [])].forEach((subitem) => {
    const key = normalizeActionTitle(subitem.title);

    if (!key) {
      return;
    }

    const existing = byTitle.get(key);
    byTitle.set(key, {
      id: existing?.id ?? subitem.id,
      title: existing?.title ?? subitem.title,
      targetCount: Math.max(existing?.targetCount ?? 1, subitem.targetCount ?? 1) > 1 ? Math.max(existing?.targetCount ?? 1, subitem.targetCount ?? 1) : undefined,
    });
  });

  return Array.from(byTitle.values());
}

function mergeSubitemStateByDate(first?: ActionSubitemStateByDate, second?: ActionSubitemStateByDate): ActionSubitemStateByDate {
  const result: ActionSubitemStateByDate = {};

  [first, second].forEach((source) => {
    Object.entries(source ?? {}).forEach(([date, states]) => {
      result[date] = {
        ...(result[date] ?? {}),
        ...states,
      };
    });
  });

  return result;
}

function mergeTimerStateByDate(first?: ActionTimerStateByDate, second?: ActionTimerStateByDate): ActionTimerStateByDate {
  const result: ActionTimerStateByDate = {};

  [first, second].forEach((source) => {
    Object.entries(source ?? {}).forEach(([date, state]) => {
      const existing = result[date];
      const secondsDone = Math.max(existing?.secondsDone ?? 0, state.secondsDone ?? 0);
      result[date] = {
        completed: existing?.completed === true || state.completed === true,
        secondsDone: secondsDone > 0 ? secondsDone : undefined,
      };
    });
  });

  return result;
}

function mergeProgressEntries(first: ProgressEntry[], second: ProgressEntry[]): ProgressEntry[] {
  const seen = new Set<string>();

  return [...first, ...second]
    .filter((entry) => {
      const key = entry.id || `${entry.date}|${entry.amount}|${entry.note ?? ""}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function mergeGoalSchedule(first: ProgressGoal, second: ProgressGoal): { repeatMode: GoalRepeatMode; selectedDays?: number[] } {
  const days = unionDays(daysForGoal(first), daysForGoal(second));

  return compactGoalDays(days);
}

function mergeTaskSchedule(first: TaskItem, second: TaskItem): { repeatMode: TaskRepeatMode; selectedDays?: number[] } {
  if (
    first.repeatMode === "once" &&
    second.repeatMode === "once" &&
    first.startDate === second.startDate &&
    first.endDate === second.endDate
  ) {
    return { repeatMode: "once", selectedDays: undefined };
  }

  const days = unionDays(daysForTask(first), daysForTask(second));

  return compactTaskDays(days);
}

function daysForGoal(goal: ProgressGoal): number[] {
  return daysForRepeat(goal.repeatMode, goal.selectedDays);
}

function daysForTask(task: TaskItem): number[] {
  if (task.repeatMode === "once") {
    return [getIsoWeekday(task.startDate)];
  }

  return daysForRepeat(task.repeatMode, task.selectedDays);
}

function daysForRepeat(repeatMode: GoalRepeatMode, selectedDays?: number[]): number[] {
  if (repeatMode === "everyDay") {
    return [1, 2, 3, 4, 5, 6, 7];
  }

  if (repeatMode === "weekdays") {
    return [1, 2, 3, 4, 5];
  }

  return normalizeSelectedDays(selectedDays);
}

function compactGoalDays(days: number[]): { repeatMode: GoalRepeatMode; selectedDays?: number[] } {
  const normalized = normalizeSelectedDays(days);

  if (normalized.length >= 7) {
    return { repeatMode: "everyDay", selectedDays: undefined };
  }

  if (isWeekdays(normalized)) {
    return { repeatMode: "weekdays", selectedDays: undefined };
  }

  return { repeatMode: "selectedDays", selectedDays: normalized };
}

function compactTaskDays(days: number[]): { repeatMode: TaskRepeatMode; selectedDays?: number[] } {
  const goalSchedule = compactGoalDays(days);

  return goalSchedule;
}

function unionDays(first: number[], second: number[]): number[] {
  return normalizeSelectedDays([...first, ...second]);
}

function normalizeSelectedDays(days: number[] | undefined): number[] {
  return Array.from(
    new Set(
      (days ?? [])
        .map((day) => (day === 0 ? 7 : day))
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7),
    ),
  ).sort((a, b) => a - b);
}

function isWeekdays(days: number[]): boolean {
  return days.length === 5 && days.every((day, index) => day === index + 1);
}

function getIsoWeekday(dateKey: string): number {
  const date = new Date(`${dateKey}T00:00:00`);
  const day = date.getDay();

  return day === 0 ? 7 : day;
}

function getGoalBaseline(goal: ProgressGoal): number {
  const loggedTotal = goal.progressEntries.reduce((total, entry) => total + entry.amount, 0);

  return Math.max(goal.currentValue - loggedTotal, 0);
}

function minDate(first: string, second: string): string {
  if (!first) {
    return second;
  }

  if (!second) {
    return first;
  }

  return first < second ? first : second;
}

function maxDate(first: string, second: string): string {
  if (!first) {
    return second;
  }

  if (!second) {
    return first;
  }

  return first > second ? first : second;
}

function getHighestPriority(first?: TaskItem["priority"], second?: TaskItem["priority"]): TaskItem["priority"] {
  const priorityRank = {
    low: 1,
    medium: 2,
    high: 3,
  } as const;

  if (!first) {
    return second;
  }

  if (!second) {
    return first;
  }

  return priorityRank[second] > priorityRank[first] ? second : first;
}
