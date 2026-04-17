'use client';
import { collection, query, where, Timestamp, Query, doc, setDoc } from 'firebase/firestore';
import { firestore } from '@/firebase/firestore-instance';
import { startOfDay, endOfDay, addDays, startOfMonth, endOfMonth } from 'date-fns';
import { certameUnificadoRepository } from './certame-unificado-repository';
import type { AgendaEvent } from '@/lib/models';

type PeriodOption = 'hoje' | '7dias' | '30dias' | 'mes';

class EventRepository {
    private getCollectionRef() {
        return collection(firestore, 'events');
    }

  getEventsQuery(period: PeriodOption): Query | null {
    if (!firestore) return null;

    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (period) {
      case 'hoje':
        startDate = startOfDay(now);
        endDate = endOfDay(now);
        break;
      case '7dias':
        startDate = startOfDay(now);
        endDate = endOfDay(addDays(now, 7));
        break;
      case '30dias':
        startDate = startOfDay(now);
        endDate = endOfDay(addDays(now, 30));
        break;
      case 'mes':
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
        break;
    }
    
    const constraints = [
        where('startAt', '>=', Timestamp.fromDate(startDate)),
        where('startAt', '<=', Timestamp.fromDate(endDate)),
    ];

    return query(this.getCollectionRef(), ...constraints);
  }

  async syncEventsFromCertames(): Promise<{ updated: number, cancelled: number }> {
    if (!firestore) throw new Error("Firestore not initialized");

    const certames = await certameUnificadoRepository.list();
    let updated = 0;
    let cancelled = 0;

    for (const certame of certames) {
        const eventId = `certame-session-${certame.id}`;
        const eventRef = doc(this.getCollectionRef(), eventId);
        
        if (certame.status === 'CANCELADO') {
            await setDoc(eventRef, { status: 'CANCELLED', updatedAt: Timestamp.now() }, { merge: true });
            cancelled++;
            continue;
        }

        if (certame.sessaoAt) {
            const startAt = Timestamp.fromDate(new Date(certame.sessaoAt));

            const eventData: Partial<AgendaEvent> = {
                type: "CERTAME_SESSION",
                certameId: certame.id,
                clienteId: certame.empresaDestinoId,
                title: `Sessão: ${certame.modalidade} ${certame.numeroAno} — ${certame.orgao}`,
                startAt: startAt,
                status: "ACTIVE",
                source: "SYSTEM",
                updatedAt: Timestamp.now(),
                createdAt: Timestamp.now()
            };
            
            await setDoc(eventRef, { ...eventData, updatedAt: Timestamp.now() }, { merge: true });
            updated++;
        }
    }

    return { updated, cancelled };
  }
}

export const eventRepository = new EventRepository();
