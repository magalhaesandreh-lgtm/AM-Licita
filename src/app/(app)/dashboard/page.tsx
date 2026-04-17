'use client';

import * as React from 'react';
import Link from 'next/link';
import { getMonth, getYear, setMonth, setYear, parseISO, isAfter, isBefore, addDays, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText,
  TrendingUp,
  Target as TargetIcon,
  DollarSign,
  Landmark,
  FileCheck2,
  Hourglass,
  FileClock,
  Archive,
  CircleDollarSign,
  BadgePercent,
  PlusCircle,
  Calculator,
  GanttChartSquare,
  AlertTriangle,
  Wallet,
  CalendarClock,
  CalendarCheck,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import type { CertameUnificado, CustoFixo, Empenho, MetasConfig, NotaFiscal } from '@/lib/models';
import { certameUnificadoRepository } from '@/lib/repositories/certame-unificado-repository';
import { custoFixoRepository } from '@/lib/repositories/custo-fixo-repository';
import { metasRepository } from '@/lib/repositories/metas-repository';
import { cn, formatCurrency } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { useUser } from '@/firebase';

// #region Helper Types & Interfaces
type AugmentedNF = NotaFiscal & { certame: CertameUnificado; empenho: Empenho; nfTotalVenda: number; nfLucro: number; nfTotalImpostos: number };
type SelectedNFData = { nf: AugmentedNF; empenho: Empenho };
// #endregion

// #region Main Component
export default function DashboardPage() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [viewDate, setViewDate] = React.useState(new Date());
  const [useDeliveryDate, setUseDeliveryDate] = React.useState(false);
  const { user, isUserLoading } = useUser();

  // Raw Data from Repositories
  const [allCertames, setAllCertames] = React.useState<CertameUnificado[]>([]);
  const [baseCustoMes, setBaseCustoMes] = React.useState(0);
  
  // Modal State
  const [selectedNF, setSelectedNF] = React.useState<SelectedNFData | null>(null);

  const [alertData, setAlertData] = React.useState<{
    entregasAVencerCount: number;
    entregasAtrasadasCount: number;
    entregasCriticas: (Empenho & { certame: CertameUnificado })[];
    comSaldoAReceberCount: number;
    maioresDevedores: (Empenho & { certame: CertameUnificado, saldoAReceber: number })[];
  }>({
    entregasAVencerCount: 0,
    entregasAtrasadasCount: 0,
    entregasCriticas: [],
    comSaldoAReceberCount: 0,
    maioresDevedores: [],
  });

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
        
        const totalCustosFixos = custosFixosData.filter(c => c.ativo).reduce((acc, c) => acc + c.valorMensal, 0);
        setBaseCustoMes(totalCustosFixos + metasData.salarioDesejado);

      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [user, isUserLoading]);

  const handleMonthChange = (month: string) => setViewDate(current => setMonth(current, parseInt(month)));
  const handleYearChange = (year: string) => setViewDate(current => setYear(current, parseInt(year)));
  const years = React.useMemo(() => Array.from({ length: 5 }, (_, i) => getYear(new Date()) - i), []);
  const months = React.useMemo(() => Array.from({ length: 12 }, (_, i) => ({ label: new Date(0, i).toLocaleString('pt-BR', { month: 'long' }), value: String(i) })), []);

  // #region Memoized Calculations
  const allNFs = React.useMemo(() => {
    return allCertames.flatMap(certame =>
     certame.empenhos.flatMap(empenho =>
       empenho.nfs.map(nf => {
         let nfTotalVenda = 0, nfLucro = 0, nfTotalImpostos = 0;
         nf.itens.forEach(nfItem => {
           const empenhoItem = empenho.itens.find(ei => ei.id === nfItem.empenhoItemId);
           const precificacaoItem = certame.itens.find(pi => pi.id === empenhoItem?.precificacaoItemId);

           if (empenhoItem && precificacaoItem) {
             const aliquotaPct = precificacaoItem.aliquotaPct;
             const itemVenda = empenhoItem.precoVendaUnitSnapshot * nfItem.qtdNestaNF;
             const itemCusto = empenhoItem.custoUnitSnapshot * nfItem.qtdNestaNF;
             
             // Recalculate tax and profit from reliable snapshots and original item data
             const itemImposto = itemVenda * (aliquotaPct / 100);
             const itemLucro = itemVenda - itemImposto - itemCusto;

             nfTotalVenda += itemVenda;
             nfLucro += itemLucro;
             nfTotalImpostos += itemImposto;
           }
         });
         return { ...nf, certame, empenho, nfTotalVenda, nfLucro, nfTotalImpostos } as AugmentedNF;
       })
     )
   );
  }, [allCertames]);
  
  const monthlyMetrics = React.useMemo(() => {
    const selectedMonth = getMonth(viewDate);
    const selectedYear = getYear(viewDate);

    const nfsDoMes = allNFs.filter(nf => {
        const dateToCheck = parseISO(useDeliveryDate ? nf.dataEntregaISO : nf.dataNFISO);
        return getMonth(dateToCheck) === selectedMonth && getYear(dateToCheck) === selectedYear;
    });

    const totalFaturado = nfsDoMes.reduce((acc, nf) => acc + nf.nfTotalVenda, 0);
    const lucroReal = nfsDoMes.reduce((acc, nf) => acc + nf.nfLucro, 0);
    const resultadoFinal = lucroReal - baseCustoMes;
    const percentLucroSobreBase = baseCustoMes > 0 ? (resultadoFinal / baseCustoMes) * 100 : (resultadoFinal > 0 ? Infinity : -Infinity);

    return { totalFaturado, lucroReal, resultadoFinal, percentLucroSobreBase };
  }, [allNFs, viewDate, useDeliveryDate, baseCustoMes]);

  const kpiData = React.useMemo(() => ({
    total: allCertames.length,
    emAndamento: allCertames.filter(c => c.status === 'EM_ANDAMENTO').length,
    ganhos: allCertames.filter(c => c.status === 'GANHO').length,
    retroativos: allCertames.filter(c => c.isRetroativo).length,
    congelados: allCertames.filter(c => c.congelado).length,
  }), [allCertames]);

  React.useEffect(() => {
    if (!allCertames) return;
    
    const hoje = new Date();
    const empenhos = allCertames.flatMap(c => c.empenhos.map(e => ({...e, certame: c})));
    
    // Entregas
    const entregasAVencer = empenhos.filter(e => {
        const deadline = parseISO(e.dataSolicitacaoISO);
        const finalDeadline = addDays(deadline, e.prazoEntregaDias);
        return e.statusEntrega !== 'CONCLUIDO' && isBefore(finalDeadline, addDays(hoje, 8)) && isAfter(finalDeadline, hoje);
    });
    const entregasAtrasadas = empenhos.filter(e => e.statusEntrega === 'ATRASADO');
    const entregasCriticas = [...entregasAtrasadas, ...entregasAVencer]
      .sort((a,b) => differenceInDays(parseISO(a.dataSolicitacaoISO), parseISO(b.dataSolicitacaoISO)))
      .slice(0, 5);

    // Financeiro
    const comSaldoAReceber = empenhos.filter(e => {
       const faturado = e.nfs.reduce((acc, nf) => acc + nf.itens.reduce((nfTotal, item) => nfTotal + (item.qtdNestaNF * (e.itens.find(ei => ei.id === item.empenhoItemId)?.precoVendaUnitSnapshot || 0)), 0), 0);
       const pago = e.nfs.filter(nf => nf.pago).reduce((acc, nf) => acc + nf.itens.reduce((nfTotal, item) => nfTotal + (item.qtdNestaNF * (e.itens.find(ei => ei.id === item.empenhoItemId)?.precoVendaUnitSnapshot || 0)), 0), 0);
       return faturado - pago > 0.01;
    });

    const maioresDevedores = comSaldoAReceber.map(e => {
      const faturado = e.nfs.reduce((acc, nf) => acc + nf.itens.reduce((nfTotal, item) => nfTotal + (item.qtdNestaNF * (e.itens.find(ei => ei.id === item.empenhoItemId)?.precoVendaUnitSnapshot || 0)), 0), 0);
      const pago = e.nfs.filter(nf => nf.pago).reduce((acc, nf) => acc + nf.itens.reduce((nfTotal, item) => nfTotal + (item.qtdNestaNF * (e.itens.find(ei => ei.id === item.empenhoItemId)?.precoVendaUnitSnapshot || 0)), 0), 0);
      return {...e, saldoAReceber: faturado - pago};
    }).sort((a,b) => b.saldoAReceber - a.saldoAReceber).slice(0, 5);

    setAlertData({
      entregasAVencerCount: entregasAVencer.length,
      entregasAtrasadasCount: entregasAtrasadas.length,
      entregasCriticas,
      comSaldoAReceberCount: comSaldoAReceber.length,
      maioresDevedores
    });
  }, [allCertames]);

  const recentNFs = React.useMemo(() => {
    return allNFs.sort((a, b) => new Date(b.dataNFISO).getTime() - new Date(a.dataNFISO).getTime()).slice(0, 10);
  }, [allNFs]);
  // #endregion

  // #region Render Logic
  if (isLoading || isUserLoading) {
    return <DashboardSkeleton />;
  }
  
  if (allCertames.length === 0) {
    return (
        <Card>
            <CardHeader><CardTitle>Bem-vindo!</CardTitle></CardHeader>
            <CardContent className="text-center">
                <p className="text-muted-foreground mb-4">Nenhum certame cadastrado ainda. Comece agora para popular sua dashboard.</p>
                <Button asChild><Link href="/precificacao-unificada">Cadastrar Primeiro Certame</Link></Button>
            </CardContent>
        </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>Visão geral dos certames, execução e metas do mês.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2"><Label htmlFor="month-select">Mês</Label><Select value={String(getMonth(viewDate))} onValueChange={handleMonthChange}><SelectTrigger id="month-select" className="w-36"><SelectValue /></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex items-center gap-2"><Label htmlFor="year-select">Ano</Label><Select value={String(getYear(viewDate))} onValueChange={handleYearChange}><SelectTrigger id="year-select" className="w-24"><SelectValue /></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex items-center space-x-2 pt-2"><Switch id="date-type-switch" checked={useDeliveryDate} onCheckedChange={setUseDeliveryDate} /><Label htmlFor="date-type-switch">Usar Data de Entrega</Label></div>
        </CardContent>
      </Card>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard title="Certames Cadastrados" value={kpiData.total} icon={Landmark} />
        <KpiCard title="Certames em Andamento" value={kpiData.emAndamento} icon={Hourglass} />
        <KpiCard title="Certames Ganhos" value={kpiData.ganhos} icon={FileCheck2} />
        <KpiCard title="Certames Retroativos" value={kpiData.retroativos} icon={FileClock} />
        <KpiCard title="Certames Congelados" value={kpiData.congelados} icon={Archive} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total Faturado no Mês" value={formatCurrency(monthlyMetrics.totalFaturado)} icon={FileText} />
        <KpiCard title="Lucro Real no Mês" value={formatCurrency(monthlyMetrics.lucroReal)} icon={CircleDollarSign} />
        <KpiCard title="Resultado Final do Mês" value={formatCurrency(monthlyMetrics.resultadoFinal)} icon={TargetIcon} className={monthlyMetrics.resultadoFinal >= 0 ? "text-green-600" : "text-destructive"} />
        <KpiCard title="% Lucro sobre a Base" value={`${monthlyMetrics.percentLucroSobreBase.toFixed(2)}%`} icon={BadgePercent} className={monthlyMetrics.percentLucroSobreBase >= 0 ? "text-green-600" : "text-destructive"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AlertsCard icon={CalendarClock} title="Alertas de Entrega" count={alertData.entregasAtrasadasCount + alertData.entregasAVencerCount}>
            <div className="text-sm text-muted-foreground mb-2">
                <span className="font-semibold text-destructive">{alertData.entregasAtrasadasCount}</span> Atrasadas | <span className="font-semibold text-amber-600">{alertData.entregasAVencerCount}</span> a Vencer
            </div>
            {alertData.entregasCriticas.length > 0 ? (
                <ul className="space-y-2">
                    {alertData.entregasCriticas.map(e => <li key={e.id} className="flex justify-between items-center text-sm"><Link href={`/certames/${e.certame.id}`} className="truncate hover:underline">{e.numeroEmpenho} - {e.orgao}</Link> <Badge variant={e.statusEntrega === 'ATRASADO' ? 'destructive' : 'outline'}>{e.statusEntrega}</Badge></li>)}
                </ul>
            ) : <p className="text-sm text-muted-foreground text-center py-4">Nenhum alerta de entrega.</p>}
        </AlertsCard>
        <AlertsCard icon={Wallet} title="Alertas Financeiros" count={alertData.comSaldoAReceberCount}>
            <div className="text-sm text-muted-foreground mb-2">
                <span className="font-semibold text-blue-600">{alertData.comSaldoAReceberCount}</span> Empenhos com saldo a receber
            </div>
            {alertData.maioresDevedores.length > 0 ? (
                <ul className="space-y-2">
                    {alertData.maioresDevedores.map(e => <li key={e.id} className="flex justify-between items-center text-sm"><Link href={`/certames/${e.certame.id}`} className="truncate hover:underline">{e.numeroEmpenho} - {e.orgao}</Link> <strong>{formatCurrency(e.saldoAReceber)}</strong></li>)}
                </ul>
            ) : <p className="text-sm text-muted-foreground text-center py-4">Nenhum alerta financeiro.</p>}
        </AlertsCard>
      </div>

      <Card>
        <CardHeader><CardTitle>Últimas Notas Fiscais</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { accessorKey: 'numeroNF', header: 'Nº NF', cell: (row) => row.numeroNF },
              { accessorKey: 'dataNFISO', header: 'Data', cell: (row) => new Date(row.dataNFISO).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) },
              { accessorKey: 'empenho', header: 'Empenho', cell: (row) => row.empenho.numeroEmpenho },
              { accessorKey: 'certame', header: 'Certame', cell: (row) => `${row.certame.modalidade} ${row.certame.numeroAno}` },
              { accessorKey: 'nfTotalVenda', header: 'Venda', align: 'right', cell: (row) => formatCurrency(row.nfTotalVenda) },
              { accessorKey: 'nfTotalImpostos', header: 'Imposto', align: 'right', cell: (row) => formatCurrency(row.nfTotalImpostos) },
              { accessorKey: 'nfLucro', header: 'Lucro', align: 'right', cell: (row) => formatCurrency(row.nfLucro) },
              { accessorKey: 'pago', header: 'Status', cell: (row) => <Badge className={row.pago ? 'bg-green-600' : ''}>{row.pago ? 'Pago' : 'Pendente'}</Badge> },
              { accessorKey: 'actions', header: 'Ações', align: 'right', cell: (row) => <Button variant="outline" size="sm" onClick={() => setSelectedNF({nf: row, empenho: row.empenho})}>Ver</Button> },
            ]}
            data={recentNFs}
            emptyStateMessage="Nenhuma NF encontrada."
          />
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader><CardTitle>Ações Rápidas</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button asChild variant="outline" size="lg"><Link href="/precificacao-unificada"><PlusCircle className="mr-2"/> Novo Certame</Link></Button>
            <Button asChild variant="outline" size="lg"><Link href="/precificacao-unificada"><Calculator className="mr-2"/> Precificação</Link></Button>
            <Button asChild variant="outline" size="lg"><Link href="/precificacao-unificada"><FileText className="mr-2"/> Lançar NF</Link></Button>
            <Button asChild variant="outline" size="lg"><Link href="/metas"><GanttChartSquare className="mr-2"/> Ver Metas</Link></Button>
        </CardContent>
      </Card>
      
      <NFDetailModal isOpen={!!selectedNF} onClose={() => setSelectedNF(null)} data={selectedNF} />
    </div>
  );
}
// #endregion

// #region Sub-components
function KpiCard({ title, value, icon: Icon, className }: { title: string; value: string | number; icon: LucideIcon; className?: string; }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold", className)}>{value}</div>
      </CardContent>
    </Card>
  );
}

function AlertsCard({ icon: Icon, title, count, children }: { icon: LucideIcon, title: string, count: number, children: React.ReactNode }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    {title}
                    {count > 0 && <Badge variant="destructive" className="ml-auto">{count}</Badge>}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {children}
            </CardContent>
        </Card>
    )
}

function NFDetailModal({ isOpen, onClose, data }: { isOpen: boolean, onClose: () => void, data: SelectedNFData | null }) {
    if (!data) return null;
    
    const { nf, empenho } = data;
    let totalVenda=0, totalImposto=0, totalCusto=0, totalLucro=0;
    
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Detalhes da Nota Fiscal: {nf.numeroNF}</DialogTitle>
                    <DialogDescription>
                        Certame: {nf.certame.modalidade} {nf.certame.numeroAno} | Empenho: {empenho.numeroEmpenho}
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
                                const empenhoItem = empenho.itens.find(ei => ei.id === nfItem.empenhoItemId);
                                if (!empenhoItem) return null;
                                
                                const itemVenda = empenhoItem.precoVendaUnitSnapshot * nfItem.qtdNestaNF;
                                const itemCusto = empenhoItem.custoUnitSnapshot * nfItem.qtdNestaNF;
                                
                                // Find original item to get tax rate
                                const precificacaoItem = nf.certame.itens.find(pi => pi.id === empenhoItem.precificacaoItemId);
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

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent className="flex gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-48" />
        </CardContent>
      </Card>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>

      <Card>
        <CardHeader><Skeleton className="h-8 w-64" /></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
      
      <Card>
        <CardHeader><Skeleton className="h-8 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-16 w-full" /></CardContent>
      </Card>
    </div>
  );
}
// #endregion
    
    

    
