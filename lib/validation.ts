import { z } from 'zod';
export const positiveId = z.coerce.number().int().positive();
const text = (max: number) => z.string().trim().min(1).max(max);
export const medicineSchema = z.object({
 brand: text(100), generic_name: text(100), strength: text(50), dosage_form: text(50),
 description: text(2000), indications: text(255), otc: z.boolean(), reorder_level: z.number().int().min(0).max(100000)
});
export const supplierSchema = z.object({ name: text(120), email: z.email().max(254), phone: z.string().trim().regex(/^[+0-9 ()-]{7,20}$/) });
const date = z.iso.date();
export const batchSchema = z.object({
 medicine_id: positiveId, supplier_id: positiveId, batch_number: text(60),
 expiry_date: date, received_date: date, quantity: z.number().int().positive().max(100000),
 purchase_price_paise: z.number().int().positive().max(10000000), selling_price_paise: z.number().int().positive().max(10000000)
}).refine(x => x.expiry_date >= x.received_date, { message: 'Expiry must be after receipt.' })
.refine(x => x.selling_price_paise >= x.purchase_price_paise, { message: 'Selling price cannot be below purchase price.' });
export const checkoutSchema = z.object({ request_key: z.uuid(), items: z.array(z.object({ medicine_id: positiveId, quantity: z.number().int().positive().max(10000) })).min(1).max(50) })
.refine(x => new Set(x.items.map(i => i.medicine_id)).size === x.items.length, { message: 'Merge duplicate cart medicines.' });
export function money(paise: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100); }
