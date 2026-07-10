export type Theme = 'system' | 'light' | 'dark';
export type ClearanceStatus = 'unknown' | 'not_cleared' | 'cleared_with_limits' | 'cleared';
export type SymptomSignal = 'green' | 'yellow' | 'red';
export type SegmentMode = 'mandatory_prep' | 'time_boxed_move_on' | 'quality_limited' | 'clinician_prescribed' | 'optional_if_time';
export type SegmentFlow = 'single' | 'superset' | 'circuit' | 'intervals';

export type ClearanceKey =
  | 'brace_required'
  | 'squat_loading'
  | 'deep_flexion'
  | 'heavy_hamstring'
  | 'jogging'
  | 'acceleration'
  | 'low_level_jump'
  | 'max_jump'
  | 'lateral_cutting'
  | 'basketball_practice'
  | 'pickup_contact';

export interface ClearanceRecord {
  id: string;
  key: ClearanceKey;
  status: ClearanceStatus;
  date: string;
  limits?: string;
  source: 'pt' | 'orthopedist' | 'user';
}

export interface ExerciseDefinition {
  id: string;
  name: string;
  category: string;
  equipment: string[];
  purpose: string;
  setup: string[];
  execution: string[];
  primaryCues: string[];
  shouldFeel: string[];
  shouldNotFeel: string[];
  commonMistakes: string[];
  regressionIds: string[];
  progressionIds: string[];
  bodyweightAlternativeIds: string[];
  clearanceRequired: ClearanceKey[];
  defaultRepScheme?: string;
  defaultRestSeconds?: number;
  loadKind?: 'total' | 'per_hand' | 'bodyweight' | 'none';
  tracking?: 'reps' | 'duration' | 'quality' | 'distance';
  demoUrl?: string;
  demoSearchQuery: string;
  sourceName?: string;
  lastVerifiedDate?: string;
}

export interface SegmentExercise {
  exerciseId: string;
  label?: string;
  targetSets?: number;
  repRange?: [number, number];
  repsText?: string;
  durationSeconds?: number;
  perSide?: boolean;
}

export interface WorkoutSegment {
  id: string;
  label: string;
  startSecond: number;
  endSecond: number;
  mode: SegmentMode;
  flow: SegmentFlow;
  exercises: SegmentExercise[];
  targetRounds?: number;
  restSeconds?: number;
  notes: string[];
  substitutionWorkoutId?: string;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  shortName: string;
  purpose: string;
  mainDurationSeconds: 1200;
  warmup: 'prep_5' | 'compressed_3' | 'none';
  cooldown: 'cooldown_3' | 'none';
  segments: WorkoutSegment[];
  stressTags: string[];
  clearanceRequired: ClearanceKey[];
  nonImpactWorkoutId?: string;
}

export interface BlockDefinition {
  number: number;
  title: string;
  theme: string;
  objective: string;
  guardrail: string;
  exitTarget: string;
  workoutOverrides?: Partial<Record<number, string>>;
}

export interface SymptomCheck {
  kneePain0to10: number;
  backPain0to10: number;
  swelling: boolean;
  instability: boolean;
  tendonSoreness: 'none' | 'mild' | 'significant';
  readiness: 'poor' | 'okay' | 'good';
  braceUsed: 'yes' | 'no' | 'not_applicable';
  neurologicalSymptoms?: boolean;
  signal: SymptomSignal;
}

export interface SetLog {
  id: string;
  segmentId: string;
  plannedExerciseId: string;
  actualExerciseId: string;
  setIndex: number;
  reps?: number;
  loadLb?: number;
  durationSeconds?: number;
  rir?: number;
  quality?: 'great' | 'good' | 'declining' | 'stopped';
  painDuring?: number;
  formVideoRecorded?: boolean;
  completedAt: string;
}

export interface SessionLog {
  id: string;
  date: string;
  plannedWorkoutId: string;
  actualWorkoutId: string;
  block: number;
  blockWeek: number;
  completion: 'complete' | 'partial' | 'skipped' | 'stopped';
  preCheck: SymptomCheck;
  sets: SetLog[];
  bestTouchInches?: number;
  lowRimHeightInches?: number;
  lowRimMakes?: number;
  lowRimAttempts?: number;
  basketballMinutes?: number;
  postCheck: SymptomCheck;
  nextMorningSignal?: SymptomSignal;
  sessionDifficulty: 'very_easy' | 'easy' | 'right' | 'hard' | 'too_hard';
  jumpQualityStayedCrisp?: boolean;
  warmup?: WarmupLog;
  notes?: string;
  startedAt: string;
  completedAt: string;
}

export interface WarmupLog {
  plannedSeconds: number;
  completedSeconds: number;
  status: 'not_applicable' | 'skipped' | 'partial' | 'complete';
}

export interface DailyMetric {
  date: string;
  bodyWeightLb?: number;
  sleepHours?: number;
  notes?: string;
}

export interface CheckpointLog {
  id: string;
  date: string;
  block: number;
  standingJumpInches?: number;
  approachTouchInches?: number;
  trapBarLoadLb?: number;
  trapBarReps?: number;
  pressLoadLb?: number;
  pressReps?: number;
  calfRaiseCount?: number;
  symptomSignal: SymptomSignal;
  notes?: string;
}

export interface PTOverride {
  id: string;
  slot: 'lower_a' | 'lower_b';
  exerciseId?: string;
  customName?: string;
  sets?: number;
  reps?: string;
  range?: string;
  tempo?: string;
  braceInstruction?: string;
  pinnedCue?: string;
  demoUrl?: string;
  active: boolean;
}

export interface ProfileSettings {
  name: string;
  programStartDate: string;
  standingReachInches: number;
  targetWeightRangeLb?: [number, number];
  theme: Theme;
  bodyWeightPrompt: boolean;
  upperBodyIncrementLb: number;
  lowerBodyIncrementLb: number;
  equipment: string[];
  optionalAlerts: boolean;
  onboardingComplete: boolean;
}

export interface ActiveSession {
  id: string;
  date: string;
  plannedWorkoutId: string;
  actualWorkoutId: string;
  practice: boolean;
  phase: 'warmup' | 'main' | 'cooldown' | 'checkout';
  phaseStartedAt: string;
  warmupStartedAt?: string;
  warmup?: WarmupLog;
  mainStartedAt?: string;
  pausedAt?: string;
  currentSegmentIndex: number;
  currentExerciseIndex: number;
  restUntil?: string;
  bodyWeightLb?: number;
  exerciseSwaps?: Record<string, string>;
  qualityStoppedSegmentIds?: string[];
  sets: SetLog[];
  preCheck: SymptomCheck;
}

export interface AppDataV1 {
  schemaVersion: 1;
  profile: ProfileSettings;
  clearances: ClearanceRecord[];
  ptOverrides: PTOverride[];
  customExercises: ExerciseDefinition[];
  sessions: SessionLog[];
  metrics: DailyMetric[];
  checkpoints: CheckpointLog[];
  activeSession?: ActiveSession;
  lastBackupAt?: string;
}

export interface PlannedDay {
  date: string;
  dayIndex: number;
  block: number;
  blockWeek: number;
  weekInProgram: number;
  workoutId: string;
  plannedWorkoutId: string;
  isFinalTest: boolean;
  isBeforeProgram: boolean;
  isAfterProgram: boolean;
  substitutionReason?: string;
}
