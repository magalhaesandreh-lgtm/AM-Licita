import 'server-only';
import { createHash, timingSafeEqual } from 'crypto';

/**
 * Autenticação da API dos agentes: cabeçalho `Authorization: Bearer <token>`,
 * comparado com a variável de ambiente AGENT_API_TOKEN (Secret Manager no App Hosting).
 * Se a variável não existir, a API fica desligada (responde 503): nunca abre por omissão.
 */
export type ResultadoAuth = { ok: true } | { ok: false; status: 401 | 503; erro: string };

function digest(v: string) {
  return createHash('sha256').update(v).digest();
}

export function autenticarAgente(req: Request): ResultadoAuth {
  const esperado = process.env.AGENT_API_TOKEN;
  if (!esperado || esperado.length < 24) {
    return { ok: false, status: 503, erro: 'API dos agentes desligada: AGENT_API_TOKEN não configurado.' };
  }
  const cab = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(cab);
  if (!m) return { ok: false, status: 401, erro: 'Token ausente.' };
  const igual = timingSafeEqual(digest(m[1].trim()), digest(esperado));
  return igual ? { ok: true } : { ok: false, status: 401, erro: 'Token inválido.' };
}
