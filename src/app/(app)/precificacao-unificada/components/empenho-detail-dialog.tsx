'use client';

import * as React from 'react';
import { format as formatDate, parseISO, addDays } from 'date-fns';
import { PlusCircle, Receipt, ShoppingCart, AlertCircle, Clock, Eye, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { cn, formatCurrency } from '@/lib/utils';
import { empenhoRepository } from '@/lib/repositories/empenho-repository';
import { nfRepository } from '@/lib/repositories/nf-repository';
import type { CertameComCalculo } from '@/lib/pricing-calculator';
import type { Empenho, EmpenhoItem, NotaFiscal } from '@/lib/models';
import { ImportarItensDialog } from './importar-itens-dialog';
import { NotaFiscalDialog } from './nota-fiscal-dialog';

interface EmpenhoDetailDialogProps {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    certame: CertameComCalculo;
    empenho: Empenho | null;
    onDataChange: () => void;
}

export function EmpenhoDetailDialog({ open, onOpenChange, certame, empenho: incomingEmpenho, onDataChange }: EmpenhoDetailDialogProps) {
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
                        <div className="px-6 border-b">
                            <TabsList className="bg-transparent h-12 w-full justify-start gap-4">
                                <TabsTrigger value="itens" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-semibold">Itens do Empenho</TabsTrigger>
                                <TabsTrigger value="nfs" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-semibold">Execução (NFs)</TabsTrigger>
                                <TabsTrigger value="info" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full font-semibold">Informações do Empenho</TabsTrigger>
                            </TabsList>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <TabsContent value="itens" className="h-full data-[state=active]:flex flex-col m-0">
                                <ScrollArea className="flex-1 min-h-0">
                                    <div className="p-6 h-full min-h-[500px]">
                                        <ItensEmpenhoTab certameId={certame.id} empenho={empenho} certameItens={certame.itens} summary={summary} onDataChange={onDataChange} />
                                    </div>
                                </ScrollArea>
                            </TabsContent>
                            <TabsContent value="nfs" className="h-full data-[state=active]:flex flex-col m-0">
                                <ScrollArea className="flex-1 min-h-0">
                                    <div className="p-6 h-full min-h-[500px]">
                                        <EntregasNFTab certameId={certame.id} empenho={empenho} onDataChange={onDataChange} />
                                    </div>
                                </ScrollArea>
                            </TabsContent>
                            <TabsContent value="info" className="h-full data-[state=active]:flex flex-col m-0">
                                <ScrollArea className="h-full">
                                    <div className="p-6 space-y-6">
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-4 text-sm bg-muted/30 p-4 rounded-lg border">
                                            <div className="flex flex-col gap-1 items-start"><span className="text-muted-foreground uppercase text-[10px] font-bold">Tipo</span><span className="font-semibold text-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> {empenho.tipoEmpenho}</span></div>
                                            <div className="flex flex-col gap-1 items-start"><span className="text-muted-foreground uppercase text-[10px] font-bold">Data Solicitação</span><span className="font-semibold text-foreground">{formatDate(parseISO(empenho.dataSolicitacaoISO), 'dd/MM/yyyy')}</span></div>
                                            <div className="flex flex-col gap-1 items-start"><span className="text-muted-foreground uppercase text-[10px] font-bold">Prazo Final</span><span className="font-semibold text-foreground">{formatDate(addDays(parseISO(empenho.dataSolicitacaoISO), empenho.prazoEntregaDias), 'dd/MM/yyyy')}</span></div>
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
    );
}

function ItensEmpenhoTab({ certameId, empenho, certameItens, summary, onDataChange }: { certameId: string; empenho: Empenho; certameItens: any[]; summary: any; onDataChange: () => void }) {
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
            );
        }}
    ];

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="shrink-0 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-muted/10 p-4 rounded-lg border border-dashed">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-x-6 gap-y-2 w-full">
                    <div><p className="text-[10px] text-muted-foreground uppercase font-bold">Total Itens</p><p className="text-lg font-bold">{summary.totalItens}</p></div>
                    <div><p className="text-[10px] text-muted-foreground uppercase font-bold">Pendentes / Parciais</p><p className="text-lg font-bold"><span className="text-destructive">{summary.itensPendentes}</span> <span className="text-muted-foreground text-sm font-normal mx-1">/</span> <span className="text-amber-500">{summary.itensParciais}</span></p></div>
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
            <ImportarItensDialog open={isImportOpen} onOpenChange={setIsImportOpen} certameItens={certameItens} empenho={empenho} onSuccess={async (it) => { await empenhoRepository.update(certameId, empenho.id, { ...empenho, itens: it }); onDataChange(); }} />
        </div>
    );
}

function EntregasNFTab({ certameId, empenho, onDataChange }: { certameId: string; empenho: Empenho; onDataChange: () => void }) {
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [editingNF, setEditingNF] = React.useState<NotaFiscal | null>(null);
    const [viewingNF, setViewingNF] = React.useState<NotaFiscal | null>(null);

    const syncEmpenho = async (updatedNFs: NotaFiscal[]) => {
        const updatedItens = empenho.itens.map(item => {
            const totalEntregue = updatedNFs.reduce((sum, nf) => {
                const nfItem = nf.itens.find(ni => ni.empenhoItemId === item.id);
                return sum + (nfItem?.qtdNestaNF || 0);
            }, 0);
            return { ...item, qtdEntregue: totalEntregue, qtdSaldo: item.qtdEmpenhada - totalEntregue };
        });
        const totalEmpenhada = updatedItens.reduce((sum, i) => sum + i.qtdEmpenhada, 0);
        const totalEntregueGeral = updatedItens.reduce((sum, i) => sum + i.qtdEntregue, 0);
        let statusEntrega: Empenho['statusEntrega'] = 'NAO_INICIADO';
        if (totalEmpenhada > 0) {
            if (totalEntregueGeral >= totalEmpenhada) statusEntrega = 'CONCLUIDO';
            else if (totalEntregueGeral > 0) statusEntrega = 'PARCIAL';
        }
        let statusFinanceiro: Empenho['statusFinanceiro'] = 'PENDENTE';
        if (updatedNFs.length > 0) {
            const todasPagas = updatedNFs.every(n => n.pago);
            const algumasPagas = updatedNFs.some(n => n.pago);
            if (todasPagas) statusFinanceiro = 'PAGO';
            else if (algumasPagas) statusFinanceiro = 'PARCIAL';
            else statusFinanceiro = 'FATURADO';
        }
        await empenhoRepository.update(certameId, empenho.id, { itens: updatedItens, statusEntrega, statusFinanceiro });
    };

    const cols: ColumnDef<NotaFiscal>[] = [
        { accessorKey: 'numeroNF', header: 'Descrição (Nº NF)', cell: (row) => <span className="font-bold">{row.numeroNF}</span> },
        { accessorKey: 'dataNFISO', header: 'Data Emissão', cell: (row) => <span>{formatDate(parseISO(row.dataNFISO), 'dd/MM/yyyy')}</span> },
        { id: 'valor', header: 'Valor Total', align: 'right', cell: (row) => {
            const valor = row.itens.reduce((acc, itemNF) => {
                const ei = empenho.itens.find(e => e.id === itemNF.empenhoItemId);
                return acc + (itemNF.qtdNestaNF * (ei?.precoVendaUnitSnapshot || 0));
            }, 0);
            return <span className="font-bold">{formatCurrency(valor)}</span>;
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
                <Button variant="outline" size="sm" onClick={() => setViewingNF(row)}><Eye className="h-4 w-4 mr-2" /> Itens</Button>
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

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="shrink-0 flex justify-between items-center">
                <h3 className="font-semibold flex items-center gap-2"><Receipt className="h-4 w-4" /> Notas Fiscais Lançadas</h3>
                <Button onClick={() => setIsFormOpen(true)} size="sm" disabled={empenho.itens.length === 0}><PlusCircle className="mr-2 h-4 w-4" /> Lançar Nova NF</Button>
            </div>
            <div className="flex-1 overflow-x-auto overflow-y-hidden border rounded-md min-h-0">
                <div className="h-full overflow-y-auto">
                    <DataTable columns={cols} data={empenho.nfs} emptyStateMessage="Nenhuma Nota Fiscal lançada para este empenho." />
                </div>
            </div>
            <NotaFiscalDialog open={isFormOpen} onOpenChange={setIsFormOpen} empenho={empenho} onSuccess={async (nf) => { await nfRepository.add(certameId, empenho.id, nf); const updatedNFs = [...empenho.nfs, nf]; await syncEmpenho(updatedNFs); onDataChange(); }} />
            <NotaFiscalDialog open={!!editingNF} onOpenChange={(o) => { if (!o) setTimeout(() => setEditingNF(null), 300); }} empenho={empenho} nfToEdit={editingNF} onSuccess={async (updatedData) => { if (!editingNF) return; await nfRepository.update(certameId, empenho.id, editingNF.id, updatedData); const updatedNFs = empenho.nfs.map(n => n.id === editingNF.id ? { ...n, ...updatedData } : n); await syncEmpenho(updatedNFs); onDataChange(); setEditingNF(null); }} />
            <Dialog open={!!viewingNF} onOpenChange={(o) => { if (!o) setViewingNF(null); }}>
                {viewingNF && (
                    <DialogContent className="max-w-3xl">
                        <DialogHeader><DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> Resumo da Nota Fiscal: {viewingNF.numeroNF}</DialogTitle></DialogHeader>
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
                        <DialogFooter><Button variant="outline" onClick={() => setViewingNF(null)}>Fechar</Button></DialogFooter>
                    </DialogContent>
                )}
            </Dialog>
        </div>
    );
}
