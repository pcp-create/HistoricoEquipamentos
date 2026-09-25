"use client";
import TaskTerritories from "./task-territories";
import { apiFetch, clearApiCache } from "@/lib/client-api-cache";
import "./admin-dashboard.css";
import { useEffect, useState } from "react";
import SiteHeader from "./site-header";
import { companyName } from "@/lib/company-names";
const emptyEmployee = {
  email: "",
  display_name: "",
  department: "",
  job_title: "",
  phone: "",
  role: "user",
  enabled: true,
  alert_preventive: false,
  alert_rental: false,
  alert_email: true,
  alert_whatsapp: false,
};
const date = (v: string) =>
  v
    ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "Sem registro";
const eventNames: Record<string, string> = {
  login: "Login realizado",
  logout: "Saída do sistema",
  access_changed: "Cadastro / permissão alterados",
  account_created: "Conta de acesso criada",
};
export default function AdminDashboard() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [denied, setDenied] = useState(false);
  const [form, setForm] = useState(emptyEmployee);
  const [editing, setEditing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [tab, setTab] = useState("users");
  const [password, setPassword] = useState("");
  async function load() {
    try {
      const r = await apiFetch("/api/admin");
      if (r.status === 401) {
        window.location.assign("/login");
        return;
      }
      const body = await r.json();
      if (!r.ok) {
        if (r.status === 403) {
          setData(null);
          setDenied(true);
        }
        throw Error(body.error);
      }
      setDenied(false);
      setData(body);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await apiFetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, mode: editing ? "update" : "create" }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setMessage(
        "Funcionário salvo. As preferências serão consideradas na próxima execução dos fluxos atualizados.",
      );
      setEditing(true);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createLogin() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await apiFetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-login",
          email: form.email,
          password,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setMessage(
        "Conta de acesso criada. Entregue a senha inicial ao funcionário por um canal privado.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPassword("");
      setBusy(false);
    }
  }
  return (
    <>
      <SiteHeader active="admin" email={data?.email} />
      <main className="catalog-settings admin-page">
        <section className="manual-card">
          <h1>Administração</h1>
          <p>Acessos da equipe e acompanhamento das integrações.</p>
          <button
            disabled={busy}
            onClick={() => {
              clearApiCache();
              void load();
            }}
          >
            Atualizar registros
          </button>
        </section>
        {error && (
          <p role="alert" className="catalog-settings-error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {!data && !error && <p>Carregando administração…</p>}
        {data && !denied && (
          <>
            <nav className="admin-tabs app-section-tabs" aria-label="Seções da administração">
              {[
                ["users", "Usuários"],
                ["integrations", "Integrações"],
                ["territories", "Divisão comercial"],
                ["logs", "Logs de acesso"],
              ].map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={tab === key}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            {tab === "territories" && <TaskTerritories />}
            <div hidden={tab !== "users"}>
              <section className="manual-card">
                <h2>Funcionários e acessos</h2>
                <p className="muted">
                  Administrador gerencia acessos e visualiza esta tela. Usuário
                  mantém as funções operacionais do sistema. O e-mail identifica
                  o funcionário e seu login. Funcionários bloqueados não recebem
                  alertas.
                </p>
                {!formOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      setForm(emptyEmployee);
                      setEditing(false);
                      setPassword("");
                      setError("");
                      setMessage("");
                      setFormOpen(true);
                    }}
                  >
                    Novo funcionário
                  </button>
                )}
                {formOpen && (
                  <>
                    <form onSubmit={save} autoComplete="off">
                      <fieldset disabled={busy}>
                        <legend>
                          {editing ? "Editar funcionário" : "Novo funcionário"}
                        </legend>
                        <div className="admin-form-grid">
                          {(
                            [
                              ["display_name", "Nome completo"],
                              ["department", "Setor"],
                              ["job_title", "Cargo"],
                              ["phone", "WhatsApp (país + DDD + número)"],
                            ] as const
                          ).map(([key, label]) => (
                            <label key={key}>
                              {label}
                              <input
                                required={key === "display_name"}
                                maxLength={
                                  key === "phone"
                                    ? 40
                                    : key === "display_name"
                                      ? 160
                                      : 120
                                }
                                value={form[key]}
                                onChange={(e) =>
                                  setForm({ ...form, [key]: e.target.value })
                                }
                              />
                            </label>
                          ))}
                          <label>
                            E-mail
                            <input
                              type="email"
                              readOnly={editing}
                              required
                              maxLength={254}
                              value={form.email}
                              onChange={(e) =>
                                setForm({ ...form, email: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Perfil
                            <select
                              aria-label="Perfil"
                              value={form.role}
                              onChange={(e) =>
                                setForm({ ...form, role: e.target.value })
                              }
                            >
                              <option value="user">Usuário</option>
                              <option value="admin">Administrador</option>
                            </select>
                          </label>
                          <label>
                            Acesso
                            <select
                              aria-label="Acesso"
                              value={String(form.enabled)}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  enabled: e.target.value === "true",
                                })
                              }
                            >
                              <option value="true">Liberado</option>
                              <option value="false">Bloqueado</option>
                            </select>
                          </label>
                        </div>
                        <fieldset>
                          <legend>Recebimento de alertas</legend>
                          {(
                            [
                              [
                                "alert_preventive",
                                "Recebe alerta de preventiva?",
                              ],
                              [
                                "alert_rental",
                                "Recebe alerta de locação/empréstimo?",
                              ],
                              ["alert_email", "Receber por e-mail"],
                              ["alert_whatsapp", "Receber pelo WhatsApp"],
                            ] as const
                          ).map(([key, label]) => (
                            <label key={key} className="admin-alert-option">
                              <input
                                type="checkbox"
                                checked={form[key]}
                                onChange={(e) =>
                                  setForm({ ...form, [key]: e.target.checked })
                                }
                              />{" "}
                              <span>{label}</span>
                            </label>
                          ))}
                          <p className="muted">
                            Valem os horários dos relatórios diários, semanais e
                            mensais. WhatsApp usa o número pessoal informado;
                            grupos continuam sendo destinos separados da
                            automação.
                          </p>
                        </fieldset>
                        <div className="catalog-editor-actions">
                          <button className="catalog-save-button">
                            Salvar funcionário
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFormOpen(false);
                              setForm(emptyEmployee);
                              setEditing(false);
                              setError("");
                              setPassword("");
                              setMessage("");
                            }}
                          >
                            Fechar cadastro
                          </button>
                        </div>
                      </fieldset>
                    </form>
                    {editing && (
                      <fieldset disabled={busy}>
                        <legend>Conta de acesso</legend>
                        {!data.loginProvisioningConfigured && (
                          <p role="note">
                            Criação de novas contas pendente de configuração de
                            SUPABASE_SERVICE_ROLE_KEY no servidor. Contas
                            existentes continuam funcionando.
                          </p>
                        )}
                        <p>
                          Para quem ainda não possui login, salve o cadastro e
                          crie a conta com uma senha inicial. Contas existentes
                          continuam usando a senha atual.
                        </p>
                        <label>
                          Senha inicial
                          <input
                            type="password"
                            autoComplete="new-password"
                            minLength={6}
                            maxLength={128}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          disabled={
                            !data.loginProvisioningConfigured ||
                            password.length < 6
                          }
                          onClick={createLogin}
                        >
                          Criar conta de acesso
                        </button>
                      </fieldset>
                    )}
                  </>
                )}
                <div className="admin-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Usuário</th>
                        <th>Perfil / acesso</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.users.map((u: any) => (
                        <tr key={u.email}>
                          <td>
                            {u.display_name || "Nome ainda não registrado"}
                            <small>{u.email}</small>
                            <small>
                              {[u.department, u.job_title, u.phone]
                                .filter(Boolean)
                                .join(" · ")}
                            </small>
                            <small>
                              Alertas:{" "}
                              {[
                                u.alert_preventive && "Preventivas",
                                u.alert_rental && "Locações/Empréstimos",
                              ]
                                .filter(Boolean)
                                .join(" · ") || "Nenhum"}
                            </small>
                          </td>
                          <td>
                            {u.role === "admin" ? "Administrador" : "Usuário"}
                            <small>
                              {u.enabled ? "Liberado" : "Bloqueado"}
                            </small>
                          </td>

                          <td>
                            <button
                              onClick={() => {
                                setForm({
                                  ...emptyEmployee,
                                  ...Object.fromEntries(
                                    Object.keys(emptyEmployee).map((k) => [
                                      k,
                                      u[k] ??
                                        emptyEmployee[
                                          k as keyof typeof emptyEmployee
                                        ],
                                    ]),
                                  ),
                                });
                                setFormOpen(true);
                                setEditing(true);
                                setError("");
                                setMessage("");
                                setPassword("");
                              }}
                            >
                              Editar funcionário
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <div hidden={tab !== "integrations"}>
              <section className="manual-card">
                <h2>Integração de ordens de serviço</h2>
                <p className="muted">
                  Horários confirmados na base e quantidade de OS pendentes.
                  Ausência de erro não comprova que o processo esteja em
                  execução agora.
                </p>
                <div className="admin-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Empresa</th>
                        <th>Última listagem</th>
                        <th>Último detalhe coletado</th>
                        <th>Pendentes</th>
                        <th>Com erro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.map((r: any) => (
                        <tr key={r.company_id}>
                          <td>{companyName(r.company_id)}</td>
                          <td>{date(r.inventory_at)}</td>
                          <td>{date(r.detail_at)}</td>
                          <td>{r.pending}</td>
                          <td>{r.errors}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="manual-card">
                <h2>Integração de produtos</h2>
                <div className="admin-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Empresa</th>
                        <th>Rotina</th>
                        <th>Último sucesso</th>
                        <th>Última carga completa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.products.map((r: any) => (
                        <tr key={`${r.company_id}:${r.mode}`}>
                          <td>{companyName(r.company_id)}</td>
                          <td>
                            {{
                              catalog: "Cadastro de produtos",
                              available: "Estoque disponível",
                              detail: "Detalhes e custos",
                            }[r.mode as string] || r.mode}
                          </td>
                          <td>{date(r.success_at)}</td>
                          <td>{date(r.full_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="manual-card">
                <h2>Integração de equipamentos</h2>
                <p className="muted">
                  O cadastro é compartilhado e coletado pela RJ Indústria.
                  Vínculos são conferidos nas três empresas.
                </p>
                <div className="admin-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Empresa</th>
                        <th>Cadastro</th>
                        <th>Vínculos iniciais</th>
                        <th>Cruzamento com OS</th>
                        <th>Situação registrada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.equipment.map((r: any) => (
                        <tr key={r.company_id}>
                          <td>{companyName(r.company_id)}</td>
                          <td>{date(r.catalog_at)}</td>
                          <td>{date(r.seed_at)}</td>
                          <td>{date(r.linked_at)}</td>
                          <td>
                            {r.has_error
                              ? "Erro registrado"
                              : "Sem erro registrado"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="manual-card">
                <h2>Execuções registradas pelo integrador</h2>
                <p className="muted">
                  Últimas 30 execuções disponíveis no log do integrador. Rotinas
                  que não gravam nesse log aparecem nas tabelas de coleta acima.
                </p>
                <div className="admin-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Empresa</th>
                        <th>Início</th>
                        <th>Fim</th>
                        <th>Status</th>
                        <th>Registros recebidos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.runs.map((r: any, i: number) => (
                        <tr key={i}>
                          <td>{companyName(r.company_id)}</td>
                          <td>{date(r.data_inicio)}</td>
                          <td>{date(r.data_fim)}</td>
                          <td>{r.status}</td>
                          <td>{r.registros_recebidos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <div hidden={tab !== "logs"}>
              <section className="manual-card">
                <h2>Presença e últimos acessos</h2>
                <p className="muted">
                  Online = tela visível com atividade nos últimos 15 minutos,
                  não uma conexão contínua. Último acesso registra login; última
                  atividade registra a presença na tela. Datas em Brasília.
                  Registros anteriores à implantação podem não estar
                  disponíveis.
                </p>
                <div className="admin-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Usuário</th>
                        <th>Presença</th>
                        <th>Último acesso</th>
                        <th>Última atividade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.users.map((u: any) => (
                        <tr key={u.email}>
                          <td>
                            {u.display_name || "Nome ainda não registrado"}
                            <small>{u.email}</small>
                          </td>
                          <td>
                            <span
                              className={`admin-status ${u.online ? "" : "admin-offline"}`}
                            >
                              <span
                                className="admin-presence-light"
                                aria-hidden="true"
                              />
                              {u.online ? "Online" : "Offline"}
                            </span>
                          </td>
                          <td>{date(u.last_login_at)}</td>
                          <td>{date(u.last_seen_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="manual-card">
                <h2>Logs de acesso e administração</h2>
                <p className="muted">
                  Últimos 100 eventos. Senhas e tokens não são registrados.
                </p>
                <div className="admin-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Evento</th>
                        <th>Usuário</th>
                        <th>Responsável</th>
                        <th>Alteração</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.events.map((r: any, i: number) => (
                        <tr key={i}>
                          <td>{date(r.created_at)}</td>
                          <td>{eventNames[r.event] || r.event}</td>
                          <td>{r.email}</td>
                          <td>{r.actor}</td>
                          <td>
                            {r.details?.after
                              ? `${r.details.after.role === "admin" ? "Administrador" : "Usuário"} · ${r.details.after.enabled ? "Liberado" : "Bloqueado"}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </>
  );
}
