'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';
import type { CertameUnificado, Produto, Categoria, Fornecedor, ItemPrecificacao } from '@/lib/models';
import { impostoRepository } from '@/lib/repositories/imposto-repository';
import { certameUnificadoRepository } from '@/lib/repositories/certame-unificado-repository';
import { produtoRepository } from '@/lib/repositories/produto-repository';
import { categoriaRepository } from '@/lib/repositories/categoria-repository';
import { fornecedorRepository } from '@/lib/repositories/fornecedor-repository';
import { clienteAssessoriaRepository } from '@/lib/repositories/cliente-assessoria-repository';
import { configuracaoRepository } from '@/lib/repositories/configuracao-repository';
import { custoFixoRepository } from '@/lib/repositories/custo-fixo-repository';
import { custoVariavelRepository } from '@/lib/repositories/custo-variavel-repository';
import { custosClienteRepository } from '@/lib/repositories/custos-cliente-repository';
import type { CustosClienteAssessoria } from '@/lib/models';
import { rateiosPercentuais, calculateCertamePricing, contextoParaCertame, type CalculatedItemMetrics, type FullPricingContext, type CertameComCalculo } from '@/lib/pricing-calculator';
import { CertameSelector } from './components/certame-selector';
import { CertameHeader } from './components/certame-header';
import { ItensTable } from './components/itens-table';
import { ExecucaoSection } from './components/execucao-section';
import { AvisoCustosCliente, aliquotaPadraoDoCertame } from './components/aviso-custos-cliente';

type CertameSavePayload = Partial<Omit<CertameUnificado, 'id' | 'empenhos'>>;

function sanitizeCertameForSave(certame: CertameUnificado): CertameSavePayload {
    const { id: _id, empenhos: _empenhos, ...certameData } = certame;
    return {
        ...certameData,
        itens: (certameData.itens || []).map((item) => {
            const { metrics: _metrics, ...itemData } = item as ItemPrecificacao & { metrics?: CalculatedItemMetrics };
            return itemData;
        }),
    };
}

export default function PrecificacaoUnificadaPage() {
    const { toast } = useToast();
    const { user, isUserLoading } = useUser();
    const searchParams = useSearchParams();
    const router = useRouter();

    const [allCertames, setAllCertames] = React.useState<CertameUnificado[]>([]);
    const [produtos, setProdutos] = React.useState<Produto[]>([]);
    const [categorias, setCategorias] = React.useState<Categoria[]>([]);
    const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
    const [clientes, setClientes] = React.useState<any[]>([]);
    const [pricingContext, setPricingContext] = React.useState<FullPricingContext | null>(null);
    const [selectedCertame, setSelectedCertame] = React.useState<CertameComCalculo | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [clienteFiltroId, setClienteFiltroId] = React.useState<string | null>(null);
    const [custosClientes, setCustosClientes] = React.useState<CustosClienteAssessoria[]>([]);

    const loadData = React.useCallback(async (keepSelection = false) => {
        if (isUserLoading) return;
        if (!keepSelection) setIsLoading(true);
        try {
            const [certamesData, produtosData, categoriasData, fornecedoresData, impostosData, clientesData, configData, fixosData, variaveisData, custosClientesData] = await Promise.all([
                certameUnificadoRepository.list(),
                produtoRepository.list(),
                categoriaRepository.list(),
                fornecedorRepository.list(),
                impostoRepository.getSettings(),
                clienteAssessoriaRepository.list(),
                configuracaoRepository.get(),
                custoFixoRepository.list(),
                custoVariavelRepository.list(),
                custosClienteRepository.list(),
            ]);
            setCustosClientes(custosClientesData);
            setProdutos(produtosData);
            setCategorias(categoriasData.filter(c => c.ativo));
            setFornecedores(fornecedoresData);
            setClientes(clientesData);
            // Mesmas configurações usadas nas demais telas (relatórios, assessoria): frete, custos fixos,
            // custos variáveis e impostos reais, e não valores fixos no código.
            const context: FullPricingContext = {
                imposto: impostosData,
                categorias: categoriasData,
                configuracoes: configData,
                custosFixos: fixosData,
                custosVariaveis: variaveisData,
            };
            setPricingContext(context);
            const certamesFiltrados = clienteFiltroId ? certamesData.filter(c => c.empresaDestinoId === clienteFiltroId) : certamesData;
            setAllCertames(certamesFiltrados);
            const paramId = searchParams.get('id');
            const initialSelectionId = paramId ?? (keepSelection ? selectedCertame?.id : null);
            let certameToSelect = certamesFiltrados.find(c => c.id === initialSelectionId);
            if (!certameToSelect && certamesFiltrados.length > 0) certameToSelect = certamesFiltrados[0];
            if (certameToSelect) {
                // Certame de cliente da assessoria: usa os custos do cliente (aba Custos do Cliente).
                const calculated = calculateCertamePricing(certameToSelect, contextoParaCertame(certameToSelect, context, custosClientesData));
                setSelectedCertame(calculated);
                if (paramId !== certameToSelect.id) router.replace(`/precificacao-unificada?id=${certameToSelect.id}`, { scroll: false });
            } else {
                setSelectedCertame(null);
                if (paramId) router.replace('/precificacao-unificada', { scroll: false });
            }
        } catch (e) {
            console.error("Erro ao carregar dados: ", e);
            toast({ title: 'Erro ao carregar dados', variant: 'destructive' });
        } finally {
            if (!keepSelection) setIsLoading(false);
        }
    }, [isUserLoading, clienteFiltroId, searchParams, router, selectedCertame?.id, toast]);

    React.useEffect(() => { loadData(); }, [loadData]);

    const handleSelectCertame = (id: string) => {
        if (!pricingContext || !allCertames) return;
        const certame = allCertames.find(c => c.id === id);
        if (certame) {
            setSelectedCertame(calculateCertamePricing(certame, contextoParaCertame(certame, pricingContext, custosClientes)));
            router.replace(`/precificacao-unificada?id=${id}`, { scroll: false });
        }
    };

    const onDataChange = React.useCallback(async (newCertameId?: string) => {
        setIsRefreshing(true);
        try {
            if (newCertameId) { await loadData(); return; }
            if (selectedCertame && pricingContext) {
                const updatedData = await certameUnificadoRepository.getById(selectedCertame.id);
                if (updatedData) {
                    setAllCertames(prev => prev.map(c => c.id === updatedData.id ? updatedData : c));
                    setSelectedCertame(calculateCertamePricing(updatedData, contextoParaCertame(updatedData, pricingContext, custosClientes)));
                } else {
                    await loadData();
                }
            } else {
                await loadData();
            }
        } catch {
            toast({ title: 'Erro ao recarregar dados', variant: 'destructive' });
        } finally {
            setIsRefreshing(false);
        }
    }, [selectedCertame, pricingContext, custosClientes, toast, loadData]);

    const updateCertame = async (updatedCertame: CertameUnificado) => {
        await certameUnificadoRepository.update(updatedCertame.id, sanitizeCertameForSave(updatedCertame));
        onDataChange();
    };

    if ((isLoading || isUserLoading) && !selectedCertame) {
        return (
            <div className="space-y-6 animate-pulse">
                <Card><CardHeader><Skeleton className="h-8 w-1/2" /><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-10 w-full" /></CardContent></Card>
                <Card><CardHeader><Skeleton className="h-8 w-48" /></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-5 gap-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div></CardContent></Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <CertameSelector certames={allCertames} clientes={clientes} selectedCertame={selectedCertame} selectedClienteFiltroId={clienteFiltroId} onSelect={handleSelectCertame} onDataChange={onDataChange} onClienteFiltroChange={setClienteFiltroId} isLoading={isLoading} />
            {(isLoading || isUserLoading) && <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
            {isRefreshing && selectedCertame && (
                <div className="flex items-center justify-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />Atualizando dados...
                </div>
            )}
            {selectedCertame && pricingContext && (
                <div className="space-y-6">
                    <AvisoCustosCliente certame={selectedCertame} custosClientes={custosClientes} />
                    <CertameHeader certame={selectedCertame} onUpdate={updateCertame} clientes={clientes} />
                    <ItensTable certame={selectedCertame} context={{ produtos, categorias, fornecedores, clientes }} onUpdateCertame={updateCertame} aliquotaPadrao={aliquotaPadraoDoCertame(selectedCertame, custosClientes)} />
                    <ExecucaoSection certame={selectedCertame} onDataChange={onDataChange} rateios={rateiosPercentuais(contextoParaCertame(selectedCertame, pricingContext, custosClientes))} fornecedoresCadastrados={fornecedores.map(f => f.nomeFantasia).filter(Boolean)} />
                </div>
            )}
            {!selectedCertame && !(isLoading || isUserLoading) && (
                <Card><CardHeader><CardTitle>Nenhum Certame Selecionado</CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Selecione um certame ou crie um novo para começar.</p></CardContent></Card>
            )}
        </div>
    );
}
