
'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { 
  PlusCircle, 
  MoreHorizontal, 
  FileDown, 
  Trash2, 
  Pencil, 
  Loader2, 
  MoreVertical, 
  ExternalLink, 
  Scale, 
  RotateCcw, 
  Check, 
  ShoppingCart, 
  Receipt, 
  ArrowLeft,
  Calendar as CalendarIcon,
  Info,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock,
  Box,
  TrendingUp,
  FileText
} from 'lucide-react';
import { format as formatDate, parseISO, addDays } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@/components/ui/currency-input';
import { DecimalInput } from '@/components/ui/decimal-input';
import { PercentInput } from '@/components/ui/percent-input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/hooks/use-toast';
import type { CertameUnificado, Produto, Categoria, Fornecedor, ItemPrecificacao, Empenho, EmpenhoItem, NotaFiscal } from '@/lib/models';
import { impostoRepository } from '@/lib/repositories/imposto-repository';
import { certameUnificadoRepository } from '@/lib/repositories/certame-unificado-repository';
import { empenhoRepository } from '@/lib/repositories/empenho-repository';
import { nfRepository } from '@/lib/repositories/nf-repository';
import { produtoRepository } from '@/lib/repositories/produto-repository';
import { categoriaRepository } from '@/lib/repositories/categoria-repository';
import { fornecedorRepository } from '@/lib/repositories/fornecedor-repository';
import { clienteAssessoriaRepository } from '@/lib/repositories/cliente-assessoria-repository';
import { cn, formatCurrency, parseCurrency } from '@/lib/utils';
import { calculateCertamePricing, type CalculatedItemMetrics, type FullPricingContext, type CertameComCalculo } from '@/lib/pricing-calculator';
import { Skeleton } from '@/components/ui/skeleton';
import { generatePrecificacaoPdf } from '@/lib/pdf-generator';
import { useUser } from '@/firebase';

export default function PrecificacaoUnificadaPage() {
    const { toast } = useToast();
    const { user, isUserLoading } = useUser();
    const searchParams = useSearchParams();
    const router = useRouter();

    const [allCertames, setAllCertames] = React.useState<CertameUnificado[]>([]);
    const [produtos, setProdutos] = React.useState<Produto[]>([]);
    const [categorias, setCategorias] = React.useState<Categoria[]>([]);
    const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
    const [clientes, setClientes] = React.useState<any[]>([]);
    const [pricingContext, setPricingContext] = React.useState<FullPricingContext | null>(null);

    const [selectedCertame, setSelectedCertame] = React.useState<CertameComCalculo | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [clienteFiltroId, setClienteFiltroId] = React.useState<string | null>(null);

    const loadData = React.useCallback(async (keepSelection = false) => {
        if (isUserLoading) return;
        if (!keepSelection) setIsLoading(true);

        try {
            const [certamesData, produtosData, categoriasData, fornecedoresData, impostosData, configData, fixosData, variaveisData, clientesData] = await Promise.all([
                certameUnificadoRepository.list(),
                produtoRepository.list(),
                categoriaRepository.list(),
                fornecedorRepository.list(),
                impostoRepository.getSettings(),
                {
                    appName: 'AM Gestão',
                    themeDefault: 'system',
                    fretePadraoPercent: 5.0,
                    faturamentoMensalPrevisto: 50000,
                    metasControlamFaturamento: true,
                    anexoProduto: 'I',
                    aliquotaProduto: 4.5,
                    anexoServico: 'III',
                    aliquotaServico: 6.0,
                }, 
                [], 
                [], 
                clienteAssessoriaRepository.list(),
            ]);

            setProdutos(produtosData);
            setCategorias(categoriasData.filter(c => c.ativo));
            setFornecedores(fornecedoresData);
            setClientes(clientesData);
            
            const context: FullPricingContext = {
                imposto: impostosData,
                categorias: categoriasData,
                configuracoes: configData as any,
                custosFixos: fixosData as any,
                custosVariaveis: variaveisData as any,
            };
            setPricingContext(context);
            
            const certamesFiltrados = clienteFiltroId ? certamesData.filter(c => c.empresaDestinoId === clienteFiltroId) : certamesData;
            setAllCertames(certamesFiltrados);

            const paramId = searchParams.get('id');
            const initialSelectionId = paramId ?? (keepSelection ? selectedCertame?.id : null);
            let certameToSelect = certamesFiltrados.find(c => c.id === initialSelectionId);

            if (!certameToSelect && certamesFiltrados.length > 0) {
                certameToSelect = certamesFiltrados[0];
            }

            if (certameToSelect) {
                const calculated = calculateCertamePricing(certameToSelect, context);
                setSelectedCertame(calculated);
                if (paramId !== certameToSelect.id) {
                    router.replace(`/precificacao-unificada?id=${certameToSelect.id}`, { scroll: false });
                }
            } else {
                setSelectedCertame(null);
                if (paramId) router.replace('/precificacao-unificada', { scroll: false });
            }

        } catch (e) {
            console.error("Erro ao carregar dados: ", e);
            toast({ title: 'Erro ao carregar dados', variant: 'destructive' });
        } finally {
            if (!keepSelection) setIsLoading(false);
        }
    }, [isUserLoading, clienteFiltroId, searchParams, router, selectedCertame?.id, toast]);

    React.useEffect(() => {
        loadData();
    }, [loadData]);
    
    const handleSelectCertame = (id: string) => {
        if (!pricingContext || !allCertames) return;
        const certame = allCertames.find(c => c.id === id);
        if (certame) {
            const calculated = calculateCertamePricing(certame, pricingContext);
            setSelectedCertame(calculated);
            router.replace(`/precificacao-unificada?id=${id}`, { scroll: false });
        }
    };

    const onDataChange = React.useCallback(async (newCertameId?: string) => {
        setIsRefreshing(true);
        try {
            if (newCertameId) {
                await loadData();
                return;
            }

            if (selectedCertame && pricingContext) {
                const updatedData = await certameUnificadoRepository.getById(selectedCertame.id);
                 if (updatedData) {
                    setAllCertames(prev => prev.map(c => c.id === updatedData.id ? updatedData : c));
                    const newCalculated = calculateCertamePricing(updatedData, pricingContext);
                    setSelectedCertame(newCalculated);
                } else {
                    await loadData();
                }
            } else {
                 await loadData();
            }
        } catch {
            toast({ title: 'Erro ao recarregar dados', variant: 'destructive' });
        } finally {
             setIsRefreshing(false);
        }
    }, [selectedCertame, pricingContext, toast, loadData]);

    const updateCertame = async (updatedCertame: CertameUnificado) => {
        await certameUnificadoRepository.update(updatedCertame.id, updatedCertame);
        onDataChange();
    }

    if ((isLoading || isUserLoading) && !selectedCertame) {
        return (
            <div className="space-y-6 animate-pulse">
                <Card><CardHeader><Skeleton className="h-8 w-1/2" /><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-10 w-full" /></CardContent></Card>
                <Card><CardHeader><Skeleton className="h-8 w-48" /></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-5 gap-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div></CardContent></Card>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <CertameSelector certames={allCertames} clientes={clientes} selectedCertame={selectedCertame} selectedClienteFiltroId={clienteFiltroId} onSelect={handleSelectCertame} onDataChange={onDataChange} onClienteFiltroChange={setClienteFiltroId} isLoading={isLoading} />
            {isRefreshing && selectedCertame && (
                <div className="flex items-center justify-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Atualizando dados...
                </div>
            )}
            {selectedCertame && pricingContext && (
                <div className="space-y-6">
                    <CertameHeader certame={selectedCertame} onUpdate={updateCertame} clientes={clientes} />
                    <ItensTable certame={selectedCertame} context={{produtos, categorias, fornecedores, clientes}} onUpdateCertame={updateCertame} />
                    <ExecucaoSection certame={selectedCertame} onDataChange={onDataChange} />
                </div>
            )}
            {!selectedCertame && !(isLoading || isUserLoading) && <Card><CardHeader><CardTitle>Nenhum Certame Selecionado</CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Selecione um certame ou crie um novo para começar.</p></CardContent></Card>}
        </div>
    );
}

function CertameSelector({ certames, clientes, selectedCertame, selectedClienteFiltroId, onSelect, onDataChange, onClienteFiltroChange, isLoading }: { certames: CertameUnificado[], clientes: any[], selectedCertame: CertameUnificado | null, selectedClienteFiltroId: string | null, onSelect: (id: string) => void, onDataChange: (newCertameId?: string) => void, onClienteFiltroChange: (id: string | null) => void, isLoading: boolean }) {
    const [formMode, setFormMode] = React.useState<'hidden' | 'new' | 'edit'>('hidden');
    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = React.useState(false);
    const router = useRouter();
    const { toast } = useToast();

    const handleSuccess = (newCertameId?: string) => { setFormMode('hidden'); onDataChange(newCertameId); };
    const handleDelete = async () => {
        if (!selectedCertame) return;
        try {
            await certameUnificadoRepository.delete(selectedCertame.id);
            toast({ title: "Certame excluído com sucesso!", variant: 'destructive' });
            router.replace('/precificacao-unificada');
            onDataChange();
        } catch { toast({ title: "Erro ao excluir certame.", variant: 'destructive' }); } finally { setIsDeleteAlertOpen(false); }
    };
    
    return (
        <Card>
            <CardHeader><CardTitle>Certames (Planilha)</CardTitle><CardDescription>Gerencie sua precificação e execução.</CardDescription></CardHeader>
            <CardContent>
                <div className="flex flex-col md:flex-row gap-2">
                    <Select onValueChange={(val) => onClienteFiltroChange(val === 'todos' ? null : val)} value={selectedClienteFiltroId ?? 'todos'}>
                        <SelectTrigger className="w-full md:w-[250px]"><SelectValue placeholder="Filtrar por empresa..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="todos">Todas as Empresas</SelectItem>
                            {clientes.filter(e => e.statusAtivo).map(e => <SelectItem key={e.id} value={e.id}>{e.nomeFantasia}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select onValueChange={onSelect} value={selectedCertame?.id ?? ''} disabled={isLoading || certames.length === 0}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione um certame..." /></SelectTrigger>
                        <SelectContent>
                            {certames.map(c => <SelectItem key={c.id} value={c.id}>{c.modalidade} {c.numeroAno} - {c.orgao}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {selectedCertame && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="outline" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => router.push(`/certames/${selectedCertame.id}`)}><ExternalLink className="mr-2 h-4 w-4" /> Ver Detalhes</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setFormMode('edit')}><Pencil className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setIsDeleteAlertOpen(true)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    <Button onClick={() => setFormMode('new')}><PlusCircle /> Novo Certame</Button>
                </div>
                <CertameFormDialog 
                    open={formMode !== 'hidden'} 
                    onOpenChange={(isOpen) => {
                        if (!isOpen) setTimeout(() => setFormMode('hidden'), 300);
                    }} 
                    onSuccess={handleSuccess} 
                    certameToEdit={formMode === 'edit' ? selectedCertame : null} 
                    clientes={clientes}
                />
                <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive">Excluir</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    )
}

function CertameHeader({ certame, onUpdate, clientes }: { certame: CertameComCalculo, onUpdate: (updatedCertame: CertameUnificado) => Promise<void>, clientes: any[] }) {
     const kpis = React.useMemo(() => {
        let valorPotencial = 0, lucroPotencial = 0, faturado = 0, pago = 0, lucroRealizadoMes = 0;
        const activeItems = certame.itens.filter(item => item.status !== 'PERDIDO');
        activeItems.forEach(item => { valorPotencial += item.metrics.precoFinalUnit * item.qtd; lucroPotencial += item.metrics.lucroTotal; });
        const hoje = new Date();
        certame.empenhos.forEach(empenho => {
            empenho.nfs.forEach(nf => {
                const { v, l } = nf.itens.reduce((ts, itemNF) => {
                    const ei = empenho.itens.find(e => e.id === itemNF.empenhoItemId);
                    if (ei) {
                        const pi = certame.itens.find(p => p.id === ei.precificacaoItemId);
                        const vItem = ei.precoVendaUnitSnapshot * itemNF.qtdNestaNF;
                        const cItem = ei.custoUnitSnapshot * itemNF.qtdNestaNF;
                        const iItem = vItem * ((pi?.aliquotaPct ?? 0) / 100);
                        ts.v += vItem; ts.l += (vItem - iItem - cItem);
                    }
                    return ts;
                }, { v: 0, l: 0 });
                faturado += v; if (nf.pago) pago += v;
                if (nf.dataNFISO && parseISO(nf.dataNFISO).getMonth() === hoje.getMonth() && parseISO(nf.dataNFISO).getFullYear() === hoje.getFullYear()) lucroRealizadoMes += l;
            });
        });
        return { valorPotencial, lucroPotencial, faturado, pago, saldoReceber: faturado - pago, lucroRealizadoMes };
    }, [certame]);
    
    return (
        <Card>
            <CardHeader><CardTitle>Resumo do Certame</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 text-sm">
                    <InfoKpi label="Valor Potencial" value={formatCurrency(kpis.valorPotencial)} />
                    <InfoKpi label="Lucro Potencial" value={formatCurrency(kpis.lucroPotencial)} />
                    <InfoKpi label="Lucro Realizado (Mês)" value={formatCurrency(kpis.lucroRealizadoMes)} />
                    <InfoKpi label="Total Faturado" value={formatCurrency(kpis.faturado)} />
                    <InfoKpi label="Saldo a Receber" value={formatCurrency(kpis.saldoReceber)} className={kpis.saldoReceber > 0 ? 'text-destructive' : 'text-green-600'}/>
                </div>
                <Separator />
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 text-sm items-start">
                    <div><p className="font-semibold text-muted-foreground">Órgão</p><p>{certame.orgao}</p></div>
                    <div><p className="font-semibold text-muted-foreground">Modalidade</p><p>{certame.modalidade} {certame.numeroAno}</p></div>
                    <div><p className="font-semibold text-muted-foreground">Status</p><p><Badge>{certame.status}</Badge></p></div>
                    <div><p className="font-semibold text-muted-foreground">Empresa</p><div className="flex items-center gap-1"><p className="truncate">{certame.empresaDestinoNome || 'N/A'}</p></div></div>
                    <div className="flex items-center space-x-2 pt-2"><Switch id="congelado" checked={certame.congelado} onCheckedChange={(c) => onUpdate({...certame, congelado: c})} /><Label htmlFor="congelado">Congelar</Label></div>
                </div>
            </CardContent>
        </Card>
    );
}

function InfoKpi({label, value, className}: {label: string, value: string, className?: string}) {
    return (<div className="p-3 bg-muted rounded-lg"><p className="text-muted-foreground text-xs">{label}</p><p className={cn("text-lg font-bold", className)}>{value}</p></div>);
}

interface ItensTableProps { certame: CertameComCalculo; context: { produtos: Produto[]; categorias: Categoria[]; fornecedores: Fornecedor[]; clientes: any[]; }; onUpdateCertame: (updatedCertame: CertameUnificado) => Promise<void>; }

function ItensTable({ certame, context, onUpdateCertame }: ItensTableProps) {
    const { toast } = useToast();
    const { user } = useUser();
    const [isItemFormOpen, setIsItemFormOpen] = React.useState(false);
    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = React.useState(false);
    const [isComposicaoOpen, setIsComposicaoOpen] = React.useState(false);
    const [editingItem, setEditingItem] = React.useState<ItemPrecificacao | null>(null);
    const [deletingItem, setDeletingItem] = React.useState<ItemPrecificacao | null>(null);
    const [composicaoItem, setComposicaoItem] = React.useState<(ItemPrecificacao & { metrics: CalculatedItemMetrics }) | null>(null);
    const [loteInputs, setLoteInputs] = React.useState<Record<number, string>>({});

    const { standaloneItems, itemsByLot } = React.useMemo(() => {
        const standalone: (ItemPrecificacao & { metrics: CalculatedItemMetrics })[] = [];
        const byLot = new Map<number, (ItemPrecificacao & { metrics: CalculatedItemMetrics })[]>();
        certame.itens.forEach(item => { const i = item as any as (ItemPrecificacao & { metrics: CalculatedItemMetrics }); if (i.loteNumero) { if (!byLot.has(i.loteNumero)) byLot.set(i.loteNumero, []); byLot.get(i.loteNumero)!.push(i); } else standalone.push(i); });
        return { standaloneItems: standalone, itemsByLot: new Map([...byLot.entries()].sort((a, b) => a[0] - b[0])) };
    }, [certame.itens]);
    
    const handleApplyLotValue = async (loteNumero: number) => {
        const targetTotal = parseCurrency(loteInputs[loteNumero] || '0');
        const items = itemsByLot.get(loteNumero);
        if (!items || items.length === 0 || targetTotal <= 0) return toast({ title: "Valor inválido", variant: "destructive" });

        const activeItems = items.filter(i => i.status !== 'PERDIDO');
        const currentTotal = activeItems.reduce((sum, i) => sum + (i.metrics.precoFinalUnit * i.qtd), 0);
        if (currentTotal === 0) return toast({ title: "Lote sem valor", variant: "destructive" });

        const factor = targetTotal / currentTotal;
        
        let sumOfNewTotals = 0;
        let heaviestIndexInLot = -1;
        let maxItemTotal = -1;

        const updatedItems = certame.itens.map((item, index) => {
            if (item.loteNumero !== loteNumero || item.status === 'PERDIDO') return item;
            
            const newUnit = Math.round((item.metrics.precoFinalUnit * factor) * 100) / 100;
            const newTotal = newUnit * item.qtd;
            
            sumOfNewTotals += newTotal;
            if (newTotal > maxItemTotal) { maxItemTotal = newTotal; heaviestIndexInLot = index; }
            
            return { 
                ...item, 
                status: 'GANHO' as const, 
                precoAnteriorAjusteLote: item.precoFinalVendidoReal || item.metrics.precoFinalUnit, 
                precoFinalVendidoReal: newUnit 
            };
        });

        if (heaviestIndexInLot !== -1) {
            const residual = targetTotal - sumOfNewTotals;
            const targetItem = updatedItems[heaviestIndexInLot];
            const currentItemTotal = targetItem.precoFinalVendidoReal! * targetItem.qtd;
            const adjustedItemTotal = currentItemTotal + residual;
            targetItem.precoFinalVendidoReal = Math.round((adjustedItemTotal / targetItem.qtd) * 10000) / 10000;
        }

        const novosAjustes = { 
            ...(certame.ajustesLotes || {}), 
            [loteNumero]: { 
                valorFinal: targetTotal, 
                aplicadoEm: new Date().toISOString(), 
                aplicadoPor: user?.uid || 'user', 
                modo: 'PROPORCIONAL' 
            } 
        };
        
        await onUpdateCertame({ ...certame, itens: updatedItems, ajustesLotes: novosAjustes });
        setLoteInputs(prev => ({ ...prev, [loteNumero]: '' }));
        toast({ title: `Lote ${loteNumero} ajustado com sucesso!` });
    };

    const handleUndoLotAdjustment = async (loteNumero: number) => {
        const updatedItems = certame.itens.map(i => i.loteNumero === loteNumero && i.precoAnteriorAjusteLote !== undefined ? { ...i, precoFinalVendidoReal: i.precoAnteriorAjusteLote, precoAnteriorAjusteLote: undefined } : i);
        const novosAjustes = { ...(certame.ajustesLotes || {}) }; delete novosAjustes[loteNumero];
        await onUpdateCertame({ ...certame, itens: updatedItems, ajustesLotes: novosAjustes });
        toast({ title: `Ajuste do Lote ${loteNumero} desfeito.` });
    };

    const columns: ColumnDef<ItemPrecificacao & { metrics: CalculatedItemMetrics }>[] = React.useMemo(() => [
        { accessorKey: 'itemNumero', header: 'Item' , cell: (row) => <span className={cn(row.status === 'PERDIDO' && 'text-muted-foreground line-through')}>{row.itemNumero}</span> },
        { accessorKey: 'descricao', header: 'Descrição', cell: (row) => <div className={cn("font-medium min-w-64 max-w-sm", row.status === 'PERDIDO' && 'text-muted-foreground line-through')}>{row.descricao}</div> },
        { accessorKey: 'unidade', header: 'UN', cell: (row) => row.unidade },
        { accessorKey: 'status', header: 'Status', cell: (row) => <Badge variant={row.status === 'GANHO' ? 'default' : row.status === 'PERDIDO' ? 'destructive' : 'secondary'} className={cn(row.status === 'GANHO' && 'bg-green-600')}>{row.status}</Badge> },
        { accessorKey: 'precoFinalUnit', header: 'Preço Final', align: 'right', cell: (row) => <div className="font-bold">{formatCurrency(row.metrics.precoFinalUnit)}</div> },
        { accessorKey: 'lucroTotal', header: 'Lucro Total', align: 'right', cell: (row) => <div className={cn(row.metrics.resultado === 'PREJUIZO' && 'text-destructive')}>{formatCurrency(row.metrics.lucroTotal)}</div> },
        { accessorKey: 'actions', header: 'Ações', align: 'right', cell: (row) => (
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => handleViewComposicao(row)}><Scale className="mr-2 h-4 w-4" />Composição</DropdownMenuItem><DropdownMenuItem onClick={() => handleEditItem(row)}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem><DropdownMenuItem onClick={() => handleDeleteItem(row)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        )},
    ], []);

    const handleNewItem = () => { setEditingItem(null); setIsItemFormOpen(true); };
    const handleEditItem = (item: ItemPrecificacao) => { setEditingItem(item); setIsItemFormOpen(true); };
    const handleDeleteItem = (item: ItemPrecificacao) => { setDeletingItem(item); setIsDeleteAlertOpen(true); };
    const handleViewComposicao = (item: ItemPrecificacao & { metrics: CalculatedItemMetrics }) => { setComposicaoItem(item); setIsComposicaoOpen(true); };
    const confirmDeleteItem = async () => { if (!deletingItem) return; await onUpdateCertame({ ...certame, itens: certame.itens.filter(i => i.id !== deletingItem.id) }); setIsDeleteAlertOpen(false); setDeletingItem(null); };

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Itens (Planilha)</CardTitle><CardDescription>Defina os preços base de cada item.</CardDescription></div><div className="flex gap-2"><Button variant="outline" onClick={() => generatePrecificacaoPdf(certame, context.fornecedores, context.clientes.find(c => c.id === certame.empresaDestinoId))}><FileDown /> PDF</Button><Button onClick={handleNewItem}><PlusCircle /> Novo Item</Button></div></CardHeader>
            <CardContent className="space-y-6">
                <div className="overflow-x-auto">
                    {standaloneItems.length > 0 && <div><h3 className="text-lg font-semibold mb-2">Itens Unitários</h3><DataTable columns={columns} data={standaloneItems} /></div>}
                    {[...itemsByLot.entries()].map(([loteNumero, items]) => {
                        const activeItems = items.filter(i => i.status !== 'PERDIDO');
                        const totalLote = activeItems.reduce((sum, i) => sum + (i.metrics.precoFinalUnit * i.qtd), 0);
                        const inputVal = parseCurrency(loteInputs[loteNumero] || '0');
                        const diff = inputVal > 0 ? inputVal - totalLote : 0;
                        const diffPct = inputVal > 0 && totalLote > 0 ? (diff / totalLote) * 100 : 0;
                        const hasAdj = items.some(i => i.precoAnteriorAjusteLote !== undefined);

                        return (
                            <div key={loteNumero} className="border rounded-lg p-4 bg-muted/30 space-y-4 mb-6">
                                <div className="flex flex-col lg:flex-row justify-between gap-4">
                                    <div><h3 className="text-xl font-bold">Lote {loteNumero}</h3><p className="text-sm">Total Atual: <strong className="text-primary">{formatCurrency(totalLote)}</strong></p></div>
                                    <div className="bg-background p-3 rounded-md border flex items-center gap-4">
                                        <div className="flex flex-col gap-1"><Label className="text-[10px] uppercase font-bold">Valor Final do Lote</Label>
                                            <div className="flex gap-2"><CurrencyInput className="h-8 w-32" value={inputVal || undefined} onChange={v => setLoteInputs(prev => ({...prev, [loteNumero]: v.toString()}))} /><Button size="sm" onClick={() => handleApplyLotValue(loteNumero)}><Check className="h-3 w-3 mr-1" /> Aplicar</Button>{hasAdj && <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleUndoLotAdjustment(loteNumero)}><RotateCcw className="h-3 w-3 mr-1" /> Desfazer</Button>}</div>
                                        </div>
                                        {inputVal > 0 && <div className="text-xs border-l pl-4"><p className="text-muted-foreground font-semibold">Preview Diferença:</p><p className={cn("font-bold", diff >= 0 ? "text-green-600" : "text-destructive")}>{formatCurrency(diff)} ({diffPct.toFixed(2)}%)</p></div>}
                                    </div>
                                </div>
                                <DataTable columns={columns} data={items} />
                            </div>
                        );
                    })}
                </div>
            </CardContent>
            <ItemFormDialog 
                open={isItemFormOpen} 
                onOpenChange={(o) => {
                    setIsItemFormOpen(o);
                    if (!o) setTimeout(() => setEditingItem(null), 300);
                }} 
                certame={certame} 
                item={editingItem} 
                context={context} 
                onSuccess={(it) => onUpdateCertame({ ...certame, itens: it })} 
            />
            <ComposicaoDialog 
                open={isComposicaoOpen} 
                onOpenChange={(o) => {
                    setIsComposicaoOpen(o);
                    if (!o) setTimeout(() => setComposicaoItem(null), 300);
                }} 
                item={composicaoItem} 
            />
            <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle><AlertDialogDescription>Excluir item?</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteItem} className="bg-destructive">Excluir</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}

function ExecucaoSection({ certame, onDataChange }: { certame: CertameComCalculo, onDataChange: () => void }) {
    const [isEmpenhoFormOpen, setIsEmpenhoFormOpen] = React.useState(false);
    const [selectedEmpenho, setSelectedEmpenho] = React.useState<Empenho | null>(null);
    const [editingEmpenho, setEditingEmpenho] = React.useState<Empenho | null>(null);
    
    const cols: ColumnDef<Empenho>[] = React.useMemo(() => [
        { accessorKey: 'numeroEmpenho', header: 'Nº Empenho', cell: (row) => <span className="font-medium">{row.numeroEmpenho}</span> },
        { accessorKey: 'dataSolicitacaoISO', header: 'Data', cell: (row) => <span>{formatDate(parseISO(row.dataSolicitacaoISO), 'dd/MM/yyyy')}</span> },
        { accessorKey: 'statusEntrega', header: 'Entrega', cell: (row) => (
            <Badge variant="secondary" className={cn(row.statusEntrega === 'CONCLUIDO' && 'bg-green-100 text-green-800')}>{row.statusEntrega}</Badge>
        )},
        { accessorKey: 'statusFinanceiro', header: 'Financeiro', cell: (row) => (
            <Badge variant="outline" className={cn(row.statusFinanceiro === 'PAGO' && 'border-green-600 text-green-600')}>{row.statusFinanceiro}</Badge>
        )},
        { id: 'v', header: 'Valor Total', align: 'right', cell: (row) => <span className="font-bold">{formatCurrency(row.itens.reduce((a, i) => a + (i.precoVendaUnitSnapshot * i.qtdEmpenhada), 0))}</span> },
        { accessorKey: 'actions', header: 'Ações', align: 'right', cell: (row) => (
            <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setSelectedEmpenho(row)}><Info className="mr-2 h-4 w-4" /> Detalhes / Gerenciar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditingEmpenho(row)}><Pencil className="mr-2 h-4 w-4" /> Editar Empenho</DropdownMenuItem>
                    <DropdownMenuItem onClick={async () => { await empenhoRepository.delete(certame.id, row.id); onDataChange(); }} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        ) },
    ], [certame.id, onDataChange]);

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between pb-2 space-y-0">
                <div className="space-y-0.5">
                    <CardTitle className="text-lg leading-none">Execução (Empenhos & NF)</CardTitle>
                    <CardDescription className="text-xs leading-none">Gerenciamento de ordens de compra e faturamentos.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsEmpenhoFormOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Novo
                </Button>
            </CardHeader>
            <CardContent className="p-0 pt-2">
                <div className="overflow-x-auto">
                    <DataTable columns={cols} data={certame.empenhos} />
                </div>
            </CardContent>
            <EmpenhoFormDialog open={isEmpenhoFormOpen} onOpenChange={setIsEmpenhoFormOpen} certame={certame} onSuccess={onDataChange} />
            <EmpenhoFormDialog 
                open={!!editingEmpenho} 
                onOpenChange={(o) => {
                    if (!o) setTimeout(() => setEditingEmpenho(null), 300);
                }} 
                certame={certame} 
                empenhoToEdit={editingEmpenho}
                onSuccess={onDataChange} 
            />
            <EmpenhoDetailDialog 
                open={!!selectedEmpenho} 
                onOpenChange={(o) => {
                    if (!o) setTimeout(() => setSelectedEmpenho(null), 300);
                }} 
                certame={certame} 
                empenho={selectedEmpenho} 
                onDataChange={onDataChange} 
            />
        </Card>
    );
}

const itemFormSchema = z.object({
  itemNumero: z.number().min(1),
  loteNumero: z.number().optional().nullable(),
  descricao: z.string().min(1),
  categoriaId: z.string().min(1),
  status: z.enum(['PENDENTE', 'GANHO', 'PERDIDO']),
  unidade: z.string().min(1),
  qtd: z.number().min(0.0001),
  custoUnitBase: z.number().min(0),
  margemManualPct: z.number().min(0).optional().nullable(),
  tipoItem: z.enum(['PRODUTO', 'SERVICO']),
  anexoSimples: z.enum(["I","II","III","IV","V"]),
  aliquotaPct: z.number().min(0),
  precoReferencia: z.number().optional().nullable(),
  precoFinalVendidoReal: z.number().optional().nullable(),
});
type ItemFormValues = z.infer<typeof itemFormSchema>;

function ItemFormDialog({ open, onOpenChange, certame, item, context, onSuccess }: { open: boolean, onOpenChange: (open: boolean) => void, certame: CertameComCalculo, item: ItemPrecificacao | null, context: ItensTableProps['context'], onSuccess: (updatedItems: ItemPrecificacao[]) => Promise<void> }) {
    const [isSaving, setIsSaving] = React.useState(false);
    const { toast } = useToast();
    const [impostoSettings, setImpostoSettings] = React.useState<any>(null);
    
    React.useEffect(() => { impostoRepository.getSettings().then(setImpostoSettings); }, []);
    
    const form = useForm<ItemFormValues>({ 
        resolver: zodResolver(itemFormSchema), 
        defaultValues: item ? { ...item, precoFinalVendidoReal: item.precoFinalVendidoReal ?? null, loteNumero: item.loteNumero ?? null } : { itemNumero: (certame.itens.length > 0 ? Math.max(...certame.itens.map(i => i.itemNumero)) : 0) + 1, loteNumero: null, descricao: '', categoriaId: '', status: 'PENDENTE', unidade: '', qtd: 1, custoUnitBase: 0, tipoItem: 'PRODUTO', anexoSimples: 'I', aliquotaPct: 4.5 } 
    });

    React.useEffect(() => {
        if (open) {
            form.reset(item ? { ...item, precoFinalVendidoReal: item.precoFinalVendidoReal ?? null, loteNumero: item.loteNumero ?? null } : { itemNumero: (certame.itens.length > 0 ? Math.max(...certame.itens.map(i => i.itemNumero)) : 0) + 1, loteNumero: null, descricao: '', categoriaId: '', status: 'PENDENTE', unidade: '', qtd: 1, custoUnitBase: 0, tipoItem: 'PRODUTO', anexoSimples: 'I', aliquotaPct: 4.5 });
        }
    }, [open, item, certame.itens, form]);

    const wt = form.watch('tipoItem'), ws = form.watch('status');
    
    React.useEffect(() => { 
        if (!impostoSettings) return; 
        if (wt === 'PRODUTO') { 
            form.setValue('anexoSimples', impostoSettings.anexoProduto); 
            form.setValue('aliquotaPct', impostoSettings.aliquotaProduto); 
        } else { 
            form.setValue('anexoSimples', impostoSettings.anexoServico); 
            form.setValue('aliquotaPct', impostoSettings.aliquotaServico); 
        } 
    }, [wt, form, impostoSettings]);

    const onSubmit = async (v: ItemFormValues) => {
        setIsSaving(true);
        try {
            let its: ItemPrecificacao[];
            const safeV = { ...v, loteNumero: v.loteNumero ?? undefined, margemManualPct: v.margemManualPct ?? undefined, precoReferencia: v.precoReferencia ?? undefined };
            if (item) its = certame.itens.map(i => i.id === item.id ? { ...i, ...safeV } as ItemPrecificacao : i);
            else its = [...certame.itens, { ...safeV, id: crypto.randomUUID(), freteUnitario: 0, custoFixoRateadoUnit: 0 } as ItemPrecificacao];
            await onSuccess(its); 
            toast({ title: item ? 'Item atualizado!' : 'Item adicionado!' }); 
            onOpenChange(false);
        } catch { 
            toast({ title: 'Erro ao salvar', variant: 'destructive' }); 
        } finally { 
            setIsSaving(false); 
        }
    };

    return (
        <FormDialog open={open} onOpenChange={onOpenChange} title={item ? "Editar Item" : "Novo Item"} formId="item-form" isSaving={isSaving}>
             <Form {...form}>
                <form id="item-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    {ws === 'GANHO' && (
                        <Card className="bg-amber-50 border-amber-200">
                            <CardHeader><CardTitle className="text-lg">Preço de Venda Vencedor</CardTitle></CardHeader>
                            <CardContent>
                                <FormField control={form.control} name="precoFinalVendidoReal" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Preço Unitário Vencedor*</FormLabel>
                                        <FormControl>
                                            <CurrencyInput value={field.value ?? undefined} onChange={v => field.onChange(v)} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            </CardContent>
                        </Card>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="itemNumero" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Nº Item*</FormLabel>
                                <FormControl>
                                    <Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="loteNumero" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Nº Lote</FormLabel>
                                <FormControl>
                                    <Input type="number" {...field} onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)} value={field.value ?? ''} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </div>
                    <FormField control={form.control} name="descricao" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Descrição*</FormLabel>
                            <FormControl>
                                <Textarea {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="categoriaId" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Categoria*</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione..." />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {context.categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="unidade" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Unidade*</FormLabel>
                                <FormControl>
                                    <Input {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </div>
                    <FormField control={form.control} name="status" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Status*</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="PENDENTE">PENDENTE</SelectItem>
                                    <SelectItem value="GANHO">GANHO</SelectItem>
                                    <SelectItem value="PERDIDO">PERDIDO</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <div className="grid grid-cols-3 gap-4">
                        <FormField control={form.control} name="tipoItem" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo*</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue/>
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="PRODUTO">Produto</SelectItem>
                                        <SelectItem value="SERVICO">Serviço</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="anexoSimples" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Anexo*</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue/>
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {["I","II","III","IV","V"].map(a => <SelectItem key={a} value={a}>{`Anexo ${a}`}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="aliquotaPct" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Alíquota (%)*</FormLabel>
                                <FormControl>
                                    <PercentInput value={field.value} onChange={field.onChange} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </div>
                    <Separator />
                    <FormField control={form.control} name="qtd" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Quantidade*</FormLabel>
                            <FormControl>
                                <DecimalInput value={field.value} onChange={field.onChange} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="custoUnitBase" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Custo Unitário Base*</FormLabel>
                            <FormControl>
                                <CurrencyInput value={field.value} onChange={field.onChange} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="margemManualPct" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Margem Manual (%)</FormLabel>
                            <FormControl>
                                <PercentInput value={field.value} onChange={v => field.onChange(v === 0 ? null : v)} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="precoReferencia" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Preço Ref.</FormLabel>
                            <FormControl>
                                <CurrencyInput value={field.value ?? undefined} onChange={v => field.onChange(v === 0 ? null : v)} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                </form>
            </Form>
        </FormDialog>
    );
}

function ComposicaoDialog({ open, onOpenChange, item: incomingItem }: { open: boolean; onOpenChange: (open: boolean) => void; item: (ItemPrecificacao & { metrics: CalculatedItemMetrics }) | null }) {
    const lastValidItem = React.useRef<(ItemPrecificacao & { metrics: CalculatedItemMetrics }) | null>(incomingItem);
    if (incomingItem) lastValidItem.current = incomingItem;
    const item = incomingItem || lastValidItem.current;

    if (!item) return <Dialog open={open} onOpenChange={onOpenChange}></Dialog>;

    const m = item.metrics;
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Composição do Item {item.itemNumero}</DialogTitle>
                    <DialogDescription>{item.descricao}</DialogDescription>
                </DialogHeader>
                <div className="pt-4">
                    <Table>
                        <TableBody>
                            <TableRow><TableCell>Receita Bruta</TableCell><TableCell className="text-right">{formatCurrency(m.precoFinalUnit)}</TableCell></TableRow>
                            <TableRow><TableCell>(-) Impostos ({m.aliquotaImpostoPercent.toFixed(2)}%)</TableCell><TableCell className="text-right">{formatCurrency(m.impostoUnit)}</TableCell></TableRow>
                            <TableRow className="font-bold"><TableCell>(=) Receita Líquida</TableCell><TableCell className="text-right">{formatCurrency(m.precoLiquidoUnit)}</TableCell></TableRow>
                            <TableRow><TableCell>(-) Custos Totais (Base+Frete+Overhead)</TableCell><TableCell className="text-right">{formatCurrency(m.custoTotalUnit)}</TableCell></TableRow>
                            <TableRow className={cn("font-bold", m.resultado === 'PREJUIZO' && "text-destructive")}><TableCell>(=) Lucro/Prejuízo</TableCell><TableCell className="text-right">{formatCurrency(m.lucroUnit)}</TableCell></TableRow>
                            <TableRow><TableCell>Margem Líquida</TableCell><TableCell className="text-right font-semibold">{m.margemAplicadaPercent.toFixed(2)}%</TableCell></TableRow>
                        </TableBody>
                    </Table>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Voltar</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

const empenhoFormSchema = z.object({ 
    numeroEmpenho: z.string().min(1, 'O número é obrigatório.'), 
    orgao: z.string().min(1, 'O órgão é obrigatório.'), 
    dataSolicitacaoISO: z.date({ required_error: 'A data é obrigatória.' }), 
    prazoEntregaDias: z.number().min(0, 'Prazo inválido.'), 
    tipoEmpenho: z.enum(["SRP", "CONTRATO_UNICO", "ENTREGA_TOTAL", "OUTRO"]),
    statusEntrega: z.enum(['NAO_INICIADO', 'PARCIAL', 'CONCLUIDO', 'ATRASADO']),
    statusFinanceiro: z.enum(['PENDENTE', 'FATURADO', 'PARCIAL', 'PAGO'])
});

function EmpenhoFormDialog({ open, onOpenChange, certame, empenhoToEdit, onSuccess }: { open: boolean, onOpenChange: (o: boolean) => void, certame: CertameUnificado, empenhoToEdit?: Empenho | null, onSuccess: () => void }) {
    const { toast } = useToast();
    const [isSaving, setIsSaving] = React.useState(false);
    
    const form = useForm<z.infer<typeof empenhoFormSchema>>({ 
        resolver: zodResolver(empenhoFormSchema), 
        defaultValues: empenhoToEdit ? {
            ...empenhoToEdit,
            dataSolicitacaoISO: parseISO(empenhoToEdit.dataSolicitacaoISO)
        } : { 
            numeroEmpenho: '', 
            orgao: certame.orgao, 
            dataSolicitacaoISO: new Date(), 
            prazoEntregaDias: 30, 
            tipoEmpenho: 'SRP',
            statusEntrega: 'NAO_INICIADO',
            statusFinanceiro: 'PENDENTE'
        } 
    });

    React.useEffect(() => {
        if (open) {
            form.reset(empenhoToEdit ? {
                ...empenhoToEdit,
                dataSolicitacaoISO: parseISO(empenhoToEdit.dataSolicitacaoISO)
            } : { 
                numeroEmpenho: '', 
                orgao: certame.orgao, 
                dataSolicitacaoISO: new Date(), 
                prazoEntregaDias: 30, 
                tipoEmpenho: 'SRP',
                statusEntrega: 'NAO_INICIADO',
                statusFinanceiro: 'PENDENTE'
            });
        }
    }, [open, empenhoToEdit, certame.orgao, form]);

    const onSubmit = async (v: any) => { 
        setIsSaving(true); 
        try { 
            const data = { ...v, dataSolicitacaoISO: formatDate(v.dataSolicitacaoISO, 'yyyy-MM-dd') };
            if (empenhoToEdit) {
                await empenhoRepository.update(certame.id, empenhoToEdit.id, data);
                toast({ title: 'Empenho atualizado!' }); 
            } else {
                await empenhoRepository.add(certame.id, { ...data, itens: [] }); 
                toast({ title: 'Empenho criado!' }); 
            }
            onSuccess(); 
            onOpenChange(false); 
        } catch { 
            toast({ title: 'Erro ao salvar empenho', variant: 'destructive' }); 
        } finally { 
            setIsSaving(false); 
        } 
    };

    return (
        <FormDialog open={open} onOpenChange={onOpenChange} title={empenhoToEdit ? "Editar Empenho" : "Novo Empenho"} formId="e-form" isSaving={isSaving}>
            <Form {...form}>
                <form id="e-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="numeroEmpenho" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Nº Empenho*</FormLabel>
                                <FormControl>
                                    <Input {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="tipoEmpenho" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo*</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="SRP">SRP</SelectItem>
                                        <SelectItem value="CONTRATO_UNICO">Contrato Único</SelectItem>
                                        <SelectItem value="ENTREGA_TOTAL">Entrega Total</SelectItem>
                                        <SelectItem value="OUTRO">Outro</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </div>
                    <FormField control={form.control} name="orgao" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Órgão Solicitante*</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="dataSolicitacaoISO" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Data da Solicitação*</FormLabel>
                                <FormControl>
                                    <Input type="date" value={field.value ? formatDate(field.value, 'yyyy-MM-dd') : ''} onChange={e => field.onChange(parseISO(e.target.value))} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="prazoEntregaDias" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Prazo Entrega (Dias)*</FormLabel>
                                <FormControl>
                                    <Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="statusEntrega" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Status Entrega*</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="NAO_INICIADO">Não Iniciado</SelectItem>
                                        <SelectItem value="PARCIAL">Parcial</SelectItem>
                                        <SelectItem value="CONCLUIDO">Concluído</SelectItem>
                                        <SelectItem value="ATRASADO">Atrasado</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="statusFinanceiro" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Status Financeiro*</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="PENDENTE">Pendente</SelectItem>
                                        <SelectItem value="FATURADO">Faturado</SelectItem>
                                        <SelectItem value="PARCIAL">Parcial</SelectItem>
                                        <SelectItem value="PAGO">Pago</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </div>
                </form>
            </Form>
        </FormDialog>
    );
}

function EmpenhoDetailDialog({ open, onOpenChange, certame, empenho: incomingEmpenho, onDataChange }: { open: boolean; onOpenChange: (o: boolean) => void; certame: CertameComCalculo, empenho: Empenho | null; onDataChange: () => void; }) {
    const lastValidEmpenho = React.useRef<Empenho | null>(incomingEmpenho);
    if (incomingEmpenho) lastValidEmpenho.current = incomingEmpenho;
    
    const empenho = incomingEmpenho || lastValidEmpenho.current;

    const summary = React.useMemo(() => {
        if (!empenho) return { totalValue: 0, totalFaturado: 0, saldo: 0, totalItens: 0, totalQtd: 0, itensPendentes: 0, itensParciais: 0, itensConcluidos: 0, qtdEntregue: 0, qtdPendente: 0 };
        const totalValue = empenho.itens.reduce((acc, i) => acc + (i.precoVendaUnitSnapshot * i.qtdEmpenhada), 0);
        const totalFaturado = empenho.nfs.reduce((acc, nf) => acc + nf.itens.reduce((nfAcc, nfItem) => {
            const ei = empenho.itens.find(e => e.id === nfItem.empenhoItemId);
            return nfAcc + (nfItem.qtdNestaNF * (ei?.precoVendaUnitSnapshot || 0));
        }, 0), 0);
        const saldo = totalValue - totalFaturado;
        const totalItens = empenho.itens.length;
        const totalQtd = empenho.itens.reduce((acc, i) => acc + i.qtdEmpenhada, 0);

        const qtdEntregue = empenho.itens.reduce((acc, i) => acc + i.qtdEntregue, 0);
        const qtdPendente = totalQtd - qtdEntregue;

        const itensPendentes = empenho.itens.filter(i => i.qtdEntregue === 0).length;
        const itensConcluidos = empenho.itens.filter(i => i.qtdEntregue >= i.qtdEmpenhada).length;
        const itensParciais = empenho.itens.filter(i => i.qtdEntregue > 0 && i.qtdEntregue < i.qtdEmpenhada).length;

        return { totalValue, totalFaturado, saldo, totalItens, totalQtd, qtdEntregue, qtdPendente, itensPendentes, itensParciais, itensConcluidos };
    }, [empenho]);

    if (!empenho) return <Dialog open={open} onOpenChange={onOpenChange}></Dialog>;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-4 border-b">
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                        <div>
                            <DialogTitle className="text-2xl flex items-center gap-2"><ShoppingCart className="h-6 w-6 text-primary" /> Empenho: {empenho.numeroEmpenho}</DialogTitle>
                            <DialogDescription>Órgão: {empenho.orgao}</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 min-h-0 flex flex-col">
                    <Tabs defaultValue="itens" className="h-full flex flex-col">
                        <div className="px-6 border-b"><TabsList className="bg-transparent h-12 w-full justify-start gap-4"><TabsTrigger value="itens" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-semibold">Itens do Empenho</TabsTrigger><TabsTrigger value="nfs" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-semibold">Execução (NFs)</TabsTrigger><TabsTrigger value="info" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-semibold">Informações do Empenho</TabsTrigger></TabsList></div>
                        <div className="flex-1 overflow-hidden">
                            <TabsContent value="itens" className="h-full data-[state=active]:flex flex-col m-0"><ScrollArea className="flex-1 min-h-0"><div className="p-6 h-full min-h-[500px]"><ItensEmpenhoTab certameId={certame.id} empenho={empenho} certameItens={certame.itens} summary={summary} onDataChange={onDataChange} /></div></ScrollArea></TabsContent>
                            <TabsContent value="nfs" className="h-full data-[state=active]:flex flex-col m-0"><ScrollArea className="flex-1 min-h-0"><div className="p-6 h-full min-h-[500px]"><EntregasNFTab certameId={certame.id} empenho={empenho} onDataChange={onDataChange} /></div></ScrollArea></TabsContent>
                            <TabsContent value="info" className="h-full data-[state=active]:flex flex-col m-0">
                                <ScrollArea className="h-full">
                                    <div className="p-6 space-y-6">
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-4 text-sm bg-muted/30 p-4 rounded-lg border">
                                            <div className="flex flex-col gap-1 items-start"><span className="text-muted-foreground uppercase text-[10px] font-bold">Tipo</span><span className="font-semibold text-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> {empenho.tipoEmpenho}</span></div>
                                            <div className="flex flex-col gap-1 items-start"><span className="text-muted-foreground uppercase text-[10px] font-bold">Data Solicitação</span><span className="font-semibold text-foreground flex items-center gap-2"><CalendarIcon className="h-4 w-4" /> {formatDate(parseISO(empenho.dataSolicitacaoISO), 'dd/MM/yyyy')}</span></div>
                                            <div className="flex flex-col gap-1 items-start"><span className="text-muted-foreground uppercase text-[10px] font-bold">Prazo Final</span><span className="font-semibold text-foreground flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {formatDate(addDays(parseISO(empenho.dataSolicitacaoISO), empenho.prazoEntregaDias), 'dd/MM/yyyy')}</span></div>
                                            <div className="flex flex-col gap-1 items-start"><span className="text-muted-foreground uppercase text-[10px] font-bold">Status de Entrega</span><Badge variant="secondary" className="h-6 mt-1">{empenho.statusEntrega}</Badge></div>
                                            <div className="flex flex-col gap-1 items-start"><span className="text-muted-foreground uppercase text-[10px] font-bold">Status Financeiro</span><Badge variant="outline" className="h-6 mt-1">{empenho.statusFinanceiro}</Badge></div>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div className="p-6 bg-background rounded-lg border shadow-sm flex items-center gap-4"><div className="bg-primary/10 p-4 rounded-full"><ShoppingCart className="h-8 w-8 text-primary" /></div><div><p className="text-xs text-muted-foreground uppercase font-bold">Valor Total</p><p className="text-2xl font-bold">{formatCurrency(summary.totalValue)}</p></div></div>
                                            <div className="p-6 bg-background rounded-lg border shadow-sm flex items-center gap-4"><div className="bg-green-100 p-4 rounded-full"><Receipt className="h-8 w-8 text-green-600" /></div><div><p className="text-xs text-muted-foreground uppercase font-bold">Total Faturado</p><p className="text-2xl font-bold text-green-600">{formatCurrency(summary.totalFaturado)}</p></div></div>
                                            <div className="p-6 bg-background rounded-lg border shadow-sm flex items-center gap-4"><div className="bg-destructive/10 p-4 rounded-full"><AlertCircle className="h-8 w-8 text-destructive" /></div><div><p className="text-xs text-muted-foreground uppercase font-bold">Saldo a Receber</p><p className="text-2xl font-bold text-destructive">{formatCurrency(summary.saldo)}</p></div></div>
                                            <div className="p-6 bg-background rounded-lg border shadow-sm flex items-center gap-4"><div className="bg-amber-100 p-4 rounded-full"><Clock className="h-8 w-8 text-amber-600" /></div><div><p className="text-xs text-muted-foreground uppercase font-bold">Itens Pendentes</p><p className="text-2xl font-bold text-amber-600">{summary.itensPendentes}</p></div></div>
                                        </div>
                                    </div>
                                </ScrollArea>
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>
                
                <DialogFooter className="p-6 border-t bg-muted/10"><Button variant="outline" onClick={() => onOpenChange(false)}>Voltar para a Planilha</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function ItensEmpenhoTab({ certameId, empenho, certameItens, summary, onDataChange }: { certameId: string, empenho: Empenho; certameItens: any[], summary: any, onDataChange: () => void; }) {
    const [isImportOpen, setIsImportOpen] = React.useState(false);
    
    const cols: ColumnDef<EmpenhoItem>[] = [
        { accessorKey: 'descricaoSnapshot', header: 'Descrição', cell: (row) => <span className="font-medium">{row.descricaoSnapshot}</span> },
        { accessorKey: 'unidadeSnapshot', header: 'UN', align: 'center', cell: (row) => <span>{row.unidadeSnapshot}</span> },
        { accessorKey: 'qtdEmpenhada', header: 'Qtd Emp.', align: 'right', cell: (row) => <span>{row.qtdEmpenhada}</span> },
        { accessorKey: 'qtdEntregue', header: 'Entregue', align: 'right', cell: (row) => <span className={cn(row.qtdEntregue === row.qtdEmpenhada ? "text-green-600 font-bold" : "")}>{row.qtdEntregue}</span> },
        { accessorKey: 'qtdSaldo', header: 'Saldo', align: 'right', cell: (row) => <span className={cn(row.qtdEmpenhada - row.qtdEntregue > 0 ? "text-destructive font-bold" : "")}>{row.qtdEmpenhada - row.qtdEntregue}</span> },
        { accessorKey: 'precoVendaUnitSnapshot', header: 'Venda Unit.', align: 'right', cell: (row) => <span>{formatCurrency(row.precoVendaUnitSnapshot)}</span> },
        { id: 'total', header: 'Total Item', align: 'right', cell: (row) => <span className="font-bold">{formatCurrency(row.precoVendaUnitSnapshot * row.qtdEmpenhada)}</span> },
        { id: 'statusOp', header: 'Status Operacional', align: 'center', cell: (row) => {
            const isConcluido = row.qtdEntregue >= row.qtdEmpenhada;
            const isParcial = row.qtdEntregue > 0 && !isConcluido;
            const isPendente = row.qtdEntregue === 0;
            return (
                <div className="flex justify-center">
                    {isConcluido && <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200">Concluído</Badge>}
                    {isParcial && <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200">Parcial</Badge>}
                    {isPendente && <Badge className="bg-muted text-muted-foreground hover:bg-muted border-muted-foreground/30 text-nowrap">Pendente</Badge>}
                </div>
            )
        }}
    ];

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="shrink-0 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-muted/10 p-4 rounded-lg border border-dashed">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-x-6 gap-y-2 w-full">
                    <div><p className="text-[10px] text-muted-foreground uppercase font-bold">Total Itens</p><p className="text-lg font-bold">{summary.totalItens}</p></div>
                    <div><p className="text-[10px] text-muted-foreground uppercase font-bold">Pendentes / Parciais</p><p className="text-lg font-bold">
                        <span className="text-destructive">{summary.itensPendentes}</span> <span className="text-muted-foreground text-sm font-normal mx-1">/</span> <span className="text-amber-500">{summary.itensParciais}</span>
                    </p></div>
                    <div><p className="text-[10px] text-muted-foreground uppercase font-bold">Itens Concluídos</p><p className="text-lg font-bold text-green-600">{summary.itensConcluidos}</p></div>
                    
                    <div className="col-span-2 md:col-span-1"><p className="text-[10px] text-muted-foreground uppercase font-bold">Volume Entregue</p><p className="text-lg font-bold text-primary">{summary.qtdEntregue} <span className="text-xs text-muted-foreground font-normal">/ {summary.totalQtd} un.</span></p></div>
                    <div className="col-span-2 md:col-span-1"><p className="text-[10px] text-muted-foreground uppercase font-bold">Volume Restante</p><p className="text-lg font-bold text-destructive">{summary.qtdPendente} <span className="text-xs text-muted-foreground font-normal">un.</span></p></div>
                    <div><p className="text-[10px] text-muted-foreground uppercase font-bold">Valor Total</p><p className="text-lg font-bold text-primary">{formatCurrency(summary.totalValue)}</p></div>
                </div>
                <Button onClick={() => setIsImportOpen(true)} size="sm" className="shrink-0"><PlusCircle className="mr-2 h-4 w-4" /> Importar da Planilha</Button>
            </div>
            
            <div className="flex-1 overflow-x-auto overflow-y-hidden border rounded-md min-h-0">
                <div className="h-full overflow-y-auto">
                    <DataTable columns={cols} data={empenho.itens} emptyStateMessage="Nenhum item importado ainda." />
                </div>
            </div>
            
            <ImportarItensDialog 
                open={isImportOpen} 
                onOpenChange={setIsImportOpen} 
                certameItens={certameItens} 
                empenho={empenho} 
                onSuccess={async (it) => { 
                    await empenhoRepository.update(certameId, empenho.id, { ...empenho, itens: it }); 
                    onDataChange(); 
                }} 
            />
        </div>
    );
}

function EntregasNFTab({ certameId, empenho, onDataChange }: { certameId: string; empenho: Empenho; onDataChange: () => void; }) {
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [editingNF, setEditingNF] = React.useState<NotaFiscal | null>(null);
    
    const syncEmpenho = async (updatedNFs: NotaFiscal[]) => {
        const updatedItens = empenho.itens.map(item => {
            const totalEntregue = updatedNFs.reduce((sum, nf) => {
                const nfItem = nf.itens.find(ni => ni.empenhoItemId === item.id);
                return sum + (nfItem?.qtdNestaNF || 0);
            }, 0);
            return {
                ...item,
                qtdEntregue: totalEntregue,
                qtdSaldo: item.qtdEmpenhada - totalEntregue
            };
        });

        const totalEmpenhada = updatedItens.reduce((sum, i) => sum + i.qtdEmpenhada, 0);
        const totalEntregueGeral = updatedItens.reduce((sum, i) => sum + i.qtdEntregue, 0);

        let statusEntrega: Empenho['statusEntrega'] = 'NAO_INICIADO';
        if (totalEmpenhada > 0) {
            if (totalEntregueGeral >= totalEmpenhada) {
                statusEntrega = 'CONCLUIDO';
            } else if (totalEntregueGeral > 0) {
                statusEntrega = 'PARCIAL';
            }
        }

        let statusFinanceiro: Empenho['statusFinanceiro'] = 'PENDENTE';
        if (updatedNFs.length > 0) {
            const todasPagas = updatedNFs.every(n => n.pago);
            const algumasPagas = updatedNFs.some(n => n.pago);
            if (todasPagas) statusFinanceiro = 'PAGO';
            else if (algumasPagas) statusFinanceiro = 'PARCIAL';
            else statusFinanceiro = 'FATURADO';
        }

        await empenhoRepository.update(certameId, empenho.id, {
            itens: updatedItens,
            statusEntrega,
            statusFinanceiro
        });
    };

    const cols: ColumnDef<NotaFiscal>[] = [
        { accessorKey: 'numeroNF', header: 'Descrição (Nº NF)', cell: (row) => <span className="font-bold">{row.numeroNF}</span> },
        { accessorKey: 'dataNFISO', header: 'Data Emissão', cell: (row) => <span>{formatDate(parseISO(row.dataNFISO), 'dd/MM/yyyy')}</span> },
        { id: 'valor', header: 'Valor Total', align: 'right', cell: (row) => { 
            const valor = row.itens.reduce((acc, itemNF) => { 
                const ei = empenho.itens.find(e => e.id === itemNF.empenhoItemId); 
                return acc + (itemNF.qtdNestaNF * (ei?.precoVendaUnitSnapshot || 0)); 
            }, 0); 
            return <span className="font-bold">{formatCurrency(valor)}</span> 
        }},
        { accessorKey: 'pago', header: 'Status Pagamento', cell: (row) => (
            <Badge variant={row.pago ? 'default' : 'secondary'} className={cn(row.pago && "bg-green-600")}>
                {row.pago ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Clock className="mr-1 h-3 w-3" />}
                {row.pago ? 'Pago' : 'Pendente'}
            </Badge>
        )},
        { accessorKey: 'dataPagamentoISO', header: 'Data Pagamento', cell: (row) => row.dataPagamentoISO ? formatDate(parseISO(row.dataPagamentoISO), 'dd/MM/yyyy') : '-' },
        { accessorKey: 'actions', header: 'Ações', align: 'right', cell: (row) => (
            <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewingNF(row)}>
                    <Eye className="h-4 w-4 mr-2" /> Itens
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingNF(row)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={async () => { 
                    await nfRepository.delete(certameId, empenho.id, row.id); 
                    const remainingNFs = empenho.nfs.filter(n => n.id !== row.id);
                    await syncEmpenho(remainingNFs);
                    onDataChange(); 
                }} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
            </div>
        )}
    ];

    const [viewingNF, setViewingNF] = React.useState<NotaFiscal | null>(null);

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="shrink-0 flex justify-between items-center">
                <h3 className="font-semibold flex items-center gap-2"><Receipt className="h-4 w-4" /> Notas Fiscais Lançadas</h3>
                <Button onClick={() => setIsFormOpen(true)} size="sm" variant="default" disabled={empenho.itens.length === 0}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Lançar Nova NF
                </Button>
            </div>
            
            <div className="flex-1 overflow-x-auto overflow-y-hidden border rounded-md min-h-0">
                <div className="h-full overflow-y-auto">
                    <DataTable columns={cols} data={empenho.nfs} emptyStateMessage="Nenhuma Nota Fiscal lançada para este empenho." />
                </div>
            </div>
            
            <NotaFiscalDialog 
                open={isFormOpen} 
                onOpenChange={setIsFormOpen} 
                empenho={empenho} 
                onSuccess={async (nf) => { 
                    await nfRepository.add(certameId, empenho.id, nf); 
                    const updatedNFs = [...empenho.nfs, nf];
                    await syncEmpenho(updatedNFs);
                    onDataChange(); 
                }} 
            />
            <NotaFiscalDialog 
                open={!!editingNF} 
                onOpenChange={(o) => {
                    if (!o) setTimeout(() => setEditingNF(null), 300);
                }} 
                empenho={empenho}
                nfToEdit={editingNF} 
                onSuccess={async (updatedData) => { 
                    if (!editingNF) return;
                    await nfRepository.update(certameId, empenho.id, editingNF.id, updatedData); 
                    const updatedNFs = empenho.nfs.map(n => n.id === editingNF.id ? { ...n, ...updatedData } : n);
                    await syncEmpenho(updatedNFs);
                    onDataChange(); 
                    setEditingNF(null); 
                }} 
            />

            <Dialog open={!!viewingNF} onOpenChange={(o) => { if (!o) setViewingNF(null); }}>
                {viewingNF && (
                    <DialogContent className="max-w-3xl">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5"/> Resumo da Nota Fiscal: {viewingNF.numeroNF}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-2 bg-muted/40 p-3 rounded-md border text-sm">
                                <div><p className="font-bold text-[10px] text-muted-foreground uppercase">Emissão</p><p>{formatDate(parseISO(viewingNF.dataNFISO), 'dd/MM/yyyy')}</p></div>
                                <div><p className="font-bold text-[10px] text-muted-foreground uppercase">Status</p><p>{viewingNF.pago ? 'Paga ✓' : 'Pendente'}</p></div>
                                {viewingNF.pago && viewingNF.dataPagamentoISO && (
                                    <div><p className="font-bold text-[10px] text-muted-foreground uppercase">Pagamento Realizado</p><p>{formatDate(parseISO(viewingNF.dataPagamentoISO), 'dd/MM/yyyy')}</p></div>
                                )}
                            </div>
                            
                            <div>
                                <h4 className="text-sm font-bold mb-2">Itens Relacionados ({viewingNF.itens.length})</h4>
                                <div className="border rounded-md max-h-64 overflow-y-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted hover:bg-muted text-xs">
                                                <TableHead>Item do Empenho</TableHead>
                                                <TableHead className="text-center">Data Ent.</TableHead>
                                                <TableHead className="text-right">Qtd NFs</TableHead>
                                                <TableHead className="text-right">Total (R$)</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody className="text-xs">
                                            {viewingNF.itens.map(itemNF => {
                                                const ei = empenho.itens.find(e => e.id === itemNF.empenhoItemId);
                                                if (!ei) return null;
                                                return (
                                                    <TableRow key={itemNF.id}>
                                                        <TableCell className="font-medium max-w-[200px] truncate" title={ei.descricaoSnapshot}>{ei.descricaoSnapshot}</TableCell>
                                                        <TableCell className="text-center">{itemNF.dataEntregaISO ? formatDate(parseISO(itemNF.dataEntregaISO), 'dd/MM/yyyy') : '-'}</TableCell>
                                                        <TableCell className="text-right font-bold">{itemNF.qtdNestaNF} <span className="font-normal text-[10px] text-muted-foreground">{ei.unidadeSnapshot}</span></TableCell>
                                                        <TableCell className="text-right text-green-600 font-bold">{formatCurrency(itemNF.qtdNestaNF * ei.precoVendaUnitSnapshot)}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setViewingNF(null)}>Fechar</Button>
                        </DialogFooter>
                    </DialogContent>
                )}
            </Dialog>
        </div>
    );
}

function ImportarItensDialog({ open, onOpenChange, certameItens, empenho, onSuccess }: { open: boolean; onOpenChange: (o: boolean) => void; certameItens: any[]; empenho: Empenho; onSuccess: (it: EmpenhoItem[]) => Promise<void>; }) {
    const [sel, setSel] = React.useState<Record<string, { selected: boolean; qtd: number }>>({});
    
    React.useEffect(() => {
        if (open) setSel({});
    }, [open]);

    const handleConfirm = async () => {
        const up = [...empenho.itens];
        Object.entries(sel).forEach(([id, val]) => {
            if (val.selected && val.qtd > 0) {
                const pi = certameItens.find((i: any) => i.id === id);
                if (pi && !empenho.itens.some(ei => ei.precificacaoItemId === pi.id)) {
                    up.push({ 
                        id: crypto.randomUUID(), 
                        precificacaoItemId: pi.id, 
                        descricaoSnapshot: pi.descricao, 
                        unidadeSnapshot: pi.unidade, 
                        precoVendaUnitSnapshot: pi.metrics.precoFinalUnit, 
                        custoUnitSnapshot: pi.metrics.custoTotalUnit, 
                        lucroUnitSnapshot: pi.metrics.lucroUnit, 
                        qtdEmpenhada: val.qtd, 
                        qtdEntregue: 0, 
                        qtdSaldo: val.qtd 
                    });
                }
            }
        });
        await onSuccess(up); 
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle>Importar Itens da Planilha</DialogTitle>
                    <DialogDescription>Selecione os itens e as quantidades desejadas para este empenho.</DialogDescription>
                </DialogHeader>
                
                <div className="flex-1 overflow-auto px-6 pb-4">
                    <div className="min-w-[900px] border rounded-md relative bg-background">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-20 shadow-sm border-b">
                                <TableRow className="bg-muted/50">
                                    <TableHead className="w-[50px] bg-muted/50"></TableHead>
                                    <TableHead className="bg-muted/50">Descrição</TableHead>
                                    <TableHead className="text-center bg-muted/50">UN</TableHead>
                                    <TableHead className="text-right bg-muted/50">Qtd Disp.</TableHead>
                                    <TableHead className="text-right bg-muted/50">Venda Unit.</TableHead>
                                    <TableHead className="w-[140px] bg-muted/50">Qtd a Empenhar</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {certameItens.filter((i: any) => i.status !== 'PERDIDO').map((i: any) => (
                                    <TableRow key={i.id} className="hover:bg-muted/50 transition-colors border-b">
                                        <TableCell>
                                            <Checkbox 
                                                onCheckedChange={(c) => setSel(prev => ({...prev, [i.id]: { selected: !!c, qtd: i.qtd }}))} 
                                            />
                                        </TableCell>
                                        <TableCell className="font-medium py-4">
                                            <p className="text-sm leading-relaxed">{i.descricao}</p>
                                        </TableCell>
                                        <TableCell className="text-center">{i.unidade}</TableCell>
                                        <TableCell className="text-right">{i.qtd}</TableCell>
                                        <TableCell className="text-right whitespace-nowrap font-semibold">
                                            {formatCurrency(i.metrics.precoFinalUnit)}
                                        </TableCell>
                                        <TableCell>
                                            <Input 
                                                type="number" 
                                                className="h-8 w-24" 
                                                defaultValue={i.qtd} 
                                                onChange={e => setSel(prev => ({...prev, [i.id]: { ...prev[i.id], qtd: Number(e.target.value) }}))} 
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
                
                <DialogFooter className="p-6 border-t bg-muted/5 mt-auto">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleConfirm}>Importar Selecionados</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const nfSchema = z.object({ 
    numeroNF: z.string().min(1, 'Número da NF é obrigatório'), 
    dataNFISO: z.date(), 
    pago: z.boolean(), 
    dataPagamentoISO: z.date().optional().nullable(),
    itens: z.array(z.object({ 
        empenhoItemId: z.string(), 
        qtdNestaNF: z.number().min(0),
        dataEntregaISO: z.date()
    })) 
});

function NotaFiscalDialog({ 
    open, onOpenChange, empenho, nfToEdit, onSuccess 
}: { 
    open: boolean; 
    onOpenChange: (o: boolean) => void; 
    empenho: Empenho;
    nfToEdit?: NotaFiscal | null;
    onSuccess: (nf: any) => Promise<void>; 
}) {
    const { toast } = useToast();
    const [isSaving, setIsSaving] = React.useState(false);

    const form = useForm<z.infer<typeof nfSchema>>({ 
        resolver: zodResolver(nfSchema), 
        defaultValues: { numeroNF: '', dataNFISO: new Date(), pago: false, dataPagamentoISO: null, itens: [] } 
    });

    React.useEffect(() => {
        if (open) {
            if (nfToEdit) {
                const prefilledItens = empenho.itens.map(ei => {
                    const existente = nfToEdit.itens.find(nfi => nfi.empenhoItemId === ei.id);
                    return {
                        empenhoItemId: ei.id,
                        qtdNestaNF: existente ? existente.qtdNestaNF : 0,
                        dataEntregaISO: existente && existente.dataEntregaISO ? parseISO(existente.dataEntregaISO) : new Date()
                    };
                });
                form.reset({
                    numeroNF: nfToEdit.numeroNF,
                    dataNFISO: parseISO(nfToEdit.dataNFISO),
                    pago: nfToEdit.pago,
                    dataPagamentoISO: nfToEdit.dataPagamentoISO ? parseISO(nfToEdit.dataPagamentoISO) : null,
                    itens: prefilledItens
                });
            } else {
                form.reset({ 
                    numeroNF: '', 
                    dataNFISO: new Date(), 
                    pago: false, 
                    dataPagamentoISO: null,
                    itens: empenho.itens.map(ei => ({ empenhoItemId: ei.id, qtdNestaNF: 0, dataEntregaISO: new Date() })) 
                });
            }
        }
    }, [open, empenho, nfToEdit, form]);

    const watchedItens = form.watch('itens') || [];
    const resumo = watchedItens.reduce((acc, item) => {
        if (item.qtdNestaNF > 0) {
            const ei = empenho.itens.find(e => e.id === item.empenhoItemId);
            if (ei) {
                acc.qtdItens++;
                acc.unidades += item.qtdNestaNF;
                acc.valorTotal += (item.qtdNestaNF * ei.precoVendaUnitSnapshot);
            }
        }
        return acc;
    }, { qtdItens: 0, unidades: 0, valorTotal: 0 });

    const onSubmit = async (v: z.infer<typeof nfSchema>) => { 
        let hasItem = false;
        for (const itemNF of v.itens) {
            if (itemNF.qtdNestaNF <= 0) continue;
            hasItem = true;
            const ei = empenho.itens.find(e => e.id === itemNF.empenhoItemId);
            if (ei) {
                const qtdPreviouslyInThisNF = nfToEdit ? (nfToEdit.itens.find(n => n.empenhoItemId === ei.id)?.qtdNestaNF || 0) : 0;
                const saldoDisponivel = ei.qtdEmpenhada - ei.qtdEntregue + qtdPreviouslyInThisNF;
                if (itemNF.qtdNestaNF > saldoDisponivel) {
                    toast({
                        title: "Limite Excedido",
                        description: `O item "${ei.descricaoSnapshot}" possui apenas ${saldoDisponivel} unidades disponíveis para entrega na NF.`,
                        variant: "destructive"
                    });
                    return;
                }
            }
        }
        
        if (!hasItem) {
             toast({ title: "Nenhum item", description: "Informe pelo menos um item entregue para salvar a NF.", variant: "destructive" });
             return;
        }

        setIsSaving(true);
        try {
            const resultNf = { 
                ...(nfToEdit ? { id: nfToEdit.id } : { id: crypto.randomUUID() }),
                numeroNF: v.numeroNF, 
                dataNFISO: formatDate(v.dataNFISO, 'yyyy-MM-dd'), 
                pago: v.pago, 
                dataPagamentoISO: v.pago && v.dataPagamentoISO ? formatDate(v.dataPagamentoISO, 'yyyy-MM-dd') : undefined,
                itens: v.itens.filter(i => i.qtdNestaNF > 0).map(i => ({
                    ...i,
                    dataEntregaISO: formatDate(i.dataEntregaISO, 'yyyy-MM-dd'),
                    id: nfToEdit?.itens.find(n => n.empenhoItemId === i.empenhoItemId)?.id || crypto.randomUUID()
                })) 
            }; 
            await onSuccess(resultNf); 
            onOpenChange(false); 
        } finally {
            setIsSaving(false);
        }
    };

    const watchedPago = form.watch('pago');

    return (
        <FormDialog open={open} onOpenChange={onOpenChange} title={nfToEdit ? `Editar NF: ${nfToEdit.numeroNF}` : "Lançar Nota Fiscal"} formId="nf-f" isSaving={isSaving}>
            <Form {...form}>
                <form id="nf-f" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="border rounded-md p-4 bg-muted/30">
                        <h4 className="font-semibold text-sm mb-3">1. Dados Gerais da NF</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="numeroNF" render={({ field }) => (
                                <FormItem><FormLabel>Nº da Nota Fiscal*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="dataNFISO" render={({ field }) => (
                                <FormItem><FormLabel>Data de Emissão*</FormLabel><FormControl><Input type="date" value={field.value ? formatDate(field.value, 'yyyy-MM-dd') : ''} onChange={e => field.onChange(parseISO(e.target.value))} /></FormControl><FormMessage /></FormItem>
                            )} />
                        </div>
                        <div className="flex gap-4 mt-4 items-end">
                            <FormField control={form.control} name="pago" render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-2 space-y-0 p-2 border rounded-md min-w-[200px]">
                                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                    <FormLabel className="cursor-pointer">Status: Pago?</FormLabel>
                                </FormItem>
                            )} />
                            {watchedPago && (
                                <FormField control={form.control} name="dataPagamentoISO" render={({ field }) => (
                                    <FormItem className="flex-1"><FormLabel>Data do Pagamento</FormLabel><FormControl><Input type="date" value={field.value ? formatDate(field.value, 'yyyy-MM-dd') : ''} onChange={e => field.onChange(parseISO(e.target.value))} /></FormControl><FormMessage /></FormItem>
                                )} />
                            )}
                        </div>
                    </div>

                    <div className="border rounded-md">
                        <div className="bg-muted p-2 text-xs font-bold border-b tracking-wider uppercase">2. Itens do Empenho Relacionados (Entregues)</div>
                        <ScrollArea className="max-h-64">
                            <div className="p-2 space-y-2">
                                {empenho.itens.map((ei, idx) => {
                                    const qtdPreviouslyInThisNF = nfToEdit ? (nfToEdit.itens.find(n => n.empenhoItemId === ei.id)?.qtdNestaNF || 0) : 0;
                                    const saldoBase = ei.qtdEmpenhada - ei.qtdEntregue;
                                    const saldoParaEdicao = saldoBase + qtdPreviouslyInThisNF;
                                    
                                    // if item is fully delivered in OTHER NFs, visually omit or disable it
                                    if (saldoParaEdicao <= 0) return null;

                                    return (
                                        <div key={ei.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center p-3 border rounded-md bg-background text-sm">
                                            <div className="min-w-0">
                                                <p className="font-semibold truncate" title={ei.descricaoSnapshot}>{ei.descricaoSnapshot}</p>
                                                <div className="flex gap-2 text-xs text-muted-foreground mt-1">
                                                    <span>Unidade: {ei.unidadeSnapshot}</span>
                                                    <span>|</span>
                                                    <span>Empenhado: {ei.qtdEmpenhada}</span>
                                                    <span>|</span>
                                                    <span>Saldo Max: {saldoParaEdicao}</span>
                                                </div>
                                            </div>
                                            
                                            <FormField control={form.control} name={`itens.${idx}.qtdNestaNF`} render={({field}) => (
                                                <FormItem className="w-24">
                                                    <FormLabel className="text-[10px] leading-none">Qtd Entregue</FormLabel>
                                                    <FormControl><DecimalInput value={field.value} onChange={field.onChange} /></FormControl>
                                                </FormItem>
                                            )} />

                                            <FormField control={form.control} name={`itens.${idx}.dataEntregaISO`} render={({field}) => (
                                                <FormItem className="w-36">
                                                    <FormLabel className="text-[10px] leading-none">Data Entrega</FormLabel>
                                                    <FormControl><Input type="date" className="h-9" value={field.value ? formatDate(field.value, 'yyyy-MM-dd') : ''} onChange={e => e.target.value ? field.onChange(parseISO(e.target.value)) : null} /></FormControl>
                                                </FormItem>
                                            )} />
                                            
                                            <div className="text-right w-24">
                                                <span className="text-[10px] text-muted-foreground block">Saldo Final</span>
                                                <span className={cn("font-bold", saldoParaEdicao - watchedItens[idx]?.qtdNestaNF < 0 ? "text-destructive" : "")}>
                                                    {saldoParaEdicao - (watchedItens[idx]?.qtdNestaNF || 0)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>

                    <div className="border rounded-md p-4 bg-muted/40 flex justify-between items-center">
                        <div>
                            <p className="text-sm font-semibold">Resumo da Nota Fiscal</p>
                            <p className="text-xs text-muted-foreground">Revise antes de salvar</p>
                        </div>
                        <div className="text-right flex gap-6">
                            <div>
                                <span className="block text-[10px] uppercase text-muted-foreground">Itens / Qtde</span>
                                <span className="font-bold">{resumo.qtdItens} / {resumo.unidades}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] uppercase text-muted-foreground">Valor Faturado (NF)</span>
                                <span className="font-bold text-green-600">{formatCurrency(resumo.valorTotal)}</span>
                            </div>
                        </div>
                    </div>
                </form>
            </Form>
        </FormDialog>
    );
}

const certameFormSchema = z.object({
  orgao: z.string().min(1, 'O órgão é obrigatório.'),
  modalidade: z.string().min(1, 'A modalidade é obrigatória.'),
  numeroAno: z.string().min(1, 'O Número/Ano é obrigatório.'),
  processo: z.string().optional(),
  uasgUg: z.string().optional(),
  plataforma: z.string().optional(),
  objetoResumo: z.string().optional(),
  dataSessaoISO: z.date({ required_error: 'A data da sessão é obrigatória.' }),
  horaSessao: z.string().min(1, "A hora da sessão é obrigatória."),
  inicioVigencia: z.date().optional(),
  fimVigencia: z.date().optional(),
  observacoes: z.string().optional(),
  status: z.enum(['EM_ANDAMENTO', 'GANHO', 'PERDIDO', 'CANCELADO']),
  isRetroativo: z.boolean(),
  orcamentoSigiloso: z.boolean(),
  empresaDestinoId: z.string().optional(),
});
type CertameFormValues = z.infer<typeof certameFormSchema>;

function CertameFormDialog({ open, onOpenChange, onSuccess, certameToEdit, clientes }: { open: boolean; onOpenChange: (open: boolean) => void; onSuccess: (newId?: string) => void; certameToEdit?: CertameUnificado | null; clientes: any[] }) {
    const [isSaving, setIsSaving] = React.useState(false);
    const { toast } = useToast();
    const form = useForm<CertameFormValues>({
        resolver: zodResolver(certameFormSchema),
        defaultValues: certameToEdit ? {
            ...certameToEdit,
            dataSessaoISO: parseISO(certameToEdit.dataSessaoISO),
            horaSessao: certameToEdit.horaSessao || '09:00',
            inicioVigencia: certameToEdit.inicioVigencia ? parseISO(certameToEdit.inicioVigencia) : undefined,
            fimVigencia: certameToEdit.fimVigencia ? parseISO(certameToEdit.fimVigencia) : undefined,
        } : {
            orgao: '',
            modalidade: 'PREGÃO ELETRÔNICO SRP',
            numeroAno: '',
            processo: '',
            uasgUg: '',
            plataforma: 'Compras.gov',
            objetoResumo: '',
            dataSessaoISO: new Date(),
            horaSessao: '09:00',
            status: 'EM_ANDAMENTO',
            isRetroativo: false,
            orcamentoSigiloso: false,
        }
    });

    React.useEffect(() => {
        if (open) {
            form.reset(certameToEdit ? {
                ...certameToEdit,
                dataSessaoISO: parseISO(certameToEdit.dataSessaoISO),
                horaSessao: certameToEdit.horaSessao || '09:00',
                inicioVigencia: certameToEdit.inicioVigencia ? parseISO(certameToEdit.inicioVigencia) : undefined,
                fimVigencia: certameToEdit.fimVigencia ? parseISO(certameToEdit.fimVigencia) : undefined,
            } : {
                orgao: '',
                modalidade: 'PREGÃO ELETRÔNICO SRP',
                numeroAno: '',
                processo: '',
                uasgUg: '',
                plataforma: 'Compras.gov',
                objetoResumo: '',
                dataSessaoISO: new Date(),
                horaSessao: '09:00',
                status: 'EM_ANDAMENTO',
                isRetroativo: false,
                orcamentoSigiloso: false,
            });
        }
    }, [open, certameToEdit, form]);

    const onSubmit = async (values: CertameFormValues) => {
        setIsSaving(true);
        try {
            const dataToSave = {
                ...values,
                dataSessaoISO: formatDate(values.dataSessaoISO, 'yyyy-MM-dd'),
                inicioVigencia: values.inicioVigencia ? formatDate(values.inicioVigencia, 'yyyy-MM-dd') : undefined,
                fimVigencia: values.fimVigencia ? formatDate(values.fimVigencia, 'yyyy-MM-dd') : undefined,
                empresaDestinoNome: clientes.find(c => c.id === values.empresaDestinoId)?.nomeFantasia,
            };
            if (certameToEdit) {
                await certameUnificadoRepository.update(certameToEdit.id, dataToSave);
                toast({ title: 'Certame atualizado!' });
                onSuccess(certameToEdit.id);
            } else {
                const n = await certameUnificadoRepository.create(dataToSave as any);
                toast({ title: 'Certame criado!' });
                onSuccess(n.id);
            }
            onOpenChange(false);
        } catch { toast({ title: 'Erro ao salvar', variant: 'destructive' }); } finally { setIsSaving(false); }
    };

    return (
        <FormDialog open={open} onOpenChange={onOpenChange} title={certameToEdit ? "Editar Certame" : "Novo Certame"} formId="c-form" isSaving={isSaving}>
            <Form {...form}>
                <form id="c-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField control={form.control} name="empresaDestinoId" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Empresa Destino</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia}</SelectItem>)}</SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="orgao" render={({ field }) => (
                        <FormItem><FormLabel>Órgão*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="modalidade" render={({ field }) => (
                            <FormItem><FormLabel>Modalidade*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="numeroAno" render={({ field }) => (
                            <FormItem><FormLabel>Número/Ano*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <FormField control={form.control} name="dataSessaoISO" render={({ field }) => (
                            <FormItem><FormLabel>Data*</FormLabel><FormControl><Input type="date" value={field.value ? formatDate(field.value, 'yyyy-MM-dd') : ''} onChange={e => field.onChange(parseISO(e.target.value))} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="horaSessao" render={({ field }) => (
                            <FormItem><FormLabel>Hora*</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="status" render={({ field }) => (
                            <FormItem><FormLabel>Status*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{['EM_ANDAMENTO', 'GANHO', 'PERDIDO', 'CANCELADO'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                        )} />
                    </div>
                </form>
            </Form>
        </FormDialog>
    );
}
