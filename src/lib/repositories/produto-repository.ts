'use client';

import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, where, limit } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import type { Produto } from '@/lib/models';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking, errorEmitter, FirestorePermissionError } from '@/firebase';

class ProdutoRepository {
    private getCollectionRef() {
        return collection(firestore, 'produtos');
    }

    async list(): Promise<Produto[]> {
        const colRef = this.getCollectionRef();
        const snapshot = await getDocs(colRef).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: colRef.path, operation: 'list' }));
            throw error;
        });
        return snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as Produto);
    }

    async search(searchTerm: string): Promise<Produto[]> {
        const allProdutos = await this.list();
        if (!searchTerm) {
            return allProdutos;
        }
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        return allProdutos.filter(p => 
            p.descricao.toLowerCase().includes(lowerCaseSearchTerm) ||
            p.marca?.toLowerCase().includes(lowerCaseSearchTerm)
        );
    }
    
    async create(data: Omit<Produto, 'id' | 'createdAt' | 'updatedAt'>): Promise<Produto> {
        const docToCreate = { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        const docRef = await addDocumentNonBlocking(this.getCollectionRef(), docToCreate);
        return { ...docToCreate, id: docRef.id };
    }
    
    async update(id: string, data: Partial<Omit<Produto, 'id'>>): Promise<void> {
        const docRef = doc(this.getCollectionRef(), id);
        const dataToUpdate = { ...data, updatedAt: new Date().toISOString() };
        setDocumentNonBlocking(docRef, dataToUpdate, { merge: true });
    }

    async delete(id: string): Promise<void> {
        const docRef = doc(this.getCollectionRef(), id);
        deleteDocumentNonBlocking(docRef);
    }
    
    async isCategoriaInUse(categoriaId: string): Promise<boolean> {
        const colRef = this.getCollectionRef();
        const q = query(colRef, where('categoriaId', '==', categoriaId), limit(1));
        const snapshot = await getDocs(q).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: colRef.path, operation: 'list' }));
            throw error;
        });
        return !snapshot.empty;
    }

    async isFornecedorInUse(fornecedorId: string): Promise<boolean> {
        const colRef = this.getCollectionRef();
        const q = query(colRef, where('fornecedorId', '==', fornecedorId), limit(1));
        const snapshot = await getDocs(q).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: colRef.path, operation: 'list' }));
            throw error;
        });
        return !snapshot.empty;
    }
}

export const produtoRepository = new ProdutoRepository();
