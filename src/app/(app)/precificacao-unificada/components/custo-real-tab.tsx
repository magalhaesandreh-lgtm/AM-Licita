'use client';

import * as React from 'react';
import { format as formatDate, parseISO } from 'date-fns';
import { AlertTriangle, PlusCircle, Pencil, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn, formatCurrency } from '@/lib/utils';
import { empenhoRepository } from '@/lib/repositories/empenho-repository';
import { COMO_COMPROU_LABEL, aplicarCustoReal, resumoCustoRealItem, type ResumoCustoRealItem } from '@/lib/custo-real';
import type { RateiosPercentuais } from '@/lib/pricing-calculator';
import type { CompraReal, Empenho, EmpenhoItem } from '@/lib/models';
import { CompraRealDialog } from './compra-real-dialog';

interface CustoRealTabProps {
    certameId: string;
    empenho: Empenho;
    certameItens: { id: string; aliquotaPct: number }[];
    rateios: RateiosPercentuais;
    fornecedoresCadastrados: string[];
    onDataChange: () => void;
}

type LinhaItem = EmpenhoItem & { r: ResumoCustoRealItem };

const situacaoBadge = (s: ResumoCustoRealItem['situacao']) => {
    if (s === 'PREJUIZO') return <Badge variant="destructive" className="whitespace-nowrap">Prejuízo</Badge>;
    if (s === 'ABAIXO_PREVISTO') return <Badge className="whitespace-nowrap border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-100">Abaixo do previsto</Badge>;
    if (s === 'OK') return <Badge className="whitespace-nowrap bg-green-100 text-green-800 hover:bg-green-100">No previsto ou melhor</Badge>;
    if (s === 'ESTIMADO_NF') return <Badge variant="outline" className="whitespace-nowrap border-blue-300 text-blue-700">Estimado pela NF (ATA)</Badge>;
    return <Badge variant="outline" className="whitespace-nowrap text-muted-foreground">Sem compra nem NF</Badge>;
};

export function CustoRealTab({ certameId, empenho, certameItens, rateios, fornecedoresCadastrados, onDataChange }: CustoRealTabProps) {
    const { toast } = useToast();
    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [itemInicial, setItemInicial] = React.useState<string | null>(null);
    const [editing, setEditing] = React.useState<CompraReal | null>(null);
    const [deleting, setDeleting] = React.useState<CompraReal | null>(null);

    const compras = empenho.comprasReais ?? [];
    const aliquotaDoItem = React.useCallback((precId: string) => certameItens.find(i => i.id === precId)?.aliquotaPct ?? 0, [certameItens]);

    const linhas: LinhaItem[] = React.useMemo(
        () => empenho.itens.map(it => ({ ...it, r: resumoCustoRealItem(it, compras, aliquotaDoItem(it.precificacaoItemId), rateios) })),
        [empenho.itens, compras, aliquotaDoItem, rateios],
    );

    const kpis = React.useMemo(() => {
        let totalComprado = 0, totalEstimadoNF = 0, lucroReal = 0, lucroPrevisto = 0, prejuizo = 0, abaixo = 0, semCompra = 0;
        linhas.forEach(l => {
            if (l.r.qtdCoberta <= 0) { semCompra++; return; }
            totalComprado += compras.filter(c => c.empenhoItemId === l.id).reduce((a, c) => a + c.qtd * c.custoUnit, 0);
            totalEstimadoNF += l.r.qtdEstimadaNF * l.custoUnitSnapshot;
            lucroReal += l.r.lucroEfetivoUnit * l.r.qtdCoberta;
            lucroPrevisto += l.lucroUnitSnapshot * l.r.qtdCoberta;
            if (l.r.situacao === 'PREJUIZO') prejuizo++;
            if (l.r.situacao === 'ABAIXO_PREVISTO') abaixo++;
        });
        return { totalComprado, totalEstimadoNF, lucroReal, lucroPrevisto, prejuizo, abaixo, semCompra, diferenca: lucroReal - lucroPrevisto };
    }, [linhas, compras]);

    const sugestoes = React.useMemo(
        () => Array.from(new Set([...fornecedoresCadastrados, ...compras.map(c => c.fornecedor)].filter(Boolean))).sort((a, b) => a.localeCompare(b)),
        [fornecedoresCadastrados, compras],
    );

    const salvar = async (novas: CompraReal[]) => {
        const itens = aplicarCustoReal(empenho.itens, novas, aliquotaDoItem, rateios);
        await empenhoRepository.update(certameId, empenho.id, { comprasReais: novas, itens });
        onDataChange();
    };

    const abrirNova = (itemId: string | null) => { setEditing(null); setItemInicial(itemId); setDialogOpen(true); };

    const colsItens: ColumnDef<LinhaItem>[] = [
        { accessorKey: 'descricaoSnapshot', header: 'Item', cell: (row) => <span className="block max-w-[260px] truncate font-medium" title={row.descricaoSnapshot}>{row.descricaoSnapshot}</span> },
        { id: 'emp', header: 'Empenhado', align: 'right', cell: (row) => <span className="tabular-nums">{row.qtdEmpenhada}</span> },
        { id: 'fat', header: 'Faturado (NF)', align: 'right', cell: (row) => <span className="tabular-nums">{row.r.qtdFaturada}</span> },
        { id: 'comp', header: 'Comprado (real)', align: 'right', cell: (row) => <span className="tabular-nums">{row.r.qtdComprada}</span> },
        { id: 'est', header: 'Estimado pela NF', align: 'right', cell: (row) => <span className={cn('tabular-nums', row.r.qtdEstimadaNF > 0 && 'font-semibold text-blue-700')} title="Faturado sem compra real lançada: usa o custo previsto da ATA">{row.r.qtdEstimadaNF}</span> },
        { id: 'saldo', header: 'A comprar', align: 'right', cell: (row) => <span className={cn('tabular-nums', row.r.saldoComprar > 0 && 'font-bold text-destructive')}>{row.r.saldoComprar}</span> },
        { id: 'real', header: 'Custo real total', align: 'right', cell: (row) => <span className="tabular-nums" title="Custo médio das compras + frete e rateios">{row.r.custoTotalRealUnit != null ? formatCurrency(row.r.custoTotalRealUnit) : '-'}</span> },
        { id: 'prev', header: 'Custo previsto', align: 'right', cell: (row) => <span className="tabular-nums text-muted-foreground">{formatCurrency(row.custoUnitSnapshot)}</span> },
        { id: 'uso', header: 'Custo usado no lucro', align: 'right', cell: (row) => <span className="tabular-nums font-medium" title="Real onde há compra; previsto (ATA) onde só há NF">{row.r.qtdCoberta > 0 ? formatCurrency(row.r.custoEfetivoUnit) : '-'}</span> },
        { id: 'lreal', header: 'Lucro unit.', align: 'right', cell: (row) => <span className={cn('tabular-nums font-semibold', row.r.qtdCoberta > 0 && row.r.lucroEfetivoUnit < 0 && 'text-destructive')}>{row.r.qtdCoberta > 0 ? formatCurrency(row.r.lucroEfetivoUnit) : '-'}</span> },
        { id: 'lprev', header: 'Lucro previsto unit.', align: 'right', cell: (row) => <span className="tabular-nums text-muted-foreground">{formatCurrency(row.lucroUnitSnapshot)}</span> },
        { id: 'marg', header: 'Margem', align: 'right', cell: (row) => <span className="tabular-nums">{row.r.qtdCoberta > 0 && row.r.margemEfetivaPct != null ? `${row.r.margemEfetivaPct.toFixed(2)}%` : '-'}</span> },
        { id: 'sit', header: 'Situação', cell: (row) => situacaoBadge(row.r.situacao) },
        { id: 'acao', header: '', align: 'right', cell: (row) => (
            <Button variant="outline" size="sm" onClick={() => abrirNova(row.id)} disabled={row.r.qtdComprada >= row.qtdEmpenhada} title={row.r.qtdEstimadaNF > 0 ? 'Lance a compra real para trocar o custo estimado pelo real' : undefined}><PlusCircle className="mr-1 h-4 w-4" /> Compra</Button>
        ) },
    ];

    const nomeItem = (id: string) => empenho.itens.find(i => i.id === id)?.descricaoSnapshot ?? '-';
    const comprasOrdenadas = [...compras].sort((a, b) => b.dataCompraISO.localeCompare(a.dataCompraISO) || b.registradoEm.localeCompare(a.registradoEm));
    const colsCompras: ColumnDef<CompraReal>[] = [
        { id: 'data', header: 'Data', cell: (row) => <span className="whitespace-nowrap">{formatDate(parseISO(row.dataCompraISO), 'dd/MM/yyyy')}</span> },
        { id: 'item', header: 'Item', cell: (row) => <span className="block max-w-[200px] truncate" title={nomeItem(row.empenhoItemId)}>{nomeItem(row.empenhoItemId)}</span> },
        { id: 'qtd', header: 'Qtd', align: 'right', cell: (row) => <span className="tabular-nums">{row.qtd}</span> },
        { id: 'custo', header: 'Custo unit.', align: 'right', cell: (row) => <span className="tabular-nums">{formatCurrency(row.custoUnit)}</span> },
        { id: 'total', header: 'Total', align: 'right', cell: (row) => <span className="tabular-nums font-semibold">{formatCurrency(row.qtd * row.custoUnit)}</span> },
        { id: 'forn', header: 'Onde comprou', cell: (row) => <span>{row.fornecedor}</span> },
        { id: 'marca', header: 'Marca', cell: (row) => <span>{row.marca || '-'}</span> },
        { id: 'como', header: 'Como', cell: (row) => <span className="whitespace-nowrap">{row.comoComprou ? COMO_COMPROU_LABEL[row.comoComprou] : '-'}</span> },
        { id: 'doc', header: 'Nota/Pedido', cell: (row) => <span>{row.documento || '-'}</span> },
        { id: 'obs', header: 'Obs.', cell: (row) => <span className="block max-w-[160px] truncate" title={row.observacoes}>{row.observacoes || '-'}</span> },
        { id: 'acoes', header: '', align: 'right', cell: (row) => (
            <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => { setEditing(row); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleting(row)}><Trash2 className="h-4 w-4" /></Button>
            </div>
        ) },
    ];

    const alertas = linhas.filter(l => l.r.situacao === 'PREJUIZO' || l.r.situacao === 'ABAIXO_PREVISTO');

    return (
        <div className="flex min-w-0 max-w-full flex-col gap-4">
            <div className="flex justify-end">
                <Button size="sm" onClick={() => abrirNova(null)} disabled={empenho.itens.length === 0}><PlusCircle className="mr-2 h-4 w-4" /> Registrar compra</Button>
            </div>
            <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-dashed bg-muted/10 p-4 md:flex-row md:items-center">
                <div className="grid w-full grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-5">
                    <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Total comprado (real)</p><p className="text-lg font-bold">{formatCurrency(kpis.totalComprado)}</p>{kpis.totalEstimadoNF > 0 && <p className="text-[10px] text-blue-700">+ {formatCurrency(kpis.totalEstimadoNF)} estimados pelas NFs</p>}</div>
                    <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Lucro real + estimado (NFs e compras)</p><p className={cn('text-lg font-bold', kpis.lucroReal < 0 ? 'text-destructive' : 'text-green-600')}>{formatCurrency(kpis.lucroReal)}</p></div>
                    <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Lucro previsto (mesma qtd.)</p><p className="text-lg font-bold text-muted-foreground">{formatCurrency(kpis.lucroPrevisto)}</p></div>
                    <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Diferença</p><p className={cn('flex items-center gap-1 text-lg font-bold', kpis.diferenca < 0 ? 'text-destructive' : 'text-green-600')}>{kpis.diferenca < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}{formatCurrency(kpis.diferenca)}</p></div>
                    <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Sem compra nem NF</p><p className="text-lg font-bold text-amber-600">{kpis.semCompra}</p></div>
                </div>
            </div>

            {alertas.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Atenção: o custo real passou do previsto</p>
                    <ul className="list-disc pl-6">
                        {alertas.map(l => (
                            <li key={l.id}>
                                <span className="font-medium">{l.descricaoSnapshot}</span>:{' '}
                                {l.r.situacao === 'PREJUIZO'
                                    ? `prejuízo de ${formatCurrency(Math.abs(l.r.lucroRealUnit ?? 0))} por unidade`
                                    : `lucro de ${formatCurrency(l.r.lucroRealUnit ?? 0)} por unidade, ${formatCurrency(Math.abs(l.r.diferencaLucroUnit ?? 0))} abaixo do previsto`}
                                {l.r.saldoComprar > 0 ? ` (ainda faltam ${l.r.saldoComprar} para comprar)` : ''}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div>
                <h3 className="mb-2 text-sm font-semibold">Custo real por item</h3>
                <p className="mb-2 text-xs text-muted-foreground">
                    Ao lançar uma NF, a quantidade faturada entra aqui como Estimado pela NF e deduz do saldo do empenho, com o custo previsto da ATA. Quando você lança a compra real, o custo real substitui o estimado. Custo real total = custo médio das compras (ponderado pela quantidade) + frete e rateios, com os mesmos percentuais da precificação. O imposto usa a alíquota do item. O lucro mostrado já vale no painel e nos relatórios.
                </p>
                <div className="w-full max-w-full overflow-x-auto rounded-md border"><DataTable columns={colsItens} data={linhas} emptyStateMessage="Importe os itens do empenho para registrar as compras." /></div>
            </div>

            <div>
                <h3 className="mb-2 text-sm font-semibold">Histórico de compras</h3>
                <div className="w-full max-w-full overflow-x-auto rounded-md border"><DataTable columns={colsCompras} data={comprasOrdenadas} emptyStateMessage="Nenhuma compra registrada ainda." /></div>
            </div>

            <CompraRealDialog
                open={dialogOpen}
                onOpenChange={(o) => { setDialogOpen(o); if (!o) setTimeout(() => { setEditing(null); setItemInicial(null); }, 300); }}
                empenho={empenho}
                itemIdInicial={itemInicial}
                compraToEdit={editing}
                fornecedoresSugeridos={sugestoes}
                onSubmit={async (c) => {
                    const novas = editing ? compras.map(x => x.id === c.id ? c : x) : [...compras, c];
                    await salvar(novas);
                    toast({ title: editing ? 'Compra atualizada' : 'Compra registrada' });
                }}
            />

            <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir esta compra?</AlertDialogTitle>
                        <AlertDialogDescription>O histórico dessa compra será removido e o custo real do item será recalculado.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={async () => { if (!deleting) return; const alvo = deleting; setDeleting(null); await salvar(compras.filter(c => c.id !== alvo.id)); toast({ title: 'Compra excluída' }); }}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
