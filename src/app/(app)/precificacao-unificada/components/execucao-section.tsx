'use client';

import * as React from 'react';
import { format as formatDate, parseISO } from 'date-fns';
import { PlusCircle, MoreHorizontal, Pencil, Trash2, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { cn, formatCurrency } from '@/lib/utils';
import { empenhoRepository } from '@/lib/repositories/empenho-repository';
import type { CertameComCalculo } from '@/lib/pricing-calculator';
import type { Empenho } from '@/lib/models';
import { EmpenhoFormDialog } from './empenho-form-dialog';
import { EmpenhoDetailDialog } from './empenho-detail-dialog';

interface ExecucaoSectionProps {
    certame: CertameComCalculo;
    onDataChange: () => void;
}

export function ExecucaoSection({ certame, onDataChange }: ExecucaoSectionProps) {
    const [isEmpenhoFormOpen, setIsEmpenhoFormOpen] = React.useState(false);
    const [selectedEmpenho, setSelectedEmpenho] = React.useState<Empenho | null>(null);
    const [editingEmpenho, setEditingEmpenho] = React.useState<Empenho | null>(null);

    const cols: ColumnDef<Empenho>[] = React.useMemo(() => [
        { accessorKey: 'numeroEmpenho', header: 'Nº Empenho', cell: (row) => <span className="font-medium">{row.numeroEmpenho}</span> },
        { accessorKey: 'dataSolicitacaoISO', header: 'Data', cell: (row) => <span>{formatDate(parseISO(row.dataSolicitacaoISO), 'dd/MM/yyyy')}</span> },
        { accessorKey: 'statusEntrega', header: 'Entrega', cell: (row) => (
            <Badge variant="secondary" className={cn(row.statusEntrega === 'CONCLUIDO' && 'bg-green-100 text-green-800')}>{row.statusEntrega}</Badge>
        )},
        { accessorKey: 'statusFinanceiro', header: 'Financeiro', cell: (row) => (
            <Badge variant="outline" className={cn(row.statusFinanceiro === 'PAGO' && 'border-green-600 text-green-600')}>{row.statusFinanceiro}</Badge>
        )},
        { id: 'v', header: 'Valor Total', align: 'right', cell: (row) => <span className="font-bold">{formatCurrency(row.itens.reduce((a, i) => a + (i.precoVendaUnitSnapshot * i.qtdEmpenhada), 0))}</span> },
        { accessorKey: 'actions', header: 'Ações', align: 'right', cell: (row) => (
            <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setSelectedEmpenho(row)}><Info className="mr-2 h-4 w-4" /> Detalhes / Gerenciar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditingEmpenho(row)}><Pencil className="mr-2 h-4 w-4" /> Editar Empenho</DropdownMenuItem>
                    <DropdownMenuItem onClick={async () => { await empenhoRepository.delete(certame.id, row.id); onDataChange(); }} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        )},
    ], [certame.id, onDataChange]);

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between pb-2 space-y-0">
                <div className="space-y-0.5">
                    <CardTitle className="text-lg leading-none">Execução (Empenhos & NF)</CardTitle>
                    <CardDescription className="text-xs leading-none">Gerenciamento de ordens de compra e faturamentos.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsEmpenhoFormOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Novo
                </Button>
            </CardHeader>
            <CardContent className="p-0 pt-2">
                <div className="overflow-x-auto">
                    <DataTable columns={cols} data={certame.empenhos} />
                </div>
            </CardContent>
            <EmpenhoFormDialog open={isEmpenhoFormOpen} onOpenChange={setIsEmpenhoFormOpen} certame={certame} onSuccess={onDataChange} />
            <EmpenhoFormDialog open={!!editingEmpenho} onOpenChange={(o) => { if (!o) setTimeout(() => setEditingEmpenho(null), 300); }} certame={certame} empenhoToEdit={editingEmpenho} onSuccess={onDataChange} />
            <EmpenhoDetailDialog open={!!selectedEmpenho} onOpenChange={(o) => { if (!o) setTimeout(() => setSelectedEmpenho(null), 300); }} certame={certame} empenho={selectedEmpenho} onDataChange={onDataChange} />
        </Card>
    );
}
