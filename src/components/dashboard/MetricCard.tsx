import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  icon?: React.ReactNode;
}

export function MetricCard({ title, value, subtitle, trend, trendValue, icon }: MetricCardProps) {
  return (
    <div className="metric-card bg-card border border-border/80 rounded-lg p-4 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
        {icon && <div className="text-muted-foreground/70 p-1.5 rounded-md bg-muted/60">{icon}</div>}
      </div>
      <p className="text-2xl font-bold tracking-tight text-foreground font-sans mb-1">{value}</p>
      <div className="flex items-center gap-2">
        {trend && (
          <span
            className={`flex items-center gap-0.5 text-xs font-semibold ${
              trend === "up" ? "text-emerald-600 dark:text-emerald-400" : trend === "down" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
            }`}
          >
            {trend === "up" ? <TrendingUp className="w-3 h-3" /> : trend === "down" ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {trendValue}
          </span>
        )}
        {subtitle && <span className="text-[11px] text-muted-foreground truncate">{subtitle}</span>}
      </div>
    </div>
  );
}
