export const equipmentSections = {
  preventivas: {
    title: 'Controle de Manutenções',
    description: 'Planos de manutenção, vencimentos e próximas intervenções dos equipamentos.',
    href: '/equipamentos/preventivas',
  },
  inspecoes: {title:'Controle de Inspeções',description:'Rotas, periodicidades e inspeções em todas as máquinas do cliente.',href:'/equipamentos/inspecoes'},
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
