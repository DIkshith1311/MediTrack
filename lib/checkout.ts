import { type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { transaction, rows } from './db';
import { checkoutSchema } from './validation';
import { HttpError } from './http';
type Sale = { id:number; user_id:number; request_key:string; status:string; total_paise:number; created_at:string; cashier:string };
export async function receipt(id: number) {
 const sale = (await rows<Sale>('SELECT s.*,u.name AS cashier FROM sales s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.status=\'completed\'', [id]))[0];
 if (!sale) throw new HttpError(404, 'Invoice not found.');
 return { ...sale, items: await rows(`SELECT i.quantity,i.unit_price_paise,i.line_total_paise,b.batch_number,m.brand,m.strength
 FROM sale_items i JOIN batches b ON b.id=i.batch_id JOIN medicines m ON m.id=b.medicine_id WHERE i.sale_id=? ORDER BY i.id`, [id]) };
}
export async function checkout(input: unknown, userId: number) {
 const cart = checkoutSchema.parse(input);
 let saleId: number;
 try {
  saleId = await transaction(async connection => {
   const [existing] = await connection.execute<RowDataPacket[]>('SELECT id,user_id FROM sales WHERE request_key=?', [cart.request_key]);
   if (existing[0]) {
    if (existing[0].user_id !== userId) throw new HttpError(409, 'Request key is already used.');
    return existing[0].id;
   }
   const [sale] = await connection.execute<ResultSetHeader>('INSERT INTO sales(user_id,request_key) VALUES(?,?)', [userId,cart.request_key]);
   // Lock medicines in a stable order to reduce deadlocks between overlapping carts.
   for (const item of [...cart.items].sort((a,b) => a.medicine_id-b.medicine_id)) {
    const [medicineSets] = await connection.execute<RowDataPacket[][]>('CALL lock_sale_medicine(?)', [item.medicine_id]);
    const medicines = medicineSets[0];
    if (!medicines.length) throw new HttpError(409, 'Medicine is inactive or missing.');
    const [batchSets] = await connection.execute<RowDataPacket[][]>('CALL lock_sale_batches(?)', [item.medicine_id]);
    const batches = batchSets[0];
    if (batches.reduce((sum,b) => sum+b.quantity,0) < item.quantity) throw new HttpError(409, 'Insufficient usable stock for medicine #' + item.medicine_id);
    let remaining = item.quantity;
    // FEFO consumes the earliest usable expiry first; expired batches never enter allocation.
    for (const batch of batches) {
     if (!remaining) break;
     const take = Math.min(remaining,batch.quantity);
     await connection.execute('INSERT INTO sale_items(sale_id,batch_id,quantity,unit_price_paise) VALUES(?,?,?,?)', [sale.insertId,batch.id,take,batch.selling_price_paise]);
     remaining -= take;
    }
   }
   await connection.execute('UPDATE sales SET status=\'completed\' WHERE id=?', [sale.insertId]);
   await connection.execute('INSERT INTO audit_events(user_id,action,entity_id) VALUES(?,\'checkout\',?)', [userId,sale.insertId]);
   return sale.insertId;
  });
 } catch (error: any) {
  // A concurrent retry can win the unique-key race; return the committed invoice.
  if (error.code !== 'ER_DUP_ENTRY') throw error;
  const previous = (await rows('SELECT id FROM sales WHERE request_key=? AND user_id=? AND status=\'completed\'', [cart.request_key,userId]))[0];
  if (!previous) throw error;
  saleId = previous.id;
 }
 return receipt(saleId);
}
