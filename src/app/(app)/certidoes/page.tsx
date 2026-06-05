'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { differenceInDays, parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PlusCircle, MoreHorizontal, ShieldCheck, ShieldAlert, ShieldX, RefreshCw } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FormDialog } from '@/components/ui/form-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';

import type { Certidao, StatusCertidao, TipoCertidao } from '@/lib/models';
import { TIPO_CERTIDAO_LABELS } from '@/lib/models';
import { certidaoRepository } from '@/lib/repositories/certidao-repository';

// ── Helpers ──────────────────────────────────────────────────────────────────

const DIAS_AVISO = 15;

function calcularStatus(dataVencimentoISO: string): StatusCertidao {
  const dias = differenceInDays(parseISO(dataVencimentoISO), new Date());
  if (dias < 0) return 'VENCIDA';
  if (dias <= DIAS_AVISO) return 'A_VENCER';
  return 'VALIDA';
}

function diasRestantes(dataVencimentoISO: string): number {
  return differenceInDays(parseISO(dataVencimentoISO), new Date());
}

type CertidaoComStatus = Certidao & { status: StatusCertidao; diasRestantes: number };

function enrichCertidao(c: Certidao): CertidaoComStatus {
  return {
    ...c,
    status: calcularStatus(c.dataVencimentoISO),
    diasRestantes: diasRestantes(c.dataVencimentoISO),
  };
}

// ── Schema ────────────────────────────────────────────────────────────────────

const certidaoSchema = z.object({
  empresaId: z.string().min(1, 'Empresa é obrigatória.'),
  empresaNome: z.string().min(1, 'Nome da empresa é obrigatório.'),
  empresaCnpj: z.string().optional(),
  tipoEmpresa: z.enum(['PROPRIA', 'ASSESSORADA']),
  tipoCertidao: z.enum([
    'CND_FEDERAL', 'CND_ESTADUAL', 'CND_MUNICIPAL', 'CRF_FGTS',
    'CNDT', 'CERTIDAO_FALENCIA', 'TCU_CGU_CONSOLIDADA', 'CND_TCE', 'OUTROS',
  ]),
  nome: z.string().min(1, 'Nome é obrigatório.'),
  dataEmissaoISO: z.string().optional(),
  dataVencimentoISO: z.string().min(1, 'Data de vencimento é obrigatória.'),
  observacoes: z.string().optional(),
});

type CertidaoFormValues = z.infer<typeof certidaoSchema>;

const FORM_ID = 'certidao-form';

// ── Empresas pré-cadastradas (AM Contratos + assessoradas) ────────────────────

const EMPRESAS_PRESET = [
  { id: 'am-contratos',  nome: 'AM Contratos e Soluções B2G', cnpj: '59.802.261/0001-78', tipo: 'PROPRIA' as const },
  { id: 'amasamc',       nome: 'AMASAMC',       cnpj: '', tipo: 'ASSESSORADA' as const },
  { id: 'aspvida',       nome: 'ASPVIDA',        cnpj: '', tipo: 'ASSESSORADA' as const },
  { id: 'cantuaria',     nome: 'Cantuária',      cnpj: '', tipo: 'ASSESSORADA' as const },
  { id: 'lm',            nome: 'LM',             cnpj: '', tipo: 'ASSESSORADA' as const },
  { id: 'lmt-viagens',   nome: 'LMT Viagens',   cnpj: '', tipo: 'ASSESSORADA' as const },
  { id: 'pro-lazer',     nome: 'Pro Lazer',      cnpj: '', tipo: 'ASSESSORADA' as const },
];

// ── Componente principal ──────────────────────────────────────────────────────

export default function CertidoesPage() {
  const [certidoes, setCertidoes] = React.useState<CertidaoComStatus[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = React.useState(false);
  const [itemToDelete, setItemToDelete] = React.useState<Certidao | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [filtroEmpresa, setFiltroEmpresa] = React.useState<string>('TODAS');
  const [filtroStatus, setFiltroStatus] = React.useState<string>('TODOS');
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();

  const form = useForm<CertidaoFormValues>({
    resolver: zodResolver(certidaoSchema),
    defaultValues: {
      empresaId: 'am-contratos',
      empresaNome: 'AM Contratos e Soluções B2G',
      empresaCnpj: '59.802.261/0001-78',
      tipoEmpresa: 'PROPRIA',
      tipoCertidao: 'CND_FEDERAL',
      nome: '',
      dataEmissaoISO: '',
      dataVencimentoISO: '',
      observacoes: '',
    },
  });

  const loadCertidoes = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await certidaoRepository.list();
      setCertidoes(data.map(enrichCertidao).sort((a, b) => a.diasRestantes - b.diasRestantes));
    } catch {
      toast({ title: 'Erro ao carregar certidões', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (isUserLoading || !user) return;
    loadCertidoes();
  }, [loadCertidoes, user, isUserLoading]);

  const dadosFiltrados = React.useMemo(() => {
    return certidoes.filter(c => {
      const empresaOk = filtroEmpresa === 'TODAS' || c.empresaId === filtroEmpresa;
      const statusOk = filtroStatus === 'TODOS' || c.status === filtroStatus;
      return empresaOk && statusOk;
    });
  }, [certidoes, filtroEmpresa, filtroStatus]);

  const resumo = React.useMemo(() => ({
    vencidas: certidoes.filter(c => c.status === 'VENCIDA').length,
    aVencer: certidoes.filter(c => c.status === 'A_VENCER').length,
    validas: certidoes.filter(c => c.status === 'VALIDA').length,
  }), [certidoes]);

  const onSubmit = async (values: CertidaoFormValues) => {
    setIsSaving(true);
    try {
      if (editingId) {
        await certidaoRepository.update(editingId, values);
        toast({ title: 'Certidão atualizada com sucesso!' });
      } else {
        await certidaoRepository.create(values);
        toast({ title: 'Certidão cadastrada com sucesso!' });
      }
      setIsFormOpen(false);
      await loadCertidoes();
    } catch {
      toast({ title: 'Erro ao salvar certidão', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (c: Certidao) => {
    setEditingId(c.id);
    form.reset(c);
    setIsFormOpen(true);
  };

  const handleDelete = (c: Certidao) => {
    setItemToDelete(c);
    setIsDeleteAlertOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await certidaoRepository.delete(itemToDelete.id);
      toast({ title: 'Certidão excluída.', variant: 'destructive' });
      await loadCertidoes();
    } catch {
      toast({ title: 'Erro ao excluir certidão.', variant: 'destructive' });
    } finally {
      setIsDeleteAlertOpen(false);
      setItemToDelete(null);
    }
  };

  const handleNew = () => {
    setEditingId(null);
    form.reset({
      empresaId: 'am-contratos',
      empresaNome: 'AM Contratos e Soluções B2G',
      empresaCnpj: '59.802.261/0001-78',
      tipoEmpresa: 'PROPRIA',
      tipoCertidao: 'CND_FEDERAL',
      nome: '',
      dataEmissaoISO: '',
      dataVencimentoISO: '',
      observacoes: '',
    });
    setIsFormOpen(true);
  };

  // Quando empresa muda no form, preenche os outros campos automaticamente
  const watchEmpresaId = form.watch('empresaId');
  React.useEffect(() => {
    const preset = EMPRESAS_PRESET.find(e => e.id === watchEmpresaId);
    if (preset) {
      form.setValue('empresaNome', preset.nome);
      form.setValue('empresaCnpj', preset.cnpj);
      form.setValue('tipoEmpresa', preset.tipo);
    }
  }, [watchEmpresaId, form]);

  // Quando tipo de certidão muda, preenche o nome automaticamente
  const watchTipoCertidao = form.watch('tipoCertidao');
  React.useEffect(() => {
    if (watchTipoCertidao && !editingId) {
      form.setValue('nome', TIPO_CERTIDAO_LABELS[watchTipoCertidao as TipoCertidao] ?? '');
    }
  }, [watchTipoCertidao, editingId, form]);

  const statusConfig: Record<StatusCertidao, { label: string; variant: 'default' | 'outline' | 'destructive' | 'secondary'; icon: React.ElementType }> = {
    VALIDA:   { label: 'Válida',    variant: 'default',      icon: ShieldCheck },
    A_VENCER: { label: 'A Vencer',  variant: 'outline',      icon: ShieldAlert },
    VENCIDA:  { label: 'Vencida',   variant: 'destructive',  icon: ShieldX },
  };

  const columns: ColumnDef<CertidaoComStatus>[] = React.useMemo(() => [
    {
      accessorKey: 'empresaNome',
      header: 'Empresa',
      cell: (row) => (
        <div>
          <p className="font-medium">{row.empresaNome}</p>
          <p className="text-xs text-muted-foreground">{row.empresaCnpj}</p>
        </div>
      ),
    },
    {
      accessorKey: 'nome',
      header: 'Certidão',
      cell: (row) => (
        <div>
          <p className="font-medium">{row.nome}</p>
          <p className="text-xs text-muted-foreground">{TIPO_CERTIDAO_LABELS[row.tipoCertidao]}</p>
        </div>
      ),
    },
    {
      accessorKey: 'dataVencimentoISO',
      header: 'Vencimento',
      cell: (row) => (
        <span>{format(parseISO(row.dataVencimentoISO), 'dd/MM/yyyy', { locale: ptBR })}</span>
      ),
    },
    {
      accessorKey: 'diasRestantes',
      header: 'Dias',
      cell: (row) => {
        const dias = row.diasRestantes;
        const cor = dias < 0 ? 'text-destructive font-bold' : dias <= DIAS_AVISO ? 'text-orange-500 font-semibold' : 'text-muted-foreground';
        return <span className={cor}>{dias < 0 ? `${Math.abs(dias)}d vencida` : `${dias}d restantes`}</span>;
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (row) => {
        const { label, variant, icon: Icon } = statusConfig[row.status];
        return <Badge variant={variant} className="gap-1"><Icon className="h-3 w-3" />{label}</Badge>;
      },
    },
    {
      accessorKey: 'actions',
      header: 'Ações',
      align: 'right',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEdit(row)}>Editar / Renovar</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDelete(row)} className="text-destructive">Excluir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], []);

  return (
    <div className="space-y-6">
      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-destructive/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><ShieldX className="h-4 w-4 text-destructive" /> Vencidas</CardTitle>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold text-destructive">{resumo.vencidas}</p></CardContent>
        </Card>
        <Card className="border-orange-300/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-orange-500" /> A Vencer (≤{DIAS_AVISO}d)</CardTitle>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold text-orange-500">{resumo.aVencer}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-green-600" /> Válidas</CardTitle>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold text-green-600">{resumo.validas}</p></CardContent>
        </Card>
      </div>

      {/* Tabela principal */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Controle de Certidões</CardTitle>
              <CardDescription>Todas as certidões da empresa e assessoradas, ordenadas por urgência.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={loadCertidoes} title="Atualizar"><RefreshCw className="h-4 w-4" /></Button>
              <Button onClick={handleNew}><PlusCircle className="mr-2 h-4 w-4" /> Nova Certidão</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filtros */}
          <div className="flex gap-3 mb-4">
            <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Filtrar por empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas as empresas</SelectItem>
                {EMPRESAS_PRESET.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos os status</SelectItem>
                <SelectItem value="VENCIDA">Vencidas</SelectItem>
                <SelectItem value="A_VENCER">A Vencer</SelectItem>
                <SelectItem value="VALIDA">Válidas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DataTable
            columns={columns}
            data={dadosFiltrados}
            isLoading={isLoading}
            emptyStateMessage="Nenhuma certidão encontrada. Clique em 'Nova Certidão' para começar."
          />
        </CardContent>
      </Card>

      {/* Formulário de cadastro/edição */}
      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingId ? 'Editar / Renovar Certidão' : 'Nova Certidão'}
        formId={FORM_ID}
        isSaving={isSaving}
      >
        <Form {...form}>
          <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="empresaId" render={({ field }) => (
              <FormItem>
                <FormLabel>Empresa*</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {EMPRESAS_PRESET.map(e => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome} {e.tipo === 'PROPRIA' ? '(própria)' : '(assessorada)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="tipoCertidao" render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Certidão*</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {Object.entries(TIPO_CERTIDAO_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="nome" render={({ field }) => (
              <FormItem>
                <FormLabel>Nome da Certidão*</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="dataEmissaoISO" render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Emissão</FormLabel>
                  <FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="dataVencimentoISO" render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Vencimento*</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="observacoes" render={({ field }) => (
              <FormItem>
                <FormLabel>Observações</FormLabel>
                <FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Ex.: Pendente regularização Receita Federal" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </form>
        </Form>
      </FormDialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir a certidão &quot;{itemToDelete?.nome}&quot; de {itemToDelete?.empresaNome}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
