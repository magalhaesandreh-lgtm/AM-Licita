
'use client';

import * as React from 'react';
import { notFound, useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { DndContext, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, DragOverlay, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format as formatDate, parseISO, isBefore, getMonth, getYear } from 'date-fns';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PlusCircle, GripVertical, CheckCircle, XCircle, AlertCircle, Link as LinkIcon, Banknote, ArrowLeft } from 'lucide-react';
import type { ClienteAssessoria, KanbanCard, KanbanColumn, CobrancaAssessoria, CertameUnificado, Empenho } from '@/lib/models';
import { clienteAssessoriaRepository } from '@/lib/repositories/cliente-assessoria-repository';
import { kanbanRepository } from '@/lib/repositories/kanban-repository';
import { cobrancaRepository } from '@/lib/repositories/cobranca-repository';
import { certameUnificadoRepository } from '@/lib/repositories/certame-unificado-repository';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn, formatCurrency } from '@/lib/utils';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { impostoRepository } from '@/lib/repositories/imposto-repository';
import { categoriaRepository } from '@/lib/repositories/categoria-repository';
import { configuracaoRepository } from '@/lib/repositories/configuracao-repository';
import { custoFixoRepository } from '@/lib/repositories/custo-fixo-repository';
import { custoVariavelRepository } from '@/lib/repositories/custo-variavel-repository';
import { calculateCertamePricing, type FullPricingContext } from '@/lib/pricing-calculator';
import { calcularExitoHibrido, calcularExitoPorFaixa } from '@/lib/assessoria/fee-calculator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useUser } from '@/firebase';

type CertameComMetricas = CertameUnificado & {
    totalPrevisto: number;
    lucroPrevisto: number;
    totalFaturado: number;
    lucroReal: number;
    saldoAReceber: number;
};

type EmpenhoComCalculo = Empenho & { 
    certame: CertameUnificado;
    valorTotal: number;
    calculoExito: { percentual: number; regra: string; valorExito: number; } | null; 
    cobranca: CobrancaAssessoria | null 
};

// Main Page Component
export default function ClientePainelPage() {
    const params = useParams();
    const clienteId = params.clienteId as string;
    const { toast } = useToast();
    const router = useRouter();
    const [isLoading, setIsLoading] = React.useState(true);
    const { user, isUserLoading } = useUser();

    // Data States
    const [cliente, setCliente] = React.useState<ClienteAssessoria | null>(null);
    const [columns, setColumns] = React.useState<KanbanColumn[]>([]);
    const [cards, setCards] = React.useState<KanbanCard[]>([]);
    const [cobrancas, setCobrancas] = React.useState<CobrancaAssessoria[]>([]);
    const [certamesDoCliente, setCertamesDoCliente] = React.useState<CertameUnificado[]>([]);
    const [allCertames, setAllCertames] = React.useState<CertameUnificado[]>([]);
    const [pricingContext, setPricingContext] = React.useState<FullPricingContext | null>(null);
    const [statusFinanceiro, setStatusFinanceiro] = React.useState<{ text: 'Em Dia' | 'Pendente' | 'Atrasado'; variant: 'default' | 'outline' | 'destructive' }>({ text: 'Em Dia', variant: 'default' });
    
    // Modal States
    const [isCardFormOpen, setIsCardFormOpen] = React.useState(false);
    const [editingCard, setEditingCard] = React.useState<KanbanCard | null>(null);
    const [defaultColumnId, setDefaultColumnId] = React.useState<string | null>(null);
    
    const loadData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const [
                clienteData, 
                columnsData, 
                cardsData, 
                cobrancasData, 
                allCertamesData,
                impostosData,
                categoriasData,
                configData,
                fixosData,
                variaveisData
            ] = await Promise.all([
                clienteAssessoriaRepository.getById(clienteId),
                kanbanRepository.listColumnsByCliente(clienteId),
                kanbanRepository.listCardsByCliente(clienteId),
                cobrancaRepository.listByCliente(clienteId),
                certameUnificadoRepository.list(), // Fetch all and filter client-side
                impostoRepository.getSettings(),
                categoriaRepository.list(),
                configuracaoRepository.get(),
                custoFixoRepository.list(),
                custoVariavelRepository.list(),
            ]);

            if (!clienteData) {
                notFound();
                return;
            }
            
            const context: FullPricingContext = {
                imposto: impostosData,
                categorias: categoriasData,
                configuracoes: configData,
                custosFixos: fixosData,
                custosVariaveis: variaveisData,
            };
            setPricingContext(context);

            setCliente(clienteData);
            setColumns(columnsData);
            setCards(cardsData);
            setCobrancas(cobrancasData);
            setAllCertames(allCertamesData);
            setCertamesDoCliente(allCertamesData.filter(c => c.empresaDestinoId === clienteId));
        } catch {
            toast({ title: 'Erro ao carregar dados do cliente', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [clienteId, toast]);
    
    React.useEffect(() => {
        if (isUserLoading || !user) return;
        loadData();
    }, [loadData, user, isUserLoading]);
    
    React.useEffect(() => {
        if (cliente && cobrancas) {
            const newStatus = getStatusFinanceiro(cliente, cobrancas);
            setStatusFinanceiro(newStatus);
        }
    }, [cliente, cobrancas]);

    const handleDataChange = React.useCallback(async () => {
        try {
            const [columnsData, cardsData, cobrancasData, allCertamesData] = await Promise.all([
                kanbanRepository.listColumnsByCliente(clienteId),
                kanbanRepository.listCardsByCliente(clienteId),
                cobrancaRepository.listByCliente(clienteId),
                certameUnificadoRepository.list()
            ]);
            setColumns(columnsData);
            setCards(cardsData);
            setCobrancas(cobrancasData);
            setAllCertames(allCertamesData);
            setCertamesDoCliente(allCertamesData.filter(c => c.empresaDestinoId === clienteId));
        } catch {
            toast({ title: 'Erro ao recarregar dados', variant: 'destructive' });
        }
    }, [clienteId, toast]);
    
    const certamesComMetricas: CertameComMetricas[] = React.useMemo(() => {
        if (!pricingContext) return [];
        return certamesDoCliente.map(certame => {
            const certameCalculado = calculateCertamePricing(certame, pricingContext);

            let faturado = 0;
            let pago = 0;
            let lucroReal = 0;

            certame.empenhos.forEach(empenho => {
                empenho.nfs.forEach(nf => {
                    const valorTotalNF = nf.itens.reduce((total, itemNF) => {
                        const empenhoItem = empenho.itens.find(ei => ei.id === itemNF.empenhoItemId);
                        return total + (itemNF.qtdNestaNF * (empenhoItem?.precoVendaUnitSnapshot || 0));
                    }, 0);
                    
                    const lucroTotalNF = nf.itens.reduce((total, itemNF) => {
                        const empenhoItem = empenho.itens.find(ei => ei.id === itemNF.empenhoItemId);
                        return total + (itemNF.qtdNestaNF * (empenhoItem?.lucroUnitSnapshot || 0));
                    }, 0);

                    faturado += valorTotalNF;
                    lucroReal += lucroTotalNF;
                    if (nf.pago) {
                        pago += valorTotalNF;
                    }
                });
            });

            return {
                ...certame,
                totalPrevisto: certameCalculado?.itens.reduce((acc, item) => acc + (item.metrics.precoFinalUnit * item.qtd), 0) || 0,
                lucroPrevisto: certameCalculado?.itens.reduce((acc, item) => acc + item.metrics.lucroTotal, 0) || 0,
                totalFaturado: faturado,
                lucroReal: lucroReal,
                saldoAReceber: faturado - pago,
            }
        });
    }, [certamesDoCliente, pricingContext]);

    const empenhosCalculados = React.useMemo<EmpenhoComCalculo[]>(() => {
        if (!cliente?.vinculo) return [];

        const certamesFiltrados = allCertames.filter(c => c.empresaDestinoId === cliente.id);
        const empenhosDoCliente: (Empenho & { certame: CertameUnificado })[] = certamesFiltrados.flatMap(certame => 
            (certame.empenhos || []).map(empenho => ({...empenho, certame}))
        );

        return empenhosDoCliente.map(empenho => {
            const valorTotal = (empenho.itens || []).reduce((sum, item) => sum + (item.precoVendaUnitSnapshot * item.qtdEmpenhada), 0);
            
            let calculoExito = null;
            if (cliente.vinculo?.tipoVinculo === 'EXITO') {
                calculoExito = calcularExitoPorFaixa(valorTotal);
            } else if (cliente.vinculo?.tipoVinculo === 'HIBRIDO') {
                calculoExito = calcularExitoHibrido(valorTotal);
            }

            const cobranca = cobrancas.find(c => c.empenhoId === empenho.id) || null;
            
            return { ...empenho, valorTotal, calculoExito, cobranca };
        });
    }, [cliente, allCertames, cobrancas]);


    const handleNewCard = (columnId: string) => {
        setEditingCard(null);
        setDefaultColumnId(columnId);
        setIsCardFormOpen(true);
    };

    const handleEditCard = (card: KanbanCard) => {
        setEditingCard(card);
        setIsCardFormOpen(true);
    }
    
    if (isLoading || isUserLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-10 w-1/2" />
                <Skeleton className="h-8 w-1/4" />
                <div className="grid grid-cols-4 gap-4">
                    <Skeleton className="h-48" />
                    <Skeleton className="h-48" />
                    <Skeleton className="h-48" />
                    <Skeleton className="h-48" />
                </div>
            </div>
        );
    }

    if (!cliente) return null;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{cliente.nomeFantasia}</h1>
                    <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary">{cliente.vinculo?.tipoVinculo || 'N/A'}</Badge>
                        <Badge variant={cliente.statusAtivo ? 'default' : 'destructive'}>{cliente.statusAtivo ? 'Ativo' : 'Inativo'}</Badge>
                        <Badge variant={statusFinanceiro.variant}>{statusFinanceiro.text}</Badge>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => router.push('/assessoria')}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
                    <Button onClick={() => handleNewCard(columns.find(c => c.titulo === '1. Entrada (Triagem)')?.id ?? '')}><PlusCircle /> Nova Demanda</Button>
                </div>
            </div>
            
            <Tabs defaultValue="kanban">
                <TabsList>
                    <TabsTrigger value="overview">Visão Geral</TabsTrigger>
                    <TabsTrigger value="kanban">Kanban (Demandas)</TabsTrigger>
                    <TabsTrigger value="financeiro">Financeiro (Assessoria)</TabsTrigger>
                    <TabsTrigger value="certames">Certames/Execução (B2G)</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="mt-4">
                    <VisaoGeralTab cliente={cliente} cobrancas={cobrancas} certames={certamesDoCliente} statusFinanceiro={statusFinanceiro}/>
                </TabsContent>
                <TabsContent value="kanban" className="mt-4">
                    <KanbanTab 
                        columns={columns} 
                        cards={cards}
                        setCards={setCards}
                        onNewCard={handleNewCard}
                        onEditCard={handleEditCard}
                        onDataChange={handleDataChange}
                    />
                </TabsContent>
                <TabsContent value="financeiro" className="mt-4">
                    <FinanceiroTab 
                        cliente={cliente} 
                        cobrancas={cobrancas} 
                        empenhos={empenhosCalculados}
                        onDataChange={handleDataChange}
                    />
                </TabsContent>
                <TabsContent value="certames" className="mt-4">
                    <CertamesTab certames={certamesComMetricas} />
                </TabsContent>
            </Tabs>
            {isCardFormOpen && (
                <CardFormDialog
                    open={isCardFormOpen}
                    onOpenChange={setIsCardFormOpen}
                    card={editingCard}
                    cards={cards}
                    columns={columns}
                    defaultColumnId={defaultColumnId}
                    clienteId={cliente.id}
                    onSuccess={handleDataChange}
                    certames={allCertames}
                />
            )}
        </div>
    )
}

// #region TABS

function VisaoGeralTab({cliente, cobrancas, certames, statusFinanceiro}: {cliente: ClienteAssessoria, cobrancas: CobrancaAssessoria[], certames: CertameUnificado[], statusFinanceiro: { text: string; variant: any; }}) {
    const totalAberto = cobrancas.filter(c => c.status !== 'PAGO').reduce((acc, c) => acc + c.valor, 0);

    const totalFaturadoB2G = certames.reduce((certameAcc, certame) => {
        const certameTotal = (certame.empenhos || []).reduce((empenhoAcc, empenho) => {
            const empenhoTotal = (empenho.nfs || []).reduce((nfAcc, nf) => {
                const nfTotal = (nf.itens || []).reduce((itemAcc, item) => {
                    const empenhoItem = (empenho.itens || []).find(ei => ei.id === item.empenhoItemId);
                    return itemAcc + (item.qtdNestaNF * (empenhoItem?.precoVendaUnitSnapshot || 0));
                }, 0);
                return nfAcc + nfTotal;
            }, 0);
            return empenhoAcc + empenhoTotal;
        }, 0);
        return certameAcc + certameTotal;
    }, 0);

    return (
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
                <CardHeader><CardTitle>Financeiro Assessoria</CardTitle></CardHeader>
                <CardContent>
                    <p className="text-2xl font-bold">{statusFinanceiro.text}</p>
                    <p className="text-muted-foreground">Status do contrato</p>
                </CardContent>
            </Card>
             <Card>
                <CardHeader><CardTitle>Cobranças em Aberto</CardTitle></CardHeader>
                <CardContent>
                    <p className="text-2xl font-bold">{formatCurrency(totalAberto)}</p>
                    <p className="text-muted-foreground">Valor pendente/atrasado</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle>Certames Ativos</CardTitle></CardHeader>
                <CardContent>
                    <p className="text-2xl font-bold">{certames.filter(c => c.status === 'EM_ANDAMENTO' || c.status === 'GANHO').length}</p>
                    <p className="text-muted-foreground">Processos em andamento/ganhos</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle>Total Faturado (B2G)</CardTitle></CardHeader>
                <CardContent>
                    <p className="text-2xl font-bold">{formatCurrency(totalFaturadoB2G)}</p>
                    <p className="text-muted-foreground">Via NFs em certames</p>
                </CardContent>
            </Card>
        </div>
    )
}

function KanbanTab({ columns, cards, setCards, onNewCard, onEditCard, onDataChange }: { columns: KanbanColumn[], cards: KanbanCard[], setCards: React.Dispatch<React.SetStateAction<KanbanCard[]>>, onNewCard: (columnId: string) => void, onEditCard: (card: KanbanCard) => void, onDataChange: () => void }) {
    const sensors = useSensors(
        useSensor(PointerSensor, {
          activationConstraint: {
            distance: 8,
          },
        }),
        useSensor(KeyboardSensor)
      );
    const { toast } = useToast();
    const [activeCard, setActiveCard] = React.useState<KanbanCard | null>(null);

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const card = cards.find(c => c.id === active.id);
        setActiveCard(card || null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveCard(null);
        const { active, over } = event;
    
        if (!over) {
            return;
        }

        const activeId = active.id as string;
        const overId = over.id as string;

        if (activeId === overId) {
            return;
        }
    
        const originalCards = [...cards];
        const activeCard = originalCards.find((c) => c.id === activeId);
        if (!activeCard) return;

        // Determine drop target
        const overIsColumn = columns.some(c => c.id === overId);
        const overCard = originalCards.find(c => c.id === overId);

        const newColumnId = overIsColumn ? overId : overCard?.columnId;
        if (!newColumnId) return;

        // Rebuild the card array for optimistic update
        let tempCards = [...originalCards];
        const activeIndex = tempCards.findIndex((c) => c.id === activeId);
        
        // Remove active card from its original position
        tempCards.splice(activeIndex, 1);
        
        // Find the new index to insert the card
        let newIndex: number;
        if (overCard) {
            // Dropping on another card
            newIndex = tempCards.findIndex((c) => c.id === overId);
        } else {
            // Dropping on a column
            const cardsInNewColumn = tempCards.filter(c => c.columnId === newColumnId);
            if (cardsInNewColumn.length > 0) {
                 const lastCard = cardsInNewColumn[cardsInNewColumn.length - 1];
                 // Find index of the last card in the main tempCards array and insert after it
                 newIndex = tempCards.findIndex(c => c.id === lastCard.id) + 1;
            } else {
                // Dropping on an empty column, find the column's position relative to other cards
                const columnIndex = columns.findIndex(c => c.id === newColumnId);
                const previousColumns = columns.slice(0, columnIndex);
                const previousCardsCount = tempCards.filter(c => previousColumns.some(pc => pc.id === c.columnId)).length;
                newIndex = previousCardsCount;
            }
        }
        
        // Insert the card with its potentially new column ID
        tempCards.splice(newIndex, 0, { ...activeCard, columnId: newColumnId });

        // --- Recalculate orders and create the final state ---
        const cardsToUpdate: { id: string; order: number; columnId: string; movedAt?: string }[] = [];
        const finalCardsState: KanbanCard[] = [];

        columns.forEach(column => {
            let order = 0;
            // Iterate through the manipulated tempCards array
            tempCards.forEach(card => {
                if (card.columnId === column.id) {
                    const originalCard = originalCards.find(c => c.id === card.id)!;
                    const newCardState = { ...originalCard, order: order, columnId: column.id };

                    // Add to update batch if order or column has changed
                    if (originalCard.order !== newCardState.order || originalCard.columnId !== newCardState.columnId) {
                        const updatePayload: any = { id: newCardState.id, order: newCardState.order, columnId: newCardState.columnId };
                        if(newCardState.id === activeId) {
                            updatePayload.movedAt = new Date().toISOString();
                        }
                        // Check if it's already in the list to avoid duplicates
                        if (!cardsToUpdate.some(u => u.id === updatePayload.id)) {
                             cardsToUpdate.push(updatePayload);
                        }
                    }
                    
                    finalCardsState.push(newCardState);
                    order++;
                }
            });
        });
        
        // Optimistically update the UI
        setCards(finalCardsState);

        // Persist changes to the backend
        if (cardsToUpdate.length > 0) {
             kanbanRepository.updateCardOrders(cardsToUpdate)
            .catch(() => {
                toast({ title: 'Erro ao mover a demanda.', variant: 'destructive' });
                setCards(originalCards); // Revert on failure
            });
        }
    };
    
    return (
        <DndContext 
            sensors={sensors} 
            collisionDetection={closestCorners} 
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveCard(null)}
        >
            <div className="flex gap-4 overflow-x-auto pb-4">
                <SortableContext items={columns.map(c => c.id)}>
                    {columns.map(column => (
                        <KanbanColumnComponent key={column.id} column={column} onNewCard={onNewCard}>
                            <SortableContext items={cards.filter(c => c.columnId === column.id).map(c => c.id)}>
                                {cards.filter(card => card.columnId === column.id).sort((a,b) => a.order - b.order).map(card => (
                                    <KanbanCardComponent key={card.id} card={card} onClick={() => onEditCard(card)}/>
                                ))}
                            </SortableContext>
                        </KanbanColumnComponent>
                    ))}
                </SortableContext>
            </div>
            <DragOverlay>
                {activeCard ? <KanbanCardComponent card={activeCard} isOverlay onClick={() => {}}/> : null}
            </DragOverlay>
        </DndContext>
    );
}

function FinanceiroTab({ cliente, cobrancas, empenhos, onDataChange }: { cliente: ClienteAssessoria, cobrancas: CobrancaAssessoria[], empenhos: EmpenhoComCalculo[], onDataChange: () => void }) {
    const { toast } = useToast();
    const [isGenerating, setIsGenerating] = React.useState(false);

    const handleGerarCobrancasMes = async () => {
        if (!cliente.vinculo) {
            toast({ title: 'Cliente sem vínculo definido.', variant: 'destructive'});
            return;
        }

        setIsGenerating(true);
        try {
            const mesAtual = getMonth(new Date()) + 1;
            const anoAtual = getYear(new Date());
            let geradasCount = 0;

            if (cliente.vinculo.tipoVinculo === 'MENSAL' || cliente.vinculo.tipoVinculo === 'HIBRIDO') {
                const existeMensalidade = cobrancas.some(c => c.tipo === 'MENSALIDADE' && c.competenciaMes === mesAtual && c.competenciaAno === anoAtual);
                if (!existeMensalidade) {
                    const valorMensalidade = cliente.vinculo.tipoVinculo === 'HIBRIDO' ? 1200 : cliente.vinculo.mensalidade || 0;
                    if (valorMensalidade > 0) {
                        await cobrancaRepository.create({
                            clienteId: cliente.id, competenciaMes: mesAtual, competenciaAno: anoAtual,
                            valor: valorMensalidade, status: 'PENDENTE', tipo: 'MENSALIDADE',
                        } as any);
                        geradasCount++;
                    }
                }
            }

            if (cliente.vinculo.tipoVinculo === 'EXITO' || cliente.vinculo.tipoVinculo === 'HIBRIDO') {
                const empenhosDoMes = empenhos.filter(e => {
                    const dataEmpenho = parseISO(e.dataSolicitacaoISO);
                    return getMonth(dataEmpenho) + 1 === mesAtual && getYear(dataEmpenho) === anoAtual;
                });

                for (const empenho of empenhosDoMes) {
                    if (!empenho.cobranca && empenho.calculoExito && empenho.calculoExito.valorExito > 0) {
                        await cobrancaRepository.create({
                            clienteId: cliente.id,
                            competenciaMes: mesAtual, competenciaAno: anoAtual,
                            valor: empenho.calculoExito.valorExito,
                            status: 'PENDENTE', tipo: 'EXITO', empenhoId: empenho.id,
                            percentualAplicado: empenho.calculoExito.percentual,
                            valorBase: empenho.valorTotal,
                            regraAplicada: empenho.calculoExito.regra,
                        } as any);
                        geradasCount++;
                    }
                }
            }

            if (geradasCount > 0) {
                toast({ title: `${geradasCount} cobrança(s) gerada(s)!` });
                onDataChange();
            } else {
                toast({ title: "Nenhuma nova cobrança a ser gerada para o mês atual." });
            }

        } catch {
            toast({ title: "Erro ao gerar cobranças.", variant: 'destructive'});
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleMarcarPago = async (cobrancaId: string) => {
        await cobrancaRepository.update(cobrancaId, { status: 'PAGO', dataPagamento: new Date().toISOString().split('T')[0] });
        onDataChange();
        toast({ title: "Cobrança marcada como paga." });
    }
    
    const cobrancasColumns: ColumnDef<CobrancaAssessoria>[] = [
        { accessorKey: 'competenciaMes', header: 'Competência', cell: (row) => `${String(row.competenciaMes).padStart(2, '0')}/${row.competenciaAno}` },
        { accessorKey: 'tipo', header: 'Tipo', cell: (row) => <Badge variant="outline">{row.tipo}</Badge> },
        { accessorKey: 'valor', header: 'Valor', align: 'right', cell: (row) => formatCurrency(row.valor) },
        { accessorKey: 'status', header: 'Status', cell: (row) => <Badge variant={row.status === 'PAGO' ? 'default' : (row.status === 'ATRASADO' ? 'destructive' : 'outline')}>{row.status}</Badge> },
        { accessorKey: 'dataPagamento', header: 'Data Pag.', cell: (row) => row.dataPagamento ? formatDate(parseISO(row.dataPagamento), 'dd/MM/yyyy') : '—' },
        { accessorKey: 'actions', header: 'Ações', align: 'right', cell: (row) => (
            <Button variant="outline" size="sm" onClick={() => handleMarcarPago(row.id)} disabled={row.status === 'PAGO'}>Marcar Paga</Button>
        )},
    ];

    const exitoColumns: ColumnDef<EmpenhoComCalculo>[] = [
        { accessorKey: 'numeroEmpenho', header: 'Empenho', cell: (row) => <Link href={`/precificacao-unificada`} className="hover:underline">{row.numeroEmpenho}</Link> },
        { accessorKey: 'dataSolicitacaoISO', header: 'Data', cell: (row) => formatDate(parseISO(row.dataSolicitacaoISO), 'dd/MM/yyyy') },
        { accessorKey: 'valorTotal', header: 'Valor Empenho', align: 'right', cell: (row) => formatCurrency(row.valorTotal) },
        { id: 'regra', header: 'Regra Aplicada', cell: (row) => <Badge variant="secondary">{row.calculoExito?.regra || 'N/A'}</Badge> },
        { id: 'valorExito', header: 'Valor Êxito', align: 'right', cell: (row) => formatCurrency(row.calculoExito?.valorExito || 0)},
        { id: 'statusCobranca', header: 'Status', cell: (row) => row.cobranca ? <Badge variant={row.cobranca.status === 'PAGO' ? 'default' : 'outline'}>{row.cobranca.status}</Badge> : <Badge variant="secondary">Pendente</Badge>},
    ];

    const showExito = cliente.vinculo && (cliente.vinculo.tipoVinculo === 'EXITO' || cliente.vinculo.tipoVinculo === 'HIBRIDO');

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Contrato / Vínculo</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    {cliente.vinculo ? (
                        <>
                            <div>
                                <p className="font-semibold text-muted-foreground">Tipo</p><p>{cliente.vinculo.tipoVinculo}</p>
                                {(cliente.vinculo.tipoVinculo === 'MENSAL' || cliente.vinculo.tipoVinculo === 'HIBRIDO') && <><p className="font-semibold text-muted-foreground mt-2">Mensalidade</p><p>{formatCurrency(cliente.vinculo.tipoVinculo === 'HIBRIDO' ? 1200 : cliente.vinculo.mensalidade || 0)}</p></>}
                                {(cliente.vinculo.tipoVinculo === 'MENSAL' || cliente.vinculo.tipoVinculo === 'HIBRIDO') && <><p className="font-semibold text-muted-foreground mt-2">Dia Vencimento</p><p>{cliente.vinculo.diaVencimento || 'N/A'}</p></>}
                            </div>
                            <div>
                                {cliente.vinculo.tipoVinculo === 'EXITO' && (
                                    <>
                                    <p className="font-semibold text-muted-foreground">Tabela de Faixas (Êxito)</p>
                                    <Table>
                                        <TableBody>
                                            <TableRow><TableCell>Até 50mil</TableCell><TableCell>10%</TableCell></TableRow>
                                            <TableRow><TableCell>50-100mil</TableCell><TableCell>7%</TableCell></TableRow>
                                            <TableRow><TableCell>100-500mil</TableCell><TableCell>5%</TableCell></TableRow>
                                            <TableRow><TableCell>500mil-2M</TableCell><TableCell>3%</TableCell></TableRow>
                                            <TableRow><TableCell>Acima de 2M</TableCell><TableCell>2%</TableCell></TableRow>
                                        </TableBody>
                                    </Table>
                                    </>
                                )}
                                {cliente.vinculo.tipoVinculo === 'HIBRIDO' && (
                                    <>
                                    <p className="font-semibold text-muted-foreground">Tabela de Faixas (Êxito)</p>
                                    <Table>
                                        <TableBody>
                                            <TableRow><TableCell>Até 1M</TableCell><TableCell>4%</TableCell></TableRow>
                                            <TableRow><TableCell>Acima de 1M</TableCell><TableCell>2%</TableCell></TableRow>
                                        </TableBody>
                                    </Table>
                                    </>
                                )}
                            </div>
                        </>
                    ) : (
                        <p className="text-muted-foreground">Nenhum vínculo contratual definido para este cliente.</p>
                    )}
                </CardContent>
            </Card>

            {showExito && (
                <Card>
                    <CardHeader>
                        <CardTitle>Cálculo de Êxito por Empenho</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <DataTable columns={exitoColumns} data={empenhos} emptyStateMessage="Nenhum empenho encontrado para este cliente." />
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>Histórico de Cobranças</CardTitle>
                    <Button onClick={handleGerarCobrancasMes} disabled={isGenerating}><Banknote className="mr-2 h-4 w-4"/> Gerar Cobranças do Mês</Button>
                </CardHeader>
                <CardContent>
                    <DataTable columns={cobrancasColumns} data={cobrancas} emptyStateMessage="Nenhuma cobrança encontrada."/>
                </CardContent>
            </Card>
        </div>
    );
}

function CertamesTab({certames}: {certames: CertameComMetricas[]}) {
    const columns: ColumnDef<CertameComMetricas>[] = [
        { id: 'certame', header: 'Certame', cell: (row) => <Link className="hover:underline" href={`/certames/${row.id}`}>{`${row.modalidade} ${row.numeroAno}`}</Link> },
        { accessorKey: 'orgao', header: 'Órgão', cell: (row) => row.orgao },
        { accessorKey: 'status', header: 'Status', cell: (row) => <Badge>{row.status}</Badge> },
        { accessorKey: 'totalPrevisto', header: 'Total Previsto', align: 'right', cell: (row) => formatCurrency(row.totalPrevisto) },
        { accessorKey: 'totalFaturado', header: 'Total Faturado', align: 'right', cell: (row) => formatCurrency(row.totalFaturado) },
        { accessorKey: 'lucroReal', header: 'Lucro Real', align: 'right', cell: (row) => formatCurrency(row.lucroReal) },
    ]

    return (
        <Card>
            <CardHeader><CardTitle>Certames Vinculados</CardTitle></CardHeader>
            <CardContent>
                <DataTable columns={columns} data={certames} emptyStateMessage="Nenhum certame vinculado a este cliente."/>
            </CardContent>
        </Card>
    );
}

// #endregion

// #region Kanban Components
function KanbanColumnComponent({ column, children, onNewCard }: { column: KanbanColumn, children: React.ReactNode, onNewCard: (columnId: string) => void }) {
    const { setNodeRef, attributes, listeners, transform, transition } = useSortable({ id: column.id });
    const style = { transform: CSS.Transform.toString(transform), transition };
    return (
        <div ref={setNodeRef} style={style} className="w-80 shrink-0">
            <Card className="bg-muted/50 h-full flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between p-3">
                    <h3 className="font-semibold" {...attributes} {...listeners}>{column.titulo}</h3>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onNewCard(column.id)}><PlusCircle className="h-4 w-4" /></Button>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 p-3 overflow-y-auto">
                    {children}
                </CardContent>
            </Card>
        </div>
    )
}

function KanbanCardComponent({ card, onClick, isOverlay }: { card: KanbanCard, onClick: () => void, isOverlay?: boolean }) {
    const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: card.id });
    const style = { 
        transform: CSS.Transform.toString(transform), 
        transition,
        opacity: isDragging && !isOverlay ? 0.5 : 1,
    };
    const [isAtrasado, setIsAtrasado] = React.useState(false);

    React.useEffect(() => {
        const notDoneColumnNames = ['14. Concluído', '15. Arquivado / Perdido'];
        if (card.prazo && !notDoneColumnNames.includes(card.columnId)) {
            const isLate = isBefore(parseISO(card.prazo), new Date());
            setIsAtrasado(isLate);
        } else {
            setIsAtrasado(false);
        }
    }, [card.prazo, card.columnId]);

    const checklistCompleto = card.checklist?.filter(c => c.concluido).length || 0;
    const checklistTotal = card.checklist?.length || 0;

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <Card onClick={onClick} className={cn("cursor-pointer", isOverlay && "shadow-lg scale-105")}>
                <CardHeader className="p-3">
                    <div className="flex justify-between items-start">
                        <p className="font-medium leading-tight">{card.titulo}</p>
                        <div className="cursor-grab p-1 -mt-1 -mr-1"><GripVertical className="h-4 w-4 text-muted-foreground"/></div>
                    </div>
                </CardHeader>
                <CardContent className="p-3 pt-0 flex flex-wrap gap-2 text-xs">
                     <Badge variant="secondary">{card.tipo}</Badge>
                     <Badge variant={card.prioridade === 'ALTA' || card.prioridade === 'URGENTE' ? 'destructive' : 'outline'}>{card.prioridade}</Badge>
                     {isAtrasado && <Badge variant="destructive">ATRASADO</Badge>}
                </CardContent>
                {checklistTotal > 0 && (
                    <CardFooter className="p-3 pt-0 text-xs text-muted-foreground">
                        <CheckCircle className="h-3 w-3 mr-1"/> {checklistCompleto} de {checklistTotal}
                    </CardFooter>
                )}
            </Card>
        </div>
    )
}
// #endregion

// #region Forms
const cardFormSchema = z.object({
    titulo: z.string().min(1, 'O título é obrigatório.'),
    columnId: z.string().min(1, 'A coluna é obrigatória.'),
    tipo: z.enum(['PROSPECCAO', 'DOCUMENTACAO', 'PRECIFICACAO', 'DISPUTA', 'RECURSO', 'EXECUCAO', 'FINANCEIRO', 'SUPORTE']),
    prioridade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']),
    prazo: z.string().optional(),
    descricao: z.string().optional(),
    checklist: z.array(z.object({ id: z.string(), texto: z.string(), concluido: z.boolean() })).optional(),
    vinculos: z.object({
      certameId: z.string().optional(),
      empenhoId: z.string().optional(),
    }).optional(),
});
type CardFormValues = z.infer<typeof cardFormSchema>;

function CardFormDialog({ open, onOpenChange, card, cards, columns, defaultColumnId, clienteId, onSuccess, certames }: { open: boolean, onOpenChange: (open: boolean) => void, card: KanbanCard | null, cards: KanbanCard[], columns: KanbanColumn[], defaultColumnId: string | null, clienteId: string, onSuccess: () => void, certames: CertameUnificado[] }) {
    const { toast } = useToast();
    const [isSaving, setIsSaving] = React.useState(false);
    const [checklistItem, setChecklistItem] = React.useState('');

    const form = useForm<CardFormValues>({
        resolver: zodResolver(cardFormSchema),
        defaultValues: card ? { 
            ...card, 
            prazo: card.prazo ? card.prazo : undefined, 
            descricao: card.descricao || '',
            checklist: card.checklist || [], 
            vinculos: card.vinculos || {} 
        } : {
            titulo: '',
            columnId: defaultColumnId ?? '',
            tipo: 'PROSPECCAO',
            prioridade: 'MEDIA',
            prazo: undefined,
            descricao: '',
            checklist: [],
            vinculos: {},
        },
    });
    
    const watchedChecklist = form.watch('checklist', []);
    const watchedCertameId = form.watch('vinculos.certameId');

    const empenhoOptions = React.useMemo(() => {
        if (!watchedCertameId) return [];
        const selectedCertame = certames.find(c => c.id === watchedCertameId);
        return selectedCertame?.empenhos || [];
    }, [watchedCertameId, certames]);

    const handleAddChecklistItem = () => {
        if (checklistItem.trim() === '') return;
        const currentChecklist = form.getValues('checklist') ?? [];
        const newChecklist = [...currentChecklist, { id: crypto.randomUUID(), texto: checklistItem, concluido: false }];
        form.setValue('checklist', newChecklist, { shouldDirty: true });
        setChecklistItem('');
    };

    const handleToggleChecklist = (id: string, checked: boolean) => {
        const newChecklist = (watchedChecklist || []).map(item => item.id === id ? { ...item, concluido: checked } : item);
        form.setValue('checklist', newChecklist);
    }
    
    const onSubmit = async (values: CardFormValues) => {
        setIsSaving(true);
        try {
            const newOrder = cards.filter(c => c.columnId === values.columnId).length;
            const dataToSave: {[key: string]: any} = {
                ...values,
                clienteId: clienteId,
                order: card?.order ?? newOrder,
            };

            // Clean top-level undefined values
            Object.keys(dataToSave).forEach(key => {
                if (dataToSave[key] === undefined) {
                    delete dataToSave[key];
                }
            });
            
            // Specifically clean the 'vinculos' object for nested undefined or empty string values
            if (dataToSave.vinculos) {
                if (!dataToSave.vinculos.certameId || dataToSave.vinculos.certameId === 'none') {
                    delete dataToSave.vinculos.certameId;
                }
                if (!dataToSave.vinculos.empenhoId || dataToSave.vinculos.empenhoId === 'none') {
                    delete dataToSave.vinculos.empenhoId;
                }
                // If the vinculos object becomes empty, remove it as well.
                if (Object.keys(dataToSave.vinculos).length === 0) {
                    delete dataToSave.vinculos;
                }
            }

            if (card) {
                await kanbanRepository.updateCard(card.id, dataToSave);
                toast({ title: 'Demanda atualizada!' });
            } else {
                await kanbanRepository.createCard(dataToSave as Omit<KanbanCard, 'id'|'createdAt'|'updatedAt'>);
                toast({ title: 'Demanda criada!' });
            }
            onSuccess();
            onOpenChange(false);
        } catch(e) {
            console.error('Error saving demand:', e);
            toast({ title: 'Erro ao salvar demanda.', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <FormDialog open={open} onOpenChange={onOpenChange} title={card ? 'Editar Demanda' : 'Nova Demanda'} formId="card-form" isSaving={isSaving}>
            <Form {...form}>
                <form id="card-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField control={form.control} name="titulo" render={({ field }) => (<FormItem><FormLabel>Título*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="columnId" render={({ field }) => (<FormItem><FormLabel>Status (Coluna)*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl><SelectContent>{columns.map(c => <SelectItem key={c.id} value={c.id}>{c.titulo}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="tipo" render={({ field }) => (<FormItem><FormLabel>Tipo*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent>{['PROSPECCAO', 'DOCUMENTACAO', 'PRECIFICACAO', 'DISPUTA', 'RECURSO', 'EXECUCAO', 'FINANCEIRO', 'SUPORTE'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="prioridade" render={({ field }) => (<FormItem><FormLabel>Prioridade*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent>{['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                    </div>
                    <FormField
                        control={form.control}
                        name="prazo"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Prazo</FormLabel>
                                <FormControl>
                                    <Input
                                        type="date"
                                        value={field.value || ''}
                                        onChange={(e) => field.onChange(e.target.value || undefined)}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                        />
                    <FormField control={form.control} name="descricao" render={({ field }) => (<FormItem><FormLabel>Descrição</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                    <div>
                        <FormLabel>Checklist</FormLabel>
                        <div className="space-y-2 mt-2">
                             {(watchedChecklist || []).map(item => (
                                 <div key={item.id} className="flex items-center gap-2">
                                     <Checkbox id={item.id} checked={item.concluido} onCheckedChange={(checked) => handleToggleChecklist(item.id, !!checked)} />
                                     <label htmlFor={item.id} className={cn("text-sm", item.concluido && 'line-through text-muted-foreground')}>{item.texto}</label>
                                 </div>
                             ))}
                        </div>
                        <div className="flex gap-2 mt-2">
                            <Input value={checklistItem} onChange={e => setChecklistItem(e.target.value)} placeholder="Novo item..."/>
                            <Button type="button" variant="outline" onClick={handleAddChecklistItem}>Add</Button>
                        </div>
                    </div>
                     <div>
                        <FormLabel>Vínculos</FormLabel>
                        <div className="grid grid-cols-2 gap-4 mt-2">
                            <FormField control={form.control} name="vinculos.certameId" render={({ field }) => (<FormItem>
                                <Select onValueChange={(value) => {
                                    field.onChange(value === "none" ? undefined : value);
                                    form.setValue('vinculos.empenhoId', undefined);
                                }} value={field.value || 'none'}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Vincular Certame..." /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="none">Nenhum</SelectItem>
                                    {certames.map(c => <SelectItem key={c.id} value={c.id}>{`${c.modalidade} ${c.numeroAno}`}</SelectItem>)}
                                </SelectContent></Select>
                            <FormMessage /></FormItem>)} />
                             <FormField control={form.control} name="vinculos.empenhoId" render={({ field }) => (<FormItem>
                                <Select onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} value={field.value || 'none'} disabled={!watchedCertameId || empenhoOptions.length === 0}><FormControl><SelectTrigger><SelectValue placeholder="Vincular Empenho..." /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="none">Nenhum</SelectItem>
                                    {empenhoOptions.map(e => <SelectItem key={e.id} value={e.id}>{e.numeroEmpenho}</SelectItem>)}
                                </SelectContent></Select>
                            <FormMessage /></FormItem>)} />
                        </div>
                    </div>
                </form>
            </Form>
        </FormDialog>
    );
}

// #endregion

// Helper
const getStatusFinanceiro = (cliente: ClienteAssessoria, cobrancas: CobrancaAssessoria[]): { text: 'Em Dia' | 'Pendente' | 'Atrasado'; variant: 'default' | 'outline' | 'destructive' } => {
    if (!cliente.vinculo || cliente.vinculo.tipoVinculo === 'EXITO' || cliente.vinculo.tipoVinculo === 'POR_PROCESSO') {
        return { text: 'Em Dia', variant: 'default' };
    }

    const mesAtual = getMonth(new Date()) + 1;
    const anoAtual = getYear(new Date());

    const cobrancasPendentes = cobrancas.filter(c => c.status !== 'PAGO');
    const temAtrasada = cobrancasPendentes.some(c => c.competenciaAno < anoAtual || (c.competenciaAno === anoAtual && c.competenciaMes < mesAtual));
    
    if (temAtrasada) {
        return { text: 'Atrasado', variant: 'destructive' };
    }
    
    const temPendenteMes = cobrancasPendentes.some(c => c.competenciaAno === anoAtual && c.competenciaMes === mesAtual);
    if (temPendenteMes) {
        return { text: 'Pendente', variant: 'outline' };
    }
    
    return { text: 'Em Dia', variant: 'default' };
};
