import "server-only";
/** Called in the same transaction as the task change; never guesses the workshop entry. */
export async function recordWorkshopTaskEvent(
  c: any,
  id: string,
  source: string,
  title: string,
  description: string,
  actor: string,
) {
  const visit = source.match(
    /^manual:workshop:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):/i,
  )?.[1];
  if (!visit) return;
  await c.query(
    `INSERT INTO web_workshop_events(visit_id,action,actor,document)
 SELECT v.id,'Tarefa TAR-'||t.id::text||' · '||$3::text,$4,jsonb_build_object('taskId',t.id::text,'taskType',t.task_type,'taskTitle',t.title,'status',t.status,'stageId',t.stage_id,'priority',t.priority,'approvalState',t.approval_state,'assignedTo',t.assigned_to,'notes',$5::text)
 FROM web_tasks t JOIN web_workshop_visits v ON v.id=$2::uuid WHERE t.id=$1`,
    [id, visit, title, actor, description],
  );
}

export async function listWorkshopEvents(
  db: any,
  ids: string[],
  admin: boolean,
): Promise<any[]> {
  return (
    await db.query(
      `SELECT e.*,COALESCE(u.display_name,e.actor) actor_name FROM web_workshop_events e LEFT JOIN web_user_access u ON u.email=e.actor WHERE visit_id=ANY($1::uuid[]) AND ($2::boolean OR NOT EXISTS(SELECT 1 FROM web_tasks t WHERE t.id::text=e.document->>'taskId' AND t.restricted)) ORDER BY e.created_at DESC,e.id DESC`,
      [ids, admin],
    )
  ).rows;
}
