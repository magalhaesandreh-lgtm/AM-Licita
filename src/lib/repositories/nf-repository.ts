import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import type { NotaFiscal } from '@/lib/models';
import { errorEmitter, FirestorePermissionError } from '@/firebase';

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


class NFRepository {
    private getCollectionRef(certameId: string, empenhoId: string) {
        return collection(firestore, `certames/${certameId}/empenhos/${empenhoId}/nfs`);
    }

    async list(certameId: string, empenhoId: string): Promise<NotaFiscal[]> {
        const colRef = this.getCollectionRef(certameId, empenhoId);
        const snapshot = await getDocs(colRef).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `certames/${certameId}/empenhos/${empenhoId}/nfs`, operation: 'list' }));
            throw error;
        });
        const nfs = snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as NotaFiscal);
        return nfs.sort((a, b) => new Date(b.dataNFISO).getTime() - new Date(a.dataNFISO).getTime());
    }

    async add(certameId: string, empenhoId: string, data: Omit<NotaFiscal, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotaFiscal> {
        const now = new Date().toISOString();
        const cleanedData = removeUndefined(data);
        const docToCreate = { ...cleanedData, createdAt: now, updatedAt: now };
        const docRef = await addDoc(this.getCollectionRef(certameId, empenhoId), docToCreate);
        return { ...docToCreate, id: docRef.id };
    }

    async update(certameId: string, empenhoId: string, nfId: string, data: Partial<Omit<NotaFiscal, 'id'>>): Promise<void> {
        const docRef = doc(firestore, `certames/${certameId}/empenhos/${empenhoId}/nfs`, nfId);
        const cleanedData = removeUndefined(data);
        await updateDoc(docRef, { ...cleanedData, updatedAt: new Date().toISOString() });
    }

    async delete(certameId: string, empenhoId: string, nfId: string): Promise<void> {
        const docRef = doc(firestore, `certames/${certameId}/empenhos/${empenhoId}/nfs`, nfId);
        await deleteDoc(docRef);
    }
}

export const nfRepository = new NFRepository();

    