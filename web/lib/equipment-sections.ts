export const equipmentSections = {
  preventivas: {
    title: 'Controle de Preventivas',
    description: 'Planos de manutenção, vencimentos e próximas intervenções dos equipamentos.',
    href: '/equipamentos/preventivas',
  },
  locacao: {
    title: 'Controle de locação',
    description: 'Frota de locação, disponibilidade, contratos e máquinas em revisão.',
    href: '/equipamentos/locacao',
  },
  clientes: {
    title: 'Cliente / Equipamento',
    description: 'Parque de máquinas por cliente, ordens de serviço e acompanhamento das manutenções.',
    href: '/equipamentos/clientes',
  },
} as const;
export type EquipmentSection = keyof typeof equipmentSections;
export function isEquipmentSection(value:string):value is EquipmentSection {
  return Object.prototype.hasOwnProperty.call(equipmentSections,value);
}
