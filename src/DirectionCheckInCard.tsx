import { ArrowRight, Check, Clock3 } from "lucide-react";
import type { AppLanguage } from "./types";
import type { DirectionCheckInCandidate, DirectionCheckInOutcome } from "./directionCheckIn";

type DirectionCheckInCardProps = {
  candidate: DirectionCheckInCandidate | null;
  outcome: DirectionCheckInOutcome | null;
  language: AppLanguage;
  onFits: (candidate: DirectionCheckInCandidate) => void;
  onDismiss: (candidate: DirectionCheckInCandidate) => void;
  onAdjust?: (candidate: DirectionCheckInCandidate) => void;
};

const copy = {
  en: {
    label: "Direction check-in",
    title: "A change worth noticing",
    observation: (candidate: DirectionCheckInCandidate) =>
      `${candidate.itemTitle} happened ${candidate.currentSuccesses} of ${candidate.currentOpportunities} scheduled times last week, compared with ${candidate.previousSuccesses} of ${candidate.previousOpportunities} the week before.`,
    question: "Does this reflect what matters to you right now?",
    fits: "Yes, it fits",
    adjust: "Something should change",
    dismiss: "Not now",
    followUpLabel: "Since your last check-in",
    followUp: (outcome: DirectionCheckInOutcome) =>
      `${outcome.itemTitle} happened ${outcome.currentSuccesses} of ${outcome.currentOpportunities} scheduled times, compared with ${outcome.previousSuccesses} of ${outcome.previousOpportunities} before.`,
  },
  ru: {
    label: "Проверка направления",
    title: "Изменение, которое стоит заметить",
    observation: (candidate: DirectionCheckInCandidate) =>
      `На прошлой неделе «${candidate.itemTitle}» было выполнено ${candidate.currentSuccesses} из ${candidate.currentOpportunities} запланированных раз. Неделей ранее — ${candidate.previousSuccesses} из ${candidate.previousOpportunities}.`,
    question: "Это соответствует тому, что важно для тебя сейчас?",
    fits: "Да, всё подходит",
    adjust: "Стоит изменить",
    dismiss: "Не сейчас",
    followUpLabel: "После прошлой проверки",
    followUp: (outcome: DirectionCheckInOutcome) =>
      `«${outcome.itemTitle}» было выполнено ${outcome.currentSuccesses} из ${outcome.currentOpportunities} запланированных раз. До проверки — ${outcome.previousSuccesses} из ${outcome.previousOpportunities}.`,
  },
} as const;

export function DirectionCheckInCard({
  candidate,
  outcome,
  language,
  onFits,
  onDismiss,
  onAdjust,
}: DirectionCheckInCardProps) {
  const text = copy[language];

  if (!candidate && !outcome) {
    return null;
  }

  return (
    <section className="direction-check-in" aria-label={text.label}>
      {outcome && (
        <div className="direction-check-in-follow-up" role="status">
          <Check size={16} aria-hidden="true" />
          <div>
            <strong>{text.followUpLabel}</strong>
            <p>{text.followUp(outcome)}</p>
          </div>
        </div>
      )}

      {candidate && (
        <div className="direction-check-in-prompt">
          <span className="direction-section-label">{text.label}</span>
          <h2 id="direction-check-in-title">{text.title}</h2>
          <p className="direction-check-in-observation">{text.observation(candidate)}</p>
          <p className="direction-check-in-question">{text.question}</p>
          <div className="direction-check-in-actions">
            <button type="button" className="direction-check-in-primary" onClick={() => onFits(candidate)}>
              <Check size={16} aria-hidden="true" />
              {text.fits}
            </button>
            {onAdjust && (
              <button type="button" onClick={() => onAdjust(candidate)}>
                <ArrowRight size={16} aria-hidden="true" />
                {text.adjust}
              </button>
            )}
            <button type="button" onClick={() => onDismiss(candidate)}>
              <Clock3 size={16} aria-hidden="true" />
              {text.dismiss}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
