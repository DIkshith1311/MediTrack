import { api,checkOrigin } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { rows,write } from '@/lib/db';
import { medicineSchema,positiveId } from '@/lib/validation';
export async function GET(request: Request) { return api(async () => {
 await requireUser();
 const q = (new URL(request.url).searchParams.get('q') ?? '').slice(0,100);
 return rows(`SELECT * FROM inventory_summary WHERE active=TRUE AND (brand LIKE ? OR generic_name LIKE ? OR indications LIKE ?) ORDER BY brand`, ['%'+q+'%','%'+q+'%','%'+q+'%']);
}); }
export async function POST(request: Request) { return api(async () => {
 checkOrigin(request); await requireUser(true);
 const b=medicineSchema.parse(await request.json());
 const result=await write('INSERT INTO medicines(brand,generic_name,strength,dosage_form,description,indications,otc,reorder_level) VALUES(?,?,?,?,?,?,?,?)',Object.values(b));
 return { id: result.insertId, message: 'Medicine saved. Rebuild the search index from the Search tab.' };
}); }
export async function PATCH(request: Request) { return api(async () => {
 checkOrigin(request); await requireUser(true);
 const { id,...input }=await request.json(); const b=medicineSchema.parse(input);
 await write('UPDATE medicines SET brand=?,generic_name=?,strength=?,dosage_form=?,description=?,indications=?,otc=?,reorder_level=? WHERE id=?',[...Object.values(b),positiveId.parse(id)]);
 return { ok:true };
}); }
export async function DELETE(request: Request) { return api(async () => {
 checkOrigin(request); await requireUser(true);
 const {id}=await request.json();
 // Archive medicine definitions while retaining the history needed by existing invoices.
 await write('UPDATE medicines SET active=FALSE WHERE id=?',[positiveId.parse(id)]);
 return { ok:true };
}); }
