import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import { rows,write,closePools } from '../lib/db';
after(closePools);
test('each runtime account activates its own MySQL default role',async()=>{
 for(const role of ['auth','staff','admin'] as const){
  const [identity]=await rows('SELECT CURRENT_USER() AS account,CURRENT_ROLE() AS roles',[],role);
  assert.ok(identity.account.startsWith('meditrack_'+role+'@'));
  assert.ok(identity.roles.includes('meditrack_'+role+'_role'));
 }
});
test('staff can read current inventory but cannot alter medicines or batch stock',async()=>{
 await rows('SELECT id,available FROM inventory_summary LIMIT 1',[],'staff');
 for(const sql of ['UPDATE medicines SET reorder_level=0 WHERE id=0','UPDATE batches SET quantity=0 WHERE id=0']){
  await assert.rejects(write(sql,[],'staff'),(e:any)=>e.errno===1142||e.errno===1143);
 }
});
test('staff and admin cannot read password hashes or elevate application roles',async()=>{
 for(const role of ['staff','admin'] as const){
  await assert.rejects(rows('SELECT password_hash FROM users LIMIT 1',[],role),(e:any)=>e.errno===1142||e.errno===1143);
  await assert.rejects(write("UPDATE users SET role='admin' WHERE id=0",[],role),(e:any)=>e.errno===1142||e.errno===1143);
 }
});
test('authentication account cannot read pharmacy inventory',async()=>{
 await assert.rejects(rows('SELECT id FROM medicines LIMIT 1',[],'auth'),(e:any)=>e.errno===1142||e.errno===1143);
 await rows('SELECT id,email,password_hash FROM users WHERE id=0',[],'auth');
});
test('staff can call protected lock routines inside a transaction',async()=>{
 const connection=await (await import('../lib/db')).db('staff').getConnection();
 try{await connection.beginTransaction();await connection.execute('CALL lock_sale_medicine(?)',[0]);await connection.execute('CALL lock_sale_batches(?)',[0]);await connection.rollback();}
 finally{connection.release();}
});
test('admin catalogue privileges succeed without modifying any record',async()=>{
 await write('UPDATE medicines SET reorder_level=0 WHERE id=0',[],'admin');
 await write('UPDATE batches SET quantity=0 WHERE id=0',[],'admin');
});
