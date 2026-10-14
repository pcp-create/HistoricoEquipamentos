/** Remove apenas o documento da legenda; preserva o cadastro original. */
export function customerMapLabel(value: string | null | undefined): string {
  return (value || '')
    .replace(/(?:\s*[-–—·|/]\s*)?\(?\s*(?:CNPJ\s*:?\s*)?(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)\s*\)?/gi, ' ')
    .replace(/^[\s\-–—·|/:]+|[\s\-–—·|/:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Cliente não informado';
}
