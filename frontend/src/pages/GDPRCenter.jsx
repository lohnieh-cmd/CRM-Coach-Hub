import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, fmtMoney } from "@/components/ui-kit";
import { ShieldCheck, DownloadSimple, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function GDPRCenter() {
  const [logs, setLogs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [audit, setAudit] = useState([]);
  const [selected, setSelected] = useState("");

  const load = async () => {
    const [l, c, a] = await Promise.all([api.get("/gdpr/consent-logs"), api.get("/contacts"), api.get("/audit")]);
    setLogs(l.data); setContacts(c.data.filter((x)=>!x.deleted_at)); setAudit(a.data);
  };
  useEffect(()=>{ load(); },[]);

  const exportContact = async () => {
    if (!selected) return toast.error("Select a contact");
    try {
      const res = await api.get(`/gdpr/export/${selected}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url; a.download = `gdpr-${selected}.zip`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Export ready");
    } catch { toast.error("Export failed"); }
  };

  const erase = async () => {
    if (!selected) return toast.error("Select a contact");
    if (!window.confirm("Soft-delete this contact? They'll be purged in 14 days.")) return;
    await api.post(`/gdpr/erase/${selected}`, { hard: false });
    toast.success("Soft-erased. 14-day grace window started.");
    load();
  };

  return (
    <div>
      <PageHeader title="GDPR Center" subtitle="Consent · Subject Access · Right to Erasure · Audit Trail" icon={ShieldCheck}/>
      <div className="px-8 py-6 space-y-6">
        <div className="card p-5" data-testid="gdpr-actions">
          <div className="label-caps mb-3">Subject Access Request / Erasure</div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[240px]">
              <div className="label-caps mb-2">Contact</div>
              <select className="select" value={selected} onChange={(e)=>setSelected(e.target.value)} data-testid="gdpr-contact-select">
                <option value="">— select —</option>
                {contacts.map((c)=><option key={c.id} value={c.id}>{c.first_name} {c.last_name} · {c.email}</option>)}
              </select>
            </div>
            <button className="btn btn-secondary" onClick={exportContact} data-testid="gdpr-export"><DownloadSimple size={16}/> Export all data (ZIP)</button>
            <button className="btn btn-danger" onClick={erase} data-testid="gdpr-erase"><Trash size={16}/> Right to erasure</button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="card p-5">
            <div className="label-caps mb-3">Consent logs ({logs.length})</div>
            <div className="max-h-96 overflow-y-auto text-xs">
              <table className="atable">
                <thead><tr><th>When</th><th>Contact</th><th>Kind</th><th>Source</th><th>Given</th></tr></thead>
                <tbody>
                  {logs.map((l)=>(
                    <tr key={l.id}>
                      <td className="text-[#94a3b8]">{(l.timestamp||"").slice(0,19)}</td>
                      <td>{l.contact_email}</td>
                      <td>{l.kind}</td>
                      <td>{l.source}</td>
                      <td>{l.given ? <span className="chip" style={{color:"#10b981"}}>Yes</span> : <span className="chip">No</span>}</td>
                    </tr>
                  ))}
                  {logs.length===0 && <tr><td colSpan={5} className="text-[#94a3b8] py-8 text-center">No consent records yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-5">
            <div className="label-caps mb-3">Audit trail ({audit.length})</div>
            <div className="max-h-96 overflow-y-auto space-y-2 text-xs">
              {audit.slice(0,100).map((a)=>(
                <div key={a.id} className="border-b border-[#283341] pb-2">
                  <div className="text-[#94a3b8]">{(a.timestamp||"").slice(0,19)}</div>
                  <div><span className="text-[#e26e4a] font-semibold">{a.action}</span> · {a.entity_type} · <span className="text-[#94a3b8]">{a.entity_id?.slice(0,8)}</span></div>
                </div>
              ))}
              {audit.length===0 && <div className="text-[#94a3b8]">No audit entries yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
