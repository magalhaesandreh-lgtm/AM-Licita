import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format as formatDate, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/utils';
import type { CertameComCalculo } from '@/lib/pricing-calculator';
import type { ClienteAssessoria, Fornecedor } from './models';

export const generatePrecificacaoPdf = (certame: CertameComCalculo, fornecedores: Fornecedor[], empresa?: ClienteAssessoria | null) => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const { itens, ...certameInfo } = certame;
    const activeItems = itens.filter(item => item.status !== 'PERDIDO');

    doc.setFontSize(18);
    doc.text(`Relatório de Exequibilidade (Precificação)`, 14, 22);
    doc.setFontSize(11);
    doc.text(`${certameInfo.modalidade} ${certameInfo.numeroAno} - ${certameInfo.orgao}`, 14, 30);
    
    doc.setFontSize(9);
    doc.setTextColor(100);
    if (empresa) {
        doc.text(`Empresa Destino: ${empresa.nomeFantasia} - CNPJ: ${empresa.cnpj}`, 14, 35);
    } else {
        doc.text(`Empresa Destino: Não definida`, 14, 35);
    }
    doc.setTextColor(0);


    let finalY = 40;

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
            formatCurrency(item.custoUnitBase),
            formatCurrency(item.freteUnitario),
            formatCurrency(item.custoFixoRateadoUnit),
            `${formatCurrency(item.metrics.impostoUnit)} (${item.metrics.aliquotaImpostoPercent.toFixed(2)}%)`,
            formatCurrency(item.metrics.precoFinalUnit),
            formatCurrency(item.metrics.lucroUnit),
            `${item.metrics.margemAplicadaPercent.toFixed(2)}%`
        ];
    });

    const totalCustoCompra = activeItems.reduce((acc, item) => acc + (item.custoUnitBase * item.qtd), 0);
    const totalFrete = activeItems.reduce((acc, item) => acc + (item.freteUnitario * item.qtd), 0);
    const totalOverhead = activeItems.reduce((acc, item) => acc + (item.custoFixoRateadoUnit * item.qtd), 0);
    const totalImposto = activeItems.reduce((acc, item) => acc + (item.metrics.impostoUnit * item.qtd), 0);
    const totalVenda = activeItems.reduce((acc, item) => acc + (item.metrics.precoFinalUnit * item.qtd), 0);
    const lucroTotal = activeItems.reduce((acc, item) => acc + item.metrics.lucroTotal, 0);

    const footer = [
        ['TOTAIS', '', '', '', '', '', '', '', formatCurrency(totalCustoCompra), formatCurrency(totalFrete), formatCurrency(totalOverhead), formatCurrency(totalImposto), formatCurrency(totalVenda), formatCurrency(lucroTotal), '']
    ];


    autoTable(doc, {
        startY: finalY,
        head: head,
        body: body,
        foot: footer,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185], fontSize: 8 },
        footStyles: { fillColor: [22, 160, 133], textColor: [255,255,255], fontStyle: 'bold' },
        styles: { fontSize: 7, cellPadding: 2 },
        columnStyles: {
            0: { cellWidth: 10 },
            1: { cellWidth: 40 },
        }
    });

    doc.save(`precificacao_${certameInfo.numeroAno.replace(/[^a-zA-Z0-9]/g, '')}.pdf`);
};

export const generateFinanceiroPdf = (certame: CertameComCalculo, empresa?: ClienteAssessoria | null) => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const { itens, ...certameInfo } = certame;
    const activeItems = itens.filter(item => item.status !== 'PERDIDO');

    doc.setFontSize(18);
    doc.text(`Relatório Financeiro de Precificação`, 14, 22);
    doc.setFontSize(11);
    doc.text(`${certameInfo.modalidade} ${certameInfo.numeroAno} - ${certameInfo.orgao}`, 14, 30);
    if (empresa) {
        doc.text(`Empresa: ${empresa.nomeFantasia}`, 14, 35);
    }
    
    const totalVenda = activeItems.reduce((acc, item) => acc + (item.metrics.precoFinalUnit * item.qtd), 0);
    const totalCusto = activeItems.reduce((acc, item) => acc + (item.metrics.custoTotalUnit * item.qtd), 0);
    const totalImpostos = activeItems.reduce((acc, item) => acc + (item.metrics.impostoUnit * item.qtd), 0);
    const lucroTotal = activeItems.reduce((acc, item) => acc + item.metrics.lucroTotal, 0);
    const receitaLiquidaTotal = totalVenda - totalImpostos;
    const margemMedia = receitaLiquidaTotal > 0 ? (lucroTotal / receitaLiquidaTotal) * 100 : 0;

    autoTable(doc, {
        startY: 40,
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
        columnStyles: {
            1: { cellWidth: 60 },
        }
    });

    doc.save(`financeiro_${certameInfo.numeroAno.replace(/[^a-zA-Z0-9]/g, '')}.pdf`);
};


export const generateExecucaoPdf = (certame: CertameComCalculo) => {
    const doc = new jsPDF();
    const { ...certameInfo } = certame;

    doc.setFontSize(18);
    doc.text(`Relatório de Execução`, 14, 22);
    doc.setFontSize(11);
    doc.text(`${certameInfo.modalidade} ${certameInfo.numeroAno} - ${certameInfo.orgao}`, 14, 30);

    let finalY = 35;
    
    if (certame.empenhos.length === 0) {
        doc.setFontSize(12);
        doc.text("Nenhum empenho lançado para este certame.", 14, finalY);
        doc.save(`execucao_${certameInfo.numeroAno.replace(/[^a-zA-Z0-9]/g, '')}.pdf`);
        return;
    }

    certame.empenhos.forEach((empenho, index) => {
        if (index > 0 && finalY > 20) {
            doc.addPage();
            finalY = 20;
        }

        if (finalY + 80 > doc.internal.pageSize.height) { // Check space before adding content
            doc.addPage();
            finalY = 20;
        }

        doc.setFontSize(14);
        doc.text(`Empenho: ${empenho.numeroEmpenho}`, 14, finalY);
        finalY += 7;
        doc.setFontSize(11);
        doc.text(`Status: ${empenho.statusEntrega} / ${empenho.statusFinanceiro}`, 14, finalY);
        
        finalY += 15;
        
        doc.setFontSize(12);
        doc.text("Notas Fiscais do Empenho", 14, finalY);
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
            autoTable(doc, { startY: finalY, head: nfsHead, body: nfsBody, theme: 'grid' });
            finalY = (doc as any).lastAutoTable.finalY + 10;
        } else {
            doc.setFontSize(10);
            doc.text("Nenhuma NF lançada para este empenho.", 14, finalY);
            finalY += 10;
        }
    });

    doc.save(`execucao_${certameInfo.numeroAno.replace(/[^a-zA-Z0-9]/g, '')}.pdf`);
};
