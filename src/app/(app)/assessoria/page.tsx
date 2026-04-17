'use client';

import * as React from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PlusCircle, MoreHorizontal, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { getMonth, getYear } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/ui/form-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { CnpjInput } from '@/components/ui/cnpj-input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Textarea } from '@/components/ui/textarea';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/use-debounce';
import { formatCnpj } from '@/lib/utils';

import type { ClienteAssessoria, VinculoAssessoria, CobrancaAssessoria } from '@/lib/models';
import { clienteAssessoriaRepository } from '@/lib/repositories/cliente-assessoria-repository';
import { cobrancaRepository } from '@/lib/repositories/cobranca-repository';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useUser } from '@/firebase';

const vinculoSchema = z.object({
  tipoVinculo: z.enum(['MENSAL', 'EXITO', 'HIBRIDO', 'POR_PROCESSO']),
  mensalidade: z.number().optional(),
  diaVencimento: z.number().optional(),
  inicio: z.string().optional(),
  fim: z.string().optional(),
  observacoes: z.string().optional(),
});

const clienteSchema = z.object({
  nomeFantasia: z.string().min(1, 'Nome fantasia é obrigatório.'),
  razaoSocial: z.string().optional(),
  cnpj: z.string().optional(),
  cidadeUf: z.string().optional(),
  contatoNome: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email('Email inválido.').optional().or(z.literal('')),
  observacoes: z.string().optional(),
  statusAtivo: z.boolean(),
  vinculo: vinculoSchema,
});

type ClienteFormValues = z.infer<typeof clienteSchema>;

type ClienteComFinanceiro = ClienteAssessoria & { statusFinanceiro: 'EM_DIA' | 'PENDENTE' | 'ATRASADO' };

const CLIENTE_FORM_ID = 'cliente-form';

export default function AssessoriaPage() {
  const [clientes, setClientes] = React.useState<ClienteComFinanceiro[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = React.useState(false);
  const [itemToDelete, setItemToDelete] = React.useState<ClienteAssessoria | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();

  const form = useForm<ClienteFormValues>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      nomeFantasia: '',
      razaoSocial: '',
      cnpj: '',
      cidadeUf: '',
      observacoes: '',
      statusAtivo: true,
      vinculo: { tipoVinculo: 'MENSAL', mensalidade: undefined, diaVencimento: undefined },
    },
  });

  const getStatusFinanceiro = (cliente: ClienteAssessoria, cobrancas: CobrancaAssessoria[]): 'EM_DIA' | 'PENDENTE' | 'ATRASADO' => {
      if (!cliente.vinculo || cliente.vinculo.tipoVinculo === 'EXITO' || cliente.vinculo.tipoVinculo === 'POR_PROCESSO') {
          return 'EM_DIA';
      }
      const mesAtual = getMonth(new Date()) + 1;
      const anoAtual = getYear(new Date());

      const cobrancasPendentes = cobrancas.filter(c => c.status !== 'PAGO');
      const temAtrasada = cobrancasPendentes.some(c => c.competenciaAno < anoAtual || (c.competenciaAno === anoAtual && c.competenciaMes < mesAtual));
      
      if (temAtrasada) return 'ATRASADO';
      
      const temPendenteMes = cobrancasPendentes.some(c => c.competenciaAno === anoAtual && c.competenciaMes === mesAtual);
      if (temPendenteMes) return 'PENDENTE';
      
      return 'EM_DIA';
  };

  const loadClientes = React.useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const [clientesData, cobrancasData] = await Promise.all([
        clienteAssessoriaRepository.search(query),
        cobrancaRepository.list()
      ]);

      const clientesComStatus = clientesData.map(cliente => {
          const cobrancasDoCliente = cobrancasData.filter(c => c.clienteId === cliente.id);
          return {
              ...cliente,
              statusFinanceiro: getStatusFinanceiro(cliente, cobrancasDoCliente)
          };
      });

      setClientes(clientesComStatus);
    } catch (error) {
      toast({ title: 'Erro ao carregar clientes', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (isUserLoading || !user) return;
    loadClientes(debouncedSearchQuery);
  }, [loadClientes, debouncedSearchQuery, user, isUserLoading]);

  const onSubmit = async (values: ClienteFormValues) => {
    setIsSaving(true);
    try {
      if (editingId) {
        await clienteAssessoriaRepository.update(editingId, values);
        toast({ title: 'Cliente atualizado com sucesso!' });
      } else {
        await clienteAssessoriaRepository.create(values);
        toast({ title: 'Cliente criado com sucesso!' });
      }
      setIsFormOpen(false);
      await loadClientes(debouncedSearchQuery);
    } catch (error) {
      toast({ title: 'Erro ao salvar cliente', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (cliente: ClienteAssessoria) => {
    setEditingId(cliente.id);
    form.reset(cliente);
    setIsFormOpen(true);
  };

  const handleDelete = (cliente: ClienteAssessoria) => {
    setItemToDelete(cliente);
    setIsDeleteAlertOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await clienteAssessoriaRepository.delete(itemToDelete.id);
      toast({ title: 'Cliente excluído com sucesso.', variant: 'destructive' });
      await loadClientes(debouncedSearchQuery);
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro ao excluir cliente.', description: 'Houve um problema ao tentar excluir os dados do cliente.', variant: 'destructive' });
    } finally {
      setIsDeleteAlertOpen(false);
      setItemToDelete(null);
    }
  };
  
  const handleNew = () => {
    setEditingId(null);
    form.reset({ nomeFantasia: '', statusAtivo: true, vinculo: { tipoVinculo: 'MENSAL' } });
    setIsFormOpen(true);
  };

  const columns: ColumnDef<ClienteComFinanceiro>[] = React.useMemo(() => [
    { accessorKey: 'nomeFantasia', header: 'Empresa', cell: (row) => (
        <div>
            <p className="font-medium">{row.nomeFantasia}</p>
            <p className="text-xs text-muted-foreground">{row.razaoSocial}</p>
        </div>
    )},
    { accessorKey: 'cnpj', header: 'CNPJ', cell: (row) => formatCnpj(row.cnpj) },
    { accessorKey: 'cidadeUf', header: 'Cidade/UF', cell: (row) => row.cidadeUf },
    { accessorKey: 'vinculo', header: 'Vínculo', cell: (row) => <Badge variant="secondary">{row.vinculo?.tipoVinculo || 'N/A'}</Badge> },
    { accessorKey: 'statusFinanceiro', header: 'Financeiro', cell: (row) => {
        const statusMap = {
            EM_DIA: { text: 'Em Dia', variant: 'default', icon: CheckCircle },
            PENDENTE: { text: 'Pendente', variant: 'outline', icon: AlertCircle },
            ATRASADO: { text: 'Atrasado', variant: 'destructive', icon: XCircle },
        } as const;
        const { text, variant, icon: Icon } = statusMap[row.statusFinanceiro];
        return <Badge variant={variant} className="gap-1"><Icon className="h-3 w-3" />{text}</Badge>;
    }},
    { accessorKey: 'kpis', header: 'KPIs', cell: (row) => '—' },
    { accessorKey: 'actions', header: 'Ações', align: 'right', cell: (row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild><Link href={`/assessoria/${row.id}`}>Ver Painel</Link></DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleEdit(row)}>Editar</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleDelete(row)} className="text-destructive">Excluir</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )},
  ], []);

  const watchedTipoVinculo = form.watch('vinculo.tipoVinculo');
  
  React.useEffect(() => {
    if (watchedTipoVinculo === 'HIBRIDO') {
        form.setValue('vinculo.mensalidade', 1200);
    }
  }, [watchedTipoVinculo, form]);


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Assessoria</CardTitle>
              <CardDescription>Gerencie suas empresas assessoradas.</CardDescription>
            </div>
            <Button onClick={handleNew}><PlusCircle className="mr-2 h-4 w-4" /> Nova Empresa</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Input placeholder="Buscar por nome, CNPJ ou cidade..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="mb-4" />
          <DataTable columns={columns} data={clientes.filter(c => c.statusAtivo)} isLoading={isLoading} emptyStateMessage="Nenhum cliente ativo encontrado." />
        </CardContent>
      </Card>
      
      <FormDialog open={isFormOpen} onOpenChange={setIsFormOpen} title={editingId ? 'Editar Empresa' : 'Nova Empresa'} formId={CLIENTE_FORM_ID} isSaving={isSaving}>
        <Form {...form}>
          <form id={CLIENTE_FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="nomeFantasia" render={({ field }) => (<FormItem><FormLabel>Nome Fantasia*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="razaoSocial" render={({ field }) => (<FormItem><FormLabel>Razão Social</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="cnpj" render={({ field }) => (<FormItem><FormLabel>CNPJ</FormLabel><FormControl><CnpjInput value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="cidadeUf" render={({ field }) => (<FormItem><FormLabel>Cidade/UF</FormLabel><FormControl><Input placeholder="São Paulo/SP" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
            
            <FormField control={form.control} name="vinculo.tipoVinculo" render={({ field }) => (<FormItem><FormLabel>Tipo de Vínculo*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent>{['MENSAL', 'EXITO', 'HIBRIDO', 'POR_PROCESSO'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            {(watchedTipoVinculo === 'MENSAL' || watchedTipoVinculo === 'HIBRIDO') && (
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="vinculo.mensalidade" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mensalidade</FormLabel>
                    <FormControl>
                        <CurrencyInput value={field.value} onChange={v => field.onChange(v)} disabled={watchedTipoVinculo === 'HIBRIDO'} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField
                  control={form.control}
                  name="vinculo.diaVencimento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dia Vencimento</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          max="31"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ''
                                ? undefined
                                : Number(e.target.value)
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
             <FormField control={form.control} name="statusAtivo" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><Label>Status Ativo</Label><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />

            <FormField control={form.control} name="observacoes" render={({ field }) => (<FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
          </form>
        </Form>
      </FormDialog>
      
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita. Isso excluirá permanentemente o cliente "{itemToDelete?.nomeFantasia}" e todos os seus dados associados (demandas, cobranças, etc.).</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">Excluir Permanentemente</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
