'use client';

import * as React from 'react';
import { PlusCircle, Trash2, FileDown, Save, Calculator, CheckCircle2, AlertTriangle } from 'lucide-react';

import type { ClienteAssessoria, PrecificacaoAssessoria } from '@/lib/models';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CurrencyInput } from '@/components/ui/currency-input';
import { PercentInput } from '@/components/ui/percent-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';

import { impostoRepository } from '@/lib/repositories/imposto-repository';
import { configuracaoRepository } from '@/lib/repositories/configuracao-repository';
import { custoFixoRepository } from '@/lib/repositories/custo-fixo-repository';
import { clienteAssessoriaRepository } from '@/lib/repositories/cliente-assessoria-repository';
import { precificacaoAssessoriaRepository } from '@/lib/repositories/precificacao-assessoria-repository';
import {
  calcularPrecoAssessoria,
  custoLinha,
  overheadPercentPadrao,
  simularPreco,
  type LinhaCustoAssessoria,
} from '@/lib/assessoria/pricing-assessoria';
import { calcularExitoHibrido, calcularExitoPorFaixa } from '@/lib/assessoria/fee-calculator';
import { gerarPropostaPdf } from '@/lib/assessoria/proposta-pdf';

const novaLinha = (tipo: LinhaCustoAssessoria['tipo'] = 'HORAS'): LinhaCustoAssessoria => ({
  id: Math.random().toString(36).slice(2, 10),
  descricao: '',
  tipo,
  quantidade: tipo === 'HORAS' ? 1 : 1,
  valorUnitario: 0,
});

interface Props {
  /** Cliente cadastrado; sem ele, a tela funciona como calculadora avulsa de proposta. */
  cliente?: ClienteAssessoria | null;
  onVinculoAtualizado?: () => void;
}

export function PrecificacaoAssessoriaPanel({ cliente, onVinculoAtualizado }: Props) {
  const { toast } = useToast();

  // Identificação
  const [clienteNome, setClienteNome] = React.useState(cliente?.nomeFantasia ?? '');
  const [clienteCnpj, setClienteCnpj] = React.useState(cliente?.cnpj ?? '');
  const [titulo, setTitulo] = React.useState('Assessoria em licitações e contratos públicos');
  const [escopo, setEscopo] = React.useState('');
  const [observacoes, setObservacoes] = React.useState('');
  const [validadeDias, setValidadeDias] = React.useState(15);

  // Custos e parâmetros
  const [tipoCobranca, setTipoCobranca] = React.useState<'MENSAL' | 'POR_PROCESSO'>('MENSAL');
  const [periodos, setPeriodos] = React.useState(12);
  const [linhas, setLinhas] = React.useState<LinhaCustoAssessoria[]>([novaLinha('HORAS')]);
  const [overheadPercent, setOverheadPercent] = React.useState(0);
  const [variavelPercent, setVariavelPercent] = React.useState(0);
  const [impostoPercent, setImpostoPercent] = React.useState(6);
  const [margemPercent, setMargemPercent] = React.useState(30);
  const [precoProposto, setPrecoProposto] = React.useState<number | null>(null);

  // Êxito
  const [modeloExito, setModeloExito] = React.useState<'NENHUM' | 'EXITO' | 'HIBRIDO'>('NENHUM');
  const [valorEmpenho, setValorEmpenho] = React.useState(100000);

  // Salvos
  const [salvos, setSalvos] = React.useState<PrecificacaoAssessoria[]>([]);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [confirmarAplicar, setConfirmarAplicar] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const carregarSalvos = React.useCallback(async () => {
    try {
      const todos = await precificacaoAssessoriaRepository.list();
      setSalvos(todos.filter(p => (cliente ? p.clienteId === cliente.id : !p.clienteId)));
    } catch {
      /* a lista é opcional; erros de permissão já são exibidos pelo listener global */
    }
  }, [cliente]);

  // Padrões vindos das Configurações (mesmos usados no módulo de certames)
  React.useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [imposto, config, fixos] = await Promise.all([
          impostoRepository.getSettings(),
          configuracaoRepository.get(),
          custoFixoRepository.list(),
        ]);
        if (!ativo) return;
        setImpostoPercent(imposto.aliquotaServico);
        setOverheadPercent(Number(overheadPercentPadrao(config, fixos).toFixed(2)));
      } catch {
        /* mantém os valores informados à mão */
      }
    })();
    carregarSalvos();
    return () => {
      ativo = false;
    };
  }, [carregarSalvos]);

  const parametros = React.useMemo(
    () => ({ linhas, overheadPercent, variavelPercent, impostoPercent, margemPercent }),
    [linhas, overheadPercent, variavelPercent, impostoPercent, margemPercent]
  );
  const resultado = React.useMemo(() => calcularPrecoAssessoria(parametros), [parametros]);

  const valorProposto = precoProposto ?? resultado.precoRecomendado;
  const simulacao = React.useMemo(() => simularPreco(parametros, valorProposto), [parametros, valorProposto]);
  const abaixoDoMinimo = resultado.valido && valorProposto < resultado.precoMinimo;
  const abaixoDaMeta = resultado.valido && simulacao.margemLiquidaPercent < margemPercent - 0.005;

  const totalPeriodo = tipoCobranca === 'MENSAL' ? periodos : 1;

  const exito = React.useMemo(() => {
    if (modeloExito === 'NENHUM' || valorEmpenho <= 0) return null;
    return modeloExito === 'EXITO' ? calcularExitoPorFaixa(valorEmpenho) : calcularExitoHibrido(valorEmpenho);
  }, [modeloExito, valorEmpenho]);

  // Comparação: o êxito sozinho cobriria o custo do período inteiro com a margem desejada?
  const comparacaoExito = React.useMemo(() => {
    if (!exito) return null;
    const receita = exito.valorExito + (modeloExito === 'HIBRIDO' ? valorProposto * totalPeriodo : 0);
    return { receita, ...simularPreco(parametros, receita, totalPeriodo) };
  }, [exito, modeloExito, parametros, valorProposto, totalPeriodo]);

  const atualizarLinha = (id: string, parte: Partial<LinhaCustoAssessoria>) =>
    setLinhas(ls => ls.map(l => (l.id === id ? { ...l, ...parte } : l)));

  const montarRegistro = (): Omit<PrecificacaoAssessoria, 'id' | 'createdAt' | 'updatedAt'> => ({
    clienteId: cliente?.id ?? null,
    clienteNome: clienteNome.trim(),
    clienteCnpj: clienteCnpj.trim() || undefined,
    titulo: titulo.trim(),
    tipoCobranca,
    periodos: totalPeriodo,
    linhas,
    overheadPercent,
    variavelPercent,
    impostoPercent,
    margemPercent,
    valorEmpenhoEstimado: modeloExito === 'NENHUM' ? undefined : valorEmpenho,
    modeloExito,
    escopo: escopo.trim() || undefined,
    validadeDias,
    observacoes: observacoes.trim() || undefined,
    precoRecomendado: resultado.precoRecomendado,
    precoProposto: valorProposto,
    status: 'RASCUNHO',
  });

  const salvar = async () => {
    if (!clienteNome.trim()) {
      toast({ variant: 'destructive', title: 'Informe o nome do cliente ou proponente.' });
      return;
    }
    setIsSaving(true);
    try {
      const registro = montarRegistro();
      if (editandoId) {
        const { status, ...semStatus } = registro;
        void status;
        await precificacaoAssessoriaRepository.update(editandoId, semStatus);
      } else {
        const criado = await precificacaoAssessoriaRepository.create(registro);
        setEditandoId(criado.id);
      }
      toast({ title: 'Precificação salva.' });
      carregarSalvos();
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível salvar a precificação.' });
    } finally {
      setIsSaving(false);
    }
  };

  const abrir = (p: PrecificacaoAssessoria) => {
    setEditandoId(p.id);
    setClienteNome(p.clienteNome);
    setClienteCnpj(p.clienteCnpj ?? '');
    setTitulo(p.titulo);
    setTipoCobranca(p.tipoCobranca);
    setPeriodos(p.tipoCobranca === 'MENSAL' ? p.periodos : 12);
    setLinhas(p.linhas.length ? p.linhas : [novaLinha()]);
    setOverheadPercent(p.overheadPercent);
    setVariavelPercent(p.variavelPercent);
    setImpostoPercent(p.impostoPercent);
    setMargemPercent(p.margemPercent);
    setModeloExito(p.modeloExito ?? 'NENHUM');
    setValorEmpenho(p.valorEmpenhoEstimado ?? 100000);
    setEscopo(p.escopo ?? '');
    setObservacoes(p.observacoes ?? '');
    setValidadeDias(p.validadeDias ?? 15);
    setPrecoProposto(p.precoProposto);
  };

  const excluir = async (id: string) => {
    try {
      await precificacaoAssessoriaRepository.delete(id);
      if (editandoId === id) setEditandoId(null);
      carregarSalvos();
      toast({ title: 'Precificação excluída.' });
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível excluir.' });
    }
  };

  const baixarProposta = () => {
    if (!clienteNome.trim()) {
      toast({ variant: 'destructive', title: 'Informe o nome do cliente ou proponente.' });
      return;
    }
    if (!resultado.valido || valorProposto <= 0) {
      toast({ variant: 'destructive', title: 'Defina os custos e um valor válido antes de gerar a proposta.' });
      return;
    }
    const doc = gerarPropostaPdf({
      clienteNome: clienteNome.trim(),
      clienteCnpj: clienteCnpj.trim() || undefined,
      titulo: titulo.trim() || 'Assessoria',
      tipoCobranca,
      periodos: totalPeriodo,
      precoProposto: valorProposto,
      modeloExito,
      escopo,
      validadeDias,
      observacoes,
    });
    const nomeArquivo = `Proposta_${clienteNome.trim().replace(/[^\p{L}\p{N}]+/gu, '_')}.pdf`;
    doc.save(nomeArquivo);
  };

  const aplicarMensalidade = async () => {
    if (!cliente) return;
    if (!confirmarAplicar) {
      setConfirmarAplicar(true);
      return;
    }
    try {
      await clienteAssessoriaRepository.update(cliente.id, {
        vinculo: {
          ...(cliente.vinculo ?? {}),
          tipoVinculo: cliente.vinculo?.tipoVinculo ?? 'MENSAL',
          mensalidade: valorProposto,
        },
      });
      toast({ title: 'Mensalidade do cliente atualizada.', description: formatCurrency(valorProposto) });
      onVinculoAtualizado?.();
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível atualizar a mensalidade.' });
    } finally {
      setConfirmarAplicar(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      {/* Entradas */}
      <div className="space-y-6 xl:col-span-2">
        {!cliente && (
          <Card>
            <CardHeader>
              <CardTitle>Proposta avulsa</CardTitle>
              <CardDescription>Para quem ainda não está cadastrado como cliente da assessoria.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Cliente ou proponente</Label>
                <Input value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Nome da empresa ou entidade" />
              </div>
              <div className="space-y-2">
                <Label>CNPJ (opcional)</Label>
                <Input value={clienteCnpj} onChange={e => setClienteCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Custos do serviço</CardTitle>
            <CardDescription>
              Informe o que o serviço custa a você {tipoCobranca === 'MENSAL' ? 'em um mês' : 'no processo inteiro'}: horas da equipe, terceiros, deslocamentos, sistemas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Forma de cobrança</Label>
                <Select value={tipoCobranca} onValueChange={v => setTipoCobranca(v as 'MENSAL' | 'POR_PROCESSO')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MENSAL">Mensalidade</SelectItem>
                    <SelectItem value="POR_PROCESSO">Por processo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {tipoCobranca === 'MENSAL' && (
                <div className="space-y-2">
                  <Label>Prazo do contrato (meses)</Label>
                  <Input type="number" min={1} value={periodos} onChange={e => setPeriodos(Math.max(1, Number(e.target.value) || 1))} />
                </div>
              )}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-36">Tipo</TableHead>
                  <TableHead className="w-24">Qtd.</TableHead>
                  <TableHead className="w-40">Valor unitário</TableHead>
                  <TableHead className="w-32 text-right">Subtotal</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map(l => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Input value={l.descricao} onChange={e => atualizarLinha(l.id, { descricao: e.target.value })} placeholder="Ex.: Analista sênior, certificado digital" />
                    </TableCell>
                    <TableCell>
                      <Select value={l.tipo} onValueChange={v => atualizarLinha(l.id, { tipo: v as 'HORAS' | 'VALOR' })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="HORAS">Horas</SelectItem>
                          <SelectItem value="VALOR">Valor fixo</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} step="0.5" value={l.quantidade} onChange={e => atualizarLinha(l.id, { quantidade: Number(e.target.value) || 0 })} />
                    </TableCell>
                    <TableCell>
                      <CurrencyInput value={l.valorUnitario} onChange={v => atualizarLinha(l.id, { valorUnitario: v })} />
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(custoLinha(l))}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" aria-label="Remover linha" onClick={() => setLinhas(ls => ls.filter(x => x.id !== l.id))} disabled={linhas.length === 1}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button variant="outline" size="sm" onClick={() => setLinhas(ls => [...ls, novaLinha()])}>
              <PlusCircle className="mr-2 h-4 w-4" /> Adicionar custo
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Impostos, variáveis e margem</CardTitle>
            <CardDescription>
              Tudo é calculado sobre o preço final. A margem é o lucro que sobra depois de descontar custos, rateio, variáveis e imposto.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Rateio de custos fixos (% do custo)</Label>
              <PercentInput value={overheadPercent} onChange={setOverheadPercent} />
              <p className="text-xs text-muted-foreground">Padrão das Configurações.</p>
            </div>
            <div className="space-y-2">
              <Label>Custos variáveis (% do preço)</Label>
              <PercentInput value={variavelPercent} onChange={setVariavelPercent} />
              <p className="text-xs text-muted-foreground">Comissões, taxas de cobrança.</p>
            </div>
            <div className="space-y-2">
              <Label>Imposto sobre serviço (% do preço)</Label>
              <PercentInput value={impostoPercent} onChange={setImpostoPercent} />
              <p className="text-xs text-muted-foreground">Alíquota de serviço das Configurações.</p>
            </div>
            <div className="space-y-2">
              <Label>Margem de lucro desejada (% do preço)</Label>
              <PercentInput value={margemPercent} onChange={setMargemPercent} />
              <p className="text-xs text-muted-foreground">Lucro final, depois de tudo.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Êxito (opcional)</CardTitle>
            <CardDescription>Compare o preço com o que o modelo de êxito renderia, em escala progressiva.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Modelo</Label>
                <Select value={modeloExito} onValueChange={v => setModeloExito(v as 'NENHUM' | 'EXITO' | 'HIBRIDO')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NENHUM">Sem êxito</SelectItem>
                    <SelectItem value="EXITO">Êxito por faixa</SelectItem>
                    <SelectItem value="HIBRIDO">Híbrido (mensalidade + êxito)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {modeloExito !== 'NENHUM' && (
                <div className="space-y-2">
                  <Label>Valor de empenho estimado</Label>
                  <CurrencyInput value={valorEmpenho} onChange={setValorEmpenho} />
                </div>
              )}
            </div>
            {exito && comparacaoExito && (
              <div className="rounded-md border p-4 text-sm">
                <p className="font-semibold">Honorário de êxito: {formatCurrency(exito.valorExito)} ({(exito.percentual * 100).toFixed(2)}% efetivo)</p>
                <p className="mt-1 text-muted-foreground">{exito.regra}</p>
                <p className="mt-2">
                  Receita total do período no modelo escolhido: <strong>{formatCurrency(comparacaoExito.receita)}</strong>. Lucro depois de tudo:{' '}
                  <strong className={comparacaoExito.lucro < 0 ? 'text-destructive' : ''}>{formatCurrency(comparacaoExito.lucro)}</strong>{' '}
                  ({comparacaoExito.margemLiquidaPercent.toFixed(1)}% da receita).
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Texto da proposta</CardTitle>
            <CardDescription>Aparece no PDF entregue ao cliente. Custos, impostos e margem nunca são exibidos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={titulo} onChange={e => setTitulo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Escopo dos serviços</Label>
              <Textarea rows={5} value={escopo} onChange={e => setEscopo(e.target.value)} placeholder="Descreva o que será entregue ao cliente." />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Validade (dias)</Label>
                <Input type="number" min={1} value={validadeDias} onChange={e => setValidadeDias(Math.max(1, Number(e.target.value) || 1))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Condições e observações</Label>
              <Textarea rows={3} value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Forma de pagamento, reajuste, prazos." />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resultado */}
      <div className="space-y-6">
        <Card className="xl:sticky xl:top-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> Preço final</CardTitle>
            <CardDescription>{tipoCobranca === 'MENSAL' ? 'Valor mensal' : 'Valor do processo'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!resultado.valido ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {resultado.custoBase <= 0
                  ? 'Informe ao menos um custo para calcular o preço.'
                  : 'Imposto, variáveis e margem somam 100% ou mais do preço: não existe preço que cumpra essa margem. Reduza a margem.'}
              </div>
            ) : (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Preço recomendado</p>
                  <p className="text-3xl font-bold">{formatCurrency(resultado.precoRecomendado)}</p>
                  <p className="text-xs text-muted-foreground">Preço mínimo (lucro zero): {formatCurrency(resultado.precoMinimo)}</p>
                </div>
                <div className="space-y-1 text-sm">
                  <Linha rotulo="Custo direto" valor={resultado.custoDireto} />
                  <Linha rotulo="Rateio de custos fixos" valor={resultado.overhead} />
                  <Linha rotulo="Custos variáveis" valor={resultado.variavel} />
                  <Linha rotulo={`Imposto (${impostoPercent.toLocaleString('pt-BR')}%)`} valor={resultado.imposto} />
                  <div className="border-t pt-1">
                    <Linha rotulo="Lucro final" valor={resultado.lucro} destaque />
                    <p className="text-right text-xs text-muted-foreground">{resultado.margemLiquidaPercent.toFixed(2)}% do preço final</p>
                  </div>
                </div>

                <div className="space-y-2 border-t pt-4">
                  <Label>Quanto vou cobrar de fato?</Label>
                  <CurrencyInput value={valorProposto} onChange={v => setPrecoProposto(v)} />
                  <div className="flex items-center gap-2 text-sm">
                    {abaixoDoMinimo ? (
                      <Badge variant="destructive">Abaixo do mínimo: prejuízo</Badge>
                    ) : abaixoDaMeta ? (
                      <Badge variant="outline">Abaixo da margem desejada</Badge>
                    ) : (
                      <Badge><CheckCircle2 className="mr-1 h-3 w-3" /> Margem preservada</Badge>
                    )}
                  </div>
                  <p className="text-sm">
                    Sobra <strong className={simulacao.lucro < 0 ? 'text-destructive' : ''}>{formatCurrency(simulacao.lucro)}</strong>{' '}
                    ({simulacao.margemLiquidaPercent.toFixed(2)}% do preço).
                  </p>
                  {precoProposto !== null && (
                    <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setPrecoProposto(null)}>
                      Voltar ao preço recomendado
                    </Button>
                  )}
                  {tipoCobranca === 'MENSAL' && (
                    <p className="text-xs text-muted-foreground">Contrato de {periodos} meses: {formatCurrency(valorProposto * periodos)}.</p>
                  )}
                </div>

                <div className="flex flex-col gap-2 border-t pt-4">
                  <Button onClick={salvar} disabled={isSaving}><Save className="mr-2 h-4 w-4" /> {editandoId ? 'Atualizar precificação' : 'Salvar precificação'}</Button>
                  <Button variant="outline" onClick={baixarProposta}><FileDown className="mr-2 h-4 w-4" /> Gerar proposta em PDF</Button>
                  {cliente && tipoCobranca === 'MENSAL' && (
                    <Button variant={confirmarAplicar ? 'destructive' : 'outline'} onClick={aplicarMensalidade} onBlur={() => setConfirmarAplicar(false)}>
                      {confirmarAplicar ? `Confirmar mensalidade de ${formatCurrency(valorProposto)}` : 'Aplicar como mensalidade do cliente'}
                    </Button>
                  )}
                  {editandoId && (
                    <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setEditandoId(null)}>
                      Salvar como nova precificação
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {salvos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Precificações salvas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {salvos.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => abrir(p)}>
                    <p className="truncate font-medium">{p.clienteNome}: {p.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(p.precoProposto)} {p.tipoCobranca === 'MENSAL' ? 'por mês' : 'por processo'}
                    </p>
                  </button>
                  <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => excluir(p.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className={`flex justify-between ${destaque ? 'text-base font-semibold' : ''}`}>
      <span className="text-muted-foreground">{rotulo}</span>
      <span>{formatCurrency(valor)}</span>
    </div>
  );
}
