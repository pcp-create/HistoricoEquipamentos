/** Remove apenas o documento da legenda; preserva o cadastro original. */
export function customerMapLabel(value: string | null | undefined): string {
  return (value || '')
    .replace(/(?:\s*[-–—·|/]\s*)?\(?\s*(?:CNPJ\s*:?\s*)?(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)\s*\)?/gi, ' ')
    .replace(/^[\s\-–—·|/:]+|[\s\-–—·|/:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Cliente não informado';
}

export function singleCustomerLabel(items: { customerId?: string | number | null; customer?: string | null }[]): string | null {
  if (!items.length) return null;
  const keys = items.map(item => item.customerId != null ? `id:${item.customerId}` : item.customer ? `name:${customerMapLabel(item.customer).toLocaleUpperCase('pt-BR')}` : null);
  if (keys.some(key => key == null) || new Set(keys).size !== 1) return null;
  return customerMapLabel(items[0].customer);
}
