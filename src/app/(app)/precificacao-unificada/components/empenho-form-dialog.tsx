'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format as formatDate, parseISO } from 'date-fns';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/hooks/use-toast';
import { empenhoRepository } from '@/lib/repositories/empenho-repository';
import type { CertameUnificado, Empenho } from '@/lib/models';

const empenhoFormSchema = z.object({
    numeroEmpenho: z.string().min(1, 'O número é obrigatório.'),
    orgao: z.string().min(1, 'O órgão é obrigatório.'),
    dataSolicitacaoISO: z.date({ required_error: 'A data é obrigatória.' }),
    prazoEntregaDias: z.number().min(0, 'Prazo inválido.'),
    tipoEmpenho: z.enum(["SRP", "CONTRATO_UNICO", "ENTREGA_TOTAL", "OUTRO"]),
    statusEntrega: z.enum(['NAO_INICIADO', 'PARCIAL', 'CONCLUIDO', 'ATRASADO']),
    statusFinanceiro: z.enum(['PENDENTE', 'FATURADO', 'PARCIAL', 'PAGO'])
});

interface EmpenhoFormDialogProps {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    certame: CertameUnificado;
    empenhoToEdit?: Empenho | null;
    onSuccess: () => void;
}

export function EmpenhoFormDialog({ open, onOpenChange, certame, empenhoToEdit, onSuccess }: EmpenhoFormDialogProps) {
    const { toast } = useToast();
    const [isSaving, setIsSaving] = React.useState(false);

    const form = useForm<z.infer<typeof empenhoFormSchema>>({
        resolver: zodResolver(empenhoFormSchema),
        defaultValues: empenhoToEdit ? { ...empenhoToEdit, dataSolicitacaoISO: parseISO(empenhoToEdit.dataSolicitacaoISO) }
            : { numeroEmpenho: '', orgao: certame.orgao, dataSolicitacaoISO: new Date(), prazoEntregaDias: 30, tipoEmpenho: 'SRP', statusEntrega: 'NAO_INICIADO', statusFinanceiro: 'PENDENTE' }
    });

    React.useEffect(() => {
        if (open) {
            form.reset(empenhoToEdit
                ? { ...empenhoToEdit, dataSolicitacaoISO: parseISO(empenhoToEdit.dataSolicitacaoISO) }
                : { numeroEmpenho: '', orgao: certame.orgao, dataSolicitacaoISO: new Date(), prazoEntregaDias: 30, tipoEmpenho: 'SRP', statusEntrega: 'NAO_INICIADO', statusFinanceiro: 'PENDENTE' });
        }
    }, [open, empenhoToEdit, certame.orgao, form]);

    const onSubmit = async (v: any) => {
        setIsSaving(true);
        try {
            const data = { ...v, dataSolicitacaoISO: formatDate(v.dataSolicitacaoISO, 'yyyy-MM-dd') };
            if (empenhoToEdit) {
                await empenhoRepository.update(certame.id, empenhoToEdit.id, data);
                toast({ title: 'Empenho atualizado!' });
            } else {
                await empenhoRepository.add(certame.id, { ...data, itens: [] });
                toast({ title: 'Empenho criado!' });
            }
            onSuccess();
            onOpenChange(false);
        } catch {
            toast({ title: 'Erro ao salvar empenho', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <FormDialog open={open} onOpenChange={onOpenChange} title={empenhoToEdit ? "Editar Empenho" : "Novo Empenho"} formId="e-form" isSaving={isSaving}>
            <Form {...form}>
                <form id="e-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="numeroEmpenho" render={({ field }) => (
                            <FormItem><FormLabel>Nº Empenho*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="tipoEmpenho" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo*</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="SRP">SRP</SelectItem>
                                        <SelectItem value="CONTRATO_UNICO">Contrato Único</SelectItem>
                                        <SelectItem value="ENTREGA_TOTAL">Entrega Total</SelectItem>
                                        <SelectItem value="OUTRO">Outro</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </div>
                    <FormField control={form.control} name="orgao" render={({ field }) => (
                        <FormItem><FormLabel>Órgão Solicitante*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="dataSolicitacaoISO" render={({ field }) => (
                            <FormItem><FormLabel>Data da Solicitação*</FormLabel><FormControl><Input type="date" value={field.value ? formatDate(field.value, 'yyyy-MM-dd') : ''} onChange={e => field.onChange(parseISO(e.target.value))} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="prazoEntregaDias" render={({ field }) => (
                            <FormItem><FormLabel>Prazo Entrega (Dias)*</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="statusEntrega" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Status Entrega*</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="NAO_INICIADO">Não Iniciado</SelectItem>
                                        <SelectItem value="PARCIAL">Parcial</SelectItem>
                                        <SelectItem value="CONCLUIDO">Concluído</SelectItem>
                                        <SelectItem value="ATRASADO">Atrasado</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="statusFinanceiro" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Status Financeiro*</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="PENDENTE">Pendente</SelectItem>
                                        <SelectItem value="FATURADO">Faturado</SelectItem>
                                        <SelectItem value="PARCIAL">Parcial</SelectItem>
                                        <SelectItem value="PAGO">Pago</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </div>
                </form>
            </Form>
        </FormDialog>
    );
}
