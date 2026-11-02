import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseRole,withDatabaseRole } from '../lib/database-role';
test('unscoped database operations default to the restricted authentication account',()=>{
 assert.equal(databaseRole(),'auth');
});
test('overlapping async requests retain different database roles',async()=>{
 let release!:()=>void;
 const barrier=new Promise<void>(resolve=>{release=resolve;});
 const staff=withDatabaseRole('staff',async()=>{await barrier;return databaseRole();});
 const admin=withDatabaseRole('admin',async()=>{release();await Promise.resolve();return databaseRole();});
 assert.deepEqual(await Promise.all([staff,admin]),['staff','admin']);
 assert.equal(databaseRole(),'auth');
});
test('nested scopes restore the caller role after success or failure',async()=>{
 await withDatabaseRole('staff',async()=>{
  assert.equal(withDatabaseRole('admin',()=>databaseRole()),'admin');
  assert.equal(databaseRole(),'staff');
  await assert.rejects(withDatabaseRole('admin',async()=>{throw new Error('failure');}),/failure/);
  assert.equal(databaseRole(),'staff');
 });
 assert.equal(databaseRole(),'auth');
});
