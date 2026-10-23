'use client';

import * as React from 'react';
import Link from 'next/link';
import { format as formatDate, parseISO } from 'date-fns';
import { ExternalLink, Loader2, Pencil, PlusCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Categoria, CertameUnificado, ClienteAssessoria, CustosClienteAssessoria, Fornecedor, ItemPrecificacao, Produto } from '@/lib/models';
import { calculateCertamePricing, contextoParaCertame, rateiosPercentuais, type CalculatedItemMetrics, type CertameComCalculo, type FullPricingContext } from '@/lib/pricing-calculator';
import { custoUnitEfetivo } from '@/lib/custo-real';
import { certameUnificadoRepository } from '@/lib/repositories/certame-unificado-repository';
import { produtoRepository } from '@/lib/repositories/produto-repository';
import { categoriaRepository } from '@/lib/repositories/categoria-repository';
import { fornecedorRepository } from '@/lib/repositories/fornecedor-repository';
import { CertameHeader } from '../../precificacao-unificada/components/certame-header';
import { ItensTable } from '../../precificacao-unificada/components/itens-table';
import { ExecucaoSection } from '../../precificacao-unificada/components/execucao-section';
import { PainelDisputa } from '../../precificacao-unificada/components/painel-disputa';
import { AvisoCustosCliente, aliquotaPadraoDoCertame } from '../../precificacao-unificada/components/aviso-custos-cliente';
import { CertameFormDialog } from '../../precificacao-unificada/certame-form-dialog';
import { custosDeCertame } from '@/lib/pdf/analise-exequibilidade';

/** Totais em reais com 2 casas (a formatação de preço unitário usa até 4). */
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

type ResumoCertame = {
    certame: CertameUnificado;
    qtdItens: number;
    valorReferencia: number;
    valorPotencial: number;
    lucroPotencial: number;
    faturado: number;
    lucroRealizado: number;
};

/** Mesmas contas do "Resumo do Certame" da planilha principal. */
function resumir(certame: CertameUnificado, calc: CertameComCalculo | null): ResumoCertame {
    const ativos = (calc?.itens || []).filter(i => i.status !== 'PERDIDO');
    let faturado = 0, lucroRealizado = 0;
    (certame.empenhos || []).forEach(empenho => {
        (empenho.nfs || []).forEach(nf => {
            nf.itens.forEach(itemNF => {
                const ei = empenho.itens.find(e => e.id === itemNF.empenhoItemId);
                if (!ei) return;
                const pi = certame.itens.find(p => p.id === ei.precificacaoItemId);
                const v = ei.precoVendaUnitSnapshot * itemNF.qtdNestaNF;
                const c = custoUnitEfetivo(ei) * itemNF.qtdNestaNF;
                faturado += v;
                lucroRealizado += v - v * ((pi?.aliquotaPct ?? 0) / 100) - c;
            });
        });
    });
    return {
        certame,
        qtdItens: (certame.itens || []).length,
        valorReferencia: ativos.reduce((a, i) => a + (i.precoReferencia || 0) * i.qtd, 0),
        valorPotencial: ativos.reduce((a, i) => a + i.metrics.precoFinalUnit * i.qtd, 0),
        lucroPotencial: ativos.reduce((a, i) => a + i.metrics.lucroTotal, 0),
        faturado,
        lucroRealizado,
    };
}

function sanitizeCertameForSave(certame: CertameUnificado) {
    const { id: _id, empenhos: _empenhos, ...dados } = certame;
    return {
        ...dados,
        itens: (dados.itens || []).map(item => {
            const { metrics: _m, ...resto } = item as ItemPrecificacao & { metrics?: CalculatedItemMetrics };
            return resto;
        }),
    };
}

const statusCor: Record<string, string> = {
    EM_ANDAMENTO: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
    GANHO: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
    PERDIDO: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
    CANCELADO: 'bg-muted text-muted-foreground',
};

interface CertamesClienteTabProps {
    cliente: ClienteAssessoria;
    certames: CertameUnificado[];
    pricingContext: FullPricingContext | null;
    custosCliente: CustosClienteAssessoria | null;
    onDataChange: () => Promise<void> | void;
}

/**
 * Aba "Certames/Execução (B2G)" do painel do cliente: a mesma planilha da tela principal de certames
 * (resumo, itens com preço de referência, custo, margem, preço final, lucro e execução/empenhos), só com
 * os certames deste cliente e calculada com os custos do cliente.
 */
export function CertamesClienteTab({ cliente, certames, pricingContext, custosCliente, onDataChange }: CertamesClienteTabProps) {
    const { toast } = useToast();
    const [produtos, setProdutos] = React.useState<Produto[]>([]);
    const [categorias, setCategorias] = React.useState<Categoria[]>([]);
    const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
    const [selecionadoId, setSelecionadoId] = React.useState<string | null>(null);
    const [formMode, setFormMode] = React.useState<'hidden' | 'new' | 'edit'>('hidden');
    const [salvando, setSalvando] = React.useState(false);

    React.useEffect(() => {
        Promise.all([produtoRepository.list(), categoriaRepository.list(), fornecedorRepository.list()])
            .then(([p, c, f]) => { setProdutos(p); setCategorias(c.filter(x => x.ativo)); setFornecedores(f); })
            .catch(() => toast({ title: 'Erro ao carregar produtos, categorias e fornecedores', variant: 'destructive' }));
    }, [toast]);

    const custosLista = React.useMemo(() => (custosCliente ? [custosCliente] : []), [custosCliente]);

    const calculados = React.useMemo(() => {
        if (!pricingContext) return new Map<string, CertameComCalculo | null>();
        return new Map(certames.map(c => [c.id, calculateCertamePricing(c, contextoParaCertame(c, pricingContext, custosLista))]));
    }, [certames, pricingContext, custosLista]);

    const resumos = React.useMemo(() => certames
        .map(c => resumir(c, calculados.get(c.id) ?? null))
        .sort((a, b) => String(b.certame.dataSessaoISO || '').localeCompare(String(a.certame.dataSessaoISO || ''))),
    [certames, calculados]);

    React.useEffect(() => {
        if (selecionadoId && certames.some(c => c.id === selecionadoId)) return;
        setSelecionadoId(resumos[0]?.certame.id ?? null);
    }, [certames, resumos, selecionadoId]);

    const selecionado = selecionadoId ? calculados.get(selecionadoId) ?? null : null;
    const certameBruto = certames.find(c => c.id === selecionadoId) ?? null;

    const atualizarCertame = async (atualizado: CertameUnificado) => {
        setSalvando(true);
        try {
            await certameUnificadoRepository.update(atualizado.id, sanitizeCertameForSave(atualizado));
            await onDataChange();
        } catch {
            toast({ title: 'Erro ao salvar o certame', variant: 'destructive' });
        } finally {
            setSalvando(false);
        }
    };

    const totais = resumos.reduce((t, r) => ({
        ref: t.ref + r.valorReferencia, pot: t.pot + r.valorPotencial, luc: t.luc + r.lucroPotencial, fat: t.fat + r.faturado, real: t.real + r.lucroRealizado,
    }), { ref: 0, pot: 0, luc: 0, fat: 0, real: 0 });

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                    <div>
                        <CardTitle>Certames do Cliente</CardTitle>
                        <CardDescription>Clique em um certame para abrir a planilha completa (itens, preço de referência, custos, margem, preço final e execução).</CardDescription>
                    </div>
                    <Button onClick={() => setFormMode('new')}><PlusCircle className="mr-2 h-4 w-4" /> Novo Certame</Button>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Certame</TableHead>
                                    <TableHead>Órgão</TableHead>
                                    <TableHead>Sessão</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Itens</TableHead>
                                    <TableHead className="text-right">Valor de Referência</TableHead>
                                    <TableHead className="text-right">Valor Potencial</TableHead>
                                    <TableHead className="text-right">Lucro Potencial</TableHead>
                                    <TableHead className="text-right">Faturado</TableHead>
                                    <TableHead className="text-right">Lucro Realizado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {resumos.length === 0 && (
                                    <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Nenhum certame vinculado a este cliente.</TableCell></TableRow>
                                )}
                                {resumos.map(r => (
                                    <TableRow key={r.certame.id} onClick={() => setSelecionadoId(r.certame.id)} className={cn('cursor-pointer', r.certame.id === selecionadoId && 'bg-muted')}>
                                        <TableCell className="font-medium">{r.certame.modalidade} {r.certame.numeroAno}</TableCell>
                                        <TableCell className="max-w-[260px]">{r.certame.orgao}</TableCell>
                                        <TableCell className="whitespace-nowrap">{r.certame.dataSessaoISO ? `${formatDate(parseISO(r.certame.dataSessaoISO), 'dd/MM/yyyy')} ${r.certame.horaSessao || ''}` : '-'}</TableCell>
                                        <TableCell><Badge variant="secondary" className={statusCor[r.certame.status]}>{r.certame.status.replace('_', ' ')}</Badge></TableCell>
                                        <TableCell className="text-right tabular-nums">{r.qtdItens}</TableCell>
                                        <TableCell className="text-right tabular-nums whitespace-nowrap">{r.certame.orcamentoSigiloso ? 'Sigiloso' : brl(r.valorReferencia)}</TableCell>
                                        <TableCell className="text-right tabular-nums whitespace-nowrap">{brl(r.valorPotencial)}</TableCell>
                                        <TableCell className={cn('text-right tabular-nums whitespace-nowrap', r.lucroPotencial < 0 && 'text-destructive')}>{brl(r.lucroPotencial)}</TableCell>
                                        <TableCell className="text-right tabular-nums whitespace-nowrap">{brl(r.faturado)}</TableCell>
                                        <TableCell className={cn('text-right tabular-nums whitespace-nowrap', r.lucroRealizado < 0 && 'text-destructive')}>{brl(r.lucroRealizado)}</TableCell>
                                    </TableRow>
                                ))}
                                {resumos.length > 1 && (
                                    <TableRow className="font-semibold">
                                        <TableCell colSpan={5}>Total</TableCell>
                                        <TableCell className="text-right tabular-nums whitespace-nowrap">{brl(totais.ref)}</TableCell>
                                        <TableCell className="text-right tabular-nums whitespace-nowrap">{brl(totais.pot)}</TableCell>
                                        <TableCell className="text-right tabular-nums whitespace-nowrap">{brl(totais.luc)}</TableCell>
                                        <TableCell className="text-right tabular-nums whitespace-nowrap">{brl(totais.fat)}</TableCell>
                                        <TableCell className="text-right tabular-nums whitespace-nowrap">{brl(totais.real)}</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {selecionado && pricingContext && (
                <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-xl font-semibold">{selecionado.modalidade} {selecionado.numeroAno} <span className="text-muted-foreground font-normal">· {selecionado.orgao}</span></h2>
                        <div className="flex items-center gap-2">
                            {salvando && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                            <Button variant="outline" size="sm" onClick={() => setFormMode('edit')}><Pencil className="mr-2 h-4 w-4" /> Editar dados do certame</Button>
                            <Button variant="outline" size="sm" asChild><Link href={`/precificacao-unificada?id=${selecionado.id}`}><ExternalLink className="mr-2 h-4 w-4" /> Abrir na planilha principal</Link></Button>
                        </div>
                    </div>
                    <AvisoCustosCliente certame={selecionado} custosClientes={custosLista} />
                    <CertameHeader certame={selecionado} onUpdate={atualizarCertame} clientes={[cliente]} />
                    <ItensTable certame={selecionado} context={{ produtos, categorias, fornecedores, clientes: [cliente] }} onUpdateCertame={atualizarCertame} aliquotaPadrao={aliquotaPadraoDoCertame(selecionado, custosLista)} pricingContext={contextoParaCertame(selecionado, pricingContext, custosLista)} custosDe={custosDeCertame(selecionado, custosLista.map(c => c.clienteId))} />
                    <PainelDisputa certame={selecionado} />
                    <ExecucaoSection certame={selecionado} onDataChange={() => { void onDataChange(); }} rateios={rateiosPercentuais(contextoParaCertame(selecionado, pricingContext, custosLista))} fornecedoresCadastrados={fornecedores.map(f => f.nomeFantasia).filter(Boolean)} />
                </div>
            )}

            <CertameFormDialog
                open={formMode !== 'hidden'}
                onOpenChange={(aberto) => { if (!aberto) setTimeout(() => setFormMode('hidden'), 300); }}
                onSuccess={async (id) => { setFormMode('hidden'); await onDataChange(); if (id) setSelecionadoId(id); }}
                certameToEdit={formMode === 'edit' ? certameBruto : null}
                clientes={[cliente]}
                empresaDestinoIdPadrao={cliente.id}
            />
        </div>
    );
}
