'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getMonth, getYear, setMonth, setYear } from 'date-fns';

import type { CertameUnificado, ClienteAssessoria, Fornecedor } from '@/lib/models';
import { certameUnificadoRepository } from '@/lib/repositories/certame-unificado-repository';
import { calculateCertamePricing, type CertameComCalculo, type FullPricingContext } from '@/lib/pricing-calculator';
import { generatePrecificacaoPdf, generateExecucaoPdf, generateFinanceiroPdf } from '@/lib/pdf-generator';
import { exportToCsv } from '@/lib/csv-exporter';
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
             const [certamesData, impostosData, categoriasData, configData, fixosData, variaveisData, fornecedoresData, clientesData] = await Promise.all([
                certameUnificadoRepository.list(),
                impostoRepository.getSettings(),
                categoriaRepository.list(),
                configuracaoRepository.get(),
                custoFixoRepository.list(),
                custoVariavelRepository.list(),
                fornecedorRepository.list(),
                clienteAssessoriaRepository.list(),
            ]);

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
    return calculateCertamePricing(certame, pricingContext);
  }, [selectedCertameId, allCertames, pricingContext]);

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
                    const itemCusto = empenhoItem.custoUnitSnapshot * itemNF.qtdNestaNF;
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

  const handlePrecificacaoPdf = () => {
    if (!selectedCertame) return;
    const empresa = clientes.find(e => e.id === selectedCertame.empresaDestinoId);
    generatePrecificacaoPdf(selectedCertame, fornecedores, empresa);
    toast({ title: 'PDF de Precificação gerado!' });
  }

  const handleFinanceiroPdf = () => {
    if (!selectedCertame) return;
    const empresa = clientes.find(e => e.id === selectedCertame.empresaDestinoId);
    generateFinanceiroPdf(selectedCertame, empresa);
    toast({ title: 'PDF Financeiro gerado!' });
  }

  const handleExecucaoPdf = () => {
    if (!selectedCertame) return;
    generateExecucaoPdf(selectedCertame);
    toast({ title: 'PDF de Execução gerado!' });
  }

  const handleExportPrecificacaoCsv = () => {
    if (!selectedCertame) return;
    const dataToExport = selectedCertame.itens.map(item => ({
        item: item.itemNumero,
        descricao: item.descricao,
        unidade: item.unidade,
        quantidade: item.qtd,
        preco_ref: item.precoReferencia,
        custo_base: item.custoUnitBase,
        frete_unit: item.freteUnitario,
        overhead_unit: item.custoFixoRateadoUnit,
        custo_total_unit: item.metrics.custoTotalUnit,
        imposto_unit: item.metrics.impostoUnit,
        preco_final_unit: item.metrics.precoFinalUnit,
        lucro_unit: item.metrics.lucroUnit,
        lucro_total: item.metrics.lucroTotal,
        margem_pct: item.metrics.margemAplicadaPercent,
    }));
    exportToCsv(dataToExport, `precificacao_${selectedCertame.numeroAno.replace(/[^a-zA-Z0-9]/g, '')}.csv`);
    toast({ title: 'CSV de Precificação exportado!' });
  }

  const handleExportNfsCertameCsv = () => {
    if (!selectedCertame) return;
    const dataToExport: any[] = [];
    selectedCertame.empenhos.forEach(empenho => {
        empenho.nfs.forEach(nf => {
            nf.itens.forEach(itemNf => {
                const empenhoItem = empenho.itens.find(ei => ei.id === itemNf.empenhoItemId);
                dataToExport.push({
                    certame: selectedCertame.numeroAno,
                    empenho: empenho.numeroEmpenho,
                    nf_numero: nf.numeroNF,
                    nf_data: nf.dataNFISO,
                    nf_data_entrega: nf.dataEntregaISO,
                    nf_paga: nf.pago,
                    item_descricao: empenhoItem?.descricaoSnapshot,
                    item_qtd: itemNf.qtdNestaNF,
                    item_preco_venda: empenhoItem?.precoVendaUnitSnapshot,
                    item_lucro: empenhoItem?.lucroUnitSnapshot
                });
            });
        });
    });
    if (dataToExport.length === 0) {
        toast({ title: 'Nenhuma NF para exportar neste certame.', variant: 'destructive' });
        return;
    }
    exportToCsv(dataToExport, `nfs_certame_${selectedCertame.numeroAno.replace(/[^a-zA-Z0-9]/g, '')}.csv`);
    toast({ title: 'CSV de NFs do Certame exportado!' });
  }
  
  const handleExportNfsMesCsv = () => {
    const selectedMonth = getMonth(viewDate);
    const selectedYear = getYear(viewDate);

    const nfsDoMes: any[] = [];
    allCertames.forEach(certame => {
        certame.empenhos.forEach(empenho => {
            empenho.nfs.forEach(nf => {
                const dateToCheck = new Date(useDeliveryDate ? nf.dataEntregaISO : nf.dataNFISO);
                if (getMonth(dateToCheck) === selectedMonth && getYear(dateToCheck) === selectedYear) {
                     nf.itens.forEach(itemNf => {
                        const empenhoItem = empenho.itens.find(ei => ei.id === itemNf.empenhoItemId);
                        nfsDoMes.push({
                           certame: certame.numeroAno,
                           empenho: empenho.numeroEmpenho,
                           nf_numero: nf.numeroNF,
                           nf_data: nf.dataNFISO,
                           nf_data_entrega: nf.dataEntregaISO,
                           nf_paga: nf.pago,
                           item_descricao: empenhoItem?.descricaoSnapshot,
                           item_qtd: itemNf.qtdNestaNF,
                           item_preco_venda: empenhoItem?.precoVendaUnitSnapshot,
                           item_lucro: empenhoItem?.lucroUnitSnapshot
                       });
                    });
                }
            });
        });
    });

     if (nfsDoMes.length === 0) {
        toast({ title: 'Nenhuma NF para exportar no mês selecionado.', variant: 'destructive' });
        return;
    }
    exportToCsv(nfsDoMes, `nfs_mes_${selectedYear}_${selectedMonth + 1}.csv`);
    toast({ title: 'CSV de NFs do Mês exportado!' });
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
                  <CardHeader><CardTitle>Exequibilidade</CardTitle></CardHeader>
                  <CardContent><Button onClick={handlePrecificacaoPdf} className="w-full">Gerar PDF de Precificação</Button></CardContent>
              </Card>
              <Card>
                  <CardHeader><CardTitle>Relatório Financeiro</CardTitle></CardHeader>
                  <CardContent><Button onClick={handleFinanceiroPdf} className="w-full">Gerar PDF Financeiro</Button></CardContent>
              </Card>
              <Card>
                  <CardHeader><CardTitle>Execução (Empenhos e NFs)</CardTitle></CardHeader>
                  <CardContent><Button onClick={handleExecucaoPdf} className="w-full">Gerar PDF de Execução</Button></CardContent>
              </Card>
               <Card>
                  <CardHeader><CardTitle>Exportação CSV (Certame)</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <Button variant="outline" onClick={handleExportPrecificacaoCsv} className="w-full">Exportar Itens da Precificação</Button>
                    <Button variant="outline" onClick={handleExportNfsCertameCsv} className="w-full">Exportar NFs do Certame</Button>
                  </CardContent>
              </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader><CardTitle>Exportação de Notas Fiscais do Mês (CSV)</CardTitle></CardHeader>
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
