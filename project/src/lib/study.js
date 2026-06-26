import { supabase } from '../supabase.js';
import { computeSM2 } from './sm2.js';
import { scheduleFSRS } from './fsrs.js';
import { todayLocalISO, localDateKey } from './dates.js';

export async function submitStudyEvent({
  userId,
  topicId,
  eventType,
  startTime,
  endTime,
  durationMinutes,
  confidenceRating,
  focusRating,
  pomodoroCycles,
  velocityUnits,
  notes,
}) {
  const { data: event, error: eventError } = await supabase
    .from('study_events')
    .insert({
      user_id: userId,
      topic_id: topicId,
      event_type: eventType,
      start_time: startTime,
      end_time: endTime,
      duration_minutes: durationMinutes,
      confidence_rating: confidenceRating,
      focus_rating: focusRating,
      pomodoro_cycles: pomodoroCycles,
      velocity_units: velocityUnits ?? null,
      notes,
    })
    .select()
    .single();
  if (eventError) throw eventError;

  // Check per-user FSRS opt-in flag
  const { data: profile } = await supabase
    .from('profiles')
    .select('use_fsrs')
    .eq('id', userId)
    .single();
  const useFSRS = profile?.use_fsrs === true;

  const { data: state } = await supabase
    .from('review_states')
    .select('*')
    .eq('topic_id', topicId)
    .maybeSingle();

  let masteryScore;

  if (useFSRS) {
    const fsrsResult = scheduleFSRS(state ?? {}, confidenceRating);
    masteryScore = fsrsResult.masteryScore;

    const fsrsRow = {
      stability: fsrsResult.stability,
      fsrs_difficulty: fsrsResult.fsrs_difficulty,
      reps: fsrsResult.reps,
      lapses: fsrsResult.lapses,
      fsrs_state: fsrsResult.fsrs_state,
      last_reviewed_at: fsrsResult.last_reviewed_at,
      next_review_date: fsrsResult.nextReviewDate,
      last_review_date: todayLocalISO(),
      interval_days: fsrsResult.intervalDays,
      updated_at: new Date().toISOString(),
    };

    if (state) {
      const { error } = await supabase
        .from('review_states')
        .update(fsrsRow)
        .eq('topic_id', topicId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('review_states')
        .insert({ topic_id: topicId, ...fsrsRow });
      if (error) throw error;
    }
  } else {
    // SM2 path (default for all users)
    const currentState = state || {
      ease_factor: 2.5,
      interval_days: 0,
      repetitions: 0,
    };

    const result = computeSM2(
      {
        easeFactor: parseFloat(currentState.ease_factor),
        intervalDays: currentState.interval_days,
        repetitions: currentState.repetitions,
      },
      confidenceRating
    );
    masteryScore = result.masteryScore;

    if (state) {
      const { error: updateError } = await supabase
        .from('review_states')
        .update({
          ease_factor: result.easeFactor,
          interval_days: result.intervalDays,
          repetitions: result.repetitions,
          next_review_date: result.nextReviewDate,
          last_review_date: todayLocalISO(),
          updated_at: new Date().toISOString(),
        })
        .eq('topic_id', topicId);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('review_states')
        .insert({
          topic_id: topicId,
          ease_factor: result.easeFactor,
          interval_days: result.intervalDays,
          repetitions: result.repetitions,
          next_review_date: result.nextReviewDate,
          last_review_date: todayLocalISO(),
        });
      if (insertError) throw insertError;
    }
  }

  const { error: topicError } = await supabase
    .from('topics')
    .update({ current_mastery: masteryScore })
    .eq('id', topicId);
  if (topicError) throw topicError;

  await updateStreak(userId);

  return { event, masteryScore };
}

async function updateStreak(userId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('streak_count, last_active_date')
    .eq('id', userId)
    .single();

  if (!profile) return;

  const today = todayLocalISO();
  let newStreak = profile.streak_count || 0;
  const last = profile.last_active_date;

  if (!last) {
    newStreak = 1;
  } else {
    const diff = Math.round(
      (new Date(today + 'T00:00:00') - new Date(last + 'T00:00:00')) / 86400000
    );
    if (diff === 0) {
      return;
    } else if (diff === 1) {
      newStreak = (profile.streak_count || 0) + 1;
    } else {
      newStreak = 1;
    }
  }

  await supabase
    .from('profiles')
    .update({ streak_count: newStreak, last_active_date: today })
    .eq('id', userId);
}
