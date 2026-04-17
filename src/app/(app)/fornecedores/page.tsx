'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PlusCircle, MoreHorizontal } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/ui/form-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { CnpjInput } from '@/components/ui/cnpj-input';
import { Textarea } from '@/components/ui/textarea';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import type { Fornecedor } from '@/lib/models';
import { fornecedorRepository } from '@/lib/repositories/fornecedor-repository';
import { produtoRepository } from '@/lib/repositories/produto-repository';
import { formatCnpj } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { useUser } from '@/firebase';

const formSchema = z.object({
  nomeFantasia: z.string().min(1, { message: 'O nome fantasia é obrigatório.' }),
  razaoSocial: z.string().optional(),
  cnpj: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email({ message: 'Formato de email inválido.' }).optional().or(z.literal('')),
  cidade: z.string().optional(),
  uf: z.string().length(2, { message: 'UF deve ter 2 letras.' }).optional().or(z.literal('')),
  observacoes: z.string().optional(),
});

type FornecedorFormValues = z.infer<typeof formSchema>;
const FORNECEDOR_FORM_ID = 'fornecedor-form';

export default function FornecedoresPage() {
  const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isAlertOpen, setIsAlertOpen] = React.useState(false);
  const [itemToDelete, setItemToDelete] = React.useState<Fornecedor | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const { user, isUserLoading } = useUser();

  const { toast } = useToast();

  const form = useForm<FornecedorFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nomeFantasia: '',
      razaoSocial: '',
      cnpj: '',
      telefone: '',
      email: '',
      cidade: '',
      uf: '',
      observacoes: '',
    },
  });

  const loadFornecedores = React.useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const data = await fornecedorRepository.search(query);
      setFornecedores(data);
    } catch (error) {
      toast({ title: 'Erro ao carregar fornecedores', description: 'Houve um problema ao buscar os dados.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (isUserLoading || !user) return;
    loadFornecedores(debouncedSearchQuery);
  }, [loadFornecedores, debouncedSearchQuery, user, isUserLoading]);

  const onSubmit = async (values: FornecedorFormValues) => {
    setIsSaving(true);
    try {
      if (editingId) {
        await fornecedorRepository.update(editingId, values);
        toast({ title: 'Sucesso!', description: 'Fornecedor atualizado.' });
      } else {
        await fornecedorRepository.create(values);
        toast({ title: 'Sucesso!', description: 'Fornecedor criado.' });
      }
      setIsFormOpen(false);
      setEditingId(null);
      form.reset();
      await loadFornecedores(debouncedSearchQuery);
    } catch (error) {
      toast({ title: 'Erro ao salvar', description: 'Não foi possível salvar o fornecedor.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (fornecedor: Fornecedor) => {
    setEditingId(fornecedor.id);
    form.reset(fornecedor);
    setIsFormOpen(true);
  };

  const handleDelete = async (fornecedor: Fornecedor) => {
    const isFornecedorInUse = await produtoRepository.isFornecedorInUse(fornecedor.id);
    if(isFornecedorInUse) {
        toast({
            title: 'Exclusão não permitida',
            description: 'Este fornecedor está vinculado a um ou mais produtos e não pode ser excluído.',
            variant: 'destructive',
            duration: 5000,
        });
        return;
    }
    setItemToDelete(fornecedor);
    setIsAlertOpen(true);
  };
  
  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await fornecedorRepository.delete(itemToDelete.id);
      toast({ title: 'Sucesso!', description: `Fornecedor "${itemToDelete.nomeFantasia}" excluído.`, variant: 'destructive' });
      await loadFornecedores(debouncedSearchQuery);
    } catch (error) {
       toast({ title: 'Erro ao excluir', description: 'Não foi possível excluir o fornecedor.', variant: 'destructive' });
    } finally {
      setIsAlertOpen(false);
      setItemToDelete(null);
    }
  }

  const handleNew = () => {
    setEditingId(null);
    form.reset();
    setIsFormOpen(true);
  }

  const columns: ColumnDef<Fornecedor>[] = React.useMemo(() => [
    { accessorKey: 'nomeFantasia', header: 'Nome Fantasia', cell: (row) => row.nomeFantasia },
    { accessorKey: 'cnpj', header: 'CNPJ', cell: (row) => formatCnpj(row.cnpj) },
    { accessorKey: 'cidade', header: 'Cidade/UF', cell: (row) => `${row.cidade || ''}${row.uf ? `/${row.uf}` : ''}` },
    { accessorKey: 'telefone', header: 'Contato', cell: (row) => row.telefone || row.email || '' },
    { accessorKey: 'actions', header: 'Ações', align: 'right', cell: (row) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEdit(row)}>Editar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDelete(row)}>Excluir</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    ) },
  ], [handleEdit, handleDelete]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
            <div className="flex justify-between items-start">
                <div>
                    <CardTitle>Fornecedores</CardTitle>
                    <CardDescription>
                        Cadastre e gerencie seus fornecedores.
                    </CardDescription>
                </div>
                <Button onClick={handleNew}>
                    <PlusCircle className="mr-2" />
                    Novo Fornecedor
                </Button>
            </div>
        </CardHeader>
        <CardContent>
            <div className="mb-4">
                <Input 
                    placeholder="Buscar por nome, CNPJ ou cidade..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
          <DataTable
            columns={columns}
            data={fornecedores}
            isLoading={isLoading}
            emptyStateMessage="Nenhum fornecedor encontrado."
          />
        </CardContent>
      </Card>
      
      <FormDialog
        open={isFormOpen}
        onOpenChange={(isOpen) => {
            if (!isOpen) {
                setEditingId(null);
                form.reset();
            }
            setIsFormOpen(isOpen);
        }}
        title={editingId ? "Editar Fornecedor" : "Novo Fornecedor"}
        description="Preencha os dados do fornecedor."
        formId={FORNECEDOR_FORM_ID}
        isSaving={isSaving}
      >
        <Form {...form}>
          <form id={FORNECEDOR_FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="nomeFantasia" render={({ field }) => (<FormItem><FormLabel>Nome Fantasia*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="razaoSocial" render={({ field }) => (<FormItem><FormLabel>Razão Social</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="cnpj" render={({ field }) => (<FormItem><FormLabel>CNPJ</FormLabel><FormControl><CnpjInput value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="telefone" render={({ field }) => (<FormItem><FormLabel>Telefone</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                    <FormField control={form.control} name="cidade" render={({ field }) => (<FormItem><FormLabel>Cidade</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                </div>
                <FormField control={form.control} name="uf" render={({ field }) => (<FormItem><FormLabel>UF</FormLabel><FormControl><Input maxLength={2} {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name="observacoes" render={({ field }) => (<FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
          </form>
        </Form>
      </FormDialog>

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
                Esta ação não pode ser desfeita. Isso excluirá permanentemente o fornecedor "{itemToDelete?.nomeFantasia}".
            </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Continuar</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
