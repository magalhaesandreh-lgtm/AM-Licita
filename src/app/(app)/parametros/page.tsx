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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { PercentInput } from '@/components/ui/percent-input';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import type { Categoria } from '@/lib/models';
import { categoriaRepository } from '@/lib/repositories/categoria-repository';
import { produtoRepository } from '@/lib/repositories/produto-repository';
import { useUser } from '@/firebase';

const formSchema = z.object({
  nome: z.string().min(1, { message: 'O nome da categoria é obrigatório.' }),
  margemPadraoPercent: z.number({ required_error: 'A margem é obrigatória.' }).min(0, 'A margem não pode ser negativa.'),
  ativo: z.boolean(),
});

type CategoriaFormValues = z.infer<typeof formSchema>;
const CATEGORIA_FORM_ID = 'categoria-form';

export default function ParametrosPage() {
  const [categorias, setCategorias] = React.useState<Categoria[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isAlertOpen, setIsAlertOpen] = React.useState(false);
  const [itemToDelete, setItemToDelete] = React.useState<Categoria | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [showInactive, setShowInactive] = React.useState(false);
  const { user, isUserLoading } = useUser();

  const { toast } = useToast();

  const form = useForm<CategoriaFormValues>({
    resolver: zodResolver(formSchema.refine(async (data) => {
        if (!form.formState.isDirty) return true;
        const isNameInUse = await categoriaRepository.isNomeInUse(data.nome, editingId ?? undefined);
        if (isNameInUse) {
            form.setError('nome', { type: 'manual', message: 'Este nome de categoria já está em uso.' });
            return false;
        }
        return true;
    }, {
        path: ['nome'],
    })),
    defaultValues: {
      nome: '',
      margemPadraoPercent: undefined,
      ativo: true,
    },
  });

  const loadCategorias = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await categoriaRepository.list();
      setCategorias(data);
    } catch (error) {
      toast({ title: 'Erro ao carregar categorias', description: 'Houve um problema ao buscar os dados.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (isUserLoading || !user) return;
    loadCategorias();
  }, [loadCategorias, user, isUserLoading]);

  const onSubmit = async (values: CategoriaFormValues) => {
    setIsSaving(true);
    try {
      if (editingId) {
        await categoriaRepository.update(editingId, values);
        toast({ title: 'Sucesso!', description: 'Categoria atualizada.' });
      } else {
        await categoriaRepository.create(values);
        toast({ title: 'Sucesso!', description: 'Categoria criada.' });
      }
      setIsFormOpen(false);
      await loadCategorias();
    } catch (error) {
      toast({ title: 'Erro ao salvar', description: 'Não foi possível salvar a categoria.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (categoria: Categoria) => {
    setEditingId(categoria.id);
    form.reset({
      nome: categoria.nome,
      margemPadraoPercent: categoria.margemPadraoPercent,
      ativo: categoria.ativo,
    });
    setIsFormOpen(true);
  };

  const handleDelete = async (categoria: Categoria) => {
    const isCategoriaInUse = await produtoRepository.isCategoriaInUse(categoria.id);
    if(isCategoriaInUse) {
      toast({
        title: 'Exclusão não permitida',
        description: 'Esta categoria está sendo utilizada por um ou mais produtos e não pode ser excluída.',
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }
    setItemToDelete(categoria);
    setIsAlertOpen(true);
  };
  
  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await categoriaRepository.delete(itemToDelete.id);
      toast({ title: 'Sucesso!', description: `Categoria "${itemToDelete.nome}" excluída.`, variant: 'destructive' });
      await loadCategorias();
    } catch (error) {
       toast({ title: 'Erro ao excluir', description: 'Não foi possível excluir a categoria.', variant: 'destructive' });
    } finally {
      setIsAlertOpen(false);
      setItemToDelete(null);
    }
  }

  const handleNew = () => {
    setEditingId(null);
    form.reset({ nome: '', margemPadraoPercent: undefined, ativo: true });
    setIsFormOpen(true);
  }

  const columns: ColumnDef<Categoria>[] = [
    { accessorKey: 'nome', header: 'Categoria', cell: (row) => row.nome },
    {
      accessorKey: 'margemPadraoPercent',
      header: 'Margem Padrão (%)',
      align: 'right',
      cell: (row) => `${row.margemPadraoPercent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`,
    },
    {
      accessorKey: 'ativo',
      header: 'Status',
      cell: (row) => <Badge variant={row.ativo ? 'default' : 'secondary'}>{row.ativo ? 'Ativo' : 'Inativo'}</Badge>,
    },
    { accessorKey: 'actions', header: 'Ações', align: 'right', cell: (row) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEdit(row)}>Editar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDelete(row)}>Excluir</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    ) },
  ];

  const filteredCategorias = React.useMemo(() => {
    return showInactive ? categorias : categorias.filter(c => c.ativo);
  }, [categorias, showInactive]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Categorias e Margens Padrão</CardTitle>
          <CardDescription>
            Gerencie as categorias de produtos e suas margens de lucro padrão para precificação.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="flex justify-between items-center mb-4">
                <Button onClick={handleNew}>
                    <PlusCircle className="mr-2" />
                    Nova Categoria
                </Button>
                <div className="flex items-center space-x-2">
                    <Switch
                        id="show-inactive"
                        checked={showInactive}
                        onCheckedChange={setShowInactive}
                    />
                    <Label htmlFor="show-inactive">Mostrar inativos</Label>
                </div>
          </div>
          <DataTable
            columns={columns}
            data={filteredCategorias}
            isLoading={isLoading}
            emptyStateMessage="Nenhuma categoria encontrada."
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
        title={editingId ? "Editar Categoria" : "Nova Categoria"}
        description="Preencha os dados da categoria."
        formId={CATEGORIA_FORM_ID}
        isSaving={isSaving}
      >
        <Form {...form}>
          <form id={CATEGORIA_FORM_ID} className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Categoria</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Papelaria" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="margemPadraoPercent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Margem Padrão (%)</FormLabel>
                  <FormControl>
                    <PercentInput
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="0,00 %"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ativo"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Ativo</FormLabel>
                    <FormMessage />
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </form>
        </Form>
      </FormDialog>

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
                Esta ação não pode ser desfeita. Isso excluirá permanentemente a categoria "{itemToDelete?.nome}".
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
