import { Rating, State, createEmptyCard, fsrs } from 'ts-fsrs';

// Map 1–5 confidence to FSRS 1–4 Rating
// 1 → Again (complete blackout)
// 2 → Hard  (significant difficulty)
// 3 → Good  (correct with some effort)
// 4 → Good  (correct with ease — collapse middle)
// 5 → Easy  (perfect recall)
const CONFIDENCE_TO_RATING = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Good,
  5: Rating.Easy,
};

export function scheduleFSRS(reviewState, confidenceRating) {
  const rating = CONFIDENCE_TO_RATING[confidenceRating] ?? Rating.Good;

  const card = createEmptyCard();
  card.stability = reviewState.stability ?? 0;
  card.difficulty = reviewState.fsrs_difficulty ?? 0;
  card.reps = reviewState.reps ?? 0;
  card.lapses = reviewState.lapses ?? 0;
  card.state = reviewState.fsrs_state ?? State.New;
  if (reviewState.last_reviewed_at) {
    card.last_review = new Date(reviewState.last_reviewed_at);
    const msElapsed = Date.now() - card.last_review.getTime();
    card.elapsed_days = Math.max(0, Math.floor(msElapsed / 86400000));
  }

  const f = fsrs();
  const now = new Date();
  const { card: next } = f.next(card, now, rating);

  // Retrievability: R = exp(-t / stability), t = elapsed days since last review
  const t = card.elapsed_days ?? 0;
  const stability = next.stability > 0 ? next.stability : 1;
  const retrievability = Math.exp(-t / stability);
  const masteryScore = Math.min(100, Math.round(retrievability * 100));

  return {
    stability: next.stability,
    fsrs_difficulty: next.difficulty,
    reps: next.reps,
    lapses: next.lapses,
    fsrs_state: next.state,
    last_reviewed_at: now.toISOString(),
    nextReviewDate: next.due.toISOString().split('T')[0],
    intervalDays: next.scheduled_days,
    masteryScore,
  };
}
