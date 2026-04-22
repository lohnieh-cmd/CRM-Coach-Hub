import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader } from "@/components/ui-kit";
import { PlugsConnected } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Integrations() {
  const [rows, setRows] = useState([]);
  const load = async () => { const { data } = await api.get("/integrations"); setRows(data); };
  useEffect(()=>{ load(); },[]);

  const toggle = async (kind) => {
    await api.post(`/integrations/${kind}/toggle`);
    toast.success(`Toggled ${kind}`);
    load();
  };

  return (
    <div>
      <PageHeader title="Integrations" subtitle="Connect the tools you already use" icon={PlugsConnected}/>
      <div className="px-8 py-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((it)=>(
          <div key={it.kind} className="card p-5 flex flex-col" data-testid={`integration-${it.kind}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-head text-lg font-semibold">{it.name}</div>
                <div className="text-xs text-[#94a3b8] mt-1">{it.description}</div>
              </div>
              <span className="chip" style={{color: it.status==="connected"?"#10b981":"#94a3b8"}}>{it.status}</span>
            </div>
            <div className="mt-3 text-xs text-[#94a3b8]">Last sync: {it.last_sync_at ? new Date(it.last_sync_at).toLocaleString() : "—"}</div>
            <button className="btn btn-secondary text-xs mt-4 self-start" onClick={()=>toggle(it.kind)} data-testid={`toggle-${it.kind}`}>
              {it.status==="connected" ? "Disconnect" : "Connect"}
            </button>
          </div>
        ))}
      </div>
      <div className="px-8 pb-8 space-y-2 text-xs text-[#94a3b8]">
        <div>Stripe + PayPal are wired end-to-end. Calendly has a live inbound webhook receiver ready — paste this URL into Calendly's webhook settings (v2 API):</div>
        <code className="block p-3 bg-[#0b0f15] border border-[#283341] rounded break-all text-[#e26e4a]" data-testid="calendly-webhook-url">
          {`${window.location.origin.replace(/\/$/,"")}`}/api/webhook/calendly
        </code>
        <div>PayPal webhook URL (paste into PayPal Developer Dashboard → Webhooks for event <code>PAYMENT.CAPTURE.COMPLETED</code>):</div>
        <code className="block p-3 bg-[#0b0f15] border border-[#283341] rounded break-all text-[#e26e4a]" data-testid="paypal-webhook-url">
          {`${window.location.origin.replace(/\/$/,"")}`}/api/webhook/paypal
        </code>
        <div>Zoom / Zapier / SurveyMonkey / Microsoft Graph are configuration-only placeholders in this reference build — their OAuth + full webhook handlers ship in a future batch.</div>
      </div>
    </div>
  );
}
