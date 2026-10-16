import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '@/lib/utils';
import { FAIXAS_EXITO, FAIXAS_HIBRIDO, type FaixaExito } from './fee-calculator';

export interface DadosProposta {
    clienteNome: string;
    clienteCnpj?: string;
    titulo: string;
    tipoCobranca: 'MENSAL' | 'POR_PROCESSO';
    periodos: number;
    /** Valor cobrado por período (mensalidade) ou pelo processo. */
    precoProposto: number;
    modeloExito: 'NENHUM' | 'EXITO' | 'HIBRIDO';
    escopo?: string;
    validadeDias: number;
    observacoes?: string;
    emissao?: Date;
}

// Dados da proponente (timbrado da AM Contratos & Soluções B2G).
const EMPRESA = {
    nome: 'AM Contratos & Soluções B2G',
    cnpj: 'CNPJ 59.802.261/0001-78',
    endereco: 'Rua Acre, 228, Ilhotas, Teresina/PI, CEP 64001-625',
};


/** Escreve um texto justificado (parágrafo a parágrafo) e devolve o novo y. */
function paragrafos(doc: jsPDF, texto: string, x: number, y: number, largura: number, passo = 5): number {
    for (const par of texto.split(/\n+/).map(s => s.trim()).filter(Boolean)) {
        const linhas = doc.splitTextToSize(par, largura) as string[];
        // a última linha de um parágrafo não é justificada; as demais sim
        if (linhas.length > 1) {
            const corpo = linhas.slice(0, -1);
            for (const l of corpo) {
                doc.text(l, x, y, { align: 'justify', maxWidth: largura });
                y += passo;
            }
        }
        doc.text(linhas[linhas.length - 1], x, y);
        y += passo + 1;
    }
    return y;
}

const moeda = (v: number) => formatCurrency(v);

function descreverFaixas(faixas: FaixaExito[]): string[][] {
    const linhas: string[][] = [];
    let piso = 0;
    for (const f of faixas) {
        const pct = `${(f.percentual * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
        const trecho = Number.isFinite(f.ate)
            ? `De ${moeda(piso)} até ${moeda(f.ate)}`
            : `Acima de ${moeda(piso)}`;
        linhas.push([trecho, pct]);
        piso = f.ate;
    }
    return linhas;
}

/**
 * Proposta comercial para o cliente. Não exibe custos internos, impostos nem margem.
 * Texto formal, sem travessões.
 */
export function gerarPropostaPdf(d: DadosProposta): jsPDF {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const largura = doc.internal.pageSize.getWidth();
    const margem = 20;
    const util = largura - margem * 2;
    const emissao = d.emissao ?? new Date();
    let y = 22;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(EMPRESA.nome, margem, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    y += 5;
    doc.text(`${EMPRESA.cnpj}  |  ${EMPRESA.endereco}`, margem, y);
    doc.setDrawColor(180);
    y += 3;
    doc.line(margem, y, largura - margem, y);
    doc.setTextColor(0);

    y += 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('PROPOSTA COMERCIAL', margem, y);
    y += 7;
    doc.setFontSize(11);
    doc.text(d.titulo, margem, y, { maxWidth: util });
    y += 4 + 5 * Math.max(0, Math.ceil(doc.getTextWidth(d.titulo) / util) - 1);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    y += 6;
    doc.text(`Teresina/PI, ${emissao.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.`, margem, y);
    y += 6;
    doc.text(`Destinatário: ${d.clienteNome}${d.clienteCnpj ? `, ${d.clienteCnpj}` : ''}.`, margem, y, { maxWidth: util });

    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('1. Objeto e escopo dos serviços', margem, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
    const escopo = (d.escopo || '').trim() || 'Escopo a ser detalhado entre as partes.';
    y = paragrafos(doc, escopo, margem, y, util) + 4;

    doc.setFont('helvetica', 'bold');
    doc.text('2. Investimento', margem, y);
    doc.setFont('helvetica', 'normal');
    y += 4;

    const corpo: string[][] = [];
    if (d.tipoCobranca === 'MENSAL') {
        corpo.push(['Mensalidade', moeda(d.precoProposto)]);
        corpo.push(['Prazo do contrato', `${d.periodos} ${d.periodos === 1 ? 'mês' : 'meses'}`]);
        corpo.push(['Valor total do contrato', moeda(d.precoProposto * d.periodos)]);
    } else {
        corpo.push(['Valor por processo', moeda(d.precoProposto)]);
    }
    autoTable(doc, {
        startY: y,
        body: corpo,
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 2.5 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 }, 1: { halign: 'right' } },
        margin: { left: margem, right: margem },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    if (d.modeloExito !== 'NENHUM') {
        doc.setFont('helvetica', 'bold');
        doc.text('3. Honorários de êxito', margem, y);
        doc.setFont('helvetica', 'normal');
        y += 6;
        const intro =
            d.modeloExito === 'EXITO'
                ? 'Além do valor acima, incidem honorários de êxito sobre o valor de cada empenho obtido, em escala progressiva: cada percentual aplica-se somente à parcela do valor que estiver dentro da respectiva faixa.'
                : 'Em complemento à mensalidade acima, incidem honorários de êxito sobre o valor de cada empenho obtido, em escala progressiva: cada percentual aplica-se somente à parcela do valor que estiver dentro da respectiva faixa.';
        y = paragrafos(doc, intro, margem, y, util) + 1;
        autoTable(doc, {
            startY: y,
            head: [['Faixa do valor do empenho', 'Percentual']],
            body: descreverFaixas(d.modeloExito === 'EXITO' ? FAIXAS_EXITO : FAIXAS_HIBRIDO),
            theme: 'grid',
            styles: { fontSize: 10, cellPadding: 2.5 },
            headStyles: { fillColor: [60, 60, 60] },
            columnStyles: { 1: { halign: 'right', cellWidth: 35 } },
            margin: { left: margem, right: margem },
        });
        y = (doc as any).lastAutoTable.finalY + 8;
    }

    const n = d.modeloExito !== 'NENHUM' ? 4 : 3;
    doc.setFont('helvetica', 'bold');
    doc.text(`${n}. Validade e condições`, margem, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
    const cond = [
        `Esta proposta é válida por ${d.validadeDias} dias a contar da data de emissão.`,
        ...(d.observacoes?.trim() ? [d.observacoes.trim()] : []),
    ].join(' ');
    y = paragrafos(doc, cond, margem, y, util) + 16;

    if (y > 272) {
        doc.addPage();
        y = 40;
    }
    doc.line(margem, y, margem + 80, y);
    doc.setFontSize(9);
    doc.text(EMPRESA.nome, margem, y + 5);
    doc.text(EMPRESA.cnpj, margem, y + 10);

    return doc;
}
