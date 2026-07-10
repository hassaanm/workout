import { describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY, defaultData, exportData, loadData, parseBackup, previewImport, saveData, updateData } from './storage';

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

    expect(data.profile.programStartDate).toBe('2026-07-10');
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
