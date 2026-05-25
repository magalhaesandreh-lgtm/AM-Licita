'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format as formatDate, parseISO } from 'date-fns';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FormDialog } from '@/components/ui/form-dialog';
import { DecimalInput } from '@/components/ui/decimal-input';
import { useToast } from '@/hooks/use-toast';
import { cn, formatCurrency } from '@/lib/utils';
import type { Empenho, NotaFiscal } from '@/lib/models';

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

interface NotaFiscalDialogProps {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    empenho: Empenho;
    nfToEdit?: NotaFiscal | null;
    onSuccess: (nf: any) => Promise<void>;
}

export function NotaFiscalDialog({ open, onOpenChange, empenho, nfToEdit, onSuccess }: NotaFiscalDialogProps) {
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
                form.reset({ numeroNF: nfToEdit.numeroNF, dataNFISO: parseISO(nfToEdit.dataNFISO), pago: nfToEdit.pago, dataPagamentoISO: nfToEdit.dataPagamentoISO ? parseISO(nfToEdit.dataPagamentoISO) : null, itens: prefilledItens });
            } else {
                form.reset({ numeroNF: '', dataNFISO: new Date(), pago: false, dataPagamentoISO: null, itens: empenho.itens.map(ei => ({ empenhoItemId: ei.id, qtdNestaNF: 0, dataEntregaISO: new Date() })) });
            }
        }
    }, [open, empenho, nfToEdit, form]);

    const watchedItens = form.watch('itens') || [];
    const watchedPago = form.watch('pago');

    const resumo = watchedItens.reduce((acc, item) => {
        if (item.qtdNestaNF > 0) {
            const ei = empenho.itens.find(e => e.id === item.empenhoItemId);
            if (ei) { acc.qtdItens++; acc.unidades += item.qtdNestaNF; acc.valorTotal += (item.qtdNestaNF * ei.precoVendaUnitSnapshot); }
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
                    toast({ title: "Limite Excedido", description: `O item "${ei.descricaoSnapshot}" possui apenas ${saldoDisponivel} unidades disponíveis.`, variant: "destructive" });
                    return;
                }
            }
        }
        if (!hasItem) { toast({ title: "Nenhum item", description: "Informe pelo menos um item entregue para salvar a NF.", variant: "destructive" }); return; }

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
                                    if (saldoParaEdicao <= 0) return null;
                                    return (
                                        <div key={ei.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center p-3 border rounded-md bg-background text-sm">
                                            <div className="min-w-0">
                                                <p className="font-semibold truncate" title={ei.descricaoSnapshot}>{ei.descricaoSnapshot}</p>
                                                <div className="flex gap-2 text-xs text-muted-foreground mt-1">
                                                    <span>Unidade: {ei.unidadeSnapshot}</span><span>|</span>
                                                    <span>Empenhado: {ei.qtdEmpenhada}</span><span>|</span>
                                                    <span>Saldo Max: {saldoParaEdicao}</span>
                                                </div>
                                            </div>
                                            <FormField control={form.control} name={`itens.${idx}.qtdNestaNF`} render={({ field }) => (
                                                <FormItem className="w-24"><FormLabel className="text-[10px] leading-none">Qtd Entregue</FormLabel><FormControl><DecimalInput value={field.value} onChange={field.onChange} /></FormControl></FormItem>
                                            )} />
                                            <FormField control={form.control} name={`itens.${idx}.dataEntregaISO`} render={({ field }) => (
                                                <FormItem className="w-36"><FormLabel className="text-[10px] leading-none">Data Entrega</FormLabel><FormControl><Input type="date" className="h-9" value={field.value ? formatDate(field.value, 'yyyy-MM-dd') : ''} onChange={e => e.target.value ? field.onChange(parseISO(e.target.value)) : null} /></FormControl></FormItem>
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
                        <div><p className="text-sm font-semibold">Resumo da Nota Fiscal</p><p className="text-xs text-muted-foreground">Revise antes de salvar</p></div>
                        <div className="text-right flex gap-6">
                            <div><span className="block text-[10px] uppercase text-muted-foreground">Itens / Qtde</span><span className="font-bold">{resumo.qtdItens} / {resumo.unidades}</span></div>
                            <div><span className="block text-[10px] uppercase text-muted-foreground">Valor Faturado (NF)</span><span className="font-bold text-green-600">{formatCurrency(resumo.valorTotal)}</span></div>
                        </div>
                    </div>
                </form>
            </Form>
        </FormDialog>
    );
}
