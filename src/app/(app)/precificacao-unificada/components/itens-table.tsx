'use client';

import * as React from 'react';
import { PlusCircle, MoreHorizontal, FileDown, Trash2, Pencil, RotateCcw, Check, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CurrencyInput } from '@/components/ui/currency-input';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';
import { cn, formatCurrency, parseCurrency } from '@/lib/utils';
import { generatePrecificacaoPdf } from '@/lib/pdf-generator';
import type { ItemPrecificacao, Produto, Categoria, Fornecedor, CertameUnificado } from '@/lib/models';
import type { CalculatedItemMetrics, CertameComCalculo } from '@/lib/pricing-calculator';
import { ItemFormDialog } from './item-form-dialog';
import { ComposicaoDialog } from './composicao-dialog';
import {
    type PricingTableItem,
    EMPTY_TABLE_VALUE,
    formatTableCurrency,
    formatTableNumber,
    getItemTotalCost,
    getReferenceProfit,
    getEconomicViability,
} from './pricing-table-utils';

interface ItensTableProps {
    certame: CertameComCalculo;
    context: { produtos: Produto[]; categorias: Categoria[]; fornecedores: Fornecedor[]; clientes: any[] };
    onUpdateCertame: (updatedCertame: CertameUnificado) => Promise<void>;
}

export function ItensTable({ certame, context, onUpdateCertame }: ItensTableProps) {
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
        const standalone: PricingTableItem[] = [];
        const byLot = new Map<number, PricingTableItem[]>();
        certame.itens.forEach(item => {
            const i = item as any as PricingTableItem;
            if (i.loteNumero) {
                if (!byLot.has(i.loteNumero)) byLot.set(i.loteNumero, []);
                byLot.get(i.loteNumero)!.push(i);
            } else {
                standalone.push(i);
            }
        });
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
            return { ...item, status: 'GANHO' as const, precoAnteriorAjusteLote: item.precoFinalVendidoReal || item.metrics.precoFinalUnit, precoFinalVendidoReal: newUnit };
        });
        if (heaviestIndexInLot !== -1) {
            const residual = targetTotal - sumOfNewTotals;
            const targetItem = updatedItems[heaviestIndexInLot];
            const currentItemTotal = targetItem.precoFinalVendidoReal! * targetItem.qtd;
            targetItem.precoFinalVendidoReal = Math.round(((currentItemTotal + residual) / targetItem.qtd) * 10000) / 10000;
        }
        const novosAjustes = { ...(certame.ajustesLotes || {}), [loteNumero]: { valorFinal: targetTotal, aplicadoEm: new Date().toISOString(), aplicadoPor: user?.uid || 'user', modo: 'PROPORCIONAL' } };
        await onUpdateCertame({ ...certame, itens: updatedItems, ajustesLotes: novosAjustes });
        setLoteInputs(prev => ({ ...prev, [loteNumero]: '' }));
        toast({ title: `Lote ${loteNumero} ajustado com sucesso!` });
    };

    const handleUndoLotAdjustment = async (loteNumero: number) => {
        const updatedItems = certame.itens.map(i => i.loteNumero === loteNumero && i.precoAnteriorAjusteLote !== undefined ? { ...i, precoFinalVendidoReal: i.precoAnteriorAjusteLote, precoAnteriorAjusteLote: undefined } : i);
        const novosAjustes = { ...(certame.ajustesLotes || {}) };
        delete novosAjustes[loteNumero];
        await onUpdateCertame({ ...certame, itens: updatedItems, ajustesLotes: novosAjustes });
        toast({ title: `Ajuste do Lote ${loteNumero} desfeito.` });
    };

    const handleNewItem = () => { setEditingItem(null); setIsItemFormOpen(true); };
    const handleEditItem = (item: ItemPrecificacao) => { setEditingItem(item); setIsItemFormOpen(true); };
    const handleDeleteItem = (item: ItemPrecificacao) => { setDeletingItem(item); setIsDeleteAlertOpen(true); };
    const handleViewComposicao = (item: ItemPrecificacao & { metrics: CalculatedItemMetrics }) => { setComposicaoItem(item); setIsComposicaoOpen(true); };
    const confirmDeleteItem = async () => { if (!deletingItem) return; await onUpdateCertame({ ...certame, itens: certame.itens.filter(i => i.id !== deletingItem.id) }); setIsDeleteAlertOpen(false); setDeletingItem(null); };

    const columns: ColumnDef<PricingTableItem>[] = React.useMemo(() => [
        { accessorKey: 'itemNumero', header: 'Item', cell: (row) => <span className={cn("block w-12 whitespace-nowrap", row.status === 'PERDIDO' && 'text-muted-foreground line-through')}>{formatTableNumber(row.itemNumero, 0)}</span> },
        { accessorKey: 'descricao', header: 'Descrição', cell: (row) => <div className={cn("w-[280px] min-w-[220px] max-w-[360px] truncate font-medium", row.status === 'PERDIDO' && 'text-muted-foreground line-through')} title={row.descricao}>{row.descricao || EMPTY_TABLE_VALUE}</div> },
        { accessorKey: 'unidade', header: 'Unid.', cell: (row) => <span className="block w-14 whitespace-nowrap">{row.unidade || EMPTY_TABLE_VALUE}</span> },
        { accessorKey: 'qtd', header: 'Qtd. Ref.', align: 'right', cell: (row) => <span className="whitespace-nowrap tabular-nums">{formatTableNumber(row.qtd)}</span> },
        { accessorKey: 'precoReferencia', header: 'Preço Ref.', align: 'right', cell: (row) => <span className="whitespace-nowrap tabular-nums">{formatTableCurrency(row.precoReferencia)}</span> },
        { accessorKey: 'custoTotalUnit', header: 'Custo Unit.', align: 'right', cell: (row) => <span className="whitespace-nowrap tabular-nums">{formatTableCurrency(row.metrics.custoTotalUnit)}</span> },
        { accessorKey: 'custoTotal', header: 'Custo Total', align: 'right', cell: (row) => <span className="whitespace-nowrap tabular-nums">{formatTableCurrency(getItemTotalCost(row))}</span> },
        { accessorKey: 'precoFinalUnit', header: 'Valor Unit. Final', align: 'right', cell: (row) => <div className="whitespace-nowrap font-bold tabular-nums">{formatTableCurrency(row.metrics.precoFinalUnit)}</div> },
        { accessorKey: 'lucroUnit', header: 'Lucro Unit.', align: 'right', cell: (row) => <div className={cn("whitespace-nowrap tabular-nums", row.metrics.resultado === 'PREJUIZO' && 'text-destructive')}>{formatTableCurrency(row.metrics.lucroUnit)}</div> },
        { accessorKey: 'lucroTotal', header: 'Lucro Total', align: 'right', cell: (row) => <div className={cn("whitespace-nowrap tabular-nums", row.metrics.resultado === 'PREJUIZO' && 'text-destructive')}>{formatTableCurrency(row.metrics.lucroTotal)}</div> },
        { accessorKey: 'lucroReferencia', header: 'Lucro na Ref.', align: 'right', cell: (row) => <div className={cn("whitespace-nowrap tabular-nums", (getReferenceProfit(row) ?? 0) < 0 && 'text-destructive')}>{formatTableCurrency(getReferenceProfit(row))}</div> },
        { accessorKey: 'viabilidadeEconomica', header: 'Viabilidade', cell: (row) => {
            const viability = getEconomicViability(row);
            return (
                <Badge variant={viability === 'Inviável' ? 'destructive' : 'secondary'} className={cn("whitespace-nowrap", viability === 'Viável' && 'bg-green-600 text-white hover:bg-green-700', viability === 'Indefinido' && 'border-muted-foreground/30 bg-muted text-muted-foreground')}>
                    {viability}
                </Badge>
            );
        }},
        { accessorKey: 'status', header: 'Status', cell: (row) => <Badge variant={row.status === 'GANHO' ? 'default' : row.status === 'PERDIDO' ? 'destructive' : 'secondary'} className={cn("whitespace-nowrap", row.status === 'GANHO' && 'bg-green-600')}>{row.status || EMPTY_TABLE_VALUE}</Badge> },
        { accessorKey: 'actions', header: 'Ações', align: 'right', cell: (row) => (
            <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleViewComposicao(row)}><Scale className="mr-2 h-4 w-4" />Composição</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleEditItem(row)}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDeleteItem(row)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        )},
    ], []);

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between">
                <div><CardTitle>Itens (Planilha)</CardTitle><CardDescription>Defina os preços base de cada item.</CardDescription></div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => generatePrecificacaoPdf(certame, context.fornecedores, context.clientes.find(c => c.id === certame.empresaDestinoId))}><FileDown /> PDF</Button>
                    <Button onClick={handleNewItem}><PlusCircle /> Novo Item</Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="overflow-x-auto">
                    {standaloneItems.length > 0 && (
                        <div><h3 className="text-lg font-semibold mb-2">Itens Unitários</h3><DataTable columns={columns} data={standaloneItems} /></div>
                    )}
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
                                        <div className="flex flex-col gap-1">
                                            <Label className="text-[10px] uppercase font-bold">Valor Final do Lote</Label>
                                            <div className="flex gap-2">
                                                <CurrencyInput className="h-8 w-32" value={inputVal || undefined} onChange={v => setLoteInputs(prev => ({ ...prev, [loteNumero]: v.toString() }))} />
                                                <Button size="sm" onClick={() => handleApplyLotValue(loteNumero)}><Check className="h-3 w-3 mr-1" /> Aplicar</Button>
                                                {hasAdj && <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleUndoLotAdjustment(loteNumero)}><RotateCcw className="h-3 w-3 mr-1" /> Desfazer</Button>}
                                            </div>
                                        </div>
                                        {inputVal > 0 && (
                                            <div className="text-xs border-l pl-4">
                                                <p className="text-muted-foreground font-semibold">Preview Diferença:</p>
                                                <p className={cn("font-bold", diff >= 0 ? "text-green-600" : "text-destructive")}>{formatCurrency(diff)} ({diffPct.toFixed(2)}%)</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <DataTable columns={columns} data={items} />
                            </div>
                        );
                    })}
                </div>
            </CardContent>
            <ItemFormDialog open={isItemFormOpen} onOpenChange={(o) => { setIsItemFormOpen(o); if (!o) setTimeout(() => setEditingItem(null), 300); }} certame={certame} item={editingItem} context={context} onSuccess={(it) => onUpdateCertame({ ...certame, itens: it })} />
            <ComposicaoDialog open={isComposicaoOpen} onOpenChange={(o) => { setIsComposicaoOpen(o); if (!o) setTimeout(() => setComposicaoItem(null), 300); }} item={composicaoItem} />
            <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle><AlertDialogDescription>Excluir item?</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteItem} className="bg-destructive">Excluir</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
