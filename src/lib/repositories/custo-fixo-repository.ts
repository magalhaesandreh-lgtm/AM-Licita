'use client';

import { collection, getDocs, addDoc, doc, updateDoc } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import type { CustoFixo } from '@/lib/models';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking, errorEmitter, FirestorePermissionError } from '@/firebase';

class CustoFixoRepository {
    private getCollectionRef() {
        return collection(firestore, 'custosFixos');
    }

    async list(): Promise<CustoFixo[]> {
        const colRef = this.getCollectionRef();
        const snapshot = await getDocs(colRef).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: colRef.path, operation: 'list' }));
            throw error;
        });
        return snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as CustoFixo);
    }
    
    async create(data: Omit<CustoFixo, 'id' | 'createdAt' | 'updatedAt'>): Promise<CustoFixo> {
        const docToCreate = { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        const docRef = await addDocumentNonBlocking(this.getCollectionRef(), docToCreate);
        return { ...docToCreate, id: docRef.id };
    }
    
    async update(id: string, data: Partial<Omit<CustoFixo, 'id'>>): Promise<void> {
        const docRef = doc(this.getCollectionRef(), id);
        const dataToUpdate = { ...data, updatedAt: new Date().toISOString() };
        setDocumentNonBlocking(docRef, dataToUpdate, { merge: true });
    }

    async delete(id: string): Promise<void> {
        const docRef = doc(this.getCollectionRef(), id);
        deleteDocumentNonBlocking(docRef);
    }
}

export const custoFixoRepository = new CustoFixoRepository();
