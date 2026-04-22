import React, { useEffect, useState } from "react";
import { api, API_BASE } from "@/api";
import { PageHeader, Modal, Field, Empty } from "@/components/ui-kit";
import { MagnifyingGlass, Plus, Copy, Sparkle, CheckCircle, XCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function SEOTools() {
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(null);

  const load = async () => { const { data } = await api.get("/seo/pages"); setRows(data); };
  useEffect(()=>{ load(); },[]);

  const del = async (id) => { if(!window.confirm("Delete page meta?")) return; await api.delete(`/seo/pages/${id}`); toast.success("Deleted"); load(); };

  const copySitemap = async () => {
    const url = `${API_BASE}/seo/sitemap.xml?owner_email=demo@climbleadershiplab.com`;
    navigator.clipboard.writeText(url);
    toast.success("Sitemap URL copied");
  };

  return (
    <div>
      <PageHeader
        title="SEO Tools"
        subtitle="Meta management · Sitemap · Schema.org · Performance checks"
        icon={MagnifyingGlass}
        actions={
          <>
            <button className="btn btn-secondary" onClick={copySitemap} data-testid="seo-copy-sitemap"><Copy size={16}/> Copy sitemap URL</button>
            <button className="btn btn-primary" onClick={()=>{setEdit(null); setShow(true);}} data-testid="seo-new-page-btn"><Plus size={16}/> Add page</button>
          </>
        }
      />
      <div className="px-8 py-6 space-y-6">
        <div className="card p-5 topo-card">
          <div className="label-caps">Sitemap.xml</div>
          <div className="text-sm mt-2 text-[#f0f3f8]">Auto-generated from the pages below. Point your CDN / framework robots.txt at:</div>
          <code className="block mt-2 text-xs text-[#e26e4a] break-all" data-testid="seo-sitemap-url">{API_BASE}/seo/sitemap.xml?owner_email=demo@climbleadershiplab.com</code>
        </div>

        {rows.length===0 ? (
          <Empty title="No pages managed yet" subtitle="Add a page to manage its title / meta description / Open Graph tags / schema.org JSON-LD in one place."
            icon={MagnifyingGlass}
            cta={<button className="btn btn-primary" onClick={()=>{setEdit(null); setShow(true);}}>Add First Page</button>}/>
        ) : (
          <div className="space-y-3">
            {rows.map((p)=>{
              const passed = (p.checklist||[]).filter((c)=>c.pass).length;
              const total = (p.checklist||[]).length;
              return (
                <div key={p.id} className="card p-5" data-testid={`seo-page-${p.id}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="label-caps">{p.url_path}</div>
                      <div className="font-head text-xl font-semibold mt-1">{p.title}</div>
                      <div className="text-sm text-[#94a3b8] mt-1">{p.meta_description}</div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {(p.keywords||[]).map((k)=><span key={k} className="chip">{k}</span>)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`chip ${passed===total?"":""}`} style={{color: passed===total?"#10b981":"#f59e0b"}}>
                        {passed}/{total} checks
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-1 text-xs">
                    {(p.checklist||[]).map((c,i)=>(
                      <div key={i} className={`flex items-center gap-1 ${c.pass?"text-[#10b981]":"text-[#f59e0b]"}`}>
                        {c.pass ? <CheckCircle size={14}/> : <XCircle size={14}/>}<span className="text-[#94a3b8]">{c.check}{c.value!==undefined?` (${c.value})`:""}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button className="btn btn-ghost text-xs" onClick={()=>{setEdit(p); setShow(true);}}>Edit</button>
                    <button className="btn btn-ghost text-xs" onClick={()=>del(p.id)}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <PageMetaModal open={show} onClose={()=>setShow(false)} initial={edit} onSaved={load}/>
    </div>
  );
}

function PageMetaModal({ open, onClose, initial, onSaved }) {
  const [f, setF] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  useEffect(()=>{
    setF(initial || { url_path:"/", title:"", meta_description:"", keywords:[], canonical_url:"", og_title:"", og_description:"", og_image:"", schema_jsonld:"", priority:0.7, changefreq:"weekly" });
  },[initial, open]);
  if (!f) return null;

  const save = async () => {
    try {
      if (initial?.id) await api.put(`/seo/pages/${initial.id}`, f);
      else await api.post("/seo/pages", f);
      toast.success("Saved"); onSaved(); onClose();
    } catch(e){ toast.error(e?.response?.data?.detail||"Failed"); }
  };

  const aiSchema = async () => {
    if (!f.url_path || !f.title) return toast.error("Set URL path + title first");
    setLoadingAI(true);
    try {
      const { data } = await api.post("/seo/schema-suggest", { url_path: f.url_path, page_title: f.title, business_type: "coach" });
      setF({ ...f, schema_jsonld: data.jsonld });
      toast.success("Schema.org JSON-LD generated (review before publishing)");
    } catch(e) { toast.error(e?.response?.data?.detail||"AI failed"); }
    finally { setLoadingAI(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial?"Edit Page Meta":"New Page Meta"} wide>
      <div className="grid grid-cols-2 gap-4" data-testid="seo-form">
        <Field label="URL path"><input className="input" value={f.url_path} onChange={(e)=>setF({...f,url_path:e.target.value})} placeholder="/services/100x-leader" data-testid="seo-urlpath"/></Field>
        <Field label="Canonical URL (full)"><input className="input" value={f.canonical_url||""} onChange={(e)=>setF({...f,canonical_url:e.target.value})}/></Field>
        <div className="col-span-2"><Field label="Title (30–60 chars)"><input className="input" value={f.title} onChange={(e)=>setF({...f,title:e.target.value})} data-testid="seo-title"/></Field></div>
        <div className="col-span-2"><Field label="Meta description (70–160 chars)"><textarea className="textarea" value={f.meta_description} onChange={(e)=>setF({...f,meta_description:e.target.value})} data-testid="seo-meta"/></Field></div>
        <div className="col-span-2"><Field label="Keywords (comma)"><input className="input" value={(f.keywords||[]).join(", ")} onChange={(e)=>setF({...f,keywords:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})}/></Field></div>
        <Field label="OG title"><input className="input" value={f.og_title||""} onChange={(e)=>setF({...f,og_title:e.target.value})}/></Field>
        <Field label="OG image URL"><input className="input" value={f.og_image||""} onChange={(e)=>setF({...f,og_image:e.target.value})}/></Field>
        <Field label="Priority (0–1)"><input type="number" step="0.1" max="1" min="0" className="input" value={f.priority} onChange={(e)=>setF({...f,priority:parseFloat(e.target.value)||0.5})}/></Field>
        <Field label="Change frequency">
          <select className="select" value={f.changefreq} onChange={(e)=>setF({...f,changefreq:e.target.value})}>
            {["always","hourly","daily","weekly","monthly","yearly","never"].map((x)=><option key={x}>{x}</option>)}
          </select>
        </Field>
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-2">
            <div className="label-caps">Schema.org JSON-LD</div>
            <button className="btn btn-secondary text-xs" onClick={aiSchema} disabled={loadingAI} data-testid="seo-ai-schema"><Sparkle size={14}/> {loadingAI?"Generating…":"AI generate (grounded)"}</button>
          </div>
          <textarea className="textarea font-mono text-xs" style={{minHeight:160}} value={f.schema_jsonld||""} onChange={(e)=>setF({...f,schema_jsonld:e.target.value})} placeholder='{"@context":"schema.org","@type":"Service", ...}' data-testid="seo-jsonld"/>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} data-testid="seo-save">Save</button>
      </div>
    </Modal>
  );
}
