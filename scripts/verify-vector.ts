import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { embed } from '../lib/vector';
async function main(){
 const base=process.env.QDRANT_URL;
 if(!base)throw new Error('Load QDRANT_URL and EMBEDDING_URL from .env.');
 const collection='meditrack_verify_'+randomUUID().replaceAll('-','');
 async function api(path:string,method:string,body?:unknown){
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(process.env.QDRANT_API_KEY?{'api-key':process.env.QDRANT_API_KEY}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error('Vector verification request failed: HTTP '+response.status);
  return response.json();
 }
 let created=false;
 try{
  const vectors=await embed(['Fever and headache catalogue entry','Saline nasal spray catalogue entry']);
  assert.equal(vectors.length,2);assert.equal(vectors[0].length,384);
  await api('/collections/'+collection,'PUT',{vectors:{size:384,distance:'Cosine'}});created=true;
  await api('/collections/'+collection+'/points?wait=true','PUT',{points:[
   {id:1,vector:vectors[0],payload:{version:1}},{id:2,vector:vectors[1],payload:{version:1}}
  ]});
  const read=await api('/collections/'+collection+'/points/query','POST',{query:vectors[0],limit:1,with_payload:true});
  assert.equal(read.result.points[0].id,1);
  await api('/collections/'+collection+'/points?wait=true','PUT',{points:[{id:1,vector:vectors[1],payload:{version:2}}]});
  const updated=await api('/collections/'+collection+'/points','POST',{ids:[1],with_payload:true});
  assert.equal(updated.result[0].payload.version,2);
  await api('/collections/'+collection+'/points/delete?wait=true','POST',{points:[1]});
  const removed=await api('/collections/'+collection+'/points','POST',{ids:[1],with_payload:true});
  assert.equal(removed.result.length,0);
  console.log('PASS: real model embeddings and Qdrant create/read/update/delete (isolated temporary collection).');
 }finally{
  if(created)await api('/collections/'+collection,'DELETE');
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
