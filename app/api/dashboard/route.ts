import { api } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { rows } from '@/lib/db';
export async function GET() { return api(async()=>{
 await requireUser();
 const [counts]=await rows(`SELECT COUNT(*) AS medicines,COALESCE(SUM(available),0) AS units,
 SUM(available<=reorder_level) AS low_stock,COALESCE(SUM(expired),0) AS expired_units FROM inventory_summary WHERE active=TRUE`);
 const [today]=await rows(`SELECT COUNT(*) AS invoices,COALESCE(SUM(total_paise),0) AS revenue_paise FROM sales
 WHERE status='completed' AND DATE(created_at)=CURRENT_DATE()`);
 return {counts,today,expiring:await rows(`SELECT b.id,m.brand,b.batch_number,b.quantity,b.expiry_date,
 DATEDIFF(b.expiry_date,CURRENT_DATE()) AS days_remaining FROM batches b JOIN medicines m ON m.id=b.medicine_id
 WHERE b.quantity>0 AND b.expiry_date<=CURRENT_DATE()+INTERVAL 30 DAY ORDER BY b.expiry_date LIMIT 50`),
 reorder:await rows('SELECT * FROM reorder_analysis ORDER BY available,brand'),
 revenue:await rows(`SELECT DATE(created_at) AS day,SUM(total_paise) AS total FROM sales WHERE status='completed'
 AND created_at>=CURRENT_DATE()-INTERVAL 7 DAY GROUP BY DATE(created_at) ORDER BY day`)};
 }); }
