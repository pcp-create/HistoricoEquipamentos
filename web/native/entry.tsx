import React from "react";
import { createRoot } from "react-dom/client";
import FieldApp from "../components/field-app";
import "../app/globals.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
class Boundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="field-app">
        <h1>Portal Técnico RJ</h1>
        <p>
          Não foi possível abrir esta tela. Os registros salvos permanecem no
          aparelho.
        </p>
        <button onClick={() => location.reload()}>Tentar novamente</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <Boundary>
    <FieldApp />
  </Boundary>,
);
