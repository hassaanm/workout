import type {
  ActiveSession,
  AppDataV1,
  CheckpointLog,
  ClearanceKey,
  ClearanceRecord,
  DailyMetric,
  ExerciseDefinition,
  PTOverride,
  ProfileSettings,
  SessionLog,
  SetLog,
  SymptomCheck,
} from './types';

export const STORAGE_KEY = 'the-dunk-project:data:v1';

const CLEARANCE_KEYS: ClearanceKey[] = [
  'brace_required',
  'squat_loading',
  'deep_flexion',
  'heavy_hamstring',
  'jogging',
  'acceleration',
  'low_level_jump',
  'max_jump',
  'lateral_cutting',
  'basketball_practice',
  'pickup_contact',
];

const DEFAULT_EQUIPMENT = [
  'barbell',
  'plates',
  'squat_rack',
  'trap_bar',
  'dumbbells',
  'kettlebell',
  'bench',
  'pull_up_bar',
  'dip_station',
  'resistance_bands',
  'slant_board',
  'bosu',
  'basketball_court',
  'adjustable_rim',
];

export function defaultData(): AppDataV1 {
  const clearances: ClearanceRecord[] = CLEARANCE_KEYS.map((key) => ({
    id: `initial-${key}`,
    key,
    status: key === 'brace_required' || key === 'squat_loading' ? 'cleared_with_limits' : 'not_cleared',
    date: '2026-07-10',
    limits:
      key === 'brace_required'
        ? 'Use the prescribed brace for strenuous activity or exercise.'
        : key === 'squat_loading'
          ? 'PT-approved movements, loads, and ranges only.'
          : undefined,
    source: 'user',
  }));

  return {
    schemaVersion: 1,
    profile: {
      name: '',
      programStartDate: '2026-07-10',
      standingReachInches: 91,
      targetWeightRangeLb: [160, 165],
      theme: 'system',
      bodyWeightPrompt: true,
      upperBodyIncrementLb: 5,
      lowerBodyIncrementLb: 5,
      equipment: [...DEFAULT_EQUIPMENT],
      optionalAlerts: false,
      onboardingComplete: false,
    },
    clearances,
    ptOverrides: [],
    customExercises: [],
    sessions: [],
    metrics: [],
    checkpoints: [],
  };
}

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem'>;

function localStorageIfAvailable(): Storage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage;
}

export function loadData(storage: ReadStorage | undefined = localStorageIfAvailable()): AppDataV1 {
  if (!storage) return defaultData();
  const saved = storage.getItem(STORAGE_KEY);
  if (!saved) return defaultData();

  try {
    return parseBackup(saved);
  } catch (error) {
    console.warn('Ignoring invalid saved workout data. The stored copy was not changed.', error);
    return defaultData();
  }
}

export function saveData(data: AppDataV1, storage: WriteStorage | undefined = localStorageIfAvailable()): void {
  if (!storage) throw new Error('Browser storage is unavailable.');
  validateAppData(data);
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function updateData(
  updater: (current: AppDataV1) => AppDataV1 | void,
  storage: (ReadStorage & WriteStorage) | undefined = localStorageIfAvailable(),
): AppDataV1 {
  if (!storage) throw new Error('Browser storage is unavailable.');
  const current = loadData(storage);
  const next = updater(current) ?? current;
  saveData(next, storage);
  return next;
}

export function exportData(data: AppDataV1): string {
  validateAppData(data);
  return JSON.stringify(data, null, 2);
}

export function downloadBackup(data: AppDataV1): void {
  const url = URL.createObjectURL(new Blob([exportData(data)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `dunk-project-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export interface ImportPreview {
  data: AppDataV1;
  profileName: string;
  programStartDate: string;
  sessions: number;
  metrics: number;
  checkpoints: number;
  ptOverrides: number;
  lastActivityDate?: string;
}

export function parseBackup(text: string): AppDataV1 {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Backup is not valid JSON.');
  }
  validateAppData(value);
  return value;
}

export function previewImport(text: string): ImportPreview {
  const data = parseBackup(text);
  const dates = [
    ...data.sessions.map(({ date }) => date),
    ...data.metrics.map(({ date }) => date),
    ...data.checkpoints.map(({ date }) => date),
  ].sort();

  return {
    data,
    profileName: data.profile.name,
    programStartDate: data.profile.programStartDate,
    sessions: data.sessions.length,
    metrics: data.metrics.length,
    checkpoints: data.checkpoints.length,
    ptOverrides: data.ptOverrides.length,
    lastActivityDate: dates.at(-1),
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}

export async function storageEstimate(): Promise<StorageEstimate | undefined> {
  return navigator.storage?.estimate?.();
}

function validateAppData(value: unknown): asserts value is AppDataV1 {
  const data = record(value, 'backup');
  equal(data.schemaVersion, 1, 'schemaVersion');
  validateProfile(data.profile);
  array(data.clearances, 'clearances').forEach((item, index) => validateClearance(item, `clearances[${index}]`));
  array(data.ptOverrides, 'ptOverrides').forEach((item, index) => validatePTOverride(item, `ptOverrides[${index}]`));
  array(data.customExercises, 'customExercises').forEach((item, index) => validateExercise(item, `customExercises[${index}]`));
  array(data.sessions, 'sessions').forEach((item, index) => validateSession(item, `sessions[${index}]`));
  array(data.metrics, 'metrics').forEach((item, index) => validateMetric(item, `metrics[${index}]`));
  array(data.checkpoints, 'checkpoints').forEach((item, index) => validateCheckpoint(item, `checkpoints[${index}]`));
  if (data.activeSession !== undefined) validateActiveSession(data.activeSession, 'activeSession');
  optionalTimestamp(data.lastBackupAt, 'lastBackupAt');
}

function validateProfile(value: unknown): asserts value is ProfileSettings {
  const item = record(value, 'profile');
  string(item.name, 'profile.name');
  date(item.programStartDate, 'profile.programStartDate');
  number(item.standingReachInches, 'profile.standingReachInches', 30, 120);
  if (item.targetWeightRangeLb !== undefined) {
    const range = array(item.targetWeightRangeLb, 'profile.targetWeightRangeLb');
    if (range.length !== 2) fail('profile.targetWeightRangeLb must contain two values.');
    const low = number(range[0], 'profile.targetWeightRangeLb[0]', 40, 1000);
    const high = number(range[1], 'profile.targetWeightRangeLb[1]', 40, 1000);
    if (low > high) fail('profile.targetWeightRangeLb must be ordered low to high.');
  }
  oneOf(item.theme, ['system', 'light', 'dark'], 'profile.theme');
  boolean(item.bodyWeightPrompt, 'profile.bodyWeightPrompt');
  number(item.upperBodyIncrementLb, 'profile.upperBodyIncrementLb', 0.1, 100);
  number(item.lowerBodyIncrementLb, 'profile.lowerBodyIncrementLb', 0.1, 100);
  stringArray(item.equipment, 'profile.equipment');
  boolean(item.optionalAlerts, 'profile.optionalAlerts');
  boolean(item.onboardingComplete, 'profile.onboardingComplete');
}

function validateClearance(value: unknown, path: string): asserts value is ClearanceRecord {
  const item = record(value, path);
  string(item.id, `${path}.id`);
  oneOf(item.key, CLEARANCE_KEYS, `${path}.key`);
  oneOf(item.status, ['unknown', 'not_cleared', 'cleared_with_limits', 'cleared'], `${path}.status`);
  date(item.date, `${path}.date`);
  optionalString(item.limits, `${path}.limits`);
  oneOf(item.source, ['pt', 'orthopedist', 'user'], `${path}.source`);
}

function validatePTOverride(value: unknown, path: string): asserts value is PTOverride {
  const item = record(value, path);
  string(item.id, `${path}.id`);
  oneOf(item.slot, ['lower_a', 'lower_b'], `${path}.slot`);
  optionalString(item.exerciseId, `${path}.exerciseId`);
  optionalString(item.customName, `${path}.customName`);
  optionalNumber(item.sets, `${path}.sets`, 1, 100);
  for (const key of ['reps', 'range', 'tempo', 'braceInstruction', 'pinnedCue', 'demoUrl'] as const) {
    optionalString(item[key], `${path}.${key}`);
  }
  boolean(item.active, `${path}.active`);
}

function validateExercise(value: unknown, path: string): asserts value is ExerciseDefinition {
  const item = record(value, path);
  for (const key of ['id', 'name', 'category', 'purpose', 'demoSearchQuery'] as const) string(item[key], `${path}.${key}`);
  for (const key of [
    'equipment',
    'setup',
    'execution',
    'primaryCues',
    'shouldFeel',
    'shouldNotFeel',
    'commonMistakes',
    'regressionIds',
    'progressionIds',
    'bodyweightAlternativeIds',
  ] as const) stringArray(item[key], `${path}.${key}`);
  array(item.clearanceRequired, `${path}.clearanceRequired`).forEach((entry, index) =>
    oneOf(entry, CLEARANCE_KEYS, `${path}.clearanceRequired[${index}]`),
  );
  optionalString(item.defaultRepScheme, `${path}.defaultRepScheme`);
  optionalNumber(item.defaultRestSeconds, `${path}.defaultRestSeconds`, 0, 3600);
  if (item.loadKind !== undefined) oneOf(item.loadKind, ['total', 'per_hand', 'bodyweight', 'none'], `${path}.loadKind`);
  if (item.tracking !== undefined) oneOf(item.tracking, ['reps', 'duration', 'quality', 'distance'], `${path}.tracking`);
  for (const key of ['demoUrl', 'sourceName', 'lastVerifiedDate'] as const) optionalString(item[key], `${path}.${key}`);
  if (item.lastVerifiedDate !== undefined) date(item.lastVerifiedDate, `${path}.lastVerifiedDate`);
}

function validateSession(value: unknown, path: string): asserts value is SessionLog {
  const item = record(value, path);
  for (const key of ['id', 'plannedWorkoutId', 'actualWorkoutId'] as const) string(item[key], `${path}.${key}`);
  date(item.date, `${path}.date`);
  number(item.block, `${path}.block`, 1, 13);
  number(item.blockWeek, `${path}.blockWeek`, 1, 4);
  oneOf(item.completion, ['complete', 'partial', 'skipped', 'stopped'], `${path}.completion`);
  validateSymptoms(item.preCheck, `${path}.preCheck`);
  array(item.sets, `${path}.sets`).forEach((set, index) => validateSet(set, `${path}.sets[${index}]`));
  validateSymptoms(item.postCheck, `${path}.postCheck`);
  for (const key of ['bestTouchInches', 'lowRimHeightInches', 'lowRimMakes', 'lowRimAttempts', 'basketballMinutes'] as const) {
    optionalNumber(item[key], `${path}.${key}`, 0, 10000);
  }
  if (item.nextMorningSignal !== undefined) oneOf(item.nextMorningSignal, ['green', 'yellow', 'red'], `${path}.nextMorningSignal`);
  oneOf(item.sessionDifficulty, ['very_easy', 'easy', 'right', 'hard', 'too_hard'], `${path}.sessionDifficulty`);
  if (item.jumpQualityStayedCrisp !== undefined) boolean(item.jumpQualityStayedCrisp, `${path}.jumpQualityStayedCrisp`);
  optionalString(item.notes, `${path}.notes`);
  timestamp(item.startedAt, `${path}.startedAt`);
  timestamp(item.completedAt, `${path}.completedAt`);
}

function validateSet(value: unknown, path: string): asserts value is SetLog {
  const item = record(value, path);
  for (const key of ['id', 'segmentId', 'plannedExerciseId', 'actualExerciseId'] as const) string(item[key], `${path}.${key}`);
  number(item.setIndex, `${path}.setIndex`, 0, 1000);
  optionalNumber(item.reps, `${path}.reps`, 0, 10000);
  optionalNumber(item.loadLb, `${path}.loadLb`, 0, 10000);
  optionalNumber(item.durationSeconds, `${path}.durationSeconds`, 0, 86400);
  optionalNumber(item.rir, `${path}.rir`, 0, 20);
  optionalNumber(item.painDuring, `${path}.painDuring`, 0, 10);
  if (item.quality !== undefined) oneOf(item.quality, ['great', 'good', 'declining', 'stopped'], `${path}.quality`);
  if (item.formVideoRecorded !== undefined) boolean(item.formVideoRecorded, `${path}.formVideoRecorded`);
  timestamp(item.completedAt, `${path}.completedAt`);
}

function validateSymptoms(value: unknown, path: string): asserts value is SymptomCheck {
  const item = record(value, path);
  number(item.kneePain0to10, `${path}.kneePain0to10`, 0, 10);
  number(item.backPain0to10, `${path}.backPain0to10`, 0, 10);
  boolean(item.swelling, `${path}.swelling`);
  boolean(item.instability, `${path}.instability`);
  oneOf(item.tendonSoreness, ['none', 'mild', 'significant'], `${path}.tendonSoreness`);
  oneOf(item.readiness, ['poor', 'okay', 'good'], `${path}.readiness`);
  oneOf(item.braceUsed, ['yes', 'no', 'not_applicable'], `${path}.braceUsed`);
  if (item.neurologicalSymptoms !== undefined) boolean(item.neurologicalSymptoms, `${path}.neurologicalSymptoms`);
  oneOf(item.signal, ['green', 'yellow', 'red'], `${path}.signal`);
}

function validateMetric(value: unknown, path: string): asserts value is DailyMetric {
  const item = record(value, path);
  date(item.date, `${path}.date`);
  optionalNumber(item.bodyWeightLb, `${path}.bodyWeightLb`, 40, 1000);
  optionalNumber(item.sleepHours, `${path}.sleepHours`, 0, 24);
  optionalString(item.notes, `${path}.notes`);
}

function validateCheckpoint(value: unknown, path: string): asserts value is CheckpointLog {
  const item = record(value, path);
  string(item.id, `${path}.id`);
  date(item.date, `${path}.date`);
  number(item.block, `${path}.block`, 1, 13);
  for (const key of [
    'standingJumpInches',
    'approachTouchInches',
    'trapBarLoadLb',
    'trapBarReps',
    'pressLoadLb',
    'pressReps',
    'calfRaiseCount',
  ] as const) optionalNumber(item[key], `${path}.${key}`, 0, 10000);
  oneOf(item.symptomSignal, ['green', 'yellow', 'red'], `${path}.symptomSignal`);
  optionalString(item.notes, `${path}.notes`);
}

function validateActiveSession(value: unknown, path: string): asserts value is ActiveSession {
  const item = record(value, path);
  for (const key of ['id', 'plannedWorkoutId', 'actualWorkoutId'] as const) string(item[key], `${path}.${key}`);
  date(item.date, `${path}.date`);
  boolean(item.practice, `${path}.practice`);
  oneOf(item.phase, ['warmup', 'main', 'cooldown', 'checkout'], `${path}.phase`);
  timestamp(item.phaseStartedAt, `${path}.phaseStartedAt`);
  optionalTimestamp(item.mainStartedAt, `${path}.mainStartedAt`);
  number(item.currentSegmentIndex, `${path}.currentSegmentIndex`, 0, 1000);
  number(item.currentExerciseIndex, `${path}.currentExerciseIndex`, 0, 1000);
  optionalTimestamp(item.restUntil, `${path}.restUntil`);
  array(item.sets, `${path}.sets`).forEach((set, index) => validateSet(set, `${path}.sets[${index}]`));
  validateSymptoms(item.preCheck, `${path}.preCheck`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object.`);
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(`${path} must be an array.`);
  return value;
}

function string(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string') fail(`${path} must be a string.`);
}

function optionalString(value: unknown, path: string): void {
  if (value !== undefined) string(value, path);
}

function stringArray(value: unknown, path: string): void {
  array(value, path).forEach((entry, index) => string(entry, `${path}[${index}]`));
}

function boolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== 'boolean') fail(`${path} must be a boolean.`);
}

function number(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(`${path} must be a number from ${min} to ${max}.`);
  }
  return value;
}

function optionalNumber(value: unknown, path: string, min: number, max: number): void {
  if (value !== undefined) number(value, path, min, max);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): asserts value is T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) fail(`${path} has an unsupported value.`);
}

function equal(value: unknown, expected: number, path: string): void {
  if (value !== expected) fail(`${path} must be ${expected}.`);
}

function date(value: unknown, path: string): void {
  string(value, path);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) fail(`${path} must use YYYY-MM-DD.`);
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    fail(`${path} is not a valid calendar date.`);
  }
}

function timestamp(value: unknown, path: string): void {
  string(value, path);
  if (!value.includes('T') || !Number.isFinite(Date.parse(value))) fail(`${path} must be a valid timestamp.`);
}

function optionalTimestamp(value: unknown, path: string): void {
  if (value !== undefined) timestamp(value, path);
}

function fail(message: string): never {
  throw new Error(`Invalid backup: ${message}`);
}
