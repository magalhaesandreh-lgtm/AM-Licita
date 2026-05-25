'use client';

import * as React from 'react';
import { PlusCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import type { Empenho, EmpenhoItem } from '@/lib/models';

interface ImportarItensDialogProps {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    certameItens: any[];
    empenho: Empenho;
    onSuccess: (it: EmpenhoItem[]) => Promise<void>;
}

export function ImportarItensDialog({ open, onOpenChange, certameItens, empenho, onSuccess }: ImportarItensDialogProps) {
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
                                            <Checkbox onCheckedChange={(c) => setSel(prev => ({ ...prev, [i.id]: { selected: !!c, qtd: i.qtd } }))} />
                                        </TableCell>
                                        <TableCell className="font-medium py-4"><p className="text-sm leading-relaxed">{i.descricao}</p></TableCell>
                                        <TableCell className="text-center">{i.unidade}</TableCell>
                                        <TableCell className="text-right">{i.qtd}</TableCell>
                                        <TableCell className="text-right whitespace-nowrap font-semibold">{formatCurrency(i.metrics.precoFinalUnit)}</TableCell>
                                        <TableCell>
                                            <Input type="number" className="h-8 w-24" defaultValue={i.qtd} onChange={e => setSel(prev => ({ ...prev, [i.id]: { ...prev[i.id], qtd: Number(e.target.value) } }))} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
                <DialogFooter className="p-6 border-t bg-muted/5 mt-auto">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleConfirm}><PlusCircle className="mr-2 h-4 w-4" />Importar Selecionados</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
