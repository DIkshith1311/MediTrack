import { api,checkOrigin,HttpError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { rows,write } from '@/lib/db';
import { supplierSchema,positiveId } from '@/lib/validation';
export async function GET() { return api(async()=>{ await requireUser(); return rows('SELECT * FROM suppliers WHERE active=TRUE ORDER BY name'); }); }
export async function POST(request:Request) { return api(async()=>{checkOrigin(request);await requireUser(true);const b=supplierSchema.parse(await request.json());return {id:(await write('INSERT INTO suppliers(name,email,phone) VALUES(?,?,?)',Object.values(b))).insertId};}); }
export async function PATCH(request:Request) { return api(async()=>{checkOrigin(request);await requireUser(true);const {id,...input}=await request.json();const b=supplierSchema.parse(input);await write('UPDATE suppliers SET name=?,email=?,phone=? WHERE id=?',[...Object.values(b),positiveId.parse(id)]);return {ok:true};}); }
export async function DELETE(request:Request) { return api(async()=>{
 checkOrigin(request);await requireUser(true);const {id}=await request.json(); const supplierId=positiveId.parse(id);
 // Only unused suppliers can be physically removed; foreign keys protect procurement history.
 const refs=await rows('SELECT id FROM batches WHERE supplier_id=? LIMIT 1',[supplierId]);
 if(refs.length) throw new HttpError(409,'Supplier has batch history and cannot be deleted.');
 await write('DELETE FROM suppliers WHERE id=?',[supplierId]);return {ok:true};
}); }
