import {m8Config,integer} from '../config/env.js';
import {connectDatabase} from '../database/postgres.js';
import {M8Client} from '../m8/client.js';
import {syncPurchases} from '../sync/purchases.js';
import {log,safeError} from '../utils/logger.js';
const config=m8Config();
const results=await Promise.allSettled(config.companies.map(async company=>{
 const db=await connectDatabase();
 try{const result=await syncPurchases(new M8Client(config,company),db,integer(process.env.M8_PURCHASES_DETAIL_BATCH,20,'M8_PURCHASES_DETAIL_BATCH',500));log('COMPRAS','Coleta concluída',{company,received:result.received??0,imported:result.imported??0,failed:result.failed??0,skipped:result.skipped??false});if('failed' in result&&result.failed)process.exitCode=1;}
 finally{await db.end();}
}));
for(const result of results)if(result.status==='rejected'){log('COMPRAS',safeError(result.reason));process.exitCode=1;}
