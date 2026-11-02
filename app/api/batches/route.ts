import { api,checkOrigin,HttpError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { rows,write,transaction } from '@/lib/db';
import { batchSchema,positiveId } from '@/lib/validation';
import { z } from 'zod';
export async function GET() { return api(async () => { await requireUser(); return rows(`SELECT b.*,m.brand,m.strength,s.name AS supplier,
 DATEDIFF(b.expiry_date,CURRENT_DATE()) AS days_remaining FROM batches b JOIN medicines m ON m.id=b.medicine_id
 JOIN suppliers s ON s.id=b.supplier_id ORDER BY b.expiry_date,b.id`); }); }
export async function POST(request: Request) { return api(async () => {
 checkOrigin(request); await requireUser(true);
 const b=batchSchema.parse(await request.json());
 const active = await rows('SELECT id FROM medicines WHERE id=? AND active=TRUE',[b.medicine_id]);
 const vendor = await rows('SELECT id FROM suppliers WHERE id=? AND active=TRUE',[b.supplier_id]);
 if (!active.length || !vendor.length) throw new HttpError(400,'Choose an active medicine and supplier.');
 const result=await write('INSERT INTO batches(medicine_id,supplier_id,batch_number,expiry_date,received_date,quantity,purchase_price_paise,selling_price_paise) VALUES(?,?,?,?,?,?,?,?)',Object.values(b));
 return {id:result.insertId};
}); }
export async function PATCH(request: Request) { return api(async () => {
 checkOrigin(request); const user=await requireUser(true);
 const body=z.object({id:positiveId,quantity:z.number().int().min(0).max(100000)}).parse(await request.json());
 await transaction(async c => {
  await c.execute('UPDATE batches SET quantity=? WHERE id=?',[body.quantity,body.id]);
  await c.execute('INSERT INTO audit_events(user_id,action,entity_id) VALUES(?,\'stock adjustment\',?)',[user.id,body.id]);
 });
 return {ok:true};
}); }
