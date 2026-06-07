import { getGoalDailyMetrics, isGoalDueOnDate, isTaskCompletedOnDate, isTaskDueOnDate } from "./calculations";
import { addDays, parseDateKey } from "./dateUtils";
import type { AppState, LifeAreaKey, ProgressGoal, TaskItem, TaskOccurrence } from "./types";

export type DirectionReviewPeriod = "7d" | "30d" | "90d" | "365d";
export type DirectionAreaState = "growing" | "recovering" | "steady" | "declining" | "quiet" | "insufficient";
export type DirectionConfidence = "clear" | "tentative";
export type DirectionItemType = "goal" | "task";

export const directionReviewPeriodDays: Record<DirectionReviewPeriod, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
};

export const builtInLifeAreas: Exclude<LifeAreaKey, "custom">[] = [
  "health",
  "work",
  "learning",
  "personal",
  "finance",
  "creativity",
];

export type LifeAreaAssignment = {
  areaId: string;
  areaKey: LifeAreaKey;
  customLabel?: string;
  source: "manual" | "rule" | "fallback";
  confidence: DirectionConfidence;
  reason: "manual" | "title" | "description" | "group" | "unit" | "emoji" | "icon" | "fallback";
};

export type DirectionActionStats = {
  id: string;
  itemType: DirectionItemType;
  title: string;
  emoji?: string;
  area: LifeAreaAssignment;
  currentOpportunities: number;
  currentSuccesses: number;
  previousOpportunities: number;
  previousSuccesses: number;
  consistency: number | null;
  previousConsistency: number | null;
  momentum: number | null;
};

export type DirectionLifeArea = {
  id: string;
  areaKey: LifeAreaKey;
  customLabel?: string;
  state: DirectionAreaState;
  confidence: DirectionConfidence;
  currentOpportunities: number;
  currentSuccesses: number;
  previousOpportunities: number;
  previousSuccesses: number;
  consistency: number | null;
  previousConsistency: number | null;
  momentum: number | null;
  items: DirectionActionStats[];
};

export type DirectionSummary = {
  kind: "learning" | "shift" | "growth" | "decline" | "steady";
  confidence: DirectionConfidence;
  consistency: number | null;
  previousConsistency: number | null;
  momentum: number | null;
  primaryAreaId?: string;
  secondaryAreaId?: string;
};

export type DirectionInsight =
  | {
      kind: "area-growth" | "area-decline";
      areaId: string;
      consistency: number;
      previousConsistency: number;
      momentum: number;
      opportunities: number;
    }
  | {
      kind: "consistent-item" | "fading-item";
      itemId: string;
      itemType: DirectionItemType;
      areaId: string;
      title: string;
      consistency: number;
      previousConsistency: number | null;
      momentum: number | null;
      successes: number;
      opportunities: number;
    };

export type DirectionCoverage = {
  activeDays: number;
  activeItems: number;
  scheduledOpportunities: number;
  previousScheduledOpportunities: number;
  areasWithData: number;
  comparableAreas: number;
  tentativeItems: number;
  manuallyClassifiedItems: number;
};

export type DirectionReview = {
  period: DirectionReviewPeriod;
  currentRange: { startDate: string; endDate: string };
  previousRange: { startDate: string; endDate: string };
  summary: DirectionSummary;
  areas: DirectionLifeArea[];
  insights: DirectionInsight[];
  coverage: DirectionCoverage;
};

type DirectionItem = ProgressGoal | TaskItem;

type PeriodItemStats = {
  opportunities: number;
  successes: number;
};

type PeriodStats = {
  items: Map<string, PeriodItemStats>;
  activeDates: Set<string>;
  opportunities: number;
};

type EffectiveGoal = {
  goal: ProgressGoal;
  occurrenceStatus?: TaskOccurrence["status"];
  carried: boolean;
};

type EffectiveTask = {
  task: TaskItem;
  occurrenceStatus?: TaskOccurrence["status"];
};

type RuleSource = {
  value: string;
  weight: number;
  reason: LifeAreaAssignment["reason"];
};

const areaKeywords: Record<Exclude<LifeAreaKey, "custom">, string[]> = {
  health: [
    "health", "workout", "exercise", "walk", "running", "run ", "sleep", "water", "meditat", "doctor", "gym", "yoga",
    "здоров", "тренир", "заряд", "ходьб", "прогул", "бег", "сон", "вод", "медита", "врач", "спорт", "йог",
  ],
  work: [
    "work", "project", "client", "meeting", "deadline", "office", "email", "presentation", "business",
    "работ", "проект", "клиент", "встреч", "дедлайн", "офис", "почт", "презентац", "бизнес",
  ],
  learning: [
    "learn", "study", "reading", "read ", "course", "language", "english", "german", "lesson", "book", "exam",
    "учеб", "учить", "изуч", "чтен", "читать", "курс", "язык", "англ", "немец", "урок", "книг", "экзам",
  ],
  personal: [
    "personal", "home", "family", "clean", "friend", "call", "shopping", "chores", "journal",
    "личн", "дом", "сем", "уборк", "друг", "позвон", "магаз", "покуп", "дела", "дневник",
  ],
  finance: [
    "finance", "budget", "saving", "invest", "money", "payment", "expense", "income", "bank",
    "финанс", "бюдж", "накоп", "инвест", "деньг", "оплат", "расход", "доход", "банк",
  ],
  creativity: [
    "creative", "draw", "paint", "writing", "write ", "music", "photo", "design", "compose", "craft",
    "твор", "рисов", "живопис", "писать", "музык", "фото", "дизайн", "сочин", "рукодел",
  ],
};

const emojiAreas: Partial<Record<Exclude<LifeAreaKey, "custom">, string[]>> = {
  health: ["🏃", "🏋", "💪", "🧘", "💧", "🥗", "😴", "❤️", "🩺"],
  work: ["💼", "🧑‍💻", "👨‍💻", "👩‍💻", "📊", "📎", "🏢"],
  learning: ["📚", "📖", "🎓", "🧠", "✍️", "📝", "🗣️"],
  personal: ["🏠", "👪", "🧹", "🛒", "📞", "🪴"],
  finance: ["💰", "💳", "💵", "📈", "🏦", "🪙"],
  creativity: ["🎨", "🎵", "🎸", "📷", "🎬", "🖌️", "🎭"],
};

const iconAreas: Partial<Record<string, Exclude<LifeAreaKey, "custom">>> = {
  book: "learning",
  graduation: "learning",
  language: "learning",
  dumbbell: "health",
  run: "health",
  droplet: "health",
  moon: "health",
  pill: "health",
  home: "personal",
  cart: "personal",
};

function actionKey(itemType: DirectionItemType, id: string): string {
  return `${itemType}:${id}`;
}

function normalizeCustomLabel(value: string | undefined): string | undefined {
  const label = value?.trim().slice(0, 40);

  return label || undefined;
}

function customAreaId(label: string | undefined): string {
  const normalized = normalizeCustomLabel(label)?.toLocaleLowerCase().replace(/\s+/g, "-") ?? "custom";

  return `custom:${normalized}`;
}

export function classifyLifeArea(item: DirectionItem): LifeAreaAssignment {
  if (item.lifeAreaOverride) {
    const customLabel = item.lifeAreaOverride === "custom" ? normalizeCustomLabel(item.lifeAreaCustomLabel) : undefined;

    return {
      areaId: item.lifeAreaOverride === "custom" ? customAreaId(customLabel) : item.lifeAreaOverride,
      areaKey: item.lifeAreaOverride,
      customLabel,
      source: "manual",
      confidence: "clear",
      reason: "manual",
    };
  }

  const sources: RuleSource[] = [
    { value: item.title, weight: 4, reason: "title" },
    { value: item.note ?? "", weight: 2, reason: "description" },
    { value: item.groupName ?? "", weight: 3, reason: "group" },
    { value: "unit" in item ? item.unit : "", weight: 2, reason: "unit" },
  ];
  const scores = new Map<Exclude<LifeAreaKey, "custom">, number>(builtInLifeAreas.map((area) => [area, 0]));
  const reasons = new Map<Exclude<LifeAreaKey, "custom">, LifeAreaAssignment["reason"]>();

  sources.forEach((source) => {
    const normalized = source.value.toLocaleLowerCase();

    if (!normalized) {
      return;
    }

    builtInLifeAreas.forEach((area) => {
      if (areaKeywords[area].some((keyword) => normalized.includes(keyword))) {
        scores.set(area, (scores.get(area) ?? 0) + source.weight);
        reasons.set(area, reasons.get(area) ?? source.reason);
      }
    });
  });

  if (item.emoji) {
    builtInLifeAreas.forEach((area) => {
      if (emojiAreas[area]?.some((emoji) => item.emoji?.includes(emoji))) {
        scores.set(area, (scores.get(area) ?? 0) + 4);
        reasons.set(area, reasons.get(area) ?? "emoji");
      }
    });
  }

  const iconArea = item.iconKey ? iconAreas[item.iconKey] : undefined;
  if (iconArea) {
    scores.set(iconArea, (scores.get(iconArea) ?? 0) + 3);
    reasons.set(iconArea, reasons.get(iconArea) ?? "icon");
  }

  const ranked = builtInLifeAreas
    .map((area) => ({ area, score: scores.get(area) ?? 0 }))
    .sort((left, right) => right.score - left.score || builtInLifeAreas.indexOf(left.area) - builtInLifeAreas.indexOf(right.area));
  const winner = ranked[0];
  const runnerUp = ranked[1];

  if (!winner || winner.score === 0) {
    return {
      areaId: "personal",
      areaKey: "personal",
      source: "fallback",
      confidence: "tentative",
      reason: "fallback",
    };
  }

  return {
    areaId: winner.area,
    areaKey: winner.area,
    source: "rule",
    confidence: winner.score >= 3 && winner.score - (runnerUp?.score ?? 0) >= 2 ? "clear" : "tentative",
    reason: reasons.get(winner.area) ?? "title",
  };
}

function rangeDateKeys(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let cursor = startDate;

  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function getReviewRanges(period: DirectionReviewPeriod, today: string) {
  const days = directionReviewPeriodDays[period];
  const currentEnd = addDays(today, -1);
  const currentStart = addDays(currentEnd, -(days - 1));
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(previousEnd, -(days - 1));

  return {
    current: { startDate: currentStart, endDate: currentEnd, dates: rangeDateKeys(currentStart, currentEnd) },
    previous: { startDate: previousStart, endDate: previousEnd, dates: rangeDateKeys(previousStart, previousEnd) },
  };
}

function getOccurrenceSets(occurrences: TaskOccurrence[], dateKey: string, itemType: DirectionItemType) {
  const relevant = occurrences.filter((occurrence) => occurrence.itemType === itemType);
  const skipped = new Set(
    relevant
      .filter((occurrence) => occurrence.date === dateKey && occurrence.status === "skipped")
      .map((occurrence) => occurrence.itemId),
  );
  const movedAway = new Set(
    relevant
      .filter(
        (occurrence) =>
          occurrence.source === "carry_over" &&
          occurrence.movedFromDate === dateKey &&
          occurrence.date !== dateKey &&
          occurrence.status !== "skipped",
      )
      .map((occurrence) => occurrence.itemId),
  );
  const carried = relevant.filter(
    (occurrence) =>
      occurrence.source === "carry_over" &&
      occurrence.date === dateKey &&
      occurrence.status !== "skipped" &&
      !movedAway.has(occurrence.itemId),
  );

  return { skipped, movedAway, carried };
}

function getEffectiveGoals(state: AppState, dateKey: string): EffectiveGoal[] {
  const date = parseDateKey(dateKey);
  const occurrenceSets = getOccurrenceSets(state.occurrences ?? [], dateKey, "goal");
  const effective = new Map<string, EffectiveGoal>();

  state.goals
    .filter(
      (goal) =>
        !occurrenceSets.skipped.has(goal.id) &&
        !occurrenceSets.movedAway.has(goal.id) &&
        isGoalDueOnDate(goal, date, dateKey),
    )
    .forEach((goal) => effective.set(goal.id, { goal, carried: false }));

  occurrenceSets.carried.forEach((occurrence) => {
    const goal = state.goals.find((item) => item.id === occurrence.itemId);

    if (goal && !effective.has(goal.id)) {
      effective.set(goal.id, { goal, occurrenceStatus: occurrence.status, carried: true });
    }
  });

  return Array.from(effective.values());
}

function getEffectiveTasks(state: AppState, dateKey: string): EffectiveTask[] {
  const date = parseDateKey(dateKey);
  const occurrenceSets = getOccurrenceSets(state.occurrences ?? [], dateKey, "task");
  const effective = new Map<string, EffectiveTask>();

  state.tasks
    .filter(
      (task) =>
        !occurrenceSets.skipped.has(task.id) &&
        !occurrenceSets.movedAway.has(task.id) &&
        isTaskDueOnDate(task, date, dateKey),
    )
    .forEach((task) => effective.set(task.id, { task }));

  occurrenceSets.carried.forEach((occurrence) => {
    const task = state.tasks.find((item) => item.id === occurrence.itemId);

    if (task && !effective.has(task.id)) {
      effective.set(task.id, { task, occurrenceStatus: occurrence.status });
    }
  });

  return Array.from(effective.values());
}

function isGoalSuccessful(goal: ProgressGoal, dateKey: string, today: string, carried: boolean): boolean {
  const effectiveGoal = carried
    ? {
        ...goal,
        startDate: dateKey,
        endDate: dateKey,
        repeatMode: "everyDay" as const,
        selectedDays: undefined,
      }
    : goal;
  const metrics = getGoalDailyMetrics(effectiveGoal, dateKey, today);

  return metrics.dailyPlan <= 0 || metrics.todayCompleted >= metrics.dailyPlan || metrics.totalCompleted >= metrics.targetAmount;
}

function calculatePeriodStats(state: AppState, dates: string[], today: string): PeriodStats {
  const result: PeriodStats = {
    items: new Map(),
    activeDates: new Set(),
    opportunities: 0,
  };
  const record = (key: string, successful: boolean, dateKey: string) => {
    const current = result.items.get(key) ?? { opportunities: 0, successes: 0 };
    current.opportunities += 1;
    current.successes += successful ? 1 : 0;
    result.items.set(key, current);
    result.activeDates.add(dateKey);
    result.opportunities += 1;
  };

  dates.forEach((dateKey) => {
    getEffectiveGoals(state, dateKey).forEach(({ goal, occurrenceStatus, carried }) => {
      record(
        actionKey("goal", goal.id),
        occurrenceStatus === "completed" || isGoalSuccessful(goal, dateKey, today, carried),
        dateKey,
      );
    });
    getEffectiveTasks(state, dateKey).forEach(({ task, occurrenceStatus }) => {
      record(
        actionKey("task", task.id),
        occurrenceStatus === "completed" || isTaskCompletedOnDate(task, dateKey),
        dateKey,
      );
    });
  });

  return result;
}

function percent(successes: number, opportunities: number): number | null {
  return opportunities > 0 ? Math.round((successes / opportunities) * 100) : null;
}

function getMomentum(current: number | null, previous: number | null, currentOpportunities: number, previousOpportunities: number): number | null {
  return current !== null && previous !== null && currentOpportunities >= 3 && previousOpportunities >= 3
    ? current - previous
    : null;
}

function getAreaState(area: Pick<DirectionLifeArea, "currentOpportunities" | "currentSuccesses" | "consistency" | "previousConsistency" | "momentum">): DirectionAreaState {
  if (area.currentOpportunities >= 3 && area.currentSuccesses === 0) {
    return "quiet";
  }

  if (area.momentum === null || area.consistency === null || area.previousConsistency === null) {
    return "insufficient";
  }

  if (area.previousConsistency <= 30 && area.consistency >= 50 && area.momentum >= 20) {
    return "recovering";
  }

  if (area.momentum >= 10) {
    return "growing";
  }

  if (area.momentum <= -10) {
    return "declining";
  }

  return "steady";
}

function buildActionStats(state: AppState, current: PeriodStats, previous: PeriodStats): DirectionActionStats[] {
  const actions: Array<{ item: DirectionItem; itemType: DirectionItemType }> = [
    ...state.goals.map((item) => ({ item, itemType: "goal" as const })),
    ...state.tasks.map((item) => ({ item, itemType: "task" as const })),
  ];

  return actions.map(({ item, itemType }) => {
    const key = actionKey(itemType, item.id);
    const currentStats = current.items.get(key) ?? { opportunities: 0, successes: 0 };
    const previousStats = previous.items.get(key) ?? { opportunities: 0, successes: 0 };
    const consistency = percent(currentStats.successes, currentStats.opportunities);
    const previousConsistency = percent(previousStats.successes, previousStats.opportunities);

    return {
      id: item.id,
      itemType,
      title: item.title,
      emoji: item.emoji,
      area: classifyLifeArea(item),
      currentOpportunities: currentStats.opportunities,
      currentSuccesses: currentStats.successes,
      previousOpportunities: previousStats.opportunities,
      previousSuccesses: previousStats.successes,
      consistency,
      previousConsistency,
      momentum: getMomentum(consistency, previousConsistency, currentStats.opportunities, previousStats.opportunities),
    };
  });
}

function buildAreas(items: DirectionActionStats[]): DirectionLifeArea[] {
  const groups = new Map<string, DirectionActionStats[]>();

  items
    .filter((item) => item.currentOpportunities > 0 || item.previousOpportunities > 0)
    .forEach((item) => groups.set(item.area.areaId, [...(groups.get(item.area.areaId) ?? []), item]));

  return Array.from(groups.entries())
    .map(([id, areaItems]): DirectionLifeArea => {
      const first = areaItems[0];
      const currentOpportunities = areaItems.reduce((total, item) => total + item.currentOpportunities, 0);
      const currentSuccesses = areaItems.reduce((total, item) => total + item.currentSuccesses, 0);
      const previousOpportunities = areaItems.reduce((total, item) => total + item.previousOpportunities, 0);
      const previousSuccesses = areaItems.reduce((total, item) => total + item.previousSuccesses, 0);
      const consistency = percent(currentSuccesses, currentOpportunities);
      const previousConsistency = percent(previousSuccesses, previousOpportunities);
      const momentum = getMomentum(consistency, previousConsistency, currentOpportunities, previousOpportunities);
      const base = {
        id,
        areaKey: first.area.areaKey,
        customLabel: first.area.customLabel,
        confidence: areaItems.every((item) => item.area.confidence === "clear") ? "clear" as const : "tentative" as const,
        currentOpportunities,
        currentSuccesses,
        previousOpportunities,
        previousSuccesses,
        consistency,
        previousConsistency,
        momentum,
        items: [...areaItems].sort(
          (left, right) =>
            right.currentOpportunities - left.currentOpportunities ||
            (right.consistency ?? -1) - (left.consistency ?? -1) ||
            left.title.localeCompare(right.title),
        ),
      };

      return { ...base, state: getAreaState(base) };
    })
    .sort((left, right) => {
      const leftSignal = Math.abs(left.momentum ?? 0) + Math.min(left.currentOpportunities, 30);
      const rightSignal = Math.abs(right.momentum ?? 0) + Math.min(right.currentOpportunities, 30);

      return rightSignal - leftSignal || right.currentOpportunities - left.currentOpportunities || left.id.localeCompare(right.id);
    });
}

function buildSummary(areas: DirectionLifeArea[], current: PeriodStats, previous: PeriodStats): DirectionSummary {
  const consistency = percent(
    Array.from(current.items.values()).reduce((total, item) => total + item.successes, 0),
    current.opportunities,
  );
  const previousConsistency = percent(
    Array.from(previous.items.values()).reduce((total, item) => total + item.successes, 0),
    previous.opportunities,
  );
  const comparableAreas = areas.filter((area) => area.momentum !== null);
  const strongestGrowth = [...comparableAreas].sort((left, right) => (right.momentum ?? 0) - (left.momentum ?? 0))[0];
  const strongestDecline = [...comparableAreas].sort((left, right) => (left.momentum ?? 0) - (right.momentum ?? 0))[0];
  const confidence: DirectionConfidence =
    current.opportunities >= 8 && previous.opportunities >= 8 && comparableAreas.length > 0 ? "clear" : "tentative";
  const base = {
    confidence,
    consistency,
    previousConsistency,
    momentum: getMomentum(consistency, previousConsistency, current.opportunities, previous.opportunities),
  };

  if (comparableAreas.length === 0) {
    return { ...base, kind: "learning" };
  }

  if ((strongestGrowth?.momentum ?? 0) >= 10 && (strongestDecline?.momentum ?? 0) <= -10) {
    return {
      ...base,
      kind: "shift",
      primaryAreaId: strongestGrowth.id,
      secondaryAreaId: strongestDecline.id,
    };
  }

  if ((strongestGrowth?.momentum ?? 0) >= 10) {
    return { ...base, kind: "growth", primaryAreaId: strongestGrowth.id };
  }

  if ((strongestDecline?.momentum ?? 0) <= -10) {
    return { ...base, kind: "decline", primaryAreaId: strongestDecline.id };
  }

  return { ...base, kind: "steady", primaryAreaId: strongestGrowth?.id };
}

function buildInsights(areas: DirectionLifeArea[], items: DirectionActionStats[]): DirectionInsight[] {
  const insights: DirectionInsight[] = [];
  const growing = areas
    .filter((area) => area.momentum !== null && area.momentum >= 10 && area.consistency !== null && area.previousConsistency !== null)
    .sort((left, right) => (right.momentum ?? 0) - (left.momentum ?? 0))[0];
  const declining = areas
    .filter((area) => area.momentum !== null && area.momentum <= -10 && area.consistency !== null && area.previousConsistency !== null)
    .sort((left, right) => (left.momentum ?? 0) - (right.momentum ?? 0))[0];

  if (growing && growing.consistency !== null && growing.previousConsistency !== null && growing.momentum !== null) {
    insights.push({
      kind: "area-growth",
      areaId: growing.id,
      consistency: growing.consistency,
      previousConsistency: growing.previousConsistency,
      momentum: growing.momentum,
      opportunities: growing.currentOpportunities,
    });
  }

  if (declining && declining.consistency !== null && declining.previousConsistency !== null && declining.momentum !== null) {
    insights.push({
      kind: "area-decline",
      areaId: declining.id,
      consistency: declining.consistency,
      previousConsistency: declining.previousConsistency,
      momentum: declining.momentum,
      opportunities: declining.currentOpportunities,
    });
  }

  const fading = items
    .filter(
      (item) =>
        item.currentOpportunities >= 3 &&
        item.previousOpportunities >= 3 &&
        item.consistency !== null &&
        item.consistency <= 40 &&
        item.momentum !== null &&
        item.momentum <= -20,
    )
    .sort(
      (left, right) =>
        (left.momentum ?? 0) - (right.momentum ?? 0) ||
        right.currentOpportunities - left.currentOpportunities,
    )[0];

  if (fading && fading.consistency !== null) {
    insights.push({
      kind: "fading-item",
      itemId: fading.id,
      itemType: fading.itemType,
      areaId: fading.area.areaId,
      title: fading.title,
      consistency: fading.consistency,
      previousConsistency: fading.previousConsistency,
      momentum: fading.momentum,
      successes: fading.currentSuccesses,
      opportunities: fading.currentOpportunities,
    });
  }

  const consistent = items
    .filter((item) => item.currentOpportunities >= 4 && item.consistency !== null && item.consistency >= 75)
    .sort(
      (left, right) =>
        (right.consistency ?? 0) - (left.consistency ?? 0) ||
        right.currentOpportunities - left.currentOpportunities,
    )[0];

  if (consistent && consistent.consistency !== null && insights.length < 3) {
    insights.push({
      kind: "consistent-item",
      itemId: consistent.id,
      itemType: consistent.itemType,
      areaId: consistent.area.areaId,
      title: consistent.title,
      consistency: consistent.consistency,
      previousConsistency: consistent.previousConsistency,
      momentum: consistent.momentum,
      successes: consistent.currentSuccesses,
      opportunities: consistent.currentOpportunities,
    });
  }

  return insights.slice(0, 3);
}

export function buildDirectionReview(
  state: AppState,
  period: DirectionReviewPeriod = "30d",
  today: string,
): DirectionReview {
  const ranges = getReviewRanges(period, today);
  const current = calculatePeriodStats(state, ranges.current.dates, today);
  const previous = calculatePeriodStats(state, ranges.previous.dates, today);
  const items = buildActionStats(state, current, previous);
  const areas = buildAreas(items);
  const relevantItems = items.filter((item) => item.currentOpportunities > 0 || item.previousOpportunities > 0);

  return {
    period,
    currentRange: { startDate: ranges.current.startDate, endDate: ranges.current.endDate },
    previousRange: { startDate: ranges.previous.startDate, endDate: ranges.previous.endDate },
    summary: buildSummary(areas, current, previous),
    areas,
    insights: buildInsights(areas, relevantItems),
    coverage: {
      activeDays: current.activeDates.size,
      activeItems: relevantItems.filter((item) => item.currentOpportunities > 0).length,
      scheduledOpportunities: current.opportunities,
      previousScheduledOpportunities: previous.opportunities,
      areasWithData: areas.filter((area) => area.currentOpportunities > 0).length,
      comparableAreas: areas.filter((area) => area.momentum !== null).length,
      tentativeItems: relevantItems.filter((item) => item.area.confidence === "tentative").length,
      manuallyClassifiedItems: relevantItems.filter((item) => item.area.source === "manual").length,
    },
  };
}
