'use client';

import { doc, getDoc, updateDoc } from 'firebase/firestore';
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
        if (docSnap.exists()) {
            return docSnap.data() as ConfiguracoesGerais;
        }
        // Should be created by bootstrap script, but have a fallback
        return {
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
    }

    async save(config: Partial<ConfiguracoesGerais>): Promise<void> {
        const docRef = this.getDocRef();
        await updateDoc(docRef, config);
    }
}

export const configuracaoRepository = new ConfiguracaoRepository();
