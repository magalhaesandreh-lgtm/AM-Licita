'use client';

import { collection, getDocs, addDoc, doc, updateDoc, query, where } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import type { Categoria } from '@/lib/models';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking, errorEmitter, FirestorePermissionError } from '@/firebase';

class CategoriaRepository {
    private getCollectionRef() {
        return collection(firestore, 'categorias');
    }

    async list(): Promise<Categoria[]> {
        const colRef = this.getCollectionRef();
        const snapshot = await getDocs(colRef).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: colRef.path, operation: 'list' }));
            throw error;
        });
        return snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as Categoria);
    }
    
    async create(data: Omit<Categoria, 'id' | 'createdAt' | 'updatedAt'>): Promise<Categoria> {
        const docToCreate = { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        const docRef = await addDocumentNonBlocking(this.getCollectionRef(), docToCreate);
        return { ...docToCreate, id: docRef.id };
    }
    
    async update(id: string, data: Partial<Omit<Categoria, 'id'>>): Promise<void> {
        const docRef = doc(this.getCollectionRef(), id);
        const dataToUpdate = { ...data, updatedAt: new Date().toISOString() };
        setDocumentNonBlocking(docRef, dataToUpdate, { merge: true });
    }

    async delete(id: string): Promise<void> {
        const docRef = doc(this.getCollectionRef(), id);
        deleteDocumentNonBlocking(docRef);
    }
    
    async isNomeInUse(nome: string, excludeId?: string): Promise<boolean> {
        const colRef = this.getCollectionRef();
        const q = query(colRef, where('nome', '==', nome));
        const snapshot = await getDocs(q).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: colRef.path, operation: 'list' }));
            throw error;
        });
        if (snapshot.empty) {
            return false;
        }
        if (excludeId) {
            return snapshot.docs.some(doc => doc.id !== excludeId);
        }
        return true;
    }
}

export const categoriaRepository = new CategoriaRepository();
