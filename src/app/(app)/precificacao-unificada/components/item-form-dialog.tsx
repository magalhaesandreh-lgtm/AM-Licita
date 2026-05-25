'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { CurrencyInput } from '@/components/ui/currency-input';
import { DecimalInput } from '@/components/ui/decimal-input';
import { PercentInput } from '@/components/ui/percent-input';
import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/hooks/use-toast';
import { impostoRepository } from '@/lib/repositories/imposto-repository';
import type { ItemPrecificacao, Produto, Categoria, Fornecedor } from '@/lib/models';
import type { CertameComCalculo } from '@/lib/pricing-calculator';

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
    anexoSimples: z.enum(["I", "II", "III", "IV", "V"]),
    aliquotaPct: z.number().min(0),
    precoReferencia: z.number().optional().nullable(),
    precoFinalVendidoReal: z.number().optional().nullable(),
});
type ItemFormValues = z.infer<typeof itemFormSchema>;

interface ItemFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    certame: CertameComCalculo;
    item: ItemPrecificacao | null;
    context: { produtos: Produto[]; categorias: Categoria[]; fornecedores: Fornecedor[]; clientes: any[] };
    onSuccess: (updatedItems: ItemPrecificacao[]) => Promise<void>;
}

export function ItemFormDialog({ open, onOpenChange, certame, item, context, onSuccess }: ItemFormDialogProps) {
    const [isSaving, setIsSaving] = React.useState(false);
    const { toast } = useToast();
    const [impostoSettings, setImpostoSettings] = React.useState<any>(null);

    React.useEffect(() => { impostoRepository.getSettings().then(setImpostoSettings); }, []);

    const form = useForm<ItemFormValues>({
        resolver: zodResolver(itemFormSchema),
        defaultValues: item
            ? { ...item, precoFinalVendidoReal: item.precoFinalVendidoReal ?? null, loteNumero: item.loteNumero ?? null }
            : { itemNumero: (certame.itens.length > 0 ? Math.max(...certame.itens.map(i => i.itemNumero)) : 0) + 1, loteNumero: null, descricao: '', categoriaId: '', status: 'PENDENTE', unidade: '', qtd: 1, custoUnitBase: 0, tipoItem: 'PRODUTO', anexoSimples: 'I', aliquotaPct: 4.5 }
    });

    React.useEffect(() => {
        if (open) {
            form.reset(item
                ? { ...item, precoFinalVendidoReal: item.precoFinalVendidoReal ?? null, loteNumero: item.loteNumero ?? null }
                : { itemNumero: (certame.itens.length > 0 ? Math.max(...certame.itens.map(i => i.itemNumero)) : 0) + 1, loteNumero: null, descricao: '', categoriaId: '', status: 'PENDENTE', unidade: '', qtd: 1, custoUnitBase: 0, tipoItem: 'PRODUTO', anexoSimples: 'I', aliquotaPct: 4.5 });
        }
    }, [open, item, certame.itens, form]);

    const wt = form.watch('tipoItem');
    const ws = form.watch('status');

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
                                        <FormControl><CurrencyInput value={field.value ?? undefined} onChange={v => field.onChange(v)} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            </CardContent>
                        </Card>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="itemNumero" render={({ field }) => (
                            <FormItem><FormLabel>Nº Item*</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="loteNumero" render={({ field }) => (
                            <FormItem><FormLabel>Nº Lote</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                    <FormField control={form.control} name="descricao" render={({ field }) => (
                        <FormItem><FormLabel>Descrição*</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="categoriaId" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Categoria*</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                    <SelectContent>{context.categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="unidade" render={({ field }) => (
                            <FormItem><FormLabel>Unidade*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                    <FormField control={form.control} name="status" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Status*</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
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
                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
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
                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                    <SelectContent>{["I", "II", "III", "IV", "V"].map(a => <SelectItem key={a} value={a}>{`Anexo ${a}`}</SelectItem>)}</SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="aliquotaPct" render={({ field }) => (
                            <FormItem><FormLabel>Alíquota (%)*</FormLabel><FormControl><PercentInput value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                    <Separator />
                    <FormField control={form.control} name="qtd" render={({ field }) => (
                        <FormItem><FormLabel>Quantidade*</FormLabel><FormControl><DecimalInput value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="custoUnitBase" render={({ field }) => (
                        <FormItem><FormLabel>Custo Unitário Base*</FormLabel><FormControl><CurrencyInput value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="margemManualPct" render={({ field }) => (
                        <FormItem><FormLabel>Margem Manual (%)</FormLabel><FormControl><PercentInput value={field.value} onChange={v => field.onChange(v === 0 ? null : v)} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="precoReferencia" render={({ field }) => (
                        <FormItem><FormLabel>Preço Ref.</FormLabel><FormControl><CurrencyInput value={field.value ?? undefined} onChange={v => field.onChange(v === 0 ? null : v)} /></FormControl><FormMessage /></FormItem>
                    )} />
                </form>
            </Form>
        </FormDialog>
    );
}
