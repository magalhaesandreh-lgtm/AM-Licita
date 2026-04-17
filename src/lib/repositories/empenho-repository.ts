import { collection, getDocs, getDoc, addDoc, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import type { Empenho } from '@/lib/models';
import { nfRepository } from './nf-repository';
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


class EmpenhoRepository {
    private getCollectionRef(certameId: string) {
        return collection(firestore, `certames/${certameId}/empenhos`);
    }

    async list(certameId: string): Promise<Empenho[]> {
        const colRef = this.getCollectionRef(certameId);
        const snapshot = await getDocs(colRef).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `certames/${certameId}/empenhos`, operation: 'list' }));
            throw error;
        });
        const empenhosPromises = snapshot.docs.map(async (d) => {
            const empenhoData = d.data() as Partial<Empenho>;
            const nfs = await nfRepository.list(certameId, d.id);
            return { 
                ...empenhoData,
                id: d.id,
                itens: empenhoData.itens || [],
                nfs: nfs,
            } as Empenho;
        });
        const empenhos = await Promise.all(empenhosPromises);
        return empenhos.sort((a, b) => new Date(b.dataSolicitacaoISO).getTime() - new Date(a.dataSolicitacaoISO).getTime());
    }

    async add(certameId: string, data: Omit<Empenho, 'id' | 'createdAt' | 'updatedAt' | 'nfs'>): Promise<Empenho> {
        const now = new Date().toISOString();
        const cleanedData = removeUndefined(data);
        const docToCreate = { ...cleanedData, createdAt: now, updatedAt: now };
        const docRef = await addDoc(this.getCollectionRef(certameId), docToCreate);
        return { ...docToCreate, id: docRef.id, nfs: [] };
    }

    async update(certameId: string, empenhoId: string, data: Partial<Omit<Empenho, 'id' | 'nfs'>>): Promise<void> {
        const docRef = doc(firestore, `certames/${certameId}/empenhos`, empenhoId);
        const cleanedData = removeUndefined(data);
        const dataToUpdate = { ...cleanedData, updatedAt: new Date().toISOString() };
        // Use updateDoc for existing fields, not setDoc
        await updateDoc(docRef, dataToUpdate);
    }

    async recalculateSaldos(certameId: string, empenhoId: string): Promise<void> {
        const empenhoRef = doc(firestore, `certames/${certameId}/empenhos`, empenhoId);
        const empenhoSnap = await getDoc(empenhoRef);
        if (!empenhoSnap.exists()) return;

        const empenhoData = empenhoSnap.data() as Partial<Empenho>;
        if (!empenhoData.itens || empenhoData.itens.length === 0) return;

        const nfs = await nfRepository.list(certameId, empenhoId);
        
        let changed = false;
        const newItens = empenhoData.itens.map(item => {
            const qtdEmpenhada = item.qtdEmpenhada || 0;
            let qtdEntregueAcc = 0;
            nfs.forEach(nf => {
                if (nf.itens) {
                    const matchedItem = nf.itens.find(nfi => nfi.empenhoItemId === item.id);
                    if (matchedItem) {
                        qtdEntregueAcc += (matchedItem.qtdNestaNF || 0);
                    }
                }
            });
            const qtdSaldoNovo = qtdEmpenhada - qtdEntregueAcc;
            
            if (item.qtdEntregue !== qtdEntregueAcc || item.qtdSaldo !== qtdSaldoNovo) {
                changed = true;
                return { ...item, qtdEntregue: qtdEntregueAcc, qtdSaldo: qtdSaldoNovo };
            }
            return item;
        });

        if (changed) {
            await updateDoc(empenhoRef, { itens: newItens, updatedAt: new Date().toISOString() });
        }
    }

    async delete(certameId: string, empenhoId: string): Promise<void> {
        const batch = writeBatch(firestore);
        const nfsSnapshot = await getDocs(collection(firestore, `certames/${certameId}/empenhos/${empenhoId}/nfs`));
        nfsSnapshot.forEach(nfDoc => batch.delete(nfDoc.ref));
        
        const empenhoRef = doc(firestore, `certames/${certameId}/empenhos`, empenhoId);
        batch.delete(empenhoRef);

        await batch.commit();
    }
}

export const empenhoRepository = new EmpenhoRepository();

    