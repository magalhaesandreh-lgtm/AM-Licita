'use client';

import * as React from 'react';
import { ClipboardList, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ItemPrecificacao } from '@/lib/models';
import type { CertameComCalculo } from '@/lib/pricing-calculator';
import { lucroDoLance, margemDoLance } from '@/lib/calculadora-lances';

/**
 * Resultado da disputa, item a item e de uma vez: em quais itens a empresa participou, quais ganhou
 * (com o valor ganho) e quais perdeu. Itens não participados e perdidos saem dos totais do certame; os
 * ganhos passam a usar o valor ganho (valor da ata e lucro reais).
 */

type Linha = { participou: boolean; resultado: 'PENDENTE' | 'GANHO' | 'PERDIDO'; valor: string };

const brl = (v: number | null | undefined, casas = 2) =>
    v === null || v === undefined || Number.isNaN(v) ? '-' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas });
const pctTxt = (v: number | null | undefined) =>
    v === null || v === undefined || Number.isNaN(v) ? '-' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const numTxt = (v: number, casas: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas, useGrouping: false });
function lerNumero(texto: string): number | null {
    const limpo = (texto || '').replace(/R\$|\s/g, '');
    if (!limpo) return null;
    const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
    const n = Number(normal);
    return Number.isFinite(n) ? n : null;
}

function linhaInicial(item: ItemPrecificacao): Linha {
    return {
        participou: item.status !== 'NAO_PARTICIPOU',
        resultado: item.status === 'GANHO' ? 'GANHO' : item.status === 'PERDIDO' ? 'PERDIDO' : 'PENDENTE',
        valor: item.precoFinalVendidoReal && item.precoFinalVendidoReal > 0 ? numTxt(item.precoFinalVendidoReal, 4) : '',
    };
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    certame: CertameComCalculo;
    onSalvar: (itens: ItemPrecificacao[]) => Promise<void>;
}

export function ResultadoDisputaDialog({ open, onOpenChange, certame, onSalvar }: Props) {
    const itens = React.useMemo(() => [...certame.itens].sort((a, b) => (a.loteNumero || 0) - (b.loteNumero || 0) || a.itemNumero - b.itemNumero), [certame.itens]);
    const [linhas, setLinhas] = React.useState<Record<string, Linha>>({});
    const [salvando, setSalvando] = React.useState(false);

    React.useEffect(() => {
        if (open) setLinhas(Object.fromEntries(itens.map(i => [i.id, linhaInicial(i)])));
    }, [open, itens]);

    const mudar = (id: string, parcial: Partial<Linha>) => setLinhas(l => ({ ...l, [id]: { ...l[id], ...parcial } }));
    const todos = (participou: boolean) => setLinhas(l => Object.fromEntries(Object.entries(l).map(([id, v]) => [id, { ...v, participou, resultado: participou ? v.resultado : 'PENDENTE', valor: participou ? v.valor : '' }])));

    const resumo = React.useMemo(() => {
        let participando = 0, ganhos = 0, perdidos = 0, fora = 0, valorAta = 0, lucroAta = 0, semValor = 0;
        itens.forEach(i => {
            const l = linhas[i.id];
            if (!l) return;
            if (!l.participou) { fora++; return; }
            if (l.resultado === 'PERDIDO') { perdidos++; return; }
            if (l.resultado === 'GANHO') {
                ganhos++;
                const v = lerNumero(l.valor);
                if (v === null || !(v > 0)) { semValor++; return; }
                valorAta += v * i.qtd;
                if (i.custoUnitBase > 0) lucroAta += lucroDoLance(i.metrics.custoTotalUnit, i.aliquotaPct || 0, v) * i.qtd;
                return;
            }
            participando++;
        });
        return { participando, ganhos, perdidos, fora, valorAta, lucroAta, semValor };
    }, [itens, linhas]);

    const salvar = async () => {
        setSalvando(true);
        try {
            const novos = certame.itens.map(item => {
                const l = linhas[item.id];
                if (!l) return item;
                const { metrics: _m, ...resto } = item as ItemPrecificacao & { metrics?: unknown };
                if (!l.participou) return { ...resto, status: 'NAO_PARTICIPOU' as const, precoFinalVendidoReal: null as any };
                if (l.resultado === 'GANHO') {
                    const v = lerNumero(l.valor);
                    return { ...resto, status: 'GANHO' as const, precoFinalVendidoReal: v && v > 0 ? Math.round(v * 10000) / 10000 : (resto.precoFinalVendidoReal || null) as any };
                }
                return { ...resto, status: l.resultado, precoFinalVendidoReal: null as any };
            });
            await onSalvar(novos);
            onOpenChange(false);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-6xl flex-col overflow-hidden p-0" onCloseAutoFocus={e => { e.preventDefault(); document.body.style.pointerEvents = ''; }}>
                <DialogHeader className="shrink-0 px-6 pt-6">
                    <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Resultado da disputa</DialogTitle>
                    <DialogDescription>Marque em quais itens a empresa participou, o resultado de cada um e o valor ganho. Itens sem participação e perdidos saem dos totais; os ganhos passam a usar o valor ganho.</DialogDescription>
                </DialogHeader>

                <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 pb-2 text-sm">
                    <Button size="sm" variant="outline" onClick={() => todos(true)}>Participei de todos</Button>
                    <Button size="sm" variant="outline" onClick={() => todos(false)}>Não participei de nenhum</Button>
                    <span className="ml-auto flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>Em disputa: <b>{resumo.participando}</b></span>
                        <span className="text-green-700 dark:text-green-400">Ganhos: <b>{resumo.ganhos}</b></span>
                        <span className="text-red-700 dark:text-red-400">Perdidos: <b>{resumo.perdidos}</b></span>
                        <span>Sem participação: <b>{resumo.fora}</b></span>
                    </span>
                </div>

                <div className="min-h-0 flex-1 overflow-auto border-y">
                    <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                            <TableRow>
                                <TableHead className="w-[90px]">Participei</TableHead>
                                <TableHead className="w-[70px]">Item</TableHead>
                                <TableHead className="min-w-[220px]">Produto</TableHead>
                                <TableHead className="text-right">Qtd</TableHead>
                                <TableHead className="text-right">Custo total unit.</TableHead>
                                <TableHead className="text-right">Preço ref.</TableHead>
                                <TableHead className="w-[150px]">Resultado</TableHead>
                                <TableHead className="w-[150px]">Valor ganho (R$/un.)</TableHead>
                                <TableHead className="text-right">Lucro no valor ganho</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {itens.map(i => {
                                const l = linhas[i.id] || linhaInicial(i);
                                const v = l.resultado === 'GANHO' ? lerNumero(l.valor) : null;
                                const temCusto = i.custoUnitBase > 0;
                                const lucro = v && v > 0 && temCusto ? lucroDoLance(i.metrics.custoTotalUnit, i.aliquotaPct || 0, v) : null;
                                const margem = v && v > 0 && temCusto ? margemDoLance(i.metrics.custoTotalUnit, i.aliquotaPct || 0, v) : null;
                                return (
                                    <TableRow key={i.id} className={cn(!l.participou && 'opacity-50')}>
                                        <TableCell><Checkbox checked={l.participou} onCheckedChange={c => mudar(i.id, { participou: !!c, ...(c ? {} : { resultado: 'PENDENTE', valor: '' }) })} aria-label="Participei deste item" /></TableCell>
                                        <TableCell className="tabular-nums">{i.loteNumero ? `L${i.loteNumero} · ` : ''}{i.itemNumero}</TableCell>
                                        <TableCell className="max-w-[320px] truncate" title={i.descricao}>{i.descricao}</TableCell>
                                        <TableCell className="text-right tabular-nums">{i.qtd.toLocaleString('pt-BR')}</TableCell>
                                        <TableCell className="text-right tabular-nums whitespace-nowrap">{temCusto ? brl(i.metrics.custoTotalUnit, 4) : '-'}</TableCell>
                                        <TableCell className="text-right tabular-nums whitespace-nowrap">{i.precoReferencia ? brl(i.precoReferencia) : '-'}</TableCell>
                                        <TableCell>
                                            <Select value={l.resultado} disabled={!l.participou} onValueChange={r => mudar(i.id, { resultado: r as Linha['resultado'], ...(r === 'GANHO' ? {} : { valor: '' }) })}>
                                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="PENDENTE">Em disputa</SelectItem>
                                                    <SelectItem value="GANHO">Ganho</SelectItem>
                                                    <SelectItem value="PERDIDO">Perdido</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell><Input inputMode="decimal" className="h-8 text-right font-semibold" disabled={!l.participou || l.resultado !== 'GANHO'} value={l.valor} placeholder="R$" onChange={e => mudar(i.id, { valor: e.target.value })} /></TableCell>
                                        <TableCell className={cn('text-right tabular-nums whitespace-nowrap', (lucro ?? 0) < 0 && 'text-destructive')}>{lucro === null ? (l.resultado === 'GANHO' && v && !temCusto ? 'sem custo' : '-') : `${brl(lucro * i.qtd)} (${pctTxt(margem)})`}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>

                <div className="shrink-0 space-y-2 px-6 pt-3">
                    <div className="grid gap-2 sm:grid-cols-3 text-sm">
                        <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Valor da ata (itens ganhos × quantidade)</p><p className="font-bold tabular-nums">{brl(resumo.valorAta)}</p></div>
                        <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Lucro previsto nos itens ganhos</p><p className={cn('font-bold tabular-nums', resumo.lucroAta < 0 && 'text-destructive')}>{brl(resumo.lucroAta)}</p></div>
                        <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Margem nos itens ganhos</p><p className="font-bold tabular-nums">{resumo.valorAta > 0 ? pctTxt((resumo.lucroAta / resumo.valorAta) * 100) : '-'}</p></div>
                    </div>
                    {resumo.semValor > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{resumo.semValor} item(ns) marcado(s) como ganho sem valor: entram como ganhos, mas ficam fora do valor da ata até o valor ser informado.</p>}
                </div>

                <DialogFooter className="shrink-0 px-6 pb-6 pt-3">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
                    <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar resultado</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
