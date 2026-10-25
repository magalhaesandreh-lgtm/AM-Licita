import autoTable from 'jspdf-autotable';
import type jsPDF from 'jspdf';
import { addDays, format as formatDate, parseISO } from 'date-fns';
import type { CertameComCalculo, FullPricingContext } from '@/lib/pricing-calculator';
import type { ClienteAssessoria, Empenho, Fornecedor } from './models';
import { itemAtivo } from './models';
import { custoUnitEfetivo } from '@/lib/custo-real';
import { calcularExitoHibrido, calcularExitoPorFaixa } from '@/lib/assessoria/fee-calculator';
import { criarPdfTimbrado, MARGEM_TIMBRADO, numerarPaginas } from '@/lib/pdf/timbrado';
import { analisarExequibilidade, brl, explicarCustos, nomeCurto, pct, ROTULO_SITUACAO, type AnaliseItem, type SituacaoItem } from '@/lib/pdf/analise-exequibilidade';
import { assinaturaAm, COR_AZUL, destaque, marcador, paragrafo, quadros, secao, SITUACAO_CORES, tituloRelatorio } from '@/lib/pdf/relatorio-base';

/**
 * Relatórios em PDF do certame, no papel timbrado da AM Contratos e escritos para o cliente entender:
 * cada número vem acompanhado do que significa e cada item, do motivo de ser viável ou não.
 */

export interface OpcoesRelatorio {
    /** Contexto de custos usado no cálculo do certame (custos do cliente ou da AM Contratos). */
    contexto?: FullPricingContext | null;
    /** Nome de quem tem os custos usados (ex.: "Maurizio Ligabo Neto (MEI)"). */
    custosDe?: string;
}

const dataBr = (iso?: string | null) => {
    if (!iso) return '-';
    try { return formatDate(parseISO(iso), 'dd/MM/yyyy'); } catch { return iso; }
};
const num = (v: number, casas = 0) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: Math.max(casas, 2) });
const nomeArquivo = (prefixo: string, certame: { numeroAno: string }) => `${prefixo}_${certame.numeroAno.replace(/[^a-zA-Z0-9]/g, '')}.pdf`;
const empresaLinha = (certame: CertameComCalculo, empresa?: ClienteAssessoria | null) =>
    empresa ? `Empresa: ${empresa.nomeFantasia}${empresa.cnpj ? ` (CNPJ ${empresa.cnpj})` : ''}` : (certame.empresaDestinoNome ? `Empresa: ${certame.empresaDestinoNome}` : 'Empresa: AM Contratos & Soluções B2G');
const sessaoLinha = (certame: CertameComCalculo) =>
    `Órgão: ${certame.orgao}${certame.dataSessaoISO ? `  |  Sessão: ${dataBr(certame.dataSessaoISO)}${certame.horaSessao ? ` às ${certame.horaSessao}` : ''}` : ''}${certame.plataforma ? `  |  Plataforma: ${certame.plataforma}` : ''}`;
const emitido = () => `Emitido em ${formatDate(new Date(), "dd/MM/yyyy 'às' HH:mm")}`;

/** Pinta a célula de situação com a cor correspondente. */
function corSituacao(situacoes: SituacaoItem[], coluna: number) {
    return (data: any) => {
        if (data.section !== 'body' || data.column.index !== coluna) return;
        const s = situacoes[data.row.index];
        const cor = s ? SITUACAO_CORES[s] : null;
        if (cor) { data.cell.styles.fillColor = cor.fundo; data.cell.styles.textColor = cor.texto; data.cell.styles.fontStyle = 'bold'; }
    };
}

const ultimaTabelaY = (doc: jsPDF) => (doc as any).lastAutoTable.finalY as number;

// ════════════════════════════════════════════════════════════════════════
// 1. RELATÓRIO DE EXEQUIBILIDADE (análise de preços item a item)
// ════════════════════════════════════════════════════════════════════════
export const generatePrecificacaoPdf = (certame: CertameComCalculo, fornecedores: Fornecedor[], empresa?: ClienteAssessoria | null, opcoes: OpcoesRelatorio = {}) => {
    void fornecedores;
    const doc = criarPdfTimbrado();
    const analise = analisarExequibilidade(certame, opcoes.contexto);
    const custos = explicarCustos(opcoes.contexto, opcoes.custosDe || empresa?.nomeFantasia || certame.empresaDestinoNome || 'AM Contratos & Soluções B2G');
    const c = analise.contagem;
    const total = analise.itens.length;
    const margens = [...new Set(analise.itens.map(a => Math.round(a.margemAlvoPct * 100) / 100))];
    const margemTexto = margens.length === 1 ? pct(margens[0], 0) : 'definida item a item';
    const aliquotas = [...new Set(analise.itens.map(a => a.aliquotaPct))];

    let y = tituloRelatorio(doc, 'Relatório de Exequibilidade', `${certame.modalidade} ${certame.numeroAno}`, [
        sessaoLinha(certame), empresaLinha(certame, empresa), emitido(),
    ]);

    // ── 1. Conclusão
    y = secao(doc, y, '1. Conclusão');
    y = paragrafo(doc, y, `Este relatório mostra, item por item, se vale a pena disputar cada produto desta licitação. Para cada item comparamos o preço que precisaríamos cobrar (para pagar o produto, as despesas e ainda ter lucro de ${margemTexto}) com o preço de referência do edital, que normalmente é o máximo que o órgão aceita pagar.`);
    y = quadros(doc, y, [
        { rotulo: 'Itens analisados', valor: String(total) },
        { rotulo: 'Viáveis (lucro desejado garantido)', valor: String(c.VIAVEL), cor: SITUACAO_CORES.VIAVEL.texto },
        { rotulo: 'Lucro abaixo do desejado', valor: String(c.MARGEM_REDUZIDA), cor: SITUACAO_CORES.MARGEM_REDUZIDA.texto },
        { rotulo: 'Dão prejuízo', valor: String(c.PREJUIZO), cor: SITUACAO_CORES.PREJUIZO.texto },
        { rotulo: 'Sem custo informado (cotar)', valor: String(c.SEM_CUSTO), cor: SITUACAO_CORES.SEM_CUSTO.texto },
        { rotulo: 'Valor de referência do edital (itens analisados)', valor: certame.orcamentoSigiloso ? 'Sigiloso' : brl(analise.valorReferenciaTotal) },
    ], 3);
    y = quadros(doc, y, [
        { rotulo: 'Proposta com os itens viáveis', valor: brl(analise.valorViaveis) },
        { rotulo: `Lucro previsto nos itens viáveis (${margemTexto})`, valor: brl(analise.lucroViaveis), cor: SITUACAO_CORES.VIAVEL.texto },
        { rotulo: 'Prejuízo se disputar os itens deficitários', valor: analise.prejuizoNaRef > 0 ? `- ${brl(analise.prejuizoNaRef)}` : brl(0), cor: analise.prejuizoNaRef > 0 ? SITUACAO_CORES.PREJUIZO.texto : undefined },
    ], 3);

    const lista = (s: SituacaoItem) => analise.itens.filter(a => a.situacao === s).map(a => a.nome).join(', ');
    const partes: string[] = [];
    if (c.VIAVEL) partes.push(`Recomendamos disputar os ${c.VIAVEL} itens viáveis (${lista('VIAVEL')}): neles o preço calculado cabe no preço de referência e ainda sobra espaço para os lances.`);
    if (c.MARGEM_REDUZIDA) partes.push(`Os ${c.MARGEM_REDUZIDA} itens com lucro abaixo do desejado (${lista('MARGEM_REDUZIDA')}) só dão lucro menor que ${margemTexto}; disputar apenas se o cliente aceitar essa margem menor ou conseguir comprar mais barato.`);
    if (c.PREJUIZO) partes.push(`Não recomendamos disputar os ${c.PREJUIZO} itens com prejuízo (${lista('PREJUIZO')}), salvo se o custo de compra cair até o valor indicado na seção 4.`);
    if (c.SEM_CUSTO) partes.push(`Faltam os custos de ${c.SEM_CUSTO} itens (${lista('SEM_CUSTO')}); cotar antes da sessão.`);
    if (c.SEM_REFERENCIA) partes.push(`${c.SEM_REFERENCIA} itens não têm preço de referência divulgado; o preço calculado serve de piso para os lances.`);
    y = destaque(doc, y, 'Recomendação', partes.join(' ') || 'Não há itens com custo informado para analisar.', { fundo: [232, 238, 250], texto: COR_AZUL });

    // ── 2. Como o preço foi calculado
    y = secao(doc, y, '2. Como o preço de cada item foi calculado');
    y = paragrafo(doc, y, 'O preço de venda não é só o custo do produto. Ele precisa pagar tudo o que a empresa gasta para participar da licitação e entregar, recolher o imposto e ainda deixar o lucro desejado. O cálculo segue quatro passos:');
    y = marcador(doc, y, '**1. Custo do produto:** quanto se paga ao fornecedor por unidade (kg, maço, dúzia...).');
    y = marcador(doc, y, `**2. Frete:** ${custos && custos.fretePct > 0 ? `${pct(custos.fretePct)} sobre o custo do produto.` : 'não aplicado separadamente (o transporte entra nos custos do certame, abaixo).'}`);
    if (custos) {
        const fixosLista = custos.custosFixos.length ? custos.custosFixos.map(f => `${f.descricao} (${brl(f.valor)}/mês)`).join('; ') : 'nenhuma cadastrada';
        const totalFixos = custos.custosFixos.reduce((t, f) => t + f.valor, 0);
        y = marcador(doc, y, `**3. Parte das despesas fixas (também chamada de "overhead"):** são contas que existem todo mês, vendendo ou não: ${fixosLista}. Cada venda precisa ajudar a pagar essas contas, senão elas consomem o lucro. ${custos.overheadManual ? `Foi usado o percentual fixo de ${pct(custos.overheadPct, 2)} sobre o custo do produto.` : custos.faturamentoMensal > 0 ? `Total de ${brl(totalFixos)} por mês dividido pelo faturamento mensal previsto de ${brl(custos.faturamentoMensal)} = ${pct(custos.overheadPct, 2)}, aplicado sobre o custo de cada produto.` : 'Sem faturamento previsto cadastrado, essas despesas não foram incluídas.'}`);
        const varValor = custos.custosVariaveisValor;
        const totalVar = varValor.reduce((t, v) => t + v.valor, 0);
        const varPct = custos.custosVariaveisPct;
        let textoVar = '';
        if (varValor.length) textoVar += `gastos que existem por causa desta licitação: ${varValor.map(v => `${v.descricao} (${brl(v.valor)})`).join('; ')}, total de ${brl(totalVar)}. Esse total é dividido entre os itens na proporção do custo de cada um${analise.custoProdutosTotal > 0 ? `: equivale a ${pct((totalVar / analise.custoProdutosTotal) * 100, 2)} sobre o custo dos produtos` : ''}. `;
        if (varPct.length) textoVar += `Percentuais sobre o custo: ${varPct.map(v => `${v.descricao} (${pct(v.valor, 2)})`).join('; ')}. `;
        y = marcador(doc, y, `**4. Custos do certame:** ${textoVar || 'nenhum custo específico desta licitação cadastrado.'}`);
        y = paragrafo(doc, y, `Os custos considerados são os de ${custos.custosDe}.`, { tamanho: 8.5 });
    } else {
        y = marcador(doc, y, '**3 e 4. Despesas fixas e custos do certame:** parte das contas mensais e dos gastos desta licitação, divididos entre os itens na proporção do custo de cada um.');
    }
    y = paragrafo(doc, y, `**Custo total por unidade:** é a soma dos quatro passos. Nesta licitação, frete e despesas acrescentam ${analise.percentualSobreCusto !== null ? pct(analise.percentualSobreCusto) : '-'} ao custo dos produtos (${brl(analise.freteTotal + analise.rateadosTotal)} no total).`);
    const aliquotaTexto = aliquotas.length === 1
        ? (aliquotas[0] === 0 ? 'Imposto sobre a venda: 0%, porque o imposto da empresa é fixo mensal (DAS do MEI) e já está nas despesas fixas.' : `Imposto sobre a venda: ${pct(aliquotas[0], 2)} do preço.`)
        : 'Imposto sobre a venda: alíquota definida em cada item.';
    y = paragrafo(doc, y, `**Preço de venda:** custo total ÷ (1 - imposto - margem de lucro). ${aliquotaTexto} A margem de lucro é calculada sobre o preço final: com ${margemTexto}, de cada R$ 100,00 recebidos do órgão, R$ ${margens.length === 1 ? num(margens[0], 2) : 'X'} ficam de lucro depois de pagar o produto, as despesas e o imposto. Por isso divide-se, e não multiplica-se: somar 20% ao custo daria um lucro menor que 20% do preço.`);

    // Exemplo resolvido com um item real (de preferência um que não compensa, para mostrar o motivo).
    const exemplo = analise.itens.find(a => a.situacao === 'PREJUIZO' && a.fixos !== null) || analise.itens.find(a => a.situacao === 'MARGEM_REDUZIDA' && a.fixos !== null) || analise.itens.find(a => a.situacao === 'VIAVEL' && a.fixos !== null);
    if (exemplo) {
        y = secao(doc, y, `Exemplo: item ${exemplo.item.itemNumero}, ${exemplo.nome}`);
        const und = (exemplo.item.unidade || 'un').toLowerCase();
        const linhas: (string | number)[][] = [
            ['Custo do produto (pago ao fornecedor)', brl(exemplo.custoProduto)],
            ['(+) Frete', brl(exemplo.frete)],
            ['(+) Parte das despesas fixas (overhead)', brl(exemplo.fixos)],
            ['(+) Parte dos custos do certame', brl(exemplo.variaveis)],
            ['(=) Custo total', brl(exemplo.custoTotal)],
            [`Preço para lucro de ${pct(exemplo.margemAlvoPct, 0)} = ${brl(exemplo.custoTotal)} ÷ (1 - ${pct(exemplo.aliquotaPct, 0)} - ${pct(exemplo.margemAlvoPct, 0)})`, brl(exemplo.preco)],
            ['Preço de referência do edital', exemplo.referencia !== null ? brl(exemplo.referencia) : '-'],
            ['Lucro vendendo pelo preço de referência', exemplo.lucroUnitRef !== null ? `${brl(exemplo.lucroUnitRef)} (${pct(exemplo.lucroPctRef)})` : '-'],
        ];
        autoTable(doc, {
            startY: y, body: linhas, theme: 'grid', margin: MARGEM_TIMBRADO,
            styles: { fontSize: 8.8, cellPadding: 1.8 },
            columnStyles: { 0: { cellWidth: 125 }, 1: { halign: 'right', fontStyle: 'bold' } },
            didParseCell: (d: any) => { if (d.row.index === 4 || d.row.index === 5) d.cell.styles.fillColor = [244, 246, 251]; },
        });
        y = ultimaTabelaY(doc) + 3;
        y = paragrafo(doc, y, `**Resultado (por ${und}):** ${exemplo.motivo}`, { tamanho: 9 });
    }

    // ── 3. Tabela item a item
    y = secao(doc, y, '3. Resultado item a item');
    y = paragrafo(doc, y, '"Preço calculado" é o preço que garante o lucro desejado. Se ele passar do preço de referência, o item não cabe no edital com esse lucro. "Lucro no preço de referência" mostra quanto sobraria vendendo pelo valor máximo do edital.', { tamanho: 8.5 });
    const itensTabela = analise.itens;
    autoTable(doc, {
        startY: y,
        margin: MARGEM_TIMBRADO,
        head: [['Item', 'Produto', 'Und', 'Qtd', 'Preço de referência', 'Custo total unit.', 'Preço calculado', 'Lucro no preço de referência', 'Situação']],
        body: itensTabela.map(a => [
            a.item.itemNumero,
            a.nome,
            a.item.unidade,
            num(a.item.qtd),
            a.referencia !== null ? brl(a.referencia) : '-',
            a.situacao === 'SEM_CUSTO' ? '-' : brl(a.custoTotal),
            a.situacao === 'SEM_CUSTO' ? '-' : brl(a.preco),
            a.lucroUnitRef !== null && a.situacao !== 'SEM_CUSTO' ? `${brl(a.lucroUnitRef)} (${pct(a.lucroPctRef)})` : '-',
            ROTULO_SITUACAO[a.situacao],
        ]),
        theme: 'striped',
        headStyles: { fillColor: COR_AZUL, fontSize: 7.5, valign: 'middle' },
        styles: { fontSize: 7.5, cellPadding: 1.5, valign: 'middle' },
        columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 30 }, 2: { cellWidth: 10 }, 3: { halign: 'right', cellWidth: 11 }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { cellWidth: 26 } },
        didParseCell: corSituacao(itensTabela.map(a => a.situacao), 8),
    });
    y = ultimaTabelaY(doc) + 6;

    // ── 4. Motivo de cada item
    y = secao(doc, y, '4. Por que cada item compensa ou não');
    const ordem: SituacaoItem[] = ['PREJUIZO', 'MARGEM_REDUZIDA', 'SEM_CUSTO', 'SEM_REFERENCIA', 'VIAVEL'];
    const ordenados = [...analise.itens].sort((a, b) => ordem.indexOf(a.situacao) - ordem.indexOf(b.situacao) || a.item.itemNumero - b.item.itemNumero);
    autoTable(doc, {
        startY: y,
        margin: MARGEM_TIMBRADO,
        head: [['Item', 'Situação', 'Explicação']],
        body: ordenados.map(a => [`${a.item.itemNumero}. ${a.nome}`, ROTULO_SITUACAO[a.situacao], a.motivo]),
        theme: 'grid',
        headStyles: { fillColor: COR_AZUL, fontSize: 8 },
        styles: { fontSize: 7.8, cellPadding: 1.8, valign: 'top' },
        columnStyles: { 0: { cellWidth: 30, fontStyle: 'bold' }, 1: { cellWidth: 25 }, 2: { halign: 'justify' } },
        didParseCell: corSituacao(ordenados.map(a => a.situacao), 1),
    });
    y = ultimaTabelaY(doc) + 6;

    // ── 5. Glossário
    y = secao(doc, y, '5. O que significa cada termo');
    const glossario: [string, string][] = [
        ['Preço de referência', 'Valor que o órgão pesquisou no mercado e publicou no edital. Normalmente é o máximo que ele aceita pagar por unidade; proposta acima dele costuma ser desclassificada.'],
        ['Custo do produto', 'Quanto se paga ao fornecedor por unidade.'],
        ['Frete', 'Custo de transporte calculado como percentual do custo do produto.'],
        ['Despesas fixas (overhead)', 'Contas mensais que existem mesmo sem venda (imposto fixo, telefone, contador...). Uma parte delas é colocada no preço de cada item.'],
        ['Custos do certame', 'Gastos que só existem por causa desta licitação (taxa do portal, combustível das entregas...). São divididos entre os itens conforme o custo de cada um.'],
        ['Custo total unitário', 'Produto + frete + despesas fixas + custos do certame, por unidade. É o mínimo para não ter prejuízo (sem contar o imposto).'],
        ['Imposto', 'Tributo sobre a venda. No MEI é o DAS mensal fixo, já incluído nas despesas fixas; por isso aparece 0% sobre a venda.'],
        ['Margem de lucro', 'Percentual do preço final que sobra como lucro depois de pagar tudo.'],
        ['Preço calculado', 'Preço que garante a margem de lucro desejada. É o menor valor recomendado para os lances.'],
        ['Lucro no preço de referência', 'Quanto sobraria vendendo exatamente pelo preço de referência. Se for negativo, o item dá prejuízo.'],
        ['Situação', 'Viável: o preço calculado cabe na referência. Lucro abaixo do desejado: dá lucro, mas menor que a margem pretendida. Prejuízo: nem pelo preço de referência paga os custos. Sem custo: falta cotar o produto.'],
    ];
    autoTable(doc, {
        startY: y, margin: MARGEM_TIMBRADO, body: glossario, theme: 'plain',
        styles: { fontSize: 8.3, cellPadding: 1.6, valign: 'top' },
        columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold', textColor: COR_AZUL }, 1: { halign: 'justify' } },
    });
    y = ultimaTabelaY(doc) + 6;

    // ── 6. Observações
    y = secao(doc, y, '6. Observações importantes');
    if (custos && custos.custosVariaveisValor.length) y = marcador(doc, y, 'Os custos do certame são divididos conforme o custo de cada item. Se alguns itens forem retirados da disputa, esses custos passam a pesar mais sobre os que ficam e os preços mínimos sobem; o cálculo deve ser refeito com a lista final de itens.', 8.8);
    y = marcador(doc, y, 'Os preços de hortifrúti e de outros produtos variam com a safra e o mercado. O relatório usa os custos informados na data de emissão; os itens com pouca folga devem ser recotados antes da sessão.', 8.8);
    y = marcador(doc, y, 'Durante a disputa, não oferecer lances abaixo do preço calculado sem rever a margem: abaixo dele o lucro fica menor que o desejado, e abaixo do custo total há prejuízo.', 8.8);
    if (certame.congelado) y = marcador(doc, y, 'Este certame está congelado: os valores de frete e despesas foram gravados no congelamento e não acompanham alterações posteriores de custos.', 8.8);

    // ── Anexo: memória de cálculo em paisagem
    doc.addPage('a4', 'landscape');
    let ya = tituloRelatorio(doc, 'Anexo: memória de cálculo por item', `${certame.modalidade} ${certame.numeroAno}`, ['Valores por unidade, em reais. Total = valor unitário × quantidade.']);
    autoTable(doc, {
        startY: ya,
        margin: MARGEM_TIMBRADO,
        head: [['Item', 'Produto', 'Qtd', 'Custo produto', 'Frete', 'Despesas fixas', 'Custos do certame', 'Custo total', 'Imposto', 'Preço calculado', 'Lucro unit. no preço calculado', 'Lucro total no preço calculado', 'Margem', 'Preço ref.', 'Situação']],
        body: analise.itens.map(a => [
            a.item.itemNumero, a.nome, num(a.item.qtd), brl(a.custoProduto), brl(a.frete),
            a.fixos !== null ? brl(a.fixos) : '-', a.variaveis !== null ? brl(a.variaveis) : brl(a.rateados),
            brl(a.custoTotal), `${brl(a.preco * a.aliquotaPct / 100)} (${pct(a.aliquotaPct, 0)})`, brl(a.preco), brl(a.lucroUnit), brl(a.lucroTotal),
            pct(a.item.metrics.margemAplicadaPercent), a.referencia !== null ? brl(a.referencia) : '-', ROTULO_SITUACAO[a.situacao],
        ]),
        foot: [[{ content: 'Totais', colSpan: 3 }, brl(analise.custoProdutosTotal), brl(analise.freteTotal), brl(analise.fixosTotal), brl(analise.variaveisTotal), brl(analise.custoProdutosTotal + analise.freteTotal + analise.rateadosTotal), '', '', '', brl(analise.itens.reduce((t, a) => t + a.lucroTotal, 0)), '', '', ''] as any],
        showFoot: 'lastPage',
        theme: 'striped',
        headStyles: { fillColor: COR_AZUL, fontSize: 7, valign: 'middle', halign: 'center' },
        footStyles: { fillColor: [230, 234, 244], textColor: [30, 30, 30], fontStyle: 'bold', fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 1.3, halign: 'right' },
        columnStyles: { 0: { halign: 'center', cellWidth: 9 }, 1: { halign: 'left', cellWidth: 32 }, 14: { halign: 'left', cellWidth: 24 } },
        didParseCell: corSituacao(analise.itens.map(a => a.situacao), 14),
    });
    ya = ultimaTabelaY(doc) + 6;
    ya = paragrafo(doc, ya, 'Os totais de custos são a soma de (valor unitário × quantidade) de todos os itens analisados. Os totais de frete, despesas fixas e custos do certame correspondem ao que foi distribuído entre os itens.', { tamanho: 8 });
    assinaturaAm(doc, ya);

    numerarPaginas(doc);
    doc.save(nomeArquivo('relatorio_exequibilidade', certame));
};

// ════════════════════════════════════════════════════════════════════════
// 2. RELATÓRIO FINANCEIRO (resultado previsto e realizado)
// ════════════════════════════════════════════════════════════════════════
function valoresEmpenho(certame: CertameComCalculo, empenho: Empenho) {
    const empenhado = (empenho.itens || []).reduce((t, i) => t + i.precoVendaUnitSnapshot * i.qtdEmpenhada, 0);
    let faturado = 0, recebido = 0, lucro = 0;
    (empenho.nfs || []).forEach(nf => nf.itens.forEach(itNf => {
        const ei = empenho.itens.find(e => e.id === itNf.empenhoItemId);
        if (!ei) return;
        const pi = certame.itens.find(p => p.id === ei.precificacaoItemId);
        const v = ei.precoVendaUnitSnapshot * itNf.qtdNestaNF;
        faturado += v;
        if (nf.pago) recebido += v;
        lucro += v - v * ((pi?.aliquotaPct ?? 0) / 100) - custoUnitEfetivo(ei) * itNf.qtdNestaNF;
    }));
    return { empenhado, faturado, recebido, aReceber: faturado - recebido, lucro };
}

const STATUS_ENTREGA: Record<string, string> = { NAO_INICIADO: 'Entrega não iniciada', PARCIAL: 'Entregue em parte', CONCLUIDO: 'Entrega concluída', ATRASADO: 'Entrega atrasada' };
const STATUS_FINANCEIRO: Record<string, string> = { PENDENTE: 'Nada faturado', FATURADO: 'Faturado, aguardando pagamento', PARCIAL: 'Pago em parte', PAGO: 'Pago' };
const STATUS_CERTAME: Record<string, string> = { EM_ANDAMENTO: 'em andamento', GANHO: 'ganho', PERDIDO: 'perdido', CANCELADO: 'cancelado' };

export const generateFinanceiroPdf = (certame: CertameComCalculo, empresa?: ClienteAssessoria | null, opcoes: OpcoesRelatorio = {}) => {
    const doc = criarPdfTimbrado();
    const ativos = certame.itens.filter(i => itemAtivo(i));
    const analise = analisarExequibilidade(certame, opcoes.contexto);
    const totalVenda = ativos.reduce((t, i) => t + i.metrics.precoFinalUnit * i.qtd, 0);
    const totalCusto = ativos.reduce((t, i) => t + i.metrics.custoTotalUnit * i.qtd, 0);
    const totalImposto = ativos.reduce((t, i) => t + i.metrics.impostoUnit * i.qtd, 0);
    const lucro = ativos.reduce((t, i) => t + i.metrics.lucroTotal, 0);
    const margem = totalVenda > 0 ? (lucro / totalVenda) * 100 : 0;
    const exec = (certame.empenhos || []).map(e => ({ e, v: valoresEmpenho(certame, e) }));
    const somaExec = exec.reduce((t, x) => ({ empenhado: t.empenhado + x.v.empenhado, faturado: t.faturado + x.v.faturado, recebido: t.recebido + x.v.recebido, aReceber: t.aReceber + x.v.aReceber, lucro: t.lucro + x.v.lucro }), { empenhado: 0, faturado: 0, recebido: 0, aReceber: 0, lucro: 0 });

    let y = tituloRelatorio(doc, 'Relatório Financeiro do Certame', `${certame.modalidade} ${certame.numeroAno}`, [sessaoLinha(certame), `${empresaLinha(certame, empresa)}  |  Certame ${STATUS_CERTAME[certame.status] || certame.status}`, emitido()]);

    y = secao(doc, y, '1. Resultado previsto');
    y = paragrafo(doc, y, `Quanto o contrato rende se todos os itens ativos (${ativos.length}) forem vendidos nas quantidades do edital e pelos preços calculados${ativos.some(i => i.precoFinalVendidoReal) ? ' (ou pelo preço vencedor, quando já informado)' : ''}.`);
    y = quadros(doc, y, [
        { rotulo: 'Faturamento previsto (preço × quantidade)', valor: brl(totalVenda) },
        { rotulo: 'Custo total (produtos, frete e despesas)', valor: brl(totalCusto) },
        { rotulo: 'Imposto sobre a venda', valor: brl(totalImposto) },
        { rotulo: 'Lucro previsto', valor: brl(lucro), cor: lucro >= 0 ? SITUACAO_CORES.VIAVEL.texto : SITUACAO_CORES.PREJUIZO.texto },
        { rotulo: 'Margem de lucro sobre o faturamento', valor: pct(margem) },
        { rotulo: 'Itens que não compensam (ver Relatório de Exequibilidade)', valor: String(analise.contagem.PREJUIZO + analise.contagem.MARGEM_REDUZIDA) },
    ], 3);
    y = paragrafo(doc, y, `**Como ler:** de cada R$ 100,00 faturados, cerca de R$ ${num(totalVenda > 0 ? (totalCusto / totalVenda) * 100 : 0, 2)} pagam produtos e despesas, R$ ${num(totalVenda > 0 ? (totalImposto / totalVenda) * 100 : 0, 2)} vão para o imposto e R$ ${num(margem, 2)} ficam de lucro.`);

    y = secao(doc, y, '2. Execução: o que já foi pedido, entregue e recebido');
    if (!exec.length) {
        y = paragrafo(doc, y, 'Ainda não há nota de empenho lançada para este certame. A nota de empenho é o pedido formal do órgão: só a partir dela os produtos são entregues e faturados.');
    } else {
        y = quadros(doc, y, [
            { rotulo: 'Valor empenhado (pedidos do órgão)', valor: brl(somaExec.empenhado) },
            { rotulo: 'Faturado (notas fiscais emitidas)', valor: brl(somaExec.faturado) },
            { rotulo: 'Recebido', valor: brl(somaExec.recebido), cor: SITUACAO_CORES.VIAVEL.texto },
            { rotulo: 'A receber', valor: brl(somaExec.aReceber), cor: somaExec.aReceber > 0 ? SITUACAO_CORES.MARGEM_REDUZIDA.texto : undefined },
            { rotulo: 'Lucro realizado nas notas emitidas', valor: brl(somaExec.lucro) },
            { rotulo: 'Ainda a faturar dos pedidos', valor: brl(Math.max(0, somaExec.empenhado - somaExec.faturado)) },
        ], 3);
        autoTable(doc, {
            startY: y, margin: MARGEM_TIMBRADO,
            head: [['Empenho', 'Data', 'Empenhado', 'Faturado', 'Recebido', 'A receber', 'Situação']],
            body: exec.map(({ e, v }) => [e.numeroEmpenho, dataBr(e.dataSolicitacaoISO), brl(v.empenhado), brl(v.faturado), brl(v.recebido), brl(v.aReceber), `${STATUS_ENTREGA[e.statusEntrega] || e.statusEntrega}; ${STATUS_FINANCEIRO[e.statusFinanceiro] || e.statusFinanceiro}`]),
            theme: 'striped', headStyles: { fillColor: COR_AZUL, fontSize: 8 }, styles: { fontSize: 8, cellPadding: 1.6 },
            columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
        });
        y = ultimaTabelaY(doc) + 6;
    }

    y = secao(doc, y, '3. Resultado previsto por item');
    autoTable(doc, {
        startY: y, margin: MARGEM_TIMBRADO,
        head: [['Item', 'Produto', 'Qtd', 'Preço unit.', 'Faturamento', 'Custo total', 'Imposto', 'Lucro', 'Margem']],
        body: ativos.map(i => [i.itemNumero, nomeCurto(i.descricao), num(i.qtd), brl(i.metrics.precoFinalUnit), brl(i.metrics.precoFinalUnit * i.qtd), brl(i.metrics.custoTotalUnit * i.qtd), brl(i.metrics.impostoUnit * i.qtd), brl(i.metrics.lucroTotal), pct(i.metrics.margemAplicadaPercent)]),
        foot: [[{ content: 'Totais', colSpan: 4 }, brl(totalVenda), brl(totalCusto), brl(totalImposto), brl(lucro), pct(margem)] as any],
        showFoot: 'lastPage', theme: 'striped',
        headStyles: { fillColor: COR_AZUL, fontSize: 7.8 }, footStyles: { fillColor: [230, 234, 244], textColor: [30, 30, 30], fontStyle: 'bold' },
        styles: { fontSize: 7.8, cellPadding: 1.5, halign: 'right' },
        columnStyles: { 0: { halign: 'center', cellWidth: 9 }, 1: { halign: 'left', cellWidth: 36 } },
        didParseCell: (d: any) => { if (d.section === 'body' && d.column.index === 7 && ativos[d.row.index]?.metrics.lucroTotal < 0) d.cell.styles.textColor = SITUACAO_CORES.PREJUIZO.texto; },
    });
    y = ultimaTabelaY(doc) + 6;

    y = secao(doc, y, '4. O que significa cada número');
    const termos: [string, string][] = [
        ['Faturamento previsto', 'Soma de preço × quantidade de todos os itens. É o valor total que o órgão pagaria se pedisse tudo o que está no edital.'],
        ['Custo total', 'O que se gasta para entregar: produtos, frete, parte das despesas fixas e os custos desta licitação.'],
        ['Imposto', 'Tributo calculado sobre o preço de venda (no MEI, o DAS é fixo e entra no custo).'],
        ['Lucro previsto', 'Faturamento - custo total - imposto.'],
        ['Margem de lucro', 'Lucro ÷ faturamento. Mostra quanto de cada real recebido fica de lucro.'],
        ['Empenhado', 'Valor dos pedidos formais do órgão (notas de empenho). Em ata de registro de preços o órgão só compra o que pedir; o faturamento previsto não é garantido.'],
        ['Faturado e a receber', 'Faturado é o valor das notas fiscais emitidas; a receber é o que ainda não foi pago pelo órgão.'],
        ['Lucro realizado', 'Lucro das notas já emitidas, com o custo real das compras quando informado.'],
    ];
    autoTable(doc, { startY: y, margin: MARGEM_TIMBRADO, body: termos, theme: 'plain', styles: { fontSize: 8.3, cellPadding: 1.6, valign: 'top' }, columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold', textColor: COR_AZUL }, 1: { halign: 'justify' } } });
    assinaturaAm(doc, ultimaTabelaY(doc) + 4);

    numerarPaginas(doc);
    doc.save(nomeArquivo('relatorio_financeiro', certame));
};

// ════════════════════════════════════════════════════════════════════════
// 3. RELATÓRIO DE EXECUÇÃO (pedidos, entregas e notas fiscais)
// ════════════════════════════════════════════════════════════════════════
export const generateExecucaoPdf = (certame: CertameComCalculo) => {
    const doc = criarPdfTimbrado();
    let y = tituloRelatorio(doc, 'Relatório de Execução do Contrato', `${certame.modalidade} ${certame.numeroAno}`, [sessaoLinha(certame), empresaLinha(certame), emitido()]);

    y = secao(doc, y, 'Como ler este relatório');
    y = paragrafo(doc, y, 'Depois de ganhar a licitação, o órgão faz pedidos por meio de notas de empenho. Cada empenho lista os produtos e as quantidades pedidas e tem um prazo de entrega. A cada entrega emite-se uma nota fiscal, que o órgão paga depois de conferir (atestar) o recebimento. Abaixo, para cada empenho: o que foi pedido, o que já foi entregue, o que falta entregar e a situação de cada nota fiscal.');

    const empenhos = certame.empenhos || [];
    if (!empenhos.length) {
        y = destaque(doc, y, 'Sem pedidos', 'Nenhuma nota de empenho foi lançada para este certame até o momento.', { fundo: [235, 235, 235], texto: [80, 80, 80] });
        numerarPaginas(doc);
        doc.save(nomeArquivo('relatorio_execucao', certame));
        return;
    }

    const totais = empenhos.map(e => valoresEmpenho(certame, e)).reduce((t, v) => ({ empenhado: t.empenhado + v.empenhado, faturado: t.faturado + v.faturado, recebido: t.recebido + v.recebido }), { empenhado: 0, faturado: 0, recebido: 0 });
    y = quadros(doc, y, [
        { rotulo: 'Empenhos (pedidos)', valor: String(empenhos.length) },
        { rotulo: 'Valor pedido', valor: brl(totais.empenhado) },
        { rotulo: 'Entregue e faturado', valor: brl(totais.faturado) },
        { rotulo: 'Falta entregar', valor: brl(Math.max(0, totais.empenhado - totais.faturado)) },
        { rotulo: 'Recebido', valor: brl(totais.recebido), cor: SITUACAO_CORES.VIAVEL.texto },
        { rotulo: 'A receber', valor: brl(totais.faturado - totais.recebido), cor: totais.faturado - totais.recebido > 0 ? SITUACAO_CORES.MARGEM_REDUZIDA.texto : undefined },
    ], 3);

    empenhos.forEach(empenho => {
        const v = valoresEmpenho(certame, empenho);
        y = secao(doc, y, `Empenho ${empenho.numeroEmpenho}`);
        const prazoFinal = empenho.dataSolicitacaoISO && empenho.prazoEntregaDias ? formatDate(addDays(parseISO(empenho.dataSolicitacaoISO), empenho.prazoEntregaDias), 'dd/MM/yyyy') : '-';
        y = paragrafo(doc, y, `**Pedido em ${dataBr(empenho.dataSolicitacaoISO)}.** Prazo de entrega de ${empenho.prazoEntregaDias || '-'} dias (até ${prazoFinal}). ${STATUS_ENTREGA[empenho.statusEntrega] || empenho.statusEntrega}; ${(STATUS_FINANCEIRO[empenho.statusFinanceiro] || empenho.statusFinanceiro).toLowerCase()}. Valor pedido ${brl(v.empenhado)}, faturado ${brl(v.faturado)}, recebido ${brl(v.recebido)}.`, { tamanho: 9 });
        autoTable(doc, {
            startY: y, margin: MARGEM_TIMBRADO,
            head: [['Produto', 'Und', 'Pedido', 'Entregue', 'Falta', 'Preço unit.', 'Valor pedido', 'Valor entregue']],
            body: (empenho.itens || []).map(i => [nomeCurto(i.descricaoSnapshot), i.unidadeSnapshot, num(i.qtdEmpenhada), num(i.qtdEntregue), num(i.qtdSaldo), brl(i.precoVendaUnitSnapshot), brl(i.precoVendaUnitSnapshot * i.qtdEmpenhada), brl(i.precoVendaUnitSnapshot * i.qtdEntregue)]),
            theme: 'striped', headStyles: { fillColor: COR_AZUL, fontSize: 7.8 }, styles: { fontSize: 7.8, cellPadding: 1.4, halign: 'right' },
            columnStyles: { 0: { halign: 'left', cellWidth: 48 }, 1: { halign: 'left' } },
            didParseCell: (d: any) => { if (d.section === 'body' && d.column.index === 4 && (empenho.itens[d.row.index]?.qtdSaldo || 0) > 0) d.cell.styles.textColor = SITUACAO_CORES.MARGEM_REDUZIDA.texto; },
        });
        y = ultimaTabelaY(doc) + 4;
        if (empenho.nfs?.length) {
            autoTable(doc, {
                startY: y, margin: MARGEM_TIMBRADO,
                head: [['Nota fiscal', 'Emissão', 'Entrega', 'Valor', 'Pagamento']],
                body: empenho.nfs.map(nf => {
                    const valor = nf.itens.reduce((t, it) => t + it.qtdNestaNF * (empenho.itens.find(e => e.id === it.empenhoItemId)?.precoVendaUnitSnapshot || 0), 0);
                    return [nf.numeroNF, dataBr(nf.dataNFISO), dataBr(nf.dataEntregaISO), brl(valor), nf.pago ? `Paga${nf.dataPagamentoISO ? ` em ${dataBr(nf.dataPagamentoISO)}` : ''}` : 'Aguardando pagamento'];
                }),
                theme: 'grid', headStyles: { fillColor: [90, 110, 150], fontSize: 7.8 }, styles: { fontSize: 7.8, cellPadding: 1.4 },
                columnStyles: { 3: { halign: 'right' } },
                didParseCell: (d: any) => { if (d.section === 'body' && d.column.index === 4) d.cell.styles.textColor = empenho.nfs[d.row.index]?.pago ? SITUACAO_CORES.VIAVEL.texto : SITUACAO_CORES.MARGEM_REDUZIDA.texto; },
            });
            y = ultimaTabelaY(doc) + 6;
        } else {
            y = paragrafo(doc, y, 'Nenhuma nota fiscal emitida para este empenho.', { tamanho: 8.5 });
        }
    });

    y = secao(doc, y, 'O que significa cada termo');
    const termos: [string, string][] = [
        ['Nota de empenho', 'Pedido formal do órgão, que reserva o dinheiro para a compra. Só se entrega o que foi empenhado.'],
        ['Pedido / Entregue / Falta', 'Quantidade pedida no empenho, quantidade já entregue (com nota fiscal) e saldo que ainda falta entregar.'],
        ['Prazo de entrega', 'Dias contados do pedido para entregar; o atraso pode gerar multa prevista no edital.'],
        ['Nota fiscal', 'Documento emitido a cada entrega. O órgão paga depois de atestar o recebimento.'],
    ];
    autoTable(doc, { startY: y, margin: MARGEM_TIMBRADO, body: termos, theme: 'plain', styles: { fontSize: 8.3, cellPadding: 1.6, valign: 'top' }, columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold', textColor: COR_AZUL }, 1: { halign: 'justify' } } });
    assinaturaAm(doc, ultimaTabelaY(doc) + 4);

    numerarPaginas(doc);
    doc.save(nomeArquivo('relatorio_execucao', certame));
};

// ════════════════════════════════════════════════════════════════════════
// 4. RELATÓRIO DO RESULTADO DA LICITAÇÃO (depois do pregão)
// ════════════════════════════════════════════════════════════════════════
type SituacaoGanho = 'VIAVEL' | 'MARGEM_REDUZIDA' | 'PREJUIZO' | 'SEM_CUSTO';
const ROTULO_GANHO: Record<SituacaoGanho, string> = { VIAVEL: 'Lucro no alvo', MARGEM_REDUZIDA: 'Lucro abaixo do alvo', PREJUIZO: 'Prejuízo', SEM_CUSTO: 'Sem custo informado' };

export const generateResultadoPdf = (certame: CertameComCalculo, empresa?: ClienteAssessoria | null, opcoes: OpcoesRelatorio = {}) => {
    const doc = criarPdfTimbrado();
    const custos = explicarCustos(opcoes.contexto, opcoes.custosDe || empresa?.nomeFantasia || certame.empresaDestinoNome || 'AM Contratos & Soluções B2G');
    const todos = certame.itens;
    const ganhos = todos.filter(i => i.status === 'GANHO').sort((a, b) => a.itemNumero - b.itemNumero);
    const perdidos = todos.filter(i => i.status === 'PERDIDO').sort((a, b) => a.itemNumero - b.itemNumero);
    const fora = todos.filter(i => i.status === 'NAO_PARTICIPOU').sort((a, b) => a.itemNumero - b.itemNumero);
    const emDisputa = todos.filter(i => i.status === 'PENDENTE');
    const participou = todos.length - fora.length;

    const linhas = ganhos.map(i => {
        const m = i.metrics;
        const valor = i.precoFinalVendidoReal && i.precoFinalVendidoReal > 0 ? i.precoFinalVendidoReal : m.precoFinalUnit;
        const ref = !certame.orcamentoSigiloso && i.precoReferencia && i.precoReferencia > 0 ? i.precoReferencia : null;
        const categoria = opcoes.contexto?.categorias.find(c => c.id === i.categoriaId);
        const alvo = i.margemManualPct ?? categoria?.margemPadraoPercent ?? 0;
        const aliq = i.aliquotaPct || 0;
        const temCusto = i.custoUnitBase > 0 && !m.estimado;
        const custo = m.custoTotalUnit;
        const lucroUnit = valor * (1 - aliq / 100) - custo;
        const margem = valor > 0 ? (lucroUnit / valor) * 100 : 0;
        const fator = i.custoUnitBase > 0 ? custo / i.custoUnitBase : null;
        const tetoSemPrejuizo = fator ? (valor * (1 - aliq / 100)) / fator : null;
        const tetoAlvo = fator && 1 - aliq / 100 - alvo / 100 > 0 ? (valor * (1 - aliq / 100 - alvo / 100)) / fator : null;
        const situacao: SituacaoGanho = !temCusto ? 'SEM_CUSTO' : lucroUnit < 0 ? 'PREJUIZO' : margem < alvo - 1e-9 ? 'MARGEM_REDUZIDA' : 'VIAVEL';
        return { i, nome: nomeCurto(i.descricao), valor, ref, desconto: ref ? ((ref - valor) / ref) * 100 : null, total: valor * i.qtd, custo, lucroUnit, lucroTotal: lucroUnit * i.qtd, margem, alvo, situacao, tetoSemPrejuizo, tetoAlvo, temCusto };
    });
    const valorAta = linhas.reduce((t, l) => t + l.total, 0);
    const lucroAta = linhas.filter(l => l.temCusto).reduce((t, l) => t + l.lucroTotal, 0);
    const refGanhos = linhas.reduce((t, l) => t + (l.ref ?? 0) * l.i.qtd, 0);
    const margemAta = valorAta > 0 ? (lucroAta / valorAta) * 100 : 0;
    const descontoMedio = refGanhos > 0 ? ((refGanhos - valorAta) / refGanhos) * 100 : null;
    const conta = (s: SituacaoGanho) => linhas.filter(l => l.situacao === s);

    let y = tituloRelatorio(doc, 'Relatório do Resultado da Licitação', `${certame.modalidade} ${certame.numeroAno}`, [sessaoLinha(certame), empresaLinha(certame, empresa), emitido()]);

    // 1. Resultado em números
    y = secao(doc, y, '1. Resultado em números');
    y = quadros(doc, y, [
        { rotulo: 'Itens no edital', valor: String(todos.length) },
        { rotulo: 'Itens disputados', valor: String(participou) },
        { rotulo: 'Itens ganhos', valor: String(ganhos.length), cor: SITUACAO_CORES.VIAVEL.texto },
        { rotulo: 'Itens perdidos', valor: String(perdidos.length), cor: perdidos.length ? SITUACAO_CORES.PREJUIZO.texto : undefined },
        { rotulo: 'Sem participação', valor: String(fora.length) },
        { rotulo: 'Ainda sem resultado lançado', valor: String(emDisputa.length), cor: emDisputa.length ? SITUACAO_CORES.MARGEM_REDUZIDA.texto : undefined },
    ], 3);
    y = quadros(doc, y, [
        { rotulo: 'Valor da ata (itens ganhos × quantidade)', valor: brl(valorAta), cor: COR_AZUL },
        { rotulo: 'Lucro previsto se a ata for executada inteira', valor: brl(lucroAta), cor: lucroAta >= 0 ? SITUACAO_CORES.VIAVEL.texto : SITUACAO_CORES.PREJUIZO.texto },
        { rotulo: 'Margem de lucro sobre a ata', valor: pct(margemAta) },
    ], 3);
    const resumo: string[] = [];
    resumo.push(`Dos ${todos.length} itens do edital, a empresa disputou ${participou} e venceu ${ganhos.length}${perdidos.length ? `, perdendo ${perdidos.length}` : ''}.`);
    resumo.push(`A ata soma ${brl(valorAta)}${descontoMedio !== null ? `, ${pct(Math.abs(descontoMedio))} ${descontoMedio >= 0 ? 'abaixo' : 'acima'} do valor de referência desses itens (${brl(refGanhos)})` : ''}.`);
    resumo.push(`Se o órgão pedir todas as quantidades, o lucro previsto é de ${brl(lucroAta)} (${pct(margemAta)} do valor vendido), depois de pagar produtos, frete, despesas, custos do certame e imposto.`);
    if (conta('PREJUIZO').length) resumo.push(`Atenção: ${conta('PREJUIZO').length} item(ns) ganho(s) dá(ão) prejuízo com os custos atuais (${conta('PREJUIZO').map(l => l.nome).join(', ')}); veja os limites de compra na seção 3.`);
    if (conta('MARGEM_REDUZIDA').length) resumo.push(`${conta('MARGEM_REDUZIDA').length} item(ns) ficou(aram) com lucro abaixo da margem desejada (${conta('MARGEM_REDUZIDA').map(l => l.nome).join(', ')}).`);
    if (conta('SEM_CUSTO').length) resumo.push(`${conta('SEM_CUSTO').length} item(ns) ganho(s) está(ão) sem custo de compra informado (${conta('SEM_CUSTO').map(l => l.nome).join(', ')}): o lucro deles não entra no total até a cotação.`);
    if (emDisputa.length) resumo.push(`${emDisputa.length} item(ns) ainda está(ão) sem resultado lançado no sistema.`);
    y = destaque(doc, y, 'Resumo', resumo.join(' '), { fundo: [232, 238, 250], texto: COR_AZUL });
    y = paragrafo(doc, y, 'Em ata de registro de preços o órgão compra conforme a necessidade: o valor da ata é o máximo que pode ser pedido no período, não uma venda garantida. O resultado real depende dos empenhos emitidos.', { tamanho: 8.5 });

    // 2. Itens ganhos
    y = secao(doc, y, '2. Itens ganhos');
    if (!linhas.length) {
        y = paragrafo(doc, y, 'Nenhum item marcado como ganho no sistema. Use "Resultado da disputa" na planilha do certame para lançar os itens ganhos e os valores.');
    } else {
        autoTable(doc, {
            startY: y, margin: MARGEM_TIMBRADO,
            head: [['Item', 'Produto', 'Qtd', 'Preço ref.', 'Valor ganho', 'Abaixo da ref.', 'Total do item', 'Custo total unit.', 'Lucro total', 'Margem', 'Situação']],
            body: linhas.map(l => [l.i.itemNumero, l.nome, num(l.i.qtd), l.ref !== null ? brl(l.ref) : '-', brl(l.valor), l.desconto !== null ? pct(l.desconto) : '-', brl(l.total), l.temCusto ? brl(l.custo) : '-', l.temCusto ? brl(l.lucroTotal) : '-', l.temCusto ? pct(l.margem) : '-', ROTULO_GANHO[l.situacao]]),
            foot: [[{ content: 'Totais', colSpan: 6 }, brl(valorAta), '', brl(lucroAta), pct(margemAta), ''] as any],
            showFoot: 'lastPage', theme: 'striped',
            headStyles: { fillColor: COR_AZUL, fontSize: 7.2, valign: 'middle' }, footStyles: { fillColor: [230, 234, 244], textColor: [30, 30, 30], fontStyle: 'bold', fontSize: 7.4 },
            styles: { fontSize: 7.2, cellPadding: 1.4, halign: 'right', valign: 'middle' },
            columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 1: { halign: 'left', cellWidth: 28 }, 10: { halign: 'left', cellWidth: 22 } },
            didParseCell: corSituacao(linhas.map(l => l.situacao), 10),
        });
        y = ultimaTabelaY(doc) + 6;

        // 3. Limites de compra
        y = secao(doc, y, '3. Quanto pode custar cada produto (limite de compra)');
        y = paragrafo(doc, y, 'Os preços da ata ficam fixos, mas o custo de compra muda com o mercado. A tabela mostra, para cada item ganho, até quanto o produto pode ser comprado do fornecedor: acima do "limite sem prejuízo" o item passa a dar prejuízo; até o "limite para a margem desejada" o lucro fica no alvo. Use antes de cada compra.', { tamanho: 8.8 });
        autoTable(doc, {
            startY: y, margin: MARGEM_TIMBRADO,
            head: [['Item', 'Produto', 'Und', 'Custo de compra atual', 'Limite para a margem desejada', 'Limite sem prejuízo', 'Margem desejada']],
            body: linhas.map(l => [l.i.itemNumero, l.nome, l.i.unidade, l.temCusto ? brl(l.i.custoUnitBase) : 'não informado', l.tetoAlvo !== null ? brl(l.tetoAlvo) : '-', l.tetoSemPrejuizo !== null ? brl(l.tetoSemPrejuizo) : '-', pct(l.alvo, 0)]),
            theme: 'grid', headStyles: { fillColor: COR_AZUL, fontSize: 7.6 }, styles: { fontSize: 7.6, cellPadding: 1.4, halign: 'right' },
            columnStyles: { 0: { halign: 'center', cellWidth: 9 }, 1: { halign: 'left', cellWidth: 34 }, 2: { halign: 'left', cellWidth: 12 } },
            didParseCell: (d: any) => { if (d.section === 'body' && d.column.index === 3) { const l = linhas[d.row.index]; if (l?.tetoSemPrejuizo !== null && l?.temCusto && l.i.custoUnitBase > (l.tetoSemPrejuizo ?? Infinity)) d.cell.styles.textColor = SITUACAO_CORES.PREJUIZO.texto; } },
        });
        y = ultimaTabelaY(doc) + 6;

        const atencao = linhas.filter(l => l.situacao !== 'VIAVEL');
        if (atencao.length) {
            y = secao(doc, y, 'Itens que pedem atenção');
            atencao.forEach(l => {
                const und = (l.i.unidade || 'un').toLowerCase();
                let t = '';
                if (l.situacao === 'SEM_CUSTO') t = `ganho por ${brl(l.valor)} por ${und}, mas sem custo de compra informado. Cotar para saber o lucro${l.tetoSemPrejuizo !== null ? `` : ''}.`;
                else if (l.situacao === 'PREJUIZO') t = `ganho por ${brl(l.valor)} por ${und}, mas o custo total é ${brl(l.custo)}: prejuízo de ${brl(Math.abs(l.lucroUnit))} por ${und} (${brl(Math.abs(l.lucroTotal))} no total). Só compensa comprando o produto por até ${brl(l.tetoSemPrejuizo)} (hoje ${brl(l.i.custoUnitBase)}).`;
                else t = `ganho por ${brl(l.valor)} por ${und}, com lucro de ${pct(l.margem)}, abaixo da margem desejada de ${pct(l.alvo, 0)}. Para chegar ao alvo, comprar por até ${brl(l.tetoAlvo)} (hoje ${brl(l.i.custoUnitBase)}).`;
                y = marcador(doc, y, `**Item ${l.i.itemNumero}, ${l.nome}:** ${t}`, 8.8);
            });
        }
    }

    // 4. Perdidos e não disputados
    if (perdidos.length || fora.length) {
        y = secao(doc, y, '4. Itens perdidos e não disputados');
        if (perdidos.length) y = paragrafo(doc, y, `**Perdidos (${perdidos.length}):** ${perdidos.map(i => `${i.itemNumero}. ${nomeCurto(i.descricao)}`).join('; ')}.`, { tamanho: 8.8 });
        if (fora.length) y = paragrafo(doc, y, `**Sem participação (${fora.length}):** ${fora.map(i => `${i.itemNumero}. ${nomeCurto(i.descricao)}`).join('; ')}.`, { tamanho: 8.8 });
        y = paragrafo(doc, y, 'Esses itens ficam fora do valor da ata e não recebem custos do certame (portal, combustível etc.), que passam a ser pagos pelos itens ganhos.', { tamanho: 8.5 });
    }

    // 5. Como o lucro foi calculado
    y = secao(doc, y, `${perdidos.length || fora.length ? '5' : '4'}. Como o lucro foi calculado`);
    y = paragrafo(doc, y, '**Lucro por unidade:** valor ganho - imposto - custo total. O custo total soma o custo de compra do produto, o frete, uma parte das despesas fixas mensais (overhead) e uma parte dos custos desta licitação, divididos entre os itens ganhos na proporção do custo de cada um.', { tamanho: 8.8 });
    y = paragrafo(doc, y, '**Margem:** lucro ÷ valor ganho. Mostra quanto de cada real recebido do órgão fica de lucro.', { tamanho: 8.8 });
    if (custos) {
        const fixos = custos.custosFixos.map(f => `${f.descricao} (${brl(f.valor)}/mês)`).join('; ') || 'nenhuma';
        const vars = [...custos.custosVariaveisValor.map(v => `${v.descricao} (${brl(v.valor)})`), ...custos.custosVariaveisPct.map(v => `${v.descricao} (${pct(v.valor, 2)})`)].join('; ') || 'nenhum';
        y = paragrafo(doc, y, `**Custos considerados (${custos.custosDe}):** despesas fixas: ${fixos}, equivalentes a ${pct(custos.overheadPct, 2)} sobre o custo de cada produto; custos da licitação: ${vars}; frete: ${custos.fretePct > 0 ? pct(custos.fretePct) : 'não aplicado separadamente'}.`, { tamanho: 8.8 });
    }

    // 6. Honorários da assessoria (quando o cliente tem êxito)
    const tipo = empresa?.vinculo?.tipoVinculo;
    let n = perdidos.length || fora.length ? 6 : 5;
    if (empresa && (tipo === 'EXITO' || tipo === 'HIBRIDO') && valorAta > 0) {
        const ex = tipo === 'EXITO' ? calcularExitoPorFaixa(valorAta) : calcularExitoHibrido(valorAta);
        y = secao(doc, y, `${n}. Honorários de êxito da assessoria (estimativa)`);
        y = paragrafo(doc, y, `Pelo contrato de assessoria (${tipo === 'EXITO' ? 'êxito' : 'híbrido'}), os honorários de êxito são cobrados sobre o valor de cada empenho, em escala progressiva. Se todo o valor da ata for empenhado, a estimativa é de ${brl(ex.valorExito)} (${pct(ex.percentual * 100, 2)} efetivo), e o lucro previsto do cliente, já descontados os honorários, fica em ${brl(lucroAta - ex.valorExito)}. O valor efetivo depende dos empenhos emitidos.`, { tamanho: 8.8 });
        n++;
    }

    // 7. Próximos passos
    y = secao(doc, y, `${n}. Próximos passos`);
    [
        'Assinar a ata de registro de preços (ou o contrato) no prazo do edital e conferir se os valores e as quantidades conferem com este relatório.',
        'Manter as certidões de regularidade válidas durante toda a vigência: o órgão confere antes de cada pagamento.',
        'A cada empenho recebido, cotar os produtos e comprar dentro dos limites da seção 3; registrar a compra no sistema para acompanhar o lucro real.',
        'Entregar no prazo do empenho e emitir a nota fiscal de cada entrega; acompanhar o atesto e o pagamento.',
    ].forEach(t => { y = marcador(doc, y, t, 8.8); });

    assinaturaAm(doc, y);
    numerarPaginas(doc);
    doc.save(nomeArquivo('relatorio_resultado', certame));
};
