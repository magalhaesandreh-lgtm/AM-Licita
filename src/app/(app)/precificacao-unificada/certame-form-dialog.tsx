'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format as formatDate, parseISO } from 'date-fns';

import { FormDialog } from '@/components/ui/form-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { certameUnificadoRepository } from '@/lib/repositories/certame-unificado-repository';
import type { CertameUnificado } from '@/lib/models';

const certameFormSchema = z.object({
  orgao: z.string().min(1, 'O órgão é obrigatório.'),
  modalidade: z.string().min(1, 'A modalidade é obrigatória.'),
  numeroAno: z.string().min(1, 'O Número/Ano é obrigatório.'),
  processo: z.string().optional(),
  uasgUg: z.string().optional(),
  plataforma: z.string().optional(),
  objetoResumo: z.string().optional(),
  dataSessaoISO: z.date({ required_error: 'A data da sessão é obrigatória.' }),
  horaSessao: z.string().min(1, "A hora da sessão é obrigatória."),
  inicioVigencia: z.date().optional(),
  fimVigencia: z.date().optional(),
  observacoes: z.string().optional(),
  status: z.enum(['EM_ANDAMENTO', 'GANHO', 'PERDIDO', 'CANCELADO']),
  isRetroativo: z.boolean(),
  orcamentoSigiloso: z.boolean(),
  empresaDestinoId: z.string().optional(),
});
type CertameFormValues = z.infer<typeof certameFormSchema>;

interface CertameFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (newCertameId?: string) => void;
    certameToEdit?: CertameUnificado | null;
    clientes?: any[];
}

export function CertameFormDialog({ open, onOpenChange, onSuccess, certameToEdit, clientes = [] }: CertameFormDialogProps) {
    const [isSaving, setIsSaving] = React.useState(false);
    const { toast } = useToast();
    
    const form = useForm<CertameFormValues>({
        resolver: zodResolver(certameFormSchema),
        defaultValues: certameToEdit ? {
            ...certameToEdit,
            dataSessaoISO: parseISO(certameToEdit.dataSessaoISO),
            horaSessao: certameToEdit.horaSessao || '09:00',
            inicioVigencia: certameToEdit.inicioVigencia ? parseISO(certameToEdit.inicioVigencia) : undefined,
            fimVigencia: certameToEdit.fimVigencia ? parseISO(certameToEdit.fimVigencia) : undefined,
        } : {
            orgao: '',
            modalidade: 'PREGÃO ELETRÔNICO SRP',
            numeroAno: '',
            processo: '',
            uasgUg: '',
            plataforma: 'Compras.gov',
            objetoResumo: '',
            observacoes: '',
            dataSessaoISO: new Date(),
            horaSessao: '09:00',
            inicioVigencia: undefined,
            fimVigencia: undefined,
            status: 'EM_ANDAMENTO',
            isRetroativo: false,
            orcamentoSigiloso: false,
        }
    });
    
    React.useEffect(() => {
        form.reset(certameToEdit ? {
            ...certameToEdit,
            dataSessaoISO: parseISO(certameToEdit.dataSessaoISO),
            horaSessao: certameToEdit.horaSessao || '09:00',
            inicioVigencia: certameToEdit.inicioVigencia ? parseISO(certameToEdit.inicioVigencia) : undefined,
            fimVigencia: certameToEdit.fimVigencia ? parseISO(certameToEdit.fimVigencia) : undefined,
        } : {
            orgao: '',
            modalidade: 'PREGÃO ELETRÔNICO SRP',
            numeroAno: '',
            processo: '',
            uasgUg: '',
            plataforma: 'Compras.gov',
            objetoResumo: '',
            observacoes: '',
            dataSessaoISO: new Date(),
            horaSessao: '09:00',
            inicioVigencia: undefined,
            fimVigencia: undefined,
            status: 'EM_ANDAMENTO',
            isRetroativo: false,
            orcamentoSigiloso: false,
        });
    }, [certameToEdit, form]);

    const onSubmit = async (values: CertameFormValues) => {
        setIsSaving(true);
        try {
            const [hours, minutes] = values.horaSessao.split(':').map(Number);
            const combinedDateTime = new Date(values.dataSessaoISO);
            combinedDateTime.setHours(hours);
            combinedDateTime.setMinutes(minutes);
            combinedDateTime.setSeconds(0);
            combinedDateTime.setMilliseconds(0);

            const dataToSave = {
                ...values,
                dataSessaoISO: formatDate(values.dataSessaoISO, 'yyyy-MM-dd'),
                sessaoAt: combinedDateTime.toISOString(),
                inicioVigencia: values.inicioVigencia ? formatDate(values.inicioVigencia, 'yyyy-MM-dd') : undefined,
                fimVigencia: values.fimVigencia ? formatDate(values.fimVigencia, 'yyyy-MM-dd') : undefined,
                empresaDestinoNome: clientes.find(c => c.id === values.empresaDestinoId)?.nomeFantasia,
            };

            if (certameToEdit) {
                await certameUnificadoRepository.update(certameToEdit.id, dataToSave);
                toast({ title: 'Certame atualizado com sucesso!' });
                onSuccess(certameToEdit.id);
            } else {
                const newCertame = await certameUnificadoRepository.create(dataToSave as any);
                toast({ title: 'Certame criado com sucesso!' });
                onSuccess(newCertame.id);
            }
        } catch(e) {
            console.error(e);
            toast({ title: 'Erro ao salvar certame', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
         <FormDialog 
            open={open} 
            onOpenChange={onOpenChange} 
            title={certameToEdit ? "Editar Certame" : "Novo Certame"}
            description="Preencha os dados do processo de licitação." 
            formId="certame-form" 
            isSaving={isSaving}
        >
            <Form {...form}>
            <form id="certame-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {clientes.length > 0 && (
                    <FormField control={form.control} name="empresaDestinoId" render={({ field }) => (
                        <FormItem><FormLabel>Empresa Destino</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ''}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia}</SelectItem>)}</SelectContent>
                            </Select>
                        <FormMessage /></FormItem>
                    )} />
                )}
                <FormField control={form.control} name="orgao" render={({ field }) => (<FormItem><FormLabel>Órgão*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="modalidade" render={({ field }) => (<FormItem><FormLabel>Modalidade*</FormLabel><FormControl><Input placeholder="Pregão, Dispensa..." {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="numeroAno" render={({ field }) => (<FormItem><FormLabel>Número/Ano*</FormLabel><FormControl><Input placeholder="90001/2024" {...field} /></FormControl><FormMessage /></FormItem>)} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="processo" render={({ field }) => (<FormItem><FormLabel>Processo</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="uasgUg" render={({ field }) => (<FormItem><FormLabel>UASG/UG</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                </div>
                 <FormField control={form.control} name="objetoResumo" render={({ field }) => (<FormItem><FormLabel>Objeto (Resumo)</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                 <FormField control={form.control} name="observacoes" render={({ field }) => (<FormItem><FormLabel>Observações Internas</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="plataforma" render={({ field }) => (<FormItem><FormLabel>Plataforma</FormLabel><FormControl><Input placeholder="Compras.gov, BEC..." {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FormField control={form.control} name="dataSessaoISO" render={({ field }) => (<FormItem><FormLabel>Data da Sessão*</FormLabel><FormControl><Input type="date" value={field.value ? formatDate(field.value, 'yyyy-MM-dd') : ''} onChange={(e) => field.onChange(e.target.value ? parseISO(e.target.value) : undefined)}/></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="horaSessao" render={({ field }) => (<FormItem><FormLabel>Hora da Sessão*</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="inicioVigencia" render={({ field }) => (<FormItem><FormLabel>Início Vigência</FormLabel><FormControl><Input type="date" value={field.value ? formatDate(field.value, 'yyyy-MM-dd') : ''} onChange={(e) => field.onChange(e.target.value ? parseISO(e.target.value) : undefined)}/></FormControl><FormMessage /></FormItem>)} />
                </div>
                <FormField control={form.control} name="fimVigencia" render={({ field }) => (<FormItem><FormLabel>Fim Vigência</FormLabel><FormControl><Input type="date" value={field.value ? formatDate(field.value, 'yyyy-MM-dd') : ''} onChange={(e) => field.onChange(e.target.value ? parseISO(e.target.value) : undefined)}/></FormControl><FormMessage /></FormItem>)} />
                 <FormField control={form.control} name="status" render={({ field }) => (<FormItem><FormLabel>Status*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent>{['EM_ANDAMENTO', 'GANHO', 'PERDIDO', 'CANCELADO'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                <div className="flex items-center space-x-4 pt-2">
                    <FormField control={form.control} name="isRetroativo" render={({ field }) => (<FormItem className="flex flex-row items-center space-x-2"><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} id="isRetroativo" /></FormControl><Label htmlFor="isRetroativo" className="cursor-pointer">É Retroativo?</Label></FormItem>)} />
                    <FormField control={form.control} name="orcamentoSigiloso" render={({ field }) => (<FormItem className="flex flex-row items-center space-x-2"><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} id="orcamentoSigiloso" /></FormControl><Label htmlFor="orcamentoSigiloso" className="cursor-pointer">Orçamento Sigiloso?</Label></FormItem>)} />
                </div>
            </form>
            </Form>
        </FormDialog>
    );
}
