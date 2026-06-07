import {
  buildDirectionCheckInCandidate,
  buildDirectionCheckInOutcome,
  createDirectionCheckInRecord,
  getLastCompletedWeekRanges,
  normalizeDirectionCheckInRecords,
  upsertDirectionCheckInRecord,
  type DirectionCheckInCandidate,
  type DirectionCheckInRecord,
} from "../src/directionCheckIn.js";
import type { AppState, TaskItem } from "../src/types.js";

function assert(condition: boolean, label: string): void {
  if (!condition) {
    throw new Error(label);
  }

  console.log(`ok - ${label}`);
}

function createDailyTask(id: string, completedDates: string[]): TaskItem {
  return {
    id,
    title: "German practice",
    startDate: "2026-05-01",
    endDate: "2026-07-01",
    repeatMode: "everyDay",
    date: "2026-05-01",
    completed: false,
    completedDates,
    lifeAreaOverride: "learning",
  };
}

function createState(task: TaskItem): AppState {
  return {
    goals: [],
    tasks: [task],
    occurrences: [],
  };
}

function recordFromCandidate(
  candidate: DirectionCheckInCandidate,
  decision: DirectionCheckInRecord["decision"] = "fits",
): DirectionCheckInRecord {
  return createDirectionCheckInRecord(
    candidate,
    decision,
    `record-${candidate.reviewEnd}`,
    `${candidate.reviewEnd}T12:00:00.000Z`,
  );
}

const ranges = getLastCompletedWeekRanges("2026-06-10");
assert(
  ranges.reviewStart === "2026-06-01" &&
    ranges.reviewEnd === "2026-06-07" &&
    ranges.previousStart === "2026-05-25" &&
    ranges.previousEnd === "2026-05-31",
  "eligibility uses two completed ISO weeks",
);

const decliningTask = createDailyTask("german", [
  "2026-05-25",
  "2026-05-26",
  "2026-05-27",
  "2026-05-28",
  "2026-05-29",
  "2026-05-30",
  "2026-06-01",
  "2026-06-02",
  "2026-06-08",
  "2026-06-09",
  "2026-06-10",
]);
const decliningState = createState(decliningTask);
const candidate = buildDirectionCheckInCandidate(decliningState, "2026-06-10", []);

assert(candidate !== null, "clear completed-week decline creates a check-in");
assert(
  candidate?.previousSuccesses === 6 &&
    candidate.previousOpportunities === 7 &&
    candidate.currentSuccesses === 2 &&
    candidate.currentOpportunities === 7,
  "observation evidence is traceable to scheduled counts",
);
assert(
  candidate?.currentSuccesses === 2,
  "activity from the unfinished current week is excluded",
);

const sparseTask: TaskItem = {
  ...createDailyTask("sparse", ["2026-05-25"]),
  repeatMode: "selectedDays",
  selectedDays: [1, 2],
};
assert(
  buildDirectionCheckInCandidate(createState(sparseTask), "2026-06-10", []) === null,
  "sparse item evidence does not create a check-in",
);

assert(
  buildDirectionCheckInCandidate(
    createState({
      ...decliningTask,
      id: "one-time",
      repeatMode: "once",
      date: "2026-06-01",
    }),
    "2026-06-10",
    [],
  ) === null,
  "one-time tasks are not selected for a direction decision",
);

if (!candidate) {
  throw new Error("candidate fixture was not created");
}

const recentRecord = recordFromCandidate({
  ...candidate,
  weekStart: "2026-05-25",
  reviewStart: "2026-05-25",
  reviewEnd: "2026-05-31",
  previousStart: "2026-05-18",
  previousEnd: "2026-05-24",
});
assert(
  buildDirectionCheckInCandidate(decliningState, "2026-06-10", [recentRecord]) === null,
  "same item is suppressed during the cooldown",
);

const currentWeekRecord = recordFromCandidate(candidate, "dismissed");
assert(
  buildDirectionCheckInCandidate(decliningState, "2026-06-10", [currentWeekRecord]) === null,
  "only one check-in is shown for a completed week",
);

const priorCandidate: DirectionCheckInCandidate = {
  ...candidate,
  weekStart: "2026-05-25",
  reviewStart: "2026-05-25",
  reviewEnd: "2026-05-31",
  previousStart: "2026-05-18",
  previousEnd: "2026-05-24",
  currentSuccesses: 1,
  currentOpportunities: 7,
  currentConsistency: 14,
};
const outcome = buildDirectionCheckInOutcome(
  decliningState,
  "2026-06-10",
  [recordFromCandidate(priorCandidate, "adjusted")],
);

assert(
  outcome?.previousSuccesses === 1 &&
    outcome.previousOpportunities === 7 &&
    outcome.currentSuccesses === 2 &&
    outcome.currentOpportunities === 7,
  "follow-up compares the next completed week with the reviewed week",
);
assert(
  buildDirectionCheckInOutcome(
    decliningState,
    "2026-06-10",
    [recordFromCandidate(priorCandidate, "dismissed")],
  ) === null,
  "dismissed check-ins do not create follow-up outcomes",
);

assert(
  normalizeDirectionCheckInRecords([currentWeekRecord, { broken: true }]).length === 1,
  "local records ignore malformed storage values",
);
assert(
  upsertDirectionCheckInRecord(
    [currentWeekRecord],
    { ...currentWeekRecord, id: "replacement", decision: "fits" },
  )[0]?.id === "replacement",
  "local records keep one decision per completed week",
);
