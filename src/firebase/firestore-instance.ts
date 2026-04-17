'use client';

import { initializeFirebase } from '@/firebase';

// This is a workaround to provide a singleton firestore instance to repositories,
// which are structured as classes and cannot use the `useFirestore` hook.
const { firestore } = initializeFirebase();

export { firestore };
