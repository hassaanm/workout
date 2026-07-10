import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { exercises } from './data/exercises';
import { exercisePhotoIds } from './data/exercisePhotos';
import { blocks, workouts } from './data/program';
import {
  addCalendarDays,
  classifySymptoms,
  exerciseSequence,
  latestClearances,
  pauseActiveSession,
  pickupMondayAdjustment,
  resolvePlannedDay,
  restRemainingSeconds,
  restAfterExerciseStep,
  resumeActiveSession,
  skipToNextSegment,
  summarizeWarmup,
  timerState,
  toLocalDate,
} from './domain';
import { loadData, saveData } from './storage';
import type {
  ActiveSession,
  AppDataV1,
  CheckpointLog,
  ClearanceRecord,
  ExerciseDefinition,
  SessionLog,
  SetLog,
  SymptomCheck,
  WorkoutSegment,
  WorkoutTemplate,
} from './types';
import { OnboardingScreen, ProgressScreen, SettingsScreen } from './SecondaryScreens';

type View = 'today' | 'progress' | 'settings';
type CheckinIntent = { practice: boolean } | null;

const exerciseMap = new Map(exercises.map((exercise) => [exercise.id, exercise]));
const workoutMap = new Map(workouts.map((workout) => [workout.id, workout]));

const emptyCheck: SymptomCheck = {
  kneePain0to10: 0,
  backPain0to10: 0,
  swelling: false,
  instability: false,
  tendonSoreness: 'none',
  readiness: 'good',
  braceUsed: 'yes',
  neurologicalSymptoms: false,
  signal: 'green',
};

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }) {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, options).format(new Date(year, month - 1, day));
}

function plannedWarmupSeconds(warmup: WorkoutTemplate['warmup']) {
  return warmup === 'prep_5' ? 300 : warmup === 'compressed_3' ? 180 : 0;
}

function latestSessionForExercise(data: AppDataV1, exerciseId: string, beforeDate?: string) {
  return [...data.sessions]
    .filter((session) => !beforeDate || session.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .find((session) => session.sets.some((set) => set.actualExerciseId === exerciseId));
}

function workoutFor(id: string) {
  return workoutMap.get(id) ?? workouts[0];
}

function exerciseFor(id: string) {
  return exerciseMap.get(id) ?? exercises[0];
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

export default function App() {
  const [data, setData] = useState<AppDataV1>(() => loadData());
  const [view, setView] = useState<View>('today');
  const [selectedDate, setSelectedDate] = useState(toLocalDate());
  const [checkinIntent, setCheckinIntent] = useState<CheckinIntent>(null);
  const [practiceSession, setPracticeSession] = useState<ActiveSession>();
  const [playerOpen, setPlayerOpen] = useState(false);
  const [toast, setToast] = useState<string>();
  const [editingSession, setEditingSession] = useState<SessionLog>();
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [discardDraftOpen, setDiscardDraftOpen] = useState(false);
  const [preflightSwaps, setPreflightSwaps] = useState<Record<string, string>>({});
  const [previewExercise, setPreviewExercise] = useState<{ planned: ExerciseDefinition; selected: ExerciseDefinition; swapKey: string }>();
  const [preflightSwapFor, setPreflightSwapFor] = useState<{ planned: ExerciseDefinition; selected: ExerciseDefinition; swapKey: string }>();
  const activeSession = practiceSession ?? data.activeSession;

  const commit = (next: AppDataV1 | ((current: AppDataV1) => AppDataV1)) => {
    setData((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      try {
        saveData(value);
      } catch (error) {
        setToast(error instanceof Error ? error.message : 'Could not save locally.');
        return current;
      }
      return value;
    });
  };

  const updateActive = (next: ActiveSession | undefined) => {
    if (practiceSession) setPracticeSession(next);
    else commit((current) => ({ ...current, activeSession: next }));
  };

  useEffect(() => {
    const root = document.documentElement;
    if (data.profile.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = data.profile.theme;
    const dark = data.profile.theme === 'dark' || (data.profile.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#11130f' : '#f3efe6');
  }, [data.profile.theme]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(undefined), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (!data.profile.onboardingComplete) {
    return <OnboardingScreen data={data} onComplete={commit} />;
  }

  if (activeSession?.phase === 'checkout' && playerOpen) {
    return (
      <CheckoutScreen
        active={activeSession}
        data={data}
        onBack={() => updateActive({ ...activeSession, phase: 'cooldown', phaseStartedAt: new Date().toISOString() })}
        onSave={(session, metric) => {
          if (activeSession.practice) {
            setPracticeSession(undefined);
            setToast('Practice complete — nothing was saved.');
          } else {
            if (!session) return;
            commit((current) => ({
              ...current,
              sessions: [...current.sessions.filter((item) => item.id !== session.id), session],
              metrics: metric ? [...current.metrics.filter((item) => item.date !== metric.date), metric] : current.metrics,
              activeSession: undefined,
            }));
            setToast('Workout saved. Stopping on time counts.');
          }
          setPlayerOpen(false);
          setView('today');
          setSelectedDate(toLocalDate());
        }}
      />
    );
  }

  if (activeSession && playerOpen) {
    return (
      <WorkoutPlayer
        active={activeSession}
        data={data}
        onChange={updateActive}
        onToast={setToast}
        onLeave={() => setPlayerOpen(false)}
      />
    );
  }

  return (
    <>
      <div className="app-shell">
        <Masthead data={data} onTheme={() => commit((current) => ({ ...current, profile: { ...current.profile, theme: current.profile.theme === 'dark' ? 'light' : 'dark' } }))} />
        {view === 'today' && (
          <TodayDashboard
            data={data}
            selectedDate={selectedDate}
            onDate={(date) => { setSelectedDate(date); setPreflightSwaps({}); }}
            onStart={() => setCheckinIntent({ practice: false })}
            preflightSwaps={preflightSwaps}
            onPreviewExercise={(planned, swapKey) => setPreviewExercise({ planned, selected: exerciseFor(preflightSwaps[swapKey] ?? planned.id), swapKey })}
            activeSession={data.activeSession}
            onResumeDraft={() => {
              if (!data.activeSession) return;
              updateActive(resumeActiveSession(data.activeSession));
              setPlayerOpen(true);
            }}
            onFinishDraft={() => {
              if (!data.activeSession) return;
              updateActive({ ...data.activeSession, phase: 'checkout', phaseStartedAt: new Date().toISOString(), pausedAt: undefined });
              setPlayerOpen(true);
            }}
            onDiscardDraft={() => setDiscardDraftOpen(true)}
            onEditSession={setEditingSession}
            onCheckpoint={() => setCheckpointOpen(true)}
            onNextMorning={(session, signal) => commit((current) => ({ ...current, sessions: current.sessions.map((item) => item.id === session.id ? { ...item, nextMorningSignal: signal } : item) }))}
          />
        )}
        {view === 'progress' && <ProgressScreen data={data} throughDate={selectedDate} />}
        {view === 'settings' && (
          <SettingsScreen
            data={data}
            onChange={commit}
            onToast={setToast}
            onStartPractice={() => { setView('today'); setSelectedDate(toLocalDate()); setCheckinIntent({ practice: true }); }}
          />
        )}
      </div>
      <BottomNav view={view} onChange={setView} />
      {checkinIntent && (
        <CheckinScreen
          data={data}
          date={selectedDate}
          practice={checkinIntent.practice}
          exerciseSwaps={preflightSwaps}
          onClose={() => setCheckinIntent(null)}
          onBegin={(active) => {
            setCheckinIntent(null);
            setPreflightSwaps({});
            if (active.practice) setPracticeSession(active);
            else commit((current) => ({ ...current, activeSession: active }));
            setPlayerOpen(true);
          }}
        />
      )}
      {editingSession && <EditSessionSheet session={editingSession} onClose={() => setEditingSession(undefined)} onSave={(updated) => { commit((current) => ({ ...current, sessions: current.sessions.map((item) => item.id === updated.id ? updated : item) })); setEditingSession(undefined); setToast('Log updated.'); }} onDelete={() => { commit((current) => ({ ...current, sessions: current.sessions.filter((item) => item.id !== editingSession.id) })); setEditingSession(undefined); setToast('Workout log deleted.'); }} />}
      {checkpointOpen && <CheckpointSheet data={data} date={selectedDate} onClose={() => setCheckpointOpen(false)} onSave={(checkpoint) => { commit((current) => ({ ...current, checkpoints: [...current.checkpoints, checkpoint] })); setCheckpointOpen(false); setToast('Checkpoint recorded.'); }} />}
      {discardDraftOpen && <DiscardDraftSheet onClose={() => setDiscardDraftOpen(false)} onDiscard={() => { updateActive(undefined); setDiscardDraftOpen(false); setToast('Unsaved workout discarded.'); }} />}
      {previewExercise && <ExerciseDetailSheet exercise={previewExercise.selected} data={data} onClose={() => setPreviewExercise(undefined)} onSwap={() => { setPreflightSwapFor(previewExercise); setPreviewExercise(undefined); }} />}
      {preflightSwapFor && <SwapSheet planned={preflightSwapFor.planned} selected={preflightSwapFor.selected} clearances={data.clearances} onClose={() => setPreflightSwapFor(undefined)} onSelect={(selected) => { setPreflightSwaps((current) => ({ ...current, [preflightSwapFor.swapKey]: selected.id })); setPreflightSwapFor(undefined); }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function Masthead({ data, onTheme }: { data: AppDataV1; onTheme: () => void }) {
  return (
    <header className="masthead">
      <div className="brand">
        <img className="brand-mark" src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
        <div>
          <div className="brand-name">The Dunk Project</div>
          <div className="brand-subtitle">Twenty focused minutes</div>
        </div>
      </div>
      <button className="icon-button" aria-label={`Use ${data.profile.theme === 'dark' ? 'light' : 'dark'} theme`} onClick={onTheme}>
        <Icon name={data.profile.theme === 'dark' ? 'sun' : 'moon'} />
      </button>
    </header>
  );
}

function TodayDashboard({ data, selectedDate, onDate, onStart, preflightSwaps, onPreviewExercise, activeSession, onResumeDraft, onFinishDraft, onDiscardDraft, onEditSession, onCheckpoint, onNextMorning }: {
  data: AppDataV1;
  selectedDate: string;
  onDate: (date: string) => void;
  onStart: () => void;
  preflightSwaps: Record<string, string>;
  onPreviewExercise: (planned: ExerciseDefinition, swapKey: string) => void;
  activeSession?: ActiveSession;
  onResumeDraft: () => void;
  onFinishDraft: () => void;
  onDiscardDraft: () => void;
  onEditSession: (session: SessionLog) => void;
  onCheckpoint: () => void;
  onNextMorning: (session: SessionLog, signal: 'green' | 'yellow' | 'red') => void;
}) {
  const dateInput = useRef<HTMLInputElement>(null);
  const today = toLocalDate();
  const day = resolvePlannedDay(selectedDate, data.profile.programStartDate, data.clearances);
  const workout = workoutFor(day.workoutId);
  const plannedWorkout = workoutFor(day.plannedWorkoutId);
  const block = blocks.find((item) => item.number === day.block) ?? blocks[0];
  const session = data.sessions.find((item) => item.date === selectedDate);
  const lastMatching = [...data.sessions].filter((item) => item.date < selectedDate && item.actualWorkoutId === workout.id).sort((a, b) => b.date.localeCompare(a.date))[0];
  const mondayAdjustment = pickupMondayAdjustment(selectedDate, data.sessions);
  const yesterday = data.sessions.find((item) => item.date === addCalendarDays(today, -1) && !item.nextMorningSignal);
  const checkpointDone = data.checkpoints.some((item) => item.block === day.block);
  const canStart = selectedDate === today && !session && !activeSession && !day.isBeforeProgram && !day.isAfterProgram;

  return (
    <main>
      <div className="date-nav">
        <button className="icon-button" aria-label="Previous day" onClick={() => onDate(addCalendarDays(selectedDate, -1))}><Icon name="chevron-left" /></button>
        <div className="date-title">
          <button onClick={() => dateInput.current?.showPicker()}>
            <h1>{selectedDate === today ? 'Today' : formatDate(selectedDate, { weekday: 'long' })}</h1>
            <p>{formatDate(selectedDate, { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </button>
          <input ref={dateInput} className="native-date" type="date" value={selectedDate} onChange={(event) => onDate(event.target.value)} />
        </div>
        <button className="icon-button" aria-label="Next day" onClick={() => onDate(addCalendarDays(selectedDate, 1))}><Icon name="chevron-right" /></button>
      </div>

      <div className="status-strip" aria-label="Program status">
        <span className="pill blue">Block {day.block} · Week {day.blockWeek}</span>
        <span className="pill">Week {day.weekInProgram || '—'} of 53</span>
        <span className={`pill ${workout.warmup === 'prep_5' ? 'amber' : ''}`}>{workout.warmup === 'prep_5' ? '+5 min prep' : workout.warmup === 'compressed_3' ? '+3 min ramp' : '20 min'}</span>
      </div>

      {day.isBeforeProgram && <div className="notice blue"><strong>Program preview.</strong> Your first orientation session begins {formatDate(data.profile.programStartDate)}.</div>}
      {day.isAfterProgram && <div className="notice blue"><strong>The year is complete.</strong> Review the work, keep what served you, and choose the next block with your clinician.</div>}
      {day.substitutionReason && <div className="notice amber"><strong>Calendar plan adjusted.</strong> {day.substitutionReason}. Today uses {workout.name} instead of {plannedWorkout.name}.</div>}
      {mondayAdjustment?.reductionPercent ? <div className="notice amber"><strong>Saturday load carried forward.</strong> Reduce today’s lower-body volume by {mondayAdjustment.reductionPercent}%.</div> : null}
      {activeSession && (
        <section className="draft-card" aria-label="Workout draft">
          <div>
            <div className="eyebrow">{activeSession.pausedAt ? 'Paused draft' : 'Workout still running'}</div>
            <h2>{workoutFor(activeSession.actualWorkoutId).shortName}</h2>
            <p>{activeSession.phase === 'checkout' ? 'Finish the optional check-out, save partial, or discard it.' : activeSession.pausedAt ? 'The timer is paused until you resume.' : 'The timer continued while the app was away.'}</p>
          </div>
          <div className="draft-actions">
            <button className="primary-button" onClick={activeSession.phase === 'checkout' ? onFinishDraft : onResumeDraft}>{activeSession.phase === 'checkout' ? 'Finish check-out' : 'Resume'}</button>
            <button className="ghost-button" onClick={onDiscardDraft}>Discard</button>
          </div>
        </section>
      )}

      <section className="hero-card top-space">
        <div className="eyebrow">{day.isFinalTest ? 'Final test day' : block.theme}</div>
        <h2>{workout.name}</h2>
        <p className="hero-purpose">{workout.purpose}</p>
        <div className="hero-meta">
          <div className="hero-stat"><strong>20:00</strong><span>Main clock</span></div>
          <div className="hero-stat"><strong>{workout.segments.length}</strong><span>Segments</span></div>
          <div className="hero-stat"><strong>{workout.stressTags.includes('high-impact') ? 'High' : workout.stressTags.includes('low') ? 'Low' : 'Mod'}</strong><span>Stress</span></div>
        </div>
        <div className="hero-action">
          {activeSession ? (
            <button className="primary-button" onClick={activeSession.phase === 'checkout' ? onFinishDraft : onResumeDraft}>Resume workout draft</button>
          ) : session ? (
            <button className="primary-button" onClick={() => onEditSession(session)}><Icon name="check" /> {session.completion === 'complete' ? 'Workout complete' : `Logged ${session.completion}`}</button>
          ) : selectedDate < today ? (
            <button className="primary-button" disabled>Missed · resume with today</button>
          ) : selectedDate > today ? (
            <button className="primary-button" disabled>Future preview</button>
          ) : (
            <button className="primary-button" disabled={!canStart} onClick={onStart}><Icon name="play" /> Start workout</button>
          )}
        </div>
      </section>

      {yesterday && selectedDate === today && (
        <section className="section">
          <div className="notice blue">
            <strong>Quick recovery check.</strong> How did you feel the morning after {workoutFor(yesterday.actualWorkoutId).shortName}?
            <div className="choice-row">
              <button className="choice-button" onClick={() => onNextMorning(yesterday, 'green')}>Back to baseline</button>
              <button className="choice-button" onClick={() => onNextMorning(yesterday, 'yellow')}>Mildly worse</button>
              <button className="choice-button" onClick={() => onNextMorning(yesterday, 'red')}>Worsening</button>
            </div>
          </div>
        </section>
      )}

      {day.blockWeek === 4 && !checkpointDone && !day.isBeforeProgram && (
        <section className="section">
          <div className="notice blue row">
            <div><strong>Deload checkpoint is available.</strong><br />Only test while warm, green, and cleared.</div>
            <button className="secondary-button" onClick={onCheckpoint}>Record</button>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-heading"><h2>Today’s field card</h2><span className="mini-label">Tap to preview or swap</span></div>
        <div className="card">
          {workout.segments.map((segment) => (
            <div className="segment-preview" key={segment.id}>
              <div className="segment-time">{Math.floor(segment.startSecond / 60)}–{Math.floor(segment.endSecond / 60)}</div>
              <div>
                <div className="segment-name">{segment.label}</div>
                <div className="preview-exercises">{segment.exercises.map((item) => {
                  const planned = exerciseFor(item.exerciseId);
                  const swapKey = `${segment.id}:${planned.id}`;
                  const selected = exerciseFor(preflightSwaps[swapKey] ?? planned.id);
                  const dose = item.repsText ?? (item.repRange ? `${item.repRange[0]}–${item.repRange[1]}${item.perSide ? ' / side' : ''}` : item.durationSeconds ? `${item.durationSeconds} sec` : selected.defaultRepScheme ?? 'quality reps');
                  const sets = item.targetSets ?? segment.targetRounds;
                  return <button className="preview-exercise" key={planned.id} onClick={() => onPreviewExercise(planned, swapKey)}><span><strong>{selected.name}</strong><small>{sets ? `${sets} ${segment.flow === 'single' ? 'sets' : 'rounds'} · ` : ''}{dose}</small></span>{selected.id !== planned.id && <em>swapped</em>}<Icon name="chevron-right" /></button>;
                })}</div>
              </div>
              <span className="pill">{segment.mode === 'quality_limited' ? 'quality' : segment.flow}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-heading"><h2>Last time</h2>{lastMatching && <span className="mini-label">{formatDate(lastMatching.date, { month: 'short', day: 'numeric' })}</span>}</div>
        <div className="card">
          {lastMatching?.sets.length ? lastMatching.sets.slice(0, 4).map((set) => (
            <div className="row" key={set.id}>
              <div className="row-main"><div className="row-title">{exerciseFor(set.actualExerciseId).name}</div><div className="row-copy">Set {set.setIndex + 1} · {set.rir != null ? `${set.rir} RIR` : set.quality ?? 'logged'}</div></div>
              <div className="row-value">{set.loadLb ? `${set.loadLb} lb × ` : ''}{set.reps ?? (set.durationSeconds ? `${set.durationSeconds}s` : '✓')}</div>
            </div>
          )) : <div className="empty-state"><strong>No matching session yet.</strong><p>Your last load, reps, and quality will appear here.</p></div>}
        </div>
      </section>

      <section className="section">
        <div className="section-heading"><h2>Block intent</h2></div>
        <div className="card">
          <div className="row-title">{block.title}</div>
          <p className="row-copy">{block.objective}</p>
          <div className="divider" />
          <div className="mini-label">Guardrail</div>
          <p className="row-copy">{block.guardrail}</p>
        </div>
      </section>
    </main>
  );
}

function BottomNav({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {([['today', 'calendar', 'Today'], ['progress', 'chart', 'Progress'], ['settings', 'settings', 'Settings']] as const).map(([value, icon, label]) => (
        <button key={value} className={`nav-item ${view === value ? 'active' : ''}`} aria-current={view === value ? 'page' : undefined} onClick={() => onChange(value)}>
          <Icon name={icon} /><span className="nav-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    'chevron-left': <path d="m15 18-6-6 6-6" />,
    'chevron-right': <path d="m9 18 6-6-6-6" />,
    play: <path d="m8 5 11 7-11 7Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    moon: <path d="M20 15.5A8 8 0 1 1 8.5 4 6.5 6.5 0 0 0 20 15.5Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    chart: <><path d="M4 19V5M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.97 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88L4.2 7.06l2.83-2.83.06.06A1.7 1.7 0 0 0 8.97 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    swap: <path d="m16 3 4 4-4 4M20 7H4m4 14-4-4 4-4M4 17h16" />,
    alert: <><path d="M10.3 3.7 2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.7a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 3h.01" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.info}</svg>;
}

function CheckinScreen({ data, date, practice, exerciseSwaps, onClose, onBegin }: {
  data: AppDataV1;
  date: string;
  practice: boolean;
  exerciseSwaps: Record<string, string>;
  onClose: () => void;
  onBegin: (active: ActiveSession) => void;
}) {
  const day = resolvePlannedDay(date, data.profile.programStartDate, data.clearances);
  const plannedWorkout = workoutFor(day.workoutId);
  const braceRequired = data.clearances.some((item) => item.key === 'brace_required' && item.status === 'cleared_with_limits');
  const [check, setCheck] = useState<SymptomCheck>({ ...emptyCheck, braceUsed: braceRequired ? 'yes' : 'not_applicable' });
  const [weight, setWeight] = useState('');
  const signal = classifySymptoms(check, braceRequired);
  const actualWorkout = signal === 'yellow' && plannedWorkout.nonImpactWorkoutId ? workoutFor(plannedWorkout.nonImpactWorkoutId) : plannedWorkout;
  const signalCopy = signal === 'green'
    ? 'Your answers support the planned version. Preserve two reps in reserve and stop on time.'
    : signal === 'yellow'
      ? `Use ${actualWorkout.name}. Reduce range, load, speed, or contacts and reassess tomorrow.`
      : 'Do not start this session. Stop the provoking activity and contact your treating clinician.';

  const set = <K extends keyof SymptomCheck>(key: K, value: SymptomCheck[K]) => setCheck((current) => ({ ...current, [key]: value }));

  return (
    <div className="screen-overlay">
      <div className="screen-content">
        <header className="screen-header">
          <button className="icon-button" aria-label="Close check-in" onClick={onClose}><Icon name="close" /></button>
          <h1>{practice ? 'Practice check-in' : 'Readiness check'}</h1><span />
        </header>
        <div className="eyebrow">{formatDate(date)}</div>
        <h2 className="screen-title">Thirty seconds for a safer twenty.</h2>
        <p className="screen-intro">This does not diagnose anything. It chooses the conservative version when your symptoms or clearance call for it.</p>

        <section className="checkin-group">
          <div className="section-heading"><h2>Current symptoms</h2><span className="mini-label">Detailed check-in</span></div>
          <div className="checkin-pain-pair">
            <PainQuestion title="Knee pain right now" value={check.kneePain0to10} onChange={(value) => set('kneePain0to10', value)} />
            <PainQuestion title="Back pain right now" value={check.backPain0to10} onChange={(value) => set('backPain0to10', value)} />
          </div>
          <div className="checkin-context-grid">
            <ChoiceQuestion compact title="New swelling?" value={check.swelling ? 'yes' : 'no'} options={['no', 'yes']} onChange={(value) => set('swelling', value === 'yes')} />
            <ChoiceQuestion compact title="Instability, giving way, or locking?" value={check.instability ? 'yes' : 'no'} options={['no', 'yes']} onChange={(value) => set('instability', value === 'yes')} />
            <ChoiceQuestion compact title="Achilles or patellar tendon soreness" value={check.tendonSoreness} options={['none', 'mild', 'significant']} onChange={(value) => set('tendonSoreness', value as SymptomCheck['tendonSoreness'])} />
            <ChoiceQuestion compact title="Sleep and readiness" value={check.readiness} options={['good', 'okay', 'poor']} onChange={(value) => set('readiness', value as SymptomCheck['readiness'])} />
            {braceRequired && <ChoiceQuestion compact title="Prescribed brace in place?" value={check.braceUsed} options={['yes', 'no']} onChange={(value) => set('braceUsed', value as SymptomCheck['braceUsed'])} />}
            <ChoiceQuestion compact title="New radiating pain, numbness, or weakness?" value={check.neurologicalSymptoms ? 'yes' : 'no'} options={['no', 'yes']} onChange={(value) => set('neurologicalSymptoms', value === 'yes')} />
          </div>
        </section>

        {data.profile.bodyWeightPrompt && (
          <div className="field question">
            <label htmlFor="checkin-weight">Optional morning bodyweight</label>
            <input id="checkin-weight" inputMode="decimal" type="number" min="40" max="1000" step="0.1" placeholder="lb" value={weight} onChange={(event) => setWeight(event.target.value)} />
          </div>
        )}

        <div className={`signal-card ${signal}`} role="status">
          <strong>{signal === 'green' ? 'Green — follow the plan' : signal === 'yellow' ? 'Yellow — regress today' : 'Red — stop here'}</strong>
          <p>{signalCopy}</p>
        </div>

        <div className="checkin-footer">
          <button
            className="primary-button wide"
            disabled={signal === 'red'}
            onClick={() => {
              const now = new Date().toISOString();
              const phase = actualWorkout.warmup === 'none' ? 'main' : 'warmup';
              const plannedSeconds = plannedWarmupSeconds(actualWorkout.warmup);
              onBegin({
                id: id(practice ? 'practice' : 'session'),
                date,
                plannedWorkoutId: day.plannedWorkoutId,
                actualWorkoutId: actualWorkout.id,
                practice,
                phase,
                phaseStartedAt: now,
                warmupStartedAt: phase === 'warmup' ? now : undefined,
                warmup: summarizeWarmup(plannedSeconds, 0),
                mainStartedAt: phase === 'main' ? now : undefined,
                currentSegmentIndex: 0,
                currentExerciseIndex: 0,
                exerciseSwaps: Object.keys(exerciseSwaps).length ? exerciseSwaps : undefined,
                bodyWeightLb: weight ? Number(weight) : undefined,
                sets: [],
                preCheck: { ...check, signal },
              });
            }}
          >
            <Icon name="play" /> {practice ? 'Open practice player' : `Begin ${actualWorkout.shortName}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function PainQuestion({ title, value, onChange }: { title: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="question">
      <h2>{title}</h2><p>0 is none. 3 is the yellow threshold; 4+ stops this workout.</p>
      <div className="pain-slider"><input aria-label={title} type="range" min="0" max="10" value={value} onChange={(event) => onChange(Number(event.target.value))} /><output>{value}</output></div>
    </div>
  );
}

function ChoiceQuestion({ title, value, options, onChange, compact = false }: { title: string; value: string; options: string[]; onChange: (value: string) => void; compact?: boolean }) {
  return (
    <div className={`question ${compact ? 'question-compact' : ''}`}>
      <h2>{title}</h2>
      <div className="choice-row">
        {options.map((option) => <button key={option} className={`choice-button ${value === option ? 'selected' : ''}`} aria-pressed={value === option} onClick={() => onChange(option)}>{option.replaceAll('_', ' ')}</button>)}
      </div>
    </div>
  );
}

const PREP_ITEMS = {
  prep_5: [
    ['Easy temperature raise', 'Bike, brisk walk, or easy dribble. Finish warmer, not tired.'],
    ['Ankle rocks + calf pulse', '5 ankle rocks and 8 calf raises per side.'],
    ['Hinge + approved squat', '6 hinges and 6 squats. Brace and keep a tripod foot.'],
    ['Knee / hip activation', 'PT-approved TKE, band step, or glute bridge.'],
    ['Specific ramp', '2–3 light lift reps, or cleared snap-downs / low pogos.'],
  ],
  compressed_3: [
    ['Raise temperature', 'Walk, bike, or easy dribble.'],
    ['Move the working joints', '5–8 controlled reps through a comfortable range.'],
    ['Specific ramp', 'One or two light sets of the first exercise.'],
  ],
} as const;

function WorkoutPlayer({ active, data, onChange, onToast, onLeave }: {
  active: ActiveSession;
  data: AppDataV1;
  onChange: (active: ActiveSession | undefined) => void;
  onToast: (message: string) => void;
  onLeave: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [logExercise, setLogExercise] = useState<{ planned: ExerciseDefinition; actual: ExerciseDefinition; segment: WorkoutSegment; setIndex: number }>();
  const [swapFor, setSwapFor] = useState<{ planned: ExerciseDefinition; selected: ExerciseDefinition }>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [symptomOpen, setSymptomOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const previousRest = useRef(0);
  const workout = workoutFor(active.actualWorkoutId);
  const exitSheet = exitOpen && (
    <ExitWorkoutSheet
      active={active}
      onClose={() => setExitOpen(false)}
      onPause={() => { onChange(pauseActiveSession(active)); onLeave(); }}
      onSavePartial={() => { setExitOpen(false); onChange({ ...active, phase: 'checkout', phaseStartedAt: new Date().toISOString(), pausedAt: undefined }); }}
      onDiscard={() => { onChange(undefined); onLeave(); onToast(active.practice ? 'Practice closed.' : 'Unsaved workout discarded.'); }}
    />
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const phaseElapsed = Math.max(0, Math.floor((now - Date.parse(active.phaseStartedAt)) / 1000));
  const mainElapsed = active.mainStartedAt ? Math.max(0, Math.floor((now - Date.parse(active.mainStartedAt)) / 1000)) : 0;
  const currentSegmentIndex = Math.max(0, workout.segments.findIndex((segment) => mainElapsed < segment.endSecond));
  const segment = workout.segments[currentSegmentIndex] ?? workout.segments.at(-1)!;
  const segmentState = active.mainStartedAt ? timerState(active.mainStartedAt, now, segment) : undefined;
  const restRemaining = restRemainingSeconds(active.restUntil, now);

  useEffect(() => {
    if (active.phase === 'main' && mainElapsed >= workout.mainDurationSeconds) {
      onChange({ ...active, phase: workout.cooldown === 'none' ? 'checkout' : 'cooldown', phaseStartedAt: new Date().toISOString(), restUntil: undefined });
    }
  }, [active, mainElapsed, onChange, workout.cooldown, workout.mainDurationSeconds]);

  useEffect(() => {
    if (active.phase === 'main' && currentSegmentIndex !== active.currentSegmentIndex && mainElapsed < workout.mainDurationSeconds) {
      onChange({ ...active, currentSegmentIndex, currentExerciseIndex: 0 });
    }
  }, [active, currentSegmentIndex, mainElapsed, onChange, workout.mainDurationSeconds]);

  useEffect(() => {
    // Only alert when the rest timer ran out on its own; skipping rest clears restUntil.
    if (previousRest.current > 0 && restRemaining === 0 && active.restUntil != null && data.profile.optionalAlerts) {
      navigator.vibrate?.(120);
      onToast('Rest complete. Next set is ready.');
    }
    previousRest.current = restRemaining;
  }, [active.restUntil, data.profile.optionalAlerts, onToast, restRemaining]);

  if (active.phase === 'warmup') {
    const warmup = workout.warmup === 'prep_5' ? 'prep_5' : 'compressed_3';
    const items = PREP_ITEMS[warmup];
    const total = items.length * 60;
    const itemIndex = Math.min(items.length - 1, Math.floor(phaseElapsed / 60));
    const [title, instruction] = items[itemIndex];
    return (
      <PlayerFrame active={active} eyebrow={`${active.practice ? 'Practice · ' : ''}${warmup === 'prep_5' ? 'Mandatory prep' : 'Ramp-up'}`} onExit={() => setExitOpen(true)} exitSheet={exitSheet}>
        <div className="progress-track"><span style={{ width: `${Math.min(100, phaseElapsed / total * 100)}%` }} /></div>
        <div className="player-segment">Step {itemIndex + 1} of {items.length}</div>
        <h1 className="player-exercise">{title}</h1>
        <p className="player-target">{instruction}</p>
        <div className="segment-clock">{formatClock(total - phaseElapsed)}</div>
        <div className="cue-card"><div className="label">Prep rule</div><p>{warmup === 'prep_5' ? 'Complete all five categories before impact or heavy lower-body work.' : 'Warm enough to move well; do not create fatigue.'}</p></div>
        <div className="player-spacer" />
        <div className="player-actions">
          <button className="primary-button" onClick={() => { const started = new Date().toISOString(); const elapsed = active.warmupStartedAt ? Math.max(0, Math.floor((Date.parse(started) - Date.parse(active.warmupStartedAt)) / 1000)) : phaseElapsed; onChange({ ...active, phase: 'main', phaseStartedAt: started, mainStartedAt: started, currentSegmentIndex: 0, currentExerciseIndex: 0, warmup: summarizeWarmup(total, elapsed) }); }}><Icon name="play" /> Start 20:00 main</button>
        </div>
      </PlayerFrame>
    );
  }

  if (active.phase === 'cooldown') {
    const item = Math.min(2, Math.floor(phaseElapsed / 60));
    const items = [['Easy movement', 'Walk or pedal gently until breathing settles.'], ['Downshift breathing', 'Easy nasal inhale; longer relaxed exhale.'], ['Mobility or quick log', 'One comfortable drill, then check out.']];
    return (
      <PlayerFrame active={active} eyebrow="Optional cooldown" onExit={() => setExitOpen(true)} exitSheet={exitSheet}>
        <div className="progress-track"><span style={{ width: `${Math.min(100, phaseElapsed / 180 * 100)}%` }} /></div>
        <div className="player-segment">Minute {item + 1} of 3</div>
        <h1 className="player-exercise">{items[item][0]}</h1>
        <p className="player-target">{items[item][1]}</p>
        <div className="segment-clock">{formatClock(180 - phaseElapsed)}</div>
        <div className="cue-card"><div className="label">Cooldown rule</div><p>This is not another workout. Comfortable movement only.</p></div>
        <div className="player-spacer" />
        <div className="player-actions"><button className="primary-button" onClick={() => onChange({ ...active, phase: 'checkout', phaseStartedAt: new Date().toISOString() })}>{phaseElapsed >= 180 ? 'Continue to check-out' : 'Skip cooldown'}</button></div>
      </PlayerFrame>
    );
  }

  const sequence = exerciseSequence(segment);
  const currentSequenceStep = Math.min(active.currentExerciseIndex, sequence.length);
  const segmentComplete = currentSequenceStep >= sequence.length;
  const segmentExerciseIndex = sequence[currentSequenceStep] ?? sequence.at(-1) ?? 0;
  const segmentExercise = segment.exercises[segmentExerciseIndex];
  const plannedExercise = exerciseFor(segmentExercise.exerciseId);
  const swapKey = `${segment.id}:${plannedExercise.id}`;
  const actualExercise = exerciseFor(active.exerciseSwaps?.[swapKey] ?? plannedExercise.id);
  const qualityStopped = active.qualityStoppedSegmentIds?.includes(segment.id);
  const previous = latestSessionForExercise(data, actualExercise.id, active.date);
  const previousSet = previous?.sets.filter((item) => item.actualExerciseId === actualExercise.id).at(-1);
  const target = segmentExercise.repsText ?? (segmentExercise.repRange ? `${segmentExercise.repRange[0]}–${segmentExercise.repRange[1]}${segmentExercise.perSide ? ' / side' : ''}` : segmentExercise.durationSeconds ? `${segmentExercise.durationSeconds} sec` : actualExercise.defaultRepScheme ?? 'Quality reps');
  const round = sequence.slice(0, currentSequenceStep).filter((_, step) => restAfterExerciseStep(sequence, step)).length + 1;
  const totalRounds = sequence.filter((_, step) => restAfterExerciseStep(sequence, step)).length;
  const setNumber = sequence.slice(0, currentSequenceStep + 1).filter((index) => index === segmentExerciseIndex).length;
  const setTotal = sequence.filter((index) => index === segmentExerciseIndex).length;
  const restAfterThisSet = restAfterExerciseStep(sequence, currentSequenceStep);
  const restSeconds = segment.restSeconds ?? actualExercise.defaultRestSeconds;
  const nextExercise = !restAfterThisSet ? exerciseFor(segment.exercises[sequence[currentSequenceStep + 1]].exerciseId) : undefined;
  const sequenceLabel = segment.flow === 'single' || segment.flow === 'intervals'
    ? `Set ${setNumber} of ${setTotal}`
    : `Round ${round} of ${totalRounds} · ${segment.flow === 'circuit' ? 'Circuit' : 'Superset'}`;
  const nextAction = nextExercise ? `Then ${nextExercise.name}.` : restSeconds ? `Then rest ${restSeconds} sec before ${round < totalRounds ? 'the next round' : 'moving on'}.` : 'Then continue to the next planned action.';

  if (restRemaining > 0 || qualityStopped || segmentComplete) {
    return (
      <PlayerFrame active={active} eyebrow={qualityStopped ? 'Quality preserved' : segmentComplete ? 'Segment complete' : 'Rest · clock keeps moving'} onExit={() => setExitOpen(true)} exitSheet={exitSheet}>
        <div className="progress-track"><span style={{ width: `${Math.min(100, mainElapsed / 1200 * 100)}%` }} /></div>
        <div className="rest-state">
          <div className="player-segment">{segment.label}</div>
          <div className="segment-clock">{formatClock(qualityStopped || segmentComplete ? segmentState?.segmentRemainingSeconds ?? 0 : restRemaining)}</div>
          <h1 className="player-exercise">{qualityStopped ? 'Recover with intent.' : segmentComplete ? 'Segment complete.' : 'Full recovery.'}</h1>
          <p>{qualityStopped ? 'This power block is done. The next segment begins on schedule.' : segmentComplete ? 'Planned work is logged. Recover until the timer moves on.' : segmentState?.ended ? 'Rest safely, then move to the current segment.' : `Next: ${actualExercise.name}`}</p>
        </div>
        <div className="player-actions">
          {!qualityStopped && !segmentComplete && <button className="primary-button" onClick={() => onChange({ ...active, restUntil: undefined })}>Skip rest</button>}
          {(qualityStopped || segmentComplete) && !segmentState?.ended && (
            <button className="primary-button" onClick={() => onChange(skipToNextSegment(active, workout.segments))}>
              {currentSegmentIndex >= workout.segments.length - 1 ? 'Finish main early' : 'Start next segment early'}
            </button>
          )}
          {segmentComplete && currentSequenceStep > 0 && <button className="secondary-button" onClick={() => onChange({ ...active, currentExerciseIndex: currentSequenceStep - 1, restUntil: undefined })}><Icon name="chevron-left" /> Previous exercise</button>}
        </div>
      </PlayerFrame>
    );
  }

  return (
    <PlayerFrame active={active} eyebrow={`${active.practice ? 'Practice · ' : ''}${formatClock(segmentState?.overallRemainingSeconds ?? 1200)} main`} onExit={() => setExitOpen(true)} exitSheet={exitSheet}>
      <div className="progress-track"><span style={{ width: `${Math.min(100, mainElapsed / 1200 * 100)}%` }} /></div>
      {active.warmup && active.warmup.status !== 'not_applicable' && <div className={`player-prep ${active.warmup.status}`}><strong>Prep {active.warmup.status}</strong><span>{active.warmup.completedSeconds ? `${formatClock(active.warmup.completedSeconds)} logged` : 'No credited warm-up'}</span></div>}
      <div className="player-segment">{segment.label} · {segment.mode === 'quality_limited' ? 'Quality limited' : `Segment ${currentSegmentIndex + 1}/${workout.segments.length}`}</div>
      <h1 className="player-exercise">{actualExercise.name}</h1>
      <p className="player-target">{sequenceLabel} · {target} · {segment.notes[0] ?? 'Stop with clean form.'} <button className="inline-link" onClick={() => setDetailOpen(true)}>Technique & video ↗</button></p>
      <div className="segment-clock">{formatClock(segmentState?.segmentRemainingSeconds ?? 0)}</div>
      <ExercisePhotos exercise={actualExercise} onOpen={() => setDetailOpen(true)} />
      <div className="sequence-card"><div className="label">Next action</div><p>{nextAction}</p></div>
      <div className="cue-card"><div className="label">Main cue</div><p>{actualExercise.primaryCues.slice(0, 3).join(' · ')}</p></div>
      <div className="feel-row">
        <div className="feel-card"><strong>Mainly feel</strong><span>{actualExercise.shouldFeel[0]}</span></div>
        <div className="feel-card"><strong>Do not chase</strong><span>{actualExercise.shouldNotFeel[0]}</span></div>
      </div>
      <div className="last-performance">{previousSet ? `Last: ${previousSet.loadLb ? `${previousSet.loadLb} lb × ` : ''}${previousSet.reps ?? `${previousSet.durationSeconds ?? 0}s`} · ${formatDate(previous!.date, { month: 'short', day: 'numeric' })}` : 'No prior performance — choose a conservative start.'}</div>
      <div className="player-spacer" />
      <div className="player-actions">
        <button className="primary-button" disabled={!segmentState?.canStartSet} onClick={() => setLogExercise({ planned: plannedExercise, actual: actualExercise, segment, setIndex: active.sets.filter((item) => item.segmentId === segment.id && item.actualExerciseId === actualExercise.id).length })}>{segmentState?.canStartSet ? <><Icon name="check" /> {segment.mode === 'quality_limited' ? 'Rep complete' : 'Set complete'}</> : 'Segment boundary · move on'}</button>
        <button className="secondary-button" disabled={currentSequenceStep === 0} onClick={() => onChange({ ...active, currentExerciseIndex: currentSequenceStep - 1, restUntil: undefined })}><Icon name="chevron-left" /> Previous</button>
        <button className="secondary-button" onClick={() => setSwapFor({ planned: plannedExercise, selected: actualExercise })}><Icon name="swap" /> Swap</button>
        <button className="secondary-button" title="Regress or stop for pain, swelling, instability, or neurological symptoms" onClick={() => setSymptomOpen(true)}><Icon name="alert" /> Pain / symptoms</button>
        {segment.mode === 'quality_limited' && <button className="secondary-button" onClick={() => onChange({ ...active, qualityStoppedSegmentIds: [...(active.qualityStoppedSegmentIds ?? []), segment.id] })}>Quality dropped</button>}
      </div>

      {logExercise && <SetLogSheet exercise={logExercise.actual} planned={logExercise.planned} segment={logExercise.segment} previous={previousSet} setIndex={logExercise.setIndex} onClose={() => setLogExercise(undefined)} onSave={(set) => {
        if (logExercise.segment.id === segment.id) {
          const rest = restAfterThisSet ? restSeconds ?? 0 : 0;
          onChange({ ...active, sets: [...active.sets, set], currentExerciseIndex: currentSequenceStep + 1, restUntil: rest ? new Date(Date.now() + rest * 1000).toISOString() : undefined });
        } else {
          // The clock crossed into the next segment while the sheet was open; log the set without touching the new segment's cursor.
          onChange({ ...active, sets: [...active.sets, set] });
        }
        setLogExercise(undefined);
      }} />}
      {swapFor && <SwapSheet planned={swapFor.planned} selected={swapFor.selected} clearances={data.clearances} onClose={() => setSwapFor(undefined)} onSelect={(selected) => { onChange({ ...active, exerciseSwaps: { ...(active.exerciseSwaps ?? {}), [swapKey]: selected.id } }); setSwapFor(undefined); }} />}
      {detailOpen && <ExerciseDetailSheet exercise={actualExercise} data={data} onClose={() => setDetailOpen(false)} onSwap={() => { setDetailOpen(false); setSwapFor({ planned: plannedExercise, selected: actualExercise }); }} />}
      {symptomOpen && <SymptomSheet onClose={() => setSymptomOpen(false)} onRegress={() => { setSymptomOpen(false); setSwapFor({ planned: plannedExercise, selected: actualExercise }); }} onStop={() => { setSymptomOpen(false); onChange({ ...active, phase: 'checkout', phaseStartedAt: new Date().toISOString() }); }} />}
    </PlayerFrame>
  );
}

function PlayerFrame({ active, eyebrow, onExit, exitSheet, children }: { active: ActiveSession; eyebrow: string; onExit: () => void; exitSheet?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="screen-overlay workout-player">
      <main className={`player-content ${exitSheet ? 'is-obscured' : ''}`} aria-hidden={exitSheet ? true : undefined}>
        <div className="player-top"><div className="eyebrow">{eyebrow}</div><button className="icon-button" aria-label="Exit workout" onClick={onExit}><Icon name="close" /></button></div>
        {children}
        {exitSheet}
      </main>
    </div>
  );
}

function SetLogSheet({ exercise, planned, segment, previous, setIndex, onClose, onSave }: {
  exercise: ExerciseDefinition;
  planned: ExerciseDefinition;
  segment: WorkoutSegment;
  previous?: SetLog;
  setIndex: number;
  onClose: () => void;
  onSave: (set: SetLog) => void;
}) {
  const target = segment.exercises.find((item) => item.exerciseId === planned.id);
  const [reps, setReps] = useState(previous?.reps ?? target?.repRange?.[0] ?? 5);
  const [load, setLoad] = useState(previous?.loadLb ?? 0);
  const [duration, setDuration] = useState(previous?.durationSeconds ?? target?.durationSeconds ?? 30);
  const [rir, setRir] = useState(previous?.rir ?? 2);
  const [quality, setQuality] = useState<SetLog['quality']>(previous?.quality ?? 'good');
  const [video, setVideo] = useState(false);
  const tracksDuration = exercise.tracking === 'duration' || Boolean(target?.durationSeconds);
  const tracksQuality = exercise.tracking === 'quality' || segment.mode === 'quality_limited';

  return (
    <Sheet onClose={onClose}>
      <div className="eyebrow">Set {setIndex + 1} · {segment.label}</div>
      <h2>{exercise.name}</h2>
      {planned.id !== exercise.id && <p className="sheet-copy">Swapped from {planned.name} for this session.</p>}
      {tracksDuration ? (
        <NumberInput label="Duration (seconds)" value={duration} step={5} min={0} onChange={setDuration} />
      ) : (
        <>
          <NumberInput label="Reps completed" value={reps} step={1} min={0} onChange={setReps} />
          {exercise.loadKind !== 'none' && exercise.loadKind !== 'bodyweight' && <NumberInput label={`Load in pounds${exercise.loadKind === 'per_hand' ? ' per hand' : ''}`} value={load} step={5} min={0} onChange={setLoad} />}
        </>
      )}
      {tracksQuality ? (
        <ChoiceQuestion title="Rep quality" value={quality ?? 'good'} options={['great', 'good', 'declining', 'stopped']} onChange={(value) => setQuality(value as SetLog['quality'])} />
      ) : (
        <ChoiceQuestion title="Reps in reserve" value={String(rir)} options={['3', '2', '1', '0']} onChange={(value) => setRir(Number(value))} />
      )}
      <label className="settings-row top-space">
        <span><strong>Form check recorded</strong><br /><small className="muted">Record in the Camera app; this stores only a marker.</small></span>
        <input type="checkbox" checked={video} onChange={(event) => setVideo(event.target.checked)} />
      </label>
      <div className="sheet-actions">
        <button className="secondary-button" onClick={onClose}>Cancel</button>
        <button className="primary-button" onClick={() => onSave({
          id: id('set'),
          segmentId: segment.id,
          plannedExerciseId: planned.id,
          actualExerciseId: exercise.id,
          setIndex,
          reps: tracksDuration ? undefined : reps,
          loadLb: tracksDuration || exercise.loadKind === 'none' || exercise.loadKind === 'bodyweight' ? undefined : load,
          durationSeconds: tracksDuration ? duration : undefined,
          rir: tracksQuality ? undefined : rir,
          quality: tracksQuality ? quality : undefined,
          formVideoRecorded: video || undefined,
          completedAt: new Date().toISOString(),
        })}><Icon name="check" /> Save & rest</button>
      </div>
    </Sheet>
  );
}

function NumberInput({ label, value, step, min, onChange }: { label: string; value: number; step: number; min: number; onChange: (value: number) => void }) {
  return (
    <div className="field question">
      <label>{label}</label>
      <div className="number-field">
        <button aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, Number((value - step).toFixed(1))))}>−</button>
        <input type="number" inputMode="decimal" min={min} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        <button aria-label={`Increase ${label}`} onClick={() => onChange(Number((value + step).toFixed(1)))}>+</button>
      </div>
    </div>
  );
}

function ExercisePhotos({ exercise, onOpen }: { exercise: ExerciseDefinition; onOpen?: () => void }) {
  if (!exercisePhotoIds.has(exercise.id)) return null;
  const base = `${import.meta.env.BASE_URL}exercise-photos/${exercise.id}`;
  const photos = (
    <>
      <img src={`${base}-0.jpg`} alt={`${exercise.name}: start position`} loading="lazy" />
      <img src={`${base}-1.jpg`} alt={`${exercise.name}: finish position`} loading="lazy" />
    </>
  );
  if (onOpen) {
    return <button className="exercise-photos" onClick={onOpen} aria-label={`Open ${exercise.name} technique card`}>{photos}</button>;
  }
  return <figure className="exercise-photos">{photos}</figure>;
}

function ExerciseDetailSheet({ exercise, data, onClose, onSwap }: { exercise: ExerciseDefinition; data: AppDataV1; onClose: () => void; onSwap?: () => void }) {
  const history = data.sessions
    .flatMap((session) => session.sets.map((set) => ({ ...set, date: session.date })))
    .filter((set) => set.actualExerciseId === exercise.id)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, 3);
  const demo = exercise.demoUrl ?? `https://www.youtube.com/results?search_query=${encodeURIComponent(exercise.demoSearchQuery)}`;
  return (
    <Sheet onClose={onClose}>
      <div className="eyebrow">{exercise.category} · technique card</div>
      <h2>{exercise.name}</h2>
      <p className="sheet-copy">{exercise.purpose}</p>
      <ExercisePhotos exercise={exercise} />
      <a className="primary-button wide top-space" href={demo} target="_blank" rel="noreferrer">{exercise.demoUrl ? 'Watch technique demo ↗' : 'Find video demo ↗'}</a>
      {onSwap && <button className="secondary-button wide top-space" onClick={onSwap}><Icon name="swap" /> Swap for today</button>}
      <details className="technique" open><summary>Setup and execution</summary><ul className="detail-list">{[...exercise.setup, ...exercise.execution].map((item) => <li key={item}>{item}</li>)}</ul></details>
      <details className="technique" open><summary>Three cues</summary><ul className="detail-list">{exercise.primaryCues.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul></details>
      <details className="technique"><summary>What it should feel like</summary><ul className="detail-list">{exercise.shouldFeel.map((item) => <li key={item}>{item}</li>)}</ul></details>
      <details className="technique"><summary>Stop or regress when</summary><ul className="detail-list">{exercise.shouldNotFeel.map((item) => <li key={item}>{item}</li>)}</ul></details>
      <details className="technique"><summary>Common mistakes</summary><ul className="detail-list">{exercise.commonMistakes.map((item) => <li key={item}>{item}</li>)}</ul></details>
      <div className="section-heading top-space"><h2>Last three</h2></div>
      <div className="card no-shadow">
        {history.length ? history.map((set) => <div className="row" key={set.id}><div><div className="row-title">{formatDate(set.date, { month: 'short', day: 'numeric' })}</div><div className="row-copy">Set {set.setIndex + 1}</div></div><div className="row-value">{set.loadLb ? `${set.loadLb} lb × ` : ''}{set.reps ?? `${set.durationSeconds ?? 0}s`}</div></div>) : <div className="empty-state"><p>No logged sets yet.</p></div>}
      </div>
      {exercise.sourceName && <p className="sheet-copy">Source: {exercise.sourceName}{exercise.lastVerifiedDate ? ` · checked ${exercise.lastVerifiedDate}` : ''}</p>}
    </Sheet>
  );
}

function SwapSheet({ planned, selected, clearances, onClose, onSelect }: { planned: ExerciseDefinition; selected: ExerciseDefinition; clearances: ClearanceRecord[]; onClose: () => void; onSelect: (exercise: ExerciseDefinition) => void }) {
  const latest = latestClearances(clearances, toLocalDate());
  const isCleared = (exercise: ExerciseDefinition) => exercise.clearanceRequired.every((key) => {
    const status = latest.get(key)?.status;
    return status === 'cleared' || status === 'cleared_with_limits';
  });
  const alternatives = [
    { id: planned.id, label: 'Original plan' },
    ...planned.bodyweightAlternativeIds.map((id) => ({ id, label: 'No equipment' })),
    ...planned.regressionIds.map((id) => ({ id, label: 'Regression' })),
    ...planned.progressionIds.map((id) => ({ id, label: 'Progression' })),
  ]
    .reduce<{ id: string; label: string }[]>((items, option) => items.some((item) => item.id === option.id) ? items : [...items, option], [])
    .filter((option) => option.label !== 'Progression' || isCleared(exerciseFor(option.id)));
  return (
    <Sheet onClose={onClose}>
      <div className="eyebrow">Swap for today</div>
      <h2>Choose today’s version.</h2>
      <p className="sheet-copy">All configured alternatives are here. Your performed version is tracked separately from the plan.</p>
      <div className="swap-options top-space">
        {alternatives.map((option) => {
          const item = exerciseFor(option.id);
          const equipment = item.equipment.length ? item.equipment.join(' · ') : 'No equipment';
          return <button className={`swap-option ${selected.id === item.id ? 'selected-swap' : ''}`} key={item.id} onClick={() => onSelect(item)}>
            <span className="swap-option-name">{item.name}</span>
            {selected.id === item.id && <span className="swap-current">Current</span>}
            <span className="swap-option-meta">{option.label === equipment ? option.label : `${option.label} · ${equipment}`}</span>
          </button>
        })}
      </div>
    </Sheet>
  );
}

function SymptomSheet({ onClose, onRegress, onStop }: { onClose: () => void; onRegress: () => void; onStop: () => void }) {
  return (
    <Sheet onClose={onClose}>
      <div className="eyebrow red-text">Symptoms during work</div>
      <h2>Pain does not earn points.</h2>
      <p className="sheet-copy">Choose the action that matches what is happening now.</p>
      <button className="card wide top-space" onClick={onClose}><div className="row-title green-text">0–2 / normal muscular effort</div><div className="row-copy">Continue only while mechanics stay stable.</div></button>
      <button className="card wide" onClick={onRegress}><div className="row-title amber-text">3 / guarded / confidence down</div><div className="row-copy">Use a regression and reduce range, load, speed, or contacts.</div></button>
      <button className="card wide" onClick={onStop}><div className="row-title red-text">Sharp pain, swelling, giving way, radiating symptoms</div><div className="row-copy">Stop the provoking activity and contact your treating clinician.</div></button>
    </Sheet>
  );
}

function ExitWorkoutSheet({ active, onClose, onPause, onSavePartial, onDiscard }: {
  active: ActiveSession;
  onClose: () => void;
  onPause: () => void;
  onSavePartial: () => void;
  onDiscard: () => void;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  if (active.practice) {
    return (
      <Sheet onClose={onClose}>
        <div className="eyebrow">Practice mode</div>
        <h2>Leave practice?</h2>
        <p className="sheet-copy">Practice never writes workout data.</p>
        <div className="sheet-actions"><button className="secondary-button" onClick={onClose}>Continue</button><button className="primary-button" onClick={onDiscard}>Exit practice</button></div>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose}>
      {confirmDiscard ? <>
        <div className="eyebrow red-text">Discard workout</div>
        <h2>Discard this draft?</h2>
        <p className="sheet-copy">{active.sets.length ? `${active.sets.length} logged ${active.sets.length === 1 ? 'set' : 'sets'} will be removed.` : 'No workout will be saved.'} This cannot be undone.</p>
        <div className="sheet-actions"><button className="secondary-button" onClick={() => setConfirmDiscard(false)}>Keep workout</button><button className="danger-button" onClick={onDiscard}>Discard</button></div>
      </> : <>
        <div className="eyebrow">Workout controls</div>
        <h2>Leave the player?</h2>
        <p className="sheet-copy">Choose exactly what should happen. Nothing is saved unless you say so.</p>
        <button className="card wide top-space" onClick={onPause}><div className="row-title">Pause and return to Today</div><div className="row-copy">Keep this draft. The workout and rest clocks freeze until you resume.</div></button>
        <button className="card wide" onClick={onSavePartial}><div className="row-title">Save as partial</div><div className="row-copy">Open check-out and choose what to record.</div></button>
        <button className="card wide" onClick={() => setConfirmDiscard(true)}><div className="row-title red-text">Discard without saving</div><div className="row-copy">Remove this draft from the device. This cannot be undone.</div></button>
        <div className="sheet-actions"><button className="secondary-button" onClick={onClose}>Keep working</button></div>
      </>}
    </Sheet>
  );
}

function DiscardDraftSheet({ onClose, onDiscard }: { onClose: () => void; onDiscard: () => void }) {
  return (
    <Sheet onClose={onClose}>
      <div className="eyebrow red-text">Discard workout</div>
      <h2>Discard this draft?</h2>
      <p className="sheet-copy">Nothing will be added to your history. This cannot be undone.</p>
      <div className="sheet-actions"><button className="secondary-button" onClick={onClose}>Keep workout</button><button className="danger-button" onClick={onDiscard}>Discard</button></div>
    </Sheet>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        {children}
      </section>
    </div>
  , document.body);
}

function CheckoutScreen({ active, data, onBack, onSave }: {
  active: ActiveSession;
  data: AppDataV1;
  onBack: () => void;
  onSave: (session?: SessionLog, metric?: { date: string; bodyWeightLb: number }) => void;
}) {
  const workout = workoutFor(active.actualWorkoutId);
  const day = resolvePlannedDay(active.date, data.profile.programStartDate, data.clearances);
  const ranFullMain = active.mainStartedAt ? Date.now() - Date.parse(active.mainStartedAt) >= 1_200_000 : false;
  const [completion, setCompletion] = useState<SessionLog['completion']>(ranFullMain ? 'complete' : active.sets.length ? 'partial' : 'stopped');
  const [difficulty, setDifficulty] = useState<SessionLog['sessionDifficulty']>('right');
  const [check, setCheck] = useState<SymptomCheck>({ ...emptyCheck, braceUsed: active.preCheck.braceUsed });
  const [notes, setNotes] = useState('');
  const [weight, setWeight] = useState(active.bodyWeightLb ? String(active.bodyWeightLb) : '');
  const [touch, setTouch] = useState('');
  const [jumpCrisp, setJumpCrisp] = useState(true);
  const [basketballMinutes, setBasketballMinutes] = useState('');
  const signal = classifySymptoms(check, false);
  const jumpDay = workout.stressTags.some((tag) => tag.includes('impact') || tag.includes('power'));
  const basketballDay = workout.id.includes('saturday') || workout.id.includes('basketball') || workout.id.includes('pickup');

  return (
    <div className="screen-overlay">
      <div className="screen-content">
        <header className="screen-header"><button className="icon-button" aria-label="Back to workout" onClick={onBack}><Icon name="chevron-left" /></button><h1>{active.practice ? 'Practice complete' : 'Check-out'}</h1><span /></header>
        <div className="eyebrow">{workout.shortName} · {active.sets.length} entries</div>
        <h2 className="screen-title">Stopping on time is the win.</h2>
        <p className="screen-intro">Capture only what will improve the next session.</p>

        <ChoiceQuestion title="Session status" value={completion} options={['complete', 'partial', 'stopped']} onChange={(value) => setCompletion(value as SessionLog['completion'])} />
        <ChoiceQuestion title="Overall difficulty" value={difficulty} options={['very_easy', 'easy', 'right', 'hard', 'too_hard']} onChange={(value) => setDifficulty(value as SessionLog['sessionDifficulty'])} />
        <PainQuestion title="Knee pain after" value={check.kneePain0to10} onChange={(value) => setCheck((current) => ({ ...current, kneePain0to10: value }))} />
        <PainQuestion title="Back pain after" value={check.backPain0to10} onChange={(value) => setCheck((current) => ({ ...current, backPain0to10: value }))} />
        <ChoiceQuestion title="New swelling?" value={check.swelling ? 'yes' : 'no'} options={['no', 'yes']} onChange={(value) => setCheck((current) => ({ ...current, swelling: value === 'yes' }))} />
        <ChoiceQuestion title="Instability or giving way?" value={check.instability ? 'yes' : 'no'} options={['no', 'yes']} onChange={(value) => setCheck((current) => ({ ...current, instability: value === 'yes' }))} />

        {jumpDay && (
          <>
            <ChoiceQuestion title="Jump / power quality stayed crisp?" value={jumpCrisp ? 'yes' : 'no'} options={['yes', 'no']} onChange={(value) => setJumpCrisp(value === 'yes')} />
            <div className="field question"><label htmlFor="touch">Best touch height (total inches, optional)</label><input id="touch" type="number" inputMode="decimal" value={touch} onChange={(event) => setTouch(event.target.value)} /></div>
          </>
        )}
        {basketballDay && <div className="field question"><label htmlFor="basketball-minutes">Pickup / basketball minutes</label><input id="basketball-minutes" type="number" inputMode="numeric" value={basketballMinutes} onChange={(event) => setBasketballMinutes(event.target.value)} /></div>}
        {data.profile.bodyWeightPrompt && !active.bodyWeightLb && <div className="field question"><label htmlFor="checkout-weight">Optional bodyweight</label><input id="checkout-weight" type="number" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} /></div>}
        <div className="field question"><label htmlFor="checkout-notes">Optional note</label><textarea id="checkout-notes" value={notes} placeholder="One useful observation…" onChange={(event) => setNotes(event.target.value)} /></div>

        <div className={`signal-card ${signal}`}><strong>{signal === 'green' ? 'Green response' : signal === 'yellow' ? 'Yellow response' : 'Red response'}</strong><p>{signal === 'green' ? 'No automatic regression needed.' : signal === 'yellow' ? 'The next related exposure will show a conservative regression.' : 'Do not retest the provoking movement under fatigue. Contact your treating clinician.'}</p></div>

        <button className="primary-button wide top-space" onClick={() => {
          if (active.practice) {
            onSave();
            return;
          }
          const completedAt = new Date().toISOString();
          onSave({
            id: active.id,
            date: active.date,
            plannedWorkoutId: active.plannedWorkoutId,
            actualWorkoutId: active.actualWorkoutId,
            block: day.block,
            blockWeek: day.blockWeek,
            completion,
            preCheck: active.preCheck,
            sets: active.sets,
            bestTouchInches: touch ? Number(touch) : undefined,
            basketballMinutes: basketballMinutes ? Number(basketballMinutes) : undefined,
            postCheck: { ...check, signal },
            sessionDifficulty: difficulty,
            jumpQualityStayedCrisp: jumpDay ? jumpCrisp : undefined,
            warmup: active.warmup,
            notes: notes || undefined,
            startedAt: active.mainStartedAt ?? active.phaseStartedAt,
            completedAt,
          }, weight ? { date: active.date, bodyWeightLb: Number(weight) } : undefined);
        }}><Icon name="check" /> {active.practice ? 'Exit practice' : 'Save session'}</button>
      </div>
    </div>
  );
}

function EditSessionSheet({ session, onClose, onSave, onDelete }: { session: SessionLog; onClose: () => void; onSave: (session: SessionLog) => void; onDelete: () => void }) {
  const [completion, setCompletion] = useState(session.completion);
  const [difficulty, setDifficulty] = useState(session.sessionDifficulty);
  const [notes, setNotes] = useState(session.notes ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Sheet onClose={onClose}>
      <div className="eyebrow">{formatDate(session.date)} · edit log</div>
      <h2>{workoutFor(session.actualWorkoutId).name}</h2>
      <ChoiceQuestion title="Session status" value={completion} options={['complete', 'partial', 'skipped', 'stopped']} onChange={(value) => setCompletion(value as SessionLog['completion'])} />
      <ChoiceQuestion title="Difficulty" value={difficulty} options={['very_easy', 'easy', 'right', 'hard', 'too_hard']} onChange={(value) => setDifficulty(value as SessionLog['sessionDifficulty'])} />
      <div className="field question"><label htmlFor="edit-notes">Notes</label><textarea id="edit-notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
      <div className="section-heading top-space"><h2>Recorded sets</h2></div>
      {session.sets.map((set) => <div className="row" key={set.id}><div><div className="row-title">{exerciseFor(set.actualExerciseId).name}</div><div className="row-copy">Set {set.setIndex + 1}</div></div><div className="row-value">{set.loadLb ? `${set.loadLb} lb × ` : ''}{set.reps ?? `${set.durationSeconds ?? 0}s`}</div></div>)}
      <div className="sheet-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => onSave({ ...session, completion, sessionDifficulty: difficulty, notes: notes || undefined })}>Save changes</button></div>
      {confirmDelete ? <div className="notice red top-space"><strong>Delete this workout log?</strong><p>Its sets will be removed. Any bodyweight entry stays.</p><div className="sheet-actions"><button className="secondary-button" onClick={() => setConfirmDelete(false)}>Keep log</button><button className="danger-button" onClick={onDelete}>Delete</button></div></div> : <button className="danger-button wide top-space" onClick={() => setConfirmDelete(true)}>Delete workout log</button>}
    </Sheet>
  );
}

function CheckpointSheet({ data, date, onClose, onSave }: { data: AppDataV1; date: string; onClose: () => void; onSave: (checkpoint: CheckpointLog) => void }) {
  const day = resolvePlannedDay(date, data.profile.programStartDate, data.clearances);
  const [standing, setStanding] = useState(0);
  const [touch, setTouch] = useState(0);
  const [trapLoad, setTrapLoad] = useState(0);
  const [trapReps, setTrapReps] = useState(0);
  const [calf, setCalf] = useState(0);
  const [signal, setSignal] = useState<'green' | 'yellow' | 'red'>('green');
  return (
    <Sheet onClose={onClose}>
      <div className="eyebrow">Block {day.block} · optional checkpoint</div>
      <h2>Same setup. Clean reps. No max grind.</h2>
      <p className="sheet-copy">Skip tests that are not cleared or do not feel green today.</p>
      <NumberInput label="Standing jump (inches)" value={standing} step={0.5} min={0} onChange={setStanding} />
      <NumberInput label="Approach touch (total inches)" value={touch} step={0.5} min={0} onChange={setTouch} />
      <div className="field-row"><NumberInput label="Trap-bar load" value={trapLoad} step={5} min={0} onChange={setTrapLoad} /><NumberInput label="Clean reps" value={trapReps} step={1} min={0} onChange={setTrapReps} /></div>
      <NumberInput label="Quality single-leg calf raises" value={calf} step={1} min={0} onChange={setCalf} />
      <ChoiceQuestion title="Symptom response" value={signal} options={['green', 'yellow', 'red']} onChange={(value) => setSignal(value as typeof signal)} />
      <div className="sheet-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => onSave({ id: id('checkpoint'), date, block: day.block, standingJumpInches: standing || undefined, approachTouchInches: touch || undefined, trapBarLoadLb: trapLoad || undefined, trapBarReps: trapReps || undefined, calfRaiseCount: calf || undefined, symptomSignal: signal })}>Save checkpoint</button></div>
    </Sheet>
  );
}
