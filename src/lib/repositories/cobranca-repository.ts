'use client';

import { collection, getDocs, addDoc, doc, updateDoc, query, where } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import type { CobrancaAssessoria } from '@/lib/models';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking, errorEmitter, FirestorePermissionError } from '@/firebase';

class CobrancaRepository {
    private getCollectionRef() {
        return collection(firestore, 'cobrancasAssessoria');
    }

    async list(): Promise<CobrancaAssessoria[]> {
        const colRef = this.getCollectionRef();
        const snapshot = await getDocs(colRef).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: colRef.path, operation: 'list' }));
            throw error;
        });
        return snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as CobrancaAssessoria);
    }
    
    async listByCliente(clienteId: string): Promise<CobrancaAssessoria[]> {
        const colRef = this.getCollectionRef();
        const q = query(colRef, where('clienteId', '==', clienteId));
        const snapshot = await getDocs(q).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: colRef.path, operation: 'list' }));
            throw error;
        });
        return snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as CobrancaAssessoria);
    }

    async create(data: Omit<CobrancaAssessoria, 'id' | 'createdAt' | 'updatedAt'>): Promise<CobrancaAssessoria> {
        const docToCreate = { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        const docRef = await addDocumentNonBlocking(this.getCollectionRef(), docToCreate);
        return { ...docToCreate, id: docRef.id };
    }

    async update(id: string, data: Partial<Omit<CobrancaAssessoria, 'id'>>): Promise<void> {
        const docRef = doc(this.getCollectionRef(), id);
        const dataToUpdate = { ...data, updatedAt: new Date().toISOString() };
        setDocumentNonBlocking(docRef, dataToUpdate, { merge: true });
    }

    async delete(id: string): Promise<void> {
        const docRef = doc(this.getCollectionRef(), id);
        deleteDocumentNonBlocking(docRef);
    }
}

export const cobrancaRepository = new CobrancaRepository();
