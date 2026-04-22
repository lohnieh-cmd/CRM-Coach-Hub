import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, Field } from "@/components/ui-kit";
import { EnvelopeSimple, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function EmailSync() {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({ host:"", port:993, use_ssl:true, username:"", password:"", mailbox:"INBOX" });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const load = async () => {
    const { data } = await api.get("/email/imap/config");
    setCfg(data);
    if (data) setForm({ host:data.host, port:data.port, use_ssl:data.use_ssl, username:data.username, password:"", mailbox:data.mailbox });
  };
  useEffect(()=>{ load(); },[]);

  const save = async () => {
    setLoading(true);
    try { await api.post("/email/imap/config", form); toast.success("Config saved"); load(); }
    catch(e){ toast.error(e?.response?.data?.detail||"Failed"); }
    finally { setLoading(false); }
  };

  const sync = async () => {
    if (!form.password) { toast.error("Enter your IMAP password (app password for Gmail)"); return; }
    setSyncing(true); setLastResult(null);
    try {
      const { data } = await api.post("/email/imap/sync", { password: form.password, limit: 20 });
      setLastResult(data);
      toast.success(`Synced: ${data.inserted} new / ${data.fetched} fetched`);
      load();
    } catch(e){ toast.error(e?.response?.data?.detail||"Sync failed"); }
    finally { setSyncing(false); }
  };

  const del = async () => {
    if (!window.confirm("Remove IMAP configuration?")) return;
    await api.delete("/email/imap/config"); toast.success("Removed"); load(); setForm({ host:"", port:993, use_ssl:true, username:"", password:"", mailbox:"INBOX" });
  };

  return (
    <div>
      <PageHeader title="Email Sync" subtitle="IMAP inbound — pull real emails into every contact's timeline" icon={EnvelopeSimple}/>
      <div className="px-8 py-6 space-y-6">
        <div className="card p-4 border-l-4 border-l-[#f59e0b] bg-[#2a1d12] text-xs">
          <Warning size={14} className="inline mr-2 text-[#f59e0b]"/>
          Use an <b>app password</b> for Gmail / Outlook — not your main login password. For Gmail, enable 2FA then create an App Password at myaccount.google.com → Security.
        </div>

        <div className="card p-5" data-testid="imap-form">
          <div className="label-caps mb-3">IMAP configuration</div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Host (e.g. imap.gmail.com)"><input className="input" value={form.host} onChange={(e)=>setForm({...form,host:e.target.value})} data-testid="imap-host" placeholder="imap.gmail.com"/></Field>
            <Field label="Port">
              <div className="flex items-center gap-3">
                <input type="number" className="input" value={form.port} onChange={(e)=>setForm({...form,port:parseInt(e.target.value)||993})}/>
                <label className="flex items-center gap-1 text-xs whitespace-nowrap"><input type="checkbox" checked={form.use_ssl} onChange={(e)=>setForm({...form,use_ssl:e.target.checked})}/> SSL</label>
              </div>
            </Field>
            <Field label="Username (email)"><input className="input" value={form.username} onChange={(e)=>setForm({...form,username:e.target.value})} data-testid="imap-username"/></Field>
            <Field label="Mailbox"><input className="input" value={form.mailbox} onChange={(e)=>setForm({...form,mailbox:e.target.value})}/></Field>
            <div className="col-span-2"><Field label="App password" hint="Never logged, only used for this sync"><input type="password" className="input" value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})} data-testid="imap-password"/></Field></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 justify-between">
            <div className="text-xs text-[#94a3b8]">
              {cfg ? <>Saved. Last sync: <b>{cfg.last_sync_at ? new Date(cfg.last_sync_at).toLocaleString() : "never"}</b> {cfg.last_sync_count!==undefined && `(+${cfg.last_sync_count} new)`}</> : "Not configured."}
            </div>
            <div className="flex gap-2">
              {cfg && <button className="btn btn-ghost text-xs" onClick={del}>Remove config</button>}
              <button className="btn btn-secondary" onClick={save} disabled={loading} data-testid="imap-save">{loading?"Saving…":"Save config"}</button>
              <button className="btn btn-primary" onClick={sync} disabled={syncing || !cfg} data-testid="imap-sync">{syncing?"Syncing…":"Sync now"}</button>
            </div>
          </div>
          {lastResult && (
            <div className="mt-4 card p-3 bg-[#0b0f15] text-xs" data-testid="imap-result">
              Fetched <b>{lastResult.fetched}</b> messages · inserted <b>{lastResult.inserted}</b> new. <Link className="text-[#e26e4a] hover:underline" to="/contacts">View contacts</Link> to see new emails on their timelines.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
