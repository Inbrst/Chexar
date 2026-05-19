export type SemanticUnitMode = "draft" | "display";

type NormalizeSemanticQuantityUnitOptions = {
  title: string;
  unit?: string | null;
  sourceText?: string;
  fallbackUnit?: string;
  targetValue?: number | null;
  language?: string;
  mode?: SemanticUnitMode;
};

const wordBoundary = "(^|[^а-яёa-z])";
const wordEnd = "(?=$|[^а-яёa-z])";
const durationUnitPattern = new RegExp(`${wordBoundary}(?:мин(?:\\.|ут[а-яё]*)?|m|min(?:ute)?s?|час(?:а|ов)?|ч(?:\\.|ас)?|h|hour?s?)${wordEnd}`, "i");
const genericCountUnitPattern = new RegExp(`${wordBoundary}(?:раз(?:а|ов)?|times?|шт(?:\\.|ук)?|items?)${wordEnd}`, "i");
const workoutPattern = /трениров|зарядк|спорт|фитнес|workout|training|exercise|gym/i;

function hasDurationUnit(value: string): boolean {
  return durationUnitPattern.test(value.toLocaleLowerCase("ru-RU"));
}

function isGenericCountUnit(value: string): boolean {
  return genericCountUnitPattern.test(value.toLocaleLowerCase("ru-RU"));
}

function getWorkoutCountUnit(language?: string): string {
  return language === "en" ? "workouts" : "тренировок";
}

export function normalizeSemanticQuantityUnit({
  title,
  unit,
  sourceText = "",
  fallbackUnit,
  targetValue,
  language = "ru",
  mode = "draft",
}: NormalizeSemanticQuantityUnitOptions): string {
  const cleanUnit = unit?.trim() ?? "";
  const fallback = fallbackUnit?.trim() || (language === "en" ? "times" : "раз");
  const semanticSource = `${title} ${sourceText}`.toLocaleLowerCase("ru-RU");

  if (!workoutPattern.test(semanticSource)) {
    return cleanUnit || fallback;
  }

  if (hasDurationUnit(sourceText)) {
    return cleanUnit || (language === "en" ? "minutes" : "минут");
  }

  const unitIsDuration = cleanUnit ? hasDurationUnit(cleanUnit) : false;
  const unitIsGeneric = cleanUnit ? isGenericCountUnit(cleanUnit) : false;
  const numericTarget = Number(targetValue);
  const isSmallStoredDuration = mode === "display" && unitIsDuration && Number.isFinite(numericTarget) && numericTarget > 0 && numericTarget <= 10;
  const isInventedDraftDuration = mode === "draft" && unitIsDuration;

  if (!cleanUnit || unitIsGeneric || isInventedDraftDuration || isSmallStoredDuration) {
    return getWorkoutCountUnit(language);
  }

  return cleanUnit || fallback;
}
