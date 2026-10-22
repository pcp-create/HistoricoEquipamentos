export function processedOrder(status: unknown) {
  return ["processado", "processada"].includes(
    String(status || "")
      .trim()
      .toLowerCase(),
  );
}
