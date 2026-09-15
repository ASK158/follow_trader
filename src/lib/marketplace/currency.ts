const gasNumber = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

export function formatGa(amount: number): string {
  return `${gasNumber.format(amount)} Gas`;
}