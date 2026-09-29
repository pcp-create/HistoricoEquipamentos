/** Keep existing scheduling readable before the optional approval migration is installed. */
export async function timeRequestsAvailable(db:any):Promise<boolean>{
 const result=await db.query("SELECT to_regclass('public.web_field_time_requests') IS NOT NULL AS available");
 return result.rows[0]?.available===true;
}
