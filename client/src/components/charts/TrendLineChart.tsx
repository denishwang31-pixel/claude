import React from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { formatKRW, formatYearMonth, getCategoryColor } from "../../lib/format";

interface Props {
  data: { yearMonth: string; [category: string]: number | string }[];
  categories: string[];
}

export function TrendLineChart({ data, categories }: Props) {
  if (!data.length) return <div className="flex items-center justify-center h-60 text-cream-400 text-sm">데이터 없음</div>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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
        {categories.map((cat, i) => (
          <Line
            key={cat}
            type="monotone"
            dataKey={cat}
            stroke={getCategoryColor(cat, i)}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
