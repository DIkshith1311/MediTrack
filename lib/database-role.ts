import { AsyncLocalStorage } from 'node:async_hooks';
export type DatabaseRole = 'auth' | 'admin' | 'staff';
const roles = new AsyncLocalStorage<DatabaseRole>();
export function databaseRole(): DatabaseRole { return roles.getStore() ?? 'auth'; }
export function withDatabaseRole<T>(role: DatabaseRole, action: () => T): T {
  // Scope the role to this request's asynchronous work; never change a shared pool's credentials.
  return roles.run(role, action);
}
