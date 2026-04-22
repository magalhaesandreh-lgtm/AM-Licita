import * as React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserAvatarAm } from './user-avatar-am';
import { useUser } from '@/firebase';
import { cn } from '@/lib/utils';

interface UserProfileAvatarProps extends React.ComponentPropsWithoutRef<typeof Avatar> {
  photoURL?: string;
}

export function UserProfileAvatar({ className, photoURL, ...props }: UserProfileAvatarProps) {
  const { profile } = useUser();
  
  const url = photoURL ?? profile?.photoURL;
  const name = profile?.displayName || profile?.nome || 'User';

  return (
    <Avatar className={cn("h-10 w-10", className)} {...props}>
      <AvatarImage src={url} alt={name} className="object-cover" referrerPolicy="no-referrer" />
      <AvatarFallback className="bg-primary/10">
        <UserAvatarAm className="w-1/2 h-1/2" />
      </AvatarFallback>
    </Avatar>
  );
}
