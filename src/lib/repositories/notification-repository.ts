'use client';

import { collection, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';

class NotificationRepository {
  private getCollectionRef() {
    return collection(firestore, 'notifications');
  }

  async markAsRead(notificationId: string): Promise<void> {
    const docRef = doc(this.getCollectionRef(), notificationId);
    await updateDoc(docRef, { readAt: new Date() });
  }
  
  async markMultipleAsRead(notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) return;
    const batch = writeBatch(firestore);
    notificationIds.forEach(id => {
      const docRef = doc(this.getCollectionRef(), id);
      batch.update(docRef, { readAt: new Date() });
    });
    await batch.commit();
  }
}

export const notificationRepository = new NotificationRepository();
