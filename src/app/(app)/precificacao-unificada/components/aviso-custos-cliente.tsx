'use client';

import * as React from 'react';
import Link from 'next/link';
import { Info, AlertTriangle } from 'lucide-react';
import type { CertameUnificado, CustosClienteAssessoria } from '@/lib/models';

/** Alíquota padrão dos itens novos: a do cliente, quando o certame é de um cliente com custos cadastrados. */
export function aliquotaPadraoDoCertame(
    certame: Pick<CertameUnificado, 'empresaDestinoId'>,
    custosClientes: CustosClienteAssessoria[]
): { produto: number; servico: number } | undefined {
    const custos = certame.empresaDestinoId ? custosClientes.find(c => c.clienteId === certame.empresaDestinoId) : undefined;
    return custos ? { produto: custos.aliquotaProdutoPct, servico: custos.aliquotaServicoPct } : undefined;
}

/** Informa de onde vêm os custos usados no cálculo do certame (cliente ou AM Contratos). */
export function AvisoCustosCliente({ certame, custosClientes }: { certame: Pick<CertameUnificado, 'empresaDestinoId' | 'empresaDestinoNome'>; custosClientes: CustosClienteAssessoria[] }) {
    if (!certame.empresaDestinoId) return null;
    const custos = custosClientes.find(c => c.clienteId === certame.empresaDestinoId);
    const link = `/assessoria/${certame.empresaDestinoId}?aba=custos`;
    if (custos) {
        return (
            <div className="flex items-start gap-2 rounded-md border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Certame de cliente: frete, custos fixos e custos variáveis calculados com os <strong>custos de {certame.empresaDestinoNome || 'cliente'}</strong>. <Link className="underline" href={link}>Ver ou alterar os custos do cliente</Link>.</p>
            </div>
        );
    }
    return (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Os custos de {certame.empresaDestinoNome || 'este cliente'} ainda não foram cadastrados: o cálculo está usando os custos da AM Contratos. <Link className="underline" href={link}>Cadastrar os custos do cliente</Link>.</p>
        </div>
    );
}
