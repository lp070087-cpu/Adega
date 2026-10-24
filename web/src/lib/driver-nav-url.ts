/**
 * Link de navegação externa.
 *
 * Quem navega é o aplicativo de mapa do telefone (Google Maps ou Waze),
 * sempre a partir da posição atual do aparelho — não da loja, porque o
 * entregador pode já estar na rua. O destino vai por coordenada quando o
 * pedido tem uma (nunca inventada); sem ela, pelo endereço em texto.
 */
export function navigationUrl(destination: {
  latitude: number | null;
  longitude: number | null;
  address: string;
}): { google: string; waze: string } {
  const exact = destination.latitude != null && destination.longitude != null;
  const google = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${
    exact ? `${destination.latitude},${destination.longitude}` : encodeURIComponent(destination.address)
  }`;
  const waze = exact
    ? `https://waze.com/ul?ll=${destination.latitude}%2C${destination.longitude}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(destination.address || 'Destino')}&navigate=yes`;
  return { google, waze };
}
