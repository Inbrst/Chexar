import { buildDirectionReview, type DirectionActionStats, type DirectionItemType } from "./directionReview";
import { addDays, parseDateKey } from "./dateUtils";
import type { AppState, LifeAreaKey } from "./types";

export type DirectionCheckInDecision = "fits" | "adjusted" | "dismissed";

export type DirectionCheckInRecord = {
  id: string;
  weekStart: string;
  reviewStart: string;
  reviewEnd: string;
  previousStart: string;
  previousEnd: string;
  itemId: string;
  itemType: DirectionItemType;
  itemTitleSnapshot: string;
  areaKey: LifeAreaKey;
  areaLabelSnapshot?: string;
  previousSuccesses: number;
  previousOpportunities: number;
  previousConsistency: number;
  currentSuccesses: number;
  currentOpportunities: number;
  currentConsistency: number;
  decision: DirectionCheckInDecision;
  decidedAt: string;
};

export type DirectionCheckInCandidate = {
  weekStart: string;
  reviewStart: string;
  reviewEnd: string;
  previousStart: string;
  previousEnd: string;
  itemId: string;
  itemType: DirectionItemType;
  itemTitle: string;
  areaKey: LifeAreaKey;
  areaLabel?: string;
  previousSuccesses: number;
  previousOpportunities: number;
  previousConsistency: number;
  currentSuccesses: number;
  currentOpportunities: number;
  currentConsistency: number;
  momentum: number;
};

export type DirectionCheckInOutcome = {
  decision: Exclude<DirectionCheckInDecision, "dismissed">;
  itemId: string;
  itemType: DirectionItemType;
  itemTitle: string;
  previousSuccesses: number;
  previousOpportunities: number;
  currentSuccesses: number;
  currentOpportunities: number;
};

type CompletedWeekRanges = {
  reviewStart: string;
  reviewEnd: string;
  previousStart: string;
  previousEnd: string;
  asOfDate: string;
};

const minimumItemOpportunities = 3;
const minimumItemDecline = -20;
const strongItemDecline = -30;
const meaningfulAreaDecline = -10;
const cooldownDays = 14;
const directionCheckInDecisions = new Set<DirectionCheckInDecision>(["fits", "adjusted", "dismissed"]);

export function getLastCompletedWeekRanges(today: string): CompletedWeekRanges {
  const day = parseDateKey(today).getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const asOfDate = addDays(today, -daysSinceMonday);
  const reviewEnd = addDays(asOfDate, -1);
  const reviewStart = addDays(reviewEnd, -6);
  const previousEnd = addDays(reviewStart, -1);
  const previousStart = addDays(previousEnd, -6);

  return {
    reviewStart,
    reviewEnd,
    previousStart,
    previousEnd,
    asOfDate,
  };
}

export function buildDirectionCheckInCandidate(
  state: AppState,
  today: string,
  records: DirectionCheckInRecord[],
): DirectionCheckInCandidate | null {
  const ranges = getLastCompletedWeekRanges(today);

  if (records.some((record) => record.weekStart === ranges.reviewStart)) {
    return null;
  }

  const review = buildDirectionReview(state, "7d", ranges.asOfDate);
  const areaById = new Map(review.areas.map((area) => [area.id, area]));
  const cooldownStart = addDays(ranges.reviewEnd, -cooldownDays);
  const candidates = review.areas
    .flatMap((area) => area.items)
    .filter((item) => isEligibleItem(state, item, today))
    .filter(
      (item) =>
        item.currentOpportunities >= minimumItemOpportunities &&
        item.previousOpportunities >= minimumItemOpportunities &&
        item.consistency !== null &&
        item.previousConsistency !== null &&
        item.momentum !== null &&
        item.momentum <= minimumItemDecline,
    )
    .filter((item) => {
      const areaMomentum = areaById.get(item.area.areaId)?.momentum;

      return item.momentum !== null &&
        (item.momentum <= strongItemDecline || (areaMomentum !== null && areaMomentum !== undefined && areaMomentum <= meaningfulAreaDecline));
    })
    .filter(
      (item) =>
        !records.some(
          (record) =>
            record.itemId === item.id &&
            record.itemType === item.itemType &&
            record.reviewEnd >= cooldownStart &&
            record.reviewEnd < ranges.reviewEnd,
        ),
    )
    .sort(
      (left, right) =>
        (left.momentum ?? 0) - (right.momentum ?? 0) ||
        right.currentOpportunities + right.previousOpportunities -
          (left.currentOpportunities + left.previousOpportunities) ||
        `${left.itemType}:${left.id}`.localeCompare(`${right.itemType}:${right.id}`),
    );
  const selected = candidates[0];

  if (
    !selected ||
    selected.consistency === null ||
    selected.previousConsistency === null ||
    selected.momentum === null
  ) {
    return null;
  }

  return {
    weekStart: ranges.reviewStart,
    reviewStart: ranges.reviewStart,
    reviewEnd: ranges.reviewEnd,
    previousStart: ranges.previousStart,
    previousEnd: ranges.previousEnd,
    itemId: selected.id,
    itemType: selected.itemType,
    itemTitle: selected.title,
    areaKey: selected.area.areaKey,
    areaLabel: selected.area.customLabel,
    previousSuccesses: selected.previousSuccesses,
    previousOpportunities: selected.previousOpportunities,
    previousConsistency: selected.previousConsistency,
    currentSuccesses: selected.currentSuccesses,
    currentOpportunities: selected.currentOpportunities,
    currentConsistency: selected.consistency,
    momentum: selected.momentum,
  };
}

export function buildDirectionCheckInOutcome(
  state: AppState,
  today: string,
  records: DirectionCheckInRecord[],
): DirectionCheckInOutcome | null {
  const ranges = getLastCompletedWeekRanges(today);
  const priorReviewEnd = addDays(ranges.reviewEnd, -7);
  const record = [...records]
    .filter(
      (item) =>
        item.reviewEnd === priorReviewEnd &&
        (item.decision === "fits" || item.decision === "adjusted"),
    )
    .sort((left, right) => right.decidedAt.localeCompare(left.decidedAt))[0];

  if (!record) {
    return null;
  }

  const review = buildDirectionReview(state, "7d", ranges.asOfDate);
  const item = review.areas
    .flatMap((area) => area.items)
    .find((candidate) => candidate.id === record.itemId && candidate.itemType === record.itemType);

  if (!item || item.currentOpportunities < minimumItemOpportunities) {
    return null;
  }

  return {
    decision: record.decision as Exclude<DirectionCheckInDecision, "dismissed">,
    itemId: record.itemId,
    itemType: record.itemType,
    itemTitle: item.title || record.itemTitleSnapshot,
    previousSuccesses: record.currentSuccesses,
    previousOpportunities: record.currentOpportunities,
    currentSuccesses: item.currentSuccesses,
    currentOpportunities: item.currentOpportunities,
  };
}

export function createDirectionCheckInRecord(
  candidate: DirectionCheckInCandidate,
  decision: DirectionCheckInDecision,
  id: string,
  decidedAt: string,
): DirectionCheckInRecord {
  return {
    id,
    weekStart: candidate.weekStart,
    reviewStart: candidate.reviewStart,
    reviewEnd: candidate.reviewEnd,
    previousStart: candidate.previousStart,
    previousEnd: candidate.previousEnd,
    itemId: candidate.itemId,
    itemType: candidate.itemType,
    itemTitleSnapshot: candidate.itemTitle,
    areaKey: candidate.areaKey,
    areaLabelSnapshot: candidate.areaLabel,
    previousSuccesses: candidate.previousSuccesses,
    previousOpportunities: candidate.previousOpportunities,
    previousConsistency: candidate.previousConsistency,
    currentSuccesses: candidate.currentSuccesses,
    currentOpportunities: candidate.currentOpportunities,
    currentConsistency: candidate.currentConsistency,
    decision,
    decidedAt,
  };
}

export function normalizeDirectionCheckInRecords(value: unknown): DirectionCheckInRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const records = value
    .map(normalizeDirectionCheckInRecord)
    .filter((record): record is DirectionCheckInRecord => record !== null);
  const byWeek = new Map<string, DirectionCheckInRecord>();

  records.forEach((record) => {
    const existing = byWeek.get(record.weekStart);

    if (!existing || record.decidedAt >= existing.decidedAt) {
      byWeek.set(record.weekStart, record);
    }
  });

  return Array.from(byWeek.values())
    .sort((left, right) => left.weekStart.localeCompare(right.weekStart))
    .slice(-104);
}

export function upsertDirectionCheckInRecord(
  records: DirectionCheckInRecord[],
  record: DirectionCheckInRecord,
): DirectionCheckInRecord[] {
  return normalizeDirectionCheckInRecords([
    ...records.filter((item) => item.weekStart !== record.weekStart),
    record,
  ]);
}

function isEligibleItem(state: AppState, item: DirectionActionStats, today: string): boolean {
  if (item.itemType === "goal") {
    const goal = state.goals.find((candidate) => candidate.id === item.id);

    return Boolean(goal && goal.endDate >= today && goal.currentValue < goal.targetValue);
  }

  const task = state.tasks.find((candidate) => candidate.id === item.id);

  return Boolean(task && task.repeatMode !== "once" && task.endDate >= today);
}

function normalizeDirectionCheckInRecord(value: unknown): DirectionCheckInRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const decision = record.decision;
  const areaKey = record.areaKey;
  const itemType = record.itemType;
  const numberFields = [
    "previousSuccesses",
    "previousOpportunities",
    "previousConsistency",
    "currentSuccesses",
    "currentOpportunities",
    "currentConsistency",
  ] as const;
  const lifeAreas = new Set<LifeAreaKey>([
    "learning",
    "health",
    "work",
    "personal",
    "finance",
    "creativity",
    "custom",
  ]);
  const dateFields = ["weekStart", "reviewStart", "reviewEnd", "previousStart", "previousEnd"] as const;

  if (
    typeof record.id !== "string" ||
    !record.id ||
    typeof record.itemId !== "string" ||
    !record.itemId ||
    typeof record.itemTitleSnapshot !== "string" ||
    !record.itemTitleSnapshot ||
    typeof record.decidedAt !== "string" ||
    !record.decidedAt ||
    (itemType !== "goal" && itemType !== "task") ||
    typeof areaKey !== "string" ||
    !lifeAreas.has(areaKey as LifeAreaKey) ||
    typeof decision !== "string" ||
    !directionCheckInDecisions.has(decision as DirectionCheckInDecision) ||
    dateFields.some((field) => typeof record[field] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record[field] as string)) ||
    numberFields.some((field) => !Number.isFinite(record[field]))
  ) {
    return null;
  }

  return {
    id: record.id,
    weekStart: record.weekStart as string,
    reviewStart: record.reviewStart as string,
    reviewEnd: record.reviewEnd as string,
    previousStart: record.previousStart as string,
    previousEnd: record.previousEnd as string,
    itemId: record.itemId,
    itemType,
    itemTitleSnapshot: record.itemTitleSnapshot,
    areaKey: areaKey as LifeAreaKey,
    areaLabelSnapshot:
      typeof record.areaLabelSnapshot === "string" && record.areaLabelSnapshot.trim()
        ? record.areaLabelSnapshot.trim().slice(0, 40)
        : undefined,
    previousSuccesses: Number(record.previousSuccesses),
    previousOpportunities: Number(record.previousOpportunities),
    previousConsistency: Number(record.previousConsistency),
    currentSuccesses: Number(record.currentSuccesses),
    currentOpportunities: Number(record.currentOpportunities),
    currentConsistency: Number(record.currentConsistency),
    decision: decision as DirectionCheckInDecision,
    decidedAt: record.decidedAt,
  };
}
