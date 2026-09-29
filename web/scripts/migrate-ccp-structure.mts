// Run from repository root: node --env-file=.env --import tsx web/scripts/migrate-ccp-structure.mts
import {connectDatabase} from '../../src/database/postgres';
import {repairCcpStructure} from '../lib/service-scheduling/ccp-structure';
import {validateChecklists} from '../lib/service-scheduling/checklists';
const db=await connectDatabase();
try {
 await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(728001)');
 const before=(await db.query('SELECT document FROM web_service_schedule_settings WHERE id=1 FOR UPDATE')).rows[0].document;
 const checklists=before.checklists.map(repairCcpStructure);validateChecklists(checklists);
 const changed=JSON.stringify(checklists)!==JSON.stringify(before.checklists);
 if(changed)await db.query("UPDATE web_service_schedule_settings SET document=jsonb_set(document,'{checklists}',$1::jsonb),version=version+1,updated_at=now() WHERE id=1",[JSON.stringify(checklists)]);
 await db.query('COMMIT');console.log(JSON.stringify({updated:changed,checklists:checklists.length}));
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
