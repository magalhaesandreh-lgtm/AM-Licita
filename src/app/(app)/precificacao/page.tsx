'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DeprecatedPrecificacaoPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the new unified page as it's the main entry point now.
    router.replace('/precificacao-unificada');
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <p className="text-foreground">Esta página foi substituída pela Precificação (Planilha). Redirecionando...</p>
    </div>
  );
}
