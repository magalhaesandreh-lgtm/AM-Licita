'use client';

import React, { DependencyList, createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Firestore, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { Auth, User, onAuthStateChanged } from 'firebase/auth';
import { FirebaseStorage, getStorage } from 'firebase/storage';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import type { Profile } from '@/lib/models';

interface FirebaseProviderProps {
  children: ReactNode;
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
  storage?: FirebaseStorage;
}

// Internal state for user authentication and profile
interface UserAuthState {
  user: User | null;
  profile: Profile | null;
  isUserLoading: boolean;
  userError: Error | null;
}

// Combined state for the Firebase context
export interface FirebaseContextState extends UserAuthState {
  areServicesAvailable: boolean; // True if core services (app, firestore, auth instance) are provided
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null; // The Auth service instance
  storage: FirebaseStorage | null;
}

// Return type for useFirebase()
export interface FirebaseServicesAndUser {
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
  storage: FirebaseStorage;
  user: User | null;
  profile: Profile | null;
  isUserLoading: boolean;
  userError: Error | null;
}

// Return type for useUser() - specific to user auth state
export interface UserHookResult {
  user: User | null;
  profile: Profile | null;
  isUserLoading: boolean;
  userError: Error | null;
}

// React Context
export const FirebaseContext = createContext<FirebaseContextState | undefined>(undefined);

/**
 * FirebaseProvider manages and provides Firebase services and user authentication state.
 */
export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({
  children,
  firebaseApp,
  firestore,
  auth,
  storage,
}) => {
  const [userAuthState, setUserAuthState] = useState<UserAuthState>({
    user: null,
    profile: null,
    isUserLoading: true, // Start loading until first auth event
    userError: null,
  });

  // Effect to subscribe to Firebase auth state changes
  useEffect(() => {
    if (!auth || !firestore) {
      setUserAuthState({ user: null, profile: null, isUserLoading: false, userError: new Error("Auth or Firestore service not provided.") });
      return;
    }

    // Set initial loading state
    setUserAuthState(prevState => ({ ...prevState, isUserLoading: true, userError: null }));
    
    const authUnsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        if (firebaseUser) {
            const profileRef = doc(firestore, 'profiles', firebaseUser.uid);
            const profileUnsubscribe = onSnapshot(profileRef, 
                async (docSnap) => { // Make async to handle profile creation
                    if (docSnap.exists()) {
                        const profileData = docSnap.data() as Profile;
                        setUserAuthState({ user: firebaseUser, profile: profileData, isUserLoading: false, userError: null });
                    } else {
                        // Profile DOES NOT EXIST. This can happen for legacy users or if creation failed.
                        // We create it on the fly to ensure the app can proceed.
                        try {
                            const userName = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Novo Usuário';
                            const newProfileData: Omit<Profile, 'uid'> = {
                                id: firebaseUser.uid,
                                nome: userName,
                                displayName: userName,
                                email: firebaseUser.email!,
                                role: 'user', // Default to 'user', can be changed by an admin
                                ativo: true,
                                createdAt: serverTimestamp(),
                                updatedAt: serverTimestamp(),
                            };
                            await setDoc(profileRef, newProfileData);
                            // After creation, the onSnapshot listener will be re-triggered with the new data,
                            // automatically updating the state to `docSnap.exists() === true`.
                            // We don't need to set state here.
                        } catch (creationError) {
                            console.error("FirebaseProvider: Failed to create user profile on-the-fly:", creationError);
                            setUserAuthState({ user: firebaseUser, profile: null, isUserLoading: false, userError: creationError as Error });
                        }
                    }
                },
                (error) => {
                    console.error("FirebaseProvider: Profile onSnapshot error:", error);
                    setUserAuthState({ user: firebaseUser, profile: null, isUserLoading: false, userError: error });
                }
            );

            return () => profileUnsubscribe();
        } else {
          // No user is logged in
          setUserAuthState({ user: null, profile: null, isUserLoading: false, userError: null });
        }
      },
      (error) => { // Auth listener error
        console.error("FirebaseProvider: onAuthStateChanged error:", error);
        setUserAuthState({ user: null, profile: null, isUserLoading: false, userError: error });
      }
    );
    return () => authUnsubscribe();
  }, [auth, firestore]);

  const contextValue = useMemo((): FirebaseContextState => {
    const servicesAvailable = !!(firebaseApp && firestore && auth);
    return {
      areServicesAvailable: servicesAvailable,
      firebaseApp: servicesAvailable ? firebaseApp : null,
      firestore: servicesAvailable ? firestore : null,
      auth: servicesAvailable ? auth : null,
      storage: servicesAvailable && storage ? storage : (servicesAvailable ? getStorage(firebaseApp!) : null),
      ...userAuthState
    };
  }, [firebaseApp, firestore, auth, storage, userAuthState]);

  return (
    <FirebaseContext.Provider value={contextValue}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = (): FirebaseServicesAndUser => {
  const context = useContext(FirebaseContext);

  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider.');
  }

  if (!context.areServicesAvailable || !context.firebaseApp || !context.firestore || !context.auth || !context.storage) {
    throw new Error('Firebase core services not available. Check FirebaseProvider props.');
  }

  return {
    firebaseApp: context.firebaseApp,
    firestore: context.firestore,
    auth: context.auth,
    storage: context.storage,
    user: context.user,
    profile: context.profile,
    isUserLoading: context.isUserLoading,
    userError: context.userError,
  };
};

export const useAuth = (): Auth => {
  const { auth } = useFirebase();
  return auth;
};

export const useFirestore = (): Firestore => {
  const { firestore } = useFirebase();
  return firestore;
};

export const useStorage = (): FirebaseStorage => {
  const { storage } = useFirebase();
  return storage;
};

export const useFirebaseApp = (): FirebaseApp => {
  const { firebaseApp } = useFirebase();
  return firebaseApp;
};

type MemoFirebase <T> = T & {__memo?: boolean};

export function useMemoFirebase<T>(factory: () => T, deps: DependencyList): T | (MemoFirebase<T>) {
  const memoized = useMemo(factory, deps);
  
  if(typeof memoized !== 'object' || memoized === null) return memoized;
  (memoized as MemoFirebase<T>).__memo = true;
  
  return memoized;
}

export const useUser = (): UserHookResult => {
  const { user, profile, isUserLoading, userError } = useFirebase();
  return { user, profile, isUserLoading, userError };
};
