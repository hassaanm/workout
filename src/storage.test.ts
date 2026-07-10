import { describe, expect, it, vi } from 'vitest';
import { toLocalDate } from './domain';
import { STORAGE_KEY, defaultData, exportData, loadData, parseBackup, previewImport, saveData, updateData } from './storage';
import type { AppDataV1, SymptomCheck } from './types';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('workout storage', () => {
  it('starts with editable conservative defaults', () => {
    const data = defaultData();

    expect(data.profile.programStartDate).toBe(toLocalDate());
    expect(data.profile.standingReachInches).toBe(91);
    expect(data.clearances.find(({ key }) => key === 'max_jump')?.status).toBe('not_cleared');
    expect(data.clearances.find(({ key }) => key === 'squat_loading')?.status).toBe('cleared_with_limits');
  });

  it('round trips one namespaced document', () => {
    const storage = new MemoryStorage();
    const data = defaultData();
    data.profile.name = 'Hassaan';
    saveData(data, storage);

    expect(loadData(storage)).toEqual(data);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual(data);
  });

  it('updates the current document', () => {
    const storage = new MemoryStorage();

    const updated = updateData((data) => {
      data.profile.theme = 'dark';
    }, storage);

    expect(updated.profile.theme).toBe('dark');
    expect(loadData(storage).profile.theme).toBe('dark');
  });

  it('round trips a fully populated document through export and import', () => {
    const check: SymptomCheck = {
      kneePain0to10: 1,
      backPain0to10: 0,
      swelling: false,
      instability: false,
      tendonSoreness: 'mild',
      readiness: 'okay',
      braceUsed: 'yes',
      neurologicalSymptoms: false,
      signal: 'yellow',
    };
    const data: AppDataV1 = {
      ...defaultData(),
      ptOverrides: [{ id: 'pt-1', slot: 'lower_a', exerciseId: 'supported_split_squat', sets: 3, reps: '8', range: 'to chair', tempo: '3-1-1', braceInstruction: 'Brace on', pinnedCue: 'Knee tracks', demoUrl: 'https://example.com', active: true }],
      customExercises: [{
        id: 'custom-1', name: 'Custom move', category: 'rehab', equipment: ['band'], purpose: 'Test', setup: ['Stand'], execution: ['Move'],
        primaryCues: ['Cue'], shouldFeel: ['Muscles'], shouldNotFeel: ['Pain'], commonMistakes: ['Rushing'], regressionIds: [], progressionIds: [],
        bodyweightAlternativeIds: [], clearanceRequired: ['squat_loading'], defaultRepScheme: '8-12', defaultRestSeconds: 60, loadKind: 'total',
        tracking: 'reps', demoSearchQuery: 'custom move', sourceName: 'PT', lastVerifiedDate: '2026-07-01',
      }],
      sessions: [{
        id: 'session-1', date: '2026-07-11', plannedWorkoutId: 'upper_strength_b', actualWorkoutId: 'upper_strength_b', block: 1, blockWeek: 1,
        completion: 'complete', preCheck: check, postCheck: check, nextMorningSignal: 'green', sessionDifficulty: 'right',
        jumpQualityStayedCrisp: true, warmup: { plannedSeconds: 300, completedSeconds: 180, status: 'partial' }, notes: 'Solid',
        bestTouchInches: 110, basketballMinutes: 20, startedAt: '2026-07-11T12:00:00.000Z', completedAt: '2026-07-11T12:30:00.000Z',
        sets: [{ id: 'set-1', segmentId: 'upper_b_press_pull', plannedExerciseId: 'overhead_press', actualExerciseId: 'pike_pushup', setIndex: 0, reps: 8, loadLb: 95, rir: 2, quality: 'good', painDuring: 0, formVideoRecorded: true, completedAt: '2026-07-11T12:05:00.000Z' }],
      }],
      metrics: [{ date: '2026-07-11', bodyWeightLb: 184.5, sleepHours: 7.5, notes: 'ok' }],
      checkpoints: [{ id: 'cp-1', date: '2026-08-02', block: 1, standingJumpInches: 20, trapBarLoadLb: 185, trapBarReps: 5, symptomSignal: 'green', notes: 'baseline' }],
      activeSession: {
        id: 'active-1', date: '2026-07-12', plannedWorkoutId: 'armor_zone2', actualWorkoutId: 'armor_zone2', practice: false, phase: 'main',
        phaseStartedAt: '2026-07-12T12:05:00.000Z', warmupStartedAt: '2026-07-12T12:00:00.000Z', warmup: { plannedSeconds: 300, completedSeconds: 300, status: 'complete' },
        mainStartedAt: '2026-07-12T12:05:00.000Z', pausedAt: '2026-07-12T12:10:00.000Z', restUntil: '2026-07-12T12:11:00.000Z',
        currentSegmentIndex: 1, currentExerciseIndex: 2, bodyWeightLb: 184, exerciseSwaps: { 'armor_carry:suitcase_carry': 'side_plank' },
        qualityStoppedSegmentIds: ['armor_power'], preCheck: check,
        sets: [{ id: 'set-2', segmentId: 'armor_carry', plannedExerciseId: 'suitcase_carry', actualExerciseId: 'side_plank', setIndex: 0, durationSeconds: 30, completedAt: '2026-07-12T12:08:00.000Z' }],
      },
      lastBackupAt: '2026-07-11T13:00:00.000Z',
    };

    expect(parseBackup(exportData(data))).toEqual(data);
  });

  it('previews a valid import without writing it', () => {
    const storage = new MemoryStorage();
    const data = defaultData();
    data.profile.name = 'Backup profile';
    data.metrics.push({ date: '2026-07-11', bodyWeightLb: 184.5 });

    const preview = previewImport(exportData(data));

    expect(preview).toMatchObject({ profileName: 'Backup profile', metrics: 1, lastActivityDate: '2026-07-11' });
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it.each([
    ['wrong schema', { ...defaultData(), schemaVersion: 2 }],
    ['impossible date', { ...defaultData(), profile: { ...defaultData().profile, programStartDate: '2026-02-30' } }],
    ['out of range number', { ...defaultData(), metrics: [{ date: '2026-07-11', bodyWeightLb: -1 }] }],
    ['bad core shape', { ...defaultData(), sessions: {} }],
  ])('rejects %s', (_label, value) => {
    expect(() => parseBackup(JSON.stringify(value))).toThrow('Invalid backup');
  });

  it('keeps a malformed saved copy untouched while loading defaults', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{bad json');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(loadData(storage)).toEqual(defaultData());
    expect(storage.getItem(STORAGE_KEY)).toBe('{bad json');
  });
});
