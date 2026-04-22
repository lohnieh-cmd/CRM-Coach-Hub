import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, KPI, fmtMoney, Altitude } from "@/components/ui-kit";
import { ChartBar } from "@phosphor-icons/react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["#e26e4a","#4f7c8a","#f59e0b","#10b981","#94a3b8","#c85a3a"];

export default function Analytics() {
  const [data, setData] = useState(null);
  useEffect(()=>{ api.get("/analytics/summary").then(({data})=>setData(data)); },[]);
  if (!data) return <div className="p-10 text-[#94a3b8]">Loading…</div>;

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Pipeline health, revenue, and aging" icon={ChartBar}/>
      <div className="px-8 py-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <KPI label="Open Pipeline" value={fmtMoney(data.kpis.open_pipeline)} testid="an-kpi-pipeline"/>
          <KPI label="Forecast" value={fmtMoney(data.kpis.weighted_forecast)} hint="probability × value"/>
          <KPI label="Revenue YTD" value={fmtMoney(data.kpis.revenue_ytd)}/>
          <KPI label="Win Rate" value={`${data.kpis.win_rate}%`} hint={`${data.kpis.deals_won} won / ${data.kpis.deals_lost} lost`}/>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="card p-5">
            <div className="label-caps">Revenue trend</div>
            <h3 className="font-head text-xl font-semibold mt-1 mb-3">Paid invoices / month</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.revenue_series}>
                <CartesianGrid stroke="#283341" vertical={false}/>
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={11}/>
                <YAxis stroke="#94a3b8" fontSize={11}/>
                <Tooltip contentStyle={{background:"#161d26",border:"1px solid #283341",borderRadius:8}}/>
                <Line type="monotone" dataKey="revenue" stroke="#e26e4a" strokeWidth={2} dot={{fill:"#e26e4a"}}/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5">
            <div className="label-caps">Pipeline distribution</div>
            <h3 className="font-head text-xl font-semibold mt-1 mb-3">Value by stage</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.stage_distribution}>
                <CartesianGrid stroke="#283341" vertical={false}/>
                <XAxis dataKey="stage" stroke="#94a3b8" fontSize={10} angle={-20} textAnchor="end" height={60}/>
                <YAxis stroke="#94a3b8" fontSize={11}/>
                <Tooltip contentStyle={{background:"#161d26",border:"1px solid #283341",borderRadius:8}}/>
                <Bar dataKey="value" fill="#4f7c8a" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5">
            <div className="label-caps">Invoice aging</div>
            <h3 className="font-head text-xl font-semibold mt-1 mb-3">Outstanding buckets</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={data.invoice_aging} dataKey="amount" nameKey="bucket" outerRadius={80} label>
                  {data.invoice_aging.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                </Pie>
                <Legend wrapperStyle={{color:"#94a3b8",fontSize:12}}/>
                <Tooltip contentStyle={{background:"#161d26",border:"1px solid #283341",borderRadius:8}}/>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5">
            <div className="label-caps">Stage altitude map</div>
            <h3 className="font-head text-xl font-semibold mt-1 mb-3">Deals by altitude</h3>
            <div className="space-y-3">
              {data.stage_distribution.map((s)=>(
                <div key={s.stage} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Altitude label={s.altitude}/>
                    <span className="text-sm">{s.stage}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{fmtMoney(s.value)}</div>
                    <div className="text-xs text-[#94a3b8]">{s.count} deals</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
