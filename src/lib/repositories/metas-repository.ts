'use client';

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import type { MetasConfig } from '@/lib/models';
import { errorEmitter, FirestorePermissionError } from '@/firebase';

class MetasRepository {
    private getDocRef() {
        return doc(firestore, 'settings', 'global');
    }

    async get(): Promise<MetasConfig> {
        const docRef = this.getDocRef();
        const docSnap = await getDoc(docRef).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'get' }));
            throw error;
        });
        if (docSnap.exists()) {
            const data = docSnap.data();
            return {
                salarioDesejado: data.salarioDesejado || 5000,
                lucroAlvoEmpresa: data.lucroAlvoEmpresa || 10000,
                lucroMedioPercentManual: data.lucroMedioPercentManual || 15.0,
            };
        }
        // Default values
        return {
            salarioDesejado: 5000,
            lucroAlvoEmpresa: 10000,
            lucroMedioPercentManual: 15.0,
        };
    }

    async save(metas: Partial<MetasConfig>): Promise<void> {
        const docRef = this.getDocRef();
        await updateDoc(docRef, metas);
    }
}

export const metasRepository = new MetasRepository();
