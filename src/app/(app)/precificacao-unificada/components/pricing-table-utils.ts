import type { ItemPrecificacao } from '@/lib/models';
import type { CalculatedItemMetrics } from '@/lib/pricing-calculator';
import { formatCurrency } from '@/lib/utils';

export type PricingTableItem = ItemPrecificacao & { metrics: CalculatedItemMetrics };

export const EMPTY_TABLE_VALUE = '--';

export function toFiniteNumber(value: number | string | null | undefined): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed
        .replace(/R\$\s?/g, '')
        .replace(/\s/g, '')
        .replace(/[^0-9,.-]/g, '');
    const decimalValue = normalized.includes(',')
        ? normalized.replace(/\./g, '').replace(',', '.')
        : /^-?\d{1,3}(\.\d{3})+$/.test(normalized)
            ? normalized.replace(/\./g, '')
            : normalized;
    const parsed = Number(decimalValue);
    return Number.isFinite(parsed) ? parsed : null;
}

export function formatTableCurrency(value: number | string | null | undefined): string {
    const numericValue = toFiniteNumber(value);
    return numericValue === null ? EMPTY_TABLE_VALUE : formatCurrency(numericValue);
}

export function formatTableNumber(value: number | string | null | undefined, maximumFractionDigits = 4): string {
    const numericValue = toFiniteNumber(value);
    if (numericValue === null) return EMPTY_TABLE_VALUE;
    return numericValue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits });
}

export function getItemTotalCost(item: PricingTableItem): number | null {
    const unitCost = toFiniteNumber(item.metrics.custoTotalUnit);
    const quantity = toFiniteNumber(item.qtd);
    return unitCost === null || quantity === null ? null : unitCost * quantity;
}

export function getReferenceProfit(item: PricingTableItem): number | null {
    const referencePrice = toFiniteNumber(item.precoReferencia);
    const unitCost = toFiniteNumber(item.metrics.custoTotalUnit);
    const quantity = toFiniteNumber(item.qtd);
    if (referencePrice === null || unitCost === null || quantity === null) return null;
    return (referencePrice - unitCost) * quantity;
}

export function getEconomicViability(item: PricingTableItem): 'Viável' | 'Inviável' | 'Indefinido' {
    const referencePrice = toFiniteNumber(item.precoReferencia);
    const finalPrice = toFiniteNumber(item.metrics.precoFinalUnit);
    const unitCost = toFiniteNumber(item.metrics.custoTotalUnit);
    const unitProfit = toFiniteNumber(item.metrics.lucroUnit);
    const quantity = toFiniteNumber(item.qtd);
    if (referencePrice === null || referencePrice <= 0 || finalPrice === null || unitCost === null || unitProfit === null || quantity === null || quantity <= 0) {
        return 'Indefinido';
    }
    return finalPrice <= referencePrice && unitProfit > 0 ? 'Viável' : 'Inviável';
}
