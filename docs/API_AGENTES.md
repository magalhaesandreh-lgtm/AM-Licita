# API dos agentes (`/api/agente`)

Interface direta para a equipe de agentes (Davi, Marcos, Paula, Fábio etc.) operar o AM Gestão **sem navegador**:
respostas compactas em JSON, filtradas no servidor, com a mesma regra de negócio das telas.

## Segurança
- Autenticação por `Authorization: Bearer <token>`. O token fica no **Secret Manager** (variável `AGENT_API_TOKEN`).
  Sem a variável, a API responde 503 e fica desligada.
- O servidor usa `firebase-admin` com a credencial padrão do App Hosting (sem arquivo de chave) e ignora as `firestore.rules`.
- Toda alteração (POST/PATCH/DELETE) grava uma linha em `auditoriaAgentes` (data, método e rota).
- O token **nunca** vai para o repositório, para o chat ou para o código.

## Ativação (uma vez, por André)
1. Gerar o token e guardar no Secret Manager (o comando pede o valor no terminal):
   ```
   openssl rand -hex 32
   firebase apphosting:secrets:set agentApiToken
   ```
   (no Windows, sem `openssl`: `-join ((48..57)+(97..102) | Get-Random -Count 64 | % {[char]$_})` no PowerShell)
2. Dar acesso ao backend (`firebase apphosting:secrets:grantaccess agentApiToken --backend <id-do-backend>`).
3. Se a API responder 500 com erro de permissão, conceder ao service account do backend o papel
   **Cloud Datastore User** (`roles/datastore.user`) no console do Google Cloud.
4. Acrescentar ao `apphosting.yaml` e publicar:
   ```yaml
   env:
     - variable: AGENT_API_TOKEN
       secret: agentApiToken
       availability:
         - RUNTIME
   ```
   **Só depois de criar o segredo**; senão o deploy falha.
5. No computador, guardar o mesmo token em variáveis de ambiente do usuário (sem colar em conversa):
   `AMGESTAO_TOKEN` e `AMGESTAO_URL` (`https://amgestao.amc.app.br`).

## Uso
```
curl -s -H "Authorization: Bearer $AMGESTAO_TOKEN" "$AMGESTAO_URL/api/agente/resumo?dias=7"
```
`GET /api/agente` devolve o índice das rotas.

| Rota | O que faz |
|---|---|
| `GET /resumo?dias=7` | entregas com saldo e prazo, NFs a receber, certidões vencendo, pendências |
| `GET /exportar` | backup completo (certames, empenhos, NFs, certidões, cobranças, pendências, clientes) |
| `GET /pendencias?status=ABERTA\|RESOLVIDA\|TODAS` | lista |
| `POST /pendencias` | cria; com `chave` atualiza a aberta em vez de duplicar (transação) |
| `POST /pendencias/resolver` | `{chave ou id, resolucao}`; não cria documento fantasma |
| `DELETE /pendencias/:id` | exclui |
| `GET /certames[?completo=1]` | lista (sem empenhos por padrão, para gastar menos) |
| `GET/PATCH/DELETE /certames/:id` | detalhe completo / altera / exclui com empenhos e NFs |
| `GET/POST /certames/:id/empenhos` | lista / cria |
| `PATCH/DELETE /certames/:id/empenhos/:eid` | altera / exclui com as NFs |
| `POST /certames/:id/empenhos/:eid/recalcular` | recalcula entregue e saldo |
| `GET/POST /certames/:id/empenhos/:eid/nfs` | lista / lança (recalcula saldos) |
| `PATCH/DELETE .../nfs/:nid` | altera / exclui (recalcula saldos) |
| `POST .../nfs/:nid/pagar` | `{dataPagamentoISO}` |
| `GET/POST/PATCH/DELETE /certidoes`, `/cobrancas`, `/clientes` | CRUD simples; `GET` aceita filtros por igualdade (`?status=PAGO`) |

Erros: `401` token ausente/inválido, `404` não encontrado, `400` corpo inválido, `503` API desligada.
