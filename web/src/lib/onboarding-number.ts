/** Accept decimal form values and Brazilian formatted currency without changing scale. */
export function onboardingNumber(value: FormDataEntryValue | null, fallback: number): number {
  if (value === null || String(value).trim() === '') return fallback;
  const raw = String(value).trim();
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
