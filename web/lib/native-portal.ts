type NativePortal = {
  version?: string;
  openPdf: (url:string) => Promise<void>;
  connection: () => Promise<boolean>;
  permissions: () => Promise<void>;
  launchOperation: () => Promise<string | null>;
  message: (type: string) => Promise<any>;
  exportBackup: (data: string) => Promise<void>;
};
export function nativePortal(): NativePortal | undefined {
  return typeof window === "undefined"
    ? undefined
    : (window as unknown as { RJOffline?: NativePortal }).RJOffline;
}
