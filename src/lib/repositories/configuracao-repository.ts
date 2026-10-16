'use client';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import type { ConfiguracoesGerais } from '@/lib/models';
import { errorEmitter, FirestorePermissionError } from '@/firebase';

class ConfiguracaoRepository {
    private getDocRef() {
        return doc(firestore, 'settings', 'global');
    }

    async get(): Promise<ConfiguracoesGerais> {
        const docRef = this.getDocRef();
        const docSnap = await getDoc(docRef).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'get' }));
            throw error;
        });
        // Campos ausentes no documento (ele também guarda o branding) caem no padrão, para que os
        // cálculos de preço nunca recebam undefined/NaN.
        const padrao: ConfiguracoesGerais = {
            appName: 'AM Gestão',
            themeDefault: 'system',
            fretePadraoPercent: 5.0,
            faturamentoMensalPrevisto: 50000,
            metasControlamFaturamento: true,
            anexoProduto: 'I',
            aliquotaProduto: 4.5,
            anexoServico: 'III',
            aliquotaServico: 6.0,
        };
        if (!docSnap.exists()) return padrao;
        const dados = docSnap.data() as Partial<ConfiguracoesGerais>;
        const limpos = Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== undefined && v !== null));
        return { ...padrao, ...limpos, overheadPercentManual: dados.overheadPercentManual ?? null };
    }

    async save(config: Partial<ConfiguracoesGerais>): Promise<void> {
        const docRef = this.getDocRef();
        await setDoc(docRef, config, { merge: true });
    }
}

export const configuracaoRepository = new ConfiguracaoRepository();
