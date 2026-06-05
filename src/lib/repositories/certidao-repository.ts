'use client';

import { collection, getDocs, doc, query, orderBy } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import type { Certidao } from '@/lib/models';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking, errorEmitter, FirestorePermissionError } from '@/firebase';

class CertidaoRepository {
  private getCollectionRef() {
    return collection(firestore, 'certidoes');
  }

  async list(): Promise<Certidao[]> {
    const colRef = this.getCollectionRef();
    const q = query(colRef, orderBy('dataVencimentoISO', 'asc'));
    const snapshot = await getDocs(q).catch(error => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: colRef.path, operation: 'list' }));
      throw error;
    });
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as Certidao);
  }

  async create(data: Omit<Certidao, 'id' | 'createdAt' | 'updatedAt'>): Promise<Certidao> {
    const docToCreate = { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const docRef = await addDocumentNonBlocking(this.getCollectionRef(), docToCreate);
    return { ...docToCreate, id: docRef.id };
  }

  async update(id: string, data: Partial<Omit<Certidao, 'id'>>): Promise<void> {
    const docRef = doc(this.getCollectionRef(), id);
    const dataToUpdate = { ...data, updatedAt: new Date().toISOString() };
    setDocumentNonBlocking(docRef, dataToUpdate, { merge: true });
  }

  async delete(id: string): Promise<void> {
    const docRef = doc(this.getCollectionRef(), id);
    deleteDocumentNonBlocking(docRef);
  }
}

export const certidaoRepository = new CertidaoRepository();
