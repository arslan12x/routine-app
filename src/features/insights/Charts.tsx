"use client";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { catLabel } from "@/features/tasks/constants";

interface Bucket { label: string; completed: number; scheduled: number; rate: number | null }
export interface InsightsData {
  trend: Bucket[];
  split: { mandatory: number; extra: number };
  categories: (Bucket & { category: string })[];
  consistencyTrend: { label: string; rate: number | null }[];
}
const tip = { contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--fg)" } };
const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false } as const;
const short = (l: string) => (l.length === 10 ? l.slice(5) : l);
const p = (v: unknown) => (typeof v === "number" ? `${Math.round(v * 100)}%` : "—");

export default function Charts({ d }: { d: InsightsData }) {
  const trend = d.trend.map((t) => ({ ...t, label: short(t.label) }));
  const cons = d.consistencyTrend.map((t) => ({ ...t, label: short(t.label) }));
  const cats = d.categories.map((c) => ({ ...c, name: catLabel(c.category) }));
  const pie = [{ name: "Mandatory", value: d.split.mandatory, color: "var(--brand)" }, { name: "Extra", value: d.split.extra, color: "var(--ok)" }];
  const box = "rounded-2xl border border-border bg-card p-4";
  return (
    <div className="mt-4 space-y-4">
      <div className={box}>
        <h3 className="mb-2 text-sm font-medium">Completion trend</h3>
        <div className="h-56" role="img" aria-label="Completed tasks over time with completion rate">
          <ResponsiveContainer>
            <ComposedChart data={trend}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" {...axis} /><YAxis yAxisId="l" allowDecimals={false} {...axis} width={28} />
              <YAxis yAxisId="r" orientation="right" domain={[0, 1]} tickFormatter={p} {...axis} width={36} />
              <Tooltip {...tip} formatter={(v, n) => (n === "Rate" ? p(v) : String(v))} />
              <Bar yAxisId="l" dataKey="completed" name="Completed" fill="var(--brand)" radius={[6, 6, 0, 0]} />
              <Line yAxisId="r" dataKey="rate" name="Rate" stroke="var(--ok)" strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={box}>
          <h3 className="text-sm font-medium">Where completions came from</h3>
          <p className="text-xs text-muted">Share of completed tasks (not a completion rate)</p>
          <div className="h-48" role="img" aria-label={`Mandatory ${d.split.mandatory}, extra ${d.split.extra}`}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2} stroke="none">{pie.map((e) => <Cell key={e.name} fill={e.color} />)}</Pie>
                <Tooltip {...tip} /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className={box}>
          <h3 className="text-sm font-medium">Category completion rate</h3>
          <div className="h-48" role="img" aria-label="Completion rate by category">
            <ResponsiveContainer>
              <BarChart data={cats} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" domain={[0, 1]} tickFormatter={p} {...axis} /><YAxis type="category" dataKey="name" width={90} {...axis} />
                <Tooltip {...tip} formatter={(v) => p(v)} /><Bar dataKey="rate" name="Rate" fill="var(--brand)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className={box}>
        <h3 className="text-sm font-medium">Mandatory consistency</h3>
        <p className="text-xs text-muted">Successful days ÷ days with mandatory tasks</p>
        <div className="h-48" role="img" aria-label="Consistency over time">
          <ResponsiveContainer>
            <LineChart data={cons}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" {...axis} /><YAxis domain={[0, 1]} tickFormatter={p} {...axis} width={36} />
              <Tooltip {...tip} formatter={(v) => p(v)} /><Line dataKey="rate" name="Consistency" stroke="var(--brand)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
