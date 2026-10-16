'use client';

/**
 * Ponte dos agentes (equipe Claude) com o AM Gestão.
 *
 * Expõe `window.amGestao` (e `window.amPendencias`, por compatibilidade) somente
 * enquanto há usuário logado. Os agentes operam pelo navegador, com a sessão e as
 * permissões do próprio André. Exclusão liberada por André (07/10/2026); antes de excluir
 * em lote, os agentes salvam a exportação completa (`exportar()`) no computador.
 */
import * as React from 'react';
import { useUser } from '@/firebase';
import type { Certidao, CobrancaAssessoria, Empenho, NotaFiscal } from '@/lib/models';
import { certameUnificadoRepository } from '@/lib/repositories/certame-unificado-repository';
import { empenhoRepository } from '@/lib/repositories/empenho-repository';
import { nfRepository } from '@/lib/repositories/nf-repository';
import { certidaoRepository } from '@/lib/repositories/certidao-repository';
import { cobrancaRepository } from '@/lib/repositories/cobranca-repository';
import { pendenciaRepository, type NovaPendencia } from '@/lib/repositories/pendencia-repository';
import { eventRepository } from '@/lib/repositories/event-repository';
import { montarResumo } from '@/lib/agent/resumo';

export const PENDENCIAS_ALTERADAS = 'am:pendencias-alteradas';

const avisar = () => window.dispatchEvent(new Event(PENDENCIAS_ALTERADAS));

function criarApi() {
  const pendencias = {
    listar: async (status: 'ABERTA' | 'RESOLVIDA' | 'TODAS' = 'ABERTA') => {
      const todos = await pendenciaRepository.list();
      return status === 'TODAS' ? todos : todos.filter(p => p.status === status);
    },
    criar: async (dados: NovaPendencia) => {
      const id = await pendenciaRepository.upsert({ origem: 'AGENTE', ...dados });
      avisar();
      return id;
    },
    resolver: async (chaveOuId: string, resolucao?: string) => {
      let n = await pendenciaRepository.resolverPorChave(chaveOuId, resolucao);
      if (n === 0 && (await pendenciaRepository.exists(chaveOuId))) {
        await pendenciaRepository.resolver(chaveOuId, resolucao);
        n = 1;
      }
      avisar();
      return n;
    },
    excluir: async (id: string) => {
      await pendenciaRepository.delete(id);
      avisar();
    },
  };

  const certames = {
    listar: () => certameUnificadoRepository.list(),
    obter: (id: string) => certameUnificadoRepository.getById(id),
    atualizar: (id: string, dados: Record<string, unknown>) => certameUnificadoRepository.update(id, dados as any),
    /** Exclui o certame com todos os seus empenhos e NFs e sincroniza a agenda. */
    excluir: async (id: string) => {
      await certameUnificadoRepository.delete(id);
      try { await eventRepository.syncEventsFromCertames(); } catch { /* agenda é recalculada na próxima abertura */ }
    },
  };

  const empenhos = {
    listar: (certameId: string) => empenhoRepository.list(certameId),
    criar: (certameId: string, dados: Omit<Empenho, 'id' | 'createdAt' | 'updatedAt' | 'nfs'>) =>
      empenhoRepository.add(certameId, dados),
    atualizar: (certameId: string, empenhoId: string, dados: Partial<Omit<Empenho, 'id' | 'nfs'>>) =>
      empenhoRepository.update(certameId, empenhoId, dados),
    recalcularSaldos: (certameId: string, empenhoId: string) => empenhoRepository.recalculateSaldos(certameId, empenhoId),
    excluir: (certameId: string, empenhoId: string) => empenhoRepository.delete(certameId, empenhoId),
  };

  const nfs = {
    listar: (certameId: string, empenhoId: string) => nfRepository.list(certameId, empenhoId),
    lancar: async (certameId: string, empenhoId: string, dados: Omit<NotaFiscal, 'id' | 'createdAt' | 'updatedAt'>) => {
      const nf = await nfRepository.add(certameId, empenhoId, dados);
      await empenhoRepository.recalculateSaldos(certameId, empenhoId);
      return nf;
    },
    atualizar: async (certameId: string, empenhoId: string, nfId: string, dados: Partial<Omit<NotaFiscal, 'id'>>) => {
      await nfRepository.update(certameId, empenhoId, nfId, dados);
      await empenhoRepository.recalculateSaldos(certameId, empenhoId);
    },
    marcarPaga: (certameId: string, empenhoId: string, nfId: string, dataPagamentoISO: string) =>
      nfRepository.update(certameId, empenhoId, nfId, { pago: true, dataPagamentoISO }),
    excluir: async (certameId: string, empenhoId: string, nfId: string) => {
      await nfRepository.delete(certameId, empenhoId, nfId);
      await empenhoRepository.recalculateSaldos(certameId, empenhoId);
    },
  };

  const certidoes = {
    listar: () => certidaoRepository.list(),
    criar: (dados: Omit<Certidao, 'id' | 'createdAt' | 'updatedAt'>) => certidaoRepository.create(dados),
    atualizar: (id: string, dados: Partial<Omit<Certidao, 'id'>>) => certidaoRepository.update(id, dados),
    excluir: (id: string) => certidaoRepository.delete(id),
  };

  const cobrancas = {
    listar: () => cobrancaRepository.list(),
    criar: (dados: Omit<CobrancaAssessoria, 'id' | 'createdAt' | 'updatedAt'>) => cobrancaRepository.create(dados),
    atualizar: (id: string, dados: Partial<Omit<CobrancaAssessoria, 'id'>>) => cobrancaRepository.update(id, dados),
    excluir: (id: string) => cobrancaRepository.delete(id),
  };

  /** Cópia completa (certames com empenhos e NFs, certidões, cobranças, pendências) para backup. */
  const exportar = async () => {
    const lista = await certameUnificadoRepository.list();
    const certamesCompletos = [];
    for (const c of lista) {
      let emps: Empenho[] = [];
      try { emps = await empenhoRepository.list(c.id); } catch { /* sem empenhos */ }
      certamesCompletos.push({ ...c, empenhos: emps });
    }
    return {
      exportadoEm: new Date().toISOString(),
      certames: certamesCompletos,
      certidoes: await certidaoRepository.list(),
      cobrancas: await cobrancaRepository.list(),
      pendencias: await pendenciaRepository.list(),
    };
  };

  /**
   * Visão consolidada para cobrança diária: entregas de empenho (prazo e saldo),
   * NFs a receber, certidões vencendo e pendências abertas.
   */
  const resumo = async (diasAlerta = 7) => {
    const certames = await certameUnificadoRepository.list();
    const empenhosPorCertame: Record<string, Empenho[] | undefined> = {};
    for (const c of certames) {
      if (c.status === 'PERDIDO' || c.status === 'CANCELADO') continue;
      try {
        empenhosPorCertame[c.id] = await empenhoRepository.list(c.id);
      } catch {
        /* sem acesso a este certame: é ignorado no resumo */
      }
    }
    return montarResumo(
      { certames, empenhosPorCertame, certidoes: await certidaoRepository.list(), pendencias: await pendenciaRepository.list() },
      diasAlerta
    );
  };

  return { versao: 2, pendencias, certames, empenhos, nfs, certidoes, cobrancas, resumo, exportar };
}

export function AgentBridge() {
  const { user } = useUser();

  React.useEffect(() => {
    if (!user) return;
    const api = criarApi();
    const w = window as any;
    w.amGestao = api;
    w.amPendencias = api.pendencias;
    return () => {
      delete w.amGestao;
      delete w.amPendencias;
    };
  }, [user]);

  return null;
}
