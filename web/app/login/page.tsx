"use client";
import { apiFetch } from "@/lib/client-api-cache";
import { planReturnPath } from "@/lib/plan-return-path";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import { ArrowRight, ShieldCheck, LoaderCircle, Layers3 } from "lucide-react";
export default function Login() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await apiFetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.assign(
        planReturnPath(new URLSearchParams(window.location.search).get("next")),
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Não foi possível entrar.",
      );
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <div className="brand">
          <Image
            className="rj-logo"
            src="/logo-rj.png"
            alt="RJ Compressores"
            width={444}
            height={312}
            unoptimized
          />
          <span>
            Gestão Integrada<span className="brand-small">RJ COMPRESSORES</span>
          </span>
        </div>
        <div>
          <span className="eyebrow">INFORMAÇÃO QUE CONECTA</span>
          <h1>
            Sua empresa
            <br />
            em um só lugar.
            <br />
            <em>Conecte sua equipe.</em>
          </h1>
          <p>
            CRM, assistência técnica, suprimentos e equipamentos.
            <br />
            Informações e ferramentas para toda a operação.
          </p>
          <div className="login-feature">
            <Layers3 size={22} />
            <span>Uma base integrada. Várias equipes conectadas.</span>
          </div>
        </div>
        <small>Gestão Integrada · Acesso da equipe</small>
      </section>
      <section className="login-form">
        <form onSubmit={submit}>
          <span className="section-icon">
            <ShieldCheck />
          </span>
          <h2>Bem-vindo de volta</h2>
          <p>Entre com sua conta para acessar a Gestão Integrada.</p>
          <label>
            E-mail
            <input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="voce@empresa.com.br"
              required
              maxLength={254}
            />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Sua senha"
              required
              maxLength={256}
            />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <>
                Entrar no sistema
                <ArrowRight size={18} />
              </>
            )}
          </button>
          <div className="login-help">
            <ShieldCheck size={16} />
            Acesso individual e protegido
          </div>
          <p className="login-contact">
            Precisa de acesso ou esqueceu sua senha?
            <br />
            Entre em contato com o administrador.
          </p>
        </form>
      </section>
    </main>
  );
}
