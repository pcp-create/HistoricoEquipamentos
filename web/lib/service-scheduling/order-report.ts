import {
  filterReport,
  type ReportMode,
  type ReportStage,
} from "./checklist-report";
import { technicalReport } from "./technical-report";
import { timeLogs, elapsedTime } from "./time-logs";
import { reportSubmission } from "./checklists";
import { operationNumber } from "./operation-number";

export const canIncludeInOrderReport = (operation: any) =>
  ["reviewed", "completed"].includes(operation.status) &&
  !!operation.document?.checklistRun;

export function orderReport(
  data: any,
  operationIds: string[],
  mode: ReportMode = "complete",
) {
  const ids = new Set(operationIds);
  const users: any[] = data.users || [],
    sessions: any[] = data.fieldSessions || [],
    events: any[] = data.fieldEvents || [],
    history: any[] = data.events || [];
  const order = data.detail?.order || {};
  const timestamp = (at: string) =>
    new Date(at).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "short",
    });
  const valid = (at: any): at is string =>
    !!at && Number.isFinite(Date.parse(at));
  const section = (
    id: string,
    name: string,
    entries: [string, any][],
  ): ReportStage => ({
    id,
    name,
    status: "submitted",
    groups: [
      {
        name: "",
        fields: entries.map(([label, value], i) => ({
          id: String(i),
          label,
          value: value ?? "Não informado",
          type: "text",
          photos: [],
          comment: "",
        })),
      },
    ],
  });
  const source: any[] = data.operations || [];
  const operations = source
    .filter((op: any) => ids.has(op.id) && canIncludeInOrderReport(op))
    .map((op: any) => {
      const logs = timeLogs(
        sessions.filter((s) => s.operation_id === op.id),
        events.filter((e) => e.operation_id === op.id),
        history.filter((e) => e.operation_id === op.id),
      );
      const dates = logs.rows
        .flatMap((r) => [r.started_at, r.finished_at, r.recorded_at])
        .filter(valid)
        .sort((a, b) => Date.parse(a) - Date.parse(b));
      const receipt = reportSubmission(op.document.checklistRun)?.at;
      const work = logs.rows.filter((row) => row.kind === "work");
      const execution = work.length ? work : logs.rows;
      const executionDates = execution
        .map((row) => row.started_at || row.recorded_at)
        .filter(valid)
        .sort((a, b) => Date.parse(a) - Date.parse(b));
      const executedAt = executionDates[0] || null;
      const executors = [
        ...new Map(
          execution
            .filter((row) => row.actor)
            .map((row) => [
              row.actor,
              row.display_name ||
                users.find((u) => u.email === row.actor)?.display_name ||
                row.actor,
            ]),
        ).values(),
      ].join(", ");
      const sortAt = executedAt || (valid(receipt) ? receipt : null);
      const name =
        users.find((u) => u.email === op.document.responsible)?.display_name ||
        op.document.responsible ||
        "Não informado";
      return {
        op,
        logs,
        sortAt,
        executedAt,
        executors,
        start: dates[0] || null,
        end: dates.at(-1) || null,
        name,
      };
    })
    .sort(
      (a: any, b: any) =>
        (a.sortAt ? Date.parse(a.sortAt) : Infinity) -
          (b.sortAt ? Date.parse(b.sortAt) : Infinity) ||
        a.op.position - b.op.position,
    );
  const dates = operations
    .flatMap((operation) => [operation.start, operation.end])
    .filter(valid)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const people = new Map<
    string,
    { name: string; work: number; travel: number; pause: number }
  >();
  for (const { op, logs } of operations) {
    for (const row of logs.rows) {
      const name =
        row.display_name ||
        users.find((u) => u.email === row.actor)?.display_name ||
        row.actor;
      const person = people.get(row.actor) || {
        name,
        work: 0,
        travel: 0,
        pause: 0,
      };
      person[row.kind === "travel" ? "travel" : "work"] += row.active;
      person.pause += row.pause;
      people.set(row.actor, person);
    }
  }
  const overview: ReportStage[] = [
    section("order", "Resumo da OS", [
      ["OS", String(order.numero_sequencia || data.schedule.order_id)],
      ["Cliente", order.cliente_nome || order.cliente_razao_social],
      ["CNPJ / CPF", order.cliente_cpf_cnpj],
      ["Equipamento", order.equipamento],
      ["Local de atendimento", order.endereco_entrega_nome],
      [
        "Operações incluídas",
        operations
          .map(({ op }: any) => operationNumber(op.position))
          .join(", "),
      ],
      [
        "Período dos apontamentos",
        dates.length
          ? `${timestamp(dates[0])} a ${timestamp(dates.at(-1)!)}`
          : "Não informado",
      ],
    ]),
  ];
  overview.push(
    section(
      "operations",
      "Operações selecionadas",
      operations.map(({ op, name, start, end }: any) => [
        `Operação ${operationNumber(op.position)}`,
        `${op.document.description || op.document.checklistRun.template.name}\nResponsável: ${name}\n${start ? `${timestamp(start)} a ${timestamp(end)}` : "Sem apontamentos com data"}\nChecklist: ${op.document.checklistRun.template.name}`,
      ]),
    ),
  );
  const chronological = section("timeline", "Linha do tempo das operações", []);
  chronological.groups[0].fields = operations.map(
    ({ op, executedAt, executors }) => ({
      id: op.id,
      label: executedAt
        ? new Date(executedAt).toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })
        : "Data não registrada",
      operation: `Operação ${operationNumber(op.position)}`,
      value: op.document.description || op.document.checklistRun.template.name,
      responsible: executors || "Execução não registrada",
      type: "operation-milestone",
      photos: [],
      comment: "",
    }),
  );
  if (operations.length) overview.push(chronological);
  const totals = section("totals", "Totais das operações selecionadas", []);
  let work = 0,
    travel = 0,
    pause = 0;
  const totalFields = (w: number, t: number, p: number): [string, string][] => [
    ["Tempo de atividade", elapsedTime(w)],
    ["Tempo de deslocamento", elapsedTime(t)],
    ...(mode === "complete"
      ? [["Tempo de paradas", elapsedTime(p)] as [string, string]]
      : []),
    [
      "Total de horas por profissional (HH)",
      elapsedTime(w + t + (mode === "complete" ? p : 0)),
    ],
  ];
  for (const p of people.values()) {
    work += p.work;
    travel += p.travel;
    pause += p.pause;
    if (mode !== "summary") totals.groups.push({
      ...section("", "", totalFields(p.work, p.travel, p.pause)).groups[0],
      name: p.name,
    });
  }
  totals.groups[0] = section(
    "",
    "",
    totalFields(work, travel, pause),
  ).groups[0];
  if (people.size) overview.push(totals);
  const chapters = operations.map(({ op }: any) => ({
    id: op.id,
    position: op.position,
    title: `Operação ${operationNumber(op.position)} · ${op.document.description || op.document.checklistRun.template.name}`,
    report: technicalReport(
      op,
      order,
      users,
      sessions,
      events,
      history,
      mode,
    ).filter((s) => !["asset", "location", "client"].includes(s.id)),
  }));
  return {
    order: String(order.numero_sequencia || data.schedule.order_id),
    mode,
    title: "Relatório unificado da OS",
    report: filterReport(overview, mode),
    chapters,
  };
}
export type OrderReport = ReturnType<typeof orderReport>;
