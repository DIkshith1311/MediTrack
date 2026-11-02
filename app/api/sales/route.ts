import { api,checkOrigin } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { rows } from '@/lib/db';
import { checkout,receipt } from '@/lib/checkout';
import { positiveId } from '@/lib/validation';
export async function GET(request:Request) { return api(async()=>{
 await requireUser();const id=new URL(request.url).searchParams.get('id');
 if(id) return receipt(positiveId.parse(id));
 return rows(`SELECT s.id,s.total_paise,s.created_at,u.name AS cashier FROM sales s JOIN users u ON u.id=s.user_id
 WHERE s.status='completed' ORDER BY s.id DESC LIMIT 100`);
}); }
export async function POST(request:Request) { return api(async()=>{checkOrigin(request);const user=await requireUser();return checkout(await request.json(),user.id);}); }
