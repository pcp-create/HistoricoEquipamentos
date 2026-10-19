// Serverless instances must release the upstream connection between transactions.
// Supabase's session endpoint otherwise reserves one slot for every idle client.
export function pooledDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  if (url.hostname.endsWith(".pooler.supabase.com") && (!url.port || url.port === "5432")) {
    url.port = "6543";
  }
  return url.toString();
}
