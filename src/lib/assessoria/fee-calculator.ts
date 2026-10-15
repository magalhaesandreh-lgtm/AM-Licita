// src/lib/assessoria/fee-calculator.ts
//
// Honorários de êxito em ESCALA PROGRESSIVA (decisão do André em 14/10/2026):
// cada percentual incide somente sobre a parcela do valor que cai dentro da faixa,
// como no imposto de renda. Assim não existe "degrau": quanto maior o valor do
// empenho, maior (ou igual) o honorário.

function round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface FaixaExito {
    /** Limite superior da faixa (Infinity na última). */
    ate: number;
    percentual: number;
}

export interface DetalheFaixaExito {
    de: number;
    ate: number | null;
    base: number;
    percentual: number;
    valor: number;
}

export interface ResultadoExito {
    /** Percentual efetivo: honorário total ÷ valor do empenho. */
    percentual: number;
    regra: string;
    valorExito: number;
    detalhe: DetalheFaixaExito[];
}

export const FAIXAS_EXITO: FaixaExito[] = [
    { ate: 50000, percentual: 0.10 },
    { ate: 100000, percentual: 0.07 },
    { ate: 500000, percentual: 0.05 },
    { ate: 2000000, percentual: 0.03 },
    { ate: Infinity, percentual: 0.02 },
];

export const FAIXAS_HIBRIDO: FaixaExito[] = [
    { ate: 1000000, percentual: 0.04 },
    { ate: Infinity, percentual: 0.02 },
];

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

export function calcularProgressivo(valorEmpenho: number, faixas: FaixaExito[], rotulo: string): ResultadoExito {
    if (isNaN(valorEmpenho) || valorEmpenho <= 0) {
        return { percentual: 0, regra: 'Valor inválido', valorExito: 0, detalhe: [] };
    }

    const detalhe: DetalheFaixaExito[] = [];
    let piso = 0;
    let total = 0;

    for (const faixa of faixas) {
        if (valorEmpenho <= piso) break;
        const teto = Math.min(valorEmpenho, faixa.ate);
        const base = teto - piso;
        if (base > 0) {
            const valor = base * faixa.percentual;
            total += valor;
            detalhe.push({
                de: piso,
                ate: Number.isFinite(faixa.ate) ? faixa.ate : null,
                base: round(base),
                percentual: faixa.percentual,
                valor: round(valor),
            });
        }
        piso = faixa.ate;
    }

    const valorExito = round(total);
    const regra = `${rotulo}: ` + detalhe.map(d => `${moeda(d.base)} a ${pct(d.percentual)}`).join(' + ');
    return { percentual: valorExito / valorEmpenho, regra, valorExito, detalhe };
}

export function calcularExitoPorFaixa(valorEmpenho: number): ResultadoExito {
    return calcularProgressivo(valorEmpenho, FAIXAS_EXITO, 'Êxito progressivo');
}

export function calcularExitoHibrido(valorEmpenho: number): ResultadoExito {
    return calcularProgressivo(valorEmpenho, FAIXAS_HIBRIDO, 'Híbrido progressivo');
}
