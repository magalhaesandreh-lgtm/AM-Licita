import type { CertameUnificado, ItemPrecificacao } from '@/lib/models';
import { rateiosPercentuais, type CalculatedItemMetrics, type CertameComCalculo, type FullPricingContext } from '@/lib/pricing-calculator';

/**
 * Análise de exequibilidade em linguagem simples: classifica cada item e explica o motivo.
 * Usada no relatório em PDF e na exportação em planilha, para que os números venham explicados.
 */

export type SituacaoItem = 'VIAVEL' | 'MARGEM_REDUZIDA' | 'PREJUIZO' | 'SEM_CUSTO' | 'SEM_REFERENCIA';

export const ROTULO_SITUACAO: Record<SituacaoItem, string> = {
    VIAVEL: 'Viável',
    MARGEM_REDUZIDA: 'Lucro abaixo do desejado',
    PREJUIZO: 'Prejuízo',
    SEM_CUSTO: 'Sem custo informado',
    SEM_REFERENCIA: 'Sem preço de referência',
};

type ItemCalc = ItemPrecificacao & { metrics: CalculatedItemMetrics };

export interface AnaliseItem {
    item: ItemCalc;
    nome: string;
    situacao: SituacaoItem;
    /** Custo do produto por unidade (o que se paga ao fornecedor). */
    custoProduto: number;
    frete: number;
    /** Parcela dos custos fixos mensais (overhead). null quando não dá para separar (certame congelado). */
    fixos: number | null;
    /** Parcela dos custos variáveis do certame. null quando não dá para separar. */
    variaveis: number | null;
    /** Fixos + variáveis (sempre disponível). */
    rateados: number;
    custoTotal: number;
    aliquotaPct: number;
    margemAlvoPct: number;
    /** Preço calculado pelo sistema (ou preço vencedor, se informado). */
    preco: number;
    referencia: number | null;
    /** Lucro por unidade vendendo pelo preço de referência (após imposto). */
    lucroUnitRef: number | null;
    lucroPctRef: number | null;
    lucroTotalRef: number | null;
    lucroUnit: number;
    lucroTotal: number;
    /** Custo máximo do produto para caber na referência com a margem desejada. */
    custoMaximoProduto: number | null;
    motivo: string;
}

export interface ResumoExequibilidade {
    itens: AnaliseItem[];
    contagem: Record<SituacaoItem, number>;
    valorReferenciaTotal: number;
    /** Itens viáveis: valor da proposta e lucro com a margem desejada. */
    valorViaveis: number;
    lucroViaveis: number;
    /** Itens com lucro reduzido, vendidos pelo preço de referência. */
    valorReduzidosNaRef: number;
    lucroReduzidosNaRef: number;
    /** Itens com prejuízo, se vendidos pelo preço de referência. */
    prejuizoNaRef: number;
    custoProdutosTotal: number;
    freteTotal: number;
    fixosTotal: number;
    variaveisTotal: number;
    rateadosTotal: number;
    /** Quanto os custos somados representam sobre o custo dos produtos. */
    percentualSobreCusto: number | null;
}

export interface ExplicacaoCustos {
    custosDe: string;
    fretePct: number;
    overheadPct: number;
    overheadManual: boolean;
    faturamentoMensal: number;
    custosFixos: { descricao: string; valor: number }[];
    custosVariaveisValor: { descricao: string; valor: number }[];
    custosVariaveisPct: { descricao: string; valor: number }[];
}

const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const brl = (v: number | null | undefined) => brlFmt.format(v || 0);
export const pct = (v: number | null | undefined, casas = 1) => `${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

/** Nome curto do item: parte antes do travessão do edital ("ABACAXI – Fruto fresco..." -> "Abacaxi"). */
export function nomeCurto(descricao: string): string {
    const base = (descricao || '').split(/\s[–-]\s/)[0].trim();
    if (!base) return descricao;
    return base === base.toUpperCase() ? base.charAt(0) + base.slice(1).toLowerCase() : base;
}

export function explicarCustos(contexto: FullPricingContext | null | undefined, custosDe: string): ExplicacaoCustos | null {
    if (!contexto) return null;
    const r = rateiosPercentuais(contexto);
    const cfg = contexto.configuracoes;
    return {
        custosDe,
        fretePct: r.fretePct * 100,
        overheadPct: r.overheadPct * 100,
        overheadManual: !!(cfg.overheadPercentManual && cfg.overheadPercentManual > 0),
        faturamentoMensal: cfg.faturamentoMensalPrevisto || 0,
        custosFixos: contexto.custosFixos.filter(c => c.ativo).map(c => ({ descricao: c.descricao, valor: c.valorMensal })),
        custosVariaveisValor: contexto.custosVariaveis.filter(c => c.ativo && c.tipoRateio === 'VALOR_CERTAME').map(c => ({ descricao: c.descricao, valor: c.valor })),
        custosVariaveisPct: contexto.custosVariaveis.filter(c => c.ativo && c.tipoRateio === 'PERCENT_CERTAME').map(c => ({ descricao: c.descricao, valor: c.valor })),
    };
}

export function analisarExequibilidade(certame: CertameComCalculo, contexto?: FullPricingContext | null): ResumoExequibilidade {
    const overheadPct = contexto ? rateiosPercentuais(contexto).overheadPct : null;
    const ativos = certame.itens.filter(i => i.status !== 'PERDIDO') as ItemCalc[];
    const itens: AnaliseItem[] = ativos.map(item => {
        const m = item.metrics;
        const nome = nomeCurto(item.descricao);
        const custoProduto = m.estimado ? (m.custoBaseEstimadoUnit ?? 0) : item.custoUnitBase;
        const frete = m.estimado ? (m.freteEstimadoUnit ?? 0) : item.freteUnitario;
        const rateados = m.estimado ? (m.overheadEstimadoUnit ?? 0) : item.custoFixoRateadoUnit;
        const separavel = !certame.congelado && !m.estimado && overheadPct !== null;
        const fixos = separavel ? custoProduto * (overheadPct as number) : null;
        const variaveis = separavel ? rateados - (fixos as number) : null;
        const custoTotal = m.custoTotalUnit;
        const aliquotaPct = item.aliquotaPct || 0;
        const categoria = contexto?.categorias.find(c => c.id === item.categoriaId);
        const margemAlvoPct = item.margemManualPct ?? categoria?.margemPadraoPercent ?? m.margemAplicadaPercent;
        const preco = m.precoFinalUnit;
        const referencia = !certame.orcamentoSigiloso && item.precoReferencia && item.precoReferencia > 0 ? item.precoReferencia : null;
        const lucroUnitRef = referencia !== null ? referencia * (1 - aliquotaPct / 100) - custoTotal : null;
        const lucroPctRef = referencia !== null && lucroUnitRef !== null ? (lucroUnitRef / referencia) * 100 : null;
        const lucroTotalRef = lucroUnitRef !== null ? lucroUnitRef * item.qtd : null;
        const fator = custoProduto > 0 ? custoTotal / custoProduto : null;
        const fracLivre = 1 - aliquotaPct / 100 - margemAlvoPct / 100;
        const custoMaximoProduto = referencia !== null && fator && fracLivre > 0 ? (referencia * fracLivre) / fator : null;

        let situacao: SituacaoItem;
        if (!(custoProduto > 0) && !m.estimado) situacao = 'SEM_CUSTO';
        else if (referencia === null) situacao = 'SEM_REFERENCIA';
        else if (preco <= referencia + 0.005) situacao = 'VIAVEL';
        else if ((lucroUnitRef ?? 0) > 0) situacao = 'MARGEM_REDUZIDA';
        else situacao = 'PREJUIZO';

        const und = (item.unidade || 'unidade').toLowerCase();
        const custosExtras = custoTotal - custoProduto;
        let motivo = '';
        switch (situacao) {
            case 'SEM_CUSTO':
                motivo = 'O custo de compra do produto ainda não foi informado. Sem ele não é possível calcular o preço nem saber se o item dá lucro. Cotar com o fornecedor antes da disputa.';
                break;
            case 'SEM_REFERENCIA':
                motivo = `O edital não divulga preço máximo para este item (orçamento sigiloso ou sem referência). O preço calculado para lucro de ${pct(margemAlvoPct, 0)} é ${brl(preco)} por ${und}; a aceitação depende do valor que o órgão considerar aceitável.`;
                break;
            case 'VIAVEL':
                motivo = `O produto custa ${brl(custoProduto)} e, somando frete e a parte das despesas (${brl(custosExtras)}), o custo total fica em ${brl(custoTotal)} por ${und}. Com lucro de ${pct(margemAlvoPct, 0)}, o preço é ${brl(preco)}, abaixo do preço de referência do edital (${brl(referencia)}). Sobra uma folga de ${brl((referencia as number) - preco)} por ${und} para a disputa de lances.`;
                break;
            case 'MARGEM_REDUZIDA':
                motivo = `O produto custa ${brl(custoProduto)} e o custo total chega a ${brl(custoTotal)} por ${und}. Para ter lucro de ${pct(margemAlvoPct, 0)}, o preço teria de ser ${brl(preco)}, acima do preço de referência do edital (${brl(referencia)}). Vendendo pelo preço de referência, o lucro cai para ${pct(lucroPctRef)} (${brl(lucroUnitRef)} por ${und}, ${brl(lucroTotalRef)} no total).`
                    + (custoMaximoProduto && custoMaximoProduto > 0 ? ` Para alcançar ${pct(margemAlvoPct, 0)}, o produto precisaria custar no máximo ${brl(custoMaximoProduto)}.` : '');
                break;
            case 'PREJUIZO':
                motivo = `O produto custa ${brl(custoProduto)} e, com frete e a parte das despesas (${brl(custosExtras)}), o custo total chega a ${brl(custoTotal)} por ${und}, ${custoTotal > (referencia as number) ? 'acima' : 'muito perto'} do preço de referência do edital (${brl(referencia)}). Mesmo vendendo pelo preço de referência haveria prejuízo de ${brl(Math.abs(lucroUnitRef || 0))} por ${und} (${brl(Math.abs(lucroTotalRef || 0))} no total).`
                    + (custoMaximoProduto && custoMaximoProduto > 0 ? ` Só compensa se o produto for comprado por até ${brl(custoMaximoProduto)}.` : ' Com as despesas atuais, não há custo de compra que torne o item lucrativo.');
                break;
        }

        return {
            item, nome, situacao, custoProduto, frete, fixos, variaveis, rateados, custoTotal, aliquotaPct, margemAlvoPct, preco, referencia,
            lucroUnitRef, lucroPctRef, lucroTotalRef, lucroUnit: m.lucroUnit, lucroTotal: m.lucroTotal, custoMaximoProduto, motivo,
        };
    });

    const contagem: Record<SituacaoItem, number> = { VIAVEL: 0, MARGEM_REDUZIDA: 0, PREJUIZO: 0, SEM_CUSTO: 0, SEM_REFERENCIA: 0 };
    itens.forEach(a => { contagem[a.situacao]++; });
    const soma = (f: (a: AnaliseItem) => number, filtro?: (a: AnaliseItem) => boolean) => itens.filter(filtro || (() => true)).reduce((t, a) => t + f(a), 0);
    const custoProdutosTotal = soma(a => a.custoProduto * a.item.qtd);
    const freteTotal = soma(a => a.frete * a.item.qtd);
    const fixosTotal = soma(a => (a.fixos ?? 0) * a.item.qtd);
    const rateadosTotal = soma(a => a.rateados * a.item.qtd);
    const variaveisTotal = rateadosTotal - fixosTotal;
    return {
        itens,
        contagem,
        valorReferenciaTotal: soma(a => (a.referencia ?? 0) * a.item.qtd),
        valorViaveis: soma(a => a.preco * a.item.qtd, a => a.situacao === 'VIAVEL'),
        lucroViaveis: soma(a => a.lucroTotal, a => a.situacao === 'VIAVEL'),
        valorReduzidosNaRef: soma(a => (a.referencia ?? 0) * a.item.qtd, a => a.situacao === 'MARGEM_REDUZIDA'),
        lucroReduzidosNaRef: soma(a => a.lucroTotalRef ?? 0, a => a.situacao === 'MARGEM_REDUZIDA'),
        prejuizoNaRef: soma(a => Math.abs(a.lucroTotalRef ?? 0), a => a.situacao === 'PREJUIZO'),
        custoProdutosTotal,
        freteTotal,
        fixosTotal,
        variaveisTotal,
        rateadosTotal,
        percentualSobreCusto: custoProdutosTotal > 0 ? ((freteTotal + rateadosTotal) / custoProdutosTotal) * 100 : null,
    };
}

/** Nome de quem tem os custos usados no cálculo (cliente com custos cadastrados ou a AM Contratos). */
export function custosDeCertame(certame: Pick<CertameUnificado, 'empresaDestinoId' | 'empresaDestinoNome'>, clientesComCustos: string[]): string {
    if (certame.empresaDestinoId && clientesComCustos.includes(certame.empresaDestinoId)) return certame.empresaDestinoNome || 'cliente';
    return 'AM Contratos & Soluções B2G';
}
