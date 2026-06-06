import { parseDateKey } from "./dateUtils";
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

export function pluralizeRussian(
  value: number,
  one: string,
  few: string,
  many: string,
): string {
  const absolute = Math.abs(value);
  const lastTwoDigits = absolute % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return many;
  }

  const lastDigit = absolute % 10;

  if (lastDigit === 1) {
    return one;
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return few;
  }

  return many;
}
