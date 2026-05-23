import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { formatKRW, formatYearMonth } from "../../lib/format";

interface Props {
  data: { yearMonth: string; income: number; expense: number }[];
}

export function MonthlyBarChart({ data }: Props) {
  if (!data.length) return <div className="flex items-center justify-center h-60 text-cream-400 text-sm">데이터 없음</div>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.02 85)" />
        <XAxis
          dataKey="yearMonth"
          tickFormatter={(v) => {
            const parts = v.split("-");
            return parts.length >= 2 ? `${parts[1]}월` : v;
          }}
          tick={{ fontSize: 12, fill: "oklch(0.55 0.05 80)" }}
        />
        <YAxis
          tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
          tick={{ fontSize: 12, fill: "oklch(0.55 0.05 80)" }}
        />
        <Tooltip
          formatter={(value: number) => formatKRW(value)}
          labelFormatter={formatYearMonth}
          contentStyle={{ borderRadius: "8px", border: "1px solid oklch(0.90 0.03 85)" }}
        />
        <Legend />
        <Bar dataKey="income" name="수입" fill="#52C41A" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expense" name="지출" fill="#E07B54" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
