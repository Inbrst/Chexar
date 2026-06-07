import { ArrowRight, Check, Clock3 } from "lucide-react";
import { productLanguage } from "./productLanguage";
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

export function DirectionCheckInCard({
  candidate,
  outcome,
  language,
  onFits,
  onDismiss,
  onAdjust,
}: DirectionCheckInCardProps) {
  const languageCopy = productLanguage[language];
  const text = languageCopy.directionCheckIn;
  const label = languageCopy.labels.directionCheckIn;

  if (!candidate && !outcome) {
    return null;
  }

  return (
    <section className="direction-check-in" aria-label={label}>
      {outcome && (
        <div className="direction-check-in-follow-up" role="status">
          <Check size={16} aria-hidden="true" />
          <div>
            <strong>{text.followUpLabel}</strong>
            <p>
              {text.followUp(
                outcome.itemTitle,
                outcome.currentSuccesses,
                outcome.currentOpportunities,
                outcome.previousSuccesses,
                outcome.previousOpportunities,
              )}
            </p>
          </div>
        </div>
      )}

      {candidate && (
        <div className="direction-check-in-prompt">
          <span className="direction-section-label">{label}</span>
          <h2 id="direction-check-in-title">{text.title}</h2>
          <p className="direction-check-in-observation">
            {text.observation(
              candidate.itemTitle,
              candidate.currentSuccesses,
              candidate.currentOpportunities,
              candidate.previousSuccesses,
              candidate.previousOpportunities,
            )}
          </p>
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
