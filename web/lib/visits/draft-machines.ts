export type DraftMachine = {
  requestId: string;
  registration?: Record<string,unknown>;
  equipmentType: string;
  model: string;
  brand: string;
  serial: string;
  meter: string;
  observations?: string;
};
