/** M8 QR form uses the legacy `pessoa` key for the product ID. */
export function m8ProductPhotoUrl(id: string): string | null {
  if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2147483647) return null;
  return `https://app.erpm8.cloud/rjcompressores/Estoque/ProdutoFotoQRCodeFormulario//${btoa(`pessoa=${id}&empresa=1`)}FotoQrCodeProduto`;
}
