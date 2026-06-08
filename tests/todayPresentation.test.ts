import {
  buildTodayOrientation,
  getNextRhythmCardMode,
  mapRhythmCardModePreference,
} from "../src/todayPresentation.js";

function assert(condition: boolean, label: string): void {
  if (!condition) {
    throw new Error(label);
  }

  console.log(`ok - ${label}`);
}

const today = "2026-06-08";

function build(
  activeDate: string,
  completed: number,
  total: number,
  percent: number,
  language: "en" | "ru" = "en",
) {
  return buildTodayOrientation({
    activeDate,
    today,
    language,
    completed,
    total,
    percent,
  });
}

const todayNoActions = build(today, 0, 0, 0);
assert(todayNoActions.state === "today-no-actions", "Today with no actions uses the no-actions state");
assert(todayNoActions.percentage === null, "Today with no actions hides percentage");

const todayNotStarted = build(today, 0, 3, 0);
assert(todayNotStarted.state === "today-not-started", "Today with no marks uses the not-started state");
assert(todayNotStarted.percentage === null, "Today at zero hides percentage");

const todayPartial = build(today, 2, 4, 50);
assert(todayPartial.state === "today-partial", "Partially marked Today uses the partial state");
assert(todayPartial.percentage === 50, "Partial Today exposes percentage as secondary metadata");
assert(todayPartial.metadata?.includes("50%") === true, "Partial Today metadata includes its percentage");

const todayComplete = build(today, 4, 4, 100);
assert(todayComplete.state === "today-complete", "Completed Today uses the complete state");
assert(todayComplete.percentage === null, "Completed Today communicates completion without percentage");

const pastNoActions = build("2026-06-07", 0, 0, 0);
assert(pastNoActions.state === "past-no-actions", "Past day with no actions uses the no-actions state");
assert(pastNoActions.percentage === null, "Past day with no actions hides percentage");

const pastNoMarks = build("2026-06-07", 0, 3, 0);
assert(pastNoMarks.state === "past-no-marks", "Past day with no marks uses the no-marks state");
assert(pastNoMarks.percentage === null, "Past day at zero hides percentage");

const pastPartial = build("2026-06-07", 1, 4, 25);
assert(pastPartial.state === "past-partial", "Partially marked past day uses the partial state");
assert(pastPartial.percentage === 25, "Partial past day exposes percentage as secondary metadata");

const pastComplete = build("2026-06-07", 4, 4, 100);
assert(pastComplete.state === "past-complete", "Completed past day uses the complete state");
assert(pastComplete.percentage === null, "Completed past day hides percentage");

const futureNoActions = build("2026-06-09", 0, 0, 0);
assert(futureNoActions.state === "future-no-actions", "Future day with no actions uses the no-actions state");
assert(futureNoActions.percentage === null, "Future day with no actions hides percentage");

const futurePlanned = build("2026-06-09", 0, 3, 0);
assert(futurePlanned.state === "future-planned", "Future day with actions uses the planned state");
assert(futurePlanned.percentage === null, "Planned future day never shows a completion percentage");

assert(build(today, 0, 1, 0, "ru").metadata === "Запланировано 1 действие", "Russian singular planned metadata is correct");
assert(build(today, 0, 2, 0, "ru").metadata === "Запланировано 2 действия", "Russian paucal planned metadata is correct");
assert(build(today, 0, 5, 0, "ru").metadata === "Запланировано 5 действий", "Russian plural planned metadata is correct");
assert(build(today, 1, 1, 100, "ru").metadata === "Отмечено 1 из 1", "Russian singular marked metadata is correct");
assert(build(today, 2, 2, 100, "ru").metadata === "Отмечено 2 из 2", "Russian paucal marked metadata is correct");
assert(build(today, 5, 5, 100, "ru").metadata === "Отмечено 5 из 5", "Russian plural marked metadata is correct");
assert(build(today, 1, 2, 50, "ru").metadata === "Отмечено 1 из 2 · 50%", "Russian partial marked metadata is correct");

assert(mapRhythmCardModePreference(null) === "orientation", "Missing preference maps to orientation");
assert(mapRhythmCardModePreference("percent") === "orientation", "Legacy percent preference maps to orientation");
assert(mapRhythmCardModePreference("bars") === "bars", "Bars preference is preserved");
assert(mapRhythmCardModePreference("compact") === "compact", "Compact preference is preserved");
assert(mapRhythmCardModePreference("unknown") === "orientation", "Unknown preference maps to orientation");

assert(getNextRhythmCardMode("orientation") === "bars", "Orientation cycles to bars");
assert(getNextRhythmCardMode("bars") === "compact", "Bars cycles to compact");
assert(getNextRhythmCardMode("compact") === "orientation", "Compact cycles to orientation");
