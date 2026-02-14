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
    <div className="metric-card">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-muted-foreground font-medium">{title}</p>
        {icon && <div className="text-muted-foreground/60">{icon}</div>}
      </div>
      <p className="text-3xl font-serif text-foreground mb-1">{value}</p>
      <div className="flex items-center gap-2">
        {trend && (
          <span
            className={`flex items-center gap-0.5 text-xs font-medium ${
              trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {trend === "up" ? <TrendingUp className="w-3 h-3" /> : trend === "down" ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {trendValue}
          </span>
        )}
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
    </div>
  );
}
