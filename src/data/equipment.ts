export const EQUIPMENT = [
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

export type EquipmentId = (typeof EQUIPMENT)[number][0];

export const EQUIPMENT_IDS = EQUIPMENT.map(([id]) => id) as EquipmentId[];

export const equipmentLabel = (id: string) =>
  EQUIPMENT.find(([equipmentId]) => equipmentId === id)?.[1] ?? id;
