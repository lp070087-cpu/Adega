export function stockDefaults(settings: unknown): { initialStock: number; minimumStock: number } {
  const value = (settings && typeof settings === 'object' && !Array.isArray(settings) ? (settings as Record<string, unknown>).inventoryDefaults : null) as Record<string, unknown> | null;
  const valid = (n: unknown, fallback: number) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 999999 ? n : fallback;
  return { initialStock: valid(value?.initialStock, 25), minimumStock: valid(value?.minimumStock, 5) };
}
