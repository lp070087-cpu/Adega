const pattern = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
const prefix = 'DELFLASH:COLETA:';

export function pickupCodeFromText(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/^DELFLASH:COLETA:/, '').replace(/[\s-]/g, '');
  return pattern.test(code) ? code : null;
}

export function pickupQrText(code: string) {
  return prefix + code;
}
