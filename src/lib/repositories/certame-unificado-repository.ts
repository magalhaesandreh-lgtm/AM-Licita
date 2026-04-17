'use client';
import { collection, getDocs, getDoc, addDoc, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import type { CertameUnificado, Empenho } from '@/lib/models';
import { empenhoRepository } from './empenho-repository';
import { errorEmitter, FirestorePermissionError } from '@/firebase';

// Helper function to recursively remove undefined properties from an object
function removeUndefined(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefined(item));
  }
  
  if (obj instanceof Map) {
    return Object.fromEntries(Array.from(obj.entries(), ([key, value]) => [key, removeUndefined(value)]));
  }

  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (value !== undefined) {
      (acc as any)[key] = removeUndefined(value);
    }
    return acc;
  }, {} as any);
}

class CertameUnificadoRepository {
    private getCollectionRef() {
        return collection(firestore, 'certames');
    }

    async list(): Promise<CertameUnificado[]> {
        const colRef = this.getCollectionRef();
        const snapshot = await getDocs(colRef).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `certames`, operation: 'list' }));
            throw error;
        });
        const certamesPromises = snapshot.docs.map(d => this.getById(d.id));
        const certamesWithData = await Promise.all(certamesPromises);
        const certames = certamesWithData.filter((c): c is CertameUnificado => c !== null);
        return certames.sort((a, b) => new Date(b.dataSessaoISO).getTime() - new Date(a.dataSessaoISO).getTime());
    }
    
    async getById(id: string): Promise<CertameUnificado | null> {
        const docRef = doc(this.getCollectionRef(), id);
        const docSnap = await getDoc(docRef).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'get' }));
            throw error;
        });

        if (!docSnap.exists()) {
            return null;
        }

        let certameData = { ...docSnap.data(), id: docSnap.id } as CertameUnificado;

        const empenhos = await empenhoRepository.list(id);
        
        certameData = {
            ...certameData,
            empenhos: empenhos as Empenho[],
        }

        return certameData;
    }


    async create(data: Omit<CertameUnificado, 'id' | 'createdAt' | 'updatedAt' | 'empenhos'>): Promise<CertameUnificado> {
        const now = new Date().toISOString();
        const cleanedData = removeUndefined(data);
        const docToCreate = {
            ...cleanedData,
            createdAt: now,
            updatedAt: now,
        };
        const docRef = await addDoc(this.getCollectionRef(), docToCreate);
        return { ...docToCreate, id: docRef.id, empenhos: [] };
    }
    
    async update(id: string, data: Partial<Omit<CertameUnificado, 'id' | 'empenhos'>>): Promise<void> {
        const docRef = doc(this.getCollectionRef(), id);
        const cleanedData = removeUndefined(data);
        const dataToUpdate = { ...cleanedData, updatedAt: new Date().toISOString() };
        await updateDoc(docRef, dataToUpdate);
    }

    async delete(id: string): Promise<void> {
        const batch = writeBatch(firestore);

        const empenhosSnapshot = await getDocs(collection(firestore, `certames/${id}/empenhos`));
        for (const empenhoDoc of empenhosSnapshot.docs) {
            const nfsSnapshot = await getDocs(collection(empenhoDoc.ref, 'nfs'));
            nfsSnapshot.forEach(nfDoc => batch.delete(nfDoc.ref));
            batch.delete(empenhoDoc.ref);
        }
        
        const certameRef = doc(this.getCollectionRef(), id);
        batch.delete(certameRef);

        await batch.commit();
    }
}

export const certameUnificadoRepository = new CertameUnificadoRepository();
