import type { CertameUnificado, Categoria, ConfiguracoesGerais, CustoFixo, CustoVariavel, ItemPrecificacao } from './models';
import type { ImpostoSettings } from './repositories/imposto-repository';

// Full context for calculation
export interface FullPricingContext {
  imposto: ImpostoSettings;
  categorias: Categoria[];
  configuracoes: ConfiguracoesGerais;
  custosFixos: CustoFixo[];
  custosVariaveis: CustoVariavel[];
}

// The calculated data for a single item. This is for display, not for saving.
export interface CalculatedItemMetrics {
  // Simulação
  custoTotalUnit: number;
  margemAplicadaPercent: number;
  /**
   * Base da margem exibida: 'PRECO_FINAL' (regra vigente, definida pelo André em 14/10/2026: lucro final
   * sobre o preço final, depois de custos, variáveis e impostos) ou 'PRECO_LIQUIDO' (regra antiga, mantida
   * nos certames congelados para que propostas já enviadas não mudem de valor).
   */
  margemSobre: 'PRECO_FINAL' | 'PRECO_LIQUIDO';
  precoLiquidoUnit: number;
  aliquotaImpostoPercent: number;
  impostoUnit: number;
  // Final Display Metrics
  precoFinalUnit: number;
  lucroUnit: number;
  lucroTotal: number;
  viabilidade: 'OK' | 'ATENÇÃO' | 'INVIÁVEL' | 'N/A';
  resultado: 'GANHO' | 'PREJUIZO' | 'NEUTRO';
  // Real (Retroativo)
  lucroReal?: number;
  margemRealPct?: number;
  resultadoReal?: 'LUCRO' | 'PREJUIZO';
  /**
   * Cálculo retroativo: o item tem preço vencedor mas não tem custo informado. O custo é estimado a partir
   * do preço (regra nova de margem) e tudo que depende dele é ESTIMADO, não real.
   */
  estimado: boolean;
  /** Estimativa impossível (alíquota + margem >= 100%): custo e lucro não foram calculados. */
  estimativaIndisponivel?: boolean;
  custoBaseEstimadoUnit?: number;
  freteEstimadoUnit?: number;
  overheadEstimadoUnit?: number;
}

/** Percentuais (frações) usados para ratear custos sobre o custo base do item. */
export interface RateiosPercentuais {
  fretePct: number;
  overheadPct: number;
  variavelPct: number;
}

export function rateiosPercentuais(context: FullPricingContext): RateiosPercentuais {
  const cfg = context.configuracoes;
  const totalCustosFixosAtivos = context.custosFixos.filter(c => c.ativo).reduce((acc, c) => acc + c.valorMensal, 0);
  const overheadPct = cfg.overheadPercentManual && cfg.overheadPercentManual > 0
    ? cfg.overheadPercentManual / 100
    : (cfg.faturamentoMensalPrevisto && cfg.faturamentoMensalPrevisto > 0 ? totalCustosFixosAtivos / cfg.faturamentoMensalPrevisto : 0);
  const variavelPct = context.custosVariaveis
    .filter(c => c.ativo && c.tipoRateio === 'PERCENT_CERTAME')
    .reduce((acc, c) => acc + c.valor, 0) / 100;
  return { fretePct: (cfg.fretePadraoPercent || 0) / 100, overheadPct, variavelPct };
}

/** Item com preço vencedor e sem custo informado: o custo será estimado (cálculo retroativo). */
export function itemEhEstimado(item: Pick<ItemPrecificacao, 'precoFinalVendidoReal' | 'custoUnitBase'>): boolean {
  return !!item.precoFinalVendidoReal && item.precoFinalVendidoReal > 0 && !(item.custoUnitBase > 0);
}

export interface EstimativaRetroativa {
  disponivel: boolean;
  custoTotalUnit: number;
  custoBaseUnit: number;
  freteUnit: number;
  overheadUnit: number;
}

/**
 * Cálculo retroativo (regra de margem definida em 14/10/2026: lucro sobre o preço final, depois de tudo):
 *   preço = custo total ÷ (1 − alíquota − margem)   =>   custo total = preço × (1 − alíquota − margem)
 * O custo total é então separado em custo base + frete + rateios (fixo e variável percentual), usando os
 * percentuais atuais das configurações: custo total = base × (1 + frete% + overhead% + variável%).
 */
export function estimarCustoRetroativo(precoUnit: number, aliquotaPct: number, margemPct: number, r: RateiosPercentuais): EstimativaRetroativa {
  const fracCusto = 1 - aliquotaPct / 100 - margemPct / 100;
  if (!(precoUnit > 0) || fracCusto <= 0) return { disponivel: false, custoTotalUnit: 0, custoBaseUnit: 0, freteUnit: 0, overheadUnit: 0 };
  const custoTotalUnit = precoUnit * fracCusto;
  const fator = 1 + r.fretePct + r.overheadPct + r.variavelPct;
  const custoBaseUnit = custoTotalUnit / fator;
  return { disponivel: true, custoTotalUnit, custoBaseUnit, freteUnit: custoBaseUnit * r.fretePct, overheadUnit: custoBaseUnit * (r.overheadPct + r.variavelPct) };
}

export type CertameComCalculo = CertameUnificado & { itens: (ItemPrecificacao & { metrics: CalculatedItemMetrics })[] };

// The main function. It takes a certame and the full context, and returns a new certame with calculated metrics for each item.
// Note: This function DOES NOT MUTATE the original object. It returns a new one.
// The calculated metrics are attached to each item under a 'metrics' property for display.
export function calculateCertamePricing(
  certame: CertameUnificado | null,
  context: FullPricingContext | null
): CertameComCalculo | null {

  // Defensively ensure 'itens' is an array, as it might be missing from Firestore data for a new certame.
  const safeCertame = certame ? { ...certame, itens: certame.itens || [] } : null;

  if (!safeCertame || !context) {
    return null;
  }
  
  const rateios = rateiosPercentuais(context);

  // This is the core logic for an individual item's metrics.
  // It's used for both frozen and non-frozen states.
  const calculateMetricsForItem = (item: ItemPrecificacao, custoTotalUnit: number): CalculatedItemMetrics => {
      const categoria = context.categorias.find(c => c.id === item.categoriaId);
      const margemAplicadaPercent = item.margemManualPct ?? categoria?.margemPadraoPercent ?? 0;
      const aliquotaImpostoPercent = item.aliquotaPct;
      const aliquotaImposto = aliquotaImpostoPercent / 100;

      // Cálculo retroativo: só o preço vencedor foi informado, o custo é estimado a partir dele.
      const estimado = itemEhEstimado(item);
      const estimativa = estimado
        ? estimarCustoRetroativo(item.precoFinalVendidoReal as number, aliquotaImpostoPercent, margemAplicadaPercent, rateios)
        : null;
      if (estimativa) custoTotalUnit = estimativa.custoTotalUnit;

      // Path 1: Simulation based on margin to find the simulated price.
      //
      // Certames abertos: margem sobre o PREÇO FINAL, depois de todos os custos e impostos.
      //   preço final = custo total ÷ (1 − alíquota − margem)
      // Certames congelados: mantém a regra antiga (margem sobre o preço sem imposto), para que
      // propostas já enviadas ou ganhas não mudem de valor retroativamente.
      // Itens estimados (retroativo) sempre usam a regra nova, mesmo em certame congelado.
      const margemSobreFinal = !safeCertame.congelado || estimado;
      const margemFrac = margemAplicadaPercent / 100;

      let precoFinalUnit_simulado: number;
      let lucroUnit_simulado: number;

      if (margemSobreFinal) {
        const divisor = 1 - aliquotaImposto - margemFrac;
        precoFinalUnit_simulado = custoTotalUnit > 0 && divisor > 0 ? custoTotalUnit / divisor : custoTotalUnit;
        lucroUnit_simulado = precoFinalUnit_simulado * (1 - aliquotaImposto) - custoTotalUnit;
      } else {
        const precoLiquidoUnit_simulado = custoTotalUnit > 0 && margemAplicadaPercent < 100
          ? custoTotalUnit / (1 - margemFrac)
          : custoTotalUnit;
        precoFinalUnit_simulado = precoLiquidoUnit_simulado > 0 && aliquotaImposto < 1
          ? precoLiquidoUnit_simulado / (1 - aliquotaImposto)
          : precoLiquidoUnit_simulado;
        lucroUnit_simulado = precoLiquidoUnit_simulado - custoTotalUnit;
      }

      // Path 2: Determine the definitive price and profit to be used for display and aggregation
      let precoFinalUnit: number;
      let lucroUnit: number;

      // The key logic: prioritize the REAL price if it exists for retro calculations.
      if (item.precoFinalVendidoReal && item.precoFinalVendidoReal > 0) {
          precoFinalUnit = item.precoFinalVendidoReal;
          const impostoRealUnit = precoFinalUnit * aliquotaImposto;
          const precoLiquidoRealUnit = precoFinalUnit - impostoRealUnit;
          lucroUnit = precoLiquidoRealUnit - custoTotalUnit;
      } else {
          precoFinalUnit = precoFinalUnit_simulado;
          lucroUnit = lucroUnit_simulado;
      }

      const lucroTotal = lucroUnit * (item.qtd || 0);

      // Final derived metrics for display
      const impostoUnit = precoFinalUnit * aliquotaImposto;
      const precoLiquidoUnit = precoFinalUnit - impostoUnit;
      const baseMargem = margemSobreFinal ? precoFinalUnit : precoLiquidoUnit;
      const margemFinalPercent = baseMargem > 0 ? (lucroUnit / baseMargem) * 100 : 0;
      
      let resultado: CalculatedItemMetrics['resultado'] = 'NEUTRO';
      if (lucroTotal > 0.001) resultado = 'GANHO';
      if (lucroTotal < -0.001) resultado = 'PREJUIZO';

      let viabilidade: CalculatedItemMetrics['viabilidade'] = 'N/A';
      if (!safeCertame.orcamentoSigiloso && item.precoReferencia && item.precoReferencia > 0) {
          if (precoFinalUnit > item.precoReferencia) {
              viabilidade = 'INVIÁVEL';
          } else if (lucroTotal < 0) {
               viabilidade = 'ATENÇÃO';
          } else {
               viabilidade = 'OK';
          }
      }

      return {
        custoTotalUnit,
        margemAplicadaPercent: margemFinalPercent,
        margemSobre: margemSobreFinal ? 'PRECO_FINAL' : 'PRECO_LIQUIDO',
        precoLiquidoUnit,
        aliquotaImpostoPercent,
        impostoUnit,
        precoFinalUnit,
        lucroUnit,
        lucroTotal,
        viabilidade,
        resultado,
        // Pass through raw values for reference if they exist, but don't use them in primary display logic
        lucroReal: item.lucroReal,
        margemRealPct: item.margemRealPct,
        estimado,
        estimativaIndisponivel: estimativa ? !estimativa.disponivel : undefined,
        custoBaseEstimadoUnit: estimativa?.disponivel ? estimativa.custoBaseUnit : undefined,
        freteEstimadoUnit: estimativa?.disponivel ? estimativa.freteUnit : undefined,
        overheadEstimadoUnit: estimativa?.disponivel ? estimativa.overheadUnit : undefined,
      };
  };

  if (safeCertame.congelado) {
      // For a FROZEN certame, we calculate metrics based on the stored values
      // for frete and overhead. We do NOT recalculate them.
      const frozenItems = safeCertame.itens.map(item => {
          const custoTotalUnit = item.custoUnitBase + item.freteUnitario + item.custoFixoRateadoUnit;
          const metrics = calculateMetricsForItem(item, custoTotalUnit);
          return { ...item, metrics };
      });
      return { ...safeCertame, itens: frozenItems };
  }

  // For a NON-FROZEN certame, we first recalculate apportioned costs (frete/overhead)
  // based on the current global settings.

  // Base de custo do item para ratear frete e variáveis: o custo informado ou, nos itens retroativos,
  // o custo base estimado a partir do preço vencedor.
  const baseParaRateio = (item: ItemPrecificacao) => {
    if (!itemEhEstimado(item)) return item.custoUnitBase;
    const categoria = context.categorias.find(c => c.id === item.categoriaId);
    const margem = item.margemManualPct ?? categoria?.margemPadraoPercent ?? 0;
    return estimarCustoRetroativo(item.precoFinalVendidoReal as number, item.aliquotaPct, margem, rateios).custoBaseUnit;
  };

  const subtotalCustoCertame = safeCertame.itens.reduce((acc, item) => acc + (baseParaRateio(item) * item.qtd), 0);

  const freteCertame = (context.configuracoes.fretePadraoPercent / 100) * subtotalCustoCertame;
  
  const totalCustosFixosAtivos = context.custosFixos
    .filter(c => c.ativo)
    .reduce((acc, c) => acc + c.valorMensal, 0);

  const overheadPercentCalculado = context.configuracoes.overheadPercentManual && context.configuracoes.overheadPercentManual > 0
    ? context.configuracoes.overheadPercentManual / 100
    : (context.configuracoes.faturamentoMensalPrevisto && context.configuracoes.faturamentoMensalPrevisto > 0 
        ? totalCustosFixosAtivos / context.configuracoes.faturamentoMensalPrevisto
        : 0);
  
  // Calculate total variable costs for the certame
  const custosVariaveisAtivos = context.custosVariaveis.filter(c => c.ativo);
  
  const totalCustoVariavelFixo = custosVariaveisAtivos
    .filter(c => c.tipoRateio === 'VALOR_CERTAME')
    .reduce((acc, c) => acc + c.valor, 0);

  const totalCustoVariavelPercentualRate = custosVariaveisAtivos
    .filter(c => c.tipoRateio === 'PERCENT_CERTAME')
    .reduce((acc, c) => acc + c.valor, 0) / 100; // e.g., 1.5% becomes 0.015

  const valorTotalCustoVariavelPercentual = subtotalCustoCertame * totalCustoVariavelPercentualRate;

  const custoVariavelTotalCertame = totalCustoVariavelFixo + valorTotalCustoVariavelPercentual;


  const calculatedItens = safeCertame.itens.map(item => {
    // Create a mutable copy to hold the newly calculated costs
    const mutableItem = { ...item };

    const itemCustoTotalBase = baseParaRateio(mutableItem) * mutableItem.qtd;
    const itemProportion = subtotalCustoCertame > 0 ? itemCustoTotalBase / subtotalCustoCertame : (1 / (safeCertame.itens.length || 1));

    // Update the item's apportioned costs for this calculation session
    mutableItem.freteUnitario = mutableItem.qtd > 0 ? (freteCertame * itemProportion) / mutableItem.qtd : 0;
    
    // Calculate and combine fixed and variable overheads
    const overheadFixoUnit = mutableItem.custoUnitBase * overheadPercentCalculado;
    const overheadVariavelUnit = mutableItem.qtd > 0 ? (custoVariavelTotalCertame * itemProportion) / mutableItem.qtd : 0;
    mutableItem.custoFixoRateadoUnit = overheadFixoUnit + overheadVariavelUnit;

    // Now, calculate the final metrics using these fresh costs
    const custoTotalUnit = mutableItem.custoUnitBase + mutableItem.freteUnitario + mutableItem.custoFixoRateadoUnit;
    const metrics = calculateMetricsForItem(mutableItem, custoTotalUnit);
    
    // Return the item with its freshly calculated costs and metrics
    return { ...mutableItem, metrics };
  });

  return { ...safeCertame, itens: calculatedItens };
}
