import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  applyClearanceSubstitution,
  classifySymptoms,
  differenceInCalendarDays,
  pickupMondayAdjustment,
  resolvePlannedDay,
  restRemainingSeconds,
  rollingBodyWeightAverage,
  suggestDoubleProgression,
  timerState,
} from './domain';
import type { ClearanceRecord, SessionLog, SymptomCheck } from './types';

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
