'use client';

import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import type { CustosClienteAssessoria } from '@/lib/models';
import { errorEmitter, FirestorePermissionError } from '@/firebase';

const COLECAO = 'custosClientesAssessoria';

function removeUndefined(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefined);
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (value !== undefined) (acc as any)[key] = removeUndefined(value);
    return acc;
  }, {} as any);
}

/** Completa campos ausentes para que os cálculos nunca recebam undefined/NaN. */
export function normalizarCustosCliente(dados: Partial<CustosClienteAssessoria> & { clienteId: string }): CustosClienteAssessoria {
  return {
    id: dados.id || dados.clienteId,
    clienteId: dados.clienteId,
    clienteNome: dados.clienteNome || '',
    faturamentoMensalPrevisto: Number(dados.faturamentoMensalPrevisto) || 0,
    overheadPercentManual: dados.overheadPercentManual ?? null,
    fretePadraoPercent: Number(dados.fretePadraoPercent) || 0,
    aliquotaProdutoPct: Number(dados.aliquotaProdutoPct) || 0,
    aliquotaServicoPct: Number(dados.aliquotaServicoPct) || 0,
    custosFixos: (dados.custosFixos || []).map(c => ({ ...c, valorMensal: Number(c.valorMensal) || 0, ativo: c.ativo !== false })),
    custosVariaveis: (dados.custosVariaveis || []).map(c => ({ ...c, valor: Number(c.valor) || 0, ativo: c.ativo !== false, certameId: c.certameId || null })),
    observacoes: dados.observacoes || '',
    createdAt: dados.createdAt,
    updatedAt: dados.updatedAt,
  };
}

class CustosClienteRepository {
  private col() {
    return collection(firestore, COLECAO);
  }

  async list(): Promise<CustosClienteAssessoria[]> {
    const snap = await getDocs(this.col()).catch(error => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: COLECAO, operation: 'list' }));
      throw error;
    });
    return snap.docs.map(d => normalizarCustosCliente({ ...(d.data() as any), id: d.id, clienteId: (d.data() as any).clienteId || d.id }));
  }

  async get(clienteId: string): Promise<CustosClienteAssessoria | null> {
    const ref = doc(this.col(), clienteId);
    const snap = await getDoc(ref).catch(error => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: ref.path, operation: 'get' }));
      throw error;
    });
    if (!snap.exists()) return null;
    return normalizarCustosCliente({ ...(snap.data() as any), id: snap.id, clienteId });
  }

  async save(clienteId: string, dados: Omit<CustosClienteAssessoria, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: any }): Promise<void> {
    const ref = doc(this.col(), clienteId);
    const agora = new Date().toISOString();
    const payload = removeUndefined({ ...dados, clienteId, createdAt: dados.createdAt || agora, updatedAt: agora });
    await setDoc(ref, payload).catch(error => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: ref.path, operation: 'write', requestResourceData: payload }));
      throw error;
    });
  }
}

export const custosClienteRepository = new CustosClienteRepository();
