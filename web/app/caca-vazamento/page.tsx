import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import TechnicalReportScreen from "@/components/technical-report-screen";
export const dynamic = "force-dynamic";
export default async function Page() {
  const jar = await cookies();
  if (!jar.has("m8-access") && !jar.has("m8-refresh")) redirect("/login");
  return (
    <TechnicalReportScreen
      active="leakage"
      title="Gerar Relatório Caça Vazamento"
      description="Importe os pontos do LeakReporter, associe as fotos e prepare o relatório de vazamentos para seu cliente."
      source="/tools/leak-report.html"
      messageType="rj-leak-height"
    />
  );
}
