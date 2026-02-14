import { DollarSign, Check } from "lucide-react";
import { useState } from "react";

const payrollData = [
  { id: 1, worker: "James Mwangi", hours: 48, rate: 800, pay: 38400, approved: true },
  { id: 2, worker: "Grace Wanjiku", hours: 52, rate: 150, pay: 7800, approved: false },
  { id: 3, worker: "Peter Kamau", hours: 0, rate: 45000, pay: 45000, approved: true },
  { id: 4, worker: "John Ochieng", hours: 0, rate: 65000, pay: 65000, approved: true },
  { id: 5, worker: "Ann Wairimu", hours: 46, rate: 700, pay: 32200, approved: false },
];

const PayrollPage = () => {
  const [data, setData] = useState(payrollData);

  const toggleApproval = (id: number) => {
    setData((prev) => prev.map((r) => (r.id === id ? { ...r, approved: !r.approved } : r)));
  };

  const totalWages = data.reduce((a, b) => a + b.pay, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-serif text-foreground">Payroll</h1>
        <p className="text-muted-foreground mt-1">Weekly payroll management</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="metric-card">
          <p className="text-sm text-muted-foreground">Total Wages</p>
          <p className="text-3xl font-serif mt-1">KES {totalWages.toLocaleString()}</p>
        </div>
        <div className="metric-card">
          <p className="text-sm text-muted-foreground">Cost per KG</p>
          <p className="text-3xl font-serif mt-1">KES 15.2</p>
        </div>
        <div className="metric-card">
          <p className="text-sm text-muted-foreground">Pending Approval</p>
          <p className="text-3xl font-serif mt-1">{data.filter((d) => !d.approved).length}</p>
        </div>
      </div>

      <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Worker</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hours</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rate (KES)</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pay (KES)</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Approved</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3.5 text-sm font-medium">{row.worker}</td>
                  <td className="px-5 py-3.5 text-sm">{row.hours || "—"}</td>
                  <td className="px-5 py-3.5 text-sm">{row.rate.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-sm font-medium">{row.pay.toLocaleString()}</td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => toggleApproval(row.id)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        row.approved ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PayrollPage;
