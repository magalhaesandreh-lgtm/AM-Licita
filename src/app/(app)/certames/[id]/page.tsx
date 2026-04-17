
'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format as formatDate, parseISO } from 'date-fns';
import { Loader2, ArrowLeft, MoreVertical, Trash2, Pencil, ExternalLink } from 'lucide-react';

import type { CertameComCalculo } from '@/lib/pricing-calculator';
import { certameUnificadoRepository } from '@/lib/repositories/certame-unificado-repository';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { CertameFormDialog } from '../../precificacao-unificada/certame-form-dialog';
import type { CertameUnificado } from '@/lib/models';


function InfoItem({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
    if (!value && value !== 0) return null;
    return (
        <div className={className}>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-base">{value}</p>
        </div>
    );
}

function ExecutionSummaryCard({ summary }: { summary: { items: any[], totals: any } }) {
    if (!summary || summary.items.length === 0) {
        return null;
    }
    return (
        <Card>
            <CardHeader>
                <CardTitle>Resumo da Execução (Itens)</CardTitle>
                <CardDescription>Visão consolidada das quantidades previstas, empenhadas e entregues para cada item do certame.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="max-w-[250px]">Item</TableHead>
                                <TableHead className="text-right">Qtd. Prevista</TableHead>
                                <TableHead className="text-right font-bold">Saldo a Empenhar</TableHead>
                                <TableHead className="text-right">Qtd. Empenhada</TableHead>
                                <TableHead className="text-right">Qtd. Entregue</TableHead>
                                <TableHead className="text-right font-bold">Saldo a Entregar</TableHead>
                                <TableHead className="text-right">Valor Entregue</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {summary.items.map(item => (
                                <TableRow key={item.id}>
                                    <TableCell className="font-medium max-w-[250px] truncate" title={item.descricao}>{item.descricao}</TableCell>
                                    <TableCell className="text-right">{item.qtdPrevista}</TableCell>
                                    <TableCell className="text-right font-bold">{item.saldoAEmpenhar}</TableCell>
                                    <TableCell className="text-right">{item.qtdEmpenhada}</TableCell>
                                    <TableCell className="text-right">{item.qtdEntregue}</TableCell>
                                    <TableCell className="text-right font-bold">{item.saldo}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(item.valorEntregue)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFooter>
                            <TableRow className="font-bold bg-muted/50 hover:bg-muted/50">
                                <TableCell>TOTAIS</TableCell>
                                <TableCell className="text-right">{summary.totals.qtdPrevista}</TableCell>
                                <TableCell className="text-right">{summary.totals.saldoAEmpenhar}</TableCell>
                                <TableCell className="text-right">{summary.totals.qtdEmpenhada}</TableCell>
                                <TableCell className="text-right">{summary.totals.qtdEntregue}</TableCell>
                                <TableCell className="text-right">{summary.totals.saldo}</TableCell>
                                <TableCell className="text-right">{formatCurrency(summary.totals.valorEntregue)}</TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

export default function CertameDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const { user, isUserLoading } = useUser();
    
    const certameId = params.id as string;

    const [certame, setCertame] = React.useState<CertameUnificado | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = React.useState(false);

    const loadCertame = React.useCallback(async () => {
        if (!certameId) return;
        setIsLoading(true);
        try {
            const data = await certameUnificadoRepository.getById(certameId);
            if (!data) {
                toast({ title: "Certame não encontrado", variant: 'destructive' });
                router.push('/precificacao-unificada');
            } else {
                setCertame(data);
            }
        } catch (error) {
            toast({ title: "Erro ao carregar certame", variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [certameId, router, toast]);

    React.useEffect(() => {
        if (!isUserLoading && user) {
            loadCertame();
        }
    }, [isUserLoading, user, loadCertame]);

    const handleSuccess = () => {
        setIsFormOpen(false);
        loadCertame();
    };

    const handleDelete = async () => {
        if (!certame) return;
        try {
            await certameUnificadoRepository.delete(certame.id);
            toast({ title: 'Certame excluído com sucesso', variant: 'destructive' });
            router.push('/precificacao-unificada');
        } catch (error) {
            toast({ title: 'Erro ao excluir certame', variant: 'destructive' });
        } finally {
            setIsDeleteAlertOpen(false);
        }
    };
    
    const { totalItens, totalEmpenhado, totalFaturado } = React.useMemo(() => {
        if (!certame) {
            return { totalItens: 0, totalEmpenhado: 0, totalFaturado: 0 };
        }
        const totalItens = certame.itens.length;
        const totalEmpenhado = certame.empenhos.reduce((acc, emp) => acc + emp.itens.reduce((itemAcc, item) => itemAcc + (item.precoVendaUnitSnapshot * item.qtdEmpenhada), 0), 0);
        const totalFaturado = certame.empenhos.reduce((acc, emp) => acc + emp.nfs.reduce((nfAcc, nf) => nfAcc + nf.itens.reduce((itemAcc, item) => itemAcc + (item.qtdNestaNF * (emp.itens.find(ei => ei.id === item.empenhoItemId)?.precoVendaUnitSnapshot || 0)), 0), 0), 0);
        return { totalItens, totalEmpenhado, totalFaturado };
    }, [certame]);
    
    const executionSummary = React.useMemo(() => {
        if (!certame) return { items: [], totals: { qtdPrevista: 0, saldoAEmpenhar: 0, qtdEmpenhada: 0, qtdEntregue: 0, saldo: 0, valorEntregue: 0 } };

        const itemSummaries = certame.itens.map(precificacaoItem => {
            let qtdEmpenhada = 0;
            let qtdEntregue = 0;
            let valorEntregue = 0;

            certame.empenhos.forEach(empenho => {
                empenho.itens.forEach(empenhoItem => {
                    if (empenhoItem.precificacaoItemId === precificacaoItem.id) {
                        qtdEmpenhada += empenhoItem.qtdEmpenhada;

                        empenho.nfs.forEach(nf => {
                            nf.itens.forEach(nfItem => {
                                if (nfItem.empenhoItemId === empenhoItem.id) {
                                    qtdEntregue += nfItem.qtdNestaNF;
                                    valorEntregue += nfItem.qtdNestaNF * empenhoItem.precoVendaUnitSnapshot;
                                }
                            });
                        });
                    }
                });
            });

            return {
                id: precificacaoItem.id,
                descricao: precificacaoItem.descricao,
                qtdPrevista: precificacaoItem.qtd,
                saldoAEmpenhar: precificacaoItem.qtd - qtdEmpenhada,
                qtdEmpenhada,
                qtdEntregue,
                saldo: qtdEmpenhada - qtdEntregue,
                valorEntregue
            };
        });

        const totals = {
            qtdPrevista: itemSummaries.reduce((sum, item) => sum + item.qtdPrevista, 0),
            saldoAEmpenhar: itemSummaries.reduce((sum, item) => sum + item.saldoAEmpenhar, 0),
            qtdEmpenhada: itemSummaries.reduce((sum, item) => sum + item.qtdEmpenhada, 0),
            qtdEntregue: itemSummaries.reduce((sum, item) => sum + item.qtdEntregue, 0),
            saldo: itemSummaries.reduce((sum, item) => sum + item.saldo, 0),
            valorEntregue: itemSummaries.reduce((sum, item) => sum + item.valorEntregue, 0),
        };

        return { items: itemSummaries, totals };
    }, [certame]);

    if (isLoading || isUserLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-10 w-1/4" />
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
                <div className="space-y-4 pt-4">
                    <Skeleton className="h-48 w-full" />
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-24 w-full" />
                </div>
            </div>
        );
    }
    
    if (!certame) {
        return null;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <Button variant="outline" onClick={() => router.push('/precificacao-unificada')}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
                <div className="flex items-center gap-2">
                    <Button onClick={() => router.push(`/precificacao-unificada?id=${certame.id}`)}>
                        <ExternalLink className="mr-2 h-4 w-4" /> Abrir na Planilha
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreVertical className="h-5 w-5" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setIsFormOpen(true)}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setIsDeleteAlertOpen(true)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{certame.modalidade} {certame.numeroAno}</CardTitle>
                    <CardDescription>{certame.orgao}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                         <InfoItem label="Total de Itens" value={totalItens} />
                         <InfoItem label="Total Empenhado" value={formatCurrency(totalEmpenhado)} />
                         <InfoItem label="Total Faturado" value={formatCurrency(totalFaturado)} />
                         <InfoItem label="Status" value={<Badge>{certame.status}</Badge>} />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Identificação</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <InfoItem label="Processo" value={certame.processo} />
                    <InfoItem label="UASG / UG" value={certame.uasgUg} />
                    <InfoItem label="Plataforma" value={certame.plataforma} />
                    <InfoItem label="Objeto / Resumo" value={certame.objetoResumo} className="md:col-span-2 lg:col-span-3" />
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle>Datas e Prazos</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <InfoItem label="Data da Sessão" value={formatDate(parseISO(certame.dataSessaoISO), 'dd/MM/yyyy')} />
                        <InfoItem label="Início da Vigência" value={certame.inicioVigencia ? formatDate(parseISO(certame.inicioVigencia), 'dd/MM/yyyy') : '-'} />
                        <InfoItem label="Fim da Vigência" value={certame.fimVigencia ? formatDate(parseISO(certame.fimVigencia), 'dd/MM/yyyy') : '-'} />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Status e Flags</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <InfoItem label="Retroativo" value={certame.isRetroativo ? 'Sim' : 'Não'} />
                        <InfoItem label="Cálculos Congelados" value={certame.congelado ? 'Sim' : 'Não'} />
                        <InfoItem label="Orçamento Sigiloso" value={certame.orcamentoSigiloso ? 'Sim' : 'Não'} />
                    </CardContent>
                </Card>
            </div>
            
            <ExecutionSummaryCard summary={executionSummary} />

            <Card>
                <CardHeader><CardTitle>Observações</CardTitle></CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{certame.observacoes || 'Nenhuma observação.'}</p>
                </CardContent>
            </Card>
            
            {isFormOpen && (
                <CertameFormDialog 
                    open={isFormOpen}
                    onOpenChange={setIsFormOpen}
                    onSuccess={handleSuccess}
                    certameToEdit={certame}
                />
            )}

            <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. Isso excluirá permanentemente o certame e todos os seus empenhos e notas fiscais associados.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                            Excluir Permanentemente
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
