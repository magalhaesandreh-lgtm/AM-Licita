import { criarPdfTimbrado, garantirEspaco, MARGEM_TIMBRADO, numerarPaginas } from '@/lib/pdf/timbrado';
import autoTable from 'jspdf-autotable';
import { format as formatDate, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/utils';
import type { CertameComCalculo } from '@/lib/pricing-calculator';
import type { ClienteAssessoria, Fornecedor } from './models';

const X0 = MARGEM_TIMBRADO.left;
const Y0 = MARGEM_TIMBRADO.top + 6;
const emitidoEm = () => `Emitido em ${formatDate(new Date(), 'dd/MM/yyyy HH:mm')}`;

export const generatePrecificacaoPdf = (certame: CertameComCalculo, fornecedores: Fornecedor[], empresa?: ClienteAssessoria | null) => {
    const doc = criarPdfTimbrado({ orientation: 'landscape' });
    const { itens, ...certameInfo } = certame;
    const activeItems = itens.filter(item => item.status !== 'PERDIDO');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`Relatório de Exequibilidade (Precificação)`, X0, Y0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`${certameInfo.modalidade} ${certameInfo.numeroAno} - ${certameInfo.orgao}`, X0, Y0 + 6);
    
    doc.setFontSize(9);
    doc.setTextColor(100);
    if (empresa) {
        doc.text(`Empresa Destino: ${empresa.nomeFantasia}${empresa.cnpj ? ` - CNPJ: ${empresa.cnpj}` : ''}  |  ${emitidoEm()}`, X0, Y0 + 11);
    } else {
        doc.text(`Empresa Destino: AM Contratos & Soluções B2G  |  ${emitidoEm()}`, X0, Y0 + 11);
    }
    doc.setTextColor(0);


    let finalY = Y0 + 15;

    const head = [['Item', 'Descrição', 'UN', 'Qtd', 'Preço Ref.', 'Fornecedor', 'Marca', 'Modelo', 'Custo', 'Frete', 'Overhead', 'Imposto', 'Preço Final', 'Lucro (R$)', 'Margem (%)']];
    const body = activeItems.map(item => {
        const fornecedorNome = fornecedores.find(f => f.id === item.fornecedorId)?.nomeFantasia || '-';
        return [
            item.itemNumero,
            item.descricao,
            item.unidade,
            item.qtd,
            formatCurrency(item.precoReferencia ?? 0),
            fornecedorNome,
            item.marca || '-',
            item.modelo || '-',
            formatCurrency(item.metrics.custoBaseEstimadoUnit ?? item.custoUnitBase),
            formatCurrency(item.freteUnitario),
            formatCurrency(item.custoFixoRateadoUnit),
            `${formatCurrency(item.metrics.impostoUnit)} (${item.metrics.aliquotaImpostoPercent.toFixed(2)}%)`,
            formatCurrency(item.metrics.precoFinalUnit),
            formatCurrency(item.metrics.lucroUnit),
            `${item.metrics.margemAplicadaPercent.toFixed(2)}%`
        ];
    });

    const totalCustoCompra = activeItems.reduce((acc, item) => acc + ((item.metrics.custoBaseEstimadoUnit ?? item.custoUnitBase) * item.qtd), 0);
    const totalFrete = activeItems.reduce((acc, item) => acc + (item.freteUnitario * item.qtd), 0);
    const totalOverhead = activeItems.reduce((acc, item) => acc + (item.custoFixoRateadoUnit * item.qtd), 0);
    const totalImposto = activeItems.reduce((acc, item) => acc + (item.metrics.impostoUnit * item.qtd), 0);
    const totalVenda = activeItems.reduce((acc, item) => acc + (item.metrics.precoFinalUnit * item.qtd), 0);
    const lucroTotal = activeItems.reduce((acc, item) => acc + item.metrics.lucroTotal, 0);

    const footer = [
        [{ content: 'TOTAIS', colSpan: 8 }, formatCurrency(totalCustoCompra), formatCurrency(totalFrete), formatCurrency(totalOverhead), formatCurrency(totalImposto), formatCurrency(totalVenda), formatCurrency(lucroTotal), '']
    ] as any;


    autoTable(doc, {
        startY: finalY,
        head: head,
        body: body,
        foot: footer,
        showFoot: 'lastPage',
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185], fontSize: 8 },
        footStyles: { fillColor: [22, 160, 133], textColor: [255,255,255], fontStyle: 'bold' },
        styles: { fontSize: 7, cellPadding: 1.6 },
        margin: MARGEM_TIMBRADO,
        columnStyles: {
            0: { cellWidth: 10 },
            1: { cellWidth: 55 },
        }
    });

    numerarPaginas(doc);
    doc.save(`precificacao_${certameInfo.numeroAno.replace(/[^a-zA-Z0-9]/g, '')}.pdf`);
};

export const generateFinanceiroPdf = (certame: CertameComCalculo, empresa?: ClienteAssessoria | null) => {
    const doc = criarPdfTimbrado({ orientation: 'landscape' });
    const { itens, ...certameInfo } = certame;
    const activeItems = itens.filter(item => item.status !== 'PERDIDO');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`Relatório Financeiro de Precificação`, X0, Y0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`${certameInfo.modalidade} ${certameInfo.numeroAno} - ${certameInfo.orgao}`, X0, Y0 + 6);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`${empresa ? `Empresa: ${empresa.nomeFantasia}  |  ` : ''}${emitidoEm()}`, X0, Y0 + 11);
    doc.setTextColor(0);
    
    const totalVenda = activeItems.reduce((acc, item) => acc + (item.metrics.precoFinalUnit * item.qtd), 0);
    const totalCusto = activeItems.reduce((acc, item) => acc + (item.metrics.custoTotalUnit * item.qtd), 0);
    const totalImpostos = activeItems.reduce((acc, item) => acc + (item.metrics.impostoUnit * item.qtd), 0);
    const lucroTotal = activeItems.reduce((acc, item) => acc + item.metrics.lucroTotal, 0);
    const receitaLiquidaTotal = totalVenda - totalImpostos;
    const margemMedia = receitaLiquidaTotal > 0 ? (lucroTotal / receitaLiquidaTotal) * 100 : 0;

    autoTable(doc, {
        startY: Y0 + 15,
        margin: MARGEM_TIMBRADO,
        body: [
            ['Valor Total do Contrato (Faturamento)', formatCurrency(totalVenda)],
            ['Custo Total (Base+Frete+Overhead)', formatCurrency(totalCusto)],
            ['Imposto Total', formatCurrency(totalImpostos)],
            ['Lucro Líquido Previsto', formatCurrency(lucroTotal)],
            ['Margem Líquida Média', `${margemMedia.toFixed(2)}%`],
        ],
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 2 },
    });
    
    let finalY = (doc as any).lastAutoTable.finalY + 10;

    const head = [['Item', 'Descrição', 'Qtd', 'Preço Unit.', 'Preço Total', 'Custo Unit.', 'Custo Total', 'Lucro Total', 'Margem Liq. (%)']];
    const body = activeItems.map(item => {
        return [
            item.itemNumero,
            item.descricao,
            item.qtd,
            formatCurrency(item.metrics.precoFinalUnit),
            formatCurrency(item.metrics.precoFinalUnit * item.qtd),
            formatCurrency(item.metrics.custoTotalUnit),
            formatCurrency(item.metrics.custoTotalUnit * item.qtd),
            formatCurrency(item.metrics.lucroTotal),
            `${item.metrics.margemAplicadaPercent.toFixed(2)}%`
        ];
    });

    autoTable(doc, {
        startY: finalY,
        head: head,
        body: body,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185], fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
        margin: MARGEM_TIMBRADO,
        columnStyles: {
            1: { cellWidth: 60 },
        }
    });

    numerarPaginas(doc);
    doc.save(`financeiro_${certameInfo.numeroAno.replace(/[^a-zA-Z0-9]/g, '')}.pdf`);
};


export const generateExecucaoPdf = (certame: CertameComCalculo) => {
    const doc = criarPdfTimbrado();
    const { ...certameInfo } = certame;
    const larguraUtil = doc.internal.pageSize.getWidth() - MARGEM_TIMBRADO.left - MARGEM_TIMBRADO.right;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`Relatório de Execução`, X0, Y0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`${certameInfo.modalidade} ${certameInfo.numeroAno} - ${certameInfo.orgao}`, X0, Y0 + 6, { maxWidth: larguraUtil });
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`${certameInfo.empresaDestinoNome ? `Empresa: ${certameInfo.empresaDestinoNome}  |  ` : ''}${emitidoEm()}`, X0, Y0 + 12);
    doc.setTextColor(0);

    let finalY = Y0 + 20;
    
    if (certame.empenhos.length === 0) {
        doc.setFontSize(12);
        doc.text("Nenhum empenho lançado para este certame.", X0, finalY);
        numerarPaginas(doc);
        doc.save(`execucao_${certameInfo.numeroAno.replace(/[^a-zA-Z0-9]/g, '')}.pdf`);
        return;
    }

    certame.empenhos.forEach((empenho, index) => {
        // Cada empenho começa em página nova; o timbrado entra automaticamente.
        if (index > 0) {
            doc.addPage();
            finalY = Y0;
        }
        finalY = garantirEspaco(doc, finalY, 40);

        doc.setFontSize(14);
        doc.text(`Empenho: ${empenho.numeroEmpenho}`, X0, finalY);
        finalY += 7;
        doc.setFontSize(11);
        doc.text(`Status: ${empenho.statusEntrega} / ${empenho.statusFinanceiro}`, X0, finalY);
        
        finalY += 15;
        
        doc.setFontSize(12);
        doc.text("Notas Fiscais do Empenho", X0, finalY);
        finalY += 5;

        if (empenho.nfs.length > 0) {
            const nfsHead = [['Nº NF', 'Data', 'Valor Total', 'Lucro', 'Status']];
            const nfsBody = empenho.nfs.map(nf => {
                const valorTotal = nf.itens.reduce((sum, item) => sum + (item.qtdNestaNF * (empenho.itens.find(ei => ei.id === item.empenhoItemId)?.precoVendaUnitSnapshot || 0)), 0);
                const lucroTotal = nf.itens.reduce((sum, item) => sum + (item.qtdNestaNF * (empenho.itens.find(ei => ei.id === item.empenhoItemId)?.lucroUnitSnapshot || 0)), 0);
                return [
                    nf.numeroNF,
                    formatDate(parseISO(nf.dataNFISO), 'dd/MM/yyyy'),
                    formatCurrency(valorTotal),
                    formatCurrency(lucroTotal),
                    nf.pago ? 'Pago' : 'Pendente'
                ];
            });
            autoTable(doc, { startY: finalY, head: nfsHead, body: nfsBody, theme: 'grid', margin: MARGEM_TIMBRADO });
            finalY = (doc as any).lastAutoTable.finalY + 10;
        } else {
            doc.setFontSize(10);
            doc.text("Nenhuma NF lançada para este empenho.", X0, finalY);
            finalY += 10;
        }
    });

    numerarPaginas(doc);
    doc.save(`execucao_${certameInfo.numeroAno.replace(/[^a-zA-Z0-9]/g, '')}.pdf`);
};
