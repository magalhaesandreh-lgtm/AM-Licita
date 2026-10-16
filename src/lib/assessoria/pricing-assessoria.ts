// src/lib/assessoria/pricing-assessoria.ts
//
// Precificação dos serviços de assessoria.
//
// Regra do André (14/10/2026): a margem de lucro incide sobre o PREÇO FINAL, depois de
// descontar TODOS os custos, impostos e custos variáveis. O lucro é o que sobra no fim.
//
//   preço = custo base ÷ (1 − imposto% − variável% − margem%)
//   custo base = custo direto + rateio de custos fixos (overhead % do custo direto)
//
// Imposto e custos variáveis são percentuais do preço final (por isso entram no divisor).

import type { ConfiguracoesGerais, CustoFixo } from '@/lib/models';

export interface LinhaCustoAssessoria {
    id: string;
    descricao: string;
    /** HORAS: quantidade de horas × valor da hora. VALOR: quantidade × valor unitário. */
    tipo: 'HORAS' | 'VALOR';
    quantidade: number;
    valorUnitario: number;
}

export interface ParametrosAssessoria {
    /** Custos do período (um mês, no caso de mensalidade; o processo inteiro, no caso de por processo). */
    linhas: LinhaCustoAssessoria[];
    /** Rateio dos custos fixos da empresa, em % do custo direto. */
    overheadPercent: number;
    /** Custos variáveis (comissão, taxas), em % do preço final. */
    variavelPercent: number;
    /** Imposto sobre o serviço, em % do preço final. */
    impostoPercent: number;
    /** Lucro desejado, em % do preço final, depois de tudo. */
    margemPercent: number;
}

export interface ResultadoAssessoria {
    custoDireto: number;
    overhead: number;
    custoBase: number;
    /** 1 − imposto − variável − margem. Se for ≤ 0 a margem pedida é impossível. */
    divisor: number;
    valido: boolean;
    /** Preço com lucro zero (cobre custos, imposto e variáveis). */
    precoMinimo: number;
    /** Preço que entrega a margem desejada, arredondado para cima ao centavo. */
    precoRecomendado: number;
    imposto: number;
    variavel: number;
    lucro: number;
    /** Lucro ÷ preço final, em %. */
    margemLiquidaPercent: number;
    /** Quanto o preço fica acima do custo base, em %. */
    markupPercent: number;
}

export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const paraCima = (v: number) => Math.ceil(v * 100 - 1e-9) / 100;
const frac = (percent: number) => (percent || 0) / 100;

export function custoLinha(l: LinhaCustoAssessoria): number {
    return Math.max(0, l.quantidade || 0) * Math.max(0, l.valorUnitario || 0);
}

export function custoDiretoTotal(linhas: LinhaCustoAssessoria[]): number {
    return linhas.reduce((s, l) => s + custoLinha(l), 0);
}

/**
 * Overhead padrão do sistema (mesma regra do módulo de certames):
 * percentual manual, se informado; senão custos fixos ativos ÷ faturamento mensal previsto.
 */
export function overheadPercentPadrao(config: Partial<ConfiguracoesGerais> | null, custosFixos: CustoFixo[]): number {
    if (config?.overheadPercentManual && config.overheadPercentManual > 0) return config.overheadPercentManual;
    const totalFixos = custosFixos.filter(c => c.ativo).reduce((s, c) => s + c.valorMensal, 0);
    const faturamento = config?.faturamentoMensalPrevisto || 0;
    return faturamento > 0 ? (totalFixos / faturamento) * 100 : 0;
}

function base(p: ParametrosAssessoria) {
    const custoDireto = custoDiretoTotal(p.linhas);
    const overhead = custoDireto * frac(p.overheadPercent);
    return { custoDireto, overhead, custoBase: custoDireto + overhead };
}

/** Resultado de cobrar `preco`: quanto sobra depois de tudo. `periodos` multiplica o custo (ex.: meses do contrato). */
export function simularPreco(p: ParametrosAssessoria, preco: number, periodos = 1) {
    const { custoBase } = base(p);
    const custo = custoBase * periodos;
    const imposto = preco * frac(p.impostoPercent);
    const variavel = preco * frac(p.variavelPercent);
    const lucro = preco - imposto - variavel - custo;
    return {
        preco,
        custo,
        imposto: r2(imposto),
        variavel: r2(variavel),
        lucro: r2(lucro),
        margemLiquidaPercent: preco > 0 ? (lucro / preco) * 100 : 0,
    };
}

export function calcularPrecoAssessoria(p: ParametrosAssessoria): ResultadoAssessoria {
    const { custoDireto, overhead, custoBase } = base(p);
    const taxas = frac(p.impostoPercent) + frac(p.variavelPercent);
    const divisor = 1 - taxas - frac(p.margemPercent);
    const divisorMinimo = 1 - taxas;

    const valido = divisor > 0 && custoBase > 0;
    const precoMinimo = divisorMinimo > 0 ? paraCima(custoBase / divisorMinimo) : 0;
    const precoRecomendado = valido ? paraCima(custoBase / divisor) : 0;

    const s = simularPreco(p, precoRecomendado);
    return {
        custoDireto: r2(custoDireto),
        overhead: r2(overhead),
        custoBase: r2(custoBase),
        divisor,
        valido,
        precoMinimo,
        precoRecomendado,
        imposto: s.imposto,
        variavel: s.variavel,
        lucro: s.lucro,
        margemLiquidaPercent: s.margemLiquidaPercent,
        markupPercent: custoBase > 0 ? (precoRecomendado / custoBase - 1) * 100 : 0,
    };
}
