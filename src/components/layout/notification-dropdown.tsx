'use client';

import * as React from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import {
  collection,
  query,
  where,
  limit,
} from 'firebase/firestore';

import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import type { Notification } from '@/lib/models';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { notificationRepository } from '@/lib/repositories/notification-repository';

function timeSince(date: Date) {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " anos atrás";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " meses atrás";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " dias atrás";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " horas atrás";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " minutos atrás";
  return "agora mesmo";
}

export function NotificationDropdown() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [open, setOpen] = React.useState(false);

  const notificationsQuery = useMemoFirebase(() => {
    if (!firestore || !user || isUserLoading) return null;
    return query(
      collection(firestore, 'notifications'),
      where('userId', '==', user.uid),
      // orderBy('createdAt', 'desc'), // This was causing a missing index error
      limit(20)
    );
  }, [firestore, user, isUserLoading]);

  const { data: notifications } = useCollection<Notification>(notificationsQuery);
  
  const sortedNotifications = React.useMemo(() => {
    if (!notifications) return [];
    // Firestore Timestamps need to be converted to Dates for sorting
    // Now that we are not sorting in the query, this client-side sort is essential.
    return [...notifications].sort((a, b) => b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime());
  }, [notifications]);

  const unreadCount = React.useMemo(() => sortedNotifications?.filter(n => !n.readAt).length || 0, [sortedNotifications]);


  const handleMarkAsRead = async (notificationId: string) => {
    await notificationRepository.markAsRead(notificationId);
  };
  
  const handleMarkAllAsRead = async () => {
    if (!sortedNotifications) return;
    const unreadIds = sortedNotifications.filter(n => !n.readAt).map(n => n.id);
    await notificationRepository.markMultipleAsRead(unreadIds);
  };


  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-5 w-5 justify-center rounded-full p-0 text-xs"
            >
              {unreadCount}
            </Badge>
          )}
          <span className="sr-only">Toggle notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between p-2">
            <DropdownMenuLabel>Notificações</DropdownMenuLabel>
            {unreadCount > 0 && (
                 <Button variant="ghost" size="sm" onClick={handleMarkAllAsRead} className="text-xs">
                    <CheckCheck className="mr-1 h-3 w-3" />
                    Marcar todas como lidas
                </Button>
            )}
        </div>
        <DropdownMenuSeparator />
        <ScrollArea className="h-96">
            {sortedNotifications && sortedNotifications.length > 0 ? (
                 sortedNotifications.map(notification => (
                    <DropdownMenuItem
                        key={notification.id}
                        className={cn("flex flex-col items-start gap-2 whitespace-normal", !notification.readAt && "bg-accent/50" )}
                        onSelect={(e) => { e.preventDefault(); if(!notification.readAt) handleMarkAsRead(notification.id) }}
                    >
                        <div className="w-full">
                            <p className="font-semibold">{notification.title}</p>
                            <p className="text-sm text-muted-foreground">{notification.body}</p>
                            <p className="text-xs text-muted-foreground/70 mt-1">
                                {timeSince(notification.createdAt.toDate())}
                            </p>
                        </div>
                    </DropdownMenuItem>
                 ))
            ) : (
                <div className="p-4 text-center text-sm text-muted-foreground">
                    Nenhuma notificação encontrada.
                </div>
            )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
