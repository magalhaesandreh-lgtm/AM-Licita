'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Search,
  BookOpen,
  HelpCircle,
  ChevronRight,
  ClipboardCopy,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

// --- Data for the page ---

const quickStartSteps = [
  {
    title: '1. Cadastrar um Certame',
    description: 'Inicie um novo processo de licitação, definindo os dados básicos como órgão, modalidade e data.',
    link: '/precificacao-unificada',
  },
  {
    title: '2. Adicionar Itens na Precificação',
    description: 'Liste todos os itens do certame, defina custos, categorias e analise a viabilidade de cada um.',
    link: '/precificacao-unificada',
  },
  {
    title: '3. Conferir Impostos e Margens',
    description: 'Ajuste as margens de lucro por categoria e as alíquotas de imposto para garantir a precisão dos cálculos.',
    link: '/parametros',
  },
  {
    title: '4. Criar Empenho(s) do Certame',
    description: 'Após ganhar um certame, crie um empenho e importe os itens com seus preços de venda definidos.',
    link: '/precificacao-unificada',
  },
  {
    title: '5. Lançar Nota Fiscal e Entrega',
    description: 'Gere notas fiscais a partir dos empenhos para registrar as entregas e o faturamento.',
    link: '/precificacao-unificada',
  },
  {
    title: '6. Ver Resultado Real em Metas',
    description: 'Acompanhe o lucro real, faturamento e o resultado final do mês na aba de execução das Metas.',
    link: '/metas',
  },
  {
    title: '7. Gerar PDF de Exequibilidade',
    description: 'Exporte relatórios profissionais da sua precificação para análise ou compartilhamento.',
    link: '/relatorios',
  },
];

const faqItems = [
  {
    question: 'Qual a diferença entre "Precificação" e "Execução"?',
    answer:
      'A "Precificação" (ou Planilha) é o planejamento, onde você estuda custos e define seu preço de venda para ganhar o certame. A "Execução" é a fase pós-vitória, onde você gerencia os Empenhos (pedidos do governo) e lança as Notas Fiscais (entregas), transformando o planejamento em lucro real.',
  },
  {
    question: 'Como funciona o imposto (produto vs serviço)?',
    answer:
      'O sistema permite configurar alíquotas diferentes para Produtos e Serviços na tela de Configurações, refletindo os diferentes anexos do Simples Nacional. Ao cadastrar um item na precificação, você o classifica como "Produto" ou "Serviço", e o sistema aplica a alíquota correta automaticamente.',
  },
  {
    question: 'O que é "congelar cálculos" e quando usar?',
    answer:
      'Congelar um certame trava todos os cálculos de precificação. Use isso após enviar sua proposta ou ganhar o certame para criar um "snapshot" (uma foto) dos preços e custos exatos daquele momento. Isso garante que seus relatórios e o cálculo do lucro real no empenho usem os valores históricos corretos, mesmo que você altere as configurações de margem ou custos fixos posteriormente.',
  },
  {
    question: 'Como o lucro real é calculado?',
    answer:
      'O lucro real é calculado no nível de cada item da Nota Fiscal. A fórmula é: Lucro do Item = (Preço de Venda Unitário * Quantidade) - (Custo Total Unitário * Quantidade) - (Valor do Imposto). O lucro da NF é a soma do lucro de todos os seus itens. O lucro do mês é a soma do lucro de todas as NFs daquele mês.',
  },
  {
    question: 'Como o saldo a receber é calculado?',
    answer:
      'Para cada empenho, o sistema calcula: Saldo a Receber = (Valor Total de todas as NFs lançadas) - (Valor Total de todas as NFs marcadas como "Pagas"). Esse valor é mostrado na Dashboard e na tela de execução do certame para facilitar o controle financeiro.',
  },
  {
    question: 'Como corrigir um item duplicado ou errado?',
    answer:
      'Se você cadastrou um item errado na Precificação, basta excluí-lo na própria planilha. Se o item já foi importado para um Empenho, você não pode mais excluí-lo da precificação. O correto é não lançar NFs para esse item no empenho e, se necessário, criar um novo item correto na precificação para futuros empenhos.',
  },
];

const glossaryTerms = [
  { term: 'Certame', definition: 'Qualquer processo de licitação ou compra pública.' },
  { term: 'Pregão', definition: 'Modalidade de licitação para bens e serviços comuns, onde a disputa é feita por lances.' },
  { term: 'Dispensa', definition: 'Contratação direta, sem licitação, permitida em casos específicos previstos em lei.' },
  { term: 'SRP', definition: 'Sistema de Registro de Preços. Uma "ata" onde seus preços ficam registrados para futuras compras do governo por um período (geralmente 1 ano).' },
  { term: 'Empenho', definition: 'A "ordem de compra" do governo. É o documento que formaliza a despesa e autoriza a entrega do produto ou serviço.' },
  { term: 'Contrato Único', definition: 'Um contrato que estabelece uma quantidade fixa a ser entregue, diferentemente do SRP que permite compras sob demanda.' },
  { term: 'Nota Fiscal', definition: 'O documento que comprova a venda e a entrega. É a base para o cálculo do faturamento e do lucro real.' },
  { term: 'Exequibilidade', definition: 'Análise para verificar se o preço proposto é viável e cobre todos os custos, impostos e ainda gera lucro.' },
  { term: 'SICAF', definition: 'Sistema de Cadastramento Unificado de Fornecedores, onde a empresa mantém seus dados e habilitação para participar de licitações.' },
  { term: 'UASG/UG', definition: 'Códigos que identificam a unidade do governo que está realizando a compra.' },
];

export default function AjudaPage() {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [diagnosticsText, setDiagnosticsText] = React.useState('');
  const { toast } = useToast();

  React.useEffect(() => {
    // This code runs only on the client, after hydration, preventing mismatches.
    const diagnostics = {
      appVersion: '1.0.0-MVP',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };
    const text = `
--- System Diagnostics ---
App Version: ${diagnostics.appVersion}
Timestamp: ${diagnostics.timestamp}
User Agent: ${diagnostics.userAgent}
Current Page: ${diagnostics.url}
-------------------------
    `;
    setDiagnosticsText(text.trim());
  }, []); // Empty dependency array ensures this runs only once on mount.

  const handleCopyDiagnostics = () => {
    if (!diagnosticsText) return;
    navigator.clipboard.writeText(diagnosticsText);
    toast({
      title: 'Diagnóstico copiado!',
      description: 'As informações do sistema foram copiadas para a área de transferência.',
    });
  };
  
  const lowerCaseSearchTerm = searchTerm.toLowerCase();

  const filteredFaq = faqItems.filter(
    (item) =>
      item.question.toLowerCase().includes(lowerCaseSearchTerm) ||
      item.answer.toLowerCase().includes(lowerCaseSearchTerm)
  );

  const filteredGlossary = glossaryTerms.filter(
    (item) =>
      item.term.toLowerCase().includes(lowerCaseSearchTerm) ||
      item.definition.toLowerCase().includes(lowerCaseSearchTerm)
  );

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-3xl">
            <HelpCircle className="h-8 w-8 text-primary" />
            Ajuda
          </CardTitle>
          <CardDescription>
            Guia rápido de uso do AM Gestão de Licitações.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar na ajuda..."
              className="w-full rounded-lg bg-background pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight mb-4">Comece por aqui: O Fluxo Essencial</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickStartSteps.map((step) => (
            <Card key={step.title} className="flex flex-col">
              <CardHeader>
                <CardTitle>{step.title}</CardTitle>
                <CardDescription>{step.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button asChild variant="secondary" className="w-full">
                  <Link href={step.link}>
                    Abrir tela <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight mb-4">Perguntas Frequentes (FAQ)</h2>
        <Card>
          <CardContent className="p-0">
            <Accordion type="single" collapsible className="w-full">
              {filteredFaq.length > 0 ? (
                filteredFaq.map((item) => (
                  <AccordionItem value={item.question} key={item.question}>
                    <AccordionTrigger className="px-6 text-left hover:no-underline">{item.question}</AccordionTrigger>
                    <AccordionContent className="px-6">
                      <p className="text-muted-foreground">{item.answer}</p>
                    </AccordionContent>
                  </AccordionItem>
                ))
              ) : (
                <p className="p-6 text-center text-muted-foreground">Nenhum resultado encontrado para "{searchTerm}".</p>
              )}
            </Accordion>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight mb-4">Glossário B2G (Business-to-Government)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGlossary.length > 0 ? (
            filteredGlossary.map((item) => (
              <Card key={item.term}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-primary" />
                    {item.term}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.definition}</p>
                </CardContent>
              </Card>
            ))
            ) : (
                <p className="p-6 text-center text-muted-foreground md:col-span-2 lg:col-span-3">Nenhum resultado encontrado para "{searchTerm}".</p>
            )}
        </div>
      </section>
      
      <section>
        <h2 className="text-2xl font-semibold tracking-tight mb-4">Contato e Suporte</h2>
        <Card>
            <CardHeader>
                <CardTitle>Contato / Suporte</CardTitle>
                <CardDescription>Se precisar de suporte, registre a ocorrência e print do erro. Use o botão abaixo para copiar detalhes técnicos que podem ajudar no diagnóstico.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button onClick={handleCopyDiagnostics}>
                    <ClipboardCopy className="mr-2 h-4 w-4" />
                    Copiar Diagnóstico do Sistema
                </Button>
            </CardContent>
        </Card>
      </section>

    </div>
  );
}
