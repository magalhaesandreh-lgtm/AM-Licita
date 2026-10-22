import jsPDF, { type jsPDFOptions } from 'jspdf';
import { MARCA, RODAPE, TOPO_FAIXA, TOPO_LOGO } from './timbrado-imagens';

/**
 * Papel timbrado da AM Contratos & Soluções B2G nos PDFs do AM Gestão.
 * Reproduz o arquivo oficial (EMPRESA\ADMINISTRATIVO\Modelos_e_Timbrados\Timbrado.docx): faixa azul com o
 * brasão no topo, nome, lema e e-mail, marca-d'água ao centro e rodapé com CNPJ, endereço e WhatsApp.
 * Funciona em retrato e paisagem; o timbrado é desenhado em toda página nova ANTES do conteúdo.
 */

export const EMPRESA_TIMBRADO = {
    nome: 'AM CONTRATOS & SOLUÇÕES B2G',
    nomeRodape: 'AM Contratos & Soluções B2G',
    lema: '“EFICIÊNCIA, TRANSPARÊNCIA E RESULTADOS”',
    email: 'amcontratos@amcbg.com.br',
    cnpj: '59.802.261/0001-78',
    endereco: 'Rua Acre, 228 – Ilhotas – Teresina/PI – Edifício Cantu Jurídico, CEP: 64001-625',
    whatsapp: 'WhatsApp – (86) 9 9460-8559',
};

/** Área livre para o conteúdo (mm). Use nas chamadas do autoTable: margin: MARGEM_TIMBRADO. */
export const MARGEM_TIMBRADO = { top: 40, bottom: 34, left: 15, right: 15 };

// Medidas do timbrado oficial, em mm (página A4 de 210 mm).
const LOGO_LADO = 31.34;
const FAIXA_ALTURA = 15.45;
const RODAPE_ALTURA = 32.82;
const MARCA_DIAMETRO = 87;

/** Desenha o timbrado na página atual. */
export function desenharTimbrado(doc: jsPDF): void {
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    // Guarda o estado de texto para não alterar o que o gerador estava usando.
    const fonte = doc.getFont();
    const tamanho = doc.getFontSize();
    const corTexto = doc.getTextColor();

    // Marca-d'água (primeiro, para ficar por baixo de tudo).
    const d = Math.min(MARCA_DIAMETRO, H - MARGEM_TIMBRADO.top - MARGEM_TIMBRADO.bottom);
    doc.addImage(MARCA, 'JPEG', (W - d) / 2, H * 0.47 - d / 2, d, d, 'am-marca', 'FAST');

    // Topo: faixa azul (esticada na largura) e brasão.
    doc.addImage(TOPO_FAIXA, 'JPEG', LOGO_LADO - 0.1, 0, W - LOGO_LADO + 0.1, FAIXA_ALTURA, 'am-faixa', 'FAST');
    doc.addImage(TOPO_LOGO, 'JPEG', 0, 0, LOGO_LADO, LOGO_LADO, 'am-logo', 'FAST');

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(EMPRESA_TIMBRADO.nome, W / 2, 21.3, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(EMPRESA_TIMBRADO.lema, W / 2, 26.4, { align: 'center' });
    doc.setTextColor(0, 0, 238);
    doc.textWithLink(EMPRESA_TIMBRADO.email, W / 2 - doc.getTextWidth(EMPRESA_TIMBRADO.email) / 2, 31.9, { url: `mailto:${EMPRESA_TIMBRADO.email}` });
    doc.setDrawColor(255, 213, 89);
    doc.setLineWidth(0.7);
    doc.line(0, 34.6, W, 34.6);

    // Rodapé: ondas, linha azul e dados da empresa.
    doc.addImage(RODAPE, 'JPEG', 0, H - RODAPE_ALTURA, W, RODAPE_ALTURA, 'am-rodape', 'FAST');
    doc.setDrawColor(68, 114, 196);
    doc.setLineWidth(0.3);
    doc.line(0, H - 28.6, W, H - 28.6);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8.5);
    const l1a = `${EMPRESA_TIMBRADO.nomeRodape} CNPJ:`;
    const l1b = ` ${EMPRESA_TIMBRADO.cnpj}`;
    doc.setFont('helvetica', 'bold');
    const wA = doc.getTextWidth(l1a);
    doc.setFont('helvetica', 'normal');
    const wB = doc.getTextWidth(l1b);
    const x1 = W / 2 - (wA + wB) / 2;
    doc.setFont('helvetica', 'bold');
    doc.text(l1a, x1, H - 24.3);
    doc.setFont('helvetica', 'normal');
    doc.text(l1b, x1 + wA, H - 24.3);
    doc.text(EMPRESA_TIMBRADO.endereco, W / 2, H - 19.9, { align: 'center' });
    doc.text(EMPRESA_TIMBRADO.whatsapp, W / 2, H - 15.5, { align: 'center' });

    doc.setFont(fonte.fontName, fonte.fontStyle);
    doc.setFontSize(tamanho);
    doc.setTextColor(corTexto);
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
}

/**
 * Cria um PDF A4 já no timbrado. Toda página nova (inclusive as que o autoTable cria) recebe o timbrado
 * antes do conteúdo. Nas tabelas, use margin: MARGEM_TIMBRADO para não invadir o topo e o rodapé.
 */
export function criarPdfTimbrado(opcoes: jsPDFOptions = {}): jsPDF {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', ...opcoes });
    desenharTimbrado(doc);
    (doc.internal as any).events.subscribe('addPage', () => desenharTimbrado(doc));
    return doc;
}

/** Nova página se o bloco de altura `altura` não couber a partir de `y`; devolve o y para continuar. */
export function garantirEspaco(doc: jsPDF, y: number, altura: number): number {
    const H = doc.internal.pageSize.getHeight();
    if (y + altura <= H - MARGEM_TIMBRADO.bottom) return y;
    doc.addPage();
    return MARGEM_TIMBRADO.top + 5;
}

/** Numeração "Página X de Y" no canto inferior direito, acima do rodapé. Chamar no fim, antes de salvar. */
export function numerarPaginas(doc: jsPDF): void {
    const total = doc.getNumberOfPages();
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(110);
        doc.text(`Página ${i} de ${total}`, W - MARGEM_TIMBRADO.right, H - MARGEM_TIMBRADO.bottom + 4, { align: 'right' });
    }
    doc.setTextColor(0);
}
