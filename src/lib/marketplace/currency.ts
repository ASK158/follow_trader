const gasNumber = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function formatGa(amount: number): string {
  return `${gasNumber.format(amount)} Gas`;
}

export function roundGas(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}