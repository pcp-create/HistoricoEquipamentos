/** Alias must come from application source, never user input. JSON lookup supports staged migration. */
export function participantSql(job:'technician'|'seller',alias='web_user_access'){
 const values=job==='technician'?"'técnico','tecnico'":"'vendedor','vendedora'";
 const module=job==='technician'?'portal-tecnico':'visitas';
 return `(EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(NULLIF(to_jsonb(${alias})->'job_titles','null'::jsonb),jsonb_build_array(${alias}.job_title))) AS roles(title) WHERE lower(trim(title)) IN (${values})) AND (NULLIF(to_jsonb(${alias})->'modules','null'::jsonb) IS NULL OR (to_jsonb(${alias})->'modules') ? '${module}' ${job==='technician'?"OR (to_jsonb("+alias+")->'modules') ? 'tecnico'":''}))`;
}
