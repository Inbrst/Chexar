import { addDays } from "../src/dateUtils.js";
import { buildDirectionReview, classifyLifeArea } from "../src/directionReview.js";
import { formatDirectionReviewRange, getDirectionLearningStateMode } from "../src/directionReviewPresentation.js";
import type { AppState, TaskItem } from "../src/types.js";

function assert(condition: boolean, label: string): void {
  if (!condition) {
    throw new Error(label);
  }

  console.log(`ok - ${label}`);
}

function dateRange(startDate: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(startDate, index));
}

function createDailyTask(id: string, title: string, completedDates: string[]): TaskItem {
  return {
    id,
    title,
    startDate: "2026-04-08",
    endDate: "2026-06-06",
    repeatMode: "everyDay",
    date: "2026-04-08",
    completed: false,
    completedDates,
  };
}

const healthPrevious = dateRange("2026-04-08", 15);
const healthCurrent = dateRange("2026-05-08", 27);
const learningPrevious = dateRange("2026-04-08", 24);
const learningCurrent = dateRange("2026-05-08", 6);
const trendState: AppState = {
  goals: [],
  tasks: [
    createDailyTask("health", "Morning walk", [...healthPrevious, ...healthCurrent]),
    createDailyTask("learning", "German lesson", [...learningPrevious, ...learningCurrent]),
  ],
  occurrences: [],
};
const trendReview = buildDirectionReview(trendState, "30d", "2026-06-07");
const healthArea = trendReview.areas.find((area) => area.areaKey === "health");
const learningArea = trendReview.areas.find((area) => area.areaKey === "learning");

assert(trendReview.currentRange.startDate === "2026-05-08" && trendReview.currentRange.endDate === "2026-06-06", "current day is excluded from the review");
assert(healthArea?.state === "growing" && healthArea.momentum === 40, "health growth is calculated from equal periods");
assert(learningArea?.state === "declining" && learningArea.momentum === -60, "learning decline is calculated from equal periods");
assert(trendReview.summary.kind === "shift", "summary detects a shift between life areas");
assert(trendReview.insights.some((insight) => insight.kind === "area-growth"), "growth insight is deterministic");
assert(trendReview.insights.some((insight) => insight.kind === "area-decline"), "decline insight is deterministic");

const manualClassification = classifyLifeArea({
  ...createDailyTask("custom", "Studio block", []),
  lifeAreaOverride: "custom",
  lifeAreaCustomLabel: "Music practice",
});

assert(
  manualClassification.areaKey === "custom" &&
    manualClassification.customLabel === "Music practice" &&
    manualClassification.source === "manual",
  "manual custom area overrides rules",
);

const carriedTask: TaskItem = {
  id: "carried",
  title: "Call family",
  startDate: "2026-06-01",
  endDate: "2026-06-01",
  repeatMode: "once",
  date: "2026-06-01",
  completed: false,
  completedDates: ["2026-06-02"],
};
const carryState: AppState = {
  goals: [],
  tasks: [carriedTask],
  occurrences: [
    {
      id: "carry-1",
      itemId: carriedTask.id,
      itemType: "task",
      date: "2026-06-02",
      status: "completed",
      source: "carry_over",
      movedFromDate: "2026-06-01",
      isCarryOver: true,
      createdAt: "2026-06-02T08:00:00.000Z",
    },
  ],
};
const carryReview = buildDirectionReview(carryState, "7d", "2026-06-07");
const carryItem = carryReview.areas.flatMap((area) => area.items).find((item) => item.id === carriedTask.id);

assert(carryReview.coverage.scheduledOpportunities === 1, "carry-over replaces the original opportunity");
assert(carryItem?.currentSuccesses === 1, "carry-over completion is counted on the destination date");

assert(
  formatDirectionReviewRange("2025-06-07", "2026-06-06", "ru") === "7 июн. 2025 – 6 июн. 2026",
  "year range includes both years when it crosses a calendar year",
);

const emptyReview = buildDirectionReview({ goals: [], tasks: [], occurrences: [] }, "30d", "2026-06-07");
assert(emptyReview.summary.kind === "learning", "empty review uses the learning summary");
assert(getDirectionLearningStateMode(emptyReview.coverage) === "empty", "empty coverage selects the no-data learning state");

const sparseReview = buildDirectionReview(
  {
    goals: [],
    tasks: [
      {
        id: "sparse-learning",
        title: "Evening walk",
        startDate: "2026-06-01",
        endDate: "2026-06-06",
        repeatMode: "everyDay",
        date: "2026-06-01",
        completed: false,
        completedDates: ["2026-06-01"],
        lifeAreaOverride: "health",
      },
    ],
    occurrences: [],
  },
  "30d",
  "2026-06-07",
);

assert(sparseReview.summary.kind === "learning", "sparse history stays in the learning state");
assert(getDirectionLearningStateMode(sparseReview.coverage) === "sparse", "scheduled history selects the sparse learning state");
assert(sparseReview.coverage.areasWithData === 1, "sparse learning state keeps detected life areas available");
