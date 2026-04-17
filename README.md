# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

<!-- Trigger rebuild -->

---

# Guia de Implementação do Backend (Cloud Functions)

Este guia contém todo o necessário para você implementar o backend da funcionalidade de Agenda e Notificações no seu projeto Firebase.

## Pré-requisitos

1.  **Node.js e npm:** Certifique-se de ter o Node.js (versão 18 ou superior) e o npm instalados.
2.  **Firebase CLI:** Se ainda não tiver, instale a ferramenta de linha de comando do Firebase globalmente:
    ```bash
    npm install -g firebase-tools
    ```
3.  **Login no Firebase:** Autentique-se na sua conta do Google:
    ```bash
    firebase login
    ```

## Passo 1: Inicializar o Firebase Functions no seu Projeto

1.  Abra o terminal na pasta raiz do seu projeto.
2.  Execute o comando para iniciar o Firebase Functions:
    ```bash
    firebase init functions
    ```
3.  Siga as instruções no terminal:
    *   `Please select an option:` **Use an existing project** (Selecione o projeto Firebase que você está usando).
    *   `What language would you like to use to write Cloud Functions?` **TypeScript**.
    *   `Do you want to use ESLint to catch probable bugs and enforce style?` **Yes**.
    *   `File functions/package.json already exists. Overwrite?` **No**.
    *   `File functions/tsconfig.json already exists. Overwrite?` **No**.
    *   `File functions/src/index.ts already exists. Overwrite?` **No**.
    *   `Do you want to install dependencies with npm now?` **Yes**.

Isso criará uma pasta `functions` na raiz do seu projeto.

## Passo 2: Adicionar Dependências do Backend

1.  Navegue até a nova pasta `functions`:
    ```bash
    cd functions
    ```
2.  Instale as dependências necessárias para as funções:
    ```bash
    npm install firebase-functions@latest firebase-admin@latest date-fns@latest date-fns-tz@latest
    ```

## Passo 3: Adicionar o Código das Funções

Copie todo o código abaixo e substitua completamente o conteúdo do arquivo `functions/src/index.ts`. Este código contém as três funções que você solicitou.

```typescript
import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";
import {formatInTimeZone, zonedTimeToUtc} from "date-fns-tz";

// Inicializa o Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// ---- 1. FUNÇÃO: SINCRONIZAR CERTAME COM A AGENDA ----
// Gatilho: Executa sempre que um documento na coleção 'certames' é criado ou atualizado.
export const syncCertameToEvent = functions.firestore.onDocumentWritten("certames/{certameId}", async (event) => {
  const certameId = event.params.certameId;
  const eventDocRef = db.collection("events").doc(`certame-session-${certameId}`);

  // Se o documento do certame foi deletado, cancela o evento correspondente.
  if (!event.data?.after.exists) {
    functions.logger.log(`Certame ${certameId} deletado. Cancelando evento.`);
    await eventDocRef.set({status: "CANCELLED", updatedAt: Timestamp.now()}, {merge: true});
    return;
  }

  const certameData = event.data.after.data();

  // Se o certame for cancelado, cancela o evento.
  if (certameData.status === "CANCELADO") {
    functions.logger.log(`Certame ${certameId} cancelado. Atualizando evento.`);
    await eventDocRef.set({status: "CANCELLED", updatedAt: Timestamp.now()}, {merge: true});
    return;
  }

  // Se a data e hora da sessão são válidas, cria ou atualiza o evento.
  if (certameData.sessaoAt) {
    const startAt = Timestamp.fromDate(new Date(certameData.sessaoAt));

    const eventData = {
      type: "CERTAME_SESSION",
      certameId: certameId,
      clienteId: certameData.empresaDestinoId || null,
      title: `Sessão: ${certameData.modalidade} ${certameData.numeroAno} — ${certameData.orgao}`,
      startAt: startAt,
      status: "ACTIVE",
      source: "SYSTEM",
      updatedAt: Timestamp.now(),
    };

    functions.logger.log(`Sincronizando evento para o certame ${certameId}.`);
    // Usamos `set` com `merge: true` para criar ou atualizar o evento.
    await eventDocRef.set(eventData, {merge: true});
  }
});


// ---- 2. FUNÇÃO AGENDADA: RESUMO DIÁRIO (DAILY DIGEST) ----
// Gatilho: Executa todos os dias às 08:00 no fuso horário de Fortaleza.
export const dailyDigestScheduler = functions.pubsub.onSchedule({
  schedule: "every day 08:00",
  timeZone: "America/Fortaleza",
}, async () => {
  functions.logger.log("Executando o agendador de resumo diário...");

  const today = new Date();
  const tomorrowStart = zonedTimeToUtc(formatInTimeZone(today, "America/Fortaleza", "yyyy-MM-dd'T00:00:00'"), "America/Fortaleza");
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const tomorrowEnd = zonedTimeToUtc(formatInTimeZone(today, "America/Fortaleza", "yyyy-MM-dd'T23:59:59'"), "America/Fortaleza");
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  const eventsTomorrowQuery = db.collection("events")
    .where("startAt", ">=", Timestamp.fromDate(tomorrowStart))
    .where("startAt", "<=", Timestamp.fromDate(tomorrowEnd))
    .where("status", "==", "ACTIVE");

  const eventsSnapshot = await eventsTomorrowQuery.get();
  if (eventsSnapshot.empty) {
    functions.logger.log("Nenhum evento para amanhã. Finalizando.");
    return;
  }

  const eventsByUserId = new Map<string, any[]>();

  // Agrupa eventos por usuário
  const rulesSnapshot = await db.collection("notification_rules").where("dailyDigestEnabled", "==", true).get();
  if (rulesSnapshot.empty) {
    functions.logger.log("Nenhum usuário com resumos diários ativos.");
    return;
  }

  // Prepara os eventos para cada usuário
  for (const eventDoc of eventsSnapshot.docs) {
    const event = eventDoc.data();
    for (const ruleDoc of rulesSnapshot.docs) {
      const rule = ruleDoc.data();
      const userId = rule.userId;

      // Lógica simples: notifica todos os usuários sobre todos os eventos.
      // Em um sistema multi-tenant, você adicionaria um filtro aqui (ex: if event.clienteId === rule.clienteId)
      if (!eventsByUserId.has(userId)) {
        eventsByUserId.set(userId, []);
      }
      eventsByUserId.get(userId)?.push(event);
    }
  }


  // Cria as notificações
  const batch = db.batch();
  const tomorrowStr = formatInTimeZone(tomorrowStart, "America/Fortaleza", "yyyy-MM-dd");

  for (const [userId, userEvents] of eventsByUserId.entries()) {
    if (userEvents.length === 0) continue;

    const idempotencyKey = `digest:${userId}:${tomorrowStr}`;
    const notificationCheck = await db.collection("notifications").where("idempotencyKey", "==", idempotencyKey).limit(1).get();

    if (!notificationCheck.empty) {
      functions.logger.log(`Notificação de resumo para ${userId} já existe.`);
      continue;
    }

    const eventList = userEvents.map((e) => `- ${formatInTimeZone(e.startAt.toDate(), "America/Fortaleza", "HH:mm")}h: ${e.title}`).join("\n");
    const body = `Olá! Amanhã você tem ${userEvents.length} certame(s):\n${eventList}\nFique atento para não perder os prazos.`;
    const title = "Seu resumo de certames para amanhã";

    const notificationId = db.collection("notifications").doc().id;
    const notificationRef = db.collection("notifications").doc(notificationId);

    batch.set(notificationRef, {
      idempotencyKey,
      userId,
      eventId: userEvents[0].certameId, // Apenas para referência
      type: "DAILY_DIGEST",
      channel: "IN_APP",
      title,
      body,
      scheduledFor: Timestamp.fromDate(tomorrowStart),
      status: "SCHEDULED",
      createdAt: Timestamp.now(),
    });
  }

  await batch.commit();
  functions.logger.log(`Resumos diários criados. ${eventsByUserId.size} usuários notificados.`);
});


// ---- 3. FUNÇÃO AGENDADA: LEMBRETES DE EVENTOS ----
// Gatilho: Executa a cada 5 minutos.
export const eventReminderScheduler = functions.pubsub.onSchedule("every 5 minutes", async () => {
  functions.logger.log("Executando o agendador de lembretes...");

  const now = new Date();
  const reminderWindowStart = new Date(now.getTime() + 9 * 60 * 1000); // 9 minutos a partir de agora
  const reminderWindowEnd = new Date(now.getTime() + 11 * 60 * 1000); // 11 minutos a partir de agora

  const eventsQuery = db.collection("events")
    .where("startAt", ">=", Timestamp.fromDate(reminderWindowStart))
    .where("startAt", "<=", Timestamp.fromDate(reminderWindowEnd))
    .where("status", "==", "ACTIVE");

  const eventsSnapshot = await eventsQuery.get();
  if (eventsSnapshot.empty) {
    functions.logger.log("Nenhum evento na janela de lembrete.");
    return;
  }

  const rulesSnapshot = await db.collection("notification_rules").where("reminderEnabled", "==", true).get();
  if (rulesSnapshot.empty) {
    functions.logger.log("Nenhum usuário com lembretes ativos.");
    return;
  }

  const batch = db.batch();

  for (const eventDoc of eventsSnapshot.docs) {
    const event = eventDoc.data();
    for (const ruleDoc of rulesSnapshot.docs) {
      const rule = ruleDoc.data();
      const userId = rule.userId;
      
      const idempotencyKey = `reminder:${userId}:${eventDoc.id}`;
      const notificationCheck = await db.collection("notifications").where("idempotencyKey", "==", idempotencyKey).limit(1).get();

      if (!notificationCheck.empty) {
        functions.logger.log(`Lembrete para ${userId} sobre o evento ${eventDoc.id} já foi criado.`);
        continue;
      }
      
      const notificationId = db.collection("notifications").doc().id;
      const notificationRef = db.collection("notifications").doc(notificationId);

      batch.set(notificationRef, {
        idempotencyKey,
        userId,
        eventId: event.certameId,
        type: "EVENT_REMINDER",
        channel: "IN_APP",
        title: "Vai começar!",
        body: `Seu certame "${event.title}" começa em 10 minutos.`,
        scheduledFor: event.startAt,
        status: "SCHEDULED",
        createdAt: Timestamp.now(),
      });
    }
  }

  await batch.commit();
  functions.logger.log(`Lembretes criados para ${eventsSnapshot.size} evento(s).`);
});

// NOTA: A função de envio de e-mail não está incluída aqui, pois requer configuração
// de um provedor de terceiros (ex: SendGrid, Resend). Você precisaria criar uma
// função adicional que escuta a coleção 'notifications' e envia os e-mails.
```

## Passo 4: Implantar as Funções no Firebase

1.  Ainda no terminal, dentro da pasta `functions`, execute o comando para fazer o deploy:
    ```bash
    firebase deploy --only functions
    ```
2.  Aguarde o processo terminar. O Firebase irá compilar seu código TypeScript, criar os pacotes e enviar para a nuvem.

Após o deploy, as funções estarão ativas e começarão a operar automaticamente conforme os gatilhos definidos (alterações em certames e agendamentos).

## Passo 5: Configurar Envio de E-mail (Ação Manual)

O código fornecido cria as notificações "IN_APP" (dentro do aplicativo), mas o envio de e-mails requer uma configuração adicional.

1.  **Escolha um Provedor:** Escolha um serviço de envio de e-mail como **Resend**, **SendGrid**, ou outro de sua preferência.
2.  **Obtenha a Chave de API:** No painel do seu provedor, gere uma chave de API para envio de e-mails.
3.  **Armazene a Chave como um Secret:** Para segurança, não coloque a chave diretamente no código. Use os Secrets do Firebase:
    ```bash
    firebase functions:secrets:set EMAIL_API_KEY
    ```
    Quando solicitado, cole a sua chave de API e pressione Enter.
4.  **Crie a Função de Envio:** Você precisará criar uma nova função (ex: `sendEmailNotification`) que é acionada sempre que um novo documento é criado na coleção `notifications` com `channel == 'EMAIL'`. Dentro dessa função, você usará a API do seu provedor de e-mail para enviar a mensagem.

Esta parte é uma implementação de backend padrão e depende do provedor que você escolher.
