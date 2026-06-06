import { ChevronDown, Compass, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { parseDateKey } from "./dateUtils";
import {
  buildDirectionReview,
  builtInLifeAreas,
  type DirectionActionStats,
  type DirectionInsight,
  type DirectionLifeArea,
  type DirectionReviewPeriod,
} from "./directionReview";
import type { AppLanguage, AppState, LifeAreaKey } from "./types";

type DirectionReviewScreenProps = {
  appState: AppState;
  today: string;
  language: AppLanguage;
  onAreaChange: (
    itemType: "goal" | "task",
    itemId: string,
    area: LifeAreaKey | undefined,
    customLabel?: string,
  ) => void;
};

const directionCopy = {
  en: {
    title: "Direction Review",
    whereMoving: "Where you're moving",
    lifeAreas: "Life areas",
    insights: "Insights",
    coverage: "Data coverage",
    automatic: "Automatic",
    custom: "Custom",
    customPlaceholder: "Area name",
    clearSignal: "Clear signal",
    tentativeSignal: "Limited history",
    consistency: "Consistency",
    momentum: "Momentum",
    noComparison: "No comparison yet",
    noAreas: "Complete a few scheduled actions to see your life areas.",
    noInsights: "No strong changes yet. Your review will become clearer with more history.",
    learningSummary: "Chexar is still learning your rhythm.",
    steadySummary: "Your direction stayed broadly steady.",
    growthSummary: (area: string) => `Your rhythm is strengthening in ${area}.`,
    declineSummary: (area: string) => `Your rhythm is weakening in ${area}.`,
    shiftSummary: (growth: string, decline: string) => `Your rhythm is strengthening in ${growth} and weakening in ${decline}.`,
    comparisonUp: (value: number) => `Up ${value} points`,
    comparisonDown: (value: number) => `Down ${Math.abs(value)} points`,
    comparisonSteady: "Stable",
    opportunities: (successes: number, total: number) => `${successes} of ${total} scheduled check-ins`,
    areaGrowthTitle: (area: string) => `${area} gained momentum`,
    areaDeclineTitle: (area: string) => `${area} lost momentum`,
    areaEvidence: (previous: number, current: number, total: number) => `Consistency moved from ${previous}% to ${current}% across ${total} check-ins.`,
    consistentTitle: (title: string) => `${title} stayed consistent`,
    fadingTitle: (title: string) => `${title} may be fading`,
    fadingEvidence: (previous: number, current: number, successes: number, total: number) =>
      `Consistency fell from ${previous}% to ${current}% with ${successes} of ${total} check-ins completed.`,
    basedOn: (opportunities: number, items: number, areas: number) =>
      `Based on ${opportunities} scheduled check-ins across ${items} actions and ${areas} life areas.`,
    comparable: (areas: number) => `${areas} areas have enough history for comparison.`,
    tentative: (items: number) => `${items} automatic classifications are tentative.`,
    period: {
      "7d": "7d",
      "30d": "30d",
      "90d": "3m",
      "365d": "Year",
    },
    states: {
      growing: "Growing",
      recovering: "Recovering",
      steady: "Steady",
      declining: "Declining",
      quiet: "Quiet",
      insufficient: "Not enough data",
    },
    areas: {
      health: "Health",
      work: "Work",
      learning: "Learning",
      personal: "Personal",
      finance: "Finance",
      creativity: "Creativity",
      custom: "Custom",
    },
  },
  ru: {
    title: "Обзор направления",
    whereMoving: "Куда движется твой ритм",
    lifeAreas: "Сферы жизни",
    insights: "Наблюдения",
    coverage: "О данных",
    automatic: "Автоматически",
    custom: "Своя сфера",
    customPlaceholder: "Название сферы",
    clearSignal: "Ясный сигнал",
    tentativeSignal: "Мало истории",
    consistency: "Стабильность",
    momentum: "Динамика",
    noComparison: "Пока без сравнения",
    noAreas: "Отметь несколько запланированных действий, чтобы увидеть сферы жизни.",
    noInsights: "Заметных изменений пока нет. Обзор станет яснее, когда накопится история.",
    learningSummary: "Chexar пока изучает твой ритм.",
    steadySummary: "Общее направление осталось стабильным.",
    growthSummary: (area: string) => `Ритм укрепляется в сфере «${area}».`,
    declineSummary: (area: string) => `Ритм ослабевает в сфере «${area}».`,
    shiftSummary: (growth: string, decline: string) => `Ритм укрепляется в сфере «${growth}» и ослабевает в сфере «${decline}».`,
    comparisonUp: (value: number) => `Рост на ${value} п.`,
    comparisonDown: (value: number) => `Снижение на ${Math.abs(value)} п.`,
    comparisonSteady: "Без заметных изменений",
    opportunities: (successes: number, total: number) => `${successes} из ${total} запланированных отметок`,
    areaGrowthTitle: (area: string) => `${area}: ритм усилился`,
    areaDeclineTitle: (area: string) => `${area}: ритм ослаб`,
    areaEvidence: (previous: number, current: number, total: number) => `Стабильность изменилась с ${previous}% до ${current}% за ${total} отметок.`,
    consistentTitle: (title: string) => `${title}: устойчивый ритм`,
    fadingTitle: (title: string) => `${title} теряет ритм`,
    fadingEvidence: (previous: number, current: number, successes: number, total: number) =>
      `Стабильность снизилась с ${previous}% до ${current}%: выполнено ${successes} из ${total}.`,
    basedOn: (opportunities: number, items: number, areas: number) =>
      `Расчёт по ${opportunities} запланированным отметкам, ${items} действиям и ${areas} сферам.`,
    comparable: (areas: number) => `Для сравнения хватает истории в ${areas} сферах.`,
    tentative: (items: number) => `Автоклассификация ${items} действий пока предварительная.`,
    period: {
      "7d": "7 дн.",
      "30d": "30 дн.",
      "90d": "3 мес.",
      "365d": "Год",
    },
    states: {
      growing: "Растёт",
      recovering: "Восстанавливается",
      steady: "Стабильно",
      declining: "Снижается",
      quiet: "Без движения",
      insufficient: "Мало данных",
    },
    areas: {
      health: "Здоровье",
      work: "Работа",
      learning: "Обучение",
      personal: "Личное",
      finance: "Финансы",
      creativity: "Творчество",
      custom: "Своя сфера",
    },
  },
} as const;

const areaEmoji: Record<LifeAreaKey, string> = {
  health: "💚",
  work: "💼",
  learning: "📚",
  personal: "🏠",
  finance: "💰",
  creativity: "🎨",
  custom: "✨",
};

function formatRange(startDate: string, endDate: string, language: AppLanguage): string {
  const locale = language === "ru" ? "ru-RU" : "en-US";
  const formatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });

  return `${formatter.format(parseDateKey(startDate))} – ${formatter.format(parseDateKey(endDate))}`;
}

export function DirectionReviewScreen({ appState, today, language, onAreaChange }: DirectionReviewScreenProps) {
  const copy = directionCopy[language];
  const [period, setPeriod] = useState<DirectionReviewPeriod>("30d");
  const [expandedAreaId, setExpandedAreaId] = useState<string | null>(null);
  const review = useMemo(() => buildDirectionReview(appState, period, today), [appState, period, today]);
  const areaMap = useMemo(() => new Map(review.areas.map((area) => [area.id, area])), [review.areas]);
  const getAreaLabel = (area: Pick<DirectionLifeArea, "areaKey" | "customLabel"> | undefined) =>
    area?.areaKey === "custom" ? area.customLabel || copy.areas.custom : area ? copy.areas[area.areaKey] : copy.areas.personal;
  const primaryArea = review.summary.primaryAreaId ? areaMap.get(review.summary.primaryAreaId) : undefined;
  const secondaryArea = review.summary.secondaryAreaId ? areaMap.get(review.summary.secondaryAreaId) : undefined;
  const summaryText =
    review.summary.kind === "shift"
      ? copy.shiftSummary(getAreaLabel(primaryArea), getAreaLabel(secondaryArea))
      : review.summary.kind === "growth"
        ? copy.growthSummary(getAreaLabel(primaryArea))
        : review.summary.kind === "decline"
          ? copy.declineSummary(getAreaLabel(primaryArea))
          : review.summary.kind === "steady"
            ? copy.steadySummary
            : copy.learningSummary;
  const summaryMomentum =
    review.summary.momentum === null
      ? copy.noComparison
      : review.summary.momentum > 0
        ? copy.comparisonUp(review.summary.momentum)
        : review.summary.momentum < 0
          ? copy.comparisonDown(review.summary.momentum)
          : copy.comparisonSteady;

  return (
    <main className="direction-review-screen">
      <header className="direction-review-header">
        <div>
          <span>Chexar</span>
          <h1>{copy.title}</h1>
          <p>{formatRange(review.currentRange.startDate, review.currentRange.endDate, language)}</p>
        </div>
        <Compass size={24} aria-hidden="true" />
      </header>

      <div className="direction-period-tabs" role="group" aria-label={copy.title}>
        {(Object.keys(copy.period) as DirectionReviewPeriod[]).map((option) => (
          <button
            type="button"
            key={option}
            className={period === option ? "active" : ""}
            aria-pressed={period === option}
            onClick={() => setPeriod(option)}
          >
            {copy.period[option]}
          </button>
        ))}
      </div>

      <section className="direction-summary" aria-labelledby="direction-summary-title">
        <div className="direction-section-label" id="direction-summary-title">{copy.whereMoving}</div>
        <h2>{summaryText}</h2>
        <div className="direction-summary-signals">
          <div>
            <span>{copy.consistency}</span>
            <strong>{review.summary.consistency === null ? "—" : `${review.summary.consistency}%`}</strong>
          </div>
          <div>
            <span>{copy.momentum}</span>
            <strong>{summaryMomentum}</strong>
          </div>
        </div>
        <small className={`direction-confidence ${review.summary.confidence}`}>
          {review.summary.confidence === "clear" ? copy.clearSignal : copy.tentativeSignal}
        </small>
      </section>

      <section className="direction-areas" aria-labelledby="direction-areas-title">
        <div className="direction-section-heading">
          <h2 id="direction-areas-title">{copy.lifeAreas}</h2>
          <span>{review.areas.length}</span>
        </div>
        {review.areas.length === 0 ? (
          <p className="direction-empty">{copy.noAreas}</p>
        ) : (
          <div className="direction-area-list">
            {review.areas.map((area) => {
              const expanded = expandedAreaId === area.id;
              const momentum =
                area.momentum === null ? copy.noComparison : `${area.momentum > 0 ? "+" : ""}${area.momentum} p.`;

              return (
                <article className={`direction-area ${expanded ? "expanded" : ""}`} key={area.id}>
                  <button
                    type="button"
                    className="direction-area-trigger"
                    aria-expanded={expanded}
                    onClick={() => setExpandedAreaId((current) => current === area.id ? null : area.id)}
                  >
                    <span className="direction-area-emoji" aria-hidden="true">{areaEmoji[area.areaKey]}</span>
                    <span className="direction-area-main">
                      <strong>{getAreaLabel(area)}</strong>
                      <small>{copy.states[area.state]}</small>
                    </span>
                    <span className={`direction-area-momentum ${area.momentum !== null && area.momentum < 0 ? "negative" : ""}`}>
                      {area.consistency === null ? "—" : `${area.consistency}%`}
                      <small>{momentum}</small>
                    </span>
                    <ChevronDown size={17} aria-hidden="true" />
                  </button>
                  {expanded && (
                    <div className="direction-area-details">
                      {area.items.map((item) => (
                        <DirectionAreaItem
                          key={`${item.itemType}:${item.id}`}
                          item={item}
                          language={language}
                          onAreaChange={onAreaChange}
                        />
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="direction-insights" aria-labelledby="direction-insights-title">
        <div className="direction-section-heading">
          <h2 id="direction-insights-title">{copy.insights}</h2>
          <span>{review.insights.length}</span>
        </div>
        {review.insights.length === 0 ? (
          <p className="direction-empty">{copy.noInsights}</p>
        ) : (
          <div className="direction-insight-list">
            {review.insights.map((insight, index) => (
              <DirectionInsightRow
                key={`${insight.kind}-${"itemId" in insight ? insight.itemId : insight.areaId}-${index}`}
                insight={insight}
                areas={areaMap}
                language={language}
              />
            ))}
          </div>
        )}
      </section>

      <footer className="direction-coverage">
        <strong>{copy.coverage}</strong>
        <p>{copy.basedOn(review.coverage.scheduledOpportunities, review.coverage.activeItems, review.coverage.areasWithData)}</p>
        <p>{copy.comparable(review.coverage.comparableAreas)}</p>
        {review.coverage.tentativeItems > 0 && <p>{copy.tentative(review.coverage.tentativeItems)}</p>}
      </footer>
    </main>
  );
}

function DirectionAreaItem({
  item,
  language,
  onAreaChange,
}: {
  item: DirectionActionStats;
  language: AppLanguage;
  onAreaChange: DirectionReviewScreenProps["onAreaChange"];
}) {
  const copy = directionCopy[language];
  const selectValue = item.area.source === "manual" ? item.area.areaKey : "auto";
  const inferredLabel = item.area.areaKey === "custom"
    ? item.area.customLabel || copy.areas.custom
    : copy.areas[item.area.areaKey];

  return (
    <div className="direction-area-item">
      <div className="direction-area-item-copy">
        <span aria-hidden="true">{item.emoji || areaEmoji[item.area.areaKey]}</span>
        <div>
          <strong>{item.title}</strong>
          <small>{copy.opportunities(item.currentSuccesses, item.currentOpportunities)}</small>
        </div>
      </div>
      <label className="direction-area-select">
        <span className="sr-only">{copy.lifeAreas}</span>
        <select
          value={selectValue}
          onChange={(event) => {
            const value = event.target.value;

            if (value === "auto") {
              onAreaChange(item.itemType, item.id, undefined);
              return;
            }

            if (value === "custom") {
              onAreaChange(item.itemType, item.id, "custom", item.area.customLabel || copy.custom);
              return;
            }

            onAreaChange(item.itemType, item.id, value as LifeAreaKey);
          }}
        >
          <option value="auto">{copy.automatic} · {inferredLabel}</option>
          {builtInLifeAreas.map((area) => <option key={area} value={area}>{copy.areas[area]}</option>)}
          <option value="custom">{copy.custom}</option>
        </select>
      </label>
      {item.area.source === "manual" && item.area.areaKey === "custom" && (
        <input
          className="direction-custom-area-input"
          key={`${item.id}-${item.area.customLabel ?? ""}`}
          defaultValue={item.area.customLabel ?? ""}
          maxLength={40}
          placeholder={copy.customPlaceholder}
          onBlur={(event) => onAreaChange(item.itemType, item.id, "custom", event.target.value)}
        />
      )}
    </div>
  );
}

function DirectionInsightRow({
  insight,
  areas,
  language,
}: {
  insight: DirectionInsight;
  areas: Map<string, DirectionLifeArea>;
  language: AppLanguage;
}) {
  const copy = directionCopy[language];
  const area = areas.get(insight.areaId);
  const areaLabel = area?.areaKey === "custom" ? area.customLabel || copy.areas.custom : area ? copy.areas[area.areaKey] : copy.areas.personal;
  const growing = insight.kind === "area-growth";
  const declining = insight.kind === "area-decline" || insight.kind === "fading-item";
  const Icon = growing ? TrendingUp : declining ? TrendingDown : Minus;
  let title = "";
  let evidence = "";

  if (insight.kind === "area-growth") {
    title = copy.areaGrowthTitle(areaLabel);
    evidence = copy.areaEvidence(insight.previousConsistency, insight.consistency, insight.opportunities);
  } else if (insight.kind === "area-decline") {
    title = copy.areaDeclineTitle(areaLabel);
    evidence = copy.areaEvidence(insight.previousConsistency, insight.consistency, insight.opportunities);
  } else if ("itemId" in insight && insight.kind === "fading-item") {
    title = copy.fadingTitle(insight.title);
    evidence = copy.fadingEvidence(
      insight.previousConsistency ?? 0,
      insight.consistency,
      insight.successes,
      insight.opportunities,
    );
  } else if ("itemId" in insight) {
    title = copy.consistentTitle(insight.title);
    evidence = copy.opportunities(insight.successes, insight.opportunities);
  }

  const clear = insight.opportunities >= 8;

  return (
    <article className={`direction-insight ${declining ? "negative" : growing ? "positive" : ""}`}>
      <Icon size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{evidence}</p>
        <small>{clear ? copy.clearSignal : copy.tentativeSignal}</small>
      </div>
    </article>
  );
}
