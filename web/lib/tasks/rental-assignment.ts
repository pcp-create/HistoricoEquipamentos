import "server-only";
import type { PoolClient } from "pg";

// Identidade confirmada no cadastro; o nome de exibição pode ser editado.
export const RENTAL_ASSIGNEE = "atendimento@rjserranacompressores.com.br";
export async function assignNewRentalTasks(c: PoolClient, ids: string[]) {
  if (!ids.length) return;
  const result = await c.query(
    `UPDATE web_tasks t SET assigned_to=u.email,status='in_progress',
       first_assigned_at=now(),updated_at=now(),updated_by='Sistema'
     FROM web_task_origin_rules r JOIN web_user_access u ON u.email=r.assignee
     WHERE t.origin=r.origin AND u.enabled
       AND t.id=ANY($1::bigint[]) AND t.assigned_to IS NULL
       AND t.status <> 'completed' AND t.source_key NOT LIKE 'manual:%'
     RETURNING t.id,t.version,u.email,u.display_name`,
    [ids],
  );
  for (const t of result.rows) {
    await c.query(
      `INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name)
       VALUES($1,'Atribuição automática',$2,true,'Sistema','Sistema')`,
      [
        t.id,
        `Atribuído a: ${t.display_name || "Funcionário"}. Regra de atribuição por origem da tarefa.`,
      ],
    );
    await c.query(
      `INSERT INTO web_task_notifications(task_id,task_version,recipient) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
      [t.id, t.version, t.email],
    );
  }
}
