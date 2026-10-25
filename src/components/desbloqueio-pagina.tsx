'use client';

import * as React from 'react';

/**
 * Proteção contra a página "travada" (vira imagem, nada clicável): bibliotecas de diálogo e menu colocam
 * "pointer-events: none" no body enquanto estão abertas. Se, ao fechar, isso não for desfeito, a página
 * inteira para de responder. Este componente observa o body e, quando não há nenhum diálogo, menu ou
 * lista aberta, devolve os cliques à página.
 */
const SELETOR_ABERTOS = [
    '[role="dialog"][data-state="open"]',
    '[role="alertdialog"][data-state="open"]',
    '[role="menu"][data-state="open"]',
    '[role="listbox"][data-state="open"]',
    '[data-radix-popper-content-wrapper] [data-state="open"]',
].join(',');

export function DesbloqueioPagina() {
    React.useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const verificar = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                const body = document.body;
                if (body.style.pointerEvents === 'none' && !document.querySelector(SELETOR_ABERTOS)) {
                    body.style.pointerEvents = '';
                }
            }, 350);
        };
        const obs = new MutationObserver(verificar);
        obs.observe(document.body, { attributes: true, attributeFilter: ['style'], childList: true });
        verificar();
        return () => { obs.disconnect(); if (timer) clearTimeout(timer); };
    }, []);
    return null;
}
