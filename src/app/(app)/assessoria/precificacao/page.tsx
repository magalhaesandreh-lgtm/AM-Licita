'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PrecificacaoAssessoriaPanel } from '../components/precificacao-assessoria';

export default function PrecificacaoAvulsaPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Precificar proposta de assessoria</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Informe os custos e a margem desejada; o sistema devolve o preço final que preserva o seu lucro.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/assessoria"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Link>
        </Button>
      </div>
      <PrecificacaoAssessoriaPanel cliente={null} />
    </div>
  );
}
