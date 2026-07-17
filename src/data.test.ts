import { describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS } from './data/equipment';
import { exerciseById, exercises } from './data/exercises';

const linkKeys = ['regressionIds', 'progressionIds', 'bodyweightAlternativeIds', 'alternativeIds'] as const;

describe('exercise catalog integrity', () => {
  it('only links to exercises that exist and never to itself', () => {
    for (const exercise of exercises) {
      for (const key of linkKeys) {
        for (const id of exercise[key]) {
          expect(exerciseById[id], `${exercise.id}.${key} -> ${id}`).toBeDefined();
          expect(id, `${exercise.id}.${key} links to itself`).not.toBe(exercise.id);
        }
      }
    }
  });

  it('uses only known equipment ids', () => {
    for (const exercise of exercises) {
      for (const group of exercise.equipmentIds) {
        expect(group.length, `${exercise.id} has an empty equipment group`).toBeGreaterThan(0);
        for (const id of group) expect(EQUIPMENT_IDS, `${exercise.id} equipment ${id}`).toContain(id);
      }
    }
  });

  it('gives every equipped exercise a reachable zero-equipment option', () => {
    for (const exercise of exercises.filter((item) => item.equipmentIds.length)) {
      const candidates = [...exercise.alternativeIds, ...exercise.bodyweightAlternativeIds, ...exercise.regressionIds]
        .map((id) => exerciseById[id]);
      expect(
        candidates.some((candidate) =>
          candidate
          && !candidate.equipmentIds.length
          // A fallback must never demand clearance the parent didn't already require.
          && candidate.clearanceRequired.every((key) => exercise.clearanceRequired.includes(key)),
        ),
        `${exercise.id} has no zero-equipment fallback within its clearance`,
      ).toBe(true);
    }
  });

  it('never offers an alternative that needs the exact same equipment', () => {
    const flat = (groups: string[][]) => JSON.stringify(groups.map((group) => [...group].sort()).sort());
    for (const exercise of exercises.filter((item) => item.equipmentIds.length)) {
      for (const id of exercise.alternativeIds) {
        expect(flat(exerciseById[id].equipmentIds), `${exercise.id} alternative ${id} needs identical equipment`)
          .not.toBe(flat(exercise.equipmentIds));
      }
    }
  });

  it('stays within the five-option swap sheet after dedupe', () => {
    for (const exercise of exercises) {
      const options = new Set([
        exercise.id,
        ...exercise.alternativeIds,
        ...exercise.bodyweightAlternativeIds,
        ...exercise.regressionIds,
        ...exercise.progressionIds,
      ]);
      expect(options.size, `${exercise.id} exposes ${options.size} swap options`).toBeLessThanOrEqual(5);
    }
  });
});
