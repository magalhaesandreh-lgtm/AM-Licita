/**
 * Calculadora de lances: relação entre valor do lance e lucro, com a mesma regra de margem do sistema
 * (lucro sobre o preço final, depois de custos e imposto).
 *
 *   lucro por unidade = lance × (1 - alíquota) - custo total
 *   margem            = lucro ÷ lance                 => margem = 1 - alíquota - custo ÷ lance
 *   lance para margem = custo total ÷ (1 - alíquota - margem)
 */

/** Lance que dá exatamente a margem (%) pedida. null quando impossível (alíquota + margem >= 100%). */
export function lanceParaMargem(custoTotal: number, aliquotaPct: number, margemPct: number): number | null {
    const livre = 1 - aliquotaPct / 100 - margemPct / 100;
    if (!(custoTotal > 0) || livre <= 0) return null;
    return custoTotal / livre;
}

/** Margem (%) que um lance dá. */
export function margemDoLance(custoTotal: number, aliquotaPct: number, lance: number): number | null {
    if (!(lance > 0)) return null;
    return (1 - aliquotaPct / 100 - custoTotal / lance) * 100;
}

export function lucroDoLance(custoTotal: number, aliquotaPct: number, lance: number): number {
    return lance * (1 - aliquotaPct / 100) - custoTotal;
}

/**
 * Arredonda o lance para as casas aceitas pelo portal SEM perder lucro: para cima quando o valor veio
 * de uma margem (garante pelo menos a margem pedida).
 */
export function arredondarParaCima(valor: number, casas: number): number {
    const f = 10 ** casas;
    return Math.ceil(valor * f - 1e-9) / f;
}

export interface ItemLote { qtd: number; custoTotal: number; aliquotaPct: number; precoAtual: number }

/**
 * Lote: o valor global é distribuído entre os itens na proporção do preço atual de cada um (mesma regra do
 * "aplicar valor do lote" da planilha). Com pesos fixos, a alíquota efetiva do lote é a média ponderada.
 */
export function resumoLote(itens: ItemLote[]) {
    const totalAtual = itens.reduce((t, i) => t + i.precoAtual * i.qtd, 0);
    const custo = itens.reduce((t, i) => t + i.custoTotal * i.qtd, 0);
    const pesos = itens.map(i => (totalAtual > 0 ? (i.precoAtual * i.qtd) / totalAtual : 0));
    const aliquotaEfetiva = itens.reduce((t, i, k) => t + i.aliquotaPct * pesos[k], 0);
    return { totalAtual, custo, pesos, aliquotaEfetiva };
}

export function valorLoteParaMargem(itens: ItemLote[], margemPct: number): number | null {
    const { custo, aliquotaEfetiva, totalAtual } = resumoLote(itens);
    if (!(totalAtual > 0)) return null;
    return lanceParaMargem(custo, aliquotaEfetiva, margemPct);
}

export function margemDoValorLote(itens: ItemLote[], valor: number): { margemPct: number | null; lucro: number } {
    const { custo, aliquotaEfetiva } = resumoLote(itens);
    return { margemPct: margemDoLance(custo, aliquotaEfetiva, valor), lucro: lucroDoLance(custo, aliquotaEfetiva, valor) };
}

/** Preço unitário de cada item quando o lote é ofertado pelo valor global informado. */
export function distribuirLote(itens: ItemLote[], valor: number, casas = 2): number[] {
    const { pesos } = resumoLote(itens);
    const f = 10 ** casas;
    return itens.map((i, k) => (i.qtd > 0 ? Math.round(((valor * pesos[k]) / i.qtd) * f) / f : 0));
}
