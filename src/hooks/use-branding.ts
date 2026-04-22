'use client';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { doc } from 'firebase/firestore';

export interface BrandingState {
  appName: string;
  logoUrl?: string;
  logoCompactUrl?: string;
  loginLogoUrl?: string;
  faviconUrl?: string;
}

const defaultBranding: BrandingState = {
  appName: 'AM Gestão',
};

export function useBranding() {
  const firestore = useFirestore();

  const settingsDocRef = useMemoFirebase(() => {
    // Branding should load without requiring the user to be logged in
    if (!firestore) return null;
    return doc(firestore, 'settings', 'global');
  }, [firestore]);

  const { data: settingsData, isLoading: isSettingsLoading } = useDoc<BrandingState>(settingsDocRef);
  
  const branding = settingsData ? {
    appName: settingsData.appName || defaultBranding.appName,
    logoUrl: settingsData.logoUrl,
    logoCompactUrl: settingsData.logoCompactUrl,
    loginLogoUrl: settingsData.loginLogoUrl,
    faviconUrl: settingsData.faviconUrl,
  } : defaultBranding;

  return { ...branding, isLoading: isSettingsLoading };
}

    
