'use client';

import * as React from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, TrendingUp, PiggyBank, Target as TargetIcon, DollarSign, ArrowRight, MinusCircle, CheckCircle2, FileText, BarChart, Info, Scale } from 'lucide-react';
import { format as formatDate, parseISO, getMonth, getYear, setMonth, setYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { CurrencyInput } from '@/components/ui/currency-input';
import { PercentInput } from '@/components/ui/percent-input';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/use-debounce';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

import { metasRepository } from '@/lib/repositories/metas-repository';
import { configuracaoRepository } from '@/lib/repositories/configuracao-repository';
import { custoFixoRepository } from '@/lib/repositories/custo-fixo-repository';
import { certameUnificadoRepository } from '@/lib/repositories/certame-unificado-repository';

import type { CustoFixo, MetasConfig, ConfiguracoesGerais, CertameUnificado, NotaFiscal, Empenho } from '@/lib/models';
import { formatCurrency, cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser } from '@/firebase';

const metasSchema = z.object({
  salarioDesejado: z.number().min(0, 'O salário deve ser positivo.'),
  lucroAlvoEmpresa: z.number().min(0, 'O lucro alvo deve ser positivo.'),
  lucroMedioPercentManual: z.number().min(0.1, 'O lucro médio deve ser maior que zero para o cálculo.'),
});

function IndicatorCard({ title, value, icon: Icon, isPrimary = false, children, className }: { title: string; value: string; icon: LucideIcon, isPrimary?: boolean, children?: React.ReactNode, className?: string }) {
    return (
        <Card className={isPrimary ? 'bg-primary text-primary-foreground' : ''}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className={`text-sm font-medium ${isPrimary ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{title}</CardTitle>
                <Icon className={`h-5 w-5 ${isPrimary ? 'text-primary-foreground/80' : 'text-muted-foreground'}`} />
            </CardHeader>
            <CardContent>
                <div className={cn("text-2xl font-bold", className)}>{value}</div>
                {children}
            </CardContent>
        </Card>
    );
}

export default function MetasPage() {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Motor de Metas</CardTitle>
                    <CardDescription>
                        Alterne entre a projeção de metas (Previsão) e o acompanhamento dos resultados reais do mês (Real).
                    </CardDescription>
                </CardHeader>
            </Card>
            <Tabs defaultValue="previsao" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="previsao">Previsão</TabsTrigger>
                    <TabsTrigger value="real">Real (Execução)</TabsTrigger>
                </TabsList>
                <TabsContent value="previsao">
                    <MetasPrevisaoTab />
                </TabsContent>
                <TabsContent value="real">
                    <MetasRealTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}


function MetasPrevisaoTab() {
    const { toast } = useToast();
    const [isSaving, setIsSaving] = React.useState(false);
    const [custosFixos, setCustosFixos] = React.useState<CustoFixo[]>([]);
    const [configGerais, setConfigGerais] = React.useState<ConfiguracoesGerais | null>(null);
    const { user, isUserLoading } = useUser();

    const [totalCustosFixos, setTotalCustosFixos] = React.useState(0);
    const [pontoEquilibrio, setPontoEquilibrio] = React.useState(0);
    const [faturamentoPrevisto, setFaturamentoPrevisto] = React.useState(0);
    const [overheadEstimado, setOverheadEstimado] = React.useState(0);


    const form = useForm<z.infer<typeof metasSchema>>({
        resolver: zodResolver(metasSchema),
        defaultValues: { salarioDesejado: 0, lucroAlvoEmpresa: 0, lucroMedioPercentManual: 15 }
    });
    
    const loadInitialData = React.useCallback(async () => {
        const [metas, configs, cf] = await Promise.all([
            metasRepository.get(),
            configuracaoRepository.get(),
            custoFixoRepository.list()
        ]);
        setCustosFixos(cf);
        form.reset(metas);
        setConfigGerais(configs);
    }, [form]);

    React.useEffect(() => { 
        if (isUserLoading || !user) return;
        loadInitialData(); 
    }, [loadInitialData, user, isUserLoading]);

    const watchedFormValues = form.watch();
    const debouncedFormValues = useDebounce(watchedFormValues, 300);

    const recalculateAndSave = React.useCallback(async (values: z.infer<typeof metasSchema>) => {
        if (!custosFixos) return;

        const totalCustosFixosAtivos = custosFixos.filter(c => c.ativo).reduce((acc, c) => acc + c.valorMensal, 0);
        const lucroAlvoTotal = totalCustosFixosAtivos + values.salarioDesejado + values.lucroAlvoEmpresa;
        const lucroMedioPercent = values.lucroMedioPercentManual / 100;
        const novoFaturamentoPrevisto = lucroMedioPercent > 0 ? lucroAlvoTotal / lucroMedioPercent : 0;

        setTotalCustosFixos(totalCustosFixosAtivos);
        setPontoEquilibrio(totalCustosFixosAtivos + values.salarioDesejado);
        setFaturamentoPrevisto(novoFaturamentoPrevisto);
        
        let novoOverhead = 0;
        if (configGerais) {
            const manualOverhead = configGerais.overheadPercentManual;
            if (manualOverhead !== null && manualOverhead !== undefined && manualOverhead > 0) {
                novoOverhead = manualOverhead;
            } else if (novoFaturamentoPrevisto > 0) {
                novoOverhead = (totalCustosFixosAtivos / novoFaturamentoPrevisto) * 100;
            }
        }
        setOverheadEstimado(novoOverhead);

        await metasRepository.save(values);

        if (configGerais?.metasControlamFaturamento) {
            const newConfigs: Partial<ConfiguracoesGerais> = { faturamentoMensalPrevisto: novoFaturamentoPrevisto };
            await configuracaoRepository.save(newConfigs);
            setConfigGerais(current => current ? { ...current, ...newConfigs } : null);
        }

    }, [custosFixos, configGerais]);

    React.useEffect(() => {
       if (debouncedFormValues.salarioDesejado !== undefined) {
         recalculateAndSave(debouncedFormValues);
       }
    }, [debouncedFormValues, recalculateAndSave]);


    const onSubmit = async (values: z.infer<typeof metasSchema>) => {
        setIsSaving(true);
        try {
            await recalculateAndSave(values);
            toast({ title: 'Sucesso!', description: 'Metas salvas e faturamento previsto atualizado.' });
        } catch {
            toast({ title: 'Erro!', description: 'Não foi possível salvar as metas.', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const salarioDesejadoValue = form.watch('salarioDesejado');

    return (
        <div className="space-y-6">
             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <IndicatorCard title="Custos Fixos Ativos" value={formatCurrency(totalCustosFixos)} icon={DollarSign} />
                <IndicatorCard title="Ponto de Equilíbrio (+ Salário)" value={formatCurrency(pontoEquilibrio)} icon={TargetIcon} />
                <IndicatorCard title="Overhead Estimado" value={`${overheadEstimado.toFixed(2)} %`} icon={PiggyBank} />
                <IndicatorCard title="Faturamento Previsto (Meta)" value={formatCurrency(faturamentoPrevisto)} icon={TrendingUp} isPrimary />
             </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card>
                        <CardHeader><CardTitle>Parâmetros de Cálculo da Previsão</CardTitle></CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid md:grid-cols-2 gap-8">
                                <FormField control={form.control} name="salarioDesejado" render={({ field }) => (
                                    <FormItem><FormLabel>1. Salário Desejado</FormLabel><FormControl><CurrencyInput value={field.value} onChange={field.onChange} /></FormControl><FormDescription>Seu "salário" mensal como meta.</FormDescription><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name="lucroMedioPercentManual" render={({ field }) => (
                                    <FormItem><FormLabel>2. Lucro Médio Esperado (%)</FormLabel><FormControl><PercentInput value={field.value} onChange={field.onChange} /></FormControl><FormDescription>Margem de lucro média estimada sobre o custo dos seus certames.</FormDescription><FormMessage /></FormItem>
                                )} />
                            </div>
                            <FormField control={form.control} name="lucroAlvoEmpresa" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>3. Meta de Lucro da Empresa</FormLabel>
                                    <FormDescription>Valor adicional de lucro que a empresa deve gerar, além de cobrir custos e seu salário.</FormDescription>
                                    <FormControl>
                                        <div className="flex items-center gap-4 pt-2">
                                            <Slider
                                                value={[field.value]}
                                                onValueChange={(v) => field.onChange(v[0])}
                                                max={salarioDesejadoValue > 1000 ? salarioDesejadoValue : 10000}
                                                step={100}
                                            />
                                            <CurrencyInput className="w-48" value={field.value} onChange={field.onChange} />
                                        </div>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </CardContent>
                    </Card>

                    {configGerais && !configGerais.metasControlamFaturamento && (
                        <Card className="border-destructive">
                            <CardHeader>
                                <CardTitle>Controle Automático Desativado</CardTitle>
                                <CardDescription className="text-destructive">
                                    O Faturamento Mensal Previsto está sendo controlado manualmente. Para que as metas funcionem, ative o controle automático nas configurações.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button asChild variant="outline">
                                    <Link href="/configuracoes">Ir para Configurações <ArrowRight className="ml-2" /></Link>
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    <div className="flex justify-end">
                        <Button type="submit" disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar Metas
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
}

// Extends NotaFiscal with the objects it's related to for easy access in the UI
type AugmentedNF = NotaFiscal & { certame: CertameUnificado; empenho: Empenho; nfTotalVenda: number; nfLucro: number; nfTotalImpostos: number; };
type SelectedNFData = { nf: AugmentedNF, certame: CertameUnificado };

function MetasRealTab() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [viewDate, setViewDate] = React.useState(new Date());
  const [useDeliveryDate, setUseDeliveryDate] = React.useState(false);
  const { user, isUserLoading } = useUser();

  const [allCertames, setAllCertames] = React.useState<CertameUnificado[]>([]);
  const [totalCustosFixos, setTotalCustosFixos] = React.useState(0);
  const [salarioDesejado, setSalarioDesejado] = React.useState(0);
  
  const [selectedNF, setSelectedNF] = React.useState<SelectedNFData | null>(null);

  React.useEffect(() => {
    if (isUserLoading || !user) return;
    
    async function loadData() {
      setIsLoading(true);
      try {
        const [certamesData, custosFixosData, metasData] = await Promise.all([
          certameUnificadoRepository.list(),
          custoFixoRepository.list(),
          metasRepository.get(),
        ]);
        setAllCertames(certamesData);
        setTotalCustosFixos(custosFixosData.filter(c => c.ativo).reduce((acc, c) => acc + c.valorMensal, 0));
        setSalarioDesejado(metasData.salarioDesejado);
      } catch (error) {
        console.error("Failed to load execution data:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [user, isUserLoading]);

  const monthlyMetrics = React.useMemo(() => {
    const selectedMonth = getMonth(viewDate);
    const selectedYear = getYear(viewDate);
    let totalFaturado = 0, lucroReal = 0, totalImpostos = 0;
    const nfsDoMes: AugmentedNF[] = [];
    const certameProfitMap = new Map<string, { id: string; nome: string; lucro: number }>();

    allCertames.forEach(certame => {
      certame.empenhos.forEach(empenho => {
        empenho.nfs.forEach(nf => {
          const dateToCheck = parseISO(useDeliveryDate ? nf.dataEntregaISO : nf.dataNFISO);
          
          if (getMonth(dateToCheck) === selectedMonth && getYear(dateToCheck) === selectedYear) {
            let nfTotalVenda = 0, nfLucro = 0, nfTotalImpostos = 0;

            nf.itens.forEach(nfItem => {
              const empenhoItem = empenho.itens.find(ei => ei.id === nfItem.empenhoItemId);
              const precificacaoItem = certame.itens.find(pi => pi.id === empenhoItem?.precificacaoItemId);

              if (empenhoItem && precificacaoItem) {
                const aliquotaPct = precificacaoItem.aliquotaPct;
                const itemFaturamento = empenhoItem.precoVendaUnitSnapshot * nfItem.qtdNestaNF;
                const itemCusto = empenhoItem.custoUnitSnapshot * nfItem.qtdNestaNF;
                
                const itemImposto = itemFaturamento * (aliquotaPct / 100);
                const itemLucro = itemFaturamento - itemImposto - itemCusto;
                
                nfTotalVenda += itemFaturamento;
                nfLucro += itemLucro;
                nfTotalImpostos += itemImposto;
              }
            });
            
            totalFaturado += nfTotalVenda;
            lucroReal += nfLucro;
            totalImpostos += nfTotalImpostos;

            nfsDoMes.push({ ...nf, certame, empenho, nfTotalVenda, nfLucro, nfTotalImpostos });
            
            const certameNome = `${certame.modalidade} ${certame.numeroAno}`;
            const currentLucro = certameProfitMap.get(certame.id)?.lucro || 0;
            certameProfitMap.set(certame.id, { id: certame.id, nome: certameNome, lucro: currentLucro + nfLucro });
          }
        });
      });
    });

    const baseCustoMes = totalCustosFixos + salarioDesejado;
    const resultadoFinalMes = lucroReal - baseCustoMes;
    const percentLucroSobreBase = baseCustoMes > 0 ? (resultadoFinalMes / baseCustoMes) * 100 : (resultadoFinalMes > 0 ? Infinity : -Infinity);
    const topCertames = Array.from(certameProfitMap.values()).sort((a, b) => b.lucro - a.lucro);

    return { totalFaturado, lucroReal, totalImpostos, baseCustoMes, resultadoFinalMes, percentLucroSobreBase, nfsDoMes, topCertames };
  }, [allCertames, viewDate, useDeliveryDate, totalCustosFixos, salarioDesejado]);
  
  const handleMonthChange = (month: string) => setViewDate(current => setMonth(current, parseInt(month)));
  const handleYearChange = (year: string) => setViewDate(current => setYear(current, parseInt(year)));
  const years = React.useMemo(() => Array.from({ length: 5 }, (_, i) => getYear(new Date()) - i), []);
  const months = React.useMemo(() => Array.from({ length: 12 }, (_, i) => ({ label: formatDate(new Date(0, i), 'MMMM', { locale: ptBR }), value: String(i) })), []);

  const nfColumns: ColumnDef<AugmentedNF>[] = [
      { accessorKey: 'numeroNF', header: 'Nº NF', cell: (row) => row.numeroNF },
      { accessorKey: 'dataNFISO', header: 'Data NF', cell: (row) => formatDate(parseISO(row.dataNFISO), 'dd/MM/yyyy') },
      { accessorKey: 'empenho', header: 'Empenho', cell: (row) => row.empenho.numeroEmpenho },
      { accessorKey: 'certame', header: 'Certame', cell: (row) => `${row.certame.modalidade} ${row.certame.numeroAno}` },
      { accessorKey: 'nfTotalVenda', header: 'Total Venda', align: 'right', cell: (row) => formatCurrency(row.nfTotalVenda) },
      { accessorKey: 'nfTotalImpostos', header: 'Imposto', align: 'right', cell: (row) => formatCurrency(row.nfTotalImpostos) },
      { accessorKey: 'nfLucro', header: 'Lucro', align: 'right', cell: (row) => formatCurrency(row.nfLucro) },
      { accessorKey: 'pago', header: 'Status', cell: (row) => <Badge className={row.pago ? 'bg-green-600' : ''}>{row.pago ? 'Pago' : 'Pendente'}</Badge> },
      { accessorKey: 'actions', header: 'Ações', align: 'right', cell: (row) => <Button variant="outline" size="sm" onClick={() => setSelectedNF({nf: row, certame: row.certame})}>Ver</Button> },
  ];

  const certameColumns: ColumnDef<{id: string; nome: string, lucro: number}>[] = [
      { accessorKey: 'nome', header: 'Certame', cell: (row) => row.nome },
      { accessorKey: 'lucro', header: 'Lucro no Mês', align: 'right', cell: (row) => formatCurrency(row.lucro) }
  ];

  if (isLoading || isUserLoading) {
    return (
        <div className="space-y-6 animate-pulse">
            <Card>
                <CardHeader><Skeleton className="h-8 w-48" /></CardHeader>
                <CardContent><Skeleton className="h-10 w-full max-w-lg" /></CardContent>
            </Card>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({length: 6}).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
            </div>
            <Card>
                <CardHeader><Skeleton className="h-8 w-64" /></CardHeader>
                <CardContent><Skeleton className="h-48 w-full" /></CardContent>
            </Card>
            <Card>
                <CardHeader><Skeleton className="h-8 w-64" /></CardHeader>
                <CardContent><Skeleton className="h-32 w-full" /></CardContent>
            </Card>
        </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Filtros de Análise</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2"><Label htmlFor="month-select">Mês</Label><Select value={String(getMonth(viewDate))} onValueChange={handleMonthChange}><SelectTrigger id="month-select" className="w-36"><SelectValue /></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex items-center gap-2"><Label htmlFor="year-select">Ano</Label><Select value={String(getYear(viewDate))} onValueChange={handleYearChange}><SelectTrigger id="year-select" className="w-24"><SelectValue /></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex items-center space-x-2 pt-2"><Switch id="date-type-switch" checked={useDeliveryDate} onCheckedChange={setUseDeliveryDate} /><Label htmlFor="date-type-switch">Usar Data de Entrega</Label></div>
        </CardContent>
      </Card>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <IndicatorCard title="Base de Custo (Fixos + Salário)" value={formatCurrency(monthlyMetrics.baseCustoMes)} icon={PiggyBank} />
          <IndicatorCard title="Total Faturado (NFs do mês)" value={formatCurrency(monthlyMetrics.totalFaturado)} icon={FileText} />
          <IndicatorCard title="Lucro Real (NFs do mês)" value={formatCurrency(monthlyMetrics.lucroReal)} icon={TrendingUp} />
          <IndicatorCard title="Impostos (NFs do mês)" value={formatCurrency(monthlyMetrics.totalImpostos)} icon={Scale} />
          <IndicatorCard title="Resultado Final do Mês" value={formatCurrency(monthlyMetrics.resultadoFinalMes)} icon={TargetIcon} className={monthlyMetrics.resultadoFinalMes >= 0 ? "text-green-600" : "text-destructive"} isPrimary />
          <IndicatorCard title="% Lucro sobre a Base" value={`${monthlyMetrics.percentLucroSobreBase.toFixed(2)}%`} icon={BarChart} className={monthlyMetrics.percentLucroSobreBase >= 0 ? "text-green-600" : "text-destructive"} />
      </div>
      
      <Card>
        <CardHeader><CardTitle>Notas Fiscais do Mês</CardTitle></CardHeader>
        <CardContent><DataTable columns={nfColumns} data={monthlyMetrics.nfsDoMes} emptyStateMessage="Nenhuma NF encontrada para este mês." /></CardContent>
      </Card>
      
      <Card>
        <CardHeader><CardTitle>Top Certames por Lucro no Mês</CardTitle></CardHeader>
        <CardContent><DataTable columns={certameColumns} data={monthlyMetrics.topCertames} emptyStateMessage="Nenhum lucro de certames registrado neste mês." /></CardContent>
      </Card>

      <NFDetailModal isOpen={!!selectedNF} onClose={() => setSelectedNF(null)} data={selectedNF} />
    </div>
  );
}

function NFDetailModal({ isOpen, onClose, data }: { isOpen: boolean, onClose: () => void, data: SelectedNFData | null }) {
    if (!data) return null;
    
    const { nf } = data;
    const empenho = nf.empenho;
    const certame = nf.certame;
    let totalVenda=0, totalImposto=0, totalCusto=0, totalLucro=0;
    
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Detalhes da Nota Fiscal: {nf.numeroNF}</DialogTitle>
                    <DialogDescription>
                        Certame: {certame.modalidade} {certame.numeroAno} | Empenho: {empenho?.numeroEmpenho}
                    </DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Descrição</TableHead>
                                <TableHead className="text-right">Qtd</TableHead>
                                <TableHead className="text-right">Venda Total</TableHead>
                                <TableHead className="text-right">Imposto</TableHead>
                                <TableHead className="text-right">Custo Total</TableHead>
                                <TableHead className="text-right">Lucro Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {nf.itens.map(nfItem => {
                                const empenhoItem = empenho?.itens.find((ei: any) => ei.id === nfItem.empenhoItemId);
                                if (!empenhoItem) return null;
                                
                                const itemVenda = empenhoItem.precoVendaUnitSnapshot * nfItem.qtdNestaNF;
                                const itemCusto = empenhoItem.custoUnitSnapshot * nfItem.qtdNestaNF;
                                
                                // Find original item to get tax rate
                                const precificacaoItem = certame.itens.find(pi => pi.id === empenhoItem.precificacaoItemId);
                                const aliquotaPct = precificacaoItem?.aliquotaPct || 0;
                                
                                const itemImposto = itemVenda * (aliquotaPct / 100);
                                const itemLucro = itemVenda - itemImposto - itemCusto;

                                totalVenda += itemVenda; 
                                totalImposto += itemImposto; 
                                totalCusto += itemCusto; 
                                totalLucro += itemLucro;

                                return (
                                    <TableRow key={nfItem.id}>
                                        <TableCell>{empenhoItem.descricaoSnapshot}</TableCell>
                                        <TableCell className="text-right">{nfItem.qtdNestaNF}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(itemVenda)}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(itemImposto)}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(itemCusto)}</TableCell>
                                        <TableCell className="text-right font-semibold">{formatCurrency(itemLucro)}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
                 <div className="mt-4 grid grid-cols-4 gap-4 rounded-lg bg-muted p-4 text-sm font-medium">
                    <div className="text-right">Venda: <span className="font-bold">{formatCurrency(totalVenda)}</span></div>
                    <div className="text-right">Imposto: <span className="font-bold">{formatCurrency(totalImposto)}</span></div>
                    <div className="text-right">Custo: <span className="font-bold">{formatCurrency(totalCusto)}</span></div>
                    <div className="text-right text-base">Lucro: <span className="font-bold">{formatCurrency(totalLucro)}</span></div>
                </div>
                <DialogFooter className="pt-4">
                    <Button variant="outline" onClick={onClose}>Voltar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
    

