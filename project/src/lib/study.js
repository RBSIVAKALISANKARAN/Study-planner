import { supabase } from '../supabase.js';
import { computeSM2 } from './sm2.js';
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
      notes,
    })
    .select()
    .single();
  if (eventError) throw eventError;

  const { data: state } = await supabase
    .from('review_states')
    .select('*')
    .eq('topic_id', topicId)
    .maybeSingle();

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

  const { error: topicError } = await supabase
    .from('topics')
    .update({ current_mastery: result.masteryScore })
    .eq('id', topicId);
  if (topicError) throw topicError;

  await updateStreak(userId);

  return { event, masteryScore: result.masteryScore };
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
