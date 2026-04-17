'use client';

import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { menuItems } from '@/lib/menu-items';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@/firebase';

export function SidebarNav() {
  const pathname = usePathname();
  const { profile } = useUser();
  const isAdmin = profile?.role === 'admin';

  return (
    <SidebarMenu>
      {menuItems.map((item) => {
        if (item.adminOnly && !isAdmin) {
            return null;
        }

        const isActive = item.exact 
          ? pathname === item.path 
          : pathname.startsWith(item.path);
          
        return (
          <SidebarMenuItem key={item.path}>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              tooltip={{ children: item.title }}
            >
              <Link href={item.path}>
                <item.icon />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
