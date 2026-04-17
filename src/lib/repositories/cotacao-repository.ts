'use client';

import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import type { Cotacao } from '@/lib/models';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking, errorEmitter, FirestorePermissionError } from '@/firebase';

class CotacaoRepository {
    private getCollectionRef() {
        return collection(firestore, 'cotacoes');
    }

    async list(): Promise<Cotacao[]> {
        const colRef = this.getCollectionRef();
        const snapshot = await getDocs(colRef).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: colRef.path, operation: 'list' }));
            throw error;
        });
        return snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as Cotacao);
    }

    async create(data: Omit<Cotacao, 'id' | 'createdAt' | 'updatedAt'>): Promise<Cotacao> {
        const docToCreate = { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        const docRef = await addDocumentNonBlocking(this.getCollectionRef(), docToCreate);
        return { ...docToCreate, id: docRef.id };
    }

    async update(id: string, data: Partial<Omit<Cotacao, 'id'>>): Promise<void> {
        const docRef = doc(this.getCollectionRef(), id);
        const dataToUpdate = { ...data, updatedAt: new Date().toISOString() };
        setDocumentNonBlocking(docRef, dataToUpdate, { merge: true });
    }

    async delete(id: string): Promise<void> {
        const docRef = doc(this.getCollectionRef(), id);
        deleteDocumentNonBlocking(docRef);
    }
}

export const cotacaoRepository = new CotacaoRepository();
