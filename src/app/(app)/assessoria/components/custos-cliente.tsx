'use client';

import * as React from 'react';
import { Loader2, PlusCircle, Save, Trash2, ListPlus, Percent, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@/components/ui/currency-input';
import { PercentInput } from '@/components/ui/percent-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { CertameUnificado, ClienteAssessoria, CustoFixoCliente, CustoVariavelCliente, CustosClienteAssessoria, ItemPrecificacao } from '@/lib/models';
import { calculateCertamePricing, contextoDoCliente, rateiosPercentuais, type FullPricingContext } from '@/lib/pricing-calculator';
import { custosClienteRepository, normalizarCustosCliente } from '@/lib/repositories/custos-cliente-repository';
import { certameUnificadoRepository } from '@/lib/repositories/certame-unificado-repository';

const brl = (v: number, casas = 2) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: casas }).format(v || 0);
const pct = (fracao: number) => `${(fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const novoId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

type Rascunho = Omit<CustosClienteAssessoria, 'id' | 'updatedAt'>;

function rascunhoInicial(cliente: ClienteAssessoria, custos: CustosClienteAssessoria | null): Rascunho {
    if (custos) {
        const { id: _id, updatedAt: _u, ...resto } = custos;
        return { ...resto, clienteNome: cliente.nomeFantasia };
    }
    return {
        clienteId: cliente.id,
        clienteNome: cliente.nomeFantasia,
        faturamentoMensalPrevisto: 0,
        overheadPercentManual: null,
        fretePadraoPercent: 0,
        aliquotaProdutoPct: 0,
        aliquotaServicoPct: 0,
        custosFixos: [],
        custosVariaveis: [],
        observacoes: '',
    };
}

/** Linhas sugeridas (sem valor): André preenche o que o cliente realmente paga. */
const MODELO_FIXOS = ['DAS (MEI / Simples Nacional)', 'Telefonia e internet', 'Contador', 'Certificado digital (parcela mensal)'];
const MODELO_VARIAVEIS: { descricao: string; tipoRateio: CustoVariavelCliente['tipoRateio'] }[] = [
    { descricao: 'Pagamento do portal / plataforma de licitação', tipoRateio: 'VALOR_CERTAME' },
    { descricao: 'Combustível e deslocamento para entregas', tipoRateio: 'VALOR_CERTAME' },
    { descricao: 'Certidões, autenticações e documentos', tipoRateio: 'VALOR_CERTAME' },
];

interface CustosClienteTabProps {
    cliente: ClienteAssessoria;
    custos: CustosClienteAssessoria | null;
    certames: CertameUnificado[];
    pricingContext: FullPricingContext | null;
    onSalvo: () => Promise<void> | void;
}

/**
 * Aba "Custos do Cliente": custos fixos e variáveis que o CLIENTE tem para participar e executar as
 * licitações (DAS, telefonia, portal, combustível...). Mesmo cálculo dos custos da AM Contratos:
 *  - custos fixos mensais ÷ faturamento mensal previsto = % rateado sobre o custo de cada item;
 *  - custos variáveis em % entram sobre o custo dos itens; em R$ por certame são divididos entre os itens
 *    na proporção do custo de cada um.
 */
export function CustosClienteTab({ cliente, custos, certames, pricingContext, onSalvo }: CustosClienteTabProps) {
    const { toast } = useToast();
    const [rascunho, setRascunho] = React.useState<Rascunho>(() => rascunhoInicial(cliente, custos));
    const [alterado, setAlterado] = React.useState(false);
    const [salvando, setSalvando] = React.useState(false);
    const [certameSimId, setCertameSimId] = React.useState<string | null>(null);
    const [confirmarAliquota, setConfirmarAliquota] = React.useState(false);
    const [aplicandoAliquota, setAplicandoAliquota] = React.useState(false);

    React.useEffect(() => { setRascunho(rascunhoInicial(cliente, custos)); setAlterado(false); }, [cliente, custos]);
    React.useEffect(() => {
        if (certameSimId && certames.some(c => c.id === certameSimId)) return;
        const aberto = certames.find(c => c.status === 'EM_ANDAMENTO') ?? certames[0];
        setCertameSimId(aberto?.id ?? null);
    }, [certames, certameSimId]);

    const mudar = (parcial: Partial<Rascunho>) => { setRascunho(r => ({ ...r, ...parcial })); setAlterado(true); };
    const mudarFixo = (id: string, parcial: Partial<CustoFixoCliente>) => mudar({ custosFixos: rascunho.custosFixos.map(c => c.id === id ? { ...c, ...parcial } : c) });
    const mudarVariavel = (id: string, parcial: Partial<CustoVariavelCliente>) => mudar({ custosVariaveis: rascunho.custosVariaveis.map(c => c.id === id ? { ...c, ...parcial } : c) });

    const incluirModelo = () => {
        const fixosExist = new Set(rascunho.custosFixos.map(c => c.descricao.toLowerCase()));
        const varExist = new Set(rascunho.custosVariaveis.map(c => c.descricao.toLowerCase()));
        mudar({
            custosFixos: [...rascunho.custosFixos, ...MODELO_FIXOS.filter(d => !fixosExist.has(d.toLowerCase())).map(d => ({ id: novoId(), descricao: d, valorMensal: 0, ativo: true }))],
            custosVariaveis: [...rascunho.custosVariaveis, ...MODELO_VARIAVEIS.filter(m => !varExist.has(m.descricao.toLowerCase())).map(m => ({ id: novoId(), descricao: m.descricao, tipoRateio: m.tipoRateio, valor: 0, ativo: true, certameId: null }))],
        });
    };

    // Valores normalizados do rascunho: a simulação usa o que está na tela, antes mesmo de salvar.
    const custosAtuais = React.useMemo(() => normalizarCustosCliente({ ...rascunho, id: cliente.id, clienteId: cliente.id }), [rascunho, cliente.id]);

    const totalFixos = custosAtuais.custosFixos.filter(c => c.ativo).reduce((a, c) => a + c.valorMensal, 0);
    const rateioGeral = pricingContext ? rateiosPercentuais(contextoDoCliente(pricingContext, custosAtuais, null)) : null;
    const variaveisValorGeral = custosAtuais.custosVariaveis.filter(c => c.ativo && !c.certameId && c.tipoRateio === 'VALOR_CERTAME').reduce((a, c) => a + c.valor, 0);
    const semFaturamento = totalFixos > 0 && !(custosAtuais.overheadPercentManual && custosAtuais.overheadPercentManual > 0) && !(custosAtuais.faturamentoMensalPrevisto > 0);

    // Simulação no certame escolhido: quanto de cada custo vai para cada item.
    const simulacao = React.useMemo(() => {
        if (!pricingContext || !certameSimId) return null;
        const certame = certames.find(c => c.id === certameSimId);
        if (!certame) return null;
        const ctx = contextoDoCliente(pricingContext, custosAtuais, certame.id);
        const r = rateiosPercentuais(ctx);
        const calc = calculateCertamePricing({ ...certame, congelado: false }, ctx);
        if (!calc) return null;
        const varsCertame = ctx.custosVariaveis.filter(c => c.ativo);
        const variavelValor = varsCertame.filter(c => c.tipoRateio === 'VALOR_CERTAME').reduce((a, c) => a + c.valor, 0);
        const subtotal = calc.itens.reduce((a, i) => a + i.custoUnitBase * i.qtd, 0);
        const linhas = calc.itens.map(i => {
            const base = i.custoUnitBase * i.qtd;
            const fixoUnit = i.custoUnitBase * r.overheadPct;
            const variavelUnit = i.custoFixoRateadoUnit - fixoUnit;
            return {
                item: i,
                participacao: subtotal > 0 ? base / subtotal : (calc.itens.length ? 1 / calc.itens.length : 0),
                freteUnit: i.freteUnitario,
                fixoUnit,
                variavelUnit,
                custoTotalUnit: i.metrics.custoTotalUnit,
                rateadoTotal: (i.freteUnitario + i.custoFixoRateadoUnit) * i.qtd,
            };
        });
        const totalFrete = linhas.reduce((a, l) => a + l.freteUnit * l.item.qtd, 0);
        const totalFixo = linhas.reduce((a, l) => a + l.fixoUnit * l.item.qtd, 0);
        const totalVariavel = linhas.reduce((a, l) => a + l.variavelUnit * l.item.qtd, 0);
        const totalRateado = totalFrete + totalFixo + totalVariavel;
        return {
            certame, r, subtotal, variavelValor, linhas, totalFrete, totalFixo, totalVariavel, totalRateado,
            pctSobreCusto: subtotal > 0 ? totalRateado / subtotal : null,
            semCusto: calc.itens.some(i => !(i.custoUnitBase > 0) && !i.precoFinalVendidoReal),
            variaveisDoCertame: varsCertame,
        };
    }, [pricingContext, certameSimId, certames, custosAtuais]);

    const salvar = async () => {
        if (rascunho.custosFixos.some(c => !c.descricao.trim()) || rascunho.custosVariaveis.some(c => !c.descricao.trim())) {
            toast({ title: 'Preencha a descrição de todos os custos', variant: 'destructive' });
            return;
        }
        setSalvando(true);
        try {
            const { id: _id, updatedAt: _u, ...dados } = custosAtuais;
            await custosClienteRepository.save(cliente.id, dados);
            toast({ title: 'Custos do cliente salvos', description: 'Os certames do cliente já são calculados com estes custos.' });
            setAlterado(false);
            await onSalvo();
        } catch {
            toast({ title: 'Erro ao salvar os custos do cliente', variant: 'destructive' });
        } finally {
            setSalvando(false);
        }
    };

    const certamesAbertos = certames.filter(c => !c.congelado && c.status !== 'CANCELADO' && c.status !== 'PERDIDO');
    const aplicarAliquota = async () => {
        setAplicandoAliquota(true);
        try {
            let alterados = 0;
            for (const c of certamesAbertos) {
                const itens = (c.itens || []).map(i => {
                    const nova = i.tipoItem === 'SERVICO' ? custosAtuais.aliquotaServicoPct : custosAtuais.aliquotaProdutoPct;
                    if (i.aliquotaPct === nova) return i;
                    alterados++;
                    const { metrics: _m, ...resto } = i as ItemPrecificacao & { metrics?: unknown };
                    return { ...resto, aliquotaPct: nova };
                });
                await certameUnificadoRepository.update(c.id, { itens });
            }
            toast({ title: 'Alíquota aplicada', description: `${alterados} item(ns) atualizado(s) em ${certamesAbertos.length} certame(s).` });
            await onSalvo();
        } catch {
            toast({ title: 'Erro ao aplicar a alíquota nos itens', variant: 'destructive' });
        } finally {
            setAplicandoAliquota(false);
            setConfirmarAliquota(false);
        }
    };

    const nomeCertame = (id?: string | null) => {
        const c = certames.find(x => x.id === id);
        return c ? `${c.modalidade} ${c.numeroAno} - ${c.orgao}` : 'Certame não encontrado';
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                <div>
                    <h2 className="text-xl font-semibold">Custos do cliente nas licitações</h2>
                    <p className="text-sm text-muted-foreground">O que {cliente.nomeFantasia} gasta para participar e executar as licitações. Os certames deste cliente passam a ser precificados com estes custos, e não com os da AM Contratos.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={incluirModelo}><ListPlus className="mr-2 h-4 w-4" /> Incluir modelo de custos</Button>
                    <Button onClick={salvar} disabled={salvando || (!alterado && !!custos)}>{salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar custos</Button>
                </div>
            </div>
            {!custos && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>Custos ainda não cadastrados: enquanto não forem salvos, os certames do cliente continuam calculados com os custos da AM Contratos.</p>
                </div>
            )}
            {alterado && custos && <p className="text-sm text-amber-700 dark:text-amber-300">Há alterações não salvas. A simulação abaixo já mostra o efeito delas.</p>}

            <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Parâmetros do rateio</CardTitle>
                        <CardDescription>Mesma regra usada nos certames da AM Contratos.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>Faturamento mensal previsto do cliente</Label>
                            <CurrencyInput value={rascunho.faturamentoMensalPrevisto} onChange={v => mudar({ faturamentoMensalPrevisto: v })} />
                            <p className="text-xs text-muted-foreground">Base do rateio dos custos fixos: custos fixos do mês ÷ faturamento previsto.</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Percentual de custos fixos manual (opcional)</Label>
                            <PercentInput value={rascunho.overheadPercentManual ?? 0} onChange={v => mudar({ overheadPercentManual: v > 0 ? v : null })} />
                            <p className="text-xs text-muted-foreground">Se preenchido, substitui o cálculo automático.</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Frete padrão (% sobre o custo dos itens)</Label>
                            <PercentInput value={rascunho.fretePadraoPercent} onChange={v => mudar({ fretePadraoPercent: v })} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Alíquota produto (%)</Label>
                                <PercentInput value={rascunho.aliquotaProdutoPct} onChange={v => mudar({ aliquotaProdutoPct: v })} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Alíquota serviço (%)</Label>
                                <PercentInput value={rascunho.aliquotaServicoPct} onChange={v => mudar({ aliquotaServicoPct: v })} />
                            </div>
                            <p className="col-span-2 text-xs text-muted-foreground">Imposto sobre a venda dos itens. MEI: 0%, porque o DAS é fixo e entra nos custos fixos.</p>
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                            <Label>Observações</Label>
                            <Textarea rows={2} value={rascunho.observacoes || ''} onChange={e => mudar({ observacoes: e.target.value })} placeholder="Ex.: valores informados pelo cliente em 21/10/2026." />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                        <p className="text-xs text-muted-foreground">Itens já cadastrados guardam a própria alíquota. Use o botão para levar a alíquota do cliente aos itens dos {certamesAbertos.length} certame(s) não congelados.</p>
                        <Button variant="outline" size="sm" disabled={certamesAbertos.length === 0 || alterado || !custos} onClick={() => setConfirmarAliquota(true)}><Percent className="mr-2 h-4 w-4" /> Aplicar alíquota nos itens</Button>
                    </CardFooter>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Resumo do rateio</CardTitle><CardDescription>Valores que entram no custo dos itens.</CardDescription></CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <LinhaResumo rotulo="Custos fixos do mês" valor={brl(totalFixos)} />
                        <LinhaResumo rotulo="Rateio dos custos fixos" valor={rateioGeral ? pct(rateioGeral.overheadPct) : '-'} destaque />
                        {semFaturamento && <p className="text-xs text-destructive">Informe o faturamento mensal previsto (ou o percentual manual): sem ele os custos fixos não entram no preço.</p>}
                        <LinhaResumo rotulo="Custos variáveis em % (todos os certames)" valor={rateioGeral ? pct(rateioGeral.variavelPct) : '-'} destaque />
                        <LinhaResumo rotulo="Custos variáveis em R$ por certame" valor={brl(variaveisValorGeral)} destaque />
                        <LinhaResumo rotulo="Frete padrão" valor={rateioGeral ? pct(rateioGeral.fretePct) : '-'} />
                        <p className="pt-2 text-xs text-muted-foreground">Os custos variáveis em R$ são divididos entre os itens do certame na proporção do custo de cada item. Veja a simulação abaixo.</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                    <div>
                        <CardTitle>Custos fixos (mensais)</CardTitle>
                        <CardDescription>DAS, telefonia, internet, contador, aluguel, certificado digital etc.</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => mudar({ custosFixos: [...rascunho.custosFixos, { id: novoId(), descricao: '', valorMensal: 0, ativo: true }] })}><PlusCircle className="mr-2 h-4 w-4" /> Adicionar custo fixo</Button>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto rounded-md border">
                        <Table>
                            <TableHeader><TableRow><TableHead className="min-w-[260px]">Descrição</TableHead><TableHead className="w-[180px]">Valor mensal</TableHead><TableHead className="w-[90px]">Ativo</TableHead><TableHead className="w-[60px]" /></TableRow></TableHeader>
                            <TableBody>
                                {rascunho.custosFixos.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Nenhum custo fixo. Use “Adicionar custo fixo” ou “Incluir modelo de custos”.</TableCell></TableRow>}
                                {rascunho.custosFixos.map(c => (
                                    <TableRow key={c.id}>
                                        <TableCell><Input value={c.descricao} onChange={e => mudarFixo(c.id, { descricao: e.target.value })} placeholder="Ex.: DAS MEI" /></TableCell>
                                        <TableCell><CurrencyInput value={c.valorMensal} onChange={v => mudarFixo(c.id, { valorMensal: v })} /></TableCell>
                                        <TableCell><Switch checked={c.ativo} onCheckedChange={v => mudarFixo(c.id, { ativo: v })} /></TableCell>
                                        <TableCell><Button variant="ghost" size="icon" aria-label="Remover" onClick={() => mudar({ custosFixos: rascunho.custosFixos.filter(x => x.id !== c.id) })}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            {rascunho.custosFixos.length > 0 && (
                                <TableFooter><TableRow><TableCell className="font-semibold">Total mensal (ativos)</TableCell><TableCell className="font-semibold tabular-nums">{brl(totalFixos)}</TableCell><TableCell colSpan={2} /></TableRow></TableFooter>
                            )}
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                    <div>
                        <CardTitle>Custos variáveis (por licitação)</CardTitle>
                        <CardDescription>Pagamento do portal, combustível, deslocamento, documentos. Em R$ por certame ou em % sobre o custo dos itens; podem valer para todos os certames ou só para um.</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => mudar({ custosVariaveis: [...rascunho.custosVariaveis, { id: novoId(), descricao: '', tipoRateio: 'VALOR_CERTAME', valor: 0, ativo: true, certameId: null }] })}><PlusCircle className="mr-2 h-4 w-4" /> Adicionar custo variável</Button>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto rounded-md border">
                        <Table>
                            <TableHeader><TableRow><TableHead className="min-w-[240px]">Descrição</TableHead><TableHead className="w-[190px]">Tipo</TableHead><TableHead className="w-[160px]">Valor</TableHead><TableHead className="min-w-[220px]">Vale para</TableHead><TableHead className="w-[80px]">Ativo</TableHead><TableHead className="w-[60px]" /></TableRow></TableHeader>
                            <TableBody>
                                {rascunho.custosVariaveis.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Nenhum custo variável.</TableCell></TableRow>}
                                {rascunho.custosVariaveis.map(c => (
                                    <TableRow key={c.id}>
                                        <TableCell><Input value={c.descricao} onChange={e => mudarVariavel(c.id, { descricao: e.target.value })} placeholder="Ex.: Pagamento do portal" /></TableCell>
                                        <TableCell>
                                            <Select value={c.tipoRateio} onValueChange={v => mudarVariavel(c.id, { tipoRateio: v as CustoVariavelCliente['tipoRateio'], valor: 0 })}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent><SelectItem value="VALOR_CERTAME">R$ por certame</SelectItem><SelectItem value="PERCENT_CERTAME">% sobre o custo dos itens</SelectItem></SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell>{c.tipoRateio === 'PERCENT_CERTAME'
                                            ? <PercentInput key={`${c.id}-p`} value={c.valor} onChange={v => mudarVariavel(c.id, { valor: v })} />
                                            : <CurrencyInput key={`${c.id}-v`} value={c.valor} onChange={v => mudarVariavel(c.id, { valor: v })} />}
                                        </TableCell>
                                        <TableCell>
                                            <Select value={c.certameId || 'todos'} onValueChange={v => mudarVariavel(c.id, { certameId: v === 'todos' ? null : v })}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="todos">Todos os certames do cliente</SelectItem>
                                                    {certames.map(ct => <SelectItem key={ct.id} value={ct.id}>{ct.modalidade} {ct.numeroAno} - {ct.orgao}</SelectItem>)}
                                                    {c.certameId && !certames.some(ct => ct.id === c.certameId) && <SelectItem value={c.certameId}>{nomeCertame(c.certameId)}</SelectItem>}
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell><Switch checked={c.ativo} onCheckedChange={v => mudarVariavel(c.id, { ativo: v })} /></TableCell>
                                        <TableCell><Button variant="ghost" size="icon" aria-label="Remover" onClick={() => mudar({ custosVariaveis: rascunho.custosVariaveis.filter(x => x.id !== c.id) })}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                    <div>
                        <CardTitle>Rateio entre os itens do certame</CardTitle>
                        <CardDescription>Quanto de frete, custos fixos e custos variáveis vai para cada item, e o percentual de cada item no total.</CardDescription>
                    </div>
                    <Select value={certameSimId ?? ''} onValueChange={setCertameSimId} disabled={certames.length === 0}>
                        <SelectTrigger className="w-full sm:w-[420px]"><SelectValue placeholder="Selecione um certame do cliente" /></SelectTrigger>
                        <SelectContent>{certames.map(c => <SelectItem key={c.id} value={c.id}>{c.modalidade} {c.numeroAno} - {c.orgao}</SelectItem>)}</SelectContent>
                    </Select>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!simulacao && <p className="text-sm text-muted-foreground">Nenhum certame vinculado a este cliente.</p>}
                    {simulacao && (
                        <>
                            {simulacao.certame.congelado && <p className="text-sm text-amber-700 dark:text-amber-300">Este certame está congelado: a planilha mantém os rateios gravados no congelamento. A simulação mostra como ficaria com os custos atuais.</p>}
                            {simulacao.semCusto && <p className="text-sm text-amber-700 dark:text-amber-300">Há itens sem custo unitário base. Enquanto os custos não forem informados, os valores em R$ por certame são divididos em partes iguais entre os itens.</p>}
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                                <Kpi rotulo="Custo dos itens" valor={brl(simulacao.subtotal)} />
                                <Kpi rotulo={`Frete (${pct(simulacao.r.fretePct)})`} valor={brl(simulacao.totalFrete)} />
                                <Kpi rotulo={`Custos fixos (${pct(simulacao.r.overheadPct)})`} valor={brl(simulacao.totalFixo)} />
                                <Kpi rotulo="Custos variáveis" valor={brl(simulacao.totalVariavel)} />
                                <Kpi rotulo="Total a ratear" valor={brl(simulacao.totalRateado)} destaque />
                                <Kpi rotulo="% sobre o custo dos itens" valor={simulacao.pctSobreCusto === null ? '-' : pct(simulacao.pctSobreCusto)} destaque />
                            </div>
                            {simulacao.variaveisDoCertame.length > 0 && (
                                <p className="text-xs text-muted-foreground">Custos variáveis deste certame: {simulacao.variaveisDoCertame.map(v => `${v.descricao} (${v.tipoRateio === 'VALOR_CERTAME' ? brl(v.valor) : `${v.valor.toLocaleString('pt-BR')}%`})`).join('; ')}.</p>
                            )}
                            <div className="overflow-x-auto rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Item</TableHead>
                                            <TableHead className="min-w-[220px]">Descrição</TableHead>
                                            <TableHead className="text-right">Qtd.</TableHead>
                                            <TableHead className="text-right">Custo base unit.</TableHead>
                                            <TableHead className="text-right">% do rateio</TableHead>
                                            <TableHead className="text-right">Frete unit.</TableHead>
                                            <TableHead className="text-right">Fixos unit.</TableHead>
                                            <TableHead className="text-right">Variáveis unit.</TableHead>
                                            <TableHead className="text-right">Custo total unit.</TableHead>
                                            <TableHead className="text-right">Rateado no item</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {simulacao.linhas.length === 0 && <TableRow><TableCell colSpan={10} className="py-6 text-center text-muted-foreground">Certame sem itens.</TableCell></TableRow>}
                                        {simulacao.linhas.map(l => (
                                            <TableRow key={l.item.id}>
                                                <TableCell className="tabular-nums">{l.item.loteNumero ? `L${l.item.loteNumero}-` : ''}{l.item.itemNumero}</TableCell>
                                                <TableCell className="max-w-[320px] truncate" title={l.item.descricao}>{l.item.descricao}</TableCell>
                                                <TableCell className="text-right tabular-nums">{l.item.qtd.toLocaleString('pt-BR')}</TableCell>
                                                <TableCell className="text-right tabular-nums">{brl(l.item.custoUnitBase, 4)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{pct(l.participacao)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{brl(l.freteUnit, 4)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{brl(l.fixoUnit, 4)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{brl(l.variavelUnit, 4)}</TableCell>
                                                <TableCell className="text-right tabular-nums font-medium">{brl(l.custoTotalUnit, 4)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{brl(l.rateadoTotal)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                    {simulacao.linhas.length > 0 && (
                                        <TableFooter>
                                            <TableRow>
                                                <TableCell colSpan={4} className="font-semibold">Total</TableCell>
                                                <TableCell className="text-right font-semibold tabular-nums">100,00%</TableCell>
                                                <TableCell className="text-right tabular-nums">{brl(simulacao.totalFrete)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{brl(simulacao.totalFixo)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{brl(simulacao.totalVariavel)}</TableCell>
                                                <TableCell />
                                                <TableCell className="text-right font-semibold tabular-nums">{brl(simulacao.totalRateado)}</TableCell>
                                            </TableRow>
                                        </TableFooter>
                                    )}
                                </Table>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={confirmarAliquota} onOpenChange={setConfirmarAliquota}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Aplicar a alíquota do cliente nos itens?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Os itens de produto dos {certamesAbertos.length} certame(s) não congelados de {cliente.nomeFantasia} passam a usar {custosAtuais.aliquotaProdutoPct.toLocaleString('pt-BR')}% e os de serviço {custosAtuais.aliquotaServicoPct.toLocaleString('pt-BR')}%. Os preços sugeridos desses certames serão recalculados. Certames congelados não mudam.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={aplicandoAliquota}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={(e) => { e.preventDefault(); void aplicarAliquota(); }} disabled={aplicandoAliquota}>{aplicandoAliquota && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Aplicar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function LinhaResumo({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
            <span className="text-muted-foreground">{rotulo}</span>
            <span className={cn('tabular-nums', destaque && 'font-semibold')}>{valor}</span>
        </div>
    );
}

function Kpi({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
    return (
        <div className={cn('rounded-lg bg-muted p-3', destaque && 'ring-1 ring-primary/40')}>
            <p className="text-xs text-muted-foreground">{rotulo}</p>
            <p className="text-lg font-bold tabular-nums">{valor}</p>
        </div>
    );
}
