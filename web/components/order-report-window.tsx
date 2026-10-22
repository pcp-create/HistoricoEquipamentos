"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, FileDown } from "lucide-react";
import {
  canIncludeInOrderReport,
  orderReport,
} from "@/lib/service-scheduling/order-report";
import { operationNumber } from "@/lib/service-scheduling/operation-number";
import { statusNames } from "@/lib/service-scheduling/model";
import {
  reportFieldValue,
  reportFilenameMode,
  type ReportMode,
  type ReportStage,
} from "@/lib/service-scheduling/checklist-report";
import { ReviewFlags } from "./review-checklist-field";

function ReportPages({
  title,
  order,
  report,
  mode,
  preliminary,
}: {
  title: string;
  order: string;
  report: ReportStage[];
  mode: ReportMode;
  preliminary: boolean;
}) {
  return (
    <article className="checklist-review-report">
      <header className="technical-report-banner">
        <img src="/logo-rj.png" alt="RJ Compressores" />
        <div>
          <h3>
            {mode === "budget" ? "RELATÓRIO DE ORÇAMENTO" : "RELATÓRIO TÉCNICO"}
          </h3>
          <p>{title}</p>
        </div>
        <div className="technical-report-order">
          <span>OS Nº</span>
          <strong>{order}</strong>
        </div>
      </header>
      {preliminary && <div className="order-report-preliminary">PRÉVIO — NÃO REVISADO · Sujeito a alterações</div>}
      {report.map((stage, index) => (
        <section key={stage.id} className="review-report-stage">
          <h4>
            <span className="technical-report-number">
              {operationNumber(index + 1)}
            </span>
            {stage.name}
          </h4>
          {stage.groups.map((group, i) => (
            <section key={i} className="review-report-group">
              {group.name && <h5>{group.name}</h5>}
              {stage.id === "timeline" ? (
                <div
                  className="operation-milestones-scroll"
                  tabIndex={0}
                  aria-label="Linha do tempo horizontal das operações"
                >
                  <ol className="operation-milestones">
                    {group.fields.map((f) => (
                      <li key={f.id}>
                        <div className="operation-milestone-date">
                          {f.label}
                        </div>
                        <div
                          className="operation-milestone-track"
                          aria-hidden="true"
                        >
                          <span />
                        </div>
                        <strong>{f.operation}</strong>
                        <p>{reportFieldValue(f)}</p>
                        <p className="operation-milestone-person">
                          <strong>Executado por:</strong> {f.responsible}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : stage.id === "events" && !group.name ? (
                <table className="review-report-time-table">
                  <thead>
                    <tr>
                      <th>Data e hora</th>
                      <th>Apontamento</th>
                      <th>Responsável</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.fields.map((f) => (
                      <tr key={f.id}>
                        <td>{f.label}</td>
                        <td>{reportFieldValue(f)}</td>
                        <td>{f.responsible || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <dl>
                  {group.fields.map((f) => (
                    <div key={f.id} className="review-report-row">
                      <dt>{f.label}</dt>
                      <dd>
                        {f.options ? (
                          <ReviewFlags
                            label={f.label}
                            options={f.options}
                            alertOptions={f.alertOptions}
                            value={f.value}
                          />
                        ) : (
                          <span>{reportFieldValue(f)}</span>
                        )}
                        {f.comment && (
                          <p className="review-report-comment">
                            <strong>Comentário:</strong> {f.comment}
                          </p>
                        )}
                        {!!f.photos.length && (
                          <div className="review-report-photos">
                            {f.photos.map((id, i) => (
                              <a
                                key={`${id}-${i}`}
                                href={`/api/service-scheduling/photos/${encodeURIComponent(id)}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <img
                                  src={`/api/service-scheduling/photos/${encodeURIComponent(id)}`}
                                  alt={`${f.label} — ${i + 1}`}
                                  loading="lazy"
                                />
                              </a>
                            ))}
                          </div>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          ))}
        </section>
      ))}
    </article>
  );
}

export default function OrderReportWindow({
  data,
  onClose,
}: {
  data: any;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [mode, setMode] = useState<ReportMode>("complete"),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [includeTimeline, setIncludeTimeline] = useState(true);
  const operations: any[] = data.operations || [];
  const eligible = operations.filter(op => canIncludeInOrderReport(op, true));
  const ids = selected.filter((id) => eligible.some((op) => op.id === id));
  const model = useMemo(
    () => orderReport(data, ids, mode, true, includeTimeline),
    [data, ids.join(","), mode, includeTimeline],
  );
  const close = () => {
    if (!busy) onClose();
  };
  useEffect(() => {
    const element = dialog.current!,
      overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/service-scheduling/order-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: String(data.schedule.id),
          operationIds: ids,
          mode,
          includeTimeline,
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw Error(result.error || "Não foi possível gerar o relatório.");
      }
      const url = URL.createObjectURL(await response.blob()),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `Relatorio-OS-${model.order}-unificado-${model.preliminary ? "PREVIO-" : ""}${reportFilenameMode[mode]}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="scheduling-page operation-review-window order-report-window"
      aria-label="Relatório unificado da OS"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header className="operation-review-header">
        <div>
          <h2>Relatório da OS {model.order}</h2>
          <p>Selecione os atendimentos que farão parte do documento.</p>
        </div>
        <button
          type="button"
          onClick={close}
          disabled={busy}
          aria-label="Fechar relatório da OS"
        >
          <X size={20} />
        </button>
      </header>
      <nav className="operation-review-tabs" aria-label="Etapas do relatório">
        <button
          type="button"
          aria-pressed={!preview}
          onClick={() => setPreview(false)}
        >
          1. Selecionar operações
        </button>
        <button
          type="button"
          aria-pressed={preview}
          disabled={!ids.length}
          onClick={() => setPreview(true)}
        >
          2. Visualizar relatório
        </button>
      </nav>
      <div className="operation-review-content">
        {error && (
          <p className="operation-review-error" role="alert">
            {error}
          </p>
        )}
        {!preview ? (
          <>
            <p>
              O documento reúne o resumo da OS, a linha do tempo opcional e os detalhes
              de cada operação em ordem numérica (01, 02, 03…). Cada operação começa em uma
              nova página do PDF.
            </p>
            <p>
              Operações com relatório podem ser incluídas antes da revisão. Nesse caso, o documento será identificado como PRÉVIO — NÃO REVISADO.
              Horários de Brasília; os totais somam as horas de cada
              profissional.
            </p>
            <div className="order-report-select-all">
              <button
                type="button"
                disabled={!eligible.length || busy}
                onClick={() =>
                  setSelected(
                    ids.length === eligible.length
                      ? []
                      : eligible.slice(0, 100).map((o) => o.id),
                  )
                }
              >
                {ids.length && ids.length === eligible.length
                  ? "Limpar seleção"
                  : "Selecionar todas disponíveis"}
              </button>
              <span aria-live="polite">
                {ids.length} operação(ões) selecionada(s)
              </span>
            </div>
            <div className="order-report-options">
              {operations.map((op) => {
                const available = canIncludeInOrderReport(op, true),
                  person = data.users?.find(
                    (u: any) => u.email === op.document.responsible,
                  );
                return (
                  <label
                    key={op.id}
                    className={`order-report-option ${available ? "" : "unavailable"}`}
                  >
                    <input
                      type="checkbox"
                      checked={ids.includes(op.id)}
                      disabled={
                        !available ||
                        busy ||
                        (!ids.includes(op.id) && ids.length >= 100)
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...ids, op.id]
                            : ids.filter((id) => id !== op.id),
                        )
                      }
                    />
                    <span>
                      <strong>
                        Operação {operationNumber(op.position)} ·{" "}
                        {op.document.description || "Sem descrição"}
                      </strong>
                      <span>
                        {person?.display_name ||
                          op.document.responsible ||
                          "Não atribuído"}{" "}
                        · {statusNames[op.status]}
                      </span>
                      <small>
                        {op.document.checklistRun?.template.name ||
                          "Sem relatório de checklist"}
                      </small>
                      {!available && (
                        <small>
                          {op.document.checklistRun
                            ? "Operação cancelada não pode ser incluída."
                            : "Esta operação não possui relatório."}
                        </small>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            {!operations.length && <p>Nenhuma operação cadastrada nesta OS.</p>}
          </>
        ) : (
          <div className="order-report-preview">
            <ReportPages
              title={model.title}
              order={model.order}
              report={model.report}
              mode={mode}
              preliminary={model.preliminary}
            />
            <nav
              className="order-report-index"
              aria-label="Operações do relatório"
            >
              {model.chapters.map((c) => (
                <a key={c.id} href={`#order-report-${c.id}`}>
                  Operação {operationNumber(c.position)}
                </a>
              ))}
            </nav>
            {model.chapters.map((c) => (
              <section
                key={c.id}
                id={`order-report-${c.id}`}
                className="order-report-chapter"
              >
                <ReportPages
                  title={c.title}
                  order={`${model.order}/${operationNumber(c.position)}`}
                  report={c.report}
                  mode={mode}
                  preliminary={model.preliminary}
                />
              </section>
            ))}
          </div>
        )}
      </div>
      {model.preliminary && <p className="order-report-preliminary" role="status">PRÉVIO — NÃO REVISADO. Há operações selecionadas com revisão pendente. O documento está sujeito a alterações.</p>}
      <footer className="operation-review-footer order-report-footer">
        <label><input type="checkbox" checked={includeTimeline} disabled={busy} onChange={e => setIncludeTimeline(e.target.checked)} /> Exibir linha do tempo</label>
        <label>
          Tipo de relatório
          <select
            aria-label="Tipo do relatório unificado"
            value={mode}
            disabled={busy}
            onChange={(e) => { setMode(e.target.value as ReportMode); setIncludeTimeline(e.target.value !== "summary"); }}
          >
            <option value="complete">Relatório Completo</option>
            <option value="summary">Relatório Resumido</option>
            <option value="budget">Relatório de Orçamento</option>
          </select>
        </label>
        <small>
          {mode === "complete"
            ? "Todos os campos e tempos de paradas."
            : mode === "summary"
              ? "Somente campos preenchidos, sem paradas e observações internas."
              : "Campos preenchidos e observações internas, sem paradas."}
        </small>
        <button
          type="button"
          disabled={busy || !ids.length}
          onClick={() => void download()}
        >
          <FileDown size={16} />
          {busy ? "Gerando PDF…" : model.preliminary ? "Gerar PDF prévio" : "Gerar PDF unificado"}
        </button>
      </footer>
    </dialog>,
    document.body,
  );
}
