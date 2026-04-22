import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { LogoAm } from './logo-am';
import { useBranding } from '@/hooks/use-branding';

interface BrandLogoProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'className'> {
  className?: string;
  variant?: 'default' | 'compact' | 'login';
}

export function BrandLogo({ className, variant = 'default', ...props }: BrandLogoProps) {
  const branding = useBranding();

  let url = branding.logoUrl;
  if (variant === 'compact' && branding.logoCompactUrl) {
    url = branding.logoCompactUrl;
  } else if (variant === 'login' && branding.loginLogoUrl) {
    url = branding.loginLogoUrl;
  }

  if (url) {
    return (
      <div className={cn("relative flex items-center justify-center overflow-hidden", className)} {...props}>
        <Image 
          src={url} 
          alt={`${branding.appName} logo`} 
          fill
          className="object-contain"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-center shrink-0", className)} {...props}>
      <LogoAm className="w-full h-full" />
    </div>
  );
}
