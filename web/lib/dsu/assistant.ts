import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { database } from "../db";
import {
  createTask,
  updateTask,
  TaskInputError,
  TaskConflict,
} from "../tasks/store";
import { Forbidden } from "../auth";
import { PUBLIC_SYSTEM_URL } from "../public-url";
import { dueDate, phoneKey, type Incoming } from "./protocol";

type Choice = { title: string; value: string; description?: string };
type State = {
  step?: string;
  draft?: any;
  choices?: Choice[];
  nonce?: string;
  page?: number;
  search?: string;
  task?: { id: string; version: number };
};
export type Reply = {
  endpoint: "sendText" | "sendList" | "sendButtons";
  body: Record<string, unknown>;
};
const name = "Assistente RJ (DSU)";
const footer = "Digital Support Unit · Digite Menu ou Cancelar";
const clip = (s: string, n: number) => [...s].slice(0, n).join("");
const dateLabel = (value: any) =>
  value
    ? (value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value).slice(0, 10)
      )
        .split("-")
        .reverse()
        .join("/")
    : "Sem vencimento";

async function respond(
  c: PoolClient,
  event: Incoming,
  state: State,
  actor: any,
): Promise<Reply> {
  const text = (message: string): Reply => ({
    endpoint: "sendText",
    body: { number: event.phone, text: `*${name}*\n\n${message}` },
  });
  const menu = (
    description: string,
    choices: Choice[],
    buttons = false,
  ): Reply => {
    state.nonce = randomUUID();
    state.choices = choices;
    const id = (i: number) => `dsu:${state.nonce}:${i}`;
    if (buttons)
      return {
        endpoint: "sendButtons",
        body: {
          number: event.phone,
          title: name,
          description,
          footer,
          buttons: choices.map((choice, i) => ({
            type: "reply",
            displayText: clip(choice.title, 20),
            id: id(i),
          })),
        },
      };
    return {
      endpoint: "sendList",
      body: {
        number: event.phone,
        title: name,
        description,
        footerText: footer,
        buttonText: "Ver opções",
        sections: [
          {
            title: "Escolha uma opção",
            rows: choices.map((choice, i) => ({
              title: clip(choice.title, 24),
              description: clip(choice.description || choice.title, 72),
              rowId: id(i),
            })),
          },
        ],
      },
    };
  };
  const home = () => {
    state.step = "home";
    state.draft = undefined;
    state.task = undefined;
    return menu(
      actor
        ? `Olá, ${actor.display_name || "colaborador"}! Como posso ajudar?`
        : "Olá! Sou o assistente digital da RJ Compressores. Como posso ajudar?",
      actor
        ? [{ title: "Tarefas", value: "tasks" }]
        : [
            { title: "Atendimento técnico", value: "client:support" },
            { title: "Solicitar orçamento", value: "client:quote" },
            { title: "Falar com a equipe", value: "client:team" },
          ],
    );
  };
  let input = event.text;
  if (/^(menu|cancelar|voltar|0)$/i.test(input)) return home();
  if (input.startsWith("dsu:")) {
    const [, nonce, index] = input.split(":");
    if (
      nonce !== state.nonce ||
      !/^\d+$/.test(index) ||
      !state.choices?.[Number(index)]
    )
      return text("Essa opção expirou. Digite Menu para recomeçar.");
    input = state.choices[Number(index)].value;
  } else if (
    state.choices &&
    /^\d+$/.test(input) &&
    Number(input) > 0 &&
    Number(input) <= state.choices.length
  )
    input = state.choices[Number(input) - 1].value;
  // IDs de ações não são interpretados em campos livres.
  const taskMenu = () => {
    state.step = "tasks";
    state.draft = undefined;
    return menu("O que deseja fazer?", [
      { title: "Criar tarefa", value: "create" },
      { title: "Minhas tarefas", value: "mine:0" },
      { title: "Concluir tarefa", value: "complete" },
    ]);
  };
  if (!actor) {
    if (state.step === "home" && input.startsWith("client:"))
      return text(
        "O atendimento ao cliente ainda está em preparação. Nenhuma solicitação foi aberta. Entre em contato com a equipe pelo canal habitual. Digite Menu para voltar.",
      );
    return home();
  }
  const auth = {
    id: actor.user_id || actor.email,
    email: actor.email,
    user_metadata: { display_name: actor.display_name },
  };
  const readTask = async (id: string) => {
    await c.query("SELECT pg_advisory_xact_lock(81021,1)");
    const t = (
      await c.query(
        "SELECT t.*,s.name stage_name FROM web_tasks t LEFT JOIN web_task_stages s ON s.id=t.stage_id WHERE t.id=$1 FOR UPDATE OF t",
        [id],
      )
    ).rows[0];
    if (!t || (actor.role !== "admin" && t.assigned_to !== actor.email))
      return null;
    return t;
  };
  const completion = async (id: string) => {
    const t = await readTask(id);
    if (!t)
      return text("Tarefa não encontrada ou sem permissão para concluir.");
    if (t.restricted && actor.role !== "admin")
      return text(
        "Essa tarefa é restrita. A conclusão deve ser realizada no sistema por um usuário autorizado.",
      );
    if (t.status === "completed") return text("Essa tarefa já está concluída.");
    if (!t.source_key.startsWith("manual:"))
      return text(
        "Essa tarefa é concluída automaticamente quando a pendência de origem é resolvida. Acesse o sistema para tratar a origem.",
      );
    state.step = "confirm-complete";
    state.task = { id: String(t.id), version: t.version };
    return menu(
      `Concluir TAR-${t.id} — ${clip(t.title, 160)}?`,
      [
        { title: "Confirmar", value: "confirm" },
        { title: "Cancelar", value: "cancel" },
      ],
      true,
    );
  };
  const direct = /^concluir\s+(?:tarefa\s+)?(?:tar[- ]?)?(\d{1,18})$/i.exec(
    input,
  );
  if (direct) return completion(direct[1]);
  if (state.step === "home" && input === "tasks") return taskMenu();
  if (
    ["tasks", "mine"].includes(state.step || "") &&
    /^mine:\d{1,6}$/.test(input)
  ) {
    const page = Number(input.split(":")[1]);
    const rows = (
      await c.query(
        `SELECT t.id,t.title,t.restricted,t.due_date,t.status,s.name stage_name FROM web_tasks t LEFT JOIN web_task_stages s ON s.id=t.stage_id WHERE t.assigned_to=$1 AND t.status<>'completed' ORDER BY t.due_date NULLS LAST,t.id LIMIT 9 OFFSET $2`,
        [actor.email, page * 8],
      )
    ).rows;
    state.step = "mine";
    if (!rows.length)
      return text(
        "Você não possui tarefas em aberto nesta página. Digite Menu para voltar.",
      );
    const choices: Choice[] = rows.slice(0, 8).map((t) => ({
      title: `TAR-${t.id}`,
      value: `task:${t.id}`,
      description:
        t.restricted && actor.role !== "admin"
          ? "Tarefa restrita"
          : `${dateLabel(t.due_date)} · ${t.title}`,
    }));
    if (page)
      choices.push({ title: "Página anterior", value: `mine:${page - 1}` });
    if (rows.length > 8)
      choices.push({ title: "Próxima página", value: `mine:${page + 1}` });
    return menu(
      "Suas tarefas em aberto. Selecione uma para consultar.",
      choices,
    );
  }
  if (state.step === "mine" && /^task:\d{1,18}$/.test(input)) {
    const t = await readTask(input.slice(5));
    if (!t) return text("Tarefa não encontrada ou sem permissão.");
    if (t.restricted && actor.role !== "admin")
      return text(
        `TAR-${t.id} · Tarefa restrita\nResponsável: ${actor.display_name || "Você"}\nStatus: ${{ not_started: "Não iniciado", in_progress: "Em andamento", completed: "Concluída" }[t.status as string] || "Em aberto"}`,
      );
    const note = (
      await c.query(
        "SELECT description FROM web_task_notes WHERE task_id=$1 AND title='Tarefa manual criada' ORDER BY id LIMIT 1",
        [t.id],
      )
    ).rows[0];
    return text(
      `TAR-${t.id} — ${t.title}\nEtapa: ${t.stage_name || "Não definida"}\nVencimento: ${dateLabel(t.due_date)}\n${clip(note?.description || "", 3000)}\n\n${PUBLIC_SYSTEM_URL}/tarefas?task=${t.id}\nPara concluir, digite: Concluir TAR-${t.id}`,
    );
  }
  if (state.step === "tasks" && input === "complete") {
    state.step = "complete-id";
    state.choices = undefined;
    return text(
      "Qual tarefa deseja concluir? Digite o código, por exemplo TAR-1521.",
    );
  }
  if (state.step === "complete-id") {
    const m = /^(?:TAR[- ]?)?(\d{1,18})$/i.exec(input);
    return m
      ? completion(m[1])
      : text("Informe um código válido, por exemplo TAR-1521.");
  }
  if (state.step === "confirm-complete") {
    if (input === "cancel") return home();
    if (input !== "confirm" || !state.task)
      return text("Selecione Confirmar ou Cancelar na mensagem anterior.");
    const t = await readTask(state.task.id);
    if (!t || (t.restricted && actor.role !== "admin")) return home();
    await updateTask(
      {
        id: state.task.id,
        version: state.task.version,
        action: "move",
        column: "completed",
      },
      auth,
      c,
    );
    const id = state.task.id;
    state.step = "home";
    state.task = undefined;
    state.choices = undefined;
    return text(`✅ TAR-${id} concluída.\nDigite Menu para continuar.`);
  }
  const recipients = async (page = 0, search = "") => {
    state.step = "assignee";
    state.page = page;
    state.search = search;
    const users = (
      await c.query(
        "SELECT email,display_name FROM web_user_access WHERE enabled AND coalesce(phone,'')<>'' AND ($1='' OR strpos(lower(coalesce(display_name,'') || ' ' || email),lower($1))>0) ORDER BY display_name NULLS LAST,email LIMIT 8 OFFSET $2",
        [search, page * 7],
      )
    ).rows;
    const choices: Choice[] = [
      { title: "Para mim", value: `user:${actor.email}` },
    ];
    choices.push(
      ...users.slice(0, 7).map((u) => ({
        title: u.display_name || u.email,
        value: `user:${u.email}`,
        description: u.display_name || u.email,
      })),
    );
    if (page)
      choices.push({ title: "Página anterior", value: `users:${page - 1}` });
    if (users.length > 7)
      choices.push({ title: "Próxima página", value: `users:${page + 1}` });
    return menu(
      "Para quem deseja atribuir? Selecione ou digite um nome para pesquisar.",
      choices,
    );
  };
  if (state.step === "tasks" && input === "create") {
    state.step = "title";
    state.draft = {};
    state.choices = undefined;
    return text(
      "Qual tarefa você quer criar? Escreva um título (até 160 caracteres).",
    );
  }
  if (state.step === "title") {
    if (input.length > 160)
      return text("O título deve ter até 160 caracteres.");
    state.draft = { title: input };
    return recipients();
  }
  if (state.step === "assignee") {
    if (/^users:\d{1,6}$/.test(input))
      return recipients(Number(input.split(":")[1]), state.search);
    if (
      input.startsWith("user:") &&
      state.choices?.some((x) => x.value === input)
    ) {
      const u = (
        await c.query(
          "SELECT email,display_name FROM web_user_access WHERE email=$1 AND enabled AND coalesce(phone,'')<>''",
          [input.slice(5)],
        )
      ).rows[0];
      if (!u) return recipients();
      state.draft = {
        ...state.draft,
        assignedTo: u.email,
        assignedName: u.display_name || u.email,
      };
      state.step = "description";
      state.choices = undefined;
      return text("Agora digite o descritivo da tarefa.");
    }
    return recipients(0, input.slice(0, 100));
  }
  if (state.step === "description") {
    state.draft.description = input;
    state.step = "due";
    return text(
      "Qual a data de vencimento? Digite DD/MM/AAAA, hoje ou amanhã.",
    );
  }
  const confirmation = () =>
    menu(
      `Confira antes de criar:\n\nTarefa: ${state.draft.title}\nResponsável: ${state.draft.assignedName}\nDescrição: ${clip(state.draft.description, 500)}\nVencimento: ${dateLabel(state.draft.dueDate)}`,
      [
        { title: "Confirmar", value: "confirm" },
        { title: "Corrigir", value: "correct" },
        { title: "Cancelar", value: "cancel" },
      ],
      true,
    );
  if (state.step === "due") {
    const due = dueDate(input);
    if (!due)
      return text("Data inválida. Use DD/MM/AAAA, por exemplo 15/10/2026.");
    state.draft.dueDate = due;
    state.step = "confirm-create";
    return confirmation();
  }
  if (state.step === "confirm-create") {
    if (input === "cancel") return home();
    if (input === "correct") {
      state.step = "title";
      state.choices = undefined;
      return text("Vamos preencher novamente. Qual tarefa você quer criar?");
    }
    if (input !== "confirm") return confirmation();
    const result = await createTask(
      { ...state.draft, priority: "normal" },
      auth,
      c,
    );
    state.step = "home";
    state.draft = undefined;
    state.choices = undefined;
    return text(
      `✅ Tarefa TAR-${result.task.id} criada!\n${PUBLIC_SYSTEM_URL}/tarefas?task=${result.task.id}\n\nDigite Menu para continuar.`,
    );
  }
  return home();
}

export async function processMessage(
  event: Incoming,
  legacyCommand = false,
): Promise<{ replies: Reply[]; duplicate?: boolean; route?: "legacy" }> {
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    // Serialize todos os eventos do mesmo contato; efeitos e recibo são atômicos.
    const phone = phoneKey(event.phone);
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [
      event.instance,
      phone,
    ]);
    const inserted = await c.query(
      "INSERT INTO web_dsu_messages(instance,phone,message_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING message_id",
      [event.instance, phone, event.id],
    );
    if (!inserted.rows.length) {
      await c.query("COMMIT");
      return { replies: [], duplicate: true };
    }
    const users = (
      await c.query(
        "SELECT email,display_name,phone,user_id,role,enabled FROM web_user_access WHERE coalesce(phone,'')<>''",
      )
    ).rows;
    const matches = users.filter((u) => phoneKey(u.phone) === phone);
    // Número ambíguo/desabilitado nunca assume a identidade de colaborador.
    const actor =
      matches.length === 1 && matches[0].enabled ? matches[0] : null;
    const old = (
      await c.query(
        "SELECT * FROM web_dsu_sessions WHERE instance=$1 AND phone=$2",
        [event.instance, phone],
      )
    ).rows[0];
    const state: State =
      old &&
      old.actor_email === (actor?.email || null) &&
      Date.now() - new Date(old.updated_at).getTime() < 30 * 60 * 1000
        ? old.state
        : {};
    // Texto livre do formulário nunca deve criar uma demanda DM por engano.
    const filling = [
      "title",
      "assignee",
      "description",
      "due",
      "confirm-create",
      "complete-id",
      "confirm-complete",
    ].includes(state.step || "");
    if (legacyCommand && !filling) {
      await c.query("COMMIT");
      return { replies: [], route: "legacy" };
    }
    await c.query("SAVEPOINT dsu_action");
    let reply: Reply;
    try {
      reply = await respond(c, event, state, actor);
    } catch (e) {
      if (!(
        e instanceof TaskInputError ||
        e instanceof TaskConflict ||
        e instanceof Forbidden
      ))
        throw e;
      await c.query("ROLLBACK TO SAVEPOINT dsu_action");
      for (const key of Object.keys(state)) delete (state as any)[key];
      reply = {
        endpoint: "sendText",
        body: {
          number: event.phone,
          text:
            e instanceof Forbidden
              ? "Acesso não permitido. Digite Menu."
              : `${e.message}\nDigite Menu para recomeçar.`,
        },
      };
    }
    await c.query(
      "INSERT INTO web_dsu_sessions(instance,phone,actor_email,state) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(instance,phone) DO UPDATE SET actor_email=excluded.actor_email,state=excluded.state,updated_at=now()",
      [event.instance, phone, actor?.email || null, JSON.stringify(state)],
    );
    await c.query("COMMIT");
    return { replies: [reply] };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
