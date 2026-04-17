'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import { format as formatDate, parseISO } from 'date-fns';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/ui/form-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/use-debounce';
import type { Produto, Categoria, Fornecedor, Cotacao } from '@/lib/models';
import { produtoRepository } from '@/lib/repositories/produto-repository';
import { categoriaRepository } from '@/lib/repositories/categoria-repository';
import { fornecedorRepository } from '@/lib/repositories/fornecedor-repository';
import { cotacaoRepository } from '@/lib/repositories/cotacao-repository';
import { formatCurrency } from '@/lib/utils';
import { useUser } from '@/firebase';

// Produto Form
const produtoFormSchema = z.object({
  descricao: z.string().min(1, 'A descrição é obrigatória.'),
  categoriaId: z.string().min(1, 'A categoria é obrigatória.'),
  unidade: z.string().min(1, 'A unidade é obrigatória.'),
  precoBase: z.number().min(0.01, 'O preço base é obrigatório.'),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  linkProduto: z.string().url('URL inválida.').optional().or(z.literal('')),
  fornecedorId: z.string().optional(),
  observacoes: z.string().optional(),
});
type ProdutoFormValues = z.infer<typeof produtoFormSchema>;
const PRODUTO_FORM_ID = 'produto-form';

// Cotação Form
const cotacaoFormSchema = z.object({
  produtoId: z.string().min(1, 'O produto é obrigatório.'),
  dataCotacao: z.date({ required_error: 'A data é obrigatória.' }),
  precoCotado: z.number().min(0.01, 'O preço é obrigatório.'),
  fornecedorId: z.string().optional(),
  freteCotado: z.number().optional(),
  observacoes: z.string().optional(),
});
type CotacaoFormValues = z.infer<typeof cotacaoFormSchema>;
const COTACAO_FORM_ID = 'cotacao-form';


// Main Component
export default function OrcamentosPage() {
  const [categorias, setCategorias] = React.useState<Categoria[]>([]);
  const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
  const [produtos, setProdutos] = React.useState<Produto[]>([]);
  const { user, isUserLoading } = useUser();

  const loadDependencies = React.useCallback(async () => {
    const [cats, sups, prods] = await Promise.all([
        categoriaRepository.list(),
        fornecedorRepository.list(),
        produtoRepository.list()
    ]);
    setCategorias(cats.filter(c => c.ativo));
    setFornecedores(sups);
    setProdutos(prods);
  }, []);

  React.useEffect(() => {
    if (isUserLoading || !user) return;
    loadDependencies();
  }, [loadDependencies, user, isUserLoading]);

  const onDataChanged = () => {
    loadDependencies();
  }

  return (
    <Tabs defaultValue="catalogo" className="space-y-4">
      <TabsList>
        <TabsTrigger value="catalogo">Catálogo de Produtos</TabsTrigger>
        <TabsTrigger value="historico">Histórico de Cotações</TabsTrigger>
      </TabsList>
      <TabsContent value="catalogo">
        <CatalogoProdutosTab 
            categorias={categorias} 
            fornecedores={fornecedores} 
            onDataChanged={onDataChanged}
            produtos={produtos}
        />
      </TabsContent>
      <TabsContent value="historico">
        <HistoricoCotacoesTab 
            produtos={produtos}
            fornecedores={fornecedores}
            onDataChanged={onDataChanged}
        />
      </TabsContent>
    </Tabs>
  );
}

interface TabProps {
    onDataChanged: () => void;
    fornecedores: Fornecedor[];
    produtos: Produto[];
}

interface CatalogoTabProps extends TabProps {
    categorias: Categoria[];
}

// Catálogo de Produtos Tab
function CatalogoProdutosTab({ categorias, fornecedores, onDataChanged }: CatalogoTabProps) {
  const [produtos, setProdutos] = React.useState<Produto[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isAlertOpen, setIsAlertOpen] = React.useState(false);
  const [itemToDelete, setItemToDelete] = React.useState<Produto | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();

  const form = useForm<ProdutoFormValues>({
    resolver: zodResolver(produtoFormSchema),
    defaultValues: { 
        descricao: '', 
        categoriaId: '', 
        unidade: '', 
        precoBase: undefined,
        marca: '',
        modelo: '',
        linkProduto: '',
        fornecedorId: '',
        observacoes: '',
    },
  });

  const loadProdutos = React.useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const data = await produtoRepository.search(query);
      setProdutos(data);
    } catch (error) {
      toast({ title: 'Erro ao carregar produtos', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);
  
  React.useEffect(() => {
    if (isUserLoading || !user) return;
    loadProdutos(debouncedSearchQuery);
  }, [loadProdutos, debouncedSearchQuery, user, isUserLoading]);

  const onSubmit = async (values: ProdutoFormValues) => {
    setIsSaving(true);
    try {
      if (editingId) {
        await produtoRepository.update(editingId, values);
        toast({ title: 'Sucesso!', description: 'Produto atualizado.' });
      } else {
        await produtoRepository.create(values);
        toast({ title: 'Sucesso!', description: 'Produto criado.' });
      }
      setIsFormOpen(false);
      setEditingId(null);
      form.reset();
      onDataChanged();
      await loadProdutos(debouncedSearchQuery);
    } catch (error) {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (produto: Produto) => {
    setEditingId(produto.id);
    form.reset(produto);
    setIsFormOpen(true);
  };
  
  const handleDelete = (produto: Produto) => {
    setItemToDelete(produto);
    setIsAlertOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await produtoRepository.delete(itemToDelete.id);
      toast({ title: 'Sucesso!', description: `Produto "${itemToDelete.descricao}" excluído.`, variant: 'destructive' });
      onDataChanged();
      await loadProdutos(debouncedSearchQuery);
    } catch (error) {
      toast({ title: 'Erro ao excluir', variant: 'destructive' });
    } finally {
      setIsAlertOpen(false);
      setItemToDelete(null);
    }
  };

  const handleNew = () => {
    setEditingId(null);
    form.reset();
    setIsFormOpen(true);
  };

  const togglePreferido = async (produto: Produto) => {
    try {
        await produtoRepository.update(produto.id, { preferido: !produto.preferido });
        toast({ title: 'Sucesso!', description: 'Preferência de produto atualizada.' });
        onDataChanged();
        await loadProdutos(debouncedSearchQuery);
    } catch {
        toast({ title: 'Erro ao atualizar preferência.', variant: 'destructive'});
    }
  }

  const columns: ColumnDef<Produto>[] = React.useMemo(() => [
    { accessorKey: 'descricao', header: 'Descrição', cell: (row) => row.descricao },
    { accessorKey: 'categoriaId', header: 'Categoria', cell: (row) => {
        const categoria = categorias.find(c => c.id === row.categoriaId);
        return categoria ? <Badge variant="secondary">{categoria.nome}</Badge> : '-';
    }},
    { accessorKey: 'unidade', header: 'Unidade', cell: (row) => row.unidade },
    { accessorKey: 'precoBase', header: 'Preço Base', align: 'right', cell: (row) => formatCurrency(row.precoBase) },
    { accessorKey: 'fornecedorId', header: 'Fornecedor Padrão', cell: (row) => {
        const fornecedor = fornecedores.find(f => f.id === row.fornecedorId);
        return fornecedor ? fornecedor.nomeFantasia : '-';
    }},
    { accessorKey: 'actions', header: 'Ações', align: 'right', cell: (row) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEdit(row)}>Editar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => togglePreferido(row)}>{row.preferido ? 'Desmarcar como preferido' : 'Marcar como preferido'}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDelete(row)}>Excluir</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )},
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [categorias, fornecedores]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <CardTitle>Catálogo de Produtos</CardTitle>
                <CardDescription>Adicione e gerencie os produtos do seu catálogo.</CardDescription>
            </div>
            <Button onClick={handleNew}><PlusCircle className="mr-2 h-4 w-4" /> Novo Produto</Button>
        </div>
      </CardHeader>
      <CardContent>
        <Input placeholder="Buscar por descrição ou marca..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="mb-4" />
        <DataTable columns={columns} data={produtos} isLoading={isLoading} emptyStateMessage="Nenhum produto encontrado." />
        <FormDialog open={isFormOpen} onOpenChange={(isOpen) => {
            if (!isOpen) {
                setEditingId(null);
                form.reset();
            }
            setIsFormOpen(isOpen);
        }} title={editingId ? 'Editar Produto' : 'Novo Produto'} description="Preencha os detalhes do produto para o seu catálogo." formId={PRODUTO_FORM_ID} isSaving={isSaving}>
            <Form {...form}>
            <form id={PRODUTO_FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="descricao" render={({ field }) => (<FormItem><FormLabel>Descrição*</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>)} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="categoriaId" render={({ field }) => (
                        <FormItem><FormLabel>Categoria*</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                            <SelectContent>{categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                        </Select><FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="unidade" render={({ field }) => (<FormItem><FormLabel>Unidade*</FormLabel><FormControl><Input placeholder="UN, CX, KG..." {...field} /></FormControl><FormMessage /></FormItem>)} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="marca" render={({ field }) => (<FormItem><FormLabel>Marca</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="modelo" render={({ field }) => (<FormItem><FormLabel>Modelo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                </div>
                <FormField control={form.control} name="precoBase" render={({ field }) => (<FormItem><FormLabel>Preço Base*</FormLabel><FormControl><CurrencyInput value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="fornecedorId" render={({ field }) => (
                    <FormItem><FormLabel>Fornecedor Padrão</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                        <SelectContent>
                             <SelectItem value="null">Nenhum</SelectItem>
                            {fornecedores.map(f => <SelectItem key={f.id} value={f.id}>{f.nomeFantasia}</SelectItem>)}
                        </SelectContent>
                    </Select><FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="linkProduto" render={({ field }) => (<FormItem><FormLabel>Link do Produto</FormLabel><FormControl><Input placeholder="https://" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="observacoes" render={({ field }) => (<FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>)} />
            </form>
            </Form>
        </FormDialog>
        <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
            <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Você tem certeza?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita. Isso excluirá o produto "{itemToDelete?.descricao}".</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={confirmDelete}>Continuar</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

// Histórico de Cotações Tab
function HistoricoCotacoesTab({ produtos, fornecedores, onDataChanged }: TabProps) {
    const [cotacoes, setCotacoes] = React.useState<Cotacao[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [isSaving, setIsSaving] = React.useState(false);
    const [isAlertOpen, setIsAlertOpen] = React.useState(false);
    const [itemToDelete, setItemToDelete] = React.useState<Cotacao | null>(null);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const { user, isUserLoading } = useUser();
    
    const { toast } = useToast();

    const form = useForm<CotacaoFormValues>({
        resolver: zodResolver(cotacaoFormSchema),
        defaultValues: {
            produtoId: '',
            dataCotacao: undefined,
            precoCotado: undefined,
            fornecedorId: '',
            freteCotado: undefined,
            observacoes: '',
        },
    });

    const loadCotacoes = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await cotacaoRepository.list();
            setCotacoes(data.sort((a, b) => new Date(b.dataCotacao).getTime() - new Date(a.dataCotacao).getTime()));
        } catch (error) {
            toast({ title: 'Erro ao carregar cotações', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    React.useEffect(() => {
        if (isUserLoading || !user) return;
        loadCotacoes();
    }, [loadCotacoes, user, isUserLoading]);

    const onSubmit = async (values: CotacaoFormValues) => {
        setIsSaving(true);
        const dataToSave = {
            ...values,
            dataCotacao: formatDate(values.dataCotacao, 'yyyy-MM-dd'),
        };

        try {
            if (editingId) {
                await cotacaoRepository.update(editingId, dataToSave);
                toast({ title: 'Sucesso!', description: 'Cotação atualizada.' });
            } else {
                await cotacaoRepository.create(dataToSave);
                toast({ title: 'Sucesso!', description: 'Cotação adicionada.' });
            }
            setIsFormOpen(false);
            setEditingId(null);
            form.reset();
            onDataChanged();
            await loadCotacoes();
        } catch (error) {
            toast({ title: 'Erro ao salvar', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleEdit = (cotacao: Cotacao) => {
        setEditingId(cotacao.id);
        form.reset({
            ...cotacao,
            dataCotacao: parseISO(cotacao.dataCotacao),
        });
        setIsFormOpen(true);
    };

    const handleDelete = (cotacao: Cotacao) => {
        setItemToDelete(cotacao);
        setIsAlertOpen(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            await cotacaoRepository.delete(itemToDelete.id);
            toast({ title: 'Sucesso!', description: 'Cotação excluída.', variant: 'destructive' });
            await loadCotacoes();
        } catch (error) {
            toast({ title: 'Erro ao excluir', variant: 'destructive' });
        } finally {
            setIsAlertOpen(false);
            setItemToDelete(null);
        }
    };
    
    const handleNew = () => {
        setEditingId(null);
        form.reset({ dataCotacao: new Date() });
        setIsFormOpen(true);
    };

    const columns: ColumnDef<Cotacao>[] = React.useMemo(() => [
        { accessorKey: 'dataCotacao', header: 'Data', cell: (row) => formatDate(parseISO(row.dataCotacao), 'dd/MM/yyyy') },
        { accessorKey: 'produtoId', header: 'Produto', cell: (row) => produtos.find(p => p.id === row.produtoId)?.descricao || 'N/A' },
        { accessorKey: 'fornecedorId', header: 'Fornecedor', cell: (row) => fornecedores.find(f => f.id === row.fornecedorId)?.nomeFantasia || 'N/A' },
        { accessorKey: 'precoCotado', header: 'Preço Cotado', align: 'right', cell: (row) => formatCurrency(row.precoCotado) },
        { accessorKey: 'freteCotado', header: 'Frete', align: 'right', cell: (row) => row.freteCotado ? formatCurrency(row.freteCotado) : '-' },
        { accessorKey: 'actions', header: 'Ações', align: 'right', cell: (row) => (
            <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEdit(row)}>Editar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDelete(row)}>Excluir</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        )},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [produtos, fornecedores]);

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <CardTitle>Histórico de Cotações</CardTitle>
                        <CardDescription>Registre os preços cotados para cada produto.</CardDescription>
                    </div>
                    <Button onClick={handleNew}><PlusCircle className="mr-2 h-4 w-4" /> Nova Cotação</Button>
                </div>
            </CardHeader>
            <CardContent>
                <DataTable columns={columns} data={cotacoes} isLoading={isLoading} emptyStateMessage="Nenhuma cotação encontrada." />

                <FormDialog open={isFormOpen} onOpenChange={(isOpen) => {
                    if (!isOpen) {
                        setEditingId(null);
                        form.reset();
                    }
                    setIsFormOpen(isOpen);
                }} title={editingId ? 'Editar Cotação' : 'Nova Cotação'} formId={COTACAO_FORM_ID} isSaving={isSaving}>
                    <Form {...form}>
                        <form id={COTACAO_FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField control={form.control} name="produtoId" render={({ field }) => (
                                <FormItem><FormLabel>Produto*</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || ''}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione o produto..." /></SelectTrigger></FormControl>
                                    <SelectContent>{produtos.map(p => <SelectItem key={p.id} value={p.id}>{p.descricao}</SelectItem>)}</SelectContent>
                                </Select><FormMessage />
                                </FormItem>
                            )} />
                            <FormField
                                control={form.control}
                                name="dataCotacao"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Data da Cotação*</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="date"
                                                value={field.value ? formatDate(field.value, 'yyyy-MM-dd') : ''}
                                                onChange={(e) => field.onChange(e.target.value ? parseISO(e.target.value) : undefined)}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField control={form.control} name="precoCotado" render={({ field }) => (<FormItem><FormLabel>Preço Cotado*</FormLabel><FormControl><CurrencyInput value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)} />
                                <FormField control={form.control} name="freteCotado" render={({ field }) => (<FormItem><FormLabel>Frete</FormLabel><FormControl><CurrencyInput value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)} />
                            </div>
                            <FormField control={form.control} name="fornecedorId" render={({ field }) => (
                                <FormItem><FormLabel>Fornecedor</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || ''}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="null">Nenhum</SelectItem>
                                        {fornecedores.map(f => <SelectItem key={f.id} value={f.id}>{f.nomeFantasia}</SelectItem>)}
                                    </SelectContent>
                                </Select><FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="observacoes" render={({ field }) => (<FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>)} />
                        </form>
                    </Form>
                </FormDialog>
                <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Você tem certeza?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita. Isso excluirá a cotação.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={confirmDelete}>Continuar</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    );
}
