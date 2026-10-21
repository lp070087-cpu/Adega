/** Display identity only. Database keys, contracts and app IDs remain stable. */
export const PLATFORM_BRAND = { name: 'Del Flash', navy: '#0B1F3A', ocean: '#087EA4', blue: '#168FE5', light: '#EAF5FF' } as const;
export function brandRgb(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '8 126 164';
  return [1,3,5].map(index => parseInt(hex.slice(index,index+2),16)).join(' ');
}
