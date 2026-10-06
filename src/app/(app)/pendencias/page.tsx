'use client';

import * as React from 'react';
import { PlusCircle, CheckCircle2, RotateCcw, Pencil, Trash2, CalendarClock, FileText } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';
import type { Pendencia, PrioridadePendencia } from '@/lib/models';
import { pendenciaRepository, type NovaPendencia } from '@/lib/repositories/pendencia-repository';

const FUNCIONARIOS = ['Paula', 'Lucas', 'Fábio', 'Diana', 'Otávio', 'André'];

type FiltroStatus = 'ABERTA' | 'RESOLVIDA' | 'TODAS';

const vazio: NovaPendencia = {
  funcionario: 'Paula',
  contexto: '',
  titulo: '',
  descricao: '',
  referencia: '',
  prazo: '',
  prioridade: 'MEDIA',
};

function diasAte(prazo?: string | null): number | null {
  if (!prazo) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const p = new Date(`${prazo.slice(0, 10)}T00:00:00`);
  return Math.round((p.getTime() - hoje.getTime()) / 86400000);
}

function formatarData(iso?: string | null) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function PrazoBadge({ prazo }: { prazo?: string | null }) {
  const d = diasAte(prazo);
  if (d === null) return <Badge variant="outline">Sem prazo</Badge>;
  if (d < 0) return <Badge variant="destructive">Vencida há {Math.abs(d)}d · {formatarData(prazo)}</Badge>;
  if (d <= 3) return <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Vence em {d}d · {formatarData(prazo)}</Badge>;
  return <Badge variant="secondary">{formatarData(prazo)}</Badge>;
}

const corPrioridade: Record<PrioridadePendencia, string> = {
  ALTA: 'bg-red-100 text-red-800 border-red-200',
  MEDIA: 'bg-blue-100 text-blue-800 border-blue-200',
  BAIXA: 'bg-slate-100 text-slate-700 border-slate-200',
};

export default function PendenciasPage() {
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  const [itens, setItens] = React.useState<Pendencia[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [filtroStatus, setFiltroStatus] = React.useState<FiltroStatus>('ABERTA');
  const [filtroFuncionario, setFiltroFuncionario] = React.useState<string>('TODOS');
  const [busca, setBusca] = React.useState('');

  const [formAberto, setFormAberto] = React.useState(false);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<NovaPendencia>(vazio);

  const [resolvendo, setResolvendo] = React.useState<Pendencia | null>(null);
  const [textoResolucao, setTextoResolucao] = React.useState('');

  const carregar = React.useCallback(async () => {
    setCarregando(true);
    try {
      setItens(await pendenciaRepository.list());
    } catch {
      toast({ title: 'Erro ao carregar pendências', variant: 'destructive' });
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (isUserLoading || !user) return;
    carregar();
  }, [user, isUserLoading, carregar]);

  // API para os agentes (Claude) operarem o painel pelo navegador, com a sessão do usuário logado.
  React.useEffect(() => {
    if (!user) return;
    const api = {
      listar: async (status: FiltroStatus = 'ABERTA') => {
        const todos = await pendenciaRepository.list();
        return status === 'TODAS' ? todos : todos.filter(p => p.status === status);
      },
      criar: async (dados: NovaPendencia) => {
        const id = await pendenciaRepository.upsert({ origem: 'AGENTE', ...dados });
        await carregar();
        return id;
      },
      resolver: async (chaveOuId: string, resolucao?: string) => {
        let n = await pendenciaRepository.resolverPorChave(chaveOuId, resolucao);
        if (n === 0) {
          await pendenciaRepository.resolver(chaveOuId, resolucao);
          n = 1;
        }
        await carregar();
        return n;
      },
    };
    (window as any).amPendencias = api;
    return () => {
      delete (window as any).amPendencias;
    };
  }, [user, carregar]);

  const visiveis = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens
      .filter(p => filtroStatus === 'TODAS' || p.status === filtroStatus)
      .filter(p => filtroFuncionario === 'TODOS' || p.funcionario === filtroFuncionario)
      .filter(p => !termo || [p.titulo, p.contexto, p.descricao, p.referencia].join(' ').toLowerCase().includes(termo))
      .sort((a, b) => {
        const da = diasAte(a.prazo) ?? 9999;
        const db = diasAte(b.prazo) ?? 9999;
        if (da !== db) return da - db;
        const ordem = { ALTA: 0, MEDIA: 1, BAIXA: 2 } as const;
        return ordem[a.prioridade] - ordem[b.prioridade];
      });
  }, [itens, filtroStatus, filtroFuncionario, busca]);

  const grupos = React.useMemo(() => {
    const g = new Map<string, Pendencia[]>();
    visiveis.forEach(p => g.set(p.funcionario, [...(g.get(p.funcionario) || []), p]));
    return Array.from(g.entries());
  }, [visiveis]);

  const abertas = itens.filter(p => p.status === 'ABERTA');
  const vencidas = abertas.filter(p => (diasAte(p.prazo) ?? 1) < 0).length;
  const proximas = abertas.filter(p => {
    const d = diasAte(p.prazo);
    return d !== null && d >= 0 && d <= 3;
  }).length;

  const abrirNova = () => {
    setEditandoId(null);
    setForm(vazio);
    setFormAberto(true);
  };

  const abrirEdicao = (p: Pendencia) => {
    setEditandoId(p.id);
    setForm({
      funcionario: p.funcionario,
      contexto: p.contexto,
      titulo: p.titulo,
      descricao: p.descricao || '',
      referencia: p.referencia || '',
      prazo: p.prazo ? p.prazo.slice(0, 10) : '',
      prioridade: p.prioridade,
      chave: p.chave,
    });
    setFormAberto(true);
  };

  const salvar = async () => {
    if (!form.titulo.trim() || !form.contexto.trim()) {
      toast({ title: 'Preencha o título e o contexto.', variant: 'destructive' });
      return;
    }
    const dados = { ...form, prazo: form.prazo || null };
    try {
      if (editandoId) await pendenciaRepository.update(editandoId, dados);
      else await pendenciaRepository.upsert({ ...dados, origem: 'MANUAL' });
      setFormAberto(false);
      toast({ title: 'Pendência salva.' });
      await carregar();
    } catch {
      toast({ title: 'Erro ao salvar a pendência.', variant: 'destructive' });
    }
  };

  const confirmarResolucao = async () => {
    if (!resolvendo) return;
    await pendenciaRepository.resolver(resolvendo.id, textoResolucao);
    setResolvendo(null);
    setTextoResolucao('');
    toast({ title: 'Pendência resolvida.' });
    await carregar();
  };

  const reabrir = async (p: Pendencia) => {
    await pendenciaRepository.reabrir(p.id);
    await carregar();
  };

  const excluir = async (p: Pendencia) => {
    if (!window.confirm(`Excluir a pendência "${p.titulo}"?`)) return;
    await pendenciaRepository.delete(p.id);
    await carregar();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pendências</h1>
          <p className="text-muted-foreground">O que a equipe (Paula, Lucas, Fábio, Diana, Otávio) precisa de você para seguir.</p>
        </div>
        <Button onClick={abrirNova}>
          <PlusCircle className="mr-2 h-4 w-4" /> Nova pendência
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Abertas</CardDescription><CardTitle className="text-3xl">{abertas.length}</CardTitle></CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Vencem em até 3 dias</CardDescription><CardTitle className="text-3xl text-amber-600">{proximas}</CardTitle></CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Vencidas</CardDescription><CardTitle className="text-3xl text-red-600">{vencidas}</CardTitle></CardHeader>
        </Card>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <Select value={filtroStatus} onValueChange={v => setFiltroStatus(v as FiltroStatus)}>
          <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ABERTA">Abertas</SelectItem>
            <SelectItem value="RESOLVIDA">Resolvidas</SelectItem>
            <SelectItem value="TODAS">Todas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroFuncionario} onValueChange={setFiltroFuncionario}>
          <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos os funcionários</SelectItem>
            {FUNCIONARIOS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Buscar por título, contexto ou referência…" value={busca} onChange={e => setBusca(e.target.value)} />
      </div>

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : grupos.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma pendência neste filtro.</CardContent></Card>
      ) : (
        grupos.map(([funcionario, lista]) => (
          <Card key={funcionario}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {funcionario}
                <Badge variant="outline">{lista.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lista.map(p => (
                <div key={p.id} className={`rounded-lg border p-4 ${p.status === 'RESOLVIDA' ? 'opacity-60' : ''}`}>
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{p.titulo}</span>
                        <span className={`rounded border px-2 py-0.5 text-xs ${corPrioridade[p.prioridade]}`}>{p.prioridade}</span>
                        {p.origem === 'AGENTE' && <Badge variant="outline">agente</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{p.contexto}</p>
                      {p.descricao && <p className="whitespace-pre-line text-sm">{p.descricao}</p>}
                      {p.referencia && (
                        <p className="flex items-center gap-1 break-all text-xs text-muted-foreground">
                          <FileText className="h-3 w-3" /> {p.referencia}
                        </p>
                      )}
                      {p.status === 'RESOLVIDA' && (
                        <p className="text-xs text-green-700">
                          Resolvida em {formatarData(p.resolvidaEm)}{p.resolucao ? ` · ${p.resolucao}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
                      <span className="flex items-center gap-1"><CalendarClock className="h-4 w-4 text-muted-foreground" /><PrazoBadge prazo={p.prazo} /></span>
                      <div className="flex gap-1">
                        {p.status === 'ABERTA' ? (
                          <Button size="sm" onClick={() => setResolvendo(p)}><CheckCircle2 className="mr-1 h-4 w-4" /> Resolvida</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => reabrir(p)}><RotateCcw className="mr-1 h-4 w-4" /> Reabrir</Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => abrirEdicao(p)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => excluir(p)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={formAberto} onOpenChange={setFormAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editandoId ? 'Editar pendência' : 'Nova pendência'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>Funcionário</Label>
                <Select value={form.funcionario} onValueChange={v => setForm({ ...form, funcionario: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FUNCIONARIOS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label>Prioridade</Label>
                <Select value={form.prioridade} onValueChange={v => setForm({ ...form, prioridade: v as PrioridadePendencia })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALTA">Alta</SelectItem>
                    <SelectItem value="MEDIA">Média</SelectItem>
                    <SelectItem value="BAIXA">Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1"><Label>Contexto</Label><Input value={form.contexto} onChange={e => setForm({ ...form, contexto: e.target.value })} placeholder="Ex.: Cozinha Solidária – set/2026" /></div>
            <div className="grid gap-1"><Label>O que precisa</Label><Input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Enviar extrato bancário de setembro" /></div>
            <div className="grid gap-1"><Label>Detalhes</Label><Textarea rows={3} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1"><Label>Prazo</Label><Input type="date" value={form.prazo || ''} onChange={e => setForm({ ...form, prazo: e.target.value })} /></div>
              <div className="grid gap-1"><Label>Referência</Label><Input value={form.referencia} onChange={e => setForm({ ...form, referencia: e.target.value })} placeholder="Arquivo, link, nº" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormAberto(false)}>Cancelar</Button>
            <Button onClick={salvar}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resolvendo} onOpenChange={o => !o && setResolvendo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como resolvida</DialogTitle>
            <DialogDescription>{resolvendo?.titulo}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1">
            <Label>Como foi resolvida (opcional)</Label>
            <Textarea rows={3} value={textoResolucao} onChange={e => setTextoResolucao(e.target.value)} placeholder="Ex.: extrato salvo na pasta do mês" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolvendo(null)}>Cancelar</Button>
            <Button onClick={confirmarResolucao}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
