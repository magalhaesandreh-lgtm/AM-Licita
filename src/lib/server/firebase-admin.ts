import 'server-only';
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let db: Firestore | null = null;

/**
 * Firestore com privilégio de servidor (ignora as firestore.rules).
 * No Firebase App Hosting usa a credencial padrão do próprio backend; não há arquivo de chave.
 * Só deve ser usado depois de autenticar o chamador (ver agent-auth.ts).
 */
export function getAdminDb(): Firestore {
  if (db) return db;
  const app =
    getApps()[0] ??
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}
