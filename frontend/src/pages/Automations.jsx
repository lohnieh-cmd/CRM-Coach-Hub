import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, Modal, Field, Empty } from "@/components/ui-kit";
import { Lightning, Plus, Play, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";

const TRIGGER_TYPES = [
  { value: "deal_stage_change", label: "When deal enters stage", configFields: [{key:"to",label:"Stage name",hint:"e.g. Proposal Sent — or altitude label"}] },
  { value: "form_submission", label: "When a lead form is submitted", configFields: [{key:"slug",label:"Form slug",hint:"e.g. discovery"}] },
  { value: "calendly_booking", label: "When a Calendly booking arrives", configFields: [{key:"event",label:"Event name (optional)",hint:"leave blank for any"}] },
];

const ACTION_TYPES = [
  { value: "create_task", label: "Create task", configFields: [{key:"name",label:"Task title"}] },
  { value: "send_email_draft", label: "Draft email", configFields: [{key:"template",label:"Template key"},{key:"subject",label:"Subject"},{key:"body",label:"Body",textarea:true}] },
  { value: "tag_contact", label: "Tag contact", configFields: [{key:"tag",label:"Tag"}] },
  { value: "webhook_post", label: "POST to webhook (Zapier/Make)", configFields: [{key:"url",label:"URL"}] },
];

export default function Automations() {
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(null);

  const load = async () => { const { data } = await api.get("/automations"); setRows(data); };
  useEffect(()=>{ load(); },[]);

  const del = async (id) => {
    if (!window.confirm("Delete automation?")) return;
    await api.delete(`/automations/${id}`);
    toast.success("Deleted"); load();
  };
  const runTest = async (id) => {
    const { data } = await api.post(`/automations/${id}/test`, { context: { entity_type:"deal", entity_id:"test" } });
    const ok = (data.run_log||[]).every((x)=>x.ok);
    if (ok) toast.success(`Test run OK (${data.run_log.length} actions)`);
    else toast.error(`Run errors: ${data.run_log.filter(x=>!x.ok).length}`);
    load();
  };
  const toggle = async (r) => { await api.patch(`/automations/${r.id}`, { enabled: !r.enabled }); load(); };

  return (
    <div>
      <PageHeader
        title="Automations"
        subtitle="Visual rules that fire when something changes"
        icon={Lightning}
        actions={<button className="btn btn-primary" onClick={()=>{setEdit(null); setShow(true);}} data-testid="new-automation-btn"><Plus size={16}/> New Automation</button>}
      />
      <div className="px-8 py-6">
        {rows.length===0 ? (
          <Empty title="No automations yet" subtitle="Create your first automation — e.g. auto-tag contacts from the discovery form, or draft a welcome email when a deal hits 'Proposal Sent'." icon={Lightning}
            cta={<button className="btn btn-primary" onClick={()=>{setEdit(null); setShow(true);}}>Create Automation</button>}/>
        ) : (
          <div className="space-y-3">
            {rows.map((r)=>(
              <div key={r.id} className="card p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4" data-testid={`automation-${r.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="font-head text-lg font-semibold">{r.name}</div>
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!r.enabled} onChange={()=>toggle(r)} data-testid={`automation-toggle-${r.id}`}/> Enabled</label>
                    <span className="chip">{r.run_count||0} runs</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-[#94a3b8] flex-wrap">
                    <span className="chip" style={{color:"#e26e4a"}}>Trigger</span>
                    <span className="text-white">{r.trigger?.type}</span>
                    {Object.entries(r.trigger?.config||{}).map(([k,v])=>(
                      <span key={k} className="chip"><b className="text-white">{k}</b>=&nbsp;{String(v)}</span>
                    ))}
                    <span className="ml-3">→</span>
                    <span className="chip" style={{color:"#4f7c8a"}}>Then</span>
                    {(r.actions||[]).map((a,i)=><span key={i} className="chip">{a.type}</span>)}
                  </div>
                  {r.last_run_log && (
                    <div className="mt-2 text-xs text-[#94a3b8]">Last run: {(r.last_run_at||"").slice(0,19)} — {(r.last_run_log||[]).map((x)=>x.ok?"✓":"✗").join(" ")}</div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button className="btn btn-secondary text-xs" onClick={()=>runTest(r.id)} data-testid={`automation-test-${r.id}`}><Play size={14}/> Test run</button>
                  <button className="btn btn-ghost text-xs" onClick={()=>{setEdit(r); setShow(true);}}>Edit</button>
                  <button className="btn btn-ghost text-xs" onClick={()=>del(r.id)}><Trash size={14}/></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <AutomationModal open={show} onClose={()=>setShow(false)} initial={edit} onSaved={load}/>
    </div>
  );
}

function AutomationModal({ open, onClose, initial, onSaved }) {
  const [f, setF] = useState(null);
  useEffect(()=>{
    setF(initial || { name:"", trigger:{ type:"deal_stage_change", config:{} }, actions:[{ type:"create_task", config:{} }], enabled:true });
  },[initial, open]);
  if (!f) return null;

  const trigDef = TRIGGER_TYPES.find((t)=>t.value===f.trigger.type) || TRIGGER_TYPES[0];
  const setTrigger = (t) => setF({ ...f, trigger: { type: t, config: {} } });
  const setTrigCfg = (k, v) => setF({ ...f, trigger: { ...f.trigger, config: { ...f.trigger.config, [k]: v } } });

  const addAction = () => setF({ ...f, actions: [...f.actions, { type:"create_task", config:{} }] });
  const delAction = (i) => setF({ ...f, actions: f.actions.filter((_,x)=>x!==i) });
  const setActionType = (i,t) => { const a=[...f.actions]; a[i]={ type:t, config:{} }; setF({...f,actions:a}); };
  const setActionCfg = (i,k,v) => { const a=[...f.actions]; a[i] = { ...a[i], config:{ ...(a[i].config||{}), [k]:v } }; setF({...f,actions:a}); };

  const save = async () => {
    try {
      if (initial?.id) await api.patch(`/automations/${initial.id}`, f);
      else await api.post("/automations", f);
      toast.success("Saved"); onSaved(); onClose();
    } catch(e){ toast.error(e?.response?.data?.detail||"Failed"); }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial?"Edit Automation":"New Automation"} wide>
      <div className="space-y-4" data-testid="automation-form">
        <Field label="Name"><input className="input" value={f.name||""} onChange={(e)=>setF({...f,name:e.target.value})} placeholder="e.g. Welcome discovery leads" data-testid="auto-name"/></Field>
        <div className="card p-4">
          <div className="label-caps mb-2">WHEN · Trigger</div>
          <select className="select mb-3" value={f.trigger.type} onChange={(e)=>setTrigger(e.target.value)} data-testid="auto-trigger-type">
            {TRIGGER_TYPES.map((t)=><option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            {trigDef.configFields.map((fld)=>(
              <Field key={fld.key} label={fld.label} hint={fld.hint}>
                <input className="input" value={f.trigger.config[fld.key]||""} onChange={(e)=>setTrigCfg(fld.key, e.target.value)}/>
              </Field>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="label-caps">THEN · Actions</div>
            <button className="btn btn-secondary text-xs" onClick={addAction}><Plus size={14}/> Add action</button>
          </div>
          <div className="space-y-3">
            {f.actions.map((a,i)=>{
              const def = ACTION_TYPES.find((x)=>x.value===a.type) || ACTION_TYPES[0];
              return (
                <div key={i} className="card p-3 bg-[#0b0f15]">
                  <div className="flex items-center gap-2 mb-2">
                    <select className="select flex-1" value={a.type} onChange={(e)=>setActionType(i, e.target.value)} data-testid={`auto-action-${i}-type`}>
                      {ACTION_TYPES.map((t)=><option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <button className="btn btn-ghost" onClick={()=>delAction(i)}>✕</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {def.configFields.map((fld)=>(
                      <Field key={fld.key} label={fld.label}>
                        {fld.textarea
                          ? <textarea className="textarea" value={a.config?.[fld.key]||""} onChange={(e)=>setActionCfg(i, fld.key, e.target.value)}/>
                          : <input className="input" value={a.config?.[fld.key]||""} onChange={(e)=>setActionCfg(i, fld.key, e.target.value)}/>}
                      </Field>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.enabled} onChange={(e)=>setF({...f, enabled:e.target.checked})}/> Enabled</label>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} data-testid="auto-save">Save Automation</button>
      </div>
    </Modal>
  );
}
