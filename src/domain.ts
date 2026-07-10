import { blocks, orientationWorkoutIds, weekdayWorkoutIds, workouts } from './data/program';
import type {
  ActiveSession,
  ClearanceKey,
  ClearanceRecord,
  DailyMetric,
  PlannedDay,
  SessionLog,
  SetLog,
  SymptomCheck,
  SymptomSignal,
  WarmupLog,
  WorkoutSegment,
} from './types';

const DAY_MS = 86_400_000;
export const PROGRAM_DAYS = 13 * 28;
export const MAIN_DURATION_SECONDS = 1200;
export const WARMUP_CREDIT_THRESHOLD_SECONDS = 30;

function dateParts(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid local date: ${date}`);
  const [, year, month, day] = match.map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) throw new Error(`Invalid local date: ${date}`);
  return { year, month, day, timestamp };
}

export function toLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function differenceInCalendarDays(date: string, startDate: string) {
  return (dateParts(date).timestamp - dateParts(startDate).timestamp) / DAY_MS;
}

export function addCalendarDays(date: string, days: number) {
  if (!Number.isInteger(days)) throw new Error('Calendar days must be an integer');
  return new Date(dateParts(date).timestamp + days * DAY_MS).toISOString().slice(0, 10);
}

export function localWeekday(date: string) {
  return new Date(dateParts(date).timestamp).getUTCDay();
}

export type SymptomInput = Omit<SymptomCheck, 'signal'> & { signal?: SymptomSignal };

export function classifySymptoms(check: SymptomInput, braceRequired = false): SymptomSignal {
  if (
    check.kneePain0to10 >= 4 ||
    check.backPain0to10 >= 4 ||
    check.swelling ||
    check.instability ||
    check.neurologicalSymptoms ||
    check.tendonSoreness === 'significant' ||
    (braceRequired && check.braceUsed === 'no')
  ) return 'red';

  if (
    check.kneePain0to10 === 3 ||
    check.backPain0to10 === 3 ||
    check.tendonSoreness === 'mild' ||
    check.readiness === 'poor'
  ) return 'yellow';

  return 'green';
}

export function latestClearances(records: ClearanceRecord[], onDate?: string) {
  const latest = new Map<ClearanceKey, ClearanceRecord>();
  for (const record of records) {
    if (onDate && record.date > onDate) continue;
    const current = latest.get(record.key);
    if (!current || record.date >= current.date) latest.set(record.key, record);
  }
  return latest;
}

export function applyClearanceSubstitution(
  workoutId: string,
  records: ClearanceRecord[],
  onDate?: string,
) {
  const latest = latestClearances(records, onDate);
  const missingFor = (id: string) => {
    const workout = workouts.find((item) => item.id === id);
    if (!workout) throw new Error(`Unknown workout: ${id}`);
    return { workout, missing: workout.clearanceRequired.filter((key) => {
      const status = latest.get(key)?.status;
      return status !== 'cleared' && status !== 'cleared_with_limits';
    }) };
  };
  const initial = missingFor(workoutId);
  let current = initial;
  const visited = new Set([workoutId]);

  while (current.missing.length && current.workout.nonImpactWorkoutId) {
    if (visited.has(current.workout.nonImpactWorkoutId)) throw new Error(`Clearance substitution cycle: ${workoutId}`);
    visited.add(current.workout.nonImpactWorkoutId);
    current = missingFor(current.workout.nonImpactWorkoutId);
  }
  const blocked = current.missing.length > 0;
  const safeWorkoutId = blocked ? 'armor_zone2' : current.workout.id;
  const missing = initial.missing;

  return {
    workoutId: safeWorkoutId,
    missing,
    blocked,
    reason: missing.length
      ? `Not cleared: ${missing.map((key) => key.replaceAll('_', ' ')).join(', ')}`
      : undefined,
  };
}

export function resolvePlannedDay(
  date: string,
  startDate: string,
  clearances: ClearanceRecord[] = [],
): PlannedDay {
  const dayIndex = differenceInCalendarDays(date, startDate);
  const isBeforeProgram = dayIndex < 0;
  const isAfterProgram = dayIndex > PROGRAM_DAYS;
  const isFinalTest = dayIndex === PROGRAM_DAYS;
  const boundedDay = Math.max(0, Math.min(PROGRAM_DAYS - 1, dayIndex));
  const block = isFinalTest || isAfterProgram ? 13 : Math.floor(boundedDay / 28) + 1;
  const dayInBlock = boundedDay % 28;
  const blockWeek = isFinalTest || isAfterProgram ? 4 : Math.floor(dayInBlock / 7) + 1;
  const weekday = localWeekday(date);
  const blockOverride = blocks.find((item) => item.number === block)?.workoutOverrides?.[weekday];
  const plannedWorkoutId = isFinalTest || isAfterProgram
    ? 'final_test'
    : dayIndex >= 0 && dayIndex < orientationWorkoutIds.length
      ? orientationWorkoutIds[dayIndex]
      : blockOverride ?? weekdayWorkoutIds[weekday];
  const actual = applyClearanceSubstitution(plannedWorkoutId, clearances, date);

  return {
    date,
    dayIndex,
    block,
    blockWeek,
    weekInProgram: dayIndex < 0 ? 0 : Math.min(53, Math.floor(dayIndex / 7) + 1),
    workoutId: actual.workoutId,
    plannedWorkoutId,
    isFinalTest,
    isBeforeProgram,
    isAfterProgram,
    substitutionReason: actual.reason,
  };
}

export function rollingBodyWeightAverage(metrics: DailyMetric[], throughDate: string) {
  const startDate = addCalendarDays(throughDate, -6);
  const weights = metrics
    .filter(({ date, bodyWeightLb }) => date >= startDate && date <= throughDate && bodyWeightLb != null)
    .map(({ bodyWeightLb }) => bodyWeightLb!);
  if (!weights.length) return undefined;
  return Math.round((weights.reduce((sum, weight) => sum + weight, 0) / weights.length) * 10) / 10;
}

export interface ProgressionSuggestion {
  action: 'start' | 'add_reps' | 'add_load' | 'repeat';
  targetReps: number;
  suggestedLoadLb?: number;
  reason: string;
}

export function suggestDoubleProgression(
  sets: Pick<SetLog, 'reps' | 'loadLb' | 'rir' | 'quality' | 'painDuring'>[],
  [minimumReps, maximumReps]: [number, number],
  incrementLb: number,
): ProgressionSuggestion {
  if (!sets.length) return { action: 'start', targetReps: minimumReps, reason: 'Start at the bottom of the range.' };

  const load = Math.max(...sets.map(({ loadLb }) => loadLb ?? 0));
  const clean = sets.every(({ reps, rir, quality, painDuring }) =>
    reps != null && (rir == null || rir >= 2) && quality !== 'declining' && quality !== 'stopped' && (painDuring ?? 0) <= 2,
  );
  if (!clean) return { action: 'repeat', targetReps: minimumReps, suggestedLoadLb: load, reason: 'Repeat until form, symptoms, and reserve are green.' };

  if (sets.every(({ reps }) => reps! >= maximumReps)) {
    return {
      action: 'add_load',
      targetReps: minimumReps,
      suggestedLoadLb: load + incrementLb,
      reason: 'All sets reached the top of the range with at least 2 reps in reserve.',
    };
  }

  return {
    action: 'add_reps',
    targetReps: Math.min(maximumReps, Math.min(...sets.map(({ reps }) => reps!)) + 1),
    suggestedLoadLb: load,
    reason: 'Keep the load and add one rep to the lowest set.',
  };
}

export function pickupMondayAdjustment(date: string, sessions: SessionLog[]) {
  if (localWeekday(date) !== 1) return undefined;
  const saturday = addCalendarDays(date, -2);
  const pickup = sessions.find(({ date: sessionDate, basketballMinutes }) =>
    sessionDate === saturday && (basketballMinutes ?? 0) > 0,
  );
  if (!pickup) return undefined;

  const response = pickup.nextMorningSignal ?? pickup.postCheck.signal;
  const reductionPercent = response === 'red' ? 40 : response === 'yellow' || pickup.sessionDifficulty === 'too_hard' ? 25 : 0;
  return {
    reductionPercent,
    reason: reductionPercent
      ? `Saturday pickup response was ${response}; reduce Monday lower-body volume.`
      : 'Saturday pickup was logged with a green response.',
  };
}

export function countHighImpactExposures(sessions: SessionLog[], weekStart: string) {
  const weekEnd = addCalendarDays(weekStart, 6);
  return sessions.filter((session) => {
    if (session.date < weekStart || session.date > weekEnd) return false;
    if ((session.basketballMinutes ?? 0) > 0) return true;
    return workouts.find(({ id }) => id === session.actualWorkoutId)?.stressTags.some((tag) => tag.includes('impact')) ?? false;
  }).length;
}

function timestamp(value: string | number | Date) {
  const result = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(result)) throw new Error(`Invalid timestamp: ${value}`);
  return result;
}

export function timerState(
  mainStartedAt: string | number | Date,
  now: string | number | Date,
  segment: Pick<WorkoutSegment, 'startSecond' | 'endSecond'>,
  mainDurationSeconds = MAIN_DURATION_SECONDS,
) {
  const elapsedExact = Math.max(0, (timestamp(now) - timestamp(mainStartedAt)) / 1000);
  const overallRemainingSeconds = Math.max(0, Math.ceil(mainDurationSeconds - elapsedExact));
  const segmentRemainingSeconds = Math.max(0, Math.ceil(segment.endSecond - elapsedExact));
  const hasTwentySeconds = mainDurationSeconds - elapsedExact >= 20 && segment.endSecond - elapsedExact >= 20;
  const started = elapsedExact >= segment.startSecond;
  const ended = elapsedExact >= segment.endSecond || elapsedExact >= mainDurationSeconds;
  return {
    overallElapsedSeconds: Math.min(mainDurationSeconds, Math.floor(elapsedExact)),
    overallRemainingSeconds,
    segmentElapsedSeconds: started ? Math.min(segment.endSecond - segment.startSecond, Math.floor(elapsedExact - segment.startSecond)) : 0,
    segmentRemainingSeconds,
    started,
    ended,
    canStartSet: started && !ended && hasTwentySeconds,
  };
}

export function restRemainingSeconds(restUntil: string | number | Date | undefined, now: string | number | Date) {
  return restUntil == null ? 0 : Math.max(0, Math.ceil((timestamp(restUntil) - timestamp(now)) / 1000));
}

export function exerciseSequence(segment: WorkoutSegment): number[] {
  const rounds = segment.targetRounds ?? Math.max(1, ...segment.exercises.map((exercise) => exercise.targetSets ?? 1));
  if (segment.flow === 'single' || segment.flow === 'intervals') {
    return Array.from({ length: segment.exercises[0]?.targetSets ?? rounds }, () => 0);
  }
  return Array.from({ length: rounds }, (_, round) => segment.exercises.flatMap((exercise, index) => round < (exercise.targetSets ?? rounds) ? [index] : [])).flat();
}

export function restAfterExerciseStep(sequence: number[], step: number) {
  return step >= sequence.length - 1 || sequence[step + 1] <= sequence[step];
}

export function summarizeWarmup(plannedSeconds: number, elapsedSeconds: number): WarmupLog {
  if (!plannedSeconds) return { plannedSeconds: 0, completedSeconds: 0, status: 'not_applicable' };
  const completedSeconds = elapsedSeconds >= WARMUP_CREDIT_THRESHOLD_SECONDS
    ? Math.min(plannedSeconds, Math.max(0, Math.floor(elapsedSeconds)))
    : 0;
  return {
    plannedSeconds,
    completedSeconds,
    status: completedSeconds === 0 ? 'skipped' : completedSeconds >= plannedSeconds ? 'complete' : 'partial',
  };
}

export function pauseActiveSession(session: ActiveSession, now: string | number | Date = new Date()): ActiveSession {
  if (session.pausedAt) return session;
  return { ...session, pausedAt: new Date(timestamp(now)).toISOString() };
}

export function skipToNextSegment(
  session: ActiveSession,
  segments: Pick<WorkoutSegment, 'startSecond' | 'endSecond'>[],
  now: string | number | Date = new Date(),
): ActiveSession {
  if (!session.mainStartedAt) return session;
  const elapsed = Math.max(0, (timestamp(now) - timestamp(session.mainStartedAt)) / 1000);
  const current = segments.find((segment) => elapsed < segment.endSecond);
  if (!current) return session;
  // Shift the main clock back so elapsed time lands exactly on the segment boundary;
  // the player derives the segment from the clock, so this also ends the main block
  // when the current segment is the last one.
  const shiftMs = Math.round((current.endSecond - elapsed) * 1000);
  return {
    ...session,
    mainStartedAt: new Date(timestamp(session.mainStartedAt) - shiftMs).toISOString(),
    restUntil: undefined,
  };
}

export function resumeActiveSession(session: ActiveSession, now: string | number | Date = new Date()): ActiveSession {
  if (!session.pausedAt) return session;
  const pausedForMs = Math.max(0, timestamp(now) - timestamp(session.pausedAt));
  const shift = (value: string | undefined) => value ? new Date(timestamp(value) + pausedForMs).toISOString() : undefined;
  return {
    ...session,
    pausedAt: undefined,
    phaseStartedAt: shift(session.phaseStartedAt)!,
    warmupStartedAt: shift(session.warmupStartedAt),
    mainStartedAt: shift(session.mainStartedAt),
    restUntil: shift(session.restUntil),
  };
}
