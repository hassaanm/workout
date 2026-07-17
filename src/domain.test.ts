import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  applyClearanceSubstitution,
  classifySymptoms,
  differenceInCalendarDays,
  exerciseSequence,
  hasEquipmentFor,
  pickupMondayAdjustment,
  resolveEquipmentSwap,
  pauseActiveSession,
  resolvePlannedDay,
  restRemainingSeconds,
  restAfterExerciseStep,
  resumeActiveSession,
  rollingBodyWeightAverage,
  skipToNextSegment,
  suggestDoubleProgression,
  summarizeWarmup,
  timerState,
} from './domain';
import { exerciseById } from './data/exercises';
import type { ActiveSession, ClearanceRecord, SessionLog, SymptomCheck, WorkoutSegment } from './types';

const greenCheck: SymptomCheck = {
  kneePain0to10: 0,
  backPain0to10: 0,
  swelling: false,
  instability: false,
  tendonSoreness: 'none',
  readiness: 'good',
  braceUsed: 'not_applicable',
  signal: 'green',
};

describe('local calendar dates', () => {
  it('crosses DST changes without losing or gaining a day', () => {
    expect(differenceInCalendarDays('2026-03-09', '2026-03-08')).toBe(1);
    expect(differenceInCalendarDays('2026-11-02', '2026-11-01')).toBe(1);
    expect(addCalendarDays('2026-03-08', 1)).toBe('2026-03-09');
  });

  it('rejects impossible dates', () => {
    expect(() => differenceInCalendarDays('2026-02-30', '2026-02-01')).toThrow('Invalid local date');
  });
});

describe('program calendar', () => {
  it('uses the orientation weekend, 13 28-day blocks, and final day 364', () => {
    const start = resolvePlannedDay('2026-07-10', '2026-07-10');
    const lastBlock = resolvePlannedDay(addCalendarDays('2026-07-10', 363), '2026-07-10');
    const final = resolvePlannedDay(addCalendarDays('2026-07-10', 364), '2026-07-10');
    const after = resolvePlannedDay(addCalendarDays('2026-07-10', 365), '2026-07-10');

    expect(start).toMatchObject({ dayIndex: 0, block: 1, blockWeek: 1, isFinalTest: false });
    expect(lastBlock).toMatchObject({ dayIndex: 363, block: 13, blockWeek: 4 });
    expect(final).toMatchObject({ dayIndex: 364, block: 13, blockWeek: 4, plannedWorkoutId: 'final_test', isFinalTest: true });
    expect(after.isAfterProgram).toBe(true);
    for (let block = 1; block <= 13; block += 1) {
      expect(resolvePlannedDay(addCalendarDays('2026-07-10', (block - 1) * 28), '2026-07-10').block).toBe(block);
    }
  });
});

describe('safety resolution', () => {
  it('classifies green, yellow, and red from the check itself', () => {
    expect(classifySymptoms(greenCheck)).toBe('green');
    expect(classifySymptoms({ ...greenCheck, kneePain0to10: 3 })).toBe('yellow');
    expect(classifySymptoms({ ...greenCheck, swelling: true })).toBe('red');
    expect(classifySymptoms({ ...greenCheck, neurologicalSymptoms: true })).toBe('red');
    expect(classifySymptoms({ ...greenCheck, braceUsed: 'no' }, true)).toBe('red');
  });

  it('ignores clearance records dated after the day being resolved', () => {
    const future: ClearanceRecord[] = [
      { id: '1', key: 'squat_loading', status: 'cleared', date: '2026-09-01', source: 'pt' },
      { id: '2', key: 'heavy_hamstring', status: 'cleared', date: '2026-09-01', source: 'pt' },
      { id: '3', key: 'deep_flexion', status: 'cleared', date: '2026-09-01', source: 'pt' },
    ];
    expect(applyClearanceSubstitution('lower_strength_b', future, '2026-08-31').workoutId).toBe('lower_strength_b_pt');
    expect(applyClearanceSubstitution('lower_strength_b', future, '2026-09-01').workoutId).toBe('lower_strength_b');
  });

  it('uses a safe fallback until every required clearance is present', () => {
    const blocked = applyClearanceSubstitution('jump_speed_a', []);
    expect(blocked.workoutId).not.toBe('jump_speed_a');
    expect(blocked.missing.length).toBeGreaterThan(0);

    const clearances: ClearanceRecord[] = blocked.missing.map((key, index) => ({
      id: String(index),
      key,
      status: 'cleared',
      date: '2026-09-01',
      source: 'pt',
    }));
    expect(applyClearanceSubstitution('jump_speed_a', clearances, '2026-09-02').workoutId).toBe('jump_speed_a');
    expect(applyClearanceSubstitution('lower_strength_a', [])).toMatchObject({
      workoutId: 'lower_strength_a_pt',
      blocked: false,
    });
  });
});

it('averages only available bodyweights in the trailing seven calendar days', () => {
  expect(rollingBodyWeightAverage([
    { date: '2026-07-01', bodyWeightLb: 200 },
    { date: '2026-07-04', bodyWeightLb: 185 },
    { date: '2026-07-08' },
    { date: '2026-07-10', bodyWeightLb: 184 },
  ], '2026-07-10')).toBe(184.5);
});

describe('double progression', () => {
  it('adds load only when every set reaches the range ceiling cleanly', () => {
    expect(suggestDoubleProgression([
      { reps: 10, loadLb: 100, rir: 2, quality: 'good' },
      { reps: 10, loadLb: 100, rir: 3, quality: 'great' },
    ], [6, 10], 5)).toMatchObject({ action: 'add_load', targetReps: 6, suggestedLoadLb: 105 });
  });

  it('holds progression after a yellow set', () => {
    expect(suggestDoubleProgression([
      { reps: 10, loadLb: 100, rir: 1, painDuring: 3 },
    ], [6, 10], 5).action).toBe('repeat');
  });
});

it('reduces Monday lower volume after Saturday pickup with a yellow response', () => {
  const pickup = {
    date: '2026-07-11',
    basketballMinutes: 60,
    postCheck: { ...greenCheck, signal: 'yellow' },
    sessionDifficulty: 'hard',
  } as SessionLog;
  expect(pickupMondayAdjustment('2026-07-13', [pickup])).toMatchObject({ reductionPercent: 25 });
  expect(pickupMondayAdjustment('2026-07-14', [pickup])).toBeUndefined();
});

describe('absolute timers', () => {
  const segment = { startSecond: 0, endSecond: 480 };
  const start = '2026-07-10T12:00:00.000Z';

  it('does not start another set with fewer than 20 seconds in the segment', () => {
    expect(timerState(start, '2026-07-10T12:07:39.000Z', segment).canStartSet).toBe(true);
    expect(timerState(start, '2026-07-10T12:07:40.000Z', segment).canStartSet).toBe(true);
    expect(timerState(start, '2026-07-10T12:07:40.001Z', segment).canStartSet).toBe(false);
    expect(timerState(start, '2026-07-10T12:07:41.000Z', segment).canStartSet).toBe(false);
  });

  it('hard-stops at 20 minutes and derives rest from its deadline', () => {
    expect(timerState(start, '2026-07-10T12:20:03.000Z', { startSecond: 900, endSecond: 1200 })).toMatchObject({
      overallRemainingSeconds: 0,
      segmentRemainingSeconds: 0,
      ended: true,
      canStartSet: false,
    });
    expect(restRemainingSeconds('2026-07-10T12:08:30.000Z', '2026-07-10T12:08:00.250Z')).toBe(30);
  });
});

describe('equipment resolution', () => {
  const cleared = (keys: string[]): ClearanceRecord[] =>
    keys.map((key, index) => ({ id: String(index), key: key as ClearanceRecord['key'], status: 'cleared', date: '2026-07-01', source: 'pt' }));
  const scoopToss = { id: 'med_ball_scoop_toss', equipmentIds: [['medicine_ball']] };

  it('requires one item from every equipment group', () => {
    expect(hasEquipmentFor({ equipmentIds: [] }, [])).toBe(true);
    expect(hasEquipmentFor({ equipmentIds: [['bench'], ['barbell', 'dumbbells']] }, ['bench', 'dumbbells'])).toBe(true);
    expect(hasEquipmentFor({ equipmentIds: [['bench'], ['barbell', 'dumbbells']] }, ['barbell'])).toBe(false);
  });

  it('keeps the planned exercise when its equipment is owned', () => {
    expect(resolveEquipmentSwap(exerciseById[scoopToss.id], ['medicine_ball'], [])).toBeUndefined();
  });

  it('substitutes missing-equipment exercises, respecting clearance', () => {
    // No medicine ball, no kettlebell: falls through kettlebell_swing to the bodyweight option.
    expect(resolveEquipmentSwap(exerciseById[scoopToss.id], [], [])?.id).toBe('shadow_power');
    // Kettlebell owned but heavy_hamstring not cleared: swing is gated, still bodyweight.
    expect(resolveEquipmentSwap(exerciseById[scoopToss.id], ['kettlebell'], [])?.id).toBe('shadow_power');
    // Kettlebell owned and cleared: the same-stimulus swing wins.
    expect(resolveEquipmentSwap(exerciseById[scoopToss.id], ['kettlebell'], cleared(['heavy_hamstring']))?.id).toBe('kettlebell_swing');
  });
});

describe('exercise sequencing', () => {
  it('alternates circuit exercises before resting, while single lifts rest between sets', () => {
    const circuit = exerciseSequence({ flow: 'circuit', targetRounds: 2, exercises: [{ exerciseId: 'a' }, { exerciseId: 'b' }, { exerciseId: 'c' }] } as WorkoutSegment);
    expect(circuit).toEqual([0, 1, 2, 0, 1, 2]);
    expect(circuit.map((_, step) => restAfterExerciseStep(circuit, step))).toEqual([false, false, true, false, false, true]);

    const single = exerciseSequence({ flow: 'single', exercises: [{ exerciseId: 'a', targetSets: 3 }] } as WorkoutSegment);
    expect(single).toEqual([0, 0, 0]);
    expect(single.map((_, step) => restAfterExerciseStep(single, step))).toEqual([true, true, true]);
  });
});

describe('warm-up and draft recovery', () => {
  it('credits only meaningful warm-up time', () => {
    expect(summarizeWarmup(300, 29)).toMatchObject({ completedSeconds: 0, status: 'skipped' });
    expect(summarizeWarmup(300, 30)).toMatchObject({ completedSeconds: 30, status: 'partial' });
    expect(summarizeWarmup(300, 400)).toMatchObject({ completedSeconds: 300, status: 'complete' });
    expect(summarizeWarmup(0, 30)).toMatchObject({ status: 'not_applicable' });
  });

  it('freezes phase, main, and rest clocks while a draft is paused', () => {
    const active = {
      id: 'draft',
      date: '2026-07-10',
      plannedWorkoutId: 'upper_strength_a',
      actualWorkoutId: 'upper_strength_a',
      practice: false,
      phase: 'main',
      phaseStartedAt: '2026-07-10T12:00:00.000Z',
      mainStartedAt: '2026-07-10T12:00:00.000Z',
      restUntil: '2026-07-10T12:05:00.000Z',
      currentSegmentIndex: 0,
      currentExerciseIndex: 0,
      sets: [],
      preCheck: greenCheck,
    } as ActiveSession;
    const paused = pauseActiveSession(active, '2026-07-10T12:02:00.000Z');
    const resumed = resumeActiveSession(paused, '2026-07-10T12:12:00.000Z');

    expect(resumed.pausedAt).toBeUndefined();
    expect(resumed.mainStartedAt).toBe('2026-07-10T12:10:00.000Z');
    expect(resumed.restUntil).toBe('2026-07-10T12:15:00.000Z');
    expect(timerState(resumed.mainStartedAt!, '2026-07-10T12:12:00.000Z', { startSecond: 0, endSecond: 480 }).overallElapsedSeconds).toBe(120);
  });

  it('skips ahead to the next segment boundary by shifting the main clock', () => {
    const segments = [
      { startSecond: 0, endSecond: 480 },
      { startSecond: 480, endSecond: 900 },
      { startSecond: 900, endSecond: 1200 },
    ];
    const active = {
      id: 'draft',
      date: '2026-07-10',
      plannedWorkoutId: 'upper_strength_a',
      actualWorkoutId: 'upper_strength_a',
      practice: false,
      phase: 'main',
      phaseStartedAt: '2026-07-10T12:00:00.000Z',
      mainStartedAt: '2026-07-10T12:00:00.000Z',
      restUntil: '2026-07-10T12:06:00.000Z',
      currentSegmentIndex: 0,
      currentExerciseIndex: 3,
      sets: [],
      preCheck: greenCheck,
    } as ActiveSession;

    const now = '2026-07-10T12:05:00.000Z';
    const skipped = skipToNextSegment(active, segments, now);
    expect(skipped.restUntil).toBeUndefined();
    expect(timerState(skipped.mainStartedAt!, now, segments[1]).overallElapsedSeconds).toBe(480);

    const lastSegmentNow = '2026-07-10T12:16:40.000Z';
    const finished = skipToNextSegment(active, segments, lastSegmentNow);
    expect(timerState(finished.mainStartedAt!, lastSegmentNow, segments[2])).toMatchObject({ overallRemainingSeconds: 0, ended: true });

    expect(skipToNextSegment({ ...active, mainStartedAt: undefined }, segments, now)).toEqual({ ...active, mainStartedAt: undefined });
  });
});
