import { z } from 'zod';
import { api, checkOrigin } from '@/lib/http';
import { login, logout, currentUser } from '@/lib/auth';
export const runtime = 'nodejs';
export async function GET() { return api(async () => ({ user: await currentUser() })); }
export async function POST(request: Request) { return api(async () => {
 checkOrigin(request);
 const body = z.object({ email: z.email().max(254), password: z.string().min(1).max(128) }).parse(await request.json());
 return { user: await login(body.email,body.password) };
}); }
export async function DELETE(request: Request) { return api(async () => { checkOrigin(request); await logout(); return { ok: true }; }); }
