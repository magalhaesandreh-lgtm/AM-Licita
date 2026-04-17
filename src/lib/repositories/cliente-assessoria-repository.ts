'use client';

import { collection, getDocs, getDoc, addDoc, doc, updateDoc, query, where, writeBatch } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import type { ClienteAssessoria } from '@/lib/models';
import { addDocumentNonBlocking, setDocumentNonBlocking, errorEmitter, FirestorePermissionError } from '@/firebase';
import { kanbanRepository } from './kanban-repository';

// Helper function to recursively remove undefined properties from an object
function removeUndefined(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  }

  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (value !== undefined) {
      (acc as any)[key] = removeUndefined(value);
    }
    return acc;
  }, {} as any);
}

class ClienteAssessoriaRepository {
    private getCollectionRef() {
        return collection(firestore, 'clients');
    }

    async list(): Promise<ClienteAssessoria[]> {
        const colRef = this.getCollectionRef();
        const snapshot = await getDocs(colRef).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: colRef.path, operation: 'list' }));
            throw error;
        });
        return snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as ClienteAssessoria);
    }

    async getById(id: string): Promise<ClienteAssessoria | null> {
        const docRef = doc(this.getCollectionRef(), id);
        const docSnap = await getDoc(docRef).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'get' }));
            throw error;
        });
        return docSnap.exists() ? { ...docSnap.data(), id: docSnap.id } as ClienteAssessoria : null;
    }
    
    async search(searchTerm: string): Promise<ClienteAssessoria[]> {
        const allClients = await this.list();
        if (!searchTerm) {
            return allClients;
        }
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        return allClients.filter(c =>
            c.nomeFantasia.toLowerCase().includes(lowerCaseSearchTerm) ||
            c.cnpj?.includes(searchTerm) ||
            c.cidadeUf?.toLowerCase().includes(lowerCaseSearchTerm)
        );
    }

    async create(data: Omit<ClienteAssessoria, 'id' | 'createdAt' | 'updatedAt'>): Promise<ClienteAssessoria> {
        const now = new Date().toISOString();
        const cleanedData = removeUndefined(data);
        const docToCreate = { ...cleanedData, createdAt: now, updatedAt: now };
        const docRef = await addDoc(this.getCollectionRef(), docToCreate);
        
        await kanbanRepository.createDefaultColumnsForClient(docRef.id);

        return { ...docToCreate, id: docRef.id };
    }

    async update(id: string, data: Partial<Omit<ClienteAssessoria, 'id'>>): Promise<void> {
        const docRef = doc(this.getCollectionRef(), id);
        const cleanedData = removeUndefined(data);
        const dataToUpdate = { ...cleanedData, updatedAt: new Date().toISOString() };
        setDocumentNonBlocking(docRef, dataToUpdate, { merge: true });
    }

    async delete(clienteId: string): Promise<void> {
        const batch = writeBatch(firestore);

        const clientRef = doc(this.getCollectionRef(), clienteId);
        batch.delete(clientRef);

        await kanbanRepository.deleteAllForClient(clienteId, batch);

        const cobrancasQuery = query(collection(firestore, 'cobrancasAssessoria'), where('clienteId', '==', clienteId));
        const cobrancasSnapshot = await getDocs(cobrancasQuery);
        cobrancasSnapshot.forEach(doc => batch.delete(doc.ref));
        
        await batch.commit();
    }
}

export const clienteAssessoriaRepository = new ClienteAssessoriaRepository();
