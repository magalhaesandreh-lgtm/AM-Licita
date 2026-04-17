import { collection, getDocs, addDoc, doc, updateDoc, query, where, writeBatch, WriteBatch } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import type { KanbanCard, KanbanColumn } from '@/lib/models';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking, errorEmitter, FirestorePermissionError } from '@/firebase';

const DEFAULT_KANBAN_COLUMNS = [
  { id: 'entrada', titulo: '1. Entrada (Triagem)', order: 0 },
  { id: 'diagnostico', titulo: '2. Diagnóstico & Escopo', order: 1 },
  { id: 'proposta', titulo: '3. Proposta / Contratação', order: 2 },
  { id: 'onboarding', titulo: '4. Onboarding (Documentos)', order: 3 },
  { id: 'radar', titulo: '5. Radar (Oportunidades)', order: 4 },
  { id: 'analise', titulo: '6. Análise do Edital / Estratégia', order: 5 },
  { id: 'precificacao', titulo: '7. Precificação & Viabilidade', order: 6 },
  { id: 'montagem', titulo: '8. Montagem da Proposta', order: 7 },
  { id: 'envio', titulo: '9. Envio / Sessão', order: 8 },
  { id: 'pos-sessao', titulo: '10. Pós-Sessão (Habilitação/Recursos)', order: 9 },
  { id: 'adjudicado', titulo: '11. Adjudicado / Homologado', order: 10 },
  { id: 'execucao', titulo: '12. Execução (Empenhos & NF)', order: 11 },
  { id: 'financeiro', titulo: '13. Financeiro (Recebimento)', order: 12 },
  { id: 'concluido', titulo: '14. Concluído', order: 13 },
  { id: 'arquivado', titulo: '15. Arquivado / Perdido', order: 14 },
];

class KanbanRepository {
    private getCardsCollectionRef() {
        return collection(firestore, 'clientDemands');
    }
    private getColumnsCollectionRef() {
        return collection(firestore, 'kanbanColumns');
    }

    // --- Cards ---
    async listCardsByCliente(clienteId: string): Promise<KanbanCard[]> {
        const q = query(this.getCardsCollectionRef(), where('clienteId', '==', clienteId));
        const snapshot = await getDocs(q).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: this.getCardsCollectionRef().path, operation: 'list' }));
            throw error;
        });
        return snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as KanbanCard);
    }

    async createCard(data: Omit<KanbanCard, 'id' | 'createdAt' | 'updatedAt'>): Promise<KanbanCard> {
        const now = new Date().toISOString();
        const docToCreate = { ...data, createdAt: now, updatedAt: now, movedAt: now };
        const docRef = await addDocumentNonBlocking(this.getCardsCollectionRef(), docToCreate);
        return { ...docToCreate, id: docRef.id };
    }
    
    async updateCard(id: string, data: Partial<Omit<KanbanCard, 'id'>>): Promise<void> {
        const docRef = doc(this.getCardsCollectionRef(), id);
        const dataToUpdate = { ...data, updatedAt: new Date().toISOString() };
        setDocumentNonBlocking(docRef, dataToUpdate, { merge: true });
    }
    
    async deleteCard(id: string): Promise<void> {
        deleteDocumentNonBlocking(doc(this.getCardsCollectionRef(), id));
    }
    
    async updateCardOrders(updates: { id: string; order: number; columnId?: string; movedAt?: string; }[]): Promise<void> {
        if (updates.length === 0) return;
        const batch = writeBatch(firestore);
        updates.forEach(update => {
            const docRef = doc(this.getCardsCollectionRef(), update.id);
            const dataToUpdate: any = { ...update, updatedAt: new Date().toISOString() };
            delete dataToUpdate.id; // Don't save ID in the document body
            batch.update(docRef, dataToUpdate);
        });
        await batch.commit();
    }
    
    // --- Columns ---
    async listColumnsByCliente(clienteId: string): Promise<KanbanColumn[]> {
        const q = query(this.getColumnsCollectionRef(), where('clienteId', '==', clienteId));
        const snapshot = await getDocs(q).catch(error => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: this.getColumnsCollectionRef().path, operation: 'list' }));
            throw error;
        });
        const columns = snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as KanbanColumn);
        
        if (columns.length === 0) {
            await this.createDefaultColumnsForClient(clienteId);
            const newSnapshot = await getDocs(q);
            const newColumns = newSnapshot.docs.map(d => ({ ...d.data(), id: d.id }) as KanbanColumn);
            return newColumns.sort((a,b) => a.order - b.order);
        }
        return columns.sort((a,b) => a.order - b.order);
    }

    async createDefaultColumnsForClient(clienteId: string): Promise<void> {
        const batch = writeBatch(firestore);
        const columnsColRef = this.getColumnsCollectionRef();
        DEFAULT_KANBAN_COLUMNS.forEach(colData => {
            const newColRef = doc(columnsColRef); 
            batch.set(newColRef, {
                titulo: colData.titulo,
                order: colData.order,
                clienteId: clienteId,
                isSystem: true
            });
        });
        await batch.commit();
    }

    async deleteAllForClient(clienteId: string, batch: WriteBatch): Promise<void> {
        const demandsQuery = query(this.getCardsCollectionRef(), where('clienteId', '==', clienteId));
        const demandsSnapshot = await getDocs(demandsQuery);
        demandsSnapshot.forEach(doc => batch.delete(doc.ref));

        const columnsQuery = query(this.getColumnsCollectionRef(), where('clienteId', '==', clienteId));
        const columnsSnapshot = await getDocs(columnsQuery);
        columnsSnapshot.forEach(doc => batch.delete(doc.ref));
    }
}

export const kanbanRepository = new KanbanRepository();
