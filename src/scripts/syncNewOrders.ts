import {m8Config} from '../config/env.js';
import {connectDatabase} from '../database/postgres.js';
import {M8Client} from '../m8/client.js';
import {SUMMARY_ENDPOINT} from '../m8/inventory.js';
import {summaryHeaders} from '../m8/collections.js';
import {insertNewOrders} from '../sync/newOrders.js';
import {log,safeError} from '../utils/logger.js';
async function main(){
 const config=m8Config(),db=await connectDatabase();
 let locked=false;
 try{
  locked=(await db.query<{locked:boolean}>('SELECT pg_try_advisory_lock(81009,0) AS locked')).rows[0]!.locked;
  if(!locked){log('NOVAS_OS','Coleta anterior ainda em andamento');return;}
  const start=Date.now();
  const responses=await Promise.allSettled(config.companies.map(async company=>({company,headers:summaryHeaders(await new M8Client(config,company).get(SUMMARY_ENDPOINT,{Page:0,PageSize:0}))})));
  for(let index=0;index<responses.length;index++){
   const response=responses[index]!;
   if(response.status==='rejected'){log('NOVAS_OS',safeError(response.reason),{company:config.companies[index]!});process.exitCode=1;continue;}
   const {company,headers}=response.value;
   try {
    const inserted=await insertNewOrders(db,company,headers,config.timeZone);
    log('NOVAS_OS','Descoberta concluída',{company,received:headers.length,inserted,elapsedMs:Date.now()-start});
   } catch(error) { log('NOVAS_OS',safeError(error),{company});process.exitCode=1; }
  }
 }finally{if(locked)await db.query('SELECT pg_advisory_unlock(81009,0)');await db.end();}
}
await main().catch(error=>{log('NOVAS_OS',safeError(error));process.exitCode=1;});
