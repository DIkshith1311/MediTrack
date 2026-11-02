import { hashPassword } from '../lib/password';
import { transaction,withDatabaseRole,closePools } from '../lib/db';
import { reindex } from '../lib/vector';
const medicines=[
 ['Calmofen','Paracetamol','500 mg','tablet','Paracetamol for common fever and headache. Educational stock catalogue.','fever,headache',true,25],
 ['ParaRelief','Paracetamol','500 mg','tablet','Alternative brand with the same ingredient, strength and form.','fever,headache',true,20],
 ['FeverEase','Paracetamol','650 mg','tablet','Different strength; not equivalent to 500 mg.','fever,headache',true,20],
 ['AllerCalm','Cetirizine','10 mg','tablet','Antihistamine catalogue for allergy symptoms.','allergy,cold',true,15],
 ['CetiCare','Cetirizine','10 mg','tablet','Same-ingredient alternative brand for allergy.','allergy,cold',true,15],
 ['AcidGuard','Calcium carbonate','500 mg','chewable tablet','Antacid catalogue for acidity.','acidity',true,15],
 ['ThroatComfort','Menthol','5 mg','lozenge','Menthol lozenge catalogue for cough and throat irritation.','cough,cold',true,20],
 ['SalineMist','Sodium chloride','0.65%','nasal spray','Saline nasal spray catalogue for cold symptoms.','cold',true,12],
 ['Rehydra','Oral rehydration salts','WHO formula','sachet','Oral rehydration salt catalogue; pharmacist review required.','rehydration',true,20],
 ['GastroRx','Pantoprazole','40 mg','tablet','Prescription-only example. Excluded from symptom search.','acidity',false,15],
 ['PainRx','Diclofenac','50 mg','tablet','Prescription-only example. Excluded from OTC suggestions.','headache',false,15],
 ['ParaLiquid','Paracetamol','120 mg/5 ml','suspension','Different dosage form; never treated as tablet-equivalent.','fever',true,12]
];
async function main(){
 const bootstrap = process.env.SEED_DATABASE_URL ?? process.env.DATABASE_URL;
 if (!bootstrap) throw new Error('DATABASE_URL or SEED_DATABASE_URL is required for administrator-only seeding.');
 process.env.ADMIN_DATABASE_URL = bootstrap;
 const admin=process.env.DEMO_ADMIN_PASSWORD,staff=process.env.DEMO_STAFF_PASSWORD;
 if(!admin||!staff||[admin,staff].some(p=>p.length<12||p.startsWith('CHANGE_ME'))) throw new Error('Set demo passwords of at least 12 characters in .env.');
 if(admin===staff) throw new Error('Admin and staff passwords must differ.');
 await transaction(async c=>{
  for(const [name,email,role,password] of [['Administrator','admin@meditrack.local','admin',admin],['Pharmacy Staff','staff@meditrack.local','staff',staff]])
   await c.execute('INSERT INTO users(name,email,role,password_hash) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash)',[name,email,role,hashPassword(password)]);
  await c.execute("INSERT IGNORE INTO suppliers(name,email,phone) VALUES('Northstar Pharma','orders@northstar.example','+91 90000 10001'),('Careline Distribution','orders@careline.example','+91 90000 10002')");
  for(let i=0;i<medicines.length;i++){
   const m=medicines[i];
   await c.execute('INSERT IGNORE INTO medicines(brand,generic_name,strength,dosage_form,description,indications,otc,reorder_level) VALUES(?,?,?,?,?,?,?,?)',m);
   const [list]:any=await c.execute('SELECT id FROM medicines WHERE brand=?',[m[0]]);
   const [vendors]:any=await c.execute('SELECT id FROM suppliers WHERE name=?',[i%2?'Careline Distribution':'Northstar Pharma']);
   // Relative dates keep expiry and reorder demonstrations useful on any setup day.
   await c.execute(`INSERT IGNORE INTO batches(medicine_id,supplier_id,batch_number,expiry_date,received_date,quantity,purchase_price_paise,selling_price_paise)
   VALUES(?,?,?,DATE_ADD(CURRENT_DATE(),INTERVAL ? DAY),DATE_SUB(CURRENT_DATE(),INTERVAL 120 DAY),?,?,?)`,
   [list[0].id,vendors[0].id,'DEMO-'+(i+1)+'-A',i===0?15:180+i*10,i===3?5:80,1500+i*100,2000+i*100]);
   if(i===0) await c.execute(`INSERT IGNORE INTO batches(medicine_id,supplier_id,batch_number,expiry_date,received_date,quantity,purchase_price_paise,selling_price_paise)
    VALUES(?,?,?,DATE_SUB(CURRENT_DATE(),INTERVAL 3 DAY),DATE_SUB(CURRENT_DATE(),INTERVAL 120 DAY),12,1500,2000)`,[list[0].id,vendors[0].id,'DEMO-EXPIRED']);
  }
 });
 console.log('Seeded fictitious medicines and two users; passwords are read from your environment.');
 if(process.argv.includes('--with-vectors')) console.log(await reindex());
}
withDatabaseRole('admin',main).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(closePools);
