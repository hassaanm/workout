import { useMemo, useRef, useState } from 'react';
import { exerciseById } from './data/exercises';
import {
  addCalendarDays,
  countHighImpactExposures,
  differenceInCalendarDays,
  localWeekday,
  rollingBodyWeightAverage,
  toLocalDate,
} from './domain';
import { downloadBackup, previewImport, requestPersistentStorage, type ImportPreview } from './storage';
import type {
  AppDataV1,
  ClearanceKey,
  ClearanceRecord,
  ClearanceStatus,
  PTOverride,
  ProfileSettings,
  SessionLog,
} from './types';

const EQUIPMENT = [
  ['barbell', 'Barbell'],
  ['plates', 'Plates'],
  ['squat_rack', 'Squat rack'],
  ['trap_bar', 'Trap bar'],
  ['dumbbells', 'Dumbbells'],
  ['kettlebell', 'Kettlebell'],
  ['bench', 'Bench'],
  ['pull_up_bar', 'Pull-up bar'],
  ['dip_station', 'Dip setup'],
  ['resistance_bands', 'Bands'],
  ['slant_board', 'Slant board'],
  ['bosu', 'BOSU'],
  ['basketball_court', 'Court'],
  ['adjustable_rim', 'Adjustable rim'],
  ['exercise_bike', 'Exercise bike'],
  ['medicine_ball', 'Medicine ball'],
] as const;

const CLEARANCES: [ClearanceKey, string][] = [
  ['brace_required', 'Brace requirement'],
  ['squat_loading', 'Squat / loading'],
  ['deep_flexion', 'Deep knee flexion'],
  ['heavy_hamstring', 'Heavy hamstring work'],
  ['jogging', 'Jogging'],
  ['acceleration', 'Acceleration'],
  ['low_level_jump', 'Low-level jumping'],
  ['max_jump', 'Maximal jumping'],
  ['lateral_cutting', 'Lateral hopping / cutting'],
  ['basketball_practice', 'Basketball practice'],
  ['pickup_contact', 'Pickup / contact'],
];

const clearanceLabel = Object.fromEntries(CLEARANCES) as Record<ClearanceKey, string>;
const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const pounds = (value: number | undefined) => value == null ? '—' : `${value.toFixed(1)} lb`;

function LogoMark() {
  return (
    <svg className="onboarding-mark" viewBox="0 0 64 64" role="img" aria-label="The Dunk Project">
      <rect width="64" height="64" rx="17" fill="#3459d1" />
      <path d="M18 41c9-1 16-8 18-21m-8 7 8-7 6 9M18 46h28" fill="none" stroke="#f5f1e7" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EquipmentChips({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="equipment-grid">
      {EQUIPMENT.map(([id, label]) => (
        <button
          className={`choice-button${selected.includes(id) ? ' selected' : ''}`}
          key={id}
          type="button"
          aria-pressed={selected.includes(id)}
          onClick={() => onToggle(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function OnboardingScreen({ data, onComplete }: { data: AppDataV1; onComplete: (data: AppDataV1) => void }) {
  const [profile, setProfile] = useState(data.profile);
  const [currentWeight, setCurrentWeight] = useState('');
  const [persistence, setPersistence] = useState<'idle' | 'granted' | 'unavailable'>('idle');

  const change = <K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) =>
    setProfile((current) => ({ ...current, [key]: value }));
  const toggleEquipment = (id: string) =>
    change('equipment', profile.equipment.includes(id) ? profile.equipment.filter((item) => item !== id) : [...profile.equipment, id]);

  const finish = async () => {
    let granted = false;
    try {
      granted = await requestPersistentStorage();
    } catch {
      // Persistence is a best-effort browser feature; backup remains available.
    }
    setPersistence(granted ? 'granted' : 'unavailable');
    const weight = Number(currentWeight);
    const today = toLocalDate();
    const metrics = Number.isFinite(weight) && weight >= 40
      ? [...data.metrics.filter(({ date }) => date !== today), { date: today, bodyWeightLb: weight }]
      : data.metrics;
    onComplete({ ...data, profile: { ...profile, onboardingComplete: true }, metrics });
  };

  return (
    <main className="screen-overlay onboarding">
      <div className="screen-content">
        <LogoMark />
        <p className="eyebrow top-space">The 20-minute dunk project</p>
        <h1 className="screen-title">Train what matters. Stop on time.</h1>
        <p className="screen-intro">A year of short, clearance-aware sessions built around strength, jump quality, durability, and your real schedule.</p>

        <div className="install-card">
          <strong>On iPhone, install before entering long-term data.</strong><br />
          In Safari, tap Share → Add to Home Screen, then open that copy. Its storage is separate from the Safari tab.
        </div>

        <div className="onboarding-form">
          <div className="field">
            <label htmlFor="onboarding-name">Name (optional)</label>
            <input id="onboarding-name" value={profile.name} autoComplete="name" placeholder="Your name" onChange={(event) => change('name', event.target.value)} />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="onboarding-start">Program starts</label>
              <input id="onboarding-start" type="date" value={profile.programStartDate} onChange={(event) => change('programStartDate', event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="onboarding-reach">Standing reach</label>
              <input id="onboarding-reach" type="number" min="30" max="120" inputMode="decimal" value={profile.standingReachInches} onChange={(event) => change('standingReachInches', Number(event.target.value))} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="onboarding-weight">Current weight in pounds (optional)</label>
            <input id="onboarding-weight" type="number" min="40" max="1000" step="0.1" inputMode="decimal" placeholder="185" value={currentWeight} onChange={(event) => setCurrentWeight(event.target.value)} />
          </div>
          <div className="field">
            <label>Equipment available</label>
            <EquipmentChips selected={profile.equipment} onToggle={toggleEquipment} />
          </div>
        </div>

        <div className="notice amber top-space">
          <strong>Safety starts conservative.</strong> Running, jumping, cutting, pickup, deep flexion, and heavy hamstring work remain unavailable until you record clinician clearance in Settings.
        </div>
        {persistence !== 'idle' && <p className="row-copy top-space">Persistent storage: {persistence === 'granted' ? 'enabled' : 'not available in this browser; use JSON backups'}.</p>}

        <div className="onboarding-footer">
          <button className="primary-button wide" type="button" disabled={!profile.programStartDate || profile.standingReachInches < 30} onClick={finish}>
            Set up my program
          </button>
          <p className="row-copy top-space">This training framework does not replace your orthopedist or physical therapist.</p>
        </div>
      </div>
    </main>
  );
}

type ChartPoint = { date: string; value: number };

function LineChart({ points, label, suffix = '' }: { points: ChartPoint[]; label: string; suffix?: string }) {
  if (points.length < 2) return <div className="empty-state"><strong>Not enough data yet</strong><p>Two entries will draw this trend.</p></div>;
  const values = points.map(({ value }) => value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const coordinates = points.map(({ value }, index) => {
    const x = 10 + (index / (points.length - 1)) * 300;
    const y = 122 - ((value - min) / spread) * 104;
    return `${x},${y}`;
  });
  const line = coordinates.join(' ');
  const area = `10,130 ${line} 310,130`;

  return (
    <figure>
      <svg className="chart" viewBox="0 0 320 140" role="img" aria-label={label}>
        <polygon className="chart-area" points={area} />
        <polyline className="chart-line" points={line} />
        {coordinates.map((point, index) => <circle key={`${points[index].date}-${index}`} cx={point.split(',')[0]} cy={point.split(',')[1]} r="3.5" fill="var(--blue)" />)}
      </svg>
      <div className="row">
        <span className="row-copy">{points[0].date}</span>
        <span className="row-copy">{min.toFixed(1)}–{max.toFixed(1)}{suffix}</span>
        <span className="row-copy">{points.at(-1)?.date}</span>
      </div>
    </figure>
  );
}

function successful(session: SessionLog) {
  return session.completion === 'complete' || session.completion === 'partial';
}

export function ProgressScreen({ data, throughDate }: { data: AppDataV1; throughDate: string }) {
  const sessions = useMemo(() => data.sessions.filter(({ date }) => date <= throughDate).sort((a, b) => a.date.localeCompare(b.date)), [data.sessions, throughDate]);
  const start28 = addCalendarDays(throughDate, -27);
  const recentSessions = sessions.filter(({ date }) => date >= start28);
  const availableProgramDays = throughDate < data.profile.programStartDate
    ? 0
    : Math.min(28, differenceInCalendarDays(throughDate, data.profile.programStartDate) + 1);
  const adherence = availableProgramDays ? Math.round((new Set(recentSessions.filter(successful).map(({ date }) => date)).size / availableProgramDays) * 100) : undefined;
  const weightAverage = rollingBodyWeightAverage(data.metrics, throughDate);
  const previousAverage = rollingBodyWeightAverage(data.metrics, addCalendarDays(throughDate, -7));
  const currentStart = addCalendarDays(throughDate, -27);
  const previousStart = addCalendarDays(throughDate, -55);
  const previousEnd = addCalendarDays(throughDate, -28);
  const currentCount = sessions.filter((session) => session.date >= currentStart && successful(session)).length;
  const previousCount = sessions.filter((session) => session.date >= previousStart && session.date <= previousEnd && successful(session)).length;
  const mondayOffset = (localWeekday(throughDate) + 6) % 7;
  const weekStart = addCalendarDays(throughDate, -mondayOffset);
  const impactCount = countHighImpactExposures(sessions, weekStart);
  const weightPoints = data.metrics
    .filter(({ date, bodyWeightLb }) => date <= throughDate && date >= addCalendarDays(throughDate, -55) && bodyWeightLb != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ date, bodyWeightLb }) => ({ date, value: bodyWeightLb! }));
  const jumpPoints = [
    ...sessions.filter(({ bestTouchInches }) => bestTouchInches != null).map(({ date, bestTouchInches }) => ({ date, value: bestTouchInches! - data.profile.standingReachInches })),
    ...data.checkpoints.filter(({ date, standingJumpInches }) => date <= throughDate && standingJumpInches != null).map(({ date, standingJumpInches }) => ({ date, value: standingJumpInches! })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const exerciseIds = Array.from(new Set(sessions.flatMap(({ sets }) => sets.map(({ actualExerciseId }) => actualExerciseId)))).sort((a, b) =>
    (exerciseById[a]?.name ?? a).localeCompare(exerciseById[b]?.name ?? b),
  );
  const [selectedExercise, setSelectedExercise] = useState(exerciseIds[0] ?? '');
  const customById = Object.fromEntries(data.customExercises.map((exercise) => [exercise.id, exercise]));
  const history = sessions.flatMap((session) => session.sets.filter(({ actualExerciseId }) => actualExerciseId === selectedExercise).map((set) => ({ date: session.date, ...set }))).slice(-8).reverse();
  const symptoms = recentSessions.reduce((counts, session) => {
    counts[session.nextMorningSignal ?? session.postCheck.signal] += 1;
    return counts;
  }, { green: 0, yellow: 0, red: 0 });
  const checkpoints = data.checkpoints.filter(({ date }) => date <= throughDate).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);

  return (
    <main>
      <p className="eyebrow">Progress</p>
      <h1 className="screen-title">Proof of the work.</h1>
      <p className="screen-intro">Consistency, useful performance, and green responses count. Partial sessions still count when stopping was the right call.</p>

      <div className="metric-grid section">
        <div className="metric-card"><span className="mini-label">28-day adherence</span><strong>{adherence == null ? '—' : `${adherence}%`}</strong><small>{recentSessions.filter(successful).length} sessions logged</small></div>
        <div className="metric-card"><span className="mini-label">7-day weight</span><strong>{pounds(weightAverage)}</strong><small>{weightAverage != null && previousAverage != null ? `${weightAverage - previousAverage > 0 ? '+' : ''}${(weightAverage - previousAverage).toFixed(1)} vs prior week` : 'Average, not a single reading'}</small></div>
        <div className="metric-card"><span className="mini-label">Recent vs prior 4 weeks</span><strong>{currentCount} / {previousCount}</strong><small>successful sessions</small></div>
        <div className="metric-card"><span className="mini-label">Impact this week</span><strong>{impactCount}</strong><small>pickup included</small></div>
      </div>

      <section className="section">
        <div className="section-heading"><h2>Bodyweight trend</h2></div>
        <div className="card"><LineChart points={weightPoints} label="Bodyweight over time" suffix=" lb" /></div>
      </section>
      <section className="section">
        <div className="section-heading"><h2>Jump trend</h2></div>
        <div className="card"><LineChart points={jumpPoints} label="Vertical jump over time" suffix=" in" /></div>
      </section>

      <section className="section">
        <div className="section-heading"><h2>Exercise history</h2></div>
        <div className="card">
          {exerciseIds.length ? (
            <>
              <div className="field">
                <label htmlFor="progress-exercise">Movement</label>
                <select id="progress-exercise" value={selectedExercise} onChange={(event) => setSelectedExercise(event.target.value)}>
                  {exerciseIds.map((id) => <option key={id} value={id}>{exerciseById[id]?.name ?? customById[id]?.name ?? titleCase(id)}</option>)}
                </select>
              </div>
              <div className="divider" />
              {history.map((set) => (
                <div className="row" key={set.id}>
                  <div className="row-main"><div className="row-title">{set.date}</div><div className="row-copy">Set {set.setIndex + 1}{set.rir != null ? ` · ${set.rir} RIR` : ''}</div></div>
                  <div className="row-value">{set.loadLb != null ? `${set.loadLb} lb` : 'Bodyweight'}{set.reps != null ? ` × ${set.reps}` : set.durationSeconds != null ? ` · ${set.durationSeconds}s` : ''}</div>
                </div>
              ))}
            </>
          ) : <div className="empty-state"><strong>No set history yet</strong><p>Completed sets will appear here automatically.</p></div>}
        </div>
      </section>

      <section className="section">
        <div className="section-heading"><h2>Health response · 28 days</h2></div>
        <div className="card">
          <div className="status-strip">
            <span className="pill green">Green {symptoms.green}</span>
            <span className="pill amber">Yellow {symptoms.yellow}</span>
            <span className="pill red">Red {symptoms.red}</span>
          </div>
          <p className="row-copy">Next-morning response is used when recorded; otherwise this shows the post-workout signal.</p>
        </div>
      </section>

      <section className="section">
        <div className="section-heading"><h2>Checkpoints</h2></div>
        <div className="card">
          {checkpoints.length ? checkpoints.map((checkpoint) => (
            <div className="row" key={checkpoint.id}>
              <div className="row-main"><div className="row-title">Block {checkpoint.block} · {checkpoint.date}</div><div className="row-copy">{checkpoint.standingJumpInches != null ? `${checkpoint.standingJumpInches}\" standing` : 'No jump test'}{checkpoint.approachTouchInches != null ? ` · ${checkpoint.approachTouchInches}\" touch` : ''}</div></div>
              <span className={`pill ${checkpoint.symptomSignal === 'yellow' ? 'amber' : checkpoint.symptomSignal}`}>{checkpoint.symptomSignal}</span>
            </div>
          )) : <div className="empty-state"><strong>No formal checkpoint yet</strong><p>Every fourth week offers one when clearance and symptoms allow.</p></div>}
        </div>
      </section>
    </main>
  );
}

type SettingsProps = {
  data: AppDataV1;
  onChange: (data: AppDataV1) => void;
  onToast: (message: string) => void;
  onStartPractice: () => void;
};

function latestClearanceRows(records: ClearanceRecord[]) {
  const today = toLocalDate();
  return CLEARANCES.map(([key, label]) => {
    const record = [...records].reverse().filter((item) => item.key === key && item.date <= today).sort((a, b) => b.date.localeCompare(a.date)).at(0);
    return { key, label, record };
  });
}

function NumberSettingRow({ id, label, value, min, max, step = 1, onCommit }: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  return (
    <div className="settings-row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = Number(draft);
          if (draft !== '' && Number.isFinite(next)) {
            const clamped = Math.min(max, Math.max(min, next));
            setDraft(String(clamped));
            onCommit(clamped);
          } else {
            setDraft(String(value));
          }
        }}
      />
    </div>
  );
}

export function SettingsScreen({ data, onChange, onToast, onStartPractice }: SettingsProps) {
  const [clearanceKey, setClearanceKey] = useState<ClearanceKey>('low_level_jump');
  const [clearanceStatus, setClearanceStatus] = useState<ClearanceStatus>('not_cleared');
  const [clearanceDate, setClearanceDate] = useState(toLocalDate());
  const [clearanceSource, setClearanceSource] = useState<ClearanceRecord['source']>('pt');
  const [clearanceLimits, setClearanceLimits] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview>();
  const fileInput = useRef<HTMLInputElement>(null);

  const changeProfile = <K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) =>
    onChange({ ...data, profile: { ...data.profile, [key]: value } });
  const toggleEquipment = (id: string) => changeProfile(
    'equipment',
    data.profile.equipment.includes(id) ? data.profile.equipment.filter((item) => item !== id) : [...data.profile.equipment, id],
  );

  const addClearance = () => {
    if (!clearanceDate) return;
    onChange({
      ...data,
      clearances: [...data.clearances, {
        id: uid(),
        key: clearanceKey,
        status: clearanceStatus,
        date: clearanceDate,
        limits: clearanceLimits.trim() || undefined,
        source: clearanceSource,
      }],
    });
    setClearanceLimits('');
    onToast(`${clearanceLabel[clearanceKey]} history updated.`);
  };

  const updatePT = (slot: PTOverride['slot'], patch: Partial<PTOverride>) => {
    const current = data.ptOverrides.find((override) => override.slot === slot) ?? { id: uid(), slot, active: false };
    onChange({ ...data, ptOverrides: [...data.ptOverrides.filter((override) => override.slot !== slot), { ...current, ...patch }] });
  };

  const readImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      setImportPreview(previewImport(await file.text()));
    } catch (error) {
      setImportPreview(undefined);
      onToast(error instanceof Error ? error.message : 'That backup could not be read.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const backup = () => {
    downloadBackup(data);
    onChange({ ...data, lastBackupAt: new Date().toISOString() });
    onToast('Backup downloaded.');
  };

  const persist = async () => {
    try {
      onToast(await requestPersistentStorage() ? 'Persistent browser storage enabled.' : 'Persistence is unavailable here; keep regular backups.');
    } catch {
      onToast('Persistence is unavailable here; keep regular backups.');
    }
  };

  return (
    <main>
      <p className="eyebrow">Settings</p>
      <h1 className="screen-title">Your program, your guardrails.</h1>
      <p className="screen-intro">Calendar dates suggest the plan. Clinician clearance and your symptom response decide what you actually perform.</p>

      <section className="section">
        <div className="section-heading"><h2>Profile & program</h2></div>
        <div className="settings-group">
          <div className="settings-row"><label htmlFor="settings-name">Name</label><input id="settings-name" value={data.profile.name} placeholder="Optional" onChange={(event) => changeProfile('name', event.target.value)} /></div>
          <div className="settings-row"><label htmlFor="settings-theme">Theme</label><select id="settings-theme" value={data.profile.theme} onChange={(event) => changeProfile('theme', event.target.value as ProfileSettings['theme'])}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
          <div className="settings-row"><label htmlFor="settings-start">Start date</label><input id="settings-start" type="date" value={data.profile.programStartDate} onChange={(event) => { const value = event.target.value; if (value && (!data.sessions.length || window.confirm('Changing the start date remaps future calendar workouts. Keep existing logs on their original dates?'))) changeProfile('programStartDate', value); }} /></div>
          <NumberSettingRow id="settings-reach" label="Standing reach (in)" value={data.profile.standingReachInches} min={30} max={120} onCommit={(value) => changeProfile('standingReachInches', value)} />
          <NumberSettingRow id="settings-upper-increment" label="Upper-body increment" value={data.profile.upperBodyIncrementLb} min={0.1} max={100} step={0.5} onCommit={(value) => changeProfile('upperBodyIncrementLb', value)} />
          <NumberSettingRow id="settings-lower-increment" label="Lower-body increment" value={data.profile.lowerBodyIncrementLb} min={0.1} max={100} step={0.5} onCommit={(value) => changeProfile('lowerBodyIncrementLb', value)} />
          <div className="settings-row"><label htmlFor="settings-weight-prompt">Daily weight prompt</label><input id="settings-weight-prompt" type="checkbox" checked={data.profile.bodyWeightPrompt} onChange={(event) => changeProfile('bodyWeightPrompt', event.target.checked)} /></div>
          <div className="settings-row"><label htmlFor="settings-alerts">Timer alerts</label><input id="settings-alerts" type="checkbox" checked={data.profile.optionalAlerts} onChange={(event) => changeProfile('optionalAlerts', event.target.checked)} /></div>
        </div>
        {data.sessions.length > 0 && <div className="notice amber top-space"><strong>Changing the program start date remaps calendar workouts.</strong> Existing logs keep their original dates and workout IDs.</div>}
      </section>

      <section className="section">
        <div className="section-heading"><h2>Equipment</h2></div>
        <div className="card"><EquipmentChips selected={data.profile.equipment} onToggle={toggleEquipment} /></div>
      </section>

      <section className="section">
        <div className="section-heading"><h2>Clearance history</h2></div>
        <div className="card">
          {latestClearanceRows(data.clearances).map(({ key, label, record }) => (
            <div className="row" key={key}>
              <div className="row-main"><div className="row-title">{label}</div><div className="row-copy">{record ? `${record.date} · ${titleCase(record.source)}${record.limits ? ` · ${record.limits}` : ''}` : 'No entry'}</div></div>
              <span className={`pill ${record?.status === 'cleared' ? 'green' : record?.status === 'cleared_with_limits' ? 'amber' : record?.status === 'not_cleared' ? 'red' : ''}`}>{record ? titleCase(record.status) : 'Unknown'}</span>
            </div>
          ))}
          <div className="divider" />
          <div className="field-row">
            <div className="field"><label htmlFor="clearance-kind">Activity</label><select id="clearance-kind" value={clearanceKey} onChange={(event) => setClearanceKey(event.target.value as ClearanceKey)}>{CLEARANCES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
            <div className="field"><label htmlFor="clearance-status">Status</label><select id="clearance-status" value={clearanceStatus} onChange={(event) => setClearanceStatus(event.target.value as ClearanceStatus)}><option value="unknown">Unknown</option><option value="not_cleared">Not cleared</option><option value="cleared_with_limits">Cleared with limits</option><option value="cleared">Cleared</option></select></div>
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="clearance-date">Date</label><input id="clearance-date" type="date" value={clearanceDate} onChange={(event) => setClearanceDate(event.target.value)} /></div>
            <div className="field"><label htmlFor="clearance-source">Source</label><select id="clearance-source" value={clearanceSource} onChange={(event) => setClearanceSource(event.target.value as ClearanceRecord['source'])}><option value="pt">PT</option><option value="orthopedist">Orthopedist</option><option value="user">User entry</option></select></div>
          </div>
          <div className="field"><label htmlFor="clearance-limits">Limits or clinician note (optional)</label><textarea id="clearance-limits" value={clearanceLimits} onChange={(event) => setClearanceLimits(event.target.value)} /></div>
          <button className="secondary-button wide top-space" type="button" onClick={addClearance}>Add history record</button>
        </div>
      </section>

      <section className="section">
        <div className="section-heading"><h2>Physical therapy overrides</h2></div>
        <div className="notice blue"><strong>Clinician dose wins.</strong> These slots replace the generic lower-body menu and are never auto-progressed.</div>
        {(['lower_a', 'lower_b'] as const).map((slot) => {
          const override = data.ptOverrides.find((item) => item.slot === slot);
          return (
            <div className="card top-space" key={slot}>
              <div className="row"><div><div className="row-title">{slot === 'lower_a' ? 'Monday · Lower A' : 'Thursday · Lower B'}</div><div className="row-copy">Use the exact movement and dose from your PT.</div></div><input aria-label={`Enable ${slot} override`} type="checkbox" checked={override?.active ?? false} onChange={(event) => updatePT(slot, { active: event.target.checked })} /></div>
              <div className="field"><label htmlFor={`${slot}-name`}>Exercise name</label><input id={`${slot}-name`} value={override?.customName ?? ''} onChange={(event) => updatePT(slot, { customName: event.target.value })} /></div>
              <div className="field-row"><div className="field"><label htmlFor={`${slot}-sets`}>Sets</label><input id={`${slot}-sets`} type="number" min="1" value={override?.sets ?? ''} onChange={(event) => updatePT(slot, { sets: event.target.value ? Number(event.target.value) : undefined })} /></div><div className="field"><label htmlFor={`${slot}-reps`}>Reps / duration</label><input id={`${slot}-reps`} value={override?.reps ?? ''} onChange={(event) => updatePT(slot, { reps: event.target.value })} /></div></div>
              <div className="field-row"><div className="field"><label htmlFor={`${slot}-range`}>Range</label><input id={`${slot}-range`} value={override?.range ?? ''} onChange={(event) => updatePT(slot, { range: event.target.value })} /></div><div className="field"><label htmlFor={`${slot}-tempo`}>Tempo</label><input id={`${slot}-tempo`} value={override?.tempo ?? ''} onChange={(event) => updatePT(slot, { tempo: event.target.value })} /></div></div>
              <div className="field"><label htmlFor={`${slot}-cue`}>Pinned PT cue</label><input id={`${slot}-cue`} value={override?.pinnedCue ?? ''} onChange={(event) => updatePT(slot, { pinnedCue: event.target.value })} /></div>
              <div className="field"><label htmlFor={`${slot}-brace`}>Brace instruction</label><input id={`${slot}-brace`} value={override?.braceInstruction ?? ''} onChange={(event) => updatePT(slot, { braceInstruction: event.target.value })} /></div>
              <div className="field"><label htmlFor={`${slot}-demo`}>Private demo link (optional)</label><input id={`${slot}-demo`} type="url" value={override?.demoUrl ?? ''} onChange={(event) => updatePT(slot, { demoUrl: event.target.value })} /></div>
            </div>
          );
        })}
      </section>

      <section className="section">
        <div className="section-heading"><h2>Data & backup</h2></div>
        <div className="settings-group">
          <div className="settings-row"><div><div className="row-title">JSON backup</div><div className="row-copy">{data.lastBackupAt ? `Last exported ${new Date(data.lastBackupAt).toLocaleDateString()}` : 'No backup recorded yet'}</div></div><button className="secondary-button" type="button" onClick={backup}>Export</button></div>
          <div className="settings-row"><div><div className="row-title">Restore backup</div><div className="row-copy">Validated and previewed before replacement</div></div><button className="secondary-button" type="button" onClick={() => fileInput.current?.click()}>Choose file</button><input className="sr-only" ref={fileInput} type="file" accept="application/json,.json" onChange={(event) => readImport(event.target.files?.[0])} /></div>
          <div className="settings-row"><div><div className="row-title">Persistent storage</div><div className="row-copy">Ask the browser not to evict local data</div></div><button className="secondary-button" type="button" onClick={persist}>Request</button></div>
        </div>
        {importPreview && (
          <div className="notice amber top-space">
            <strong>Preview this replacement</strong><br />
            {importPreview.profileName || 'Unnamed profile'} · starts {importPreview.programStartDate} · {importPreview.sessions} sessions · {importPreview.metrics} daily metrics · {importPreview.checkpoints} checkpoints
            {importPreview.lastActivityDate ? ` · latest activity ${importPreview.lastActivityDate}` : ''}
            <div className="sheet-actions">
              <button className="ghost-button" type="button" onClick={() => setImportPreview(undefined)}>Cancel</button>
              <button className="danger-button" type="button" onClick={() => { onChange(importPreview.data); setImportPreview(undefined); onToast('Backup restored.'); }}>Replace local data</button>
            </div>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-heading"><h2>Practice & reference</h2></div>
        <div className="card">
          <div className="row"><div><div className="row-title">Practice the player</div><div className="row-copy">Explore controls without writing workout data.</div></div><button className="primary-button" type="button" onClick={onStartPractice}>Practice</button></div>
          <div className="divider" />
          <details className="technique"><summary>Safety hierarchy</summary><ol className="detail-list"><li>Treating orthopedist or physical therapist.</li><li>Red, yellow, and green symptom rules.</li><li>Clearance flags and phase gates.</li><li>Timer and priority rules.</li><li>Calendar and progression suggestions.</li></ol></details>
          <details className="technique"><summary>Red response</summary><p className="row-copy top-space">Stop for giving way, locking, sharp pain, new swelling, loss of motion, new numbness or weakness, radiating pain, or symptoms that keep worsening for 24–48 hours. Contact the treating clinician; do not retest under fatigue.</p></details>
          <details className="technique"><summary>About this program</summary><p className="row-copy top-space">This is a training framework, not a diagnosis or a substitute for medical care. A calendar date never grants clearance.</p></details>
        </div>
      </section>
    </main>
  );
}
