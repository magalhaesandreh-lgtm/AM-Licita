/**
 * Cálculo do resumo de cobrança diária (entregas, NFs a receber, certidões e pendências).
 * Função pura: usada pela ponte do navegador (agent-bridge) e pela API dos agentes
 * (/api/agente/resumo), para que as duas deem exatamente o mesmo resultado.
 */
import type { Certidao, CertameUnificado, Empenho, NotaFiscal, Pendencia } from '@/lib/models';

export function hojeISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + (dias || 0));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function diasEntre(deISO: string, ateISO: string): number {
  return Math.round((new Date(`${ateISO}T00:00:00`).getTime() - new Date(`${deISO}T00:00:00`).getTime()) / 86400000);
}

export function valorEmpenho(e: Empenho): number {
  return (e.itens || []).reduce((s, i) => s + (i.qtdEmpenhada || 0) * (i.precoVendaUnitSnapshot || 0), 0);
}

export function valorNF(e: Empenho, nf: NotaFiscal): number {
  return (nf.itens || []).reduce((s, ni) => {
    const item = (e.itens || []).find(i => i.id === ni.empenhoItemId);
    return s + (ni.qtdNestaNF || 0) * (item?.precoVendaUnitSnapshot || 0);
  }, 0);
}

export interface DadosResumo {
  certames: CertameUnificado[];
  /** Empenhos (com nfs) de cada certame, indexados pelo id do certame. Certame ausente = sem acesso/erro, é ignorado. */
  empenhosPorCertame: Record<string, Empenho[] | undefined>;
  certidoes: Certidao[];
  pendencias: Pendencia[];
}

export function montarResumo(dados: DadosResumo, diasAlerta = 7) {
  const hoje = hojeISO();
  const entregas: any[] = [];
  const aReceber: any[] = [];

  for (const c of dados.certames) {
    if (c.status === 'PERDIDO' || c.status === 'CANCELADO') continue;
    const emps = dados.empenhosPorCertame[c.id];
    if (!emps) continue;
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

  const certidoesVencendo = dados.certidoes
    .map(ct => ({ id: ct.id, empresa: ct.empresaNome, nome: ct.nome, vencimento: ct.dataVencimentoISO, dias: diasEntre(hoje, ct.dataVencimentoISO.slice(0, 10)) }))
    .filter(ct => ct.dias <= diasAlerta * 2)
    .sort((a, b) => a.dias - b.dias);

  const pend = dados.pendencias.filter(p => p.status === 'ABERTA');

  return {
    hoje,
    entregas: entregas.sort((a, b) => (a.diasParaPrazo ?? 9999) - (b.diasParaPrazo ?? 9999)),
    aReceber: aReceber.sort((a, b) => (b.diasDesdeNF ?? 0) - (a.diasDesdeNF ?? 0)),
    certidoesVencendo,
    pendenciasAbertas: pend.length,
    pendenciasVencidas: pend.filter(p => p.prazo && p.prazo.slice(0, 10) < hoje).length,
  };
}
