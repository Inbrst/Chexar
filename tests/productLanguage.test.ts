import {
  formatMarkedOccurrences,
  formatProductCount,
  pluralizeRussian,
  productLanguage,
} from "../src/productLanguage.js";

function assert(condition: boolean, label: string): void {
  if (!condition) {
    throw new Error(label);
  }

  console.log(`ok - ${label}`);
}

assert(pluralizeRussian(1, "действие", "действия", "действий") === "действие", "Russian singular form is correct");
assert(pluralizeRussian(2, "действие", "действия", "действий") === "действия", "Russian paucal form is correct");
assert(pluralizeRussian(5, "действие", "действия", "действий") === "действий", "Russian plural form is correct");
assert(pluralizeRussian(11, "действие", "действия", "действий") === "действий", "Russian teen plural form is correct");
assert(pluralizeRussian(21, "действие", "действия", "действий") === "действие", "Russian compound singular form is correct");

assert(formatProductCount("en", 1, "commitment") === "1 commitment", "English singular commitment is correct");
assert(formatProductCount("en", 3, "commitment") === "3 commitments", "English plural commitment is correct");
assert(formatProductCount("ru", 2, "occurrence") === "2 запланированных раза", "Russian scheduled occurrence count is correct");
assert(formatProductCount("ru", 5, "activeArea") === "5 активных сфер", "Russian active area count is correct");
assert(formatMarkedOccurrences("en", 2, 7) === "2 of 7 scheduled times marked", "review evidence uses mark language");
assert(
  productLanguage.en.learningState.coverage(2, 1) === "Based on 2 scheduled commitments across 1 active area.",
  "learning coverage uses shared commitment and area terms",
);
assert(
  productLanguage.ru.learningState.coverage(1, 1) === "На основе 1 запланированного действия в 1 активной сфере.",
  "Russian learning coverage uses correct singular cases",
);
assert(
  productLanguage.ru.learningState.coverage(3, 3) === "На основе 3 запланированных действий в 3 активных сферах.",
  "Russian learning coverage uses correct plural cases",
);
assert(
  productLanguage.ru.labels.directionCheckIn === "Проверка направления",
  "Direction Check-in has one shared Russian label",
);
assert(
  productLanguage.en.directionCheckIn.observation("Walking", 2, 7, 6, 7).includes("was marked 2 of 7 scheduled times"),
  "English Direction Check-in uses mark language",
);
assert(
  productLanguage.ru.directionCheckIn.observation("Прогулка", 2, 7, 6, 7).includes("было отмечено 2 из 7"),
  "Russian Direction Check-in uses mark language",
);
