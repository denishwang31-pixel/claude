import React from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatKRW, getCategoryColor } from "../../lib/format";

interface Props {
  data: { category: string; total: number; count: number }[];
}

export function CategoryPieChart({ data }: Props) {
  if (!data.length) return <div className="flex items-center justify-center h-60 text-cream-400 text-sm">데이터 없음</div>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="category"
          cx="50%"
          cy="50%"
          outerRadius={100}
          innerRadius={50}
          paddingAngle={2}
          label={({ category, percent }) =>
            percent > 0.04 ? `${category} ${(percent * 100).toFixed(0)}%` : ""
          }
          labelLine={false}
        >
          {data.map((entry, i) => (
            <Cell key={entry.category} fill={getCategoryColor(entry.category, i)} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => formatKRW(value)}
          labelFormatter={(label) => `${label}`}
        />
        <Legend
          iconType="circle"
          iconSize={10}
          formatter={(value) => <span className="text-sm text-cream-700">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
