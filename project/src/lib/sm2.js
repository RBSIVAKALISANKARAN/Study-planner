export function computeSM2(state, confidenceRating) {
  const qualityMap = { 1: 0, 2: 2, 3: 3, 4: 4, 5: 5 };
  const q = qualityMap[confidenceRating];
  let easeFactor = state.easeFactor;
  let intervalDays = state.intervalDays;
  let repetitions = state.repetitions;

  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (repetitions === 0) intervalDays = 1;
    else if (repetitions === 1) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * easeFactor);
    repetitions += 1;
  }

  easeFactor = Math.max(
    1.3,
    easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)
  );

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + intervalDays);

  const masteryScore = Math.min(
    100,
    Math.round(((easeFactor - 1.3) / (2.5 - 1.3)) * 60 + repetitions * 8)
  );

  return {
    easeFactor: parseFloat(easeFactor.toFixed(2)),
    intervalDays,
    repetitions,
    nextReviewDate: nextReviewDate.toISOString().split('T')[0],
    masteryScore,
  };
}
