import {randomUUID} from 'node:crypto';
import {database} from '../lib/db';
import {salesProjection} from '../lib/sales-projection/store';
const [period,approved,actor,reason]=process.argv.slice(2);
const db=database();
try{
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period||'')||!/^\d+\.\d{2}$/.test(approved||'')||!actor?.trim()||!reason?.trim())
  throw Error('Use: PERIODO TOTAL_COM_PONTO AUTOR JUSTIFICATIVA');
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
 if(period>=today.slice(0,7))throw Error('Somente competência encerrada.');
 const [year,month]=period.split('-').map(Number);
 const referenceDay=new Date(Date.UTC(year!,month!,0)).toISOString().slice(0,10);
 const document=await salesProjection(period,referenceDay);
 const cents=document.rows.reduce((sum,r)=>sum+Math.round(r.projection*100),0);
 if(!document.complete||cents!==Math.round(Number(approved)*100))throw Error('O recálculo por empresa não corresponde ao total autorizado; nenhuma correção foi gravada.');
 const id=randomUUID(),snapshotId=randomUUID(),label=`Correção de fechamento · ${period.split('-').reverse().join('/')}`;
 const correction={id,referenceDay,approvedTotal:cents/100,actor,reason,recordedAt:new Date().toISOString(),reconstructed:true};
 const correctedDocument={...document,closureCorrection:correction};
 const c=await db.connect();
 try{
  await c.query('BEGIN READ WRITE');
  const current=(await c.query('SELECT * FROM web_projection_month_closures WHERE period=$1 FOR UPDATE',[period])).rows[0];
  if(!current)throw Error('Fechamento original não encontrado.');
  if(current.document?.closureCorrection?.approvedTotal===cents/100){await c.query('ROLLBACK');console.log('Correção já registrada para esse valor.');}
  else{
   await c.query('INSERT INTO web_sales_projection_snapshots(id,period,label,created_by,document) VALUES($1,$2,$3,$4,$5)',[snapshotId,period,label,actor,JSON.stringify(correctedDocument)]);
   await c.query(`INSERT INTO web_projection_closure_corrections(id,period,previous_closure,corrected_closure,reason,actor)
    SELECT $1,c.period,to_jsonb(c),to_jsonb(c)||jsonb_build_object('snapshot_id',s.id,'label',s.label,'captured_at',s.created_at,'document',s.document),$3,$4
    FROM web_projection_month_closures c JOIN web_sales_projection_snapshots s ON s.id=$2 WHERE c.period=$5`,[id,snapshotId,reason,actor,period]);
   await c.query("SELECT set_config('app.projection_closure_correction',$1,true)",[id]);
   await c.query(`UPDATE web_projection_month_closures c SET snapshot_id=n.snapshot_id,label=n.label,captured_at=n.captured_at,document=n.document
    FROM web_projection_closure_corrections a CROSS JOIN LATERAL jsonb_populate_record(NULL::web_projection_month_closures,a.corrected_closure) n
    WHERE a.id=$1 AND c.period=a.period`,[id]);
   await c.query('COMMIT');console.log(JSON.stringify({period,total:cents/100,correctionId:id,snapshotId,referenceDay,rows:document.rows.map(r=>({company:r.company,projection:r.projection}))}));
  }
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}catch(e){console.error(e instanceof Error?e.message:'Falha na correção de fechamento.');process.exitCode=1;}finally{await db.end();}
