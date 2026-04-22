import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, Modal, Field } from "@/components/ui-kit";
import { Storefront, Plus, Copy, LinkSimple } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function LeadForms() {
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [viewing, setViewing] = useState(null);

  const load = async () => { const { data } = await api.get("/forms"); setRows(data); };
  useEffect(()=>{ load(); },[]);

  const openSubs = async (f) => {
    setViewing(f);
    const { data } = await api.get(`/forms/${f.id}/submissions`);
    setSubmissions(data);
  };

  const publicUrl = (slug) => `${window.location.origin}/f/${slug}`;
  const embedCode = (slug) => `<iframe src="${publicUrl(slug)}" width="100%" height="640" style="border:1px solid #283341;border-radius:12px;"></iframe>`;
  const backendOrigin = (process.env.REACT_APP_BACKEND_URL || window.location.origin).replace(/\/$/,"");
  const apiSubmitUrl = (slug) => `${backendOrigin}/api/forms/${slug}/submit`;

  const firstSlug = rows[0]?.slug || "your-form-slug";

  return (
    <div>
      <PageHeader
        title="Lead Forms"
        subtitle={`${rows.length} capture forms`}
        icon={Storefront}
        actions={<button className="btn btn-primary" onClick={()=>{setEdit(null); setShow(true);}} data-testid="new-form-btn"><Plus size={16}/> New Form</button>}
      />
      <div className="px-8 py-6 space-y-6">
        <div className="card p-5" data-testid="website-integration-guide">
          <div className="label-caps">Website integration — climbleadershiplab.vercel.app</div>
          <h3 className="font-head text-xl font-semibold mt-1">Three ways to flow leads from your website into Ascent</h3>
          <p className="text-xs text-[#94a3b8] mt-1">Your Vercel site is <strong>not auto-connected</strong> yet — pick one of the options below. All three auto-create a Contact + Basecamp Deal + GDPR consent log in Ascent.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs">
            <div className="p-3 rounded border border-[#283341]">
              <div className="font-medium text-[#e26e4a] mb-2">① Link to hosted page (easiest)</div>
              <p className="text-[#94a3b8]">Change every "Schedule a Discovery Call" button on your site to link to this URL:</p>
              <code className="block p-2 mt-2 bg-[#0b0f15] border border-[#283341] rounded break-all text-[#e26e4a]">{publicUrl(firstSlug)}</code>
              <p className="text-[#94a3b8] mt-2">Works from any website. Fully branded Ascent page with consent checkbox.</p>
            </div>

            <div className="p-3 rounded border border-[#283341]">
              <div className="font-medium text-[#e26e4a] mb-2">② Embed as iframe</div>
              <p className="text-[#94a3b8]">Paste this snippet into any Vercel/Next.js page:</p>
              <code className="block p-2 mt-2 bg-[#0b0f15] border border-[#283341] rounded break-all text-[#cdd6e0] text-[11px]">{embedCode(firstSlug)}</code>
              <p className="text-[#94a3b8] mt-2">Inline form on your own page, Ascent handles submit + consent.</p>
            </div>

            <div className="p-3 rounded border border-[#283341]">
              <div className="font-medium text-[#e26e4a] mb-2">③ Direct API webhook (advanced)</div>
              <p className="text-[#94a3b8]">Your website's own form posts JSON here:</p>
              <code className="block p-2 mt-2 bg-[#0b0f15] border border-[#283341] rounded break-all text-[#e26e4a] text-[11px]">POST {apiSubmitUrl(firstSlug)}</code>
              <pre className="p-2 mt-2 bg-[#0b0f15] border border-[#283341] rounded text-[11px] text-[#cdd6e0] whitespace-pre-wrap">{`{
  "answers": {
    "first_name": "...",
    "last_name": "...",
    "email": "...",
    "phone": "..."
  },
  "consent_given": true,
  "consent_source": "climbleadershiplab.vercel.app"
}`}</pre>
            </div>
          </div>

          <div className="text-xs text-[#94a3b8] mt-4">
            <strong className="text-[#cdd6e0]">Already connected?</strong> Every form submission you see below in the cards is a real lead that came in via one of the three routes. Use <code className="text-[#e26e4a]">Automations</code> to auto-tag, draft a reply in AI Studio, or send a Calendly confirmation.
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {rows.map((f)=>(
          <div key={f.id} className="card p-5" data-testid={`form-card-${f.slug}`}>
            <div className="flex justify-between items-start">
              <div>
                <div className="font-head text-lg font-semibold">{f.name}</div>
                <div className="text-xs text-[#94a3b8] mt-1">/f/{f.slug} · {(f.steps?.length>0 ? `${f.steps.length}-step funnel` : `${f.fields?.length || 0} fields`)} · {f.submissions_count || 0} submissions</div>
              </div>
              {f.double_opt_in && <span className="chip" style={{color:"#10b981"}}>Double opt-in</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {(f.fields||[]).slice(0,6).map((x)=><span key={x.key} className="chip">{x.label}</span>)}
            </div>
            <div className="divider my-4"/>
            <div className="flex flex-wrap gap-2">
              <a className="btn btn-secondary text-xs" href={publicUrl(f.slug)} target="_blank" rel="noreferrer" data-testid={`form-open-${f.slug}`}><LinkSimple size={14}/> Open hosted page</a>
              <button className="btn btn-secondary text-xs" onClick={()=>{navigator.clipboard.writeText(publicUrl(f.slug)); toast.success("URL copied");}}><Copy size={14}/> Copy URL</button>
              <button className="btn btn-secondary text-xs" onClick={()=>{navigator.clipboard.writeText(embedCode(f.slug)); toast.success("Embed code copied");}}>Copy embed</button>
              <button className="btn btn-ghost text-xs" onClick={()=>openSubs(f)} data-testid={`form-subs-${f.slug}`}>View submissions</button>
              <button className="btn btn-ghost text-xs" onClick={()=>{setEdit(f); setShow(true);}}>Edit</button>
              <button className="btn btn-ghost text-xs" onClick={async()=>{ if(!window.confirm(`Delete form "${f.name}"?`)) return; await api.delete(`/forms/${f.id}`); toast.success("Deleted"); load(); }} data-testid={`form-del-${f.slug}`}>Delete</button>
            </div>
          </div>
        ))}
        </div>
        {rows.length===0 && <div className="text-[#94a3b8]">No forms yet.</div>}
      </div>
      <FormModal open={show} onClose={()=>setShow(false)} initial={edit} onSaved={load}/>
      <Modal open={!!viewing} onClose={()=>setViewing(null)} title={`Submissions · ${viewing?.name||""}`} wide>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {submissions.length===0 && <div className="text-sm text-[#94a3b8]">No submissions yet.</div>}
          {submissions.map((s)=>(
            <div key={s.id} className="card p-3 text-xs">
              <div className="flex justify-between"><span className="text-[#94a3b8]">{(s.created_at||"").slice(0,19)}</span>{s.consent_given && <span className="chip" style={{color:"#10b981"}}>Consent</span>}</div>
              <pre className="mt-2 text-[#cdd6e0] whitespace-pre-wrap text-xs">{JSON.stringify(s.answers,null,2)}</pre>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function FormModal({ open, onClose, initial, onSaved }) {
  const [f, setF] = useState(null);
  const [mode, setMode] = useState("single"); // "single" | "funnel"
  useEffect(()=>{
    const init = initial || { name:"", slug:"", double_opt_in:true, consent_text:"I agree to be contacted and accept the privacy policy.", fields:[{key:"first_name",label:"First Name",type:"text",required:true},{key:"email",label:"Email",type:"email",required:true}], steps:[] };
    setF(init);
    setMode((init.steps && init.steps.length>0) ? "funnel" : "single");
  },[initial, open]);
  if (!f) return null;

  // Single-step fields
  const updField = (i,p) => { const l=[...f.fields]; l[i]={...l[i],...p}; setF({...f,fields:l}); };
  const addField = () => setF({...f, fields:[...f.fields, {key:"",label:"",type:"text",required:false}]});
  const delField = (i) => setF({...f, fields:f.fields.filter((_,x)=>x!==i)});

  // Funnel steps
  const addStep = () => setF({ ...f, steps:[...(f.steps||[]), { id: `step-${Date.now()}`, title:"New Step", description:"", fields:[{key:"",label:"",type:"text",required:false}], branches:[] }] });
  const updStep = (si, patch) => { const s=[...f.steps]; s[si]={...s[si], ...patch}; setF({...f, steps:s}); };
  const delStep = (si) => setF({...f, steps:f.steps.filter((_,x)=>x!==si)});
  const updStepField = (si, fi, patch) => { const s=[...f.steps]; const flds=[...s[si].fields]; flds[fi]={...flds[fi], ...patch}; s[si]={...s[si], fields: flds}; setF({...f, steps:s}); };
  const addStepField = (si) => { const s=[...f.steps]; s[si]={...s[si], fields:[...s[si].fields, {key:"",label:"",type:"text",required:false}]}; setF({...f, steps:s}); };
  const delStepField = (si, fi) => { const s=[...f.steps]; s[si]={...s[si], fields:s[si].fields.filter((_,x)=>x!==fi)}; setF({...f, steps:s}); };
  const addBranch = (si) => { const s=[...f.steps]; s[si]={...s[si], branches:[...(s[si].branches||[]), {if_field:"", equals:"", goto_step_id:null}]}; setF({...f, steps:s}); };
  const updBranch = (si, bi, patch) => { const s=[...f.steps]; const br=[...(s[si].branches||[])]; br[bi]={...br[bi], ...patch}; s[si]={...s[si], branches: br}; setF({...f, steps:s}); };
  const delBranch = (si, bi) => { const s=[...f.steps]; s[si]={...s[si], branches:(s[si].branches||[]).filter((_,x)=>x!==bi)}; setF({...f, steps:s}); };

  const save = async () => {
    try {
      if (initial?.id) { toast.error("Editing existing forms in MVP updates via new version"); return; }
      const payload = { ...f };
      if (mode === "single") payload.steps = [];
      else payload.fields = [];
      await api.post("/forms", payload);
      toast.success("Form created"); onSaved(); onClose();
    } catch(e){ toast.error(e?.response?.data?.detail||"Failed"); }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial?"Edit Form":"New Lead Form"} wide>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Field label="Name"><input className="input" value={f.name} onChange={(e)=>setF({...f,name:e.target.value})} data-testid="form-name"/></Field>
        <Field label="Slug"><input className="input" value={f.slug} onChange={(e)=>setF({...f,slug:e.target.value.toLowerCase().replace(/\s+/g,"-")})} data-testid="form-slug"/></Field>
        <div className="col-span-2"><Field label="Consent text"><textarea className="textarea" value={f.consent_text} onChange={(e)=>setF({...f,consent_text:e.target.value})}/></Field></div>
        <div className="col-span-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.double_opt_in} onChange={(e)=>setF({...f,double_opt_in:e.target.checked})}/> Require double opt-in</label></div>
      </div>

      <div className="flex gap-2 mb-3">
        <button className={`btn ${mode==="single"?"btn-primary":"btn-secondary"}`} onClick={()=>setMode("single")} data-testid="mode-single">Single page</button>
        <button className={`btn ${mode==="funnel"?"btn-primary":"btn-secondary"}`} onClick={()=>{ setMode("funnel"); if(!(f.steps||[]).length) addStep(); }} data-testid="mode-funnel">Multi-step funnel</button>
      </div>

      {mode === "single" ? (
        <div className="card p-4">
          <div className="label-caps mb-2">Fields</div>
          {f.fields.map((fl,i)=>(
            <div key={i} className="grid grid-cols-[1fr_1.2fr_1fr_80px_auto] gap-2 mb-2">
              <input className="input" placeholder="key" value={fl.key} onChange={(e)=>updField(i,{key:e.target.value})}/>
              <input className="input" placeholder="Label" value={fl.label} onChange={(e)=>updField(i,{label:e.target.value})}/>
              <select className="select" value={fl.type} onChange={(e)=>updField(i,{type:e.target.value})}>
                <option value="text">text</option><option value="email">email</option><option value="phone">phone</option><option value="textarea">textarea</option><option value="select">select</option><option value="checkbox">checkbox</option>
              </select>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={fl.required} onChange={(e)=>updField(i,{required:e.target.checked})}/> Req</label>
              <button className="btn btn-ghost" onClick={()=>delField(i)}>✕</button>
            </div>
          ))}
          <button className="btn btn-secondary text-xs" onClick={addField}><Plus size={14}/> Add field</button>
        </div>
      ) : (
        <div className="space-y-4" data-testid="funnel-builder">
          {(f.steps||[]).map((st, si)=>(
            <div key={st.id} className="card p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 pr-3">
                  <input className="input font-semibold" placeholder={`Step ${si+1} title`} value={st.title} onChange={(e)=>updStep(si,{title:e.target.value})} data-testid={`step-title-${si}`}/>
                  <input className="input mt-2 text-xs" placeholder="Step description (optional)" value={st.description||""} onChange={(e)=>updStep(si,{description:e.target.value})}/>
                </div>
                <button className="btn btn-ghost" onClick={()=>delStep(si)}>✕</button>
              </div>
              <div className="space-y-2 mb-3">
                {st.fields.map((fl, fi)=>(
                  <div key={fi} className="grid grid-cols-[1fr_1.2fr_1fr_80px_auto] gap-2">
                    <input className="input" placeholder="key" value={fl.key} onChange={(e)=>updStepField(si,fi,{key:e.target.value})}/>
                    <input className="input" placeholder="Label" value={fl.label} onChange={(e)=>updStepField(si,fi,{label:e.target.value})}/>
                    <select className="select" value={fl.type} onChange={(e)=>updStepField(si,fi,{type:e.target.value})}>
                      <option value="text">text</option><option value="email">email</option><option value="phone">phone</option><option value="textarea">textarea</option><option value="select">select</option><option value="checkbox">checkbox</option>
                    </select>
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={fl.required} onChange={(e)=>updStepField(si,fi,{required:e.target.checked})}/> Req</label>
                    <button className="btn btn-ghost" onClick={()=>delStepField(si, fi)}>✕</button>
                  </div>
                ))}
                <button className="btn btn-secondary text-xs" onClick={()=>addStepField(si)}><Plus size={14}/> Add field</button>
              </div>

              <div className="label-caps mt-3 mb-2">Branches (conditional next step)</div>
              {(st.branches||[]).map((b, bi)=>(
                <div key={bi} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 mb-2">
                  <input className="input text-xs" placeholder="if field key" value={b.if_field} onChange={(e)=>updBranch(si, bi, {if_field:e.target.value})}/>
                  <input className="input text-xs" placeholder="equals" value={b.equals} onChange={(e)=>updBranch(si, bi, {equals:e.target.value})}/>
                  <select className="select text-xs" value={b.goto_step_id||""} onChange={(e)=>updBranch(si, bi, {goto_step_id:e.target.value||null})}>
                    <option value="">→ Submit</option>
                    {f.steps.filter((s,idx)=>idx!==si).map((s)=><option key={s.id} value={s.id}>→ {s.title}</option>)}
                  </select>
                  <button className="btn btn-ghost" onClick={()=>delBranch(si, bi)}>✕</button>
                </div>
              ))}
              <button className="btn btn-secondary text-xs" onClick={()=>addBranch(si)}><Plus size={14}/> Add branch</button>
            </div>
          ))}
          <button className="btn btn-secondary text-xs" onClick={addStep} data-testid="add-step-btn"><Plus size={14}/> Add step</button>
        </div>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} data-testid="form-save">Save</button>
      </div>
    </Modal>
  );
}
