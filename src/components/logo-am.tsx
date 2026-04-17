import * as React from 'react';
import { cn } from '@/lib/utils';

export function LogoAm({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      className={cn("h-10 w-10", className)}
      {...props}
    >
      <defs>
        <radialGradient id="goldGrad" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" style={{ stopColor: '#FDE08D', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#D8A43E', stopOpacity: 1 }} />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="hsl(var(--sidebar-background))" stroke="url(#goldGrad)" strokeWidth="2" />
      <circle cx="50" cy="50" r="40" fill="transparent" stroke="url(#goldGrad)" strokeWidth="1.5" />
      <path
        d="M25 45 Q50 30, 75 45"
        fill="none"
        stroke="url(#goldGrad)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M25 55 Q50 70, 75 55"
        fill="none"
        stroke="url(#goldGrad)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        fill="url(#goldGrad)"
        d="M50 35 L53.5 42 L61 43 L55.5 48 L57 55 L50 51.5 L43 55 L44.5 48 L39 43 L46.5 42 Z"
      />
    </svg>
  );
}
