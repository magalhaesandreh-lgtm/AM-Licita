'use client';

import * as React from 'react';
import { format as formatDate } from 'date-fns';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { DecimalInput } from '@/components/ui/decimal-input';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { COMO_COMPROU_LABEL, comprasDoItem, validarCompra } from '@/lib/custo-real';
import type { CompraReal, ComoComprou, Empenho } from '@/lib/models';

interface CompraRealDialogProps {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    empenho: Empenho;
    /** Item pré-selecionado ao abrir pelo botão "+ Compra" de uma linha. */
    itemIdInicial?: string | null;
    compraToEdit?: CompraReal | null;
    /** Nomes já usados (fornecedores cadastrados e compras anteriores) para agilizar o preenchimento. */
    fornecedoresSugeridos: string[];
    onSubmit: (compra: CompraReal) => Promise<void>;
}

const hoje = () => formatDate(new Date(), 'yyyy-MM-dd');

export function CompraRealDialog({ open, onOpenChange, empenho, itemIdInicial, compraToEdit, fornecedoresSugeridos, onSubmit }: CompraRealDialogProps) {
    const { toast } = useToast();
    const [isSaving, setIsSaving] = React.useState(false);
    const [itemId, setItemId] = React.useState('');
    const [data, setData] = React.useState(hoje());
    const [qtd, setQtd] = React.useState(0);
    const [custoUnit, setCustoUnit] = React.useState(0);
    const [fornecedor, setFornecedor] = React.useState('');
    const [marca, setMarca] = React.useState('');
    const [como, setComo] = React.useState<ComoComprou | ''>('');
    const [documento, setDocumento] = React.useState('');
    const [obs, setObs] = React.useState('');

    React.useEffect(() => {
        if (!open) return;
        if (compraToEdit) {
            setItemId(compraToEdit.empenhoItemId); setData(compraToEdit.dataCompraISO); setQtd(compraToEdit.qtd); setCustoUnit(compraToEdit.custoUnit);
            setFornecedor(compraToEdit.fornecedor); setMarca(compraToEdit.marca ?? ''); setComo(compraToEdit.comoComprou ?? ''); setDocumento(compraToEdit.documento ?? ''); setObs(compraToEdit.observacoes ?? '');
        } else {
            setItemId(itemIdInicial ?? ''); setData(hoje()); setQtd(0); setCustoUnit(0); setFornecedor(''); setMarca(''); setComo(''); setDocumento(''); setObs('');
        }
    }, [open, compraToEdit, itemIdInicial]);

    const item = empenho.itens.find(i => i.id === itemId);
    const comprasItem = item ? comprasDoItem(empenho.comprasReais, item.id).filter(c => c.id !== compraToEdit?.id) : [];
    const jaComprada = comprasItem.reduce((a, c) => a + c.qtd, 0);
    const saldo = item ? Math.max(0, Math.round((item.qtdEmpenhada - jaComprada) * 10000) / 10000) : 0;

    // Ao escolher o item, sugere a marca da última compra dele.
    const escolherItem = (id: string) => {
        setItemId(id);
        if (!compraToEdit && !marca) {
            const ultima = comprasDoItem(empenho.comprasReais, id).sort((a, b) => b.dataCompraISO.localeCompare(a.dataCompraISO))[0];
            if (ultima?.marca) setMarca(ultima.marca);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!item) { toast({ title: 'Escolha o item', variant: 'destructive' }); return; }
        if (!data) { toast({ title: 'Informe a data da compra', variant: 'destructive' }); return; }
        const erro = validarCompra({ qtd, custoUnit, fornecedor }, item, jaComprada);
        if (erro) { toast({ title: 'Confira a compra', description: erro, variant: 'destructive' }); return; }
        setIsSaving(true);
        try {
            await onSubmit({
                id: compraToEdit?.id ?? crypto.randomUUID(),
                empenhoItemId: item.id,
                dataCompraISO: data,
                qtd,
                custoUnit,
                fornecedor: fornecedor.trim(),
                marca: marca.trim() || undefined,
                comoComprou: como || undefined,
                documento: documento.trim() || undefined,
                observacoes: obs.trim() || undefined,
                registradoEm: compraToEdit?.registradoEm ?? new Date().toISOString(),
            });
            onOpenChange(false);
        } catch {
            toast({ title: 'Erro ao salvar a compra', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <FormDialog open={open} onOpenChange={onOpenChange} title={compraToEdit ? 'Editar compra' : 'Registrar compra'} description="Custo real pago pelo item do empenho, com data, fornecedor e marca." formId="compra-real-f" isSaving={isSaving}>
            <form id="compra-real-f" onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label>Item do empenho*</Label>
                    <Select value={itemId} onValueChange={escolherItem} disabled={!!compraToEdit}>
                        <SelectTrigger><SelectValue placeholder="Selecione o item..." /></SelectTrigger>
                        <SelectContent>
                            {empenho.itens.map(i => (
                                <SelectItem key={i.id} value={i.id}>{i.descricaoSnapshot} ({i.qtdEmpenhada} {i.unidadeSnapshot})</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {item && (
                        <p className="text-xs text-muted-foreground">
                            Empenhado: {item.qtdEmpenhada} {item.unidadeSnapshot} | já comprado: {jaComprada} | <span className="font-semibold">saldo a comprar: {saldo}</span> | venda unit.: {formatCurrency(item.precoVendaUnitSnapshot)}
                        </p>
                    )}
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2"><Label>Data da compra*</Label><Input type="date" value={data} onChange={e => setData(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Quantidade*</Label><DecimalInput value={qtd} onChange={setQtd} /></div>
                    <div className="space-y-2"><Label>Custo unitário pago*</Label><CurrencyInput value={custoUnit} onChange={setCustoUnit} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Onde comprou (fornecedor)*</Label>
                        <Input list="fornecedores-compra" value={fornecedor} onChange={e => setFornecedor(e.target.value)} />
                        <datalist id="fornecedores-compra">{fornecedoresSugeridos.map(n => <option key={n} value={n} />)}</datalist>
                    </div>
                    <div className="space-y-2"><Label>Marca</Label><Input value={marca} onChange={e => setMarca(e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Como comprou</Label>
                        <Select value={como} onValueChange={v => setComo(v as ComoComprou)}>
                            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                            <SelectContent>{(Object.keys(COMO_COMPROU_LABEL) as ComoComprou[]).map(k => <SelectItem key={k} value={k}>{COMO_COMPROU_LABEL[k]}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2"><Label>Nº da nota / pedido de compra</Label><Input value={documento} onChange={e => setDocumento(e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label>Observações</Label><Textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Prazo de entrega, condição de pagamento, contato, etc." /></div>
                {item && qtd > 0 && custoUnit > 0 && (
                    <p className="rounded-md border bg-muted/40 p-2 text-sm">Total desta compra: <span className="font-bold">{formatCurrency(qtd * custoUnit)}</span></p>
                )}
            </form>
        </FormDialog>
    );
}
