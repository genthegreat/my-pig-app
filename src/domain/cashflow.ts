// Cash flow: money in (sales) against money out (costs) by month, with the
// capital spend kept apart from the running costs so the operating picture
// is not swamped by the pen build and breeding stock.

import type { Cost, Sale } from "@/db/schema";
import { monthRange } from "./dates";
import { costComponent } from "./herd";

export interface CashflowMonth {
  month: string;
  salesIn: number;
  sales: number; // count
  running: number; // non-capital costs
  capital: number;
  feed: number;
  labour: number;
  other: number;
  net: number; // salesIn − running
  netAfterCapital: number;
  cumulative: number; // running total of net since the first month shown
  cumulativeAfterCapital: number;
}

export function cashflowByMonth(sales: Sale[], costs: Cost[], fromMonth: string, toMonth: string): CashflowMonth[] {
  const months = monthRange(fromMonth, toMonth);
  let cum = 0;
  let cumCap = 0;
  return months.map((month) => {
    const s = sales.filter((x) => x.date.slice(0, 7) === month);
    const c = costs.filter((x) => x.date.slice(0, 7) === month);
    const salesIn = s.reduce((a, x) => a + x.total, 0);
    const capital = c.filter((x) => x.is_capital).reduce((a, x) => a + x.total, 0);
    const running = c.filter((x) => !x.is_capital).reduce((a, x) => a + x.total, 0);
    const byComp = { feed: 0, labour: 0, other: 0 };
    for (const x of c) if (!x.is_capital) byComp[costComponent(x.category)] += x.total;
    const net = salesIn - running;
    cum += net;
    cumCap += net - capital;
    return {
      month,
      salesIn,
      sales: s.length,
      running,
      capital,
      ...byComp,
      net,
      netAfterCapital: net - capital,
      cumulative: cum,
      cumulativeAfterCapital: cumCap,
    };
  });
}
