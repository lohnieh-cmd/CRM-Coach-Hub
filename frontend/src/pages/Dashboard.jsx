import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, KPI, fmtMoney, Altitude } from "@/components/ui-kit";
import {
  HouseLine,
  TrendUp,
  Receipt,
  Users,
  CheckCircle,
  Lightning,
} from "@phosphor-icons/react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [deals, setDeals] = useState([]);
  const [stages, setStages] = useState([]);
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const [a, d, s] = await Promise.all([
          api.get("/analytics/summary"),
          api.get("/deals"),
          api.get("/pipeline-stages"),
        ]);
        setData(a.data);
        setDeals(d.data);
        setStages(s.data);
      } catch {}
    })();
  }, []);

  if (!data) return <div className="p-10 text-[#94a3b8]">Loading…</div>;
  const recent = [...deals].sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")).slice(0, 6);
  const stageById = Object.fromEntries(stages.map((s) => [s.id, s]));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Your summit in one glance."
        icon={HouseLine}
        actions={
          <button className="btn btn-primary" onClick={() => nav("/pipeline")} data-testid="dashboard-view-pipeline">
            View Pipeline
          </button>
        }
      />
      <div className="px-8 py-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <KPI label="Open Pipeline" value={fmtMoney(data.kpis.open_pipeline, "USD")} hint={`${data.kpis.deals_open} deals open`} testid="kpi-pipeline" />
          <KPI label="Weighted Forecast" value={fmtMoney(data.kpis.weighted_forecast, "USD")} hint="probability × value" testid="kpi-forecast" />
          <KPI label="Revenue YTD" value={fmtMoney(data.kpis.revenue_ytd, "USD")} hint={`Win rate ${data.kpis.win_rate}%`} testid="kpi-revenue" />
          <KPI label="Outstanding" value={fmtMoney(data.kpis.outstanding, "USD")} hint="invoices awaiting payment" testid="kpi-outstanding" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="card p-5 xl:col-span-2" data-testid="revenue-chart">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="label-caps">Revenue (last 12 months)</div>
                <h3 className="font-head text-xl font-semibold mt-1">Monthly paid invoices</h3>
              </div>
              <TrendUp size={22} weight="duotone" color="#e26e4a" />
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.revenue_series}>
                <CartesianGrid stroke="#283341" vertical={false} />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "#161d26", border: "1px solid #283341", borderRadius: 8 }}
                  labelStyle={{ color: "#94a3b8" }}
                />
                <Bar dataKey="revenue" fill="#e26e4a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5" data-testid="stage-distribution">
            <div className="label-caps">Altitude map</div>
            <h3 className="font-head text-xl font-semibold mt-1 mb-3">Pipeline by stage</h3>
            <div className="space-y-2">
              {data.stage_distribution.map((s) => (
                <div key={s.stage} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Altitude label={s.altitude} />
                    <span className="text-sm truncate">{s.stage}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">{s.count}</div>
                    <div className="text-xs text-[#94a3b8]">{fmtMoney(s.value, "USD")}</div>
                  </div>
                </div>
              ))}
              {data.stage_distribution.length === 0 && (
                <div className="text-sm text-[#94a3b8]">No stages yet.</div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="card p-5 xl:col-span-2" data-testid="recent-activity">
            <div className="label-caps mb-1">Recent activity</div>
            <h3 className="font-head text-xl font-semibold mb-3">Deals on the move</h3>
            <div className="divide-y divide-[#283341]">
              {recent.map((d) => {
                const st = stageById[d.pipeline_stage_id];
                return (
                  <div key={d.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{d.title}</div>
                      <div className="text-xs text-[#94a3b8]">{fmtMoney(d.value, d.currency)} · {d.probability}%</div>
                    </div>
                    {st && <Altitude label={st.altitude_label} />}
                  </div>
                );
              })}
              {recent.length === 0 && <div className="text-sm text-[#94a3b8]">No deals yet.</div>}
            </div>
          </div>

          <div className="card p-5 topo-card" data-testid="ai-tile">
            <Lightning size={24} weight="duotone" color="#e26e4a" />
            <div className="label-caps mt-3">AI Studio</div>
            <h3 className="font-head text-xl font-semibold mt-1 mb-2">Draft a grounded reply</h3>
            <p className="text-sm text-[#94a3b8] mb-4">
              Gemini-3 powered, grounded in your CRM, refuses to invent facts.
            </p>
            <button className="btn btn-primary" onClick={() => nav("/ai-studio")} data-testid="dashboard-open-ai">
              Open AI Studio
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
