import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
// The environment must explicitly name a disposable test database; no fallback to the application database.
if(!process.env.TEST_DATABASE_URL)throw new Error('Set TEST_DATABASE_URL to a disposable database with both SQL scripts loaded.');
Object.assign(process.env,{NODE_ENV:'test'});
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
import { db,rows,write,transaction } from '../lib/db';
import { checkout } from '../lib/checkout';
let user:number,supplier:number;
const prefix='TEST-'+randomUUID().slice(0,8);
before(async()=>{
 user=(await write('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,\'staff\')',[prefix,prefix+'@example.test','not-a-login-hash'])).insertId;
 supplier=(await write('INSERT INTO suppliers(name,email,phone) VALUES(?,?,?)',[prefix,prefix+'@example.test','9000000000'])).insertId;
});
after(async()=>{await db().end();});
async function fixture(stock=10,days=30){
 const medicine=(await write('INSERT INTO medicines(brand,generic_name,strength,dosage_form,description,indications) VALUES(?,?,\'500 mg\',\'tablet\',\'test fixture\',\'fever\')',[prefix+randomUUID().slice(0,8),'Test ingredient'])).insertId;
 const batch=(await write(`INSERT INTO batches(medicine_id,supplier_id,batch_number,expiry_date,received_date,quantity,purchase_price_paise,selling_price_paise)
 VALUES(?,?,?,CURRENT_DATE()+INTERVAL ? DAY,CURRENT_DATE()-INTERVAL 100 DAY,?,100,150)`,[medicine,supplier,randomUUID(),days,stock])).insertId;
 return {medicine,batch};
}
const saleInput=(medicine:number,quantity:number,key=randomUUID())=>({request_key:key,items:[{medicine_id:medicine,quantity}]});
test('SQL trigger blocks expired stock even through direct INSERT',async()=>{
 const f=await fixture(10,-1);const s=(await write('INSERT INTO sales(user_id,request_key) VALUES(?,?)',[user,randomUUID()])).insertId;
 await assert.rejects(write('INSERT INTO sale_items(sale_id,batch_id,quantity,unit_price_paise) VALUES(?,?,1,1)',[s,f.batch]),/Expired/);
 assert.equal((await rows('SELECT quantity FROM batches WHERE id=?',[f.batch]))[0].quantity,10);
});
test('same-day expiry is blocked conservatively',async()=>{
 const f=await fixture(10,0);await assert.rejects(checkout(saleInput(f.medicine,1),user),/Insufficient/);
});
test('successful sale uses database price, totals, stock movement and completed status',async()=>{
 const f=await fixture();const result=await checkout(saleInput(f.medicine,3),user);
 assert.equal(Number(result.total_paise),450);assert.equal(result.status,'completed');
 assert.equal((await rows('SELECT quantity FROM batches WHERE id=?',[f.batch]))[0].quantity,7);
 const movements=await rows('SELECT quantity_delta FROM stock_movements WHERE batch_id=? ORDER BY id',[f.batch]);
 assert.deepEqual(movements.map(m=>m.quantity_delta),[10,-3]);
});
test('direct invoice line insertion overrides untrusted client price',async()=>{
 const f=await fixture();const s=(await write('INSERT INTO sales(user_id,request_key) VALUES(?,?)',[user,randomUUID()])).insertId;
 await write('INSERT INTO sale_items(sale_id,batch_id,quantity,unit_price_paise) VALUES(?,?,2,1)',[s,f.batch]);
 assert.equal((await rows('SELECT unit_price_paise FROM sale_items WHERE sale_id=?',[s]))[0].unit_price_paise,150);
});
test('multi-item failure rolls back the entire invoice and stock changes',async()=>{
 const first=await fixture(10);const second=await fixture(1);const key=randomUUID();
 await assert.rejects(checkout({request_key:key,items:[{medicine_id:first.medicine,quantity:3},{medicine_id:second.medicine,quantity:2}]},user),/Insufficient/);
 assert.equal((await rows('SELECT quantity FROM batches WHERE id=?',[first.batch]))[0].quantity,10);
 assert.equal((await rows('SELECT COUNT(*) AS n FROM sales WHERE request_key=?',[key]))[0].n,0);
});
test('FEFO allocates earliest usable expiry before later batches',async()=>{
 const f=await fixture(3,7);
 const later=(await write(`INSERT INTO batches(medicine_id,supplier_id,batch_number,expiry_date,received_date,quantity,purchase_price_paise,selling_price_paise)
 VALUES(?,?,?,CURRENT_DATE()+INTERVAL 90 DAY,CURRENT_DATE(),8,100,200)`,[f.medicine,supplier,randomUUID()])).insertId;
 const result=await checkout(saleInput(f.medicine,5),user);
 assert.equal((await rows('SELECT quantity FROM batches WHERE id=?',[f.batch]))[0].quantity,0);
 assert.equal((await rows('SELECT quantity FROM batches WHERE id=?',[later]))[0].quantity,6);
 assert.equal(Number(result.total_paise),3*150+2*200);
});
test('retry key returns the same invoice without deducting stock twice',async()=>{
 const f=await fixture();const input=saleInput(f.medicine,2);const a=await checkout(input,user),b=await checkout(input,user);
 assert.equal(a.id,b.id);assert.equal((await rows('SELECT quantity FROM batches WHERE id=?',[f.batch]))[0].quantity,8);
});
test('two simultaneous sales cannot oversell the final stock',async()=>{
 const f=await fixture(5);
 const result=await Promise.allSettled([checkout(saleInput(f.medicine,4),user),checkout(saleInput(f.medicine,4),user)]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await rows('SELECT quantity FROM batches WHERE id=?',[f.batch]))[0].quantity,1);
});
test('simultaneous retries produce one invoice',async()=>{
 const f=await fixture(10);const input=saleInput(f.medicine,2);
 const result=await Promise.all([checkout(input,user),checkout(input,user)]);
 assert.equal(result[0].id,result[1].id);assert.equal((await rows('SELECT quantity FROM batches WHERE id=?',[f.batch]))[0].quantity,8);
});
test('SQL check constraints and foreign keys reject corrupted stock',async()=>{
 const f=await fixture();
 await assert.rejects(write('UPDATE batches SET quantity=-1 WHERE id=?',[f.batch]),/constraint/i);
 await assert.rejects(write('DELETE FROM suppliers WHERE id=?',[supplier]),/foreign key/i);
});
test('invoice lines and completed invoices remain immutable',async()=>{
 const f=await fixture();const s=await checkout(saleInput(f.medicine,1),user);
 await assert.rejects(write('UPDATE sale_items SET quantity=2 WHERE sale_id=?',[s.id]),/immutable/);
 await assert.rejects(write('DELETE FROM sale_items WHERE sale_id=?',[s.id]),/immutable/);
 await assert.rejects(write('UPDATE sales SET total_paise=0 WHERE id=?',[s.id]),/immutable/);
});
test('direct overselling is rejected by the database trigger',async()=>{
 const f=await fixture(1);const s=(await write('INSERT INTO sales(user_id,request_key) VALUES(?,?)',[user,randomUUID()])).insertId;
 await assert.rejects(write('INSERT INTO sale_items(sale_id,batch_id,quantity,unit_price_paise) VALUES(?,?,2,1)',[s,f.batch]),/Insufficient/);
});
test('explicit transaction rollback preserves stock',async()=>{
 const f=await fixture();
 await assert.rejects(transaction(async c=>{await c.execute('UPDATE batches SET quantity=0 WHERE id=?',[f.batch]);throw new Error('simulated failure');}),/simulated/);
 assert.equal((await rows('SELECT quantity FROM batches WHERE id=?',[f.batch]))[0].quantity,10);
});
