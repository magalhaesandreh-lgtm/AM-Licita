
'use client';

export interface BaseEntity {
  id: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface Profile extends BaseEntity {
    uid: string;
    nome: string;
    displayName?: string;
    cargo?: string;
    email: string;
    telefone?: string;
    companyName?: string;
    location?: string;
    role: 'admin' | 'user';
    ativo: boolean;
    photoURL?: string;
}

export interface CertameUnificado extends BaseEntity {
  empresaDestinoId?: string;
  empresaDestinoNome?: string;
  orgao: string;
  modalidade: string;
  numeroAno: string;
  processo?: string;
  uasgUg?: string;
  plataforma?: string;
  dataSessaoISO: string;
  horaSessao: string;
  sessaoAt?: string;
  inicioVigencia?: string;
  fimVigencia?: string;
  objetoResumo?: string;
  observacoes?: string;
  status: 'EM_ANDAMENTO' | 'GANHO' | 'PERDIDO' | 'CANCELADO';
  congelado: boolean;
  isRetroativo: boolean;
  orcamentoSigiloso: boolean;
  itens: ItemPrecificacao[];
  empenhos: Empenho[];
  ajustesLotes?: Record<number, {
    valorFinal: number;
    aplicadoEm: string;
    aplicadoPor: string;
    modo: string;
  }>;
}

export interface ItemPrecificacao {
    id: string;
    itemNumero: number;
    loteNumero?: number;
    descricao: string;
    unidade: string;
    qtd: number;
    categoriaId: string;
    fornecedorId?: string;
    marca?: string;
    modelo?: string;
    linkProduto?: string;
    custoUnitBase: number;
    freteUnitario: number;
    custoFixoRateadoUnit: number;
    margemManualPct?: number;
    tipoItem: 'PRODUTO' | 'SERVICO';
    anexoSimples: 'I' | 'II' | 'III' | 'IV' | 'V';
    aliquotaPct: number;
    precoReferencia?: number;
    precoFinalVendidoReal?: number;
    precoAnteriorAjusteLote?: number;
    status: 'PENDENTE' | 'GANHO' | 'PERDIDO';
    // Legacy fields mapped for safety
    lucroReal?: number;
    margemRealPct?: number;
    metrics?: any;
}

export interface Empenho extends BaseEntity {
    numeroEmpenho: string;
    orgao: string;
    dataSolicitacaoISO: string;
    prazoEntregaDias: number;
    tipoEmpenho: 'SRP' | 'CONTRATO_UNICO' | 'ENTREGA_TOTAL' | 'OUTRO';
    statusEntrega: 'NAO_INICIADO' | 'PARCIAL' | 'CONCLUIDO' | 'ATRASADO';
    statusFinanceiro: 'PENDENTE' | 'FATURADO' | 'PARCIAL' | 'PAGO';
    itens: EmpenhoItem[];
    nfs: NotaFiscal[];
}

export interface EmpenhoItem {
    id: string;
    precificacaoItemId: string;
    descricaoSnapshot: string;
    unidadeSnapshot: string;
    precoVendaUnitSnapshot: number;
    custoUnitSnapshot: number;
    lucroUnitSnapshot: number;
    qtdEmpenhada: number;
    qtdEntregue: number;
    qtdSaldo: number;
}

export interface NotaFiscal extends BaseEntity {
    numeroNF: string;
    dataNFISO: string;
    dataEntregaISO: string;
    pago: boolean;
    dataPagamentoISO?: string;
    itens: NotaFiscalItem[];
}

export interface NotaFiscalItem {
    id: string;
    empenhoItemId: string;
    qtdNestaNF: number;
    dataEntregaISO?: string;
}

export interface Fornecedor extends BaseEntity {
    nomeFantasia: string;
    razaoSocial?: string;
    cnpj?: string;
    telefone?: string;
    email?: string;
    cidade?: string;
    uf?: string;
    observacoes?: string;
}

export interface Produto extends BaseEntity {
    descricao: string;
    categoriaId: string;
    unidade: string;
    precoBase: number;
    marca?: string;
    modelo?: string;
    linkProduto?: string;
    fornecedorId?: string;
    observacoes?: string;
    preferido?: boolean;
}

export interface Categoria extends BaseEntity {
    nome: string;
    margemPadraoPercent: number;
    ativo: boolean;
}

export interface CustoFixo extends BaseEntity {
    descricao: string;
    valorMensal: number;
    ativo: boolean;
}

export interface CustoVariavel extends BaseEntity {
    descricao: string;
    tipoRateio: 'PERCENT_CERTAME' | 'VALOR_CERTAME';
    valor: number;
    ativo: boolean;
}

export interface Cotacao extends BaseEntity {
    produtoId: string;
    dataCotacao: string;
    precoCotado: number;
    fornecedorId?: string;
    freteCotado?: number;
    observacoes?: string;
}

export interface CobrancaAssessoria extends BaseEntity {
  clienteId: string;
  competenciaMes: number;
  competenciaAno: number;
  valor: number;
  status: 'PENDENTE' | 'PAGO' | 'ATRASADO';
  tipo: 'MENSALIDADE' | 'EXITO';
  dataPagamento?: string;
  empenhoId?: string;
  percentualAplicado?: number;
  valorBase?: number;
  regraAplicada?: string;
}

export interface AgendaEvent extends BaseEntity {
  type: "CERTAME_SESSION";
  certameId: string;
  clienteId?: string;
  title: string;
  startAt: any;
  endAt?: any;
  status: "ACTIVE" | "CANCELLED";
  source: "SYSTEM" | "USER";
}

export interface NotificationRule extends BaseEntity {
  userId: string;
  timezone: string;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string;
  reminderEnabled: boolean;
  reminderMinutesBefore: number;
  channels: { inApp: boolean, email: boolean };
}

export interface Notification extends BaseEntity {
  userId: string;
  eventId: string;
  type: "DAILY_DIGEST" | "EVENT_REMINDER";
  channel: "IN_APP" | "EMAIL";
  title: string;
  body: string;
  scheduledFor: any;
  sentAt?: any;
  readAt?: any;
  status: "SCHEDULED" | "SENT" | "FAILED" | "CANCELLED";
  idempotencyKey: string;
}

export interface KanbanColumn extends BaseEntity {
  titulo: string;
  order: number;
  clienteId: string;
  isSystem: boolean;
}

export interface KanbanCard extends BaseEntity {
  clienteId: string;
  columnId: string;
  titulo: string;
  descricao?: string;
  prioridade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
  tipo: 'PROSPECCAO' | 'DOCUMENTACAO' | 'PRECIFICACAO' | 'DISPUTA' | 'RECURSO' | 'EXECUCAO' | 'FINANCEIRO' | 'SUPORTE';
  prazo?: string;
  order: number;
  movedAt: string;
  checklist?: { id: string; texto: string; concluido: boolean }[];
  vinculos?: {
    certameId?: string;
    empenhoId?: string;
  };
}

export interface ClienteAssessoria extends BaseEntity {
  nomeFantasia: string;
  razaoSocial?: string;
  cnpj?: string;
  cidadeUf?: string;
  contatoNome?: string;
  telefone?: string;
  email?: string;
  observacoes?: string;
  statusAtivo: boolean;
  vinculo?: VinculoAssessoria;
}

export interface VinculoAssessoria {
  tipoVinculo: 'MENSAL' | 'EXITO' | 'HIBRIDO' | 'POR_PROCESSO';
  mensalidade?: number;
  diaVencimento?: number;
  inicio?: string;
  fim?: string;
  observacoes?: string;
}

export interface MetasConfig {
  salarioDesejado: number;
  lucroAlvoEmpresa: number;
  lucroMedioPercentManual: number;
}

export interface ConfiguracoesGerais {
  appName: string;
  themeDefault: string;
  fretePadraoPercent: number;
  faturamentoMensalPrevisto: number;
  metasControlamFaturamento: boolean;
  anexoProduto: 'I' | 'II' | 'III' | 'IV' | 'V';
  aliquotaProduto: number;
  anexoServico: 'I' | 'II' | 'III' | 'IV' | 'V';
  aliquotaServico: number;
  overheadPercentManual?: number | null;
}
