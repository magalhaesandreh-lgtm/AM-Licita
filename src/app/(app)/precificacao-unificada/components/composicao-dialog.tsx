'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { cn, formatCurrency } from '@/lib/utils';
import type { ItemPrecificacao } from '@/lib/models';
import type { CalculatedItemMetrics } from '@/lib/pricing-calculator';

interface ComposicaoDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    item: (ItemPrecificacao & { metrics: CalculatedItemMetrics }) | null;
}

export function ComposicaoDialog({ open, onOpenChange, item: incomingItem }: ComposicaoDialogProps) {
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
    );
}
