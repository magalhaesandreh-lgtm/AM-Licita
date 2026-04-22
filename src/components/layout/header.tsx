'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { menuItems } from '@/lib/menu-items';
import { LogOut, User, PanelLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMemo } from 'react';
import { ThemeToggle } from '../theme-toggle';
import { useAuth, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';
import { UserProfileAvatar } from '../user-profile-avatar';
import { NotificationDropdown } from './notification-dropdown';

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { profile } = useUser();
  const { toggleSidebar } = useSidebar();

  const pageTitle = useMemo(() => {
    // Dynamic title for client detail page
    if (pathname.startsWith('/assessoria/')) {
        return "Painel do Cliente";
    }
    if (pathname.startsWith('/certames/')) {
        return "Detalhes do Certame";
    }
    if (pathname.startsWith('/perfil')) {
      return 'Meu Perfil';
    }
    if (pathname.startsWith('/agenda')) {
      return 'Agenda';
    }
    const activeItem = menuItems.find((item) => pathname.startsWith(item.path));
    return activeItem?.title || '';
  }, [pathname]);

  const handleLogout = async () => {
    if (!auth) return;
    await signOut(auth);
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b bg-card px-4 md:px-6">
      {/* This trigger is for mobile */}
      <SidebarTrigger className="flex md:hidden" />
      
      {/* This button is for desktop */}
      <Button
        variant="ghost"
        size="icon"
        className="hidden md:flex"
        onClick={toggleSidebar}
      >
        <PanelLeft />
        <span className="sr-only">Recolher/Expandir Menu</span>
      </Button>

      <h1 className="text-xl font-semibold md:text-2xl">{pageTitle}</h1>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <NotificationDropdown />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full">
              <UserProfileAvatar />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/perfil">
                <User className="mr-2" />
                <span>Perfil</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2" />
              <span>Sair</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
