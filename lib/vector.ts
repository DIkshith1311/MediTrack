import { createHash } from 'node:crypto';
import { rows } from './db';
import { HttpError } from './http';
const collection='meditrack_medicines';
export function medicineText(m: Record<string,any>) { return [m.brand,m.generic_name,m.strength,m.dosage_form,m.description,m.indications].join('. '); }
export function fingerprint(m: Record<string,any>) { return createHash('sha256').update(medicineText(m)).digest('hex'); }
async function qdrant(path:string,method='GET',body?:unknown) {
 const base=process.env.QDRANT_URL;
 if(!base) throw new HttpError(503,'QDRANT_URL is not configured.');
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(process.env.QDRANT_API_KEY?{'api-key':process.env.QDRANT_API_KEY}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000),cache:'no-store'});
 if(!response.ok) throw new HttpError(503,'Vector index is unavailable. Start Qdrant and rebuild the index.');
 return response.json();
}
export async function embed(texts:string[]):Promise<number[][]>{
 if(!process.env.EMBEDDING_URL) throw new HttpError(503,'EMBEDDING_URL is not configured.');
 const response=await fetch(process.env.EMBEDDING_URL+'/embed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texts}),signal:AbortSignal.timeout(60000)});
 if(!response.ok) throw new HttpError(503,'Embedding service is unavailable.');
 const {vectors}=await response.json();
 if(!Array.isArray(vectors)||vectors.length!==texts.length||vectors.some((v:any)=>!Array.isArray(v)||v.length!==384||v.some((n:any)=>typeof n!=='number'||!Number.isFinite(n))))
 throw new HttpError(503,'Embedding service returned invalid vectors.');
 return vectors;
}
export async function reindex(){
 const medicines=await rows('SELECT * FROM medicines WHERE active=TRUE ORDER BY id');
 // Upsert first, then remove inactive IDs: a failed rebuild preserves previous searchable points.
 await qdrant('/collections/'+collection,'PUT',{vectors:{size:384,distance:'Cosine'}}).catch(async(error)=>{
  const existing=await qdrant('/collections/'+collection);
  if(existing.result?.config?.params?.vectors?.size!==384) throw error;
 });
 for (const [field_name,field_schema] of [['otc','bool'],['generic_name','keyword'],['strength','keyword'],['dosage_form','keyword']])
  await qdrant('/collections/'+collection+'/index?wait=true','PUT',{field_name,field_schema});
 for(let offset=0;offset<medicines.length;offset+=32){
  const batch=medicines.slice(offset,offset+32);
  const vectors=await embed(batch.map(medicineText));
  await qdrant('/collections/'+collection+'/points?wait=true','PUT',{points:batch.map((m,i)=>({id:m.id,vector:vectors[i],payload:{medicine_id:m.id,brand:m.brand,generic_name:m.generic_name,strength:m.strength,dosage_form:m.dosage_form,otc:Boolean(m.otc),fingerprint:fingerprint(m)}}))});
 }
 await qdrant('/collections/'+collection+'/points/delete?wait=true','POST',{filter:{must_not:[{has_id:medicines.map(m=>m.id)}]}});
 return {indexed:medicines.length,model:'sentence-transformers/all-MiniLM-L6-v2',dimensions:384};
}
export async function vectorSearch(query:string,mode:string,sourceId?:number){
 let source:Record<string,any>|undefined;
 if(mode==='substitute'){
  if(!sourceId) throw new HttpError(400,'Choose a source medicine.');
  source=(await rows('SELECT * FROM medicines WHERE id=? AND active=TRUE',[sourceId]))[0];
  if(!source) throw new HttpError(404,'Source medicine not found.');
  query=medicineText(source);
 }
 const [vector]=await embed([query]);
 const filter=mode==='symptom'?{must:[{key:'otc',match:{value:true}}]}:undefined;
 const result=await qdrant('/collections/'+collection+'/points/query','POST',{query:vector,limit:100,with_payload:true,score_threshold:mode==='substitute'?0:0.25,...(filter?{filter}:{})});
 const points=result.result?.points??[];
 if(!points.length) return {results:[],warning:'No indexed matches. Rebuild the index after inventory changes.'};
 const ids=points.map((p:any)=>Number(p.id));
 const live=await rows('SELECT * FROM inventory_summary WHERE active=TRUE AND available>0 AND id IN ('+ids.map(()=>'?').join(',')+')',ids);
 const scores=new Map(points.map((p:any)=>[Number(p.id),p]));
 let stale=false;
 const results=live.filter(m=>{
  const point:any=scores.get(m.id);
  // Ignore vectors whose source text changed; SQL remains the current source of truth.
  if(point.payload?.fingerprint!==fingerprint(m)){stale=true;return false;}
  if(source) return m.id!==source.id&&m.generic_name===source.generic_name&&m.strength===source.strength&&m.dosage_form===source.dosage_form;
  // Similar meaning is not clinical equivalence: symptom mode also requires a curated indication.
  if(mode==='symptom') return Boolean(m.otc)&&m.indications.toLowerCase().split(',').map((s:string)=>s.trim()).includes(query.toLowerCase());
  return true;
 }).map(m=>({...m,score:(scores.get(m.id) as any).score})).sort((a,b)=>b.score-a.score).slice(0,12);
 return {results,warning:stale?'Some medicines changed; rebuild the vector index.':null};
}
