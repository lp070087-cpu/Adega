import 'server-only';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PROVIDER DE MAPA — decisão honesta sobre o que desenhar
 * -----------------------------------------------------------------------
 * Um mapa de ruas de verdade (Leaflet + OpenStreetMap) não exige chave,
 * mas exige baixar tiles de servidores externos a cada tile — e o cliente
 * React não tem a biblioteca nem o download dos tiles garantido em
 * produção (sandbox sem rede de tile não renderiza). Enquanto o mapa de
 * ruas não estiver plugado de verdade, o sistema NÃO desenha um mapa falso:
 *
 *   • Na configuração, a "área de entrega" é um ESQUEMA (SVG) — o
 *     estabelecimento no centro e o círculo do raio, com os bairros quando
 *     têm coordenada. Rotulado como esquema, nunca como mapa de ruas.
 *
 *   • Na expedição, o "Radar da frota" (DispatchBoard) é uma projeção
 *     relativa das coordenadas reais enviadas pelos entregadores, também
 *     rotulado como tal.
 *
 * Este módulo centraliza essa decisão: `mapProviderStatus()` devolve o que
 * está disponível e o que a interface deve mostrar. Quando um provedor de
 * tiles for configurado (fase futura), é AQUI que a flag muda — as telas
 * continuam lendo o mesmo contrato e passam a exibir o mapa real.
 *
 * REGRA: nenhuma chave de mapa vai para o navegador. O que existir de
 * credencial fica no servidor (ex.: geocodificação em
 * src/lib/maps/geocoding.ts). A visualização de mapa/radar usa apenas
 * coordenadas, que não são segredo.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type MapProvider = 'leaflet-osm' | 'none';

export type MapProviderStatus = {
  /** 'leaflet-osm' quando tiles reais estiverem plugados; 'none' hoje. */
  provider: MapProvider;
  /** true = dá para desenhar mapa de ruas. false = usar esquema/radar. */
  tilesAvailable: boolean;
  /** O que a interface deve dizer ao usuário. */
  hint: string;
};

/**
 * Decisão central do que desenhar.
 *
 * Hoje devolve `tilesAvailable: false` de propósito: não há biblioteca de
 * mapa nem tile server garantido, então a interface usa o esquema honesto
 * em vez de um mapa que não corresponderia à realidade. Quando o Leaflet +
 * OSM (ou outro provedor sem segredo no cliente) for adicionado, basta
 * mudar este retorno.
 */
export function mapProviderStatus(): MapProviderStatus {
  // Leaflet+OSM é o plano (sem chave). Enquanto não plugado, permanece
  // 'none' — não fingimos disponibilidade.
  const tilesAvailable = false;

  return {
    provider: tilesAvailable ? 'leaflet-osm' : 'none',
    tilesAvailable,
    hint: tilesAvailable
      ? 'Mapa de ruas disponível (Leaflet + OpenStreetMap).'
      : 'Mapa de ruas ainda não plugado — exibindo esquema/radar de posições reais, não um mapa falso.',
  };
}
