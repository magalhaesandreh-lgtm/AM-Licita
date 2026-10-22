import type jsPDF from 'jspdf';
import { garantirEspaco, MARGEM_TIMBRADO } from './timbrado';

/** Blocos de texto comuns aos relatórios (títulos, seções, parágrafos, quadros de destaque). */

export const COR_AZUL: [number, number, number] = [32, 66, 132];
export const COR_TEXTO: [number, number, number] = [35, 35, 35];
export const COR_SUAVE: [number, number, number] = [100, 100, 100];

export const SITUACAO_CORES: Record<string, { fundo: [number, number, number]; texto: [number, number, number] }> = {
    VIAVEL: { fundo: [220, 242, 225], texto: [22, 101, 52] },
    MARGEM_REDUZIDA: { fundo: [254, 243, 199], texto: [146, 64, 14] },
    PREJUIZO: { fundo: [254, 226, 226], texto: [153, 27, 27] },
    SEM_CUSTO: { fundo: [235, 235, 235], texto: [80, 80, 80] },
    SEM_REFERENCIA: { fundo: [224, 231, 255], texto: [55, 48, 163] },
};

export const larguraUtil = (doc: jsPDF) => doc.internal.pageSize.getWidth() - MARGEM_TIMBRADO.left - MARGEM_TIMBRADO.right;

export function tituloRelatorio(doc: jsPDF, titulo: string, subtitulo: string, linhas: string[]): number {
    const x = MARGEM_TIMBRADO.left;
    let y = MARGEM_TIMBRADO.top + 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...COR_AZUL);
    doc.text(titulo, x, y);
    y += 6;
    doc.setFontSize(10.5);
    doc.setTextColor(...COR_TEXTO);
    const sub = doc.splitTextToSize(subtitulo, larguraUtil(doc)) as string[];
    doc.text(sub, x, y);
    y += sub.length * 4.8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COR_SUAVE);
    linhas.filter(Boolean).forEach(l => { (doc.splitTextToSize(l, larguraUtil(doc)) as string[]).forEach(t => { doc.text(t, x, y); y += 4.2; }); });
    doc.setTextColor(...COR_TEXTO);
    return y + 2;
}

export function secao(doc: jsPDF, y: number, texto: string): number {
    y = garantirEspaco(doc, y, 18);
    const x = MARGEM_TIMBRADO.left;
    doc.setFillColor(...COR_AZUL);
    doc.rect(x, y - 4.2, 1.6, 5.6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...COR_AZUL);
    doc.text(texto, x + 3.5, y);
    doc.setTextColor(...COR_TEXTO);
    doc.setFont('helvetica', 'normal');
    return y + 6;
}

/** Parágrafo justificado com quebra de página. Aceita **negrito** simples no início ("**Rótulo:** texto"). */
export function paragrafo(doc: jsPDF, y: number, texto: string, opcoes: { tamanho?: number; recuo?: number; passo?: number } = {}): number {
    const tamanho = opcoes.tamanho ?? 9.5;
    const passo = opcoes.passo ?? tamanho * 0.48;
    const x = MARGEM_TIMBRADO.left + (opcoes.recuo ?? 0);
    const largura = larguraUtil(doc) - (opcoes.recuo ?? 0);
    doc.setFontSize(tamanho);
    let rotulo = '';
    let corpo = texto;
    const m = /^\*\*(.+?)\*\*\s?([\s\S]*)$/.exec(texto);
    if (m) { rotulo = m[1] + ' '; corpo = m[2]; }
    doc.setFont('helvetica', 'bold');
    const wRot = rotulo ? doc.getTextWidth(rotulo) : 0;
    doc.setFont('helvetica', 'normal');
    // A primeira linha começa depois do rótulo em negrito.
    const linhas: string[] = [];
    const palavras = corpo.split(/\s+/).filter(Boolean);
    let atual = '';
    let limite = largura - wRot;
    for (const p of palavras) {
        const teste = atual ? `${atual} ${p}` : p;
        if (doc.getTextWidth(teste) > limite && atual) { linhas.push(atual); atual = p; limite = largura; }
        else atual = teste;
    }
    if (atual) linhas.push(atual);
    linhas.forEach((l, i) => {
        y = garantirEspaco(doc, y, passo);
        let xl = x;
        if (i === 0 && rotulo) {
            doc.setFont('helvetica', 'bold');
            doc.text(rotulo, x, y);
            doc.setFont('helvetica', 'normal');
            xl = x + wRot;
        }
        const ultima = i === linhas.length - 1;
        const larguraLinha = i === 0 ? largura - wRot : largura;
        if (!ultima) doc.text(l, xl, y, { align: 'justify', maxWidth: larguraLinha });
        else doc.text(l, xl, y);
        y += passo;
    });
    return y + 1.6;
}

export function marcador(doc: jsPDF, y: number, texto: string, tamanho = 9.5): number {
    y = garantirEspaco(doc, y, 5);
    doc.setFontSize(tamanho);
    doc.text('•', MARGEM_TIMBRADO.left + 2, y);
    return paragrafo(doc, y, texto, { tamanho, recuo: 6 }) - 0.6;
}

/** Quadros de números em destaque (2 a 4 por linha). */
export function quadros(doc: jsPDF, y: number, itens: { rotulo: string; valor: string; cor?: [number, number, number] }[], porLinha = 3): number {
    const gap = 3;
    const w = (larguraUtil(doc) - gap * (porLinha - 1)) / porLinha;
    const h = 15;
    for (let i = 0; i < itens.length; i += porLinha) {
        y = garantirEspaco(doc, y, h + 3);
        itens.slice(i, i + porLinha).forEach((q, j) => {
            const x = MARGEM_TIMBRADO.left + j * (w + gap);
            doc.setFillColor(244, 246, 251);
            doc.setDrawColor(210, 216, 230);
            doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD');
            doc.setFontSize(7.8);
            doc.setTextColor(...COR_SUAVE);
            doc.text(doc.splitTextToSize(q.rotulo, w - 4) as string[], x + 2.5, y + 4.6);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11.5);
            doc.setTextColor(...(q.cor || COR_TEXTO));
            doc.text(q.valor, x + 2.5, y + 12);
            doc.setFont('helvetica', 'normal');
        });
        y += h + gap;
    }
    doc.setTextColor(...COR_TEXTO);
    doc.setDrawColor(0);
    return y + 2;
}

/** Caixa de destaque com fundo (conclusão, atenção). */
export function destaque(doc: jsPDF, y: number, titulo: string, texto: string, cor: { fundo: [number, number, number]; texto: [number, number, number] }): number {
    const largura = larguraUtil(doc) - 8;
    doc.setFontSize(9.5);
    const linhas = doc.splitTextToSize(texto, largura) as string[];
    const h = 8 + linhas.length * 4.6 + 2;
    y = garantirEspaco(doc, y, h + 2);
    const x = MARGEM_TIMBRADO.left;
    doc.setFillColor(...cor.fundo);
    doc.roundedRect(x, y, larguraUtil(doc), h, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...cor.texto);
    doc.text(titulo, x + 4, y + 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COR_TEXTO);
    let yy = y + 10.5;
    linhas.forEach((l, i) => {
        if (i < linhas.length - 1) doc.text(l, x + 4, yy, { align: 'justify', maxWidth: largura });
        else doc.text(l, x + 4, yy);
        yy += 4.6;
    });
    return y + h + 4;
}

export function assinaturaAm(doc: jsPDF, y: number, texto = 'Relatório elaborado pela AM Contratos & Soluções B2G, assessoria em licitações e contratos públicos.'): number {
    y = garantirEspaco(doc, y + 4, 16);
    doc.setDrawColor(180);
    doc.line(MARGEM_TIMBRADO.left, y, MARGEM_TIMBRADO.left + 70, y);
    doc.setFontSize(8.5);
    doc.setTextColor(...COR_SUAVE);
    doc.text(doc.splitTextToSize(texto, larguraUtil(doc)) as string[], MARGEM_TIMBRADO.left, y + 4.5);
    doc.setTextColor(...COR_TEXTO);
    doc.setDrawColor(0);
    return y + 12;
}
