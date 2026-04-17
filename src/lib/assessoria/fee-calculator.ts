// src/lib/assessoria/fee-calculator.ts

function round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calcularExitoPorFaixa(valorEmpenho: number): { percentual: number; regra: string; valorExito: number } {
    if (isNaN(valorEmpenho) || valorEmpenho <= 0) {
        return { percentual: 0, regra: 'Valor inválido', valorExito: 0 };
    }

    let percentual: number;
    let regra: string;

    if (valorEmpenho <= 50000) {
        percentual = 0.10;
        regra = 'Faixa 0-50k (10%)';
    } else if (valorEmpenho <= 100000) {
        percentual = 0.07;
        regra = 'Faixa 50k-100k (7%)';
    } else if (valorEmpenho <= 500000) {
        percentual = 0.05;
        regra = 'Faixa 100k-500k (5%)';
    } else if (valorEmpenho <= 2000000) {
        percentual = 0.03;
        regra = 'Faixa 500k-2M (3%)';
    } else {
        percentual = 0.02;
        regra = 'Faixa >2M (2%)';
    }
    
    const valorExito = round(valorEmpenho * percentual);

    return { percentual, regra, valorExito };
}


export function calcularExitoHibrido(valorEmpenho: number): { percentual: number; regra: string; valorExito: number } {
    if (isNaN(valorEmpenho) || valorEmpenho <= 0) {
        return { percentual: 0, regra: 'Valor inválido', valorExito: 0 };
    }

    let percentual: number;
    let regra: string;

    if (valorEmpenho <= 1000000) {
        percentual = 0.04;
        regra = 'Híbrido <=1M (4%)';
    } else {
        percentual = 0.02;
        regra = 'Híbrido >1M (2%)';
    }

    const valorExito = round(valorEmpenho * percentual);
    
    return { percentual, regra, valorExito };
}
