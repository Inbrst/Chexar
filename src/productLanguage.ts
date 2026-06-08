import type { AppLanguage } from "./types";

export type ProductCountTerm = "commitment" | "occurrence" | "mark" | "activeArea";

type CountForms = {
  one: string;
  few: string;
  many: string;
};

const countForms: Record<AppLanguage, Record<ProductCountTerm, CountForms>> = {
  en: {
    commitment: { one: "commitment", few: "commitments", many: "commitments" },
    occurrence: { one: "scheduled time", few: "scheduled times", many: "scheduled times" },
    mark: { one: "mark", few: "marks", many: "marks" },
    activeArea: { one: "active area", few: "active areas", many: "active areas" },
  },
  ru: {
    commitment: { one: "действие", few: "действия", many: "действий" },
    occurrence: { one: "запланированный раз", few: "запланированных раза", many: "запланированных раз" },
    mark: { one: "отметка", few: "отметки", many: "отметок" },
    activeArea: { one: "активная сфера", few: "активные сферы", many: "активных сфер" },
  },
};

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

export function formatProductCount(
  language: AppLanguage,
  value: number,
  term: ProductCountTerm,
): string {
  const forms = countForms[language][term];
  const noun = language === "ru"
    ? pluralizeRussian(value, forms.one, forms.few, forms.many)
    : value === 1
      ? forms.one
      : forms.many;

  return `${value} ${noun}`;
}

export const productLanguage = {
  en: {
    labels: {
      commitment: "Commitment",
      occurrence: "Scheduled time",
      mark: "Mark",
      rhythm: "Rhythm",
      direction: "Direction",
      directionReview: "Direction Review",
      directionCheckIn: "Direction Check-in",
    },
    learningState: {
      title: "Chexar is learning your rhythm",
      body: "Direction Review needs a few completed days before it can compare your patterns.",
      noData: "Add a few commitments and mark them over several days.",
      sparse: "Keep using Today normally. The review will appear when there is enough history.",
      detectedAreas: "Detected areas",
      coverage: (commitments: number, activeAreas: number) =>
        `Based on ${commitments} scheduled ${commitments === 1 ? "commitment" : "commitments"} across ${formatProductCount("en", activeAreas, "activeArea")}.`,
    },
    todayOrientation: {
      aria: "Day orientation",
      todayNoActions: "Nothing is scheduled today",
      todayNotStarted: "Your day is ready",
      todayPartial: "Today's rhythm is taking shape",
      todayComplete: "Everything for today is marked",
      pastNoActions: "Nothing was scheduled for this day",
      pastNoMarks: "No marks were recorded for this day",
      pastPartial: "Part of this day was marked",
      pastComplete: "Everything planned for this day was marked",
      futureNoActions: "Nothing is scheduled for this day",
      futurePlanned: "This day is planned",
      scheduled: (count: string) => `${count} scheduled`,
      marked: (completed: number, total: number) => `${completed} of ${total} marked`,
      partial: (completed: number, total: number, percent: number) => `${completed} of ${total} marked · ${percent}%`,
      emptyListTitle: "Add a commitment",
      emptyListBody: "Keep this day for what genuinely belongs here.",
    },
    directionCheckIn: {
      title: "A shift in your rhythm",
      question: "Does this reflect what matters to you right now?",
      fits: "Yes, it fits",
      adjust: "Something should change",
      dismiss: "Not now",
      followUpLabel: "Since your last Direction Check-in",
      observation: (
        itemTitle: string,
        currentSuccesses: number,
        currentOpportunities: number,
        previousSuccesses: number,
        previousOpportunities: number,
      ) =>
        `Last week, “${itemTitle}” was marked ${currentSuccesses} of ${currentOpportunities} scheduled times. The week before: ${previousSuccesses} of ${previousOpportunities}.`,
      followUp: (
        itemTitle: string,
        currentSuccesses: number,
        currentOpportunities: number,
        previousSuccesses: number,
        previousOpportunities: number,
      ) =>
        `“${itemTitle}” was marked ${currentSuccesses} of ${currentOpportunities} scheduled times. Before the check-in: ${previousSuccesses} of ${previousOpportunities}.`,
    },
  },
  ru: {
    labels: {
      commitment: "Действие",
      occurrence: "Запланированный раз",
      mark: "Отметка",
      rhythm: "Ритм",
      direction: "Направление",
      directionReview: "Обзор направления",
      directionCheckIn: "Проверка направления",
    },
    learningState: {
      title: "Chexar изучает твой ритм",
      body: "Обзору направления нужно несколько завершённых дней, чтобы сравнить, как меняется твой ритм.",
      noData: "Добавь несколько действий и отмечай их в течение нескольких дней.",
      sparse: "Продолжай пользоваться экраном «Сегодня» как обычно. Обзор появится, когда накопится достаточно истории.",
      detectedAreas: "Обнаруженные сферы",
      coverage: (commitments: number, activeAreas: number) =>
        `На основе ${commitments} ${commitments === 1 ? "запланированного действия" : "запланированных действий"} в ${activeAreas} ${activeAreas === 1 ? "активной сфере" : "активных сферах"}.`,
    },
    todayOrientation: {
      aria: "Ориентир дня",
      todayNoActions: "На сегодня ничего не запланировано",
      todayNotStarted: "День готов к началу",
      todayPartial: "Ритм дня складывается",
      todayComplete: "На сегодня всё отмечено",
      pastNoActions: "На этот день ничего не было запланировано",
      pastNoMarks: "За этот день нет отметок",
      pastPartial: "Часть дня была отмечена",
      pastComplete: "В этот день всё было отмечено",
      futureNoActions: "На этот день ничего не запланировано",
      futurePlanned: "На этот день есть план",
      scheduled: (count: string) => `${count} запланировано`,
      marked: (completed: number, total: number) => `Отмечено ${completed} из ${total}`,
      partial: (completed: number, total: number, percent: number) => `Отмечено ${completed} из ${total} · ${percent}%`,
      emptyListTitle: "Добавь действие",
      emptyListBody: "Оставь здесь только то, что действительно относится к этому дню.",
    },
    directionCheckIn: {
      title: "Изменение в твоём ритме",
      question: "Это соответствует тому, что важно для тебя сейчас?",
      fits: "Да, это подходит",
      adjust: "Стоит изменить",
      dismiss: "Не сейчас",
      followUpLabel: "После прошлой Проверки направления",
      observation: (
        itemTitle: string,
        currentSuccesses: number,
        currentOpportunities: number,
        previousSuccesses: number,
        previousOpportunities: number,
      ) =>
        `На прошлой неделе «${itemTitle}» было отмечено ${currentSuccesses} из ${currentOpportunities} запланированных раз. Неделей ранее — ${previousSuccesses} из ${previousOpportunities}.`,
      followUp: (
        itemTitle: string,
        currentSuccesses: number,
        currentOpportunities: number,
        previousSuccesses: number,
        previousOpportunities: number,
      ) =>
        `«${itemTitle}» было отмечено ${currentSuccesses} из ${currentOpportunities} запланированных раз. До проверки — ${previousSuccesses} из ${previousOpportunities}.`,
    },
  },
} as const;

export function formatMarkedOccurrences(
  language: AppLanguage,
  successes: number,
  opportunities: number,
): string {
  if (language === "ru") {
    return `${successes} из ${opportunities} ${pluralizeRussian(opportunities, "запланированного раза", "запланированных раз", "запланированных раз")} отмечено`;
  }

  return `${successes} of ${opportunities} scheduled times marked`;
}

export function formatDirectionReviewCoverage(
  language: AppLanguage,
  opportunities: number,
  commitments: number,
  activeAreas: number,
): string {
  if (language === "ru") {
    return `Расчёт по ${formatProductCount("ru", opportunities, "occurrence")}, ${formatProductCount("ru", commitments, "commitment")} и ${formatProductCount("ru", activeAreas, "activeArea")}.`;
  }

  return `Based on ${formatProductCount("en", opportunities, "occurrence")}, ${formatProductCount("en", commitments, "commitment")}, and ${formatProductCount("en", activeAreas, "activeArea")}.`;
}
