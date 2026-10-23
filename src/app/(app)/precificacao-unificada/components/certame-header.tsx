'use client';

import * as React from 'react';
import { parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn, formatCurrency } from '@/lib/utils';
import type { CertameUnificado } from '@/lib/models';
import { itemAtivo } from '@/lib/models';
import type { CertameComCalculo } from '@/lib/pricing-calculator';
import { custoUnitEfetivo } from '@/lib/custo-real';

interface CertameHeaderProps {
    certame: CertameComCalculo;
    onUpdate: (updatedCertame: CertameUnificado) => Promise<void>;
    clientes: any[];
}

function InfoKpi({ label, value, className }: { label: string; value: string; className?: string }) {
    return (
        <div className="p-3 bg-muted rounded-lg">
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className={cn("text-lg font-bold", className)}>{value}</p>
        </div>
    );
}

export function CertameHeader({ certame, onUpdate, clientes }: CertameHeaderProps) {
    const kpis = React.useMemo(() => {
        let valorGanho = 0, lucroGanho = 0, itensGanhos = 0, valorReferencia = 0, valorPotencial = 0, lucroPotencial = 0, faturado = 0, pago = 0, lucroRealizadoMes = 0;
        const activeItems = certame.itens.filter(item => itemAtivo(item));
        activeItems.forEach(item => { if (item.precoFinalVendidoReal && item.precoFinalVendidoReal > 0) { itensGanhos++; valorGanho += item.precoFinalVendidoReal * item.qtd; lucroGanho += item.metrics.lucroTotal; } valorReferencia += (item.precoReferencia || 0) * item.qtd; valorPotencial += item.metrics.precoFinalUnit * item.qtd; lucroPotencial += item.metrics.lucroTotal; });
        const hoje = new Date();
        certame.empenhos.forEach(empenho => {
            empenho.nfs.forEach(nf => {
                const { v, l } = nf.itens.reduce((ts, itemNF) => {
                    const ei = empenho.itens.find(e => e.id === itemNF.empenhoItemId);
                    if (ei) {
                        const pi = certame.itens.find(p => p.id === ei.precificacaoItemId);
                        const vItem = ei.precoVendaUnitSnapshot * itemNF.qtdNestaNF;
                        const cItem = custoUnitEfetivo(ei) * itemNF.qtdNestaNF;
                        const iItem = vItem * ((pi?.aliquotaPct ?? 0) / 100);
                        ts.v += vItem; ts.l += (vItem - iItem - cItem);
                    }
                    return ts;
                }, { v: 0, l: 0 });
                faturado += v;
                if (nf.pago) pago += v;
                if (nf.dataNFISO && parseISO(nf.dataNFISO).getMonth() === hoje.getMonth() && parseISO(nf.dataNFISO).getFullYear() === hoje.getFullYear()) lucroRealizadoMes += l;
            });
        });
        return { valorGanho, lucroGanho, itensGanhos, valorReferencia, valorPotencial, lucroPotencial, faturado, pago, saldoReceber: faturado - pago, lucroRealizadoMes };
    }, [certame]);

    return (
        <Card>
            <CardHeader><CardTitle>Resumo do Certame</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
                    <InfoKpi label="Valor de Referência (Edital)" value={certame.orcamentoSigiloso ? 'Sigiloso' : formatCurrency(kpis.valorReferencia)} />
                    <InfoKpi label={kpis.itensGanhos > 0 ? 'Valor Potencial (ganhos + em disputa)' : 'Valor Potencial'} value={formatCurrency(kpis.valorPotencial)} />
                    <InfoKpi label="Lucro Potencial" value={formatCurrency(kpis.lucroPotencial)} />
                    <InfoKpi label="Lucro Realizado (Mês)" value={formatCurrency(kpis.lucroRealizadoMes)} />
                    <InfoKpi label="Total Faturado" value={formatCurrency(kpis.faturado)} />
                    <InfoKpi label="Saldo a Receber" value={formatCurrency(kpis.saldoReceber)} className={kpis.saldoReceber > 0 ? 'text-destructive' : 'text-green-600'} />
                </div>
                {kpis.itensGanhos > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                        <InfoKpi label={`Valor da ata: ${kpis.itensGanhos} ${kpis.itensGanhos === 1 ? 'item ganho' : 'itens ganhos'} × quantidade`} value={formatCurrency(kpis.valorGanho)} className="text-amber-600" />
                        <InfoKpi label="Lucro dos itens ganhos" value={formatCurrency(kpis.lucroGanho)} className={kpis.lucroGanho < 0 ? 'text-destructive' : 'text-green-600'} />
                        <InfoKpi label="Margem dos itens ganhos" value={kpis.valorGanho > 0 ? `${((kpis.lucroGanho / kpis.valorGanho) * 100).toFixed(2).replace('.', ',')}%` : '-'} />
                    </div>
                )}
                <Separator />
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 text-sm items-start">
                    <div><p className="font-semibold text-muted-foreground">Órgão</p><p>{certame.orgao}</p></div>
                    <div><p className="font-semibold text-muted-foreground">Modalidade</p><p>{certame.modalidade} {certame.numeroAno}</p></div>
                    <div><p className="font-semibold text-muted-foreground">Status</p><p><Badge>{certame.status}</Badge></p></div>
                    <div><p className="font-semibold text-muted-foreground">Empresa</p><div className="flex items-center gap-1"><p className="truncate">{certame.empresaDestinoNome || 'N/A'}</p></div></div>
                    <div className="flex items-center space-x-2 pt-2">
                        <Switch id="congelado" checked={certame.congelado} onCheckedChange={(c) => onUpdate({ ...certame, congelado: c })} />
                        <Label htmlFor="congelado">Congelar</Label>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
