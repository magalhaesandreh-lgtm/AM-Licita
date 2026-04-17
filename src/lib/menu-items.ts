import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  ClipboardList,
  FileBarChart2,
  Building2,
  Layers,
  BookUser,
  Target,
  HelpCircle,
  Briefcase,
  Users,
  Settings,
  Calendar,
} from 'lucide-react';

export interface MenuItem {
  path: string;
  title: string;
  icon: LucideIcon;
  exact?: boolean;
  adminOnly?: boolean;
}

export const menuItems: MenuItem[] = [
  { path: '/dashboard', title: 'Dashboard', icon: LayoutDashboard, exact: true },
  { path: '/precificacao-unificada', title: 'Certames (Planilha)', icon: ClipboardList },
  { path: '/agenda', title: 'Agenda', icon: Calendar },
  { path: '/assessoria', title: 'Assessoria', icon: Briefcase },
  { path: '/orcamentos', title: 'Orçamentos', icon: FileBarChart2 },
  { path: '/fornecedores', title: 'Fornecedores', icon: Building2 },
  { path: '/parametros', title: 'Categorias', icon: Layers },
  { path: '/relatorios', title: 'Relatórios', icon: BookUser },
  { path: '/metas', title: 'Metas', icon: Target },
  { path: '/configuracoes', title: 'Configurações', icon: Settings, adminOnly: true },
  { path: '/usuarios', title: 'Usuários', icon: Users, adminOnly: true },
  { path: '/ajuda', title: 'Ajuda', icon: HelpCircle },
];
