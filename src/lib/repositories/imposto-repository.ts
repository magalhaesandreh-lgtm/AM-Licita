'use client';

import { doc, getDoc, updateDoc } from "firebase/firestore";
import { firestore } from '@/firebase/firestore-instance';
import { errorEmitter, FirestorePermissionError } from "@/firebase";

export interface ImpostoSettings {
  anexoProduto: 'I' | 'II' | 'III' | 'IV' | 'V';
  aliquotaProduto: number;
  anexoServico: 'I' | 'II' | 'III' | 'IV' | 'V';
  aliquotaServico: number;
}

class ImpostoRepository {
  private getDocRef() {
      return doc(firestore, 'settings', 'global');
  }

  async getSettings(): Promise<ImpostoSettings> {
    const docRef = this.getDocRef();
    const docSnap = await getDoc(docRef).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'get' }));
        throw error;
    });
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        anexoProduto: data.anexoProduto || 'I',
        aliquotaProduto: data.aliquotaProduto || 4.5,
        anexoServico: data.anexoServico || 'III',
        aliquotaServico: data.aliquotaServico || 6.0,
      };
    }
    // Return default values if the document doesn't exist
    return {
      anexoProduto: 'I',
      aliquotaProduto: 4.5,
      anexoServico: 'III',
      aliquotaServico: 6.0,
    };
  }

  async saveSettings(settings: Partial<ImpostoSettings>): Promise<void> {
    const docRef = this.getDocRef();
    await updateDoc(docRef, settings);
  }
}

export const impostoRepository = new ImpostoRepository();
