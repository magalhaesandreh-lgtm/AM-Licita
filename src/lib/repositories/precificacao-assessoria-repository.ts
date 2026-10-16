'use client';

import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import type { PrecificacaoAssessoria } from '@/lib/models';
import { errorEmitter, FirestorePermissionError } from '@/firebase';

function removeUndefined(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefined);
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (value !== undefined) (acc as any)[key] = removeUndefined(value);
    return acc;
  }, {} as any);
}

class PrecificacaoAssessoriaRepository {
  private col() {
    return collection(firestore, 'precificacoesAssessoria');
  }

  async list(): Promise<PrecificacaoAssessoria[]> {
    const snap = await getDocs(this.col()).catch(error => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'precificacoesAssessoria', operation: 'list' }));
      throw error;
    });
    return snap.docs
      .map(d => ({ ...d.data(), id: d.id }) as PrecificacaoAssessoria)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  async create(data: Omit<PrecificacaoAssessoria, 'id' | 'createdAt' | 'updatedAt'>): Promise<PrecificacaoAssessoria> {
    const now = new Date().toISOString();
    const docToCreate = { ...removeUndefined(data), createdAt: now, updatedAt: now };
    const ref = await addDoc(this.col(), docToCreate);
    return { ...docToCreate, id: ref.id };
  }

  async update(id: string, data: Partial<Omit<PrecificacaoAssessoria, 'id'>>): Promise<void> {
    await updateDoc(doc(this.col(), id), { ...removeUndefined(data), updatedAt: new Date().toISOString() });
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(this.col(), id));
  }
}

export const precificacaoAssessoriaRepository = new PrecificacaoAssessoriaRepository();
