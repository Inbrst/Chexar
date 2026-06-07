import { parseDateKey } from "./dateUtils";
import type { DirectionCoverage } from "./directionReview";
import type { AppLanguage } from "./types";

export function formatDirectionReviewRange(
  startDate: string,
  endDate: string,
  language: AppLanguage,
): string {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const includeYear = start.getFullYear() !== end.getFullYear();
  const locale = language === "ru" ? "ru-RU" : "en-US";
  const formatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" as const } : {}),
  });
  const formatDate = (date: Date) => formatter.format(date).replace(/\s*г\.$/u, "");

  return `${formatDate(start)} – ${formatDate(end)}`;
}

export type DirectionLearningStateMode = "empty" | "sparse";

export function getDirectionLearningStateMode(
  coverage: Pick<DirectionCoverage, "scheduledOpportunities" | "activeItems">,
): DirectionLearningStateMode {
  return coverage.scheduledOpportunities === 0 && coverage.activeItems === 0
    ? "empty"
    : "sparse";
}
