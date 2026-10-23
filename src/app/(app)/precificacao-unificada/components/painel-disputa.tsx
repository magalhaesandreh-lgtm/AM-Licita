'use client';

import { itemAtivo } from '@/lib/models';

import * as React from 'react';
import { ChevronDown, ChevronUp, Gavel, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { TelaCheia, useTelaCheia } from '@/components/tela-cheia';
import type { CertameComCalculo } from '@/lib/pricing-calculator';
import {
    arredondarParaCima, distribuirLote, lanceParaMargem, lucroDoLance, margemDoLance, margemDoValorLote,
    resumoLote, valorLoteParaMargem, type ItemLote,
} from '@/lib/calculadora-lances';

/**
 * Painel de disputa (calculadora de lances): na fase de lances, informa-se o lucro desejado (%) e o
 * painel devolve o valor do lance, ou informa-se o lance (R$) e ele devolve o lucro. Só calcula: nada é
 * gravado no certame. Usa o custo total de cada item (produto + frete + despesas + custos do certame).
 */

const brl = (v: number | null | undefined, casas = 2) =>
    v === null || v === undefined || Number.isNaN(v) ? '-' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas });
const pctTxt = (v: number | null | undefined) =>
    v === null || v === undefined || Number.isNaN(v) ? '-' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const numTxt = (v: number, casas: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas, useGrouping: false });
/** Lê número digitado em português (aceita "1.234,56", "39", "39,5", "R$ 8,15", "39%"). */
function lerNumero(texto: string): number | null {
    const limpo = (texto || '').replace(/R\$|%|\s/g, '');
    if (!limpo) return null;
    const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
    const n = Number(normal);
    return Number.isFinite(n) ? n : null;
}

type Entrada = { pct: string; valor: string };
type Situacao = { rotulo: string; classe: string };

const S_OK: Situacao = { rotulo: 'Dentro do lucro mínimo', classe: 'bg-green-600 text-white hover:bg-green-600' };
const S_ABAIXO: Situacao = { rotulo: 'Abaixo do lucro mínimo', classe: 'bg-amber-500 text-white hover:bg-amber-500' };
const S_PREJUIZO: Situacao = { rotulo: 'Prejuízo', classe: 'bg-red-600 text-white hover:bg-red-600' };
const S_ACIMA: Situacao = { rotulo: 'Acima da referência', classe: 'bg-violet-600 text-white hover:bg-violet-600' };

function situacao(margem: number | null, minimo: number, lance: number | null, referencia: number | null): Situacao | null {
    if (margem === null || lance === null) return null;
    if (margem < 0) return S_PREJUIZO;
    if (referencia !== null && lance > referencia + 1e-9) return S_ACIMA;
    if (margem < minimo - 1e-9) return S_ABAIXO;
    return S_OK;
}

export function PainelDisputa({ certame }: { certame: CertameComCalculo }) {
    const [aberto, setAberto] = React.useState(false);
    const telaCheia = useTelaCheia();
    const itens = React.useMemo(() => certame.itens.filter(i => itemAtivo(i)).sort((a, b) => (a.loteNumero || 0) - (b.loteNumero || 0) || a.itemNumero - b.itemNumero), [certame.itens]);
    const margemPadrao = React.useMemo(() => {
        const contagem = new Map<number, number>();
        itens.forEach(i => { const m = Math.round((i.margemManualPct ?? i.metrics.margemAplicadaPercent ?? 0) * 100) / 100; contagem.set(m, (contagem.get(m) || 0) + 1); });
        return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 15;
    }, [itens]);

    const [minimoTxt, setMinimoTxt] = React.useState(() => numTxt(margemPadrao, 0));
    const [casas, setCasas] = React.useState(2);
    const [todosTxt, setTodosTxt] = React.useState('');
    const [busca, setBusca] = React.useState('');
    const [entradas, setEntradas] = React.useState<Record<string, Entrada>>({});
    const [entradasLote, setEntradasLote] = React.useState<Record<number, Entrada>>({});
    const [loteAberto, setLoteAberto] = React.useState<number | null>(null);
    const minimo = lerNumero(minimoTxt) ?? 0;

    const referenciaDe = (precoRef?: number) => (!certame.orcamentoSigiloso && precoRef && precoRef > 0 ? precoRef : null);

    const porPct = (custo: number, aliquota: number, pct: number | null) => {
        if (pct === null) return null;
        const v = lanceParaMargem(custo, aliquota, pct);
        return v === null ? null : arredondarParaCima(v, casas);
    };

    const mudarPct = (id: string, texto: string, custo: number, aliquota: number) => {
        const v = porPct(custo, aliquota, lerNumero(texto));
        setEntradas(e => ({ ...e, [id]: { pct: texto, valor: v === null ? '' : numTxt(v, casas) } }));
    };
    const mudarValor = (id: string, texto: string, custo: number, aliquota: number) => {
        const v = lerNumero(texto);
        const m = v === null ? null : margemDoLance(custo, aliquota, v);
        setEntradas(e => ({ ...e, [id]: { valor: texto, pct: m === null ? '' : numTxt(m, 2) } }));
    };
    const aplicarATodos = () => {
        const p = lerNumero(todosTxt);
        if (p === null) return;
        const novo: Record<string, Entrada> = {};
        itens.forEach(i => {
            const v = porPct(i.metrics.custoTotalUnit, i.aliquotaPct || 0, p);
            if (v !== null) novo[i.id] = { pct: numTxt(p, 2), valor: numTxt(v, casas) };
        });
        setEntradas(e => ({ ...e, ...novo }));
    };

    const lotes = React.useMemo(() => {
        const mapa = new Map<number, typeof itens>();
        itens.forEach(i => { if (i.loteNumero) mapa.set(i.loteNumero, [...(mapa.get(i.loteNumero) || []), i]); });
        return [...mapa.entries()].sort((a, b) => a[0] - b[0]);
    }, [itens]);

    const filtrados = itens.filter(i => {
        const t = busca.trim().toLowerCase();
        return !t || String(i.itemNumero) === t || i.descricao.toLowerCase().includes(t);
    });

    return (
        <TelaCheia estado={telaCheia} titulo="Painel de disputa (calculadora de lances)">
        <Card className={cn(telaCheia.ativo && 'border-0 shadow-none')}>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                <div>
                    <CardTitle className="flex items-center gap-2"><Gavel className="h-5 w-5" /> Painel de disputa (calculadora de lances)</CardTitle>
                    <CardDescription>Digite o lucro desejado e veja o valor do lance, ou digite o lance e veja o lucro. Só calcula, nada é gravado.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                {aberto && telaCheia.botao}
                <Button variant={aberto ? 'outline' : 'default'} onClick={() => setAberto(a => !a)}>
                    {aberto ? <><ChevronUp className="mr-2 h-4 w-4" /> Fechar painel</> : <><ChevronDown className="mr-2 h-4 w-4" /> Abrir painel de disputa</>}
                </Button>
                </div>
            </CardHeader>
            {(aberto || telaCheia.ativo) && (
                <CardContent className="space-y-5">
                    <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-1">
                            <Label>Lucro mínimo aceitável (%)</Label>
                            <Input inputMode="decimal" value={minimoTxt} onChange={e => setMinimoTxt(e.target.value)} />
                            <p className="text-xs text-muted-foreground">Abaixo dele o lance fica amarelo; o "piso" de cada item usa este valor.</p>
                        </div>
                        <div className="space-y-1">
                            <Label>Casas decimais do lance</Label>
                            <Select value={String(casas)} onValueChange={v => setCasas(Number(v))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="2">2 (R$ 0,00)</SelectItem><SelectItem value="3">3 (R$ 0,000)</SelectItem><SelectItem value="4">4 (R$ 0,0000)</SelectItem></SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Lance calculado pelo lucro é arredondado para cima, para não ficar abaixo do lucro pedido.</p>
                        </div>
                        <div className="space-y-1">
                            <Label>Mesmo lucro em todos os itens (%)</Label>
                            <div className="flex gap-2">
                                <Input inputMode="decimal" value={todosTxt} onChange={e => setTodosTxt(e.target.value)} placeholder="Ex.: 30" onKeyDown={e => { if (e.key === 'Enter') aplicarATodos(); }} />
                                <Button variant="secondary" onClick={aplicarATodos}>Aplicar</Button>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label>Localizar item</Label>
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input className="pl-8" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nº ou nome (ex.: 12, tomate)" />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                        {[S_OK, S_ABAIXO, S_PREJUIZO, S_ACIMA].map(s => <Badge key={s.rotulo} className={s.classe}>{s.rotulo}</Badge>)}
                        <span className="text-muted-foreground">Lucro = lance - imposto - custo total. Margem = lucro ÷ lance (mesma regra da planilha).</span>
                    </div>

                    <div className="overflow-x-auto rounded-md border">
                        <Table className="min-w-[1380px]">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[70px] whitespace-nowrap">Item</TableHead>
                                    <TableHead className="min-w-[220px]">Produto</TableHead>
                                    <TableHead className="w-[70px] text-right">Qtd</TableHead>
                                    <TableHead className="w-[120px] whitespace-nowrap text-right">Custo total unit.</TableHead>
                                    <TableHead className="w-[100px] whitespace-nowrap text-right">Preço ref.</TableHead>
                                    <TableHead className="w-[120px] whitespace-nowrap text-right">Lucro no preço ref.</TableHead>
                                    <TableHead className="w-[120px] whitespace-nowrap text-right" title="Menor lance que ainda dá o lucro mínimo">Piso (lucro mínimo)</TableHead>
                                    <TableHead className="w-[130px] whitespace-nowrap">Lucro desejado (%)</TableHead>
                                    <TableHead className="w-[160px] whitespace-nowrap">Valor do lance (R$)</TableHead>
                                    <TableHead className="w-[110px] whitespace-nowrap text-right">Lucro unit.</TableHead>
                                    <TableHead className="w-[120px] whitespace-nowrap text-right">Lucro total</TableHead>
                                    <TableHead className="w-[170px]">Situação</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtrados.length === 0 && <TableRow><TableCell colSpan={12} className="py-6 text-center text-muted-foreground">Nenhum item encontrado.</TableCell></TableRow>}
                                {filtrados.map(i => {
                                    const custo = i.metrics.custoTotalUnit;
                                    const aliquota = i.aliquotaPct || 0;
                                    const ref = referenciaDe(i.precoReferencia);
                                    const semCusto = !(custo > 0);
                                    const ent = entradas[i.id] || { pct: '', valor: '' };
                                    const lance = lerNumero(ent.valor);
                                    const margem = lance !== null && !semCusto ? margemDoLance(custo, aliquota, lance) : null;
                                    const lucroUnit = lance !== null && !semCusto ? lucroDoLance(custo, aliquota, lance) : null;
                                    const s = semCusto ? null : situacao(margem, minimo, lance, ref);
                                    const piso = semCusto ? null : porPct(custo, aliquota, minimo);
                                    return (
                                        <TableRow key={i.id} className={cn(semCusto && 'opacity-60')}>
                                            <TableCell className="whitespace-nowrap tabular-nums">{i.loteNumero ? `L${i.loteNumero} · ` : ''}{i.itemNumero}</TableCell>
                                            <TableCell className="max-w-[280px] truncate font-medium" title={i.descricao}>{i.descricao}</TableCell>
                                            <TableCell className="text-right tabular-nums">{i.qtd.toLocaleString('pt-BR')}</TableCell>
                                            <TableCell className="text-right tabular-nums whitespace-nowrap">{semCusto ? '-' : brl(custo, 4)}</TableCell>
                                            <TableCell className="text-right tabular-nums whitespace-nowrap">{ref === null ? (certame.orcamentoSigiloso ? 'Sigiloso' : '-') : brl(ref)}</TableCell>
                                            <TableCell className={cn('text-right tabular-nums whitespace-nowrap', ref !== null && !semCusto && (margemDoLance(custo, aliquota, ref) ?? 0) < 0 && 'text-destructive')}>{ref === null || semCusto ? '-' : pctTxt(margemDoLance(custo, aliquota, ref))}</TableCell>
                                            <TableCell className="text-right tabular-nums whitespace-nowrap font-medium">{piso === null ? '-' : brl(piso, casas)}</TableCell>
                                            <TableCell><Input inputMode="decimal" disabled={semCusto} value={ent.pct} placeholder="%" onChange={e => mudarPct(i.id, e.target.value, custo, aliquota)} className="h-9 w-[120px] min-w-[120px] text-right text-base" /></TableCell>
                                            <TableCell><Input inputMode="decimal" disabled={semCusto} value={ent.valor} placeholder="R$" onChange={e => mudarValor(i.id, e.target.value, custo, aliquota)} className="h-9 w-[150px] min-w-[150px] text-right text-base font-semibold" /></TableCell>
                                            <TableCell className={cn('text-right tabular-nums whitespace-nowrap', (lucroUnit ?? 0) < 0 && 'text-destructive')}>{lucroUnit === null ? '-' : brl(lucroUnit, 4)}</TableCell>
                                            <TableCell className={cn('text-right tabular-nums whitespace-nowrap', (lucroUnit ?? 0) < 0 && 'text-destructive')}>{lucroUnit === null ? '-' : brl(lucroUnit * i.qtd)}</TableCell>
                                            <TableCell>{semCusto ? <span className="text-xs text-muted-foreground">Informe o custo do item</span> : s ? <Badge className={cn('whitespace-nowrap', s.classe)}>{s.rotulo}</Badge> : null}</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>

                    {lotes.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="font-semibold">Lotes (lance pelo valor global)</h3>
                            <p className="text-xs text-muted-foreground">O valor global é dividido entre os itens do lote na proporção do preço atual de cada um, como no "aplicar valor do lote" da planilha. Abra o lote para ver o preço unitário de cada item.</p>
                            <div className="overflow-x-auto rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Lote</TableHead>
                                            <TableHead className="text-right">Itens</TableHead>
                                            <TableHead className="text-right">Custo total do lote</TableHead>
                                            <TableHead className="text-right">Referência do lote</TableHead>
                                            <TableHead className="text-right">Lucro na referência</TableHead>
                                            <TableHead className="text-right">Piso (lucro mínimo)</TableHead>
                                            <TableHead className="w-[130px] whitespace-nowrap">Lucro desejado (%)</TableHead>
                                            <TableHead className="w-[180px] whitespace-nowrap">Valor global (R$)</TableHead>
                                            <TableHead className="text-right">Lucro</TableHead>
                                            <TableHead>Situação</TableHead>
                                            <TableHead />
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {lotes.map(([n, its]) => {
                                            const base: ItemLote[] = its.map(i => ({ qtd: i.qtd, custoTotal: i.metrics.custoTotalUnit, aliquotaPct: i.aliquotaPct || 0, precoAtual: i.metrics.precoFinalUnit }));
                                            const { custo, aliquotaEfetiva } = resumoLote(base);
                                            const semCusto = its.some(i => !(i.metrics.custoTotalUnit > 0));
                                            const refTotal = certame.orcamentoSigiloso || its.some(i => !(i.precoReferencia && i.precoReferencia > 0)) ? null : its.reduce((t, i) => t + (i.precoReferencia || 0) * i.qtd, 0);
                                            const ent = entradasLote[n] || { pct: '', valor: '' };
                                            const valor = lerNumero(ent.valor);
                                            const r = valor !== null ? margemDoValorLote(base, valor) : null;
                                            const s = semCusto || !r ? null : situacao(r.margemPct, minimo, valor, refTotal);
                                            const pisoBruto = valorLoteParaMargem(base, minimo);
                                            const piso = pisoBruto === null ? null : arredondarParaCima(pisoBruto, 2);
                                            const precos = valor !== null ? distribuirLote(base, valor, casas) : [];
                                            return (
                                                <React.Fragment key={n}>
                                                    <TableRow>
                                                        <TableCell className="font-medium">Lote {n}</TableCell>
                                                        <TableCell className="text-right">{its.length}</TableCell>
                                                        <TableCell className="text-right tabular-nums whitespace-nowrap">{brl(custo)}</TableCell>
                                                        <TableCell className="text-right tabular-nums whitespace-nowrap">{refTotal === null ? '-' : brl(refTotal)}</TableCell>
                                                        <TableCell className="text-right tabular-nums">{refTotal === null ? '-' : pctTxt(margemDoLance(custo, aliquotaEfetiva, refTotal))}</TableCell>
                                                        <TableCell className="text-right tabular-nums whitespace-nowrap font-medium">{semCusto ? '-' : brl(piso)}</TableCell>
                                                        <TableCell><Input inputMode="decimal" disabled={semCusto} value={ent.pct} placeholder="%" className="h-9 w-[120px] min-w-[120px] text-right text-base"
                                                            onChange={e => { const p = lerNumero(e.target.value); const v = p === null ? null : valorLoteParaMargem(base, p); setEntradasLote(x => ({ ...x, [n]: { pct: e.target.value, valor: v === null ? '' : numTxt(arredondarParaCima(v, 2), 2) } })); }} /></TableCell>
                                                        <TableCell><Input inputMode="decimal" disabled={semCusto} value={ent.valor} placeholder="R$" className="h-9 w-[170px] min-w-[170px] text-right text-base font-semibold"
                                                            onChange={e => { const v = lerNumero(e.target.value); const m = v === null ? null : margemDoValorLote(base, v).margemPct; setEntradasLote(x => ({ ...x, [n]: { valor: e.target.value, pct: m === null ? '' : numTxt(m, 2) } })); }} /></TableCell>
                                                        <TableCell className={cn('text-right tabular-nums whitespace-nowrap', (r?.lucro ?? 0) < 0 && 'text-destructive')}>{r ? brl(r.lucro) : '-'}</TableCell>
                                                        <TableCell>{semCusto ? <span className="text-xs text-muted-foreground">Há itens sem custo</span> : s ? <Badge className={cn('whitespace-nowrap', s.classe)}>{s.rotulo}</Badge> : null}</TableCell>
                                                        <TableCell><Button size="sm" variant="ghost" onClick={() => setLoteAberto(loteAberto === n ? null : n)}>{loteAberto === n ? 'Ocultar itens' : 'Ver itens'}</Button></TableCell>
                                                    </TableRow>
                                                    {loteAberto === n && its.map((i, k) => (
                                                        <TableRow key={i.id} className="bg-muted/40 text-sm">
                                                            <TableCell />
                                                            <TableCell colSpan={4}>Item {i.itemNumero} · {i.descricao}</TableCell>
                                                            <TableCell className="text-right tabular-nums">{i.qtd.toLocaleString('pt-BR')} un.</TableCell>
                                                            <TableCell colSpan={2} className="text-right tabular-nums">{precos.length ? `Preço unit.: ${brl(precos[k], casas)}` : '-'}</TableCell>
                                                            <TableCell colSpan={3} className="text-right tabular-nums">{precos.length ? `Lucro: ${pctTxt(margemDoLance(base[k].custoTotal, base[k].aliquotaPct, precos[k]))}` : ''}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </React.Fragment>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
        </TelaCheia>
    );
}
