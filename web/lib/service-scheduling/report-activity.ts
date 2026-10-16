import 'server-only';
export const reportActivityMessage='Inicie ou retome a atividade desta operação para preencher o relatório técnico.';
export async function requireReportActivity(c:any,operationId:string,email:string){
 const active=(await c.query("SELECT id FROM web_field_sessions WHERE operation_id=$1 AND actor=$2 AND kind='work' AND state='running' FOR UPDATE",[operationId,email])).rows.length>0;
 if(!active)throw Error(reportActivityMessage);
}
