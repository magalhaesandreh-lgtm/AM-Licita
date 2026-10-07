'use client';

/**
 * Ponte dos agentes (equipe Claude) com o AM Gestão.
 *
 * Expõe `window.amGestao` (e `window.amPendencias`, por compatibilidade) somente
 * enquanto há usuário logado. Os agentes operam pelo navegador, com a sessão e as
 * permissões do próprio André. Não há exclusão exposta: só leitura, criação e atualização.
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

export const PENDENCIAS_ALTERADAS = 'am:pendencias-alteradas';

const avisar = () => window.dispatchEvent(new Event(PENDENCIAS_ALTERADAS));

function hojeISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + (dias || 0));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function diasEntre(deISO: string, ateISO: string) {
  return Math.round((new Date(`${ateISO}T00:00:00`).getTime() - new Date(`${deISO}T00:00:00`).getTime()) / 86400000);
}

function valorEmpenho(e: Empenho) {
  return (e.itens || []).reduce((s, i) => s + (i.qtdEmpenhada || 0) * (i.precoVendaUnitSnapshot || 0), 0);
}

function valorNF(e: Empenho, nf: NotaFiscal) {
  return (nf.itens || []).reduce((s, ni) => {
    const item = (e.itens || []).find(i => i.id === ni.empenhoItemId);
    return s + (ni.qtdNestaNF || 0) * (item?.precoVendaUnitSnapshot || 0);
  }, 0);
}

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
      if (n === 0) {
        await pendenciaRepository.resolver(chaveOuId, resolucao);
        n = 1;
      }
      avisar();
      return n;
    },
  };

  const certames = {
    listar: () => certameUnificadoRepository.list(),
    obter: (id: string) => certameUnificadoRepository.getById(id),
    atualizar: (id: string, dados: Record<string, unknown>) => certameUnificadoRepository.update(id, dados as any),
  };

  const empenhos = {
    listar: (certameId: string) => empenhoRepository.list(certameId),
    criar: (certameId: string, dados: Omit<Empenho, 'id' | 'createdAt' | 'updatedAt' | 'nfs'>) =>
      empenhoRepository.add(certameId, dados),
    atualizar: (certameId: string, empenhoId: string, dados: Partial<Omit<Empenho, 'id' | 'nfs'>>) =>
      empenhoRepository.update(certameId, empenhoId, dados),
    recalcularSaldos: (certameId: string, empenhoId: string) => empenhoRepository.recalculateSaldos(certameId, empenhoId),
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
  };

  const certidoes = {
    listar: () => certidaoRepository.list(),
    criar: (dados: Omit<Certidao, 'id' | 'createdAt' | 'updatedAt'>) => certidaoRepository.create(dados),
    atualizar: (id: string, dados: Partial<Omit<Certidao, 'id'>>) => certidaoRepository.update(id, dados),
  };

  const cobrancas = {
    listar: () => cobrancaRepository.list(),
    criar: (dados: Omit<CobrancaAssessoria, 'id' | 'createdAt' | 'updatedAt'>) => cobrancaRepository.create(dados),
    atualizar: (id: string, dados: Partial<Omit<CobrancaAssessoria, 'id'>>) => cobrancaRepository.update(id, dados),
  };

  /**
   * Visão consolidada para cobrança diária: entregas de empenho (prazo e saldo),
   * NFs a receber, certidões vencendo e pendências abertas.
   */
  const resumo = async (diasAlerta = 7) => {
    const hoje = hojeISO();
    const lista = await certameUnificadoRepository.list();
    const entregas: any[] = [];
    const aReceber: any[] = [];

    for (const c of lista) {
      if (c.status === 'PERDIDO' || c.status === 'CANCELADO') continue;
      let emps: Empenho[] = [];
      try {
        emps = await empenhoRepository.list(c.id);
      } catch {
        continue;
      }
      for (const e of emps) {
        const prazo = e.dataSolicitacaoISO ? somarDias(e.dataSolicitacaoISO, e.prazoEntregaDias) : null;
        const saldoItens = (e.itens || []).filter(i => (i.qtdSaldo ?? i.qtdEmpenhada) > 0);
        if (e.statusEntrega !== 'CONCLUIDO' && saldoItens.length) {
          entregas.push({
            certameId: c.id,
            empenhoId: e.id,
            orgao: e.orgao || c.orgao,
            certame: `${c.modalidade} ${c.numeroAno}`,
            numeroEmpenho: e.numeroEmpenho,
            statusEntrega: e.statusEntrega,
            prazoEntrega: prazo,
            diasParaPrazo: prazo ? diasEntre(hoje, prazo) : null,
            valorEmpenho: valorEmpenho(e),
            itensComSaldo: saldoItens.map(i => ({ descricao: i.descricaoSnapshot, saldo: i.qtdSaldo ?? i.qtdEmpenhada, unidade: i.unidadeSnapshot })),
          });
        }
        for (const nf of e.nfs || []) {
          if (!nf.pago) {
            aReceber.push({
              certameId: c.id,
              empenhoId: e.id,
              nfId: nf.id,
              orgao: e.orgao || c.orgao,
              numeroEmpenho: e.numeroEmpenho,
              numeroNF: nf.numeroNF,
              dataNF: nf.dataNFISO,
              diasDesdeNF: nf.dataNFISO ? diasEntre(nf.dataNFISO.slice(0, 10), hoje) : null,
              valor: valorNF(e, nf),
            });
          }
        }
      }
    }

    const certs = await certidaoRepository.list();
    const certidoesVencendo = certs
      .map(ct => ({ id: ct.id, empresa: ct.empresaNome, nome: ct.nome, vencimento: ct.dataVencimentoISO, dias: diasEntre(hoje, ct.dataVencimentoISO.slice(0, 10)) }))
      .filter(ct => ct.dias <= diasAlerta * 2)
      .sort((a, b) => a.dias - b.dias);

    const pend = (await pendenciaRepository.list()).filter(p => p.status === 'ABERTA');

    return {
      hoje,
      entregas: entregas.sort((a, b) => (a.diasParaPrazo ?? 9999) - (b.diasParaPrazo ?? 9999)),
      aReceber: aReceber.sort((a, b) => (b.diasDesdeNF ?? 0) - (a.diasDesdeNF ?? 0)),
      certidoesVencendo,
      pendenciasAbertas: pend.length,
      pendenciasVencidas: pend.filter(p => p.prazo && p.prazo.slice(0, 10) < hoje).length,
    };
  };

  return { versao: 1, pendencias, certames, empenhos, nfs, certidoes, cobrancas, resumo };
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
