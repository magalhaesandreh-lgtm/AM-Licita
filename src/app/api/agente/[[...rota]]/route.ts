import { NextResponse, type NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/server/firebase-admin';
import { autenticarAgente } from '@/lib/server/agent-auth';
import { ApiError, despachar } from '@/lib/server/agent-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ rota?: string[] }> };

async function tratar(req: NextRequest, { params }: Params) {
  const auth = autenticarAgente(req);
  if (!auth.ok) {
    return NextResponse.json({ erro: auth.erro }, { status: auth.status, headers: { 'Cache-Control': 'no-store' } });
  }

  const { rota = [] } = await params;
  const metodo = req.method;
  let corpo: unknown = undefined;
  if (metodo !== 'GET' && metodo !== 'DELETE') {
    const texto = await req.text();
    if (texto) {
      try {
        corpo = JSON.parse(texto);
      } catch {
        return NextResponse.json({ erro: 'JSON inválido no corpo da requisição.' }, { status: 400 });
      }
    }
  }

  const db = getAdminDb();
  try {
    const resultado = await despachar({ db, metodo, rota, query: req.nextUrl.searchParams, corpo });
    if (metodo !== 'GET') {
      // trilha de auditoria das alterações feitas pelos agentes
      await db
        .collection('auditoriaAgentes')
        .add({ em: new Date().toISOString(), metodo, rota: '/' + rota.join('/'), consulta: req.nextUrl.search || null })
        .catch(() => undefined);
    }
    return NextResponse.json(resultado, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ erro: e.message }, { status: e.status });
    console.error('API agente:', e);
    return NextResponse.json({ erro: 'Erro interno ao executar a operação.' }, { status: 500 });
  }
}

export { tratar as GET, tratar as POST, tratar as PATCH, tratar as DELETE };
