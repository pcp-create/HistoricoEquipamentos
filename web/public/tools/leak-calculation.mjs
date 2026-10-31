/** Spreadsheet-compatible calculations. Inputs are kW, m³/min, hours/day and days/year. */
export function calculateMachines(machines) {
 const rows=machines.map(machine=>{
  const specificPower=Number(machine.powerKw)/(Number(machine.flowM3min)*60);
  const annualHours=machine.hoursMode==='annual'?Number(machine.annualHoursInput):Number(machine.hoursPerDay)*Number(machine.daysPerYear);
  return {...machine,specificPower,annualHours,powerHours:specificPower*annualHours};
 });
 const sum=key=>rows.reduce((total,row)=>total+Number(row[key]),0);
 const powerKw=sum('powerKw'),flowM3min=sum('flowM3min'),specificPowerSum=sum('specificPower');
 const annualHours=specificPowerSum?sum('powerHours')/specificPowerSum:0;
 return {rows,powerKw,flowM3min,specificPowerSum,weightedSpecificPower:flowM3min?powerKw/(flowM3min*60):0,annualHours,dailyHours:annualHours/365};
}
