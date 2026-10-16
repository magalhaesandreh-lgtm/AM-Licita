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

export type SituacaoCustoReal = 'SEM_COMPRA' | 'OK' | 'ABAIXO_PREVISTO' | 'PREJUIZO';

export interface ResumoCustoRealItem {
  qtdComprada: number;
  /** Quanto ainda falta comprar para cobrir o empenho (nunca negativo). */
  saldoComprar: number;
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
  const saldoComprar = Math.max(0, r4(item.qtdEmpenhada - qtdComprada));
  const impostoUnit = item.precoVendaUnitSnapshot * (aliquotaPct / 100);
  const base = { qtdComprada, saldoComprar, impostoUnit, lucroPrevistoUnit: item.lucroUnitSnapshot };

  if (qtdComprada <= 0) {
    return { ...base, custoMedioUnit: null, custoTotalRealUnit: null, lucroRealUnit: null, margemRealPct: null, diferencaLucroUnit: null, situacao: 'SEM_COMPRA' };
  }
  const custoMedioUnit = r4(doItem.reduce((a, c) => a + c.qtd * c.custoUnit, 0) / qtdComprada);
  const fator = 1 + rateios.fretePct + rateios.overheadPct + rateios.variavelPct;
  const custoTotalRealUnit = r4(custoMedioUnit * fator);
  const lucroRealUnit = r4(item.precoVendaUnitSnapshot - impostoUnit - custoTotalRealUnit);
  const margemRealPct = item.precoVendaUnitSnapshot > 0 ? (lucroRealUnit / item.precoVendaUnitSnapshot) * 100 : null;
  const diferencaLucroUnit = r4(lucroRealUnit - item.lucroUnitSnapshot);
  let situacao: SituacaoCustoReal = 'OK';
  if (lucroRealUnit < -EPS) situacao = 'PREJUIZO';
  else if (diferencaLucroUnit < -EPS) situacao = 'ABAIXO_PREVISTO';
  return { ...base, custoMedioUnit, custoTotalRealUnit, lucroRealUnit, margemRealPct, diferencaLucroUnit, situacao };
}

/** Grava (ou remove) o custo real unitário em cada item do empenho conforme as compras lançadas. */
export function aplicarCustoReal(
  itens: EmpenhoItem[],
  compras: CompraReal[] | undefined,
  aliquotaDoItem: (precificacaoItemId: string) => number,
  rateios: RateiosPercentuais,
): EmpenhoItem[] {
  return itens.map(it => {
    const { custoRealUnit: _antigo, ...semCusto } = it;
    const r = resumoCustoRealItem(it, compras, aliquotaDoItem(it.precificacaoItemId), rateios);
    return r.custoTotalRealUnit != null ? { ...semCusto, custoRealUnit: r.custoTotalRealUnit } : semCusto;
  });
}

/** Custo unitário que vale para o lucro: o real, quando há compras; senão o previsto na precificação. */
export function custoUnitEfetivo(item: Pick<EmpenhoItem, 'custoUnitSnapshot' | 'custoRealUnit'>): number {
  return item.custoRealUnit ?? item.custoUnitSnapshot;
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

export type OrigemCusto = 'REAL' | 'PREVISTO';

export interface ResultadoNFsItem {
  /** Quantidade deste item já faturada em NFs. */
  qtdFaturada: number;
  /** Custo unitário usado: o real, se houver compras lançadas; senão o previsto, como está na ATA/precificação. */
  custoUnitUsado: number;
  origem: OrigemCusto;
  /** Faturou mais do que comprou: a parte sem compra lançada usa o custo médio das compras. */
  faturadoAcimaDoComprado: boolean;
  venda: number;
  imposto: number;
  custo: number;
  lucro: number;
  margemPct: number | null;
}

/** Resultado (venda, imposto, custo, lucro) do que já foi faturado em NFs de um item, com o custo efetivo. */
export function resultadoNFsItem(
  item: EmpenhoItem,
  nfs: Array<{ itens: Array<{ empenhoItemId: string; qtdNestaNF: number }> }> | undefined,
  aliquotaPct: number,
  qtdComprada = 0,
): ResultadoNFsItem {
  const qtdFaturada = (nfs || []).reduce(
    (acc, nf) => acc + nf.itens.filter(i => i.empenhoItemId === item.id).reduce((a, i) => a + (i.qtdNestaNF || 0), 0),
    0,
  );
  const origem: OrigemCusto = item.custoRealUnit != null ? 'REAL' : 'PREVISTO';
  const custoUnitUsado = custoUnitEfetivo(item);
  const venda = item.precoVendaUnitSnapshot * qtdFaturada;
  const imposto = venda * (aliquotaPct / 100);
  const custo = custoUnitUsado * qtdFaturada;
  const lucro = venda - imposto - custo;
  return {
    qtdFaturada, custoUnitUsado, origem,
    faturadoAcimaDoComprado: origem === 'REAL' && qtdFaturada > qtdComprada + 1e-9,
    venda, imposto, custo, lucro,
    margemPct: venda > 0 ? (lucro / venda) * 100 : null,
  };
}
