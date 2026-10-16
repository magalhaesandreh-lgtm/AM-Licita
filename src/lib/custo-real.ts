import type { CompraReal, EmpenhoItem } from './models';
import type { RateiosPercentuais } from './pricing-calculator';

export const COMO_COMPROU_LABEL: Record<NonNullable<CompraReal['comoComprou']>, string> = {
  PRESENCIAL: 'Presencial (loja)',
  SITE_MARKETPLACE: 'Site / marketplace',
  WHATSAPP_TELEFONE: 'WhatsApp / telefone',
  DISTRIBUIDOR: 'Distribuidor / representante',
  FABRICANTE: 'Direto do fabricante',
  OUTRO: 'Outro',
};

export type SituacaoCustoReal = 'SEM_COMPRA' | 'ESTIMADO_NF' | 'OK' | 'ABAIXO_PREVISTO' | 'PREJUIZO';

export interface ResumoCustoRealItem {
  /** Quantidade com compra real lançada. */
  qtdComprada: number;
  /** Quantidade já faturada em NFs (deduz do empenho). */
  qtdFaturada: number;
  /** Faturado sem compra real lançada: entra com o custo previsto da ATA. */
  qtdEstimadaNF: number;
  /** Comprado real + estimado pela NF (nunca passa do que já foi coberto). */
  qtdCoberta: number;
  /** Quanto ainda falta comprar/faturar para cobrir o empenho (nunca negativo). */
  saldoComprar: number;
  /** Custo unitário usado no lucro: mistura do custo real (compras) com o previsto (parte faturada sem compra). */
  custoEfetivoUnit: number;
  lucroEfetivoUnit: number;
  margemEfetivaPct: number | null;
  /** Média ponderada pela quantidade das compras lançadas. */
  custoMedioUnit: number | null;
  /** Custo médio + frete e rateios (mesmos percentuais usados na precificação). */
  custoTotalRealUnit: number | null;
  impostoUnit: number;
  lucroRealUnit: number | null;
  lucroPrevistoUnit: number;
  margemRealPct: number | null;
  /** lucro real − lucro previsto, por unidade (negativo = pior que o previsto). */
  diferencaLucroUnit: number | null;
  situacao: SituacaoCustoReal;
}

const EPS = 0.005;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function comprasDoItem(compras: CompraReal[] | undefined, empenhoItemId: string): CompraReal[] {
  return (compras || []).filter(c => c.empenhoItemId === empenhoItemId);
}

export function resumoCustoRealItem(
  item: EmpenhoItem,
  compras: CompraReal[] | undefined,
  aliquotaPct: number,
  rateios: RateiosPercentuais,
): ResumoCustoRealItem {
  const doItem = comprasDoItem(compras, item.id);
  const qtdComprada = doItem.reduce((a, c) => a + (c.qtd || 0), 0);
  const qtdFaturada = item.qtdEntregue || 0;
  const qtdEstimadaNF = Math.max(0, r4(qtdFaturada - qtdComprada));
  const qtdCoberta = r4(qtdComprada + qtdEstimadaNF);
  const saldoComprar = Math.max(0, r4(item.qtdEmpenhada - qtdCoberta));
  const impostoUnit = item.precoVendaUnitSnapshot * (aliquotaPct / 100);
  const preco = item.precoVendaUnitSnapshot;
  const base = { qtdComprada, qtdFaturada, qtdEstimadaNF, qtdCoberta, saldoComprar, impostoUnit, lucroPrevistoUnit: item.lucroUnitSnapshot };

  if (qtdComprada <= 0) {
    const lucroEfetivoUnit = r4(preco - impostoUnit - item.custoUnitSnapshot);
    return {
      ...base,
      custoEfetivoUnit: item.custoUnitSnapshot, lucroEfetivoUnit,
      margemEfetivaPct: preco > 0 ? (lucroEfetivoUnit / preco) * 100 : null,
      custoMedioUnit: null, custoTotalRealUnit: null, lucroRealUnit: null, margemRealPct: null, diferencaLucroUnit: null,
      situacao: qtdFaturada > 0 ? 'ESTIMADO_NF' : 'SEM_COMPRA',
    };
  }
  const custoMedioUnit = r4(doItem.reduce((a, c) => a + c.qtd * c.custoUnit, 0) / qtdComprada);
  const fator = 1 + rateios.fretePct + rateios.overheadPct + rateios.variavelPct;
  const custoTotalRealUnit = r4(custoMedioUnit * fator);
  const lucroRealUnit = r4(preco - impostoUnit - custoTotalRealUnit);
  const margemRealPct = preco > 0 ? (lucroRealUnit / preco) * 100 : null;
  const custoEfetivoUnit = custoUnitEfetivo({ custoUnitSnapshot: item.custoUnitSnapshot, custoRealUnit: custoTotalRealUnit, qtdCompradaReal: qtdComprada, qtdEntregue: qtdFaturada });
  const lucroEfetivoUnit = r4(preco - impostoUnit - custoEfetivoUnit);
  const diferencaLucroUnit = r4(lucroEfetivoUnit - item.lucroUnitSnapshot);
  let situacao: SituacaoCustoReal = 'OK';
  if (lucroEfetivoUnit < -EPS) situacao = 'PREJUIZO';
  else if (diferencaLucroUnit < -EPS) situacao = 'ABAIXO_PREVISTO';
  return {
    ...base, custoEfetivoUnit, lucroEfetivoUnit,
    margemEfetivaPct: preco > 0 ? (lucroEfetivoUnit / preco) * 100 : null,
    custoMedioUnit, custoTotalRealUnit, lucroRealUnit, margemRealPct, diferencaLucroUnit, situacao,
  };
}

/** Grava (ou remove) o custo real unitário e a quantidade com compra real em cada item do empenho. */
export function aplicarCustoReal(
  itens: EmpenhoItem[],
  compras: CompraReal[] | undefined,
  aliquotaDoItem: (precificacaoItemId: string) => number,
  rateios: RateiosPercentuais,
): EmpenhoItem[] {
  return itens.map(it => {
    const { custoRealUnit: _antigo, qtdCompradaReal: _antigaQtd, ...semCusto } = it;
    const r = resumoCustoRealItem(it, compras, aliquotaDoItem(it.precificacaoItemId), rateios);
    return r.custoTotalRealUnit != null
      ? { ...semCusto, custoRealUnit: r.custoTotalRealUnit, qtdCompradaReal: r.qtdComprada }
      : semCusto;
  });
}

/**
 * Custo unitário que vale para o lucro das NFs.
 * - Sem compra real lançada: o previsto na precificação (ATA).
 * - Com compra real: o custo real; se foi faturado mais do que o comprado, a parte sem compra entra com o previsto (média ponderada).
 */
export function custoUnitEfetivo(
  item: Pick<EmpenhoItem, 'custoUnitSnapshot' | 'custoRealUnit' | 'qtdEntregue'> & { qtdCompradaReal?: number },
): number {
  if (item.custoRealUnit == null) return item.custoUnitSnapshot;
  // Itens gravados antes de existir qtdCompradaReal: trata como todo comprado (comportamento anterior).
  const real = item.qtdCompradaReal ?? Number.POSITIVE_INFINITY;
  const fat = item.qtdEntregue || 0;
  const est = Math.max(0, fat - real);
  if (est <= 0) return item.custoRealUnit;
  return r4((real * item.custoRealUnit + est * item.custoUnitSnapshot) / (real + est));
}

/** Erro de validação de uma compra (null = válida). `qtdJaComprada` não deve incluir a própria compra, se for edição. */
export function validarCompra(c: { qtd: number; custoUnit: number; fornecedor: string }, item: EmpenhoItem, qtdJaComprada: number): string | null {
  if (!(c.qtd > 0)) return 'Informe a quantidade comprada.';
  if (!(c.custoUnit > 0)) return 'Informe o custo unitário pago.';
  if (!c.fornecedor.trim()) return 'Informe onde comprou (fornecedor).';
  const saldo = r4(item.qtdEmpenhada - qtdJaComprada);
  if (c.qtd > saldo + 1e-9) return `A quantidade passa do saldo a comprar deste item (${saldo}).`;
  return null;
}
