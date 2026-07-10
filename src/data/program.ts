import type { BlockDefinition, SegmentExercise, WorkoutSegment, WorkoutTemplate } from '../types';

type SegmentOptions = Pick<WorkoutSegment, 'targetRounds' | 'restSeconds' | 'notes' | 'substitutionWorkoutId'>;

const segment = (
  id: string,
  label: string,
  startSecond: number,
  endSecond: number,
  mode: WorkoutSegment['mode'],
  flow: WorkoutSegment['flow'],
  exercises: SegmentExercise[],
  options: Partial<SegmentOptions> = {},
): WorkoutSegment => ({ id, label, startSecond, endSecond, mode, flow, exercises, notes: [], ...options });

const workout = (definition: Omit<WorkoutTemplate, 'mainDurationSeconds'>): WorkoutTemplate => ({
  ...definition,
  mainDurationSeconds: 1200,
});

export const prep5Segments: WorkoutSegment[] = [
  segment('prep_heat', 'Raise temperature', 0, 60, 'mandatory_prep', 'single', [{ exerciseId: 'easy_bike_walk_dribble', durationSeconds: 60 }]),
  segment('prep_ankle', 'Ankles and calves', 60, 120, 'mandatory_prep', 'circuit', [
    { exerciseId: 'ankle_rock', repsText: '5 per side', perSide: true },
    { exerciseId: 'standing_calf_raise', repsText: '8' },
  ]),
  segment('prep_pattern', 'Hinge and squat', 120, 180, 'mandatory_prep', 'circuit', [
    { exerciseId: 'hip_hinge_drill', repsText: '6' },
    { exerciseId: 'squat_to_target', repsText: '6' },
  ]),
  segment('prep_activation', 'Knee and hip activation', 180, 240, 'mandatory_prep', 'single', [{ exerciseId: 'tke', repsText: 'PT-approved dose' }], { notes: ['Use lateral band steps or glute bridges instead when that is the PT-approved movement.'] }),
  segment('prep_specific', 'Specific ramp', 240, 300, 'mandatory_prep', 'single', [{ exerciseId: 'squat_to_target', repsText: '2–3 light reps' }], { notes: ['For cleared impact work, use 2 × 3 snap-downs or low pogos instead.'] }),
];

export const compressedPrepSegments: WorkoutSegment[] = [
  segment('compressed_heat', 'Raise temperature', 0, 60, 'mandatory_prep', 'single', [{ exerciseId: 'easy_walk', durationSeconds: 60 }]),
  segment('compressed_joint', 'Joint-specific movement', 60, 120, 'mandatory_prep', 'single', [{ exerciseId: 'hip_hinge_drill', repsText: '5–8 controlled reps' }]),
  segment('compressed_ramp', 'Specific ramp set', 120, 180, 'mandatory_prep', 'single', [{ exerciseId: 'incline_pushup', repsText: '1–2 easy sets' }], { notes: ['Use a light version of today’s first exercise. Never use this compressed prep before impact or heavy lower-body work.'] }),
];

export const cooldownSegments: WorkoutSegment[] = [
  segment('cooldown_move', 'Easy movement', 0, 60, 'optional_if_time', 'single', [{ exerciseId: 'easy_walk', durationSeconds: 60 }]),
  segment('cooldown_breathe', 'Downshift breathing', 60, 120, 'optional_if_time', 'single', [{ exerciseId: 'downshift_breathing', durationSeconds: 60 }]),
  segment('cooldown_log', 'Mobility or quick log', 120, 180, 'optional_if_time', 'single', [{ exerciseId: 'gentle_mobility_log', durationSeconds: 60 }]),
];

export const workouts: WorkoutTemplate[] = [
  workout({
    id: 'lower_strength_a', name: 'Lower Strength A — Force & Bracing', shortName: 'Lower A',
    purpose: 'Build bilateral force, unilateral control, trunk bracing, and lower-leg capacity.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['lower', 'strength', 'high-muscular'], clearanceRequired: ['squat_loading'], nonImpactWorkoutId: 'lower_strength_a_pt',
    segments: [
      segment('lower_a_main', 'Main lift', 0, 480, 'time_boxed_move_on', 'single', [{ exerciseId: 'trap_bar_deadlift', targetSets: 4, repRange: [4, 6] }], { restSeconds: 120, notes: ['Start every two minutes. Stop with two reps in reserve; skip a start rather than compressing rest.'] }),
      segment('lower_a_pair', 'Unilateral + carry', 480, 960, 'time_boxed_move_on', 'superset', [
        { exerciseId: 'split_squat', targetSets: 3, repRange: [6, 8], perSide: true },
        { exerciseId: 'suitcase_carry', targetSets: 3, durationSeconds: 25, perSide: true },
      ], { targetRounds: 3, restSeconds: 60 }),
      segment('lower_a_finish', 'Calf + tibialis', 960, 1200, 'time_boxed_move_on', 'superset', [
        { exerciseId: 'standing_calf_raise', targetSets: 2, repRange: [8, 12] },
        { exerciseId: 'tibialis_raise', targetSets: 2, repRange: [12, 20] },
      ], { targetRounds: 2 }),
    ],
  }),
  workout({
    id: 'lower_strength_a_pt', name: 'Lower Strength A — PT Version', shortName: 'Lower A · PT',
    purpose: 'Put the current clinician-prescribed squat, step, and quadriceps work inside a 20-minute clock.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['lower', 'rehab'], clearanceRequired: [],
    segments: [
      segment('pt_lower_a_main', 'PT bilateral / quadriceps slot', 0, 600, 'clinician_prescribed', 'single', [{ exerciseId: 'squat_to_target', repsText: 'Use PT dose' }], { notes: ['Your active Lower A PT override replaces this placeholder. Do not add depth or load from the generic program.'] }),
      segment('pt_lower_a_unilateral', 'PT step / unilateral slot', 600, 960, 'clinician_prescribed', 'single', [{ exerciseId: 'step_up', repsText: 'Use PT dose', perSide: true }], { notes: ['Your active Lower A PT override controls exercise, range, tempo, and brace use.'] }),
      segment('pt_lower_a_finish', 'Approved lower-leg work', 960, 1200, 'clinician_prescribed', 'superset', [
        { exerciseId: 'standing_calf_raise', repsText: 'Approved dose' },
        { exerciseId: 'tibialis_raise', repsText: 'Approved dose' },
      ]),
    ],
  }),
  workout({
    id: 'lower_strength_a_max', name: 'Lower Strength A — Max Strength', shortName: 'Lower A · Heavy',
    purpose: 'Develop force with brief, non-grinding 3–5 rep work.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['lower', 'max-strength'], clearanceRequired: ['squat_loading'], nonImpactWorkoutId: 'lower_strength_a_pt',
    segments: [
      segment('lower_max_main', 'Heavy main lift', 0, 600, 'time_boxed_move_on', 'single', [{ exerciseId: 'trap_bar_deadlift', targetSets: 4, repRange: [3, 5] }], { restSeconds: 120, notes: ['No true 1RM and no grinding.'] }),
      segment('lower_max_unilateral', 'Unilateral strength', 600, 1020, 'time_boxed_move_on', 'single', [{ exerciseId: 'split_squat', targetSets: 3, repRange: [5, 6], perSide: true }], { restSeconds: 75 }),
      segment('lower_max_calf', 'Heavy calf', 1020, 1200, 'time_boxed_move_on', 'single', [{ exerciseId: 'standing_calf_raise', targetSets: 2, repRange: [6, 10] }]),
    ],
  }),
  workout({
    id: 'lower_strength_a_contrast', name: 'Lower Strength A — Contrast', shortName: 'Lower A · Contrast',
    purpose: 'Pair heavy force with a tiny dose of fast, cleared jumping.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['lower', 'strength-speed', 'impact'], clearanceRequired: ['squat_loading', 'max_jump'], nonImpactWorkoutId: 'lower_strength_a_pt',
    segments: [
      segment('contrast_pair', 'Heavy triple + fast jump', 0, 720, 'quality_limited', 'superset', [
        { exerciseId: 'trap_bar_deadlift', targetSets: 3, repRange: [3, 3] },
        { exerciseId: 'countermovement_jump', targetSets: 3, repsText: '2 crisp reps' },
      ], { targetRounds: 3, restSeconds: 120, notes: ['Reset fully between rounds. Stop the jumps at the first clear decline.'] }),
      segment('contrast_unilateral', 'Unilateral strength', 720, 1020, 'time_boxed_move_on', 'single', [{ exerciseId: 'split_squat', targetSets: 2, repRange: [4, 6], perSide: true }], { restSeconds: 75 }),
      segment('contrast_calf', 'Calf capacity', 1020, 1200, 'time_boxed_move_on', 'single', [{ exerciseId: 'standing_calf_raise', targetSets: 2, repRange: [8, 12] }]),
    ],
  }),
  workout({
    id: 'lower_strength_a_maintenance', name: 'Lower Strength A — Brief Maintenance', shortName: 'Lower A · Brief',
    purpose: 'Keep strength intensity while protecting jump quality and recovery.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['lower', 'maintenance'], clearanceRequired: ['squat_loading'], nonImpactWorkoutId: 'lower_strength_a_pt',
    segments: [
      segment('maintain_main', 'Brief heavy lift', 0, 600, 'time_boxed_move_on', 'single', [{ exerciseId: 'trap_bar_deadlift', targetSets: 3, repRange: [3, 5] }], { restSeconds: 120 }),
      segment('maintain_split', 'Unilateral maintenance', 600, 960, 'time_boxed_move_on', 'single', [{ exerciseId: 'split_squat', targetSets: 2, repRange: [5, 6], perSide: true }], { restSeconds: 75 }),
      segment('maintain_lower_leg', 'Lower-leg maintenance', 960, 1200, 'time_boxed_move_on', 'superset', [
        { exerciseId: 'standing_calf_raise', targetSets: 2, repRange: [8, 12] },
        { exerciseId: 'tibialis_raise', targetSets: 2, repRange: [12, 20] },
      ]),
    ],
  }),
  workout({
    id: 'lower_strength_a_taper', name: 'Lower Strength A — Taper', shortName: 'Lower A · Taper',
    purpose: 'Preserve intensity with half the usual work.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['lower', 'taper'], clearanceRequired: ['squat_loading'], nonImpactWorkoutId: 'lower_strength_a_pt',
    segments: [
      segment('taper_main', 'Crisp strength', 0, 600, 'time_boxed_move_on', 'single', [{ exerciseId: 'trap_bar_deadlift', targetSets: 2, repRange: [3, 4] }], { restSeconds: 150, notes: ['No grinding. Stop while fresh.'] }),
      segment('taper_calf', 'Easy lower-leg work', 600, 900, 'optional_if_time', 'superset', [
        { exerciseId: 'standing_calf_raise', targetSets: 1, repRange: [8, 10] },
        { exerciseId: 'tibialis_raise', targetSets: 1, repRange: [10, 15] },
      ]),
      segment('taper_easy', 'Easy movement', 900, 1200, 'optional_if_time', 'single', [{ exerciseId: 'easy_walk', durationSeconds: 300 }]),
    ],
  }),
  workout({
    id: 'upper_strength_a', name: 'Upper Strength A — Push, Pull & Trunk', shortName: 'Upper A',
    purpose: 'Build upper-body muscle and shoulder balance without draining the legs.',
    warmup: 'compressed_3', cooldown: 'cooldown_3', stressTags: ['upper', 'strength'], clearanceRequired: [],
    segments: [
      segment('upper_a_horizontal', 'Bench + row', 0, 480, 'time_boxed_move_on', 'superset', [
        { exerciseId: 'bench_press', targetSets: 3, repRange: [6, 10] },
        { exerciseId: 'one_arm_db_row', targetSets: 3, repRange: [8, 12], perSide: true },
      ], { targetRounds: 3, restSeconds: 60 }),
      segment('upper_a_vertical', 'Vertical pull + press', 480, 960, 'time_boxed_move_on', 'superset', [
        { exerciseId: 'pullup_chinup', targetSets: 3, repRange: [4, 8] },
        { exerciseId: 'half_kneeling_db_press', targetSets: 3, repRange: [6, 10], perSide: true },
      ], { targetRounds: 3, restSeconds: 60 }),
      segment('upper_a_carry', 'Carry / trunk', 960, 1200, 'time_boxed_move_on', 'single', [{ exerciseId: 'suitcase_carry', targetSets: 2, durationSeconds: 35, perSide: true }]),
    ],
  }),
  workout({
    id: 'jump_speed_a', name: 'Jump-Speed A — Quality', shortName: 'Jump + Speed',
    purpose: 'Train landing, elastic power, acceleration, and approach skill with full-quality rest.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['impact', 'power', 'speed'], clearanceRequired: ['low_level_jump', 'max_jump', 'acceleration'], nonImpactWorkoutId: 'jump_speed_nonimpact',
    segments: [
      segment('jump_landing', 'Landing + elastic prep', 0, 240, 'quality_limited', 'circuit', [
        { exerciseId: 'snap_down', targetSets: 2, repsText: '3' },
        { exerciseId: 'low_pogo', targetSets: 2, repRange: [8, 12] },
      ], { targetRounds: 2, restSeconds: 45 }),
      segment('jump_max', 'Max jump', 240, 600, 'quality_limited', 'single', [{ exerciseId: 'countermovement_jump', targetSets: 8, repsText: '1 crisp rep' }], { restSeconds: 60, notes: ['Do 6–8 total. Stop after two declining reps.'] }),
      segment('jump_accel', 'Acceleration', 600, 960, 'quality_limited', 'single', [{ exerciseId: 'acceleration_10_15yd', targetSets: 6, repsText: '10–15 yards' }], { restSeconds: 75, notes: ['Walk back fully.'] }),
      segment('jump_skill', 'Approach skill', 960, 1200, 'quality_limited', 'single', [{ exerciseId: 'approach_touch', targetSets: 5, repsText: '1 quality attempt' }], { restSeconds: 60 }),
    ],
  }),
  workout({
    id: 'jump_speed_nonimpact', name: 'Non-impact Jump-Speed Substitute', shortName: 'Bike + Balance',
    purpose: 'Preserve conditioning and lower-leg capacity while impact is not cleared.',
    warmup: 'none', cooldown: 'cooldown_3', stressTags: ['conditioning', 'non-impact'], clearanceRequired: [],
    segments: [
      segment('nonimpact_intervals', 'Brisk / easy intervals', 0, 600, 'time_boxed_move_on', 'intervals', [{ exerciseId: 'bike_brisk_intervals', targetSets: 10, durationSeconds: 60 }], { targetRounds: 10, notes: ['40 seconds brisk, 20 seconds easy. Walking is the zero-equipment option.'] }),
      segment('nonimpact_balance', 'Balance + calf', 600, 1200, 'time_boxed_move_on', 'circuit', [
        { exerciseId: 'single_leg_balance_reach', targetSets: 2, durationSeconds: 30, perSide: true },
        { exerciseId: 'calf_isometric', targetSets: 2, durationSeconds: 30 },
        { exerciseId: 'band_ankle_eversion', targetSets: 2, repRange: [12, 20], perSide: true },
      ], { targetRounds: 2 }),
    ],
  }),
  workout({
    id: 'jump_speed_return', name: 'Return to Run & Land', shortName: 'Return to Impact',
    purpose: 'Reintroduce low-amplitude landing, submaximal jumping, and straight-line speed only after clearance.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['impact', 'return-to-run'], clearanceRequired: ['low_level_jump', 'jogging'], nonImpactWorkoutId: 'jump_speed_nonimpact',
    segments: [
      segment('return_landing', 'Landing control', 0, 360, 'quality_limited', 'circuit', [
        { exerciseId: 'snap_down', targetSets: 2, repsText: '3' },
        { exerciseId: 'low_pogo', targetSets: 2, repsText: '8 low contacts' },
      ], { targetRounds: 2, restSeconds: 60 }),
      segment('return_jump', 'Submaximal jump', 360, 720, 'quality_limited', 'single', [{ exerciseId: 'submax_countermovement_jump', targetSets: 6, repsText: '1 at approved effort' }], { restSeconds: 60 }),
      segment('return_run', 'Straight-line run', 720, 1080, 'quality_limited', 'single', [{ exerciseId: 'acceleration_10_15yd', targetSets: 4, repsText: '10 yards at 70–80%' }], { restSeconds: 75, notes: ['Use walk-jog if acceleration is not cleared.'] }),
      segment('return_balance', 'Balance reset', 1080, 1200, 'optional_if_time', 'single', [{ exerciseId: 'single_leg_balance_reach', durationSeconds: 30, perSide: true }]),
    ],
  }),
  workout({
    id: 'jump_speed_contrast', name: 'Jump-Speed — Strength-Speed', shortName: 'Strength-Speed',
    purpose: 'Convert strength into faster force with light loaded jumps, acceleration, and approach work.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['impact', 'strength-speed'], clearanceRequired: ['max_jump', 'acceleration'], nonImpactWorkoutId: 'jump_speed_nonimpact',
    segments: [
      segment('ss_loaded_jump', 'Light loaded jump', 0, 480, 'quality_limited', 'single', [{ exerciseId: 'light_loaded_jump', targetSets: 4, repsText: '2 fast reps' }], { restSeconds: 75 }),
      segment('ss_accel', 'Acceleration', 480, 840, 'quality_limited', 'single', [{ exerciseId: 'acceleration_10_15yd', targetSets: 5, repsText: '10–15 yards' }], { restSeconds: 75 }),
      segment('ss_approach', 'Approach jump', 840, 1200, 'quality_limited', 'single', [{ exerciseId: 'approach_touch', targetSets: 5, repsText: '1 quality attempt' }], { restSeconds: 75 }),
    ],
  }),
  workout({
    id: 'jump_speed_reactive', name: 'Jump-Speed — Reactive Elasticity', shortName: 'Reactive',
    purpose: 'Develop quick, quiet contacts, faster acceleration, and controlled lateral work.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['impact', 'reactive'], clearanceRequired: ['max_jump', 'acceleration', 'lateral_cutting'], nonImpactWorkoutId: 'jump_speed_nonimpact',
    segments: [
      segment('reactive_pogo', 'Pogo + low drop', 0, 360, 'quality_limited', 'circuit', [
        { exerciseId: 'low_pogo', targetSets: 2, repRange: [8, 12] },
        { exerciseId: 'drop_to_stick', targetSets: 2, repsText: '3' },
      ], { targetRounds: 2, restSeconds: 60 }),
      segment('reactive_bound', 'Bound / lateral hop', 360, 720, 'quality_limited', 'single', [{ exerciseId: 'bound_or_lateral_hop', targetSets: 3, repsText: '3 low contacts per side', perSide: true }], { restSeconds: 75 }),
      segment('reactive_accel', 'Acceleration', 720, 960, 'quality_limited', 'single', [{ exerciseId: 'acceleration_10_15yd', targetSets: 4, repsText: '10–15 yards' }], { restSeconds: 75 }),
      segment('reactive_approach', 'Approach jump', 960, 1200, 'quality_limited', 'single', [{ exerciseId: 'approach_touch', targetSets: 3, repsText: '1 quality attempt' }], { restSeconds: 75 }),
    ],
  }),
  workout({
    id: 'jump_speed_dunk', name: 'Dunk Skill — Approach & Low Rim', shortName: 'Dunk Skill',
    purpose: 'Practice repeatable approach rhythm and clean low-rim makes without fatigue chasing.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['impact', 'dunk-skill'], clearanceRequired: ['max_jump', 'basketball_practice'], nonImpactWorkoutId: 'jump_speed_nonimpact',
    segments: [
      segment('dunk_rhythm', 'Approach rhythm', 0, 360, 'quality_limited', 'single', [{ exerciseId: 'approach_touch', targetSets: 5, repsText: '1 smooth rep' }], { restSeconds: 75 }),
      segment('dunk_attempts', 'Low-rim makes', 360, 1020, 'quality_limited', 'single', [{ exerciseId: 'low_rim_dunk', targetSets: 8, repsText: '1 clean attempt' }], { restSeconds: 90, notes: ['Choose a makeable height. Lower the rim after repeated misses or poor landings.'] }),
      segment('dunk_calf', 'Lower-leg reset', 1020, 1200, 'optional_if_time', 'single', [{ exerciseId: 'calf_isometric', targetSets: 2, durationSeconds: 30 }]),
    ],
  }),
  workout({
    id: 'jump_speed_taper', name: 'Jump-Speed — Peak & Taper', shortName: 'Jump Taper',
    purpose: 'Keep a few maximal approach reps while cutting volume in half.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['impact', 'taper'], clearanceRequired: ['max_jump'], nonImpactWorkoutId: 'jump_speed_nonimpact',
    segments: [
      segment('taper_jump', 'Few maximal jumps', 0, 600, 'quality_limited', 'single', [{ exerciseId: 'approach_touch', targetSets: 4, repsText: '1 maximal-quality rep' }], { restSeconds: 120, notes: ['Stop at the first decline.'] }),
      segment('taper_skill', 'Easy approach rehearsal', 600, 900, 'quality_limited', 'single', [{ exerciseId: 'approach_touch', targetSets: 2, repsText: '1 submaximal rhythm rep' }], { restSeconds: 90 }),
      segment('taper_walk', 'Downshift', 900, 1200, 'optional_if_time', 'single', [{ exerciseId: 'easy_walk', durationSeconds: 300 }]),
    ],
  }),
  workout({
    id: 'lower_strength_b', name: 'Lower Strength B — Single-Leg & Posterior Chain', shortName: 'Lower B',
    purpose: 'Build unilateral control, hip strength, deceleration capacity, and lower-leg resilience.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['lower', 'strength'], clearanceRequired: ['squat_loading', 'heavy_hamstring'], nonImpactWorkoutId: 'lower_strength_b_pt',
    segments: [
      segment('lower_b_squat', 'Squat / split squat', 0, 480, 'time_boxed_move_on', 'single', [{ exerciseId: 'front_squat', targetSets: 4, repRange: [5, 8] }], { restSeconds: 90, notes: ['Use heel-elevated squat or split squat when that fits the approved range better.'] }),
      segment('lower_b_hinge', 'Hinge / hip extension', 480, 900, 'time_boxed_move_on', 'single', [{ exerciseId: 'romanian_deadlift', targetSets: 3, repRange: [6, 10] }], { restSeconds: 90 }),
      segment('lower_b_ankle', 'Soleus + ankle', 900, 1200, 'time_boxed_move_on', 'superset', [
        { exerciseId: 'soleus_raise', targetSets: 2, repRange: [10, 15], perSide: true },
        { exerciseId: 'band_ankle_eversion', targetSets: 2, repRange: [12, 20], perSide: true },
      ], { targetRounds: 2 }),
    ],
  }),
  workout({
    id: 'lower_strength_b_pt', name: 'Lower Strength B — PT Version', shortName: 'Lower B · PT',
    purpose: 'Use the clinician-approved unilateral and posterior-chain menu without generic progression.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['lower', 'rehab'], clearanceRequired: [],
    segments: [
      segment('pt_lower_b_unilateral', 'PT unilateral slot', 0, 600, 'clinician_prescribed', 'single', [{ exerciseId: 'supported_split_squat', repsText: 'Use PT dose', perSide: true }], { notes: ['Your active Lower B PT override replaces this placeholder.'] }),
      segment('pt_lower_b_posterior', 'PT posterior-chain slot', 600, 960, 'clinician_prescribed', 'single', [{ exerciseId: 'glute_bridge', repsText: 'Use PT dose' }], { notes: ['No isolated or heavy hamstring loading until specifically cleared.'] }),
      segment('pt_lower_b_ankle', 'Approved soleus / ankle work', 960, 1200, 'clinician_prescribed', 'superset', [
        { exerciseId: 'soleus_raise', repsText: 'Approved dose', perSide: true },
        { exerciseId: 'band_ankle_eversion', repsText: 'Approved dose', perSide: true },
      ]),
    ],
  }),
  workout({
    id: 'lower_strength_b_max', name: 'Lower Strength B — Heavy', shortName: 'Lower B · Heavy',
    purpose: 'Build heavy squat and hinge strength while maintaining control.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['lower', 'max-strength'], clearanceRequired: ['squat_loading', 'heavy_hamstring'], nonImpactWorkoutId: 'lower_strength_b_pt',
    segments: [
      segment('lower_b_max_squat', 'Heavy squat', 0, 540, 'time_boxed_move_on', 'single', [{ exerciseId: 'front_squat', targetSets: 4, repRange: [3, 6] }], { restSeconds: 120 }),
      segment('lower_b_max_hinge', 'Hinge', 540, 960, 'time_boxed_move_on', 'single', [{ exerciseId: 'romanian_deadlift', targetSets: 3, repRange: [5, 8] }], { restSeconds: 90 }),
      segment('lower_b_max_soleus', 'Soleus + ankle', 960, 1200, 'time_boxed_move_on', 'superset', [
        { exerciseId: 'soleus_raise', targetSets: 2, repRange: [8, 12], perSide: true },
        { exerciseId: 'band_ankle_eversion', targetSets: 2, repRange: [12, 20], perSide: true },
      ]),
    ],
  }),
  workout({
    id: 'lower_strength_b_maintenance', name: 'Lower Strength B — Maintenance', shortName: 'Lower B · Brief',
    purpose: 'Keep unilateral and posterior-chain strength without competing with dunk work.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['lower', 'maintenance'], clearanceRequired: ['squat_loading', 'heavy_hamstring'], nonImpactWorkoutId: 'lower_strength_b_pt',
    segments: [
      segment('lower_b_maint_split', 'Unilateral strength', 0, 480, 'time_boxed_move_on', 'single', [{ exerciseId: 'split_squat', targetSets: 3, repRange: [4, 6], perSide: true }], { restSeconds: 90 }),
      segment('lower_b_maint_hinge', 'Hinge', 480, 900, 'time_boxed_move_on', 'single', [{ exerciseId: 'romanian_deadlift', targetSets: 2, repRange: [5, 8] }], { restSeconds: 105 }),
      segment('lower_b_maint_calf', 'Soleus + ankle', 900, 1200, 'time_boxed_move_on', 'superset', [
        { exerciseId: 'soleus_raise', targetSets: 2, repRange: [10, 15], perSide: true },
        { exerciseId: 'band_ankle_eversion', targetSets: 1, repRange: [12, 20], perSide: true },
      ]),
    ],
  }),
  workout({
    id: 'lower_strength_b_taper', name: 'Lower Strength B — Light Maintenance', shortName: 'Lower B · Taper',
    purpose: 'Perform a light maintenance dose, then taper before final testing.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['lower', 'taper'], clearanceRequired: ['squat_loading'], nonImpactWorkoutId: 'lower_strength_b_pt',
    segments: [
      segment('lower_b_taper_split', 'Light unilateral work', 0, 480, 'time_boxed_move_on', 'single', [{ exerciseId: 'split_squat', targetSets: 2, repRange: [4, 6], perSide: true }], { restSeconds: 90 }),
      segment('lower_b_taper_calf', 'Easy lower leg', 480, 720, 'optional_if_time', 'superset', [
        { exerciseId: 'soleus_raise', targetSets: 1, repRange: [8, 10], perSide: true },
        { exerciseId: 'ankle_eversion_iso', targetSets: 1, durationSeconds: 20, perSide: true },
      ]),
      segment('lower_b_taper_easy', 'Easy movement', 720, 1200, 'optional_if_time', 'single', [{ exerciseId: 'easy_walk', durationSeconds: 480 }]),
    ],
  }),
  workout({
    id: 'upper_strength_b', name: 'Upper Strength B + Primer', shortName: 'Upper B',
    purpose: 'Add upper-body strength and a tiny primer while arriving fresh for Saturday.',
    warmup: 'compressed_3', cooldown: 'cooldown_3', stressTags: ['upper', 'strength', 'primer'], clearanceRequired: [],
    segments: [
      segment('upper_b_press_pull', 'Press + pull', 0, 480, 'time_boxed_move_on', 'superset', [
        { exerciseId: 'overhead_press', targetSets: 3, repRange: [6, 10] },
        { exerciseId: 'chest_supported_row', targetSets: 3, repRange: [6, 10] },
      ], { targetRounds: 3, restSeconds: 60 }),
      segment('upper_b_accessory', 'Push + rear shoulder', 480, 900, 'time_boxed_move_on', 'superset', [
        { exerciseId: 'dip_or_pushup', targetSets: 3, repRange: [6, 15] },
        { exerciseId: 'band_face_pull', targetSets: 3, repRange: [12, 20] },
      ], { targetRounds: 3, restSeconds: 45 }),
      segment('upper_b_power', 'Trunk power', 900, 1080, 'quality_limited', 'single', [{ exerciseId: 'med_ball_scoop_toss', targetSets: 3, repRange: [3, 5] }], { restSeconds: 45, notes: ['Use suitcase carry or shadow power if no medicine ball.'] }),
      segment('upper_b_primer', 'Saturday primer', 1080, 1200, 'optional_if_time', 'single', [{ exerciseId: 'calf_isometric', targetSets: 2, durationSeconds: 30 }], { notes: ['When impact-cleared, 2 × 3 low pogos and two submaximal approach jumps may replace this. Finish sharper, not tired.'] }),
    ],
  }),
  workout({
    id: 'saturday_early_rehab', name: 'Early-Rehab Skill / Conditioning', shortName: 'Easy Skill',
    purpose: 'Condition safely and maintain the daily habit without unapproved pivots, cuts, or jumps.',
    warmup: 'none', cooldown: 'cooldown_3', stressTags: ['conditioning', 'non-impact'], clearanceRequired: [],
    segments: [
      segment('early_intervals', 'Brisk / easy intervals', 0, 600, 'time_boxed_move_on', 'intervals', [{ exerciseId: 'bike_brisk_intervals', targetSets: 10, durationSeconds: 60 }], { targetRounds: 10 }),
      segment('early_skill', 'Balance + easy skill', 600, 1200, 'time_boxed_move_on', 'circuit', [
        { exerciseId: 'single_leg_balance_reach', durationSeconds: 30, perSide: true },
        { exerciseId: 'calf_isometric', durationSeconds: 30 },
        { exerciseId: 'easy_walk', durationSeconds: 120 },
      ], { targetRounds: 2, notes: ['Stationary handles or form shooting are optional only within current brace and clinician guidance.'] }),
    ],
  }),
  workout({
    id: 'saturday_conditioning', name: 'Basketball or Conditioning', shortName: 'Court / Conditioning',
    purpose: 'Use controlled court work when cleared, otherwise use non-impact conditioning.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['conditioning', 'basketball'], clearanceRequired: ['basketball_practice'], nonImpactWorkoutId: 'saturday_early_rehab',
    segments: [
      segment('court_tempo_rounds', 'Controlled court tempo', 0, 600, 'time_boxed_move_on', 'intervals', [{ exerciseId: 'court_tempo', targetSets: 10, durationSeconds: 60 }], { targetRounds: 10, notes: ['40 seconds smooth work, 20 seconds walking. Mostly submaximal finishes.'] }),
      segment('court_easy_skill', 'Easy shooting / dribble', 600, 1200, 'time_boxed_move_on', 'single', [{ exerciseId: 'court_tempo', durationSeconds: 600 }], { notes: ['Keep this easy. Fully cleared pickup replaces this entire session and counts as a high-impact exposure.'] }),
    ],
  }),
  workout({
    id: 'saturday_dunk_or_pickup', name: 'Pickup or Second Dunk Skill', shortName: 'Pickup / Dunk',
    purpose: 'Use one high-impact exposure: pickup or controlled dunk practice, never both hard.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['impact', 'basketball', 'dunk-skill'], clearanceRequired: ['max_jump', 'basketball_practice'], nonImpactWorkoutId: 'saturday_early_rehab',
    segments: [
      segment('sat_dunk_rhythm', 'Approach rhythm', 0, 360, 'quality_limited', 'single', [{ exerciseId: 'approach_touch', targetSets: 4, repsText: '1 smooth rep' }], { restSeconds: 75 }),
      segment('sat_dunk_attempt', 'Low-rim skill', 360, 1020, 'quality_limited', 'single', [{ exerciseId: 'low_rim_dunk', targetSets: 6, repsText: '1 clean attempt' }], { restSeconds: 90, notes: ['If pickup is logged, skip this workout entirely.'] }),
      segment('sat_dunk_easy', 'Easy downshift', 1020, 1200, 'optional_if_time', 'single', [{ exerciseId: 'easy_walk', durationSeconds: 180 }]),
    ],
  }),
  workout({
    id: 'armor_zone2', name: 'Armor + Easy Aerobic', shortName: 'Armor + Zone 2',
    purpose: 'Build ankle, calf, trunk, balance, and aerobic capacity at low cost.',
    warmup: 'none', cooldown: 'cooldown_3', stressTags: ['recovery', 'resilience'], clearanceRequired: [],
    segments: [
      segment('armor_circuit', 'Armor circuit', 0, 600, 'time_boxed_move_on', 'circuit', [
        { exerciseId: 'single_leg_balance_reach', targetSets: 2, durationSeconds: 30, perSide: true },
        { exerciseId: 'band_ankle_eversion', targetSets: 2, repsText: '15 per side', perSide: true },
        { exerciseId: 'soleus_raise', targetSets: 2, repsText: '12 per side', perSide: true },
        { exerciseId: 'suitcase_march', targetSets: 2, durationSeconds: 30, perSide: true },
      ], { targetRounds: 2 }),
      segment('armor_aerobic', 'Easy aerobic', 600, 1200, 'time_boxed_move_on', 'single', [{ exerciseId: 'easy_bike_walk_dribble', durationSeconds: 600 }], { notes: ['Talk-test pace. This is not HIIT.'] }),
    ],
  }),
  workout({
    id: 'final_test', name: 'Final Test & Review', shortName: 'Final Test',
    purpose: 'Record final jump, strength, lower-leg, and durability checkpoints after two easy days.',
    warmup: 'prep_5', cooldown: 'cooldown_3', stressTags: ['checkpoint', 'impact'], clearanceRequired: ['max_jump', 'squat_loading'], nonImpactWorkoutId: 'armor_zone2',
    segments: [
      segment('test_cmj', 'Standing jump', 0, 300, 'quality_limited', 'single', [{ exerciseId: 'countermovement_jump', targetSets: 3, repsText: 'Best of 3' }], { restSeconds: 75 }),
      segment('test_approach', 'Approach touch', 300, 720, 'quality_limited', 'single', [{ exerciseId: 'approach_touch', targetSets: 6, repsText: 'Best of 4–6' }], { restSeconds: 75 }),
      segment('test_strength', 'Clean strength set', 720, 1020, 'quality_limited', 'single', [{ exerciseId: 'trap_bar_deadlift', targetSets: 1, repRange: [4, 6] }], { restSeconds: 120, notes: ['Use a familiar load. This is not a 1RM.'] }),
      segment('test_calf', 'Calf quality count', 1020, 1200, 'quality_limited', 'single', [{ exerciseId: 'standing_calf_raise', targetSets: 1, repsText: 'Up to 25; stop when height drops', perSide: true }]),
    ],
  }),
];

/** JavaScript weekday keys: Sunday = 0, Monday = 1, … Saturday = 6. */
export const weekdayWorkoutIds: Record<number, string> = {
  0: 'armor_zone2',
  1: 'lower_strength_a',
  2: 'upper_strength_a',
  3: 'jump_speed_a',
  4: 'lower_strength_b',
  5: 'upper_strength_b',
  6: 'saturday_conditioning',
};

/** Program days 0–2: Friday July 10 through Sunday July 12, 2026. */
export const orientationWorkoutIds = ['upper_strength_b', 'saturday_early_rehab', 'armor_zone2'] as const;

export const blocks: BlockDefinition[] = [
  { number: 1, title: 'Protect and Restore', theme: 'PT-led recovery', objective: 'Restore range, quadriceps activation, gait, swelling control, trunk strength, and easy aerobic work.', guardrail: 'No running, jumping, cutting, deep loaded flexion, or isolated hamstring loading unless explicitly cleared.', exitTarget: 'Full extension, improving flexion, no reactive swelling, and normalizing gait.', workoutOverrides: { 1: 'lower_strength_a_pt', 3: 'jump_speed_nonimpact', 4: 'lower_strength_b_pt', 6: 'saturday_early_rehab' } },
  { number: 2, title: 'Rebuild Basic Capacity', theme: 'Controlled strength and balance', objective: 'Rebuild approved squat and step patterns, calf and soleus capacity, balance, and aerobic work.', guardrail: 'Impact remains conditional; lower-body slots use PT-approved movements and ranges.', exitTarget: 'Comfortable daily activity, better single-leg control, and a ready-to-run assessment.', workoutOverrides: { 1: 'lower_strength_a_pt', 3: 'jump_speed_nonimpact', 4: 'lower_strength_b_pt', 6: 'saturday_early_rehab' } },
  { number: 3, title: 'Return to Run and Land', theme: 'Low-level impact', objective: 'Introduce walk-jog, snap-downs, low pogos, straight-line acceleration, and deceleration.', guardrail: 'Only after clearance; keep jumps low amplitude and do not cut or play pickup.', exitTarget: 'No next-day swelling, quiet symmetrical landings, and controlled straight-line speed.', workoutOverrides: { 3: 'jump_speed_return', 6: 'saturday_conditioning' } },
  { number: 4, title: 'Reintroduce Basketball', theme: 'Controlled court return', objective: 'Reintroduce controlled court movement, low-rim skill, and limited games only if cleared.', guardrail: 'Basketball begins as practice, not a two-hour test; cap intensity and duration.', exitTarget: 'Tolerate practice and planned direction changes without a reaction.', workoutOverrides: { 3: 'jump_speed_return', 6: 'saturday_conditioning' } },
  { number: 5, title: 'Build Muscle and Tissue Capacity', theme: 'Base volume', objective: 'Build moderate-rep lower and upper strength while keeping jump work modest.', guardrail: 'Do not increase strength volume and jump volume together.', exitTarget: 'Consistent training, improving loads and range, and an appropriate weight trend.' },
  { number: 6, title: 'Strength I', theme: 'Heavier force', objective: 'Develop 4–7 rep strength, loaded carries, and low-volume max-intent jumps.', guardrail: 'No grinding; assisted Nordic or other heavy hamstring work remains clearance-controlled.', exitTarget: 'A stable knee through heavier bilateral and unilateral loading.' },
  { number: 7, title: 'Strength II and Robustness', theme: 'Force plus durability', objective: 'Continue force development with heavier calf and soleus work, controlled deceleration, ankle, and adductor capacity.', guardrail: 'Deload around disruptions instead of cramming missed work.', exitTarget: 'A green midyear checkpoint with improved strength and single-leg control.' },
  { number: 8, title: 'Max Strength + Acceleration', theme: 'High force and speed', objective: 'Develop 3–5 rep strength, 10–15 yard acceleration, full-rest max jumps, and low-rim practice.', guardrail: 'Max jumps require a green response and explicit clearance.', exitTarget: 'Rising relative strength and consistent maximal-jump quality.', workoutOverrides: { 1: 'lower_strength_a_max', 4: 'lower_strength_b_max' } },
  { number: 9, title: 'Strength-Speed', theme: 'Convert force to speed', objective: 'Use contrast pairings, light loaded jumps, medicine-ball power, and approach work.', guardrail: 'Loaded jumps stay light; stop if speed visibly slows.', exitTarget: 'Faster force production without added symptom load.', workoutOverrides: { 1: 'lower_strength_a_contrast', 3: 'jump_speed_contrast', 4: 'lower_strength_b_maintenance', 6: 'saturday_dunk_or_pickup' } },
  { number: 10, title: 'Reactive Elasticity', theme: 'Quick contacts', objective: 'Develop pogos, low drops, bounds, lateral hops, and faster acceleration and deceleration.', guardrail: 'Drop work is optional and starts at 6–12 inches, never a high box.', exitTarget: 'Quick, quiet contacts with stable knee and ankle and no tendon reaction.', workoutOverrides: { 1: 'lower_strength_a_maintenance', 3: 'jump_speed_reactive', 4: 'lower_strength_b_maintenance' } },
  { number: 11, title: 'Dunk Skill I', theme: 'Approach mechanics', objective: 'Refine approach rhythm, penultimate step, arm swing, takeoff style, and progressive low-rim dunks.', guardrail: 'Dunk attempts are skill reps with long rest, not conditioning.', exitTarget: 'A repeatable approach and a clearly preferred takeoff style.', workoutOverrides: { 1: 'lower_strength_a_maintenance', 3: 'jump_speed_dunk', 4: 'lower_strength_b_maintenance', 6: 'saturday_dunk_or_pickup' } },
  { number: 12, title: 'Dunk Skill II', theme: 'Rim-height progression', objective: 'Use high-quality approach jumps, progressive rim height, and minimal strength maintenance.', guardrail: 'Use two max-jump exposures only when basketball load and symptoms allow.', exitTarget: 'More clean low-rim makes and higher touches with stable landings.', workoutOverrides: { 1: 'lower_strength_a_maintenance', 3: 'jump_speed_dunk', 4: 'lower_strength_b_maintenance', 6: 'saturday_dunk_or_pickup' } },
  { number: 13, title: 'Peak, Taper, and Test', theme: 'Freshness and performance', objective: 'Maintain intensity, halve volume, rehearse the approach, and arrive fresh for the final test.', guardrail: 'No new exercises and no fatigue chasing; test only when knee, back, patellar tendon, and Achilles are green.', exitTarget: 'Complete the final jump, rim, strength, and durability review.', workoutOverrides: { 1: 'lower_strength_a_taper', 3: 'jump_speed_taper', 4: 'lower_strength_b_taper', 6: 'saturday_early_rehab' } },
];

export const workoutById = Object.fromEntries(workouts.map((item) => [item.id, item])) as Record<string, WorkoutTemplate>;
export const blockByNumber = Object.fromEntries(blocks.map((block) => [block.number, block])) as Record<number, BlockDefinition>;

export const programDefaults = {
  startDate: '2026-07-10',
  finalTestDate: '2027-07-09',
  mainSessionSeconds: 1200,
  impactWarmupSeconds: 300,
  cooldownSeconds: 180,
  blocks: 13,
  daysPerBlock: 28,
  finalTestDayIndex: 364,
  standingReachInches: 91,
  referenceWeightLb: 185,
} as const;
