'use client';

import { collection, doc, getDocs, query, where, setDoc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import type { Pendencia } from '@/lib/models';
import { errorEmitter, FirestorePermissionError } from '@/firebase';

export type NovaPendencia = Omit<Pendencia, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'origem' | 'prioridade'> &
  Partial<Pick<Pendencia, 'status' | 'origem' | 'prioridade'>>;

class PendenciaRepository {
  private col() {
    return collection(firestore, 'pendencias');
  }

  async list(): Promise<Pendencia[]> {
    const snapshot = await getDocs(this.col()).catch(error => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'pendencias', operation: 'list' }));
      throw error;
    });
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as Pendencia);
  }

  /** Cria uma pendência. Se vier `chave` e já existir uma ABERTA com a mesma chave, atualiza em vez de duplicar. */
  async upsert(data: NovaPendencia): Promise<string> {
    const now = new Date().toISOString();
    const base = { status: 'ABERTA', origem: 'MANUAL', prioridade: 'MEDIA', prazo: null, ...data };
    if (data.chave) {
      const snap = await getDocs(query(this.col(), where('chave', '==', data.chave), where('status', '==', 'ABERTA')));
      if (!snap.empty) {
        const ref = snap.docs[0].ref;
        await updateDoc(ref, { ...base, updatedAt: now });
        return ref.id;
      }
    }
    const ref = await addDoc(this.col(), { ...base, createdAt: now, updatedAt: now });
    return ref.id;
  }

  async update(id: string, data: Partial<Omit<Pendencia, 'id'>>): Promise<void> {
    await setDoc(doc(this.col(), id), { ...data, updatedAt: new Date().toISOString() }, { merge: true });
  }

  async resolver(id: string, resolucao?: string): Promise<void> {
    const now = new Date().toISOString();
    await this.update(id, { status: 'RESOLVIDA', resolucao: resolucao || '', resolvidaEm: now });
  }

  async reabrir(id: string): Promise<void> {
    await this.update(id, { status: 'ABERTA', resolvidaEm: null });
  }

  /** Resolve pela chave (uso dos agentes). */
  async resolverPorChave(chave: string, resolucao?: string): Promise<number> {
    const snap = await getDocs(query(this.col(), where('chave', '==', chave), where('status', '==', 'ABERTA')));
    await Promise.all(snap.docs.map(d => this.resolver(d.id, resolucao)));
    return snap.size;
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(this.col(), id));
  }
}

export const pendenciaRepository = new PendenciaRepository();
