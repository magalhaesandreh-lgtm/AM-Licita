'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PlusCircle, MoreHorizontal, Loader2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { PercentInput } from '@/components/ui/percent-input';
import { Switch } from '@/components/ui/switch';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { FormDialog } from '@/components/ui/form-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';

import { custoFixoRepository } from '@/lib/repositories/custo-fixo-repository';
import { custoVariavelRepository } from '@/lib/repositories/custo-variavel-repository';
import type { CustoFixo, CustoVariavel } from '@/lib/models';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

// Main Page
export default function ConfiguracoesPage() {
  return (
    <Tabs defaultValue="gerais" className="space-y-4">
      <TabsList>
        <TabsTrigger value="gerais">Gerais</TabsTrigger>
        <TabsTrigger value="custos-fixos">Custos Fixos</TabsTrigger>
        <TabsTrigger value="custos-variaveis">Custos Variáveis</TabsTrigger>
      </TabsList>
      <TabsContent value="gerais">
        <ConfiguracoesGeraisTab />
      </TabsContent>
      <TabsContent value="custos-fixos">
        <CustosFixosTab />
      </TabsContent>
      <TabsContent value="custos-variaveis">
        <CustosVariaveisTab />
      </TabsContent>
    </Tabs>
  );
}

// Gerais Tab
const geraisSchema = z.object({
  appName: z.string().min(1, "O nome do aplicativo é obrigatório."),
  faturamentoMensalPrevisto: z.number().min(0, 'O faturamento deve ser positivo.'),
  fretePadraoPercent: z.number().min(0, 'O frete deve ser positivo.'),
  overheadPercentManual: z.number().min(0, 'O overhead deve ser positivo.').nullable(),
});

function ConfiguracoesGeraisTab() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isSaving, setIsSaving] = React.useState(false);
  const { user, isUserLoading } = useUser();
  
  const settingsDocRef = useMemoFirebase(() => {
    if (!firestore || !user || isUserLoading) return null;
    return doc(firestore, 'settings', 'global');
  }, [firestore, user, isUserLoading]);

  const { data: configs, isLoading } = useDoc<any>(settingsDocRef);

  const form = useForm<z.infer<typeof geraisSchema>>({
    resolver: zodResolver(geraisSchema),
    defaultValues: {
      appName: '',
      faturamentoMensalPrevisto: 0,
      fretePadraoPercent: 0,
      overheadPercentManual: null,
    },
  });

  const displayConfigs = configs || {
    appName: 'AM Gestão',
    metasControlamFaturamento: true,
    faturamentoMensalPrevisto: 50000,
    fretePadraoPercent: 5.0,
    overheadPercentManual: null,
  };

  React.useEffect(() => {
    if (configs) {
      form.reset(configs);
    }
  }, [configs, form]);
  
  const onSubmit = async (values: z.infer<typeof geraisSchema>) => {
    if (!settingsDocRef) return;
    setIsSaving(true);
    try {
      await setDoc(settingsDocRef, values, { merge: true });
      toast({ title: 'Sucesso!', description: 'Configurações gerais salvas.' });
    } catch (e: any) {
      toast({ 
        title: 'Erro ao salvar configurações', 
        description: e.message,
        variant: 'destructive' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleMetasControl = async (checked: boolean) => {
    if (!settingsDocRef) return;
     try {
      await setDoc(settingsDocRef, { metasControlamFaturamento: checked }, { merge: true });
      toast({ title: 'Modo de controle atualizado!' });
    } catch(e: any) {
      toast({ 
        title: 'Erro!',
        description: 'Não foi possível salvar as configurações.',
        variant: 'destructive'
      });
    }
  };
  
  if (isLoading || isUserLoading) {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-4 w-96" />
                </CardHeader>
                <CardContent className="space-y-6">
                    <Skeleton className="h-10 w-full max-w-sm" />
                    <Skeleton className="h-10 w-full max-w-sm" />
                </CardContent>
            </Card>
        </div>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Configurações Gerais e de Precificação</CardTitle>
            <CardDescription>Defina parâmetros globais para os cálculos de precificação.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
             <FormField control={form.control} name="appName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Aplicativo</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormDescription>Exibido no topo do menu lateral.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Separator />
            <div className="flex items-center space-x-2 rounded-lg border p-3 shadow-sm">
                <Switch
                    id="metas-control"
                    checked={displayConfigs.metasControlamFaturamento}
                    onCheckedChange={handleToggleMetasControl}
                />
                <Label htmlFor="metas-control" className="cursor-pointer">Controlar faturamento previsto por Metas (recomendado)</Label>
            </div>
            <FormField control={form.control} name="faturamentoMensalPrevisto" render={({ field }) => (
                <FormItem>
                  <FormLabel>Faturamento Mensal Previsto</FormLabel>
                  <FormControl><CurrencyInput value={field.value} onChange={field.onChange} disabled={displayConfigs.metasControlamFaturamento} /></FormControl>
                  <FormDescription>
                    {displayConfigs.metasControlamFaturamento
                        ? 'Valor definido automaticamente pela tela de Metas.'
                        : 'Usado para calcular o percentual de overhead (custos fixos).'
                    }
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField control={form.control} name="fretePadraoPercent" render={({ field }) => (
                <FormItem>
                  <FormLabel>Frete Padrão (%)</FormLabel>
                  <FormControl><PercentInput value={field.value} onChange={field.onChange} /></FormControl>
                  <FormDescription>Percentual padrão de frete aplicado sobre o custo total dos itens do certame.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Separator />
            <h3 className="text-base font-semibold">Overhead (Custos Fixos)</h3>
            <p className="text-sm text-muted-foreground">O overhead é rateado por item proporcionalmente ao seu custo (padrão do sistema).</p>
            <FormField control={form.control} name="overheadPercentManual" render={({ field }) => (
                <FormItem>
                  <FormLabel>Overhead Manual (%) (Opcional)</FormLabel>
                  <FormControl><PercentInput value={field.value} onChange={field.onChange} /></FormControl>
                  <FormDescription>Se preenchido, este valor substitui o cálculo automático (Custos Fixos / Faturamento Previsto).</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Configurações
          </Button>
        </div>
      </form>
    </Form>
  );
}

// Custos Fixos Tab
const custoFixoSchema = z.object({
  descricao: z.string().min(1, 'A descrição é obrigatória.'),
  valorMensal: z.number().min(0.01, 'O valor é obrigatório.'),
  ativo: z.boolean(),
});
const CUSTO_FIXO_FORM_ID = 'custo-fixo-form';

function CustosFixosTab() {
  const [custos, setCustos] = React.useState<CustoFixo[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [deletingItem, setDeletingItem] = React.useState<CustoFixo | null>(null);
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();

  const form = useForm<z.infer<typeof custoFixoSchema>>({
    resolver: zodResolver(custoFixoSchema),
    defaultValues: { ativo: true },
  });

  const loadCustos = React.useCallback(async () => {
    if (isUserLoading || !user) return;
    setIsLoading(true);
    try {
      const data = await custoFixoRepository.list();
      setCustos(data);
    } catch {
      toast({ title: 'Erro ao carregar custos', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast, user, isUserLoading]);

  React.useEffect(() => { loadCustos(); }, [loadCustos]);

  const onSubmit = async (values: z.infer<typeof custoFixoSchema>) => {
    if (isUserLoading || !user) return;
    setIsSaving(true);
    try {
      if (editingId) {
        await custoFixoRepository.update(editingId, values);
        toast({ title: 'Custo atualizado!' });
      } else {
        await custoFixoRepository.create(values);
        toast({ title: 'Custo criado!' });
      }
      setIsFormOpen(false);
      await loadCustos();
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleNew = () => { setEditingId(null); form.reset({ descricao: '', valorMensal: undefined, ativo: true }); setIsFormOpen(true); };
  const handleEdit = (item: CustoFixo) => { setEditingId(item.id); form.reset(item); setIsFormOpen(true); };
  const handleDelete = (item: CustoFixo) => { setDeletingItem(item); };
  const confirmDelete = async () => {
    if (!deletingItem) return;
    await custoFixoRepository.delete(deletingItem.id);
    toast({ title: 'Custo excluído', variant: 'destructive' });
    await loadCustos();
    setDeletingItem(null);
  };
  
  const columns: ColumnDef<CustoFixo>[] = React.useMemo(() => [
    { accessorKey: 'descricao', header: 'Descrição', cell: (row) => row.descricao },
    { accessorKey: 'valorMensal', header: 'Valor Mensal', align: 'right', cell: (row) => formatCurrency(row.valorMensal) },
    { accessorKey: 'ativo', header: 'Status', cell: (row) => <Badge variant={row.ativo ? 'default' : 'secondary'}>{row.ativo ? 'Ativo' : 'Inativo'}</Badge> },
    { accessorKey: 'actions', header: 'Ações', align: 'right', cell: (row) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEdit(row)}>Editar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDelete(row)}>Excluir</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )},
  ], []);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
            <div>
                <CardTitle>Custos Fixos</CardTitle>
                <CardDescription>Gerencie os custos fixos mensais da sua operação (aluguel, salários, etc.).</CardDescription>
            </div>
            <Button onClick={handleNew}><PlusCircle className="mr-2" /> Novo Custo Fixo</Button>
        </div>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={custos} isLoading={isLoading} emptyStateMessage="Nenhum custo fixo cadastrado." />
        <FormDialog open={isFormOpen} onOpenChange={(isOpen) => { if (!isOpen) setEditingId(null); setIsFormOpen(isOpen); }} title={editingId ? 'Editar Custo' : 'Novo Custo'} formId={CUSTO_FIXO_FORM_ID} isSaving={isSaving}>
            <Form {...form}><form id={CUSTO_FIXO_FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="descricao" render={({ field }) => (<FormItem><FormLabel>Descrição*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="valorMensal" render={({ field }) => (<FormItem><FormLabel>Valor Mensal*</FormLabel><FormControl><CurrencyInput value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="ativo" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><FormLabel>Ativo</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
            </form></Form>
        </FormDialog>
        <AlertDialog open={!!deletingItem} onOpenChange={(isOpen) => !isOpen && setDeletingItem(null)}>
            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja excluir o custo "{deletingItem?.descricao}"?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

// Custos Variáveis Tab
const custoVariavelSchema = z.object({
  descricao: z.string().min(1, 'A descrição é obrigatória.'),
  tipoRateio: z.enum(['PERCENT_CERTAME', 'VALOR_CERTAME']),
  valor: z.number().min(0.01, 'O valor é obrigatório.'),
  ativo: z.boolean(),
});
const CUSTO_VARIAVEL_FORM_ID = 'custo-variavel-form';

function CustosVariaveisTab() {
  const [custos, setCustos] = React.useState<CustoVariavel[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [deletingItem, setDeletingItem] = React.useState<CustoVariavel | null>(null);
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();

  const form = useForm<z.infer<typeof custoVariavelSchema>>({
    resolver: zodResolver(custoVariavelSchema),
    defaultValues: { ativo: true, tipoRateio: 'PERCENT_CERTAME' },
  });

  const loadCustos = React.useCallback(async () => {
    if (isUserLoading || !user) return;
    setIsLoading(true);
    try {
      const data = await custoVariavelRepository.list();
      setCustos(data);
    } catch {
      toast({ title: 'Erro ao carregar custos', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast, user, isUserLoading]);

  React.useEffect(() => { loadCustos(); }, [loadCustos]);

  const onSubmit = async (values: z.infer<typeof custoVariavelSchema>) => {
    if (isUserLoading || !user) return;
    setIsSaving(true);
    try {
      if (editingId) {
        await custoVariavelRepository.update(editingId, values);
        toast({ title: 'Custo atualizado!' });
      } else {
        await custoVariavelRepository.create(values);
        toast({ title: 'Custo criado!' });
      }
      setIsFormOpen(false);
      await loadCustos();
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleNew = () => { setEditingId(null); form.reset({ descricao: '', tipoRateio: 'PERCENT_CERTAME', valor: undefined, ativo: true }); setIsFormOpen(true); };
  const handleEdit = (item: CustoVariavel) => { setEditingId(item.id); form.reset(item); setIsFormOpen(true); };
  const handleDelete = (item: CustoVariavel) => { setDeletingItem(item); };
  const confirmDelete = async () => {
    if (!deletingItem) return;
    await custoVariavelRepository.delete(deletingItem.id);
    toast({ title: 'Custo excluído', variant: 'destructive' });
    await loadCustos();
    setDeletingItem(null);
  };
  
  const columns: ColumnDef<CustoVariavel>[] = React.useMemo(() => [
    { accessorKey: 'descricao', header: 'Descrição', cell: (row) => row.descricao },
    { accessorKey: 'tipoRateio', header: 'Tipo de Rateio', cell: (row) => row.tipoRateio === 'PERCENT_CERTAME' ? 'Percentual do Certame' : 'Valor Fixo no Certame' },
    { accessorKey: 'valor', header: 'Valor', align: 'right', cell: (row) => row.tipoRateio === 'PERCENT_CERTAME' ? `${row.valor.toLocaleString('pt-BR')}%` : formatCurrency(row.valor) },
    { accessorKey: 'ativo', header: 'Status', cell: (row) => <Badge variant={row.ativo ? 'default' : 'secondary'}>{row.ativo ? 'Ativo' : 'Inativo'}</Badge> },
    { accessorKey: 'actions', header: 'Ações', align: 'right', cell: (row) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEdit(row)}>Editar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDelete(row)}>Excluir</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )},
  ], []);

  const watchedTipoRateio = form.watch('tipoRateio');

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
            <div>
                <CardTitle>Custos Variáveis</CardTitle>
                <CardDescription>Gerencie custos que variam por certame (comissões, taxas de plataforma, etc.).</CardDescription>
            </div>
            <Button onClick={handleNew}><PlusCircle className="mr-2" /> Novo Custo Variável</Button>
        </div>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={custos} isLoading={isLoading} emptyStateMessage="Nenhum custo variável cadastrado." />
        <FormDialog open={isFormOpen} onOpenChange={(isOpen) => { if (!isOpen) setEditingId(null); setIsFormOpen(isOpen); }} title={editingId ? 'Editar Custo' : 'Novo Custo'} formId={CUSTO_VARIAVEL_FORM_ID} isSaving={isSaving}>
            <Form {...form}><form id={CUSTO_VARIAVEL_FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="descricao" render={({ field }) => (<FormItem><FormLabel>Descrição*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="tipoRateio" render={({ field }) => (<FormItem><FormLabel>Tipo de Rateio*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="PERCENT_CERTAME">Percentual do Certame</SelectItem><SelectItem value="VALOR_CERTAME">Valor Fixo no Certame</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="valor" render={({ field }) => (<FormItem><FormLabel>Valor*</FormLabel><FormControl>{watchedTipoRateio === 'PERCENT_CERTAME' ? <PercentInput value={field.value} onChange={field.onChange} /> : <CurrencyInput value={field.value} onChange={field.onChange} />}</FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="ativo" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><FormLabel>Ativo</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
            </form></Form>
        </FormDialog>
        <AlertDialog open={!!deletingItem} onOpenChange={(isOpen) => !isOpen && setDeletingItem(null)}>
            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja excluir o custo "{deletingItem?.descricao}"?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

    