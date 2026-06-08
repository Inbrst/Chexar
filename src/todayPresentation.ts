import { formatProductCount, productLanguage } from "./productLanguage";
import type { AppLanguage } from "./types";

export type TodayTemporalContext = "today" | "past" | "future";

export type TodayOrientationState =
  | "today-no-actions"
  | "today-not-started"
  | "today-partial"
  | "today-complete"
  | "past-no-actions"
  | "past-no-marks"
  | "past-partial"
  | "past-complete"
  | "future-no-actions"
  | "future-planned";

export type RhythmCardMode = "orientation" | "bars" | "compact";

export type TodayOrientationPresentation = {
  state: TodayOrientationState;
  title: string;
  metadata?: string;
  percentage: number | null;
  temporalContext: TodayTemporalContext;
};

type TodayOrientationInput = {
  activeDate: string;
  today: string;
  language: AppLanguage;
  completed: number;
  total: number;
  percent: number;
};

export function getTodayTemporalContext(activeDate: string, today: string): TodayTemporalContext {
  if (activeDate < today) {
    return "past";
  }

  if (activeDate > today) {
    return "future";
  }

  return "today";
}

export function mapRhythmCardModePreference(value: string | null | undefined): RhythmCardMode {
  if (value === "bars" || value === "compact") {
    return value;
  }

  return "orientation";
}

export function getNextRhythmCardMode(mode: RhythmCardMode): RhythmCardMode {
  if (mode === "orientation") {
    return "bars";
  }

  if (mode === "bars") {
    return "compact";
  }

  return "orientation";
}

export function buildTodayOrientation({
  activeDate,
  today,
  language,
  completed,
  total,
  percent,
}: TodayOrientationInput): TodayOrientationPresentation {
  const temporalContext = getTodayTemporalContext(activeDate, today);
  const copy = productLanguage[language].todayOrientation;
  const safeTotal = Math.max(Math.round(total), 0);
  const safeCompleted = Math.min(Math.max(Math.round(completed), 0), safeTotal);
  const safePercent = Math.min(Math.max(Math.round(percent), 0), 100);
  const scheduledMetadata = copy.scheduled(formatProductCount(language, safeTotal, "commitment"));
  const markedMetadata = copy.marked(safeCompleted, safeTotal);
  const partialMetadata = copy.partial(safeCompleted, safeTotal, safePercent);

  if (temporalContext === "future") {
    return safeTotal === 0
      ? {
          state: "future-no-actions",
          title: copy.futureNoActions,
          percentage: null,
          temporalContext,
        }
      : {
          state: "future-planned",
          title: copy.futurePlanned,
          metadata: scheduledMetadata,
          percentage: null,
          temporalContext,
        };
  }

  if (temporalContext === "past") {
    if (safeTotal === 0) {
      return {
        state: "past-no-actions",
        title: copy.pastNoActions,
        percentage: null,
        temporalContext,
      };
    }

    if (safeCompleted === 0) {
      return {
        state: "past-no-marks",
        title: copy.pastNoMarks,
        metadata: scheduledMetadata,
        percentage: null,
        temporalContext,
      };
    }

    if (safeCompleted >= safeTotal) {
      return {
        state: "past-complete",
        title: copy.pastComplete,
        metadata: markedMetadata,
        percentage: null,
        temporalContext,
      };
    }

    return {
      state: "past-partial",
      title: copy.pastPartial,
      metadata: partialMetadata,
      percentage: safePercent,
      temporalContext,
    };
  }

  if (safeTotal === 0) {
    return {
      state: "today-no-actions",
      title: copy.todayNoActions,
      percentage: null,
      temporalContext,
    };
  }

  if (safeCompleted === 0) {
    return {
      state: "today-not-started",
      title: copy.todayNotStarted,
      metadata: scheduledMetadata,
      percentage: null,
      temporalContext,
    };
  }

  if (safeCompleted >= safeTotal) {
    return {
      state: "today-complete",
      title: copy.todayComplete,
      metadata: markedMetadata,
      percentage: null,
      temporalContext,
    };
  }

  return {
    state: "today-partial",
    title: copy.todayPartial,
    metadata: partialMetadata,
    percentage: safePercent,
    temporalContext,
  };
}
