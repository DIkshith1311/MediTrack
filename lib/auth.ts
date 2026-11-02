import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { rows as queryRows, write as queryWrite } from './db';
import { tokenHash, verifyPassword } from './password';
import { HttpError } from './http';
const rows = <T = Record<string, any>>(sql: string, values: any[] = []) => queryRows<T>(sql, values, 'auth');
const write = (sql: string, values: any[] = []) => queryWrite(sql, values, 'auth');
export type User = { id: number; name: string; email: string; role: 'admin' | 'staff' };
export async function currentUser(): Promise<User | null> {
  const cookie = (await cookies()).get('meditrack_session')?.value;
  if (!cookie) return null;
  // Store only a digest of the bearer token, so a session table leak is not enough to log in.
  return (await rows<User>(`SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP() AND u.active=TRUE`, [tokenHash(cookie)]))[0] ?? null;
}
export async function requireUser(admin = false) {
  const user = await currentUser();
  if (!user) throw new HttpError(401, 'Sign in to continue.');
  if (admin && user.role !== 'admin') throw new HttpError(403, 'Administrator access required.');
  return user;
}
const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.COOKIE_SECURE === 'true', path: '/', maxAge: 28800 };
export async function login(email: string, password: string) {
  const identity = tokenHash(email.toLowerCase());
  await write('INSERT IGNORE INTO login_attempts(identity_hash,failures,window_start) VALUES(?,0,UTC_TIMESTAMP())', [identity]);
  await write('UPDATE login_attempts SET failures=0,window_start=UTC_TIMESTAMP() WHERE identity_hash=? AND window_start<UTC_TIMESTAMP()-INTERVAL 15 MINUTE', [identity]);
  // Atomically reserve an attempt before checking credentials.
  const reserved = await write('UPDATE login_attempts SET failures=failures+1 WHERE identity_hash=? AND failures<5', [identity]);
  if (!reserved.affectedRows) throw new HttpError(429, 'Too many attempts. Try again after 15 minutes.');
  const user = (await rows('SELECT id,name,email,password_hash,role,active FROM users WHERE email=? AND active=TRUE', [email.toLowerCase()]))[0];
  if (!user || !verifyPassword(password, user.password_hash)) throw new HttpError(401, 'Invalid email or password.');
  await write('DELETE FROM login_attempts WHERE identity_hash=?', [identity]);
  const token = randomBytes(32).toString('hex');
  await write('DELETE FROM sessions WHERE expires_at<=UTC_TIMESTAMP()');
  await write('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,UTC_TIMESTAMP()+INTERVAL 8 HOUR)', [tokenHash(token), user.id]);
  (await cookies()).set('meditrack_session', token, cookieOptions);
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get('meditrack_session')?.value;
  if (token) await write('DELETE FROM sessions WHERE token_hash=?', [tokenHash(token)]);
  jar.set('meditrack_session', '', { ...cookieOptions, maxAge: 0 });
}
