'use client';

import * as React from 'react';
import { Trophy } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ItemPrecificacao } from '@/lib/models';
import type { CalculatedItemMetrics } from '@/lib/pricing-calculator';
import { lanceParaMargem, lucroDoLance, margemDoLance } from '@/lib/calculadora-lances';

type ItemCalc = ItemPrecificacao & { metrics: CalculatedItemMetrics };

const brl = (v: number | null | undefined, casas = 2) =>
    v === null || v === undefined || Number.isNaN(v) ? '-' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas });
const pctTxt = (v: number | null | undefined) =>
    v === null || v === undefined || Number.isNaN(v) ? '-' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

interface ValorGanhoDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    item: ItemCalc | null;
    margemDesejadaPct: number;
    orcamentoSigiloso: boolean;
    /** valorUnit = null remove o valor ganho e o item volta ao preço calculado. */
    onSalvar: (item: ItemCalc, valorUnit: number | null) => Promise<void>;
}

/**
 * Informar o valor ganho na licitação e ver, na hora, o resultado inverso: com o custo cadastrado
 * (custos do cliente ou da AM), quanto de lucro e de margem esse valor dá.
 */
export function ValorGanhoDialog({ open, onOpenChange, item, margemDesejadaPct, orcamentoSigiloso, onSalvar }: ValorGanhoDialogProps) {
    const [modo, setModo] = React.useState<'UNIT' | 'TOTAL'>('UNIT');
    const [valor, setValor] = React.useState<number>(0);
    const [salvando, setSalvando] = React.useState(false);

    React.useEffect(() => {
        if (open && item) { setModo('UNIT'); setValor(item.precoFinalVendidoReal || 0); }
    }, [open, item]);

    if (!item) return <Dialog open={open} onOpenChange={onOpenChange} />;

    const qtd = item.qtd || 0;
    const aliquota = item.aliquotaPct || 0;
    const temCusto = item.custoUnitBase > 0;
    const custoTotal = item.metrics.custoTotalUnit;
    const valorUnit = modo === 'UNIT' ? valor : (qtd > 0 ? valor / qtd : 0);
    const precoCalculado = temCusto ? lanceParaMargem(custoTotal, aliquota, margemDesejadaPct) : null;
    const referencia = !orcamentoSigiloso && item.precoReferencia && item.precoReferencia > 0 ? item.precoReferencia : null;
    const lucroUnit = temCusto && valorUnit > 0 ? lucroDoLance(custoTotal, aliquota, valorUnit) : null;
    const margem = temCusto && valorUnit > 0 ? margemDoLance(custoTotal, aliquota, valorUnit) : null;
    const imposto = valorUnit * aliquota / 100;

    let conclusao = '';
    let corConclusao = 'border-muted bg-muted/40';
    if (valorUnit > 0 && temCusto && margem !== null && lucroUnit !== null) {
        if (lucroUnit < 0) { conclusao = `Com esse valor o item dá PREJUÍZO de ${brl(Math.abs(lucroUnit), 4)} por unidade (${brl(Math.abs(lucroUnit * qtd))} no total). O custo total por unidade é ${brl(custoTotal, 4)}.`; corConclusao = 'border-red-300 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100'; }
        else if (margem < margemDesejadaPct - 1e-9) { conclusao = `Dá lucro de ${pctTxt(margem)} (${brl(lucroUnit * qtd)} no total), abaixo da margem desejada de ${pctTxt(margemDesejadaPct)}.`; corConclusao = 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100'; }
        else { conclusao = `Dá lucro de ${pctTxt(margem)} (${brl(lucroUnit * qtd)} no total), igual ou acima da margem desejada de ${pctTxt(margemDesejadaPct)}.`; corConclusao = 'border-green-300 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100'; }
    } else if (valorUnit > 0 && !temCusto) {
        conclusao = 'Este item está sem custo cadastrado. Ao salvar, o sistema estima o custo, o imposto e o lucro a partir do valor ganho (aparece como ESTIMADO). Para ver o lucro real, informe o custo no item.';
        corConclusao = 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100';
    }

    const salvar = async (v: number | null) => {
        setSalvando(true);
        try { await onSalvar(item, v); onOpenChange(false); } finally { setSalvando(false); }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" /> Valor ganho na licitação · Item {item.itemNumero}</DialogTitle>
                    <DialogDescription className="line-clamp-2">{item.descricao}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="flex rounded-md border p-0.5">
                            <Button type="button" size="sm" variant={modo === 'UNIT' ? 'default' : 'ghost'} onClick={() => { if (modo !== 'UNIT') { setValor(qtd > 0 ? valor / qtd : 0); setModo('UNIT'); } }}>Valor unitário</Button>
                            <Button type="button" size="sm" variant={modo === 'TOTAL' ? 'default' : 'ghost'} onClick={() => { if (modo !== 'TOTAL') { setValor(valor * qtd); setModo('TOTAL'); } }}>Valor total do item</Button>
                        </div>
                        <div className="min-w-[200px] flex-1 space-y-1">
                            <Label>{modo === 'UNIT' ? 'Valor unitário ganho (R$)' : `Valor total ganho do item (R$, ${qtd.toLocaleString('pt-BR')} ${item.unidade})`}</Label>
                            <CurrencyInput autoFocus value={valor || undefined} onChange={setValor} />
                        </div>
                    </div>
                    {modo === 'TOTAL' && valorUnit > 0 && <p className="text-xs text-muted-foreground">Equivale a {brl(valorUnit, 4)} por {item.unidade}. É o valor unitário que fica gravado no item.</p>}

                    <Table>
                        <TableBody>
                            <TableRow><TableCell>Custo total por unidade (produto + frete + despesas + custos do certame)</TableCell><TableCell className="text-right tabular-nums">{temCusto ? brl(custoTotal, 4) : 'sem custo'}</TableCell></TableRow>
                            <TableRow><TableCell>Preço calculado para {pctTxt(margemDesejadaPct)} de lucro</TableCell><TableCell className="text-right tabular-nums">{brl(precoCalculado, 4)}</TableCell></TableRow>
                            <TableRow><TableCell>Preço de referência do edital</TableCell><TableCell className="text-right tabular-nums">{referencia === null ? (orcamentoSigiloso ? 'Sigiloso' : '-') : brl(referencia)}</TableCell></TableRow>
                            <TableRow className="bg-muted/50 font-semibold"><TableCell>Valor ganho por unidade</TableCell><TableCell className="text-right tabular-nums">{valorUnit > 0 ? brl(valorUnit, 4) : '-'}</TableCell></TableRow>
                            <TableRow><TableCell>(-) Imposto ({pctTxt(aliquota)})</TableCell><TableCell className="text-right tabular-nums">{valorUnit > 0 ? brl(imposto, 4) : '-'}</TableCell></TableRow>
                            <TableRow><TableCell>(-) Custo total</TableCell><TableCell className="text-right tabular-nums">{temCusto ? brl(custoTotal, 4) : '-'}</TableCell></TableRow>
                            <TableRow className={cn('font-semibold', (lucroUnit ?? 0) < 0 && 'text-destructive')}><TableCell>(=) Lucro por unidade</TableCell><TableCell className="text-right tabular-nums">{brl(lucroUnit, 4)}</TableCell></TableRow>
                            <TableRow className={cn('font-semibold', (lucroUnit ?? 0) < 0 && 'text-destructive')}><TableCell>Lucro total do item ({qtd.toLocaleString('pt-BR')} {item.unidade})</TableCell><TableCell className="text-right tabular-nums">{lucroUnit === null ? '-' : brl(lucroUnit * qtd)}</TableCell></TableRow>
                            <TableRow><TableCell>Valor total do item</TableCell><TableCell className="text-right tabular-nums">{valorUnit > 0 ? brl(valorUnit * qtd) : '-'}</TableCell></TableRow>
                            <TableRow className="font-semibold"><TableCell>Margem de lucro (lucro ÷ valor ganho)</TableCell><TableCell className="text-right tabular-nums">{pctTxt(margem)}</TableCell></TableRow>
                        </TableBody>
                    </Table>
                    {conclusao && <div className={cn('rounded-md border p-3 text-sm', corConclusao)}>{conclusao}</div>}
                    <p className="text-xs text-muted-foreground">Ao salvar, o item fica como GANHO e a planilha, o resumo do certame, os relatórios e o empenho passam a usar o valor ganho. Os custos continuam sendo os cadastrados (do cliente ou da AM Contratos).</p>
                </div>

                <DialogFooter className="gap-2 sm:justify-between">
                    {item.precoFinalVendidoReal ? <Button variant="outline" className="text-destructive" disabled={salvando} onClick={() => salvar(null)}>Remover valor ganho</Button> : <span />}
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                        <Button disabled={salvando || !(valorUnit > 0)} onClick={() => salvar(Math.round(valorUnit * 10000) / 10000)}>Salvar valor ganho</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
