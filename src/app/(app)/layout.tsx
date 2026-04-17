
'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { Loader2, LogOut } from 'lucide-react';

import { Header } from '@/components/layout/header';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useBranding } from '@/hooks/use-branding';
import { useAuth, useUser } from '@/firebase';
import { LogoAm } from '@/components/logo-am';


function AppContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Using pathname as a key ensures that the entire page content is re-mounted
  // when navigating, which prevents 'static' hydration issues after router.push
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-background">
      <Header />
      <main key={pathname} className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto h-full">{children}</div>
      </main>
    </div>
  );
}

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const branding = useBranding();
  const { user, isUserLoading, userError } = useUser();
  const auth = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace('/login');
    }
  }, [user, isUserLoading, router]);

  const handleForceLogout = async () => {
    if (!auth) return;
    await signOut(auth);
    router.replace('/login');
  };

  if (isUserLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (userError) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-destructive">Ocorreu um Erro</CardTitle>
            <CardDescription>
              Não foi possível carregar os dados da sua conta. Isso pode ser um problema temporário de permissão ou uma sessão dessincronizada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              A melhor solução é sair e fazer o login novamente para garantir que sua sessão seja atualizada.
            </p>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={handleForceLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair e tentar novamente
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!user) {
     return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }


  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-2">
              <LogoAm className="h-10 w-10" />
              <div className="flex flex-col">
                <span className="text-lg font-semibold tracking-tight text-sidebar-foreground">
                  {branding.appName}
                </span>
                <span className="text-xs text-sidebar-foreground/70">
                  de Licitações
                </span>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarNav />
          </SidebarContent>
        </Sidebar>
        <AppContent>{children}</AppContent>
      </div>
    </SidebarProvider>
  );
}
