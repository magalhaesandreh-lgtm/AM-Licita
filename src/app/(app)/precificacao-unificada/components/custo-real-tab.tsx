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
import { COMO_COMPROU_LABEL, aplicarCustoReal, resumoCustoRealItem, type ResumoCustoRealItem, resultadoNFsItem, type ResultadoNFsItem } from '@/lib/custo-real';
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
    return <Badge variant="outline" className="whitespace-nowrap text-muted-foreground">Sem compra</Badge>;
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
        let totalComprado = 0, lucroReal = 0, lucroPrevisto = 0, prejuizo = 0, abaixo = 0, semCompra = 0;
        linhas.forEach(l => {
            if (l.r.situacao === 'SEM_COMPRA') { semCompra++; return; }
            if (l.r.lucroRealUnit == null) return;
            totalComprado += compras.filter(c => c.empenhoItemId === l.id).reduce((a, c) => a + c.qtd * c.custoUnit, 0);
            lucroReal += l.r.lucroRealUnit * l.r.qtdComprada;
            lucroPrevisto += l.lucroUnitSnapshot * l.r.qtdComprada;
            if (l.r.situacao === 'PREJUIZO') prejuizo++;
            if (l.r.situacao === 'ABAIXO_PREVISTO') abaixo++;
        });
        return { totalComprado, lucroReal, lucroPrevisto, prejuizo, abaixo, semCompra, diferenca: lucroReal - lucroPrevisto };
    }, [linhas, compras]);

    const resultadoNFs = React.useMemo(() => {
        const linhasNF = linhas.map(l => ({ ...l, n: resultadoNFsItem(l, empenho.nfs, aliquotaDoItem(l.precificacaoItemId), l.r.qtdComprada) })).filter(l => l.n.qtdFaturada > 0);
        const soma = (f: (x: ResultadoNFsItem) => number, origem?: 'REAL' | 'PREVISTO') => linhasNF.filter(l => !origem || l.n.origem === origem).reduce((a, l) => a + f(l.n), 0);
        return {
            linhasNF,
            faturado: soma(n => n.venda),
            lucro: soma(n => n.lucro),
            lucroReal: soma(n => n.lucro, 'REAL'),
            lucroPrevisto: soma(n => n.lucro, 'PREVISTO'),
            itensPrevisto: linhasNF.filter(l => l.n.origem === 'PREVISTO').length,
        };
    }, [linhas, empenho.nfs, aliquotaDoItem]);

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
        { id: 'comp', header: 'Comprado', align: 'right', cell: (row) => <span className="tabular-nums">{row.r.qtdComprada}</span> },
        { id: 'saldo', header: 'A comprar', align: 'right', cell: (row) => <span className={cn('tabular-nums', row.r.saldoComprar > 0 && 'font-bold text-destructive')}>{row.r.saldoComprar}</span> },
        { id: 'medio', header: 'Custo médio', align: 'right', cell: (row) => <span className="tabular-nums">{row.r.custoMedioUnit != null ? formatCurrency(row.r.custoMedioUnit) : '-'}</span> },
        { id: 'real', header: 'Custo real total', align: 'right', cell: (row) => <span className="tabular-nums" title="Custo médio + frete e rateios">{row.r.custoTotalRealUnit != null ? formatCurrency(row.r.custoTotalRealUnit) : '-'}</span> },
        { id: 'prev', header: 'Custo previsto', align: 'right', cell: (row) => <span className="tabular-nums text-muted-foreground">{formatCurrency(row.custoUnitSnapshot)}</span> },
        { id: 'lreal', header: 'Lucro real unit.', align: 'right', cell: (row) => <span className={cn('tabular-nums font-semibold', (row.r.lucroRealUnit ?? 0) < 0 && 'text-destructive')}>{row.r.lucroRealUnit != null ? formatCurrency(row.r.lucroRealUnit) : '-'}</span> },
        { id: 'lprev', header: 'Lucro previsto unit.', align: 'right', cell: (row) => <span className="tabular-nums text-muted-foreground">{formatCurrency(row.lucroUnitSnapshot)}</span> },
        { id: 'marg', header: 'Margem real', align: 'right', cell: (row) => <span className="tabular-nums">{row.r.margemRealPct != null ? `${row.r.margemRealPct.toFixed(2)}%` : '-'}</span> },
        { id: 'sit', header: 'Situação', cell: (row) => situacaoBadge(row.r.situacao) },
        { id: 'acao', header: '', align: 'right', cell: (row) => (
            <Button variant="outline" size="sm" onClick={() => abrirNova(row.id)} disabled={row.r.saldoComprar <= 0}><PlusCircle className="mr-1 h-4 w-4" /> Compra</Button>
        ) },
    ];

    type LinhaNF = (typeof resultadoNFs.linhasNF)[number];
    const colsNFs: ColumnDef<LinhaNF>[] = [
        { accessorKey: 'descricaoSnapshot', header: 'Item', cell: (row) => <span className="block max-w-[260px] truncate font-medium" title={row.descricaoSnapshot}>{row.descricaoSnapshot}</span> },
        { id: 'qf', header: 'Qtd faturada', align: 'right', cell: (row) => <span className="tabular-nums">{row.n.qtdFaturada}</span> },
        { id: 'cu', header: 'Custo unit. usado', align: 'right', cell: (row) => <span className="tabular-nums">{formatCurrency(row.n.custoUnitUsado)}</span> },
        { id: 'or', header: 'Origem do custo', cell: (row) => row.n.origem === 'REAL'
            ? <Badge className="whitespace-nowrap bg-green-100 text-green-800 hover:bg-green-100" title={row.n.faturadoAcimaDoComprado ? 'Faturou mais do que o comprado: o restante usa o custo médio das compras' : undefined}>Custo real{row.n.faturadoAcimaDoComprado ? ' (parcial)' : ''}</Badge>
            : <Badge variant="outline" className="whitespace-nowrap text-muted-foreground" title="Sem compra lançada: usando o custo da ATA / precificação">Previsto (ATA)</Badge> },
        { id: 'vd', header: 'Venda', align: 'right', cell: (row) => <span className="tabular-nums">{formatCurrency(row.n.venda)}</span> },
        { id: 'lc', header: 'Lucro nas NFs', align: 'right', cell: (row) => <span className={cn('tabular-nums font-semibold', row.n.lucro < 0 && 'text-destructive')}>{formatCurrency(row.n.lucro)}</span> },
        { id: 'mg', header: 'Margem', align: 'right', cell: (row) => <span className="tabular-nums">{row.n.margemPct != null ? `${row.n.margemPct.toFixed(2)}%` : '-'}</span> },
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
                    <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Total comprado</p><p className="text-lg font-bold">{formatCurrency(kpis.totalComprado)}</p></div>
                    <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Lucro real (itens comprados)</p><p className={cn('text-lg font-bold', kpis.lucroReal < 0 ? 'text-destructive' : 'text-green-600')}>{formatCurrency(kpis.lucroReal)}</p></div>
                    <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Lucro previsto (mesma qtd.)</p><p className="text-lg font-bold text-muted-foreground">{formatCurrency(kpis.lucroPrevisto)}</p></div>
                    <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Diferença</p><p className={cn('flex items-center gap-1 text-lg font-bold', kpis.diferenca < 0 ? 'text-destructive' : 'text-green-600')}>{kpis.diferenca < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}{formatCurrency(kpis.diferenca)}</p></div>
                    <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Sem compra ainda</p><p className="text-lg font-bold text-amber-600">{kpis.semCompra}</p></div>
                </div>
            </div>

            <div>
                <h3 className="mb-1 text-sm font-semibold">Resultado das NFs lançadas</h3>
                <p className="mb-2 text-xs text-muted-foreground">
                    O lucro de cada NF usa o custo real quando o item já tem compras lançadas. Sem compra, o sistema usa o custo previsto da ATA (precificação), então o lucro já aparece assim que a NF é lançada e vai se ajustando conforme você registra as compras.
                </p>
                <div className="mb-3 grid w-full grid-cols-2 gap-x-6 gap-y-2 rounded-lg border bg-muted/10 p-4 md:grid-cols-4">
                    <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Faturado nas NFs</p><p className="text-lg font-bold">{formatCurrency(resultadoNFs.faturado)}</p></div>
                    <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Lucro nas NFs</p><p className={cn('text-lg font-bold', resultadoNFs.lucro < 0 ? 'text-destructive' : 'text-green-600')}>{formatCurrency(resultadoNFs.lucro)}</p></div>
                    <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Com custo real</p><p className="text-lg font-bold">{formatCurrency(resultadoNFs.lucroReal)}</p></div>
                    <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Com custo previsto (ATA)</p><p className="text-lg font-bold text-amber-600">{formatCurrency(resultadoNFs.lucroPrevisto)}</p></div>
                </div>
                <div className="w-full max-w-full overflow-x-auto rounded-md border"><DataTable columns={colsNFs} data={resultadoNFs.linhasNF} emptyStateMessage="Nenhuma NF lançada para este empenho ainda." /></div>
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
                    Custo real total = custo médio das compras (ponderado pela quantidade) + frete e rateios, com os mesmos percentuais da precificação. O imposto usa a alíquota do item. O lucro real dos itens comprados passa a valer no painel e nos relatórios no lugar do previsto.
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
