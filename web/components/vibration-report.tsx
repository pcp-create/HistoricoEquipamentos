import TechnicalReportScreen from "./technical-report-screen";
export default function VibrationReport() {
  return (
    <TechnicalReportScreen
      active="vibration"
      title="Gerar Relatório Análise de Vibração"
      description="Importe medições do SDAV, registre a avaliação técnica e prepare o relatório para seu cliente."
      source="/tools/vibration-report.html"
      messageType="rj-vibration-height"
    />
  );
}
