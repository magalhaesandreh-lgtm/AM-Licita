'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getMonth, getYear, setMonth, setYear } from 'date-fns';

import type { CertameUnificado, ClienteAssessoria, Fornecedor, Empenho, NotaFiscal } from '@/lib/models';
import { certameUnificadoRepository } from '@/lib/repositories/certame-unificado-repository';
import { custosClienteRepository } from '@/lib/repositories/custos-cliente-repository';
import { custosDeCertame, analisarExequibilidade, ROTULO_SITUACAO } from '@/lib/pdf/analise-exequibilidade';
import type { CustosClienteAssessoria } from '@/lib/models';
import { calculateCertamePricing, contextoParaCertame, type CertameComCalculo, type FullPricingContext } from '@/lib/pricing-calculator';
import { generatePrecificacaoPdf, generateExecucaoPdf, generateFinanceiroPdf } from '@/lib/pdf-generator';
import { exportToCsv, numeroBr, dataBr as dataBrCsv } from '@/lib/csv-exporter';
import { formatCurrency } from '@/lib/utils';
import { impostoRepository } from '@/lib/repositories/imposto-repository';
import { categoriaRepository } from '@/lib/repositories/categoria-repository';
import { configuracaoRepository } from '@/lib/repositories/configuracao-repository';
import { custoFixoRepository } from '@/lib/repositories/custo-fixo-repository';
import { custoVariavelRepository } from '@/lib/repositories/custo-variavel-repository';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { fornecedorRepository } from '@/lib/repositories/fornecedor-repository';
import { clienteAssessoriaRepository } from '@/lib/repositories/cliente-assessoria-repository';
import { useUser } from '@/firebase';
import { custoUnitEfetivo } from '@/lib/custo-real';

function KpiCard({label, value, className}: {label: string, value: string, className?: string}) {
    return (
        <div className="p-3 bg-muted rounded-lg">
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className={`text-lg font-bold ${className}`}>{value}</p>
        </div>
    )
}

export default function RelatoriosPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(true);
  const [allCertames, setAllCertames] = React.useState<CertameUnificado[]>([]);
  const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
  const [clientes, setClientes] = React.useState<ClienteAssessoria[]>([]);
  const [custosClientes, setCustosClientes] = React.useState<CustosClienteAssessoria[]>([]);
  const [pricingContext, setPricingContext] = React.useState<FullPricingContext | null>(null);
  const [selectedCertameId, setSelectedCertameId] = React.useState<string | null>(null);
  const { user, isUserLoading } = useUser();

  // For monthly CSV export
  const [viewDate, setViewDate] = React.useState(new Date());
  const [useDeliveryDate, setUseDeliveryDate] = React.useState(false);
  const years = React.useMemo(() => Array.from({ length: 5 }, (_, i) => getYear(new Date()) - i), []);
  const months = React.useMemo(() => Array.from({ length: 12 }, (_, i) => ({ label: new Date(0, i).toLocaleString('pt-BR', { month: 'long' }), value: String(i) })), []);


  React.useEffect(() => {
    if (isUserLoading || !user) return;

    async function loadData() {
        setIsLoading(true);
        try {
             const [certamesData, impostosData, categoriasData, configData, fixosData, variaveisData, fornecedoresData, clientesData, custosClientesData] = await Promise.all([
                certameUnificadoRepository.list(),
                impostoRepository.getSettings(),
                categoriaRepository.list(),
                configuracaoRepository.get(),
                custoFixoRepository.list(),
                custoVariavelRepository.list(),
                fornecedorRepository.list(),
                clienteAssessoriaRepository.list(),
                custosClienteRepository.list(),
            ]);
            setCustosClientes(custosClientesData);

            setAllCertames(certamesData);
            setFornecedores(fornecedoresData);
            setClientes(clientesData);
            
            const context: FullPricingContext = {
                imposto: impostosData,
                categorias: categoriasData,
                configuracoes: configData,
                custosFixos: fixosData,
                custosVariaveis: variaveisData,
            };
            setPricingContext(context);
            if (certamesData.length > 0) {
                setSelectedCertameId(certamesData[0].id);
            }
        } catch (error) {
            console.error("Failed to load reports data:", error);
            toast({ title: 'Erro ao carregar dados', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }
    loadData();
  }, [toast, user, isUserLoading]);
  
  const selectedCertame = React.useMemo(() => {
    if (!selectedCertameId || !pricingContext) return null;
    const certame = allCertames.find(c => c.id === selectedCertameId) || null;
    return calculateCertamePricing(certame, contextoParaCertame(certame, pricingContext, custosClientes));
  }, [selectedCertameId, allCertames, pricingContext, custosClientes]);

  const summaryKpis = React.useMemo(() => {
    if (!selectedCertame) return null;

    const totalPrevisto = selectedCertame.itens.reduce((acc, item) => acc + (item.metrics.precoFinalUnit * item.qtd), 0);
    const lucroPrevisto = selectedCertame.itens.reduce((acc, item) => acc + item.metrics.lucroTotal, 0);

    let totalFaturado = 0;
    let lucroReal = 0;
    let totalPago = 0;

    selectedCertame.empenhos.forEach(empenho => {
        empenho.nfs.forEach(nf => {
            const { valorTotalNF, lucroTotalNF } = nf.itens.reduce((totals, itemNF) => {
                const empenhoItem = empenho.itens.find(ei => ei.id === itemNF.empenhoItemId);
                const precificacaoItem = selectedCertame.itens.find(pi => pi.id === empenhoItem?.precificacaoItemId);

                if (empenhoItem && precificacaoItem) {
                    const aliquotaPct = precificacaoItem.aliquotaPct;
                    const itemVenda = empenhoItem.precoVendaUnitSnapshot * itemNF.qtdNestaNF;
                    const itemCusto = custoUnitEfetivo(empenhoItem) * itemNF.qtdNestaNF;
                    const itemImposto = itemVenda * (aliquotaPct / 100);
                    const itemLucro = itemVenda - itemImposto - itemCusto;
                    
                    totals.valorTotalNF += itemVenda;
                    totals.lucroTotalNF += itemLucro;
                }
                return totals;
            }, { valorTotalNF: 0, lucroTotalNF: 0 });
            
            totalFaturado += valorTotalNF;
            lucroReal += lucroTotalNF;
            if (nf.pago) {
                totalPago += valorTotalNF;
            }
        });
    });

    return { totalPrevisto, lucroPrevisto, totalFaturado, lucroReal, saldoReceber: totalFaturado - totalPago };
  }, [selectedCertame]);

  /** Custos usados no cálculo do certame selecionado, para os relatórios explicarem cada número. */
  const opcoesRelatorio = () => {
    if (!selectedCertame || !pricingContext) return {};
    return {
      contexto: contextoParaCertame(selectedCertame, pricingContext, custosClientes),
      custosDe: custosDeCertame(selectedCertame, custosClientes.map(c => c.clienteId)),
    };
  };

  const handlePrecificacaoPdf = () => {
    if (!selectedCertame) return;
    const empresa = clientes.find(e => e.id === selectedCertame.empresaDestinoId);
    generatePrecificacaoPdf(selectedCertame, fornecedores, empresa, opcoesRelatorio());
    toast({ title: 'PDF de Precificação gerado!' });
  }

  const handleFinanceiroPdf = () => {
    if (!selectedCertame) return;
    const empresa = clientes.find(e => e.id === selectedCertame.empresaDestinoId);
    generateFinanceiroPdf(selectedCertame, empresa, opcoesRelatorio());
    toast({ title: 'PDF Financeiro gerado!' });
  }

  const handleExecucaoPdf = () => {
    if (!selectedCertame) return;
    generateExecucaoPdf(selectedCertame);
    toast({ title: 'PDF de Execução gerado!' });
  }

  const handleExportPrecificacaoCsv = () => {
    if (!selectedCertame) return;
    const { contexto } = opcoesRelatorio() as { contexto?: FullPricingContext };
    const analise = analisarExequibilidade(selectedCertame, contexto);
    const dataToExport = analise.itens.map(a => ({
        'Item': a.item.itemNumero,
        'Produto': a.item.descricao,
        'Unidade': a.item.unidade,
        'Quantidade': numeroBr(a.item.qtd, 0),
        'Preço de referência do edital (R$)': numeroBr(a.referencia),
        'Custo do produto (R$)': numeroBr(a.custoProduto, 4),
        'Custo estimado pelo preço vencedor?': a.item.metrics.estimado ? 'Sim' : 'Não',
        'Frete (R$/un.)': numeroBr(a.frete, 4),
        'Despesas fixas - overhead (R$/un.)': a.fixos !== null ? numeroBr(a.fixos, 4) : '',
        'Custos do certame (R$/un.)': a.variaveis !== null ? numeroBr(a.variaveis, 4) : numeroBr(a.rateados, 4),
        'Custo total (R$/un.)': numeroBr(a.custoTotal, 4),
        'Imposto (%)': numeroBr(a.aliquotaPct),
        'Margem de lucro desejada (%)': numeroBr(a.margemAlvoPct),
        'Preço calculado (R$/un.)': numeroBr(a.preco, 4),
        'Lucro por unidade (R$)': numeroBr(a.lucroUnit, 4),
        'Lucro total (R$)': numeroBr(a.lucroTotal),
        'Lucro vendendo pelo preço de referência (R$/un.)': numeroBr(a.lucroUnitRef, 4),
        'Lucro no preço de referência (%)': numeroBr(a.lucroPctRef),
        'Custo máximo do produto para a margem desejada (R$)': numeroBr(a.custoMaximoProduto, 4),
        'Situação': ROTULO_SITUACAO[a.situacao],
        'Explicação': a.motivo,
    }));
    exportToCsv(dataToExport, `itens_e_viabilidade_${selectedCertame.numeroAno.replace(/[^a-zA-Z0-9]/g, '')}.csv`);
    toast({ title: 'Planilha dos itens exportada!' });
  }

  /** Linhas de NF por item, com valor, imposto, custo e lucro calculados como no restante do sistema. */
  const linhasNf = (certame: CertameUnificado, empenho: Empenho, nf: NotaFiscal) => nf.itens.map(itemNf => {
    const ei = empenho.itens.find(e => e.id === itemNf.empenhoItemId);
    const pi = certame.itens.find(p => p.id === ei?.precificacaoItemId);
    const valor = (ei?.precoVendaUnitSnapshot || 0) * itemNf.qtdNestaNF;
    const imposto = valor * ((pi?.aliquotaPct ?? 0) / 100);
    const custo = ei ? custoUnitEfetivo(ei) * itemNf.qtdNestaNF : 0;
    return {
        'Certame': `${certame.modalidade} ${certame.numeroAno}`,
        'Órgão': certame.orgao,
        'Empresa': certame.empresaDestinoNome || 'AM Contratos & Soluções B2G',
        'Empenho': empenho.numeroEmpenho,
        'Nota fiscal': nf.numeroNF,
        'Data de emissão': dataBrCsv(nf.dataNFISO),
        'Data de entrega': dataBrCsv(nf.dataEntregaISO),
        'Situação do pagamento': nf.pago ? 'Paga' : 'Aguardando pagamento',
        'Data do pagamento': dataBrCsv(nf.dataPagamentoISO),
        'Produto': ei?.descricaoSnapshot || '',
        'Unidade': ei?.unidadeSnapshot || '',
        'Quantidade': numeroBr(itemNf.qtdNestaNF, 0),
        'Preço unitário (R$)': numeroBr(ei?.precoVendaUnitSnapshot, 4),
        'Valor (R$)': numeroBr(valor),
        'Imposto (R$)': numeroBr(imposto),
        'Custo (R$)': numeroBr(custo),
        'Lucro (R$)': numeroBr(valor - imposto - custo),
    };
  });

  const handleExportNfsCertameCsv = () => {
    if (!selectedCertame) return;
    const dataToExport = selectedCertame.empenhos.flatMap(empenho => empenho.nfs.flatMap(nf => linhasNf(selectedCertame, empenho, nf)));
    if (dataToExport.length === 0) {
        toast({ title: 'Nenhuma NF para exportar neste certame.', variant: 'destructive' });
        return;
    }
    exportToCsv(dataToExport, `notas_fiscais_${selectedCertame.numeroAno.replace(/[^a-zA-Z0-9]/g, '')}.csv`);
    toast({ title: 'Planilha das notas fiscais exportada!' });
  }
  
  const handleExportNfsMesCsv = () => {
    const selectedMonth = getMonth(viewDate);
    const selectedYear = getYear(viewDate);
    const nfsDoMes: any[] = [];
    allCertames.forEach(certame => {
        certame.empenhos.forEach(empenho => {
            empenho.nfs.forEach(nf => {
                const dateToCheck = new Date(useDeliveryDate ? nf.dataEntregaISO : nf.dataNFISO);
                if (getMonth(dateToCheck) === selectedMonth && getYear(dateToCheck) === selectedYear) nfsDoMes.push(...linhasNf(certame, empenho, nf));
            });
        });
    });
     if (nfsDoMes.length === 0) {
        toast({ title: 'Nenhuma NF para exportar no mês selecionado.', variant: 'destructive' });
        return;
    }
    exportToCsv(nfsDoMes, `notas_fiscais_${selectedYear}_${String(selectedMonth + 1).padStart(2, '0')}.csv`);
    toast({ title: 'Planilha das notas fiscais do mês exportada!' });
  }


  if (isLoading || isUserLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-6 w-2/3" />
        <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
            <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (allCertames.length === 0) {
      return (
          <Card>
              <CardHeader><CardTitle>Nenhum Certame Cadastrado</CardTitle></CardHeader>
              <CardContent>
                  <p className="text-muted-foreground">Crie um certame na tela de Precificação para poder gerar relatórios.</p>
              </CardContent>
          </Card>
      );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
            <CardTitle>Relatórios</CardTitle>
            <CardDescription>Gere PDFs e exportações com base nos seus certames e execução.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="max-w-xl">
                 <Label>Selecione um certame</Label>
                <Select onValueChange={setSelectedCertameId} value={selectedCertameId ?? ''}>
                    <SelectTrigger><SelectValue placeholder="Selecione um certame..." /></SelectTrigger>
                    <SelectContent>
                        {allCertames.map(c => <SelectItem key={c.id} value={c.id}>{c.modalidade} {c.numeroAno} - {c.orgao}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
        </CardContent>
      </Card>
      
      {selectedCertame && summaryKpis && (
          <>
          <Card>
              <CardHeader><CardTitle>Resumo do Certame</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  <KpiCard label="Total Previsto" value={formatCurrency(summaryKpis.totalPrevisto)} />
                  <KpiCard label="Lucro Previsto" value={formatCurrency(summaryKpis.lucroPrevisto)} />
                  <KpiCard label="Total Faturado" value={formatCurrency(summaryKpis.totalFaturado)} />
                  <KpiCard label="Lucro Real" value={formatCurrency(summaryKpis.lucroReal)} />
                  <KpiCard label="Saldo a Receber" value={formatCurrency(summaryKpis.saldoReceber)} className={summaryKpis.saldoReceber > 0 ? 'text-destructive' : 'text-green-600'} />
              </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                  <CardHeader><CardTitle>Exequibilidade</CardTitle><CardDescription>Para o cliente: quais itens compensam, por que os outros não compensam, como o preço foi calculado e o que significa cada termo.</CardDescription></CardHeader>
                  <CardContent><Button onClick={handlePrecificacaoPdf} className="w-full">Gerar relatório de exequibilidade</Button></CardContent>
              </Card>
              <Card>
                  <CardHeader><CardTitle>Relatório Financeiro</CardTitle><CardDescription>Faturamento, custos, imposto e lucro previstos; o que já foi pedido, faturado e recebido; resultado por item.</CardDescription></CardHeader>
                  <CardContent><Button onClick={handleFinanceiroPdf} className="w-full">Gerar relatório financeiro</Button></CardContent>
              </Card>
              <Card>
                  <CardHeader><CardTitle>Execução (Empenhos e NFs)</CardTitle><CardDescription>Cada pedido do órgão: o que foi pedido, entregue e falta entregar, prazos e situação de pagamento das notas.</CardDescription></CardHeader>
                  <CardContent><Button onClick={handleExecucaoPdf} className="w-full">Gerar relatório de execução</Button></CardContent>
              </Card>
               <Card>
                  <CardHeader><CardTitle>Planilhas (Excel)</CardTitle><CardDescription>Abrem direto no Excel, com colunas em português, valores em reais e a situação de cada item explicada.</CardDescription></CardHeader>
                  <CardContent className="space-y-2">
                    <Button variant="outline" onClick={handleExportPrecificacaoCsv} className="w-full">Planilha dos itens e da viabilidade</Button>
                    <Button variant="outline" onClick={handleExportNfsCertameCsv} className="w-full">Planilha das notas fiscais do certame</Button>
                  </CardContent>
              </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader><CardTitle>Notas fiscais do mês (planilha para Excel)</CardTitle><CardDescription>Todas as notas emitidas no mês, de todos os certames, com valor, lucro e situação de pagamento.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
           <div className="flex items-center gap-2"><Label>Mês</Label><Select value={String(getMonth(viewDate))} onValueChange={v => setViewDate(d => setMonth(d, parseInt(v)))}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></div>
           <div className="flex items-center gap-2"><Label>Ano</Label><Select value={String(getYear(viewDate))} onValueChange={v => setViewDate(d => setYear(d, parseInt(v)))}><SelectTrigger className="w-24"><SelectValue /></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div>
           <div className="flex items-center space-x-2 pt-2"><Switch id="date-type-switch" checked={useDeliveryDate} onCheckedChange={setUseDeliveryDate} /><Label htmlFor="date-type-switch">Usar Data de Entrega</Label></div>
           <Button onClick={handleExportNfsMesCsv} className="ml-auto">Exportar NFs do Mês</Button>
        </CardContent>
      </Card>

    </div>
  );
}
