'use client';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { doc } from 'firebase/firestore';

export interface BrandingState {
  appName: string;
}

const defaultBranding: BrandingState = {
  appName: 'AM Gestão',
};

export function useBranding() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const settingsDocRef = useMemoFirebase(() => {
    // Only create the doc ref if the user is loaded and authenticated
    if (!firestore || isUserLoading || !user) return null;
    return doc(firestore, 'settings', 'global');
  }, [firestore, isUserLoading, user]);

  const { data: settingsData, isLoading: isSettingsLoading } = useDoc<{ appName: string }>(settingsDocRef);
  
  const branding = settingsData ? {
    appName: settingsData.appName || defaultBranding.appName,
  } : defaultBranding;

  return { ...branding, isLoading: isUserLoading || isSettingsLoading };
}

    
