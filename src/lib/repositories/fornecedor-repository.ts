'use client';

import { collection, getDocs, addDoc, doc, updateDoc } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import type { Fornecedor } from '@/lib/models';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking, errorEmitter, FirestorePermissionError } from '@/firebase';

class FornecedorRepository {
    private getCollectionRef() {
        return collection(firestore, 'fornecedores');
    }

    async list(): Promise<Fornecedor[]> {
        const colRef = this.getCollectionRef();
        const snapshot = await getDocs(colRef).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: colRef.path, operation: 'list' }));
            throw error;
        });
        return snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as Fornecedor);
    }
    
    async search(searchTerm: string): Promise<Fornecedor[]> {
        const allFornecedores = await this.list();
        if (!searchTerm) {
            return allFornecedores;
        }
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        return allFornecedores.filter(f =>
            f.nomeFantasia.toLowerCase().includes(lowerCaseSearchTerm) ||
            f.cnpj?.includes(searchTerm) ||
            f.cidade?.toLowerCase().includes(lowerCaseSearchTerm)
        );
    }

    async create(data: Omit<Fornecedor, 'id' | 'createdAt' | 'updatedAt'>): Promise<Fornecedor> {
        const docToCreate = { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        const docRef = await addDocumentNonBlocking(this.getCollectionRef(), docToCreate);
        return { ...docToCreate, id: docRef.id };
    }

    async update(id: string, data: Partial<Omit<Fornecedor, 'id'>>): Promise<void> {
        const docRef = doc(this.getCollectionRef(), id);
        const dataToUpdate = { ...data, updatedAt: new Date().toISOString() };
        setDocumentNonBlocking(docRef, dataToUpdate, { merge: true });
    }

    async delete(id: string): Promise<void> {
        const docRef = doc(this.getCollectionRef(), id);
        deleteDocumentNonBlocking(docRef);
    }
}

export const fornecedorRepository = new FornecedorRepository();
