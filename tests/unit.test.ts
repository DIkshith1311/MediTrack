import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword,verifyPassword,tokenHash } from '../lib/password';
import { checkoutSchema,batchSchema,medicineSchema,money } from '../lib/validation';
import { checkOrigin,HttpError } from '../lib/http';
import { medicineText,fingerprint } from '../lib/vector';
import { randomUUID } from 'node:crypto';
test('password hashes are salted and verify only the correct password',()=>{
 const a=hashPassword('long-testing-password'),b=hashPassword('long-testing-password');
 assert.notEqual(a,b);assert.ok(verifyPassword('long-testing-password',a));assert.equal(verifyPassword('wrong',a),false);assert.equal(verifyPassword('wrong','broken'),false);
});
test('session hashes have fixed length without revealing the token',()=>{assert.equal(tokenHash('token').length,64);assert.notEqual(tokenHash('a'),tokenHash('b'));});
test('checkout rejects zero, fractional and negative quantities',()=>{
 for(const quantity of [0,-1,1.2])assert.equal(checkoutSchema.safeParse({request_key:randomUUID(),items:[{medicine_id:1,quantity}]}).success,false);
});
test('checkout rejects duplicate medicines, empty carts, and invalid retry keys',()=>{
 assert.equal(checkoutSchema.safeParse({request_key:randomUUID(),items:[]}).success,false);
 assert.equal(checkoutSchema.safeParse({request_key:'invalid',items:[{medicine_id:1,quantity:1}]}).success,false);
 assert.equal(checkoutSchema.safeParse({request_key:randomUUID(),items:[{medicine_id:1,quantity:1},{medicine_id:1,quantity:1}]}).success,false);
});
const batch={medicine_id:1,supplier_id:1,batch_number:'TEST',received_date:'2026-01-01',expiry_date:'2027-01-01',quantity:10,purchase_price_paise:100,selling_price_paise:120};
test('batch validation rejects impossible dates and prices',()=>{
 assert.ok(batchSchema.safeParse(batch).success);
 for(const patch of [{expiry_date:'2025-01-01'},{selling_price_paise:90},{quantity:-1},{expiry_date:'2026-02-30'}])assert.equal(batchSchema.safeParse({...batch,...patch}).success,false);
});
test('catalogue rejects blank names and negative thresholds',()=>{
 const medicine={brand:'Demo',generic_name:'Ingredient',strength:'500 mg',dosage_form:'tablet',description:'Test',indications:'fever',otc:true,reorder_level:10};
 assert.ok(medicineSchema.safeParse(medicine).success);
 assert.equal(medicineSchema.safeParse({...medicine,brand:'  '}).success,false);
 assert.equal(medicineSchema.safeParse({...medicine,reorder_level:-1}).success,false);
});
test('cross-origin writes are rejected',()=>{
 const previous=process.env.APP_ORIGIN;process.env.APP_ORIGIN='http://localhost:3000';
 assert.throws(()=>checkOrigin(new Request('http://localhost:3000/api/sales',{headers:{origin:'https://evil.example'}})),HttpError);
 assert.doesNotThrow(()=>checkOrigin(new Request('http://localhost:3000/api/sales',{headers:{origin:'http://localhost:3000'}})));
 if(previous===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=previous;
});
test('vector source fingerprints change when medical catalogue text changes',()=>{
 const medicine={brand:'Demo',generic_name:'Ingredient',strength:'500 mg',dosage_form:'tablet',description:'Headache entry',indications:'headache'};
 assert.ok(medicineText(medicine).includes('500 mg'));
 assert.notEqual(fingerprint(medicine),fingerprint({...medicine,strength:'650 mg'}));
});
test('money formatting uses paise without dropping fractional rupees',()=>{assert.ok(money(12345).includes('123.45'));});

function originEnvironment(mode: string, action: () => void) {
 const previousMode=process.env.NODE_ENV,previousOrigin=process.env.APP_ORIGIN;
 Object.assign(process.env,{NODE_ENV:mode,APP_ORIGIN:'http://localhost:3000'});
 try { action(); } finally {
  if(previousMode===undefined)delete (process.env as Record<string,string|undefined>).NODE_ENV;
  else Object.assign(process.env,{NODE_ENV:previousMode});
  if(previousOrigin===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=previousOrigin;
 }
}
test('development accepts the active loopback port and localhost aliases',()=>originEnvironment('development',()=>{
 for(const [target,origin] of [
  ['http://localhost:3001/api/auth','http://localhost:3001'],
  ['http://localhost:3001/api/auth','http://127.0.0.1:3001'],
  ['http://127.0.0.1:3000/api/auth','http://127.0.0.1:3000'],
  ['http://[::1]:3001/api/auth','http://[::1]:3001']
 ])assert.doesNotThrow(()=>checkOrigin(new Request(target,{headers:{origin,'sec-fetch-site':'same-origin'}})));
}));
test('development rejects a different local service, remote site or malformed origin',()=>originEnvironment('development',()=>{
 for(const origin of ['http://127.0.0.1:4000','http://localhost.attacker.example:3001','https://localhost:3001','null'])
  assert.throws(()=>checkOrigin(new Request('http://localhost:3001/api/auth',{headers:{origin}})),HttpError);
}));
test('cross-site browser writes remain blocked even for a configured origin',()=>originEnvironment('development',()=>{
 assert.throws(()=>checkOrigin(new Request('http://localhost:3000/api/auth',{headers:{origin:'http://localhost:3000','sec-fetch-site':'cross-site'}})),HttpError);
}));
test('production requires the configured origin without loopback exceptions',()=>originEnvironment('production',()=>{
 assert.throws(()=>checkOrigin(new Request('http://127.0.0.1:3001/api/auth',{headers:{origin:'http://127.0.0.1:3001'}})),HttpError);
 assert.doesNotThrow(()=>checkOrigin(new Request('http://internal:3000/api/auth',{headers:{origin:'http://localhost:3000'}})));
}));
