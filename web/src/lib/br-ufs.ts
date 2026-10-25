/** Siglas das 27 unidades da federação. */
export const BR_UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const;
export const isBrUf = (value: string | null | undefined) => (BR_UFS as readonly string[]).includes((value ?? '').trim().toUpperCase());
export const isCityName = (value: string | null | undefined) => /\p{L}/u.test(value ?? '') && (value ?? '').trim().length >= 2;
