/**
 * Melhor sequência de paradas a partir de um ponto de saída (índice 0),
 * sem voltar ao início, minimizando o tempo total da matriz.
 * Até 8 paradas: exata (todas as ordens). Acima disso: vizinho mais
 * próximo + melhoria 2-opt. Devolve os índices das paradas (1..n).
 */
export function bestStopOrder(matrix: number[][]): number[] {
  const n = matrix.length - 1;
  if (n <= 0) return [];
  const stops = Array.from({ length: n }, (_, i) => i + 1);
  const cost = (order: number[]) => order.reduce((total, stop, i) => total + matrix[i === 0 ? 0 : order[i - 1]][stop], 0);
  if (n <= 8) {
    let best = stops, bestCost = cost(stops);
    const permute = (prefix: number[], rest: number[]) => {
      if (!rest.length) { const c = cost(prefix); if (c < bestCost) { best = prefix; bestCost = c; } return; }
      for (let i = 0; i < rest.length; i++) permute([...prefix, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)]);
    };
    permute([], stops);
    return best;
  }
  const order: number[] = [];
  const left = new Set(stops);
  let at = 0;
  while (left.size) {
    let next = -1, nextCost = Number.POSITIVE_INFINITY;
    for (const stop of left) if (matrix[at][stop] < nextCost) { next = stop; nextCost = matrix[at][stop]; }
    if (next < 0) next = left.values().next().value as number;
    order.push(next); left.delete(next); at = next;
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) for (let j = i + 1; j < order.length; j++) {
      const candidate = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
      if (cost(candidate) + 1e-6 < cost(order)) { order.splice(0, order.length, ...candidate); improved = true; }
    }
  }
  return order;
}
