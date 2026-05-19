import { getGoalDailyMetrics } from "../src/calculations.js";
import { normalizeSemanticQuantityUnit } from "../src/semanticUnits.js";
import type { ProgressGoal } from "../src/types.js";

function createGoal(overrides: Partial<ProgressGoal>): ProgressGoal {
  return {
    id: "goal-test",
    title: "Test",
    iconType: "custom",
    targetValue: 50,
    currentValue: 0,
    unit: "lessons",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
    repeatMode: "everyDay",
    quickAddValues: [1],
    progressEntries: [],
    ...overrides,
  };
}

function assertEqual(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const cases: Array<{
  label: string;
  goal: ProgressGoal;
  dateKey: string;
  currentDateKey: string;
  expected: {
    totalCompleted: number;
    targetAmount: number;
    todayCompleted: number;
    dailyPlan: number;
    dailyRemaining: number;
    progressPercent: number;
  };
}> = [
  {
    label: "case A: 50 target, 2 total, 0 today, May 19-31",
    goal: createGoal({ currentValue: 2 }),
    dateKey: "2026-05-19",
    currentDateKey: "2026-05-19",
    expected: {
      totalCompleted: 2,
      targetAmount: 50,
      todayCompleted: 0,
      dailyPlan: 4,
      dailyRemaining: 4,
      progressPercent: 4,
    },
  },
  {
    label: "case B: 50 target, 2 total, 2 today, May 19-31",
    goal: createGoal({
      currentValue: 2,
      progressEntries: [{ id: "entry-today", date: "2026-05-19", amount: 2 }],
    }),
    dateKey: "2026-05-19",
    currentDateKey: "2026-05-19",
    expected: {
      totalCompleted: 2,
      targetAmount: 50,
      todayCompleted: 2,
      dailyPlan: 4,
      dailyRemaining: 2,
      progressPercent: 4,
    },
  },
  {
    label: "case C: completed target",
    goal: createGoal({
      currentValue: 50,
      progressEntries: [{ id: "entry-today", date: "2026-05-19", amount: 8 }],
    }),
    dateKey: "2026-05-19",
    currentDateKey: "2026-05-19",
    expected: {
      totalCompleted: 50,
      targetAmount: 50,
      todayCompleted: 8,
      dailyPlan: 0,
      dailyRemaining: 0,
      progressPercent: 100,
    },
  },
  {
    label: "50 target, 0 completed, May 1-31",
    goal: createGoal({ currentValue: 0 }),
    dateKey: "2026-05-01",
    currentDateKey: "2026-05-01",
    expected: {
      totalCompleted: 0,
      targetAmount: 50,
      todayCompleted: 0,
      dailyPlan: 2,
      dailyRemaining: 2,
      progressPercent: 0,
    },
  },
  {
    label: "one day left with 7 remaining",
    goal: createGoal({ currentValue: 43 }),
    dateKey: "2026-05-31",
    currentDateKey: "2026-05-31",
    expected: {
      totalCompleted: 43,
      targetAmount: 50,
      todayCompleted: 0,
      dailyPlan: 7,
      dailyRemaining: 7,
      progressPercent: 86,
    },
  },
  {
    label: "last active day carries full missed period",
    goal: createGoal({
      targetValue: 10,
      currentValue: 0,
      startDate: "2026-05-01",
      endDate: "2026-05-10",
    }),
    dateKey: "2026-05-10",
    currentDateKey: "2026-05-10",
    expected: {
      totalCompleted: 0,
      targetAmount: 10,
      todayCompleted: 0,
      dailyPlan: 10,
      dailyRemaining: 10,
      progressPercent: 0,
    },
  },
  {
    label: "custom schedule counts only active days",
    goal: createGoal({
      targetValue: 9,
      currentValue: 1,
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      repeatMode: "selectedDays",
      selectedDays: [3],
    }),
    dateKey: "2026-05-20",
    currentDateKey: "2026-05-20",
    expected: {
      totalCompleted: 1,
      targetAmount: 9,
      todayCompleted: 0,
      dailyPlan: 4,
      dailyRemaining: 4,
      progressPercent: 11,
    },
  },
];

cases.forEach(({ label, goal, dateKey, currentDateKey, expected }) => {
  const metrics = getGoalDailyMetrics(goal, dateKey, currentDateKey);

  assertEqual(metrics.totalCompleted, expected.totalCompleted, `${label} totalCompleted`);
  assertEqual(metrics.targetAmount, expected.targetAmount, `${label} targetAmount`);
  assertEqual(metrics.todayCompleted, expected.todayCompleted, `${label} todayCompleted`);
  assertEqual(metrics.dailyPlan, expected.dailyPlan, `${label} dailyPlan`);
  assertEqual(metrics.dailyRemaining, expected.dailyRemaining, `${label} dailyRemaining`);
  assertEqual(metrics.progressPercent, expected.progressPercent, `${label} progressPercent`);
  console.log(`ok - ${label}`);
});

function assertStringEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

assertStringEqual(
  normalizeSemanticQuantityUnit({
    title: "Тренировка",
    unit: "минуты",
    sourceText: "создай тренировку 2 на неделю",
    targetValue: 2,
    mode: "draft",
  }),
  "тренировок",
  "AI draft corrects invented workout minutes",
);

assertStringEqual(
  normalizeSemanticQuantityUnit({
    title: "Тренировка",
    unit: "минут",
    sourceText: "создай тренировку 20 минут",
    targetValue: 20,
    mode: "draft",
  }),
  "минут",
  "AI draft keeps explicitly requested workout duration",
);

assertStringEqual(
  normalizeSemanticQuantityUnit({
    title: "Немецкий",
    unit: "уроков",
    sourceText: "создай немецкий 50 уроков на месяц",
    targetValue: 50,
    mode: "draft",
  }),
  "уроков",
  "AI draft keeps lesson unit",
);

assertStringEqual(
  normalizeSemanticQuantityUnit({
    title: "Тренировка",
    unit: "минуты",
    sourceText: "Тренировка",
    targetValue: 3,
    mode: "display",
  }),
  "тренировок",
  "display corrects small stored workout duration",
);

console.log("ok - semantic quantity units");
