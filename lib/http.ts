import { withDatabaseRole } from './database-role';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function checkOrigin(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new HttpError(403, 'Cross-site request rejected.');
  const value = request.headers.get('origin');
  if (!value) return; // Non-browser clients may omit Origin; authentication is still required.
  const target = new URL(request.url);
  let incoming: URL;
  try { incoming = new URL(value); }
  catch { throw new HttpError(403, 'Cross-origin request rejected.'); }
  if (!['http:', 'https:'].includes(incoming.protocol) || incoming.origin !== value)
    throw new HttpError(403, 'Cross-origin request rejected.');
  const configured = process.env.APP_ORIGIN;
  const allowed = configured ? new URL(configured).origin : target.origin;
  if (incoming.origin === allowed) return;
  // Next dev may choose another port, and localhost/127.0.0.1 identify the same local app.
  // Limit this exception to loopback hosts on the actual request port in development.
  const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
  if (process.env.NODE_ENV !== 'production'
      && loopback(incoming.hostname) && loopback(target.hostname)
      && incoming.protocol === target.protocol && incoming.port === target.port) return;
  throw new HttpError(403, 'Cross-origin request rejected.');
}
export async function api(fn: () => Promise<unknown>) {
  try {
    const { currentUser } = await import('./auth');
    const user = await currentUser();
    const result = await withDatabaseRole(user?.role ?? 'auth', fn);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  }
  catch (error: any) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(x => x.path.join('.') + ': ' + x.message).join('; ') }, { status: 400 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    if (error.code === 'ER_DUP_ENTRY') return NextResponse.json({ error: 'This record already exists.' }, { status: 409 });
    if (error.code === 'ER_ROW_IS_REFERENCED_2') return NextResponse.json({ error: 'Referenced records cannot be deleted.' }, { status: 409 });
    if (error.sqlState === '45000' || error.code === 'ER_CHECK_CONSTRAINT_VIOLATED')
      return NextResponse.json({ error: error.sqlMessage ?? 'Database integrity rule rejected this operation.' }, { status: 409 });
    if (error.code === 'ER_LOCK_DEADLOCK' || error.code === 'ER_LOCK_WAIT_TIMEOUT')
      return NextResponse.json({ error: 'Stock is being updated. Retry with the same request key.' }, { status: 409 });
    console.error('Request failed:', error.code ?? error.message);
    return NextResponse.json({ error: 'A service is unavailable. Check the server logs and configuration.' }, { status: 503 });
  }
}
