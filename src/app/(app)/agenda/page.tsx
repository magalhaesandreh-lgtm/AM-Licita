'use client';

import * as React from 'react';
import { useUser, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, Timestamp } from 'firebase/firestore';
import { addDays, format, startOfDay, endOfDay, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar as CalendarIcon, List, RefreshCw } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { AgendaEvent, ClienteAssessoria } from '@/lib/models';
import { eventRepository } from '@/lib/repositories/event-repository';
import { useRouter } from 'next/navigation';
import { useDebounce } from '@/hooks/use-debounce';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

type PeriodOption = 'hoje' | '7dias' | '30dias' | 'mes';

export default function AgendaPage() {
  const { user, profile, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [period, setPeriod] = React.useState<PeriodOption>('7dias');
  const [searchText, setSearchText] = React.useState('');
  const [selectedCliente, setSelectedCliente] = React.useState<string>('todos');
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(new Date());
  const [activeTab, setActiveTab] = React.useState('lista');
  const [isSyncing, setIsSyncing] = React.useState(false);
  
  const debouncedSearchText = useDebounce(searchText, 300);

  const { data: clientes, isLoading: isLoadingClientes } = useCollection<ClienteAssessoria>(
    useMemoFirebase(() => {
        if (!firestore) return null;
        return collection(firestore, 'clients');
    }, [firestore])
  );

  const eventsQuery = useMemoFirebase(() => {
    if (!firestore) return null;

    if (activeTab === 'lista') {
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
            default:
                // Fallback to 7 days
                startDate = startOfDay(now);
                endDate = endOfDay(addDays(now, 7));
        }
        
        return query(
            collection(firestore, 'events'),
            where('startAt', '>=', Timestamp.fromDate(startDate)),
            where('startAt', '<=', Timestamp.fromDate(endDate))
        );
    }
    
    // For 'calendario' tab: fetch for the entire month of the selected date.
    // If no date is selected, use the current month.
    const monthToFetch = selectedDate || new Date();
    const start = startOfMonth(monthToFetch);
    const end = endOfMonth(monthToFetch);

    return query(
        collection(firestore, 'events'),
        where('startAt', '>=', Timestamp.fromDate(start)),
        where('startAt', '<=', Timestamp.fromDate(end))
    );
  }, [firestore, activeTab, period, selectedDate]);

  const { data: events, isLoading: isLoadingEvents } = useCollection<AgendaEvent>(eventsQuery);
  
  const filteredEvents = React.useMemo(() => {
    if (!events) return [];

    let clientFilteredEvents = events;
    if (selectedCliente && selectedCliente !== 'todos') {
        clientFilteredEvents = events.filter(event => event.clienteId === selectedCliente);
    }

    if (!debouncedSearchText) return clientFilteredEvents;
    
    const lowerSearch = debouncedSearchText.toLowerCase();
    return clientFilteredEvents.filter(event => event.title.toLowerCase().includes(lowerSearch));
  }, [events, debouncedSearchText, selectedCliente]);

  const isLoading = isUserLoading || isLoadingEvents || isLoadingClientes;

  // For Calendar View
  const eventDays = React.useMemo(() => {
    if (!filteredEvents) return [];
    // Ensure createdAt is a Date object before calling toDate()
    return filteredEvents.map(e => e.startAt && typeof e.startAt.toDate === 'function' ? e.startAt.toDate() : new Date());
  }, [filteredEvents]);

  const eventsForSelectedDay = React.useMemo(() => {
    if (!selectedDate || !filteredEvents) return [];
    return filteredEvents.filter(event => {
        if (!event.startAt || typeof event.startAt.toDate !== 'function') return false;
        const eventDay = startOfDay(event.startAt.toDate());
        const day = startOfDay(selectedDate);
        return eventDay.getTime() === day.getTime();
    }).sort((a, b) => a.startAt.toDate().getTime() - b.startAt.toDate().getTime());
  }, [filteredEvents, selectedDate]);

  const handleSync = async () => {
    setIsSyncing(true);
    toast({ title: "Sincronizando...", description: "Buscando certames e atualizando a agenda." });
    try {
        const result = await eventRepository.syncEventsFromCertames();
        toast({ title: "Sincronização Concluída!", description: `${result.updated} eventos atualizados e ${result.cancelled} cancelados.` });
    } catch(e) {
        console.error(e);
        toast({ title: "Erro na sincronização", description: "Não foi possível atualizar a agenda.", variant: "destructive" });
    } finally {
        setIsSyncing(false);
    }
  }


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                  <CardTitle>Agenda</CardTitle>
                  <CardDescription>Visualize os prazos e sessões dos seus certames.</CardDescription>
              </div>
              <Button onClick={handleSync} disabled={isSyncing} variant="outline">
                  <RefreshCw className={cn("mr-2 h-4 w-4", isSyncing && "animate-spin")} />
                  Sincronizar Agenda
              </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="7dias">Próximos 7 dias</SelectItem>
                <SelectItem value="30dias">Próximos 30 dias</SelectItem>
                <SelectItem value="mes">Mês Atual</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedCliente} onValueChange={setSelectedCliente}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as Empresas</SelectItem>
                {clientes?.map(c => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input 
              placeholder="Buscar por órgão, modalidade..." 
              className="md:col-span-2"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
      
      <Tabs defaultValue="lista" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="lista"><List className="mr-2 h-4 w-4" /> Lista</TabsTrigger>
          <TabsTrigger value="calendario"><CalendarIcon className="mr-2 h-4 w-4" /> Calendário</TabsTrigger>
        </TabsList>
        <TabsContent value="lista">
          {isLoading && <AgendaListSkeleton />}
          {!isLoading && <AgendaList events={filteredEvents} clientes={clientes || []} />}
        </TabsContent>
        <TabsContent value="calendario">
           <Card>
                <CardHeader>
                    <CardTitle>
                        Eventos para {selectedDate ? format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : 'o dia selecionado'}
                    </CardTitle>
                    <CardDescription>Selecione uma data para visualizar os eventos agendados.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button
                            variant={"outline"}
                            className={cn(
                                "w-[280px] justify-start text-left font-normal",
                                !selectedDate && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {selectedDate ? format(selectedDate, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                        <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={setSelectedDate}
                            modifiers={{ hasEvent: eventDays }}
                            modifiersClassNames={{ hasEvent: 'day-with-event' }}
                            captionLayout="dropdown"
                            fromYear={new Date().getFullYear() - 5}
                            toYear={new Date().getFullYear() + 5}
                            initialFocus
                        />
                        <div className="flex justify-between p-2 border-t">
                            <Button variant="ghost" onClick={() => setSelectedDate(undefined)}>Limpar</Button>
                            <Button variant="ghost" onClick={() => setSelectedDate(new Date())}>Hoje</Button>
                        </div>
                        </PopoverContent>
                    </Popover>
                    
                    <Separator />
                    
                    <div className="mt-4">
                        {isLoading ? (
                            <div className="space-y-4">
                                <Skeleton className="h-20 w-full" />
                                <Skeleton className="h-20 w-full" />
                            </div>
                        ) : eventsForSelectedDay.length > 0 ? (
                            <div className="space-y-3">
                                {eventsForSelectedDay.map(event => (
                                    <div key={event.id} className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                                        <div className="font-bold text-lg w-16 shrink-0">{format(event.startAt.toDate(), 'HH:mm')}</div>
                                        <Separator orientation="vertical" className="h-10" />
                                        <div className="flex-1 space-y-1">
                                            <p className="font-semibold leading-tight">{event.title}</p>
                                            <div className="flex flex-wrap items-center gap-2">
                                                {event.status === 'CANCELLED' && <Badge variant="destructive">Cancelado</Badge>}
                                                {event.clienteId && <Badge variant="secondary">{clientes?.find(c=>c.id === event.clienteId)?.nomeFantasia}</Badge>}
                                            </div>
                                        </div>
                                        <Button onClick={() => router.push(`/precificacao-unificada?id=${event.certameId}`)}>
                                            Abrir Certame
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-40 border-2 border-dashed rounded-lg">
                                <p className="text-muted-foreground">
                                    {selectedDate ? "Nenhum evento para este dia." : "Selecione uma data para ver os eventos."}
                                </p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AgendaList({ events, clientes }: { events: AgendaEvent[], clientes: ClienteAssessoria[] }) {
  const router = useRouter();

  const sortedEvents = React.useMemo(() => {
    if (!events) return [];
    return [...events].sort((a, b) => {
        if (!a.startAt || !b.startAt) return 0;
        return a.startAt.toDate().getTime() - b.startAt.toDate().getTime()
    });
  }, [events]);

  if (sortedEvents.length === 0) {
    return (
      <Card className="flex items-center justify-center h-48">
        <p className="text-muted-foreground">Nenhum evento encontrado para o período selecionado.</p>
      </Card>
    );
  }
  
  const groupedEvents = sortedEvents.reduce((acc, event) => {
    if (!event.startAt || typeof event.startAt.toDate !== 'function') return acc;
    const dateKey = format(event.startAt.toDate(), 'yyyy-MM-dd');
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(event);
    return acc;
  }, {} as Record<string, AgendaEvent[]>);

  return (
    <div className="space-y-6">
      {Object.entries(groupedEvents).map(([dateKey, dayEvents]) => (
        <div key={dateKey}>
          <h3 className="text-lg font-semibold mb-2 capitalize">
            {format(parseISO(dateKey), "eeee, dd 'de' MMMM", { locale: ptBR })}
          </h3>
          <div className="space-y-4">
            {dayEvents.map(event => (
              <Card key={event.id} className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                 <div className="font-bold text-lg w-20 shrink-0">{format(event.startAt.toDate(), 'HH:mm')}</div>
                 <div className="flex-1">
                    <p className="font-semibold">{event.title}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                        {event.status === 'CANCELLED' && <Badge variant="destructive">Cancelado</Badge>}
                        {event.clienteId && <Badge variant="secondary">{clientes.find(c=>c.id === event.clienteId)?.nomeFantasia}</Badge>}
                    </div>
                 </div>
                 <Button onClick={() => router.push(`/precificacao-unificada?id=${event.certameId}`)}>Abrir Certame</Button>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AgendaListSkeleton() {
    return (
        <div className="space-y-6">
            <div>
                <Skeleton className="h-7 w-48 mb-2" />
                <div className="space-y-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                </div>
            </div>
             <div>
                <Skeleton className="h-7 w-48 mb-2" />
                <div className="space-y-4">
                    <Skeleton className="h-20 w-full" />
                </div>
            </div>
        </div>
    )
}
