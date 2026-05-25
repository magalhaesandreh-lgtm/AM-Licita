'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PlusCircle, MoreVertical, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { certameUnificadoRepository } from '@/lib/repositories/certame-unificado-repository';
import type { CertameUnificado } from '@/lib/models';
import { CertameFormDialog } from '../certame-form-dialog';

interface CertameSelectorProps {
    certames: CertameUnificado[];
    clientes: any[];
    selectedCertame: CertameUnificado | null;
    selectedClienteFiltroId: string | null;
    onSelect: (id: string) => void;
    onDataChange: (newCertameId?: string) => void;
    onClienteFiltroChange: (id: string | null) => void;
    isLoading: boolean;
}

export function CertameSelector({ certames, clientes, selectedCertame, selectedClienteFiltroId, onSelect, onDataChange, onClienteFiltroChange, isLoading }: CertameSelectorProps) {
    const [formMode, setFormMode] = React.useState<'hidden' | 'new' | 'edit'>('hidden');
    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = React.useState(false);
    const router = useRouter();
    const { toast } = useToast();

    const handleSuccess = (newCertameId?: string) => { setFormMode('hidden'); onDataChange(newCertameId); };
    const handleDelete = async () => {
        if (!selectedCertame) return;
        try {
            await certameUnificadoRepository.delete(selectedCertame.id);
            toast({ title: "Certame excluído com sucesso!", variant: 'destructive' });
            router.replace('/precificacao-unificada');
            onDataChange();
        } catch {
            toast({ title: "Erro ao excluir certame.", variant: 'destructive' });
        } finally {
            setIsDeleteAlertOpen(false);
        }
    };

    return (
        <Card>
            <CardHeader><CardTitle>Certames (Planilha)</CardTitle><CardDescription>Gerencie sua precificação e execução.</CardDescription></CardHeader>
            <CardContent>
                <div className="flex flex-col md:flex-row gap-2">
                    <Select onValueChange={(val) => onClienteFiltroChange(val === 'todos' ? null : val)} value={selectedClienteFiltroId ?? 'todos'}>
                        <SelectTrigger className="w-full md:w-[250px]"><SelectValue placeholder="Filtrar por empresa..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="todos">Todas as Empresas</SelectItem>
                            {clientes.filter(e => e.statusAtivo).map(e => <SelectItem key={e.id} value={e.id}>{e.nomeFantasia}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select onValueChange={onSelect} value={selectedCertame?.id ?? ''} disabled={isLoading || certames.length === 0}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione um certame..." /></SelectTrigger>
                        <SelectContent>
                            {certames.map(c => <SelectItem key={c.id} value={c.id}>{c.modalidade} {c.numeroAno} - {c.orgao}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {selectedCertame && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="outline" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => router.push(`/certames/${selectedCertame.id}`)}><ExternalLink className="mr-2 h-4 w-4" /> Ver Detalhes</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setFormMode('edit')}><Pencil className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setIsDeleteAlertOpen(true)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    <Button onClick={() => setFormMode('new')}><PlusCircle /> Novo Certame</Button>
                </div>
                <CertameFormDialog
                    open={formMode !== 'hidden'}
                    onOpenChange={(isOpen) => { if (!isOpen) setTimeout(() => setFormMode('hidden'), 300); }}
                    onSuccess={handleSuccess}
                    certameToEdit={formMode === 'edit' ? selectedCertame : null}
                    clientes={clientes}
                />
                <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive">Excluir</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    );
}
