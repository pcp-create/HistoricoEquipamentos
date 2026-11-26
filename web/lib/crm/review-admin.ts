import 'server-only';

/** Check the current account, never a role supplied by the client. */
export async function isReviewAdmin(db: {query: (sql:string, values:any[])=>Promise<any>}, actor:string) {
 const result=await db.query("SELECT 1 FROM web_user_access WHERE email=$1 AND enabled=true AND role='admin'",[actor]);
 return result.rows.length>0;
}
