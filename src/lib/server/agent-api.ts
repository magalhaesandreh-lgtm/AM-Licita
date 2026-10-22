import 'server-only';
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import type { CertameUnificado, Empenho, NotaFiscal, Pendencia } from '@/lib/models';
import { montarResumo } from '@/lib/agent/resumo';

/**
 * Regras de negócio da API dos agentes (/api/agente/*), com Firestore Admin.
 * Espelha o comportamento dos repositórios do navegador (certames, empenhos, NFs,
 * pendências), sem depender de navegador nem de sessão.
 */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const agora = () => new Date().toISOString();

function limpar<T extends Record<string, any>>(obj: T): T {
  // JSON não carrega undefined, mas campos de sistema não podem ser sobrescritos pelo corpo.
  const { id, createdAt, ...resto } = obj as any;
  void id;
  void createdAt;
  return resto as T;
}

function corpoObjeto(corpo: unknown): Record<string, any> {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw new ApiError(400, 'Corpo da requisição deve ser um objeto JSON.');
  }
  return corpo as Record<string, any>;
}

export interface Contexto {
  db: Firestore;
  metodo: string;
  /** segmentos da rota depois de /api/agente */
  rota: string[];
  query: URLSearchParams;
  corpo: unknown;
}

// ─────────────────────────── Pendências ───────────────────────────

async function listarPendencias(db: Firestore, status: string): Promise<Pendencia[]> {
  let q: FirebaseFirestore.Query = db.collection('pendencias');
  if (status !== 'TODAS') q = q.where('status', '==', status);
  const snap = await q.get();
  return snap.docs.map(d => ({ ...d.data(), id: d.id }) as Pendencia);
}

async function upsertPendencia(db: Firestore, dados: Record<string, any>): Promise<string> {
  const now = agora();
  if (!dados.titulo || !dados.funcionario) throw new ApiError(400, 'Informe funcionario e titulo.');
  const base = { status: 'ABERTA', origem: 'AGENTE', prioridade: 'MEDIA', prazo: null, ...limpar(dados) };
  const col = db.collection('pendencias');
  if (dados.chave) {
    // transação para não duplicar quando duas chamadas chegam juntas
    return db.runTransaction(async tx => {
      const snap = await tx.get(col.where('chave', '==', dados.chave).where('status', '==', 'ABERTA').limit(1));
      if (!snap.empty) {
        tx.update(snap.docs[0].ref, { ...base, updatedAt: now });
        return snap.docs[0].id;
      }
      const ref = col.doc();
      tx.set(ref, { ...base, createdAt: now, updatedAt: now });
      return ref.id;
    });
  }
  const ref = await col.add({ ...base, createdAt: now, updatedAt: now });
  return ref.id;
}

async function resolverPendencia(db: Firestore, chaveOuId: string, resolucao?: string): Promise<number> {
  const col = db.collection('pendencias');
  const now = agora();
  const porChave = await col.where('chave', '==', chaveOuId).where('status', '==', 'ABERTA').get();
  if (!porChave.empty) {
    await Promise.all(porChave.docs.map(d => d.ref.update({ status: 'RESOLVIDA', resolucao: resolucao || '', resolvidaEm: now, updatedAt: now })));
    return porChave.size;
  }
  const doc = await col.doc(chaveOuId).get();
  if (!doc.exists) return 0; // nunca cria documento fantasma
  await doc.ref.update({ status: 'RESOLVIDA', resolucao: resolucao || '', resolvidaEm: now, updatedAt: now });
  return 1;
}

// ─────────────────────────── Certames / empenhos / NFs ───────────────────────────

const certameRef = (db: Firestore, id: string) => db.collection('certames').doc(id);
const empenhoRef = (db: Firestore, c: string, e: string) => certameRef(db, c).collection('empenhos').doc(e);
const nfCol = (db: Firestore, c: string, e: string) => empenhoRef(db, c, e).collection('nfs');

async function listarNfs(db: Firestore, c: string, e: string): Promise<NotaFiscal[]> {
  const snap = await nfCol(db, c, e).get();
  return snap.docs
    .map(d => ({ ...d.data(), id: d.id }) as NotaFiscal)
    .sort((a, b) => new Date(b.dataNFISO).getTime() - new Date(a.dataNFISO).getTime());
}

async function listarEmpenhos(db: Firestore, c: string): Promise<Empenho[]> {
  const snap = await certameRef(db, c).collection('empenhos').get();
  const lista = await Promise.all(
    snap.docs.map(async d => {
      const data = d.data() as Partial<Empenho>;
      return { ...data, id: d.id, itens: data.itens || [], nfs: await listarNfs(db, c, d.id) } as Empenho;
    })
  );
  return lista.sort((a, b) => new Date(b.dataSolicitacaoISO).getTime() - new Date(a.dataSolicitacaoISO).getTime());
}

async function obterCertame(db: Firestore, id: string, comEmpenhos: boolean): Promise<CertameUnificado | null> {
  const doc = await certameRef(db, id).get();
  if (!doc.exists) return null;
  const base = { ...doc.data(), id: doc.id } as CertameUnificado;
  return comEmpenhos ? { ...base, empenhos: await listarEmpenhos(db, id) } : { ...base, empenhos: [] };
}

/** Mesma conta de EmpenhoRepository.recalculateSaldos: entregue = soma das NFs; saldo = empenhado − entregue. */
async function recalcularSaldos(db: Firestore, c: string, e: string): Promise<void> {
  const ref = empenhoRef(db, c, e);
  const snap = await ref.get();
  if (!snap.exists) return;
  const dados = snap.data() as Partial<Empenho>;
  if (!dados.itens || dados.itens.length === 0) return;
  const nfs = await listarNfs(db, c, e);
  let mudou = false;
  const novos = dados.itens.map(item => {
    const empenhada = item.qtdEmpenhada || 0;
    let entregue = 0;
    for (const nf of nfs) {
      const m = (nf.itens || []).find(i => i.empenhoItemId === item.id);
      if (m) entregue += m.qtdNestaNF || 0;
    }
    const saldo = empenhada - entregue;
    if (item.qtdEntregue !== entregue || item.qtdSaldo !== saldo) {
      mudou = true;
      return { ...item, qtdEntregue: entregue, qtdSaldo: saldo };
    }
    return item;
  });
  if (mudou) await ref.update({ itens: novos, updatedAt: agora() });
}

async function excluirRecursivo(db: Firestore, ref: DocumentReference): Promise<void> {
  // listDocuments + recursiveDelete cobre empenhos e NFs (subcoleções) em lotes.
  await db.recursiveDelete(ref);
}

async function exportar(db: Firestore) {
  const certamesSnap = await db.collection('certames').get();
  const certames = [];
  for (const d of certamesSnap.docs) {
    certames.push({ ...d.data(), id: d.id, empenhos: await listarEmpenhos(db, d.id) });
  }
  const todos = async (nome: string) => (await db.collection(nome).get()).docs.map(d => ({ ...d.data(), id: d.id }));
  return {
    exportadoEm: agora(),
    certames,
    certidoes: await todos('certidoes'),
    cobrancas: await todos('cobrancasAssessoria'),
    pendencias: await todos('pendencias'),
    clientes: await todos('clients'),
    custosClientes: await todos('custosClientesAssessoria'),
  };
}

async function resumo(db: Firestore, dias: number) {
  const certamesSnap = await db.collection('certames').get();
  const certames = certamesSnap.docs.map(d => ({ ...d.data(), id: d.id }) as CertameUnificado);
  const empenhosPorCertame: Record<string, Empenho[] | undefined> = {};
  await Promise.all(
    certames
      .filter(c => c.status !== 'PERDIDO' && c.status !== 'CANCELADO')
      .map(async c => {
        empenhosPorCertame[c.id] = await listarEmpenhos(db, c.id);
      })
  );
  const certidoes = (await db.collection('certidoes').get()).docs.map(d => ({ ...d.data(), id: d.id }) as any);
  const pendencias = await listarPendencias(db, 'TODAS');
  return montarResumo({ certames, empenhosPorCertame, certidoes, pendencias }, dias);
}

// ─────────────────────────── CRUD simples (certidões, cobranças, clientes) ───────────────────────────

const COLECOES_SIMPLES: Record<string, string> = {
  certidoes: 'certidoes',
  cobrancas: 'cobrancasAssessoria',
  clientes: 'clients',
  'custos-clientes': 'custosClientesAssessoria',
};

async function crudSimples(ctx: Contexto, nomeRota: string, resto: string[]) {
  const { db, metodo, corpo, query } = ctx;
  const col = db.collection(COLECOES_SIMPLES[nomeRota]);
  const id = resto[0];
  if (!id) {
    if (metodo === 'GET') {
      let q: FirebaseFirestore.Query = col;
      for (const [k, v] of query.entries()) q = q.where(k, '==', v === 'true' ? true : v === 'false' ? false : v);
      return (await q.get()).docs.map(d => ({ ...d.data(), id: d.id }));
    }
    if (metodo === 'POST') {
      const now = agora();
      const dados = limpar(corpoObjeto(corpo)) as Record<string, unknown>;
      // Custos do cliente: um documento por cliente, com o id igual ao id do cliente (a tela lê assim).
      if (nomeRota === 'custos-clientes') {
        const clienteId = typeof dados.clienteId === 'string' ? dados.clienteId.trim() : '';
        if (!clienteId) throw new ApiError(400, 'Informe clienteId.');
        await col.doc(clienteId).set({ ...dados, clienteId, createdAt: now, updatedAt: now });
        return { id: clienteId };
      }
      const ref = await col.add({ ...dados, createdAt: now, updatedAt: now });
      return { id: ref.id };
    }
    throw new ApiError(405, 'Método não permitido.');
  }
  const ref = col.doc(id);
  if (metodo === 'GET') {
    const d = await ref.get();
    if (!d.exists) throw new ApiError(404, 'Não encontrado.');
    return { ...d.data(), id: d.id };
  }
  if (metodo === 'PATCH') {
    if (!(await ref.get()).exists) throw new ApiError(404, 'Não encontrado.');
    await ref.update({ ...limpar(corpoObjeto(corpo)), updatedAt: agora() });
    return { ok: true };
  }
  if (metodo === 'DELETE') {
    if (!(await ref.get()).exists) throw new ApiError(404, 'Não encontrado.');
    await ref.delete();
    return { ok: true };
  }
  throw new ApiError(405, 'Método não permitido.');
}

// ─────────────────────────── Despacho ───────────────────────────

export const INDICE = {
  versao: 1,
  autenticacao: 'Authorization: Bearer <token>',
  rotas: [
    'GET    /api/agente/resumo?dias=7',
    'GET    /api/agente/exportar',
    'GET    /api/agente/pendencias?status=ABERTA|RESOLVIDA|TODAS',
    'POST   /api/agente/pendencias            (criar/atualizar por chave)',
    'POST   /api/agente/pendencias/resolver   {chave|id, resolucao}',
    'DELETE /api/agente/pendencias/:id',
    'GET    /api/agente/certames?completo=1   (sem empenhos por padrão)',
    'GET|PATCH|DELETE /api/agente/certames/:id',
    'GET|POST /api/agente/certames/:id/empenhos',
    'PATCH|DELETE /api/agente/certames/:id/empenhos/:eid',
    'POST   /api/agente/certames/:id/empenhos/:eid/recalcular',
    'GET|POST /api/agente/certames/:id/empenhos/:eid/nfs',
    'PATCH|DELETE /api/agente/certames/:id/empenhos/:eid/nfs/:nid',
    'POST   /api/agente/certames/:id/empenhos/:eid/nfs/:nid/pagar  {dataPagamentoISO}',
    'GET|POST|PATCH|DELETE /api/agente/{certidoes|cobrancas|clientes}[/:id]',
  ],
};

export async function despachar(ctx: Contexto): Promise<unknown> {
  const { db, metodo, rota, query, corpo } = ctx;
  const [recurso, a, b, c, d, e] = rota;

  if (!recurso) return INDICE;

  if (recurso === 'resumo' && metodo === 'GET') {
    return resumo(db, Number(query.get('dias') ?? 7) || 7);
  }
  if (recurso === 'exportar' && metodo === 'GET') return exportar(db);

  if (recurso === 'pendencias') {
    if (metodo === 'GET' && !a) return listarPendencias(db, (query.get('status') || 'ABERTA').toUpperCase());
    if (metodo === 'POST' && !a) return { id: await upsertPendencia(db, corpoObjeto(corpo)) };
    if (metodo === 'POST' && a === 'resolver') {
      const dados = corpoObjeto(corpo);
      const alvo = dados.chave || dados.id;
      if (!alvo) throw new ApiError(400, 'Informe chave ou id.');
      return { resolvidas: await resolverPendencia(db, String(alvo), dados.resolucao) };
    }
    if (metodo === 'DELETE' && a) {
      await db.collection('pendencias').doc(a).delete();
      return { ok: true };
    }
    throw new ApiError(405, 'Método não permitido.');
  }

  if (recurso in COLECOES_SIMPLES) return crudSimples(ctx, recurso, rota.slice(1));

  if (recurso === 'certames') {
    if (!a) {
      if (metodo !== 'GET') throw new ApiError(405, 'Método não permitido.');
      const snap = await db.collection('certames').get();
      const completo = query.get('completo') === '1';
      const lista = await Promise.all(
        snap.docs.map(async doc => {
          const base = { ...doc.data(), id: doc.id } as CertameUnificado;
          return completo ? { ...base, empenhos: await listarEmpenhos(db, doc.id) } : base;
        })
      );
      return lista.sort((x: any, y: any) => new Date(y.dataSessaoISO).getTime() - new Date(x.dataSessaoISO).getTime());
    }
    if (!b) {
      if (metodo === 'GET') {
        const cert = await obterCertame(db, a, true);
        if (!cert) throw new ApiError(404, 'Certame não encontrado.');
        return cert;
      }
      if (metodo === 'PATCH') {
        if (!(await certameRef(db, a).get()).exists) throw new ApiError(404, 'Certame não encontrado.');
        const { empenhos, ...dados } = corpoObjeto(corpo);
        void empenhos;
        await certameRef(db, a).update({ ...limpar(dados), updatedAt: agora() });
        return { ok: true };
      }
      if (metodo === 'DELETE') {
        if (!(await certameRef(db, a).get()).exists) throw new ApiError(404, 'Certame não encontrado.');
        await excluirRecursivo(db, certameRef(db, a));
        return { ok: true };
      }
      throw new ApiError(405, 'Método não permitido.');
    }
    if (b !== 'empenhos') throw new ApiError(404, 'Rota não encontrada.');

    if (!c) {
      if (metodo === 'GET') return listarEmpenhos(db, a);
      if (metodo === 'POST') {
        if (!(await certameRef(db, a).get()).exists) throw new ApiError(404, 'Certame não encontrado.');
        const now = agora();
        const { nfs, ...dados } = corpoObjeto(corpo);
        void nfs;
        const ref = await certameRef(db, a).collection('empenhos').add({ ...limpar(dados), createdAt: now, updatedAt: now });
        return { id: ref.id };
      }
      throw new ApiError(405, 'Método não permitido.');
    }
    if (!d) {
      if (metodo === 'PATCH') {
        if (!(await empenhoRef(db, a, c).get()).exists) throw new ApiError(404, 'Empenho não encontrado.');
        const { nfs, ...dados } = corpoObjeto(corpo);
        void nfs;
        await empenhoRef(db, a, c).update({ ...limpar(dados), updatedAt: agora() });
        return { ok: true };
      }
      if (metodo === 'DELETE') {
        if (!(await empenhoRef(db, a, c).get()).exists) throw new ApiError(404, 'Empenho não encontrado.');
        await excluirRecursivo(db, empenhoRef(db, a, c));
        return { ok: true };
      }
      throw new ApiError(405, 'Método não permitido.');
    }
    if (d === 'recalcular' && metodo === 'POST') {
      await recalcularSaldos(db, a, c);
      return { ok: true };
    }
    if (d !== 'nfs') throw new ApiError(404, 'Rota não encontrada.');

    if (!e) {
      if (metodo === 'GET') return listarNfs(db, a, c);
      if (metodo === 'POST') {
        if (!(await empenhoRef(db, a, c).get()).exists) throw new ApiError(404, 'Empenho não encontrado.');
        const now = agora();
        const ref = await nfCol(db, a, c).add({ ...limpar(corpoObjeto(corpo)), createdAt: now, updatedAt: now });
        await recalcularSaldos(db, a, c);
        return { id: ref.id };
      }
      throw new ApiError(405, 'Método não permitido.');
    }
    const nfRef = nfCol(db, a, c).doc(e);
    const acao = rota[6];
    if (acao === 'pagar' && metodo === 'POST') {
      const dados = corpoObjeto(corpo);
      if (!dados.dataPagamentoISO) throw new ApiError(400, 'Informe dataPagamentoISO.');
      if (!(await nfRef.get()).exists) throw new ApiError(404, 'NF não encontrada.');
      await nfRef.update({ pago: true, dataPagamentoISO: dados.dataPagamentoISO, updatedAt: agora() });
      return { ok: true };
    }
    if (metodo === 'PATCH') {
      if (!(await nfRef.get()).exists) throw new ApiError(404, 'NF não encontrada.');
      await nfRef.update({ ...limpar(corpoObjeto(corpo)), updatedAt: agora() });
      await recalcularSaldos(db, a, c);
      return { ok: true };
    }
    if (metodo === 'DELETE') {
      if (!(await nfRef.get()).exists) throw new ApiError(404, 'NF não encontrada.');
      await nfRef.delete();
      await recalcularSaldos(db, a, c);
      return { ok: true };
    }
    throw new ApiError(405, 'Método não permitido.');
  }

  throw new ApiError(404, 'Rota não encontrada. Consulte GET /api/agente.');
}
