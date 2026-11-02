import { api,checkOrigin,HttpError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { positiveId } from '@/lib/validation';
import { vectorSearch,reindex } from '@/lib/vector';
export async function GET(request:Request){return api(async()=>{
 await requireUser();const p=new URL(request.url).searchParams;
 const mode=p.get('mode')??'semantic';const q=(p.get('q')??'').trim().slice(0,200);
 if(!['semantic','substitute','symptom'].includes(mode)) throw new HttpError(400,'Unknown search mode.');
 if(mode!=='substitute'&&!q) throw new HttpError(400,'Enter a search query.');
 if(mode==='symptom'&&!['fever','cold','cough','headache','acidity','allergy'].includes(q.toLowerCase())) throw new HttpError(400,'Choose a supported symptom.');
 return vectorSearch(q.toLowerCase(),mode,p.get('source')?positiveId.parse(p.get('source')):undefined);
});}
export async function POST(request:Request){return api(async()=>{checkOrigin(request);await requireUser(true);return reindex();});}
