'use client';

import * as React from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Tela cheia para um bloco da página (planilha, calculadora, lista): o bloco passa a ocupar a janela
 * inteira, com barra de título, botão para sair e rolagem própria. Esc também sai.
 *
 *   const telaCheia = useTelaCheia();
 *   <TelaCheia estado={telaCheia} titulo="Itens">{telaCheia.botao} ... </TelaCheia>
 */
export function useTelaCheia() {
    const [ativo, setAtivo] = React.useState(false);
    const alternar = React.useCallback(() => setAtivo(a => !a), []);
    React.useEffect(() => {
        if (!ativo) return;
        const sair = (e: KeyboardEvent) => { if (e.key === 'Escape') setAtivo(false); };
        window.addEventListener('keydown', sair);
        const anterior = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', sair); document.body.style.overflow = anterior; };
    }, [ativo]);
    const botao = (
        <Button type="button" variant="outline" size="sm" onClick={alternar} title={ativo ? 'Sair da tela cheia (Esc)' : 'Tela cheia'}>
            {ativo ? <><Minimize2 className="mr-2 h-4 w-4" /> Sair da tela cheia</> : <><Maximize2 className="mr-2 h-4 w-4" /> Tela cheia</>}
        </Button>
    );
    return { ativo, alternar, botao, fechar: () => setAtivo(false) };
}

export function TelaCheia({ estado, titulo, children, className }: { estado: ReturnType<typeof useTelaCheia>; titulo?: string; children: React.ReactNode; className?: string }) {
    if (!estado.ativo) return <>{children}</>;
    return (
        <div className={cn('fixed inset-0 z-40 flex flex-col bg-background', className)}>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-card px-4 py-2">
                <span className="truncate font-semibold">{titulo || 'Tela cheia'}</span>
                <span className="hidden text-xs text-muted-foreground sm:inline">Esc para sair</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3 md:p-4">{children}</div>
        </div>
    );
}
