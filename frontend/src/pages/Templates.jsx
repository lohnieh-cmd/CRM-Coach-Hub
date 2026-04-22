import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, fmtMoney, Field } from "@/components/ui-kit";
import { Stack, CheckCircle, FileDoc, FloppyDisk } from "@phosphor-icons/react";
import { toast } from "sonner";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "";

export default function Templates() {
  const [rows, setRows] = useState([]);
  useEffect(()=>{ api.get("/templates").then(({data})=>setRows(data)); },[]);

  const apply = async (t) => {
    if (!window.confirm(`Apply "${t.name}"? This replaces your pipeline stages and adds sample products.`)) return;
    try {
      await api.post(`/templates/${t.id}/apply`);
      toast.success(`Template "${t.name}" applied`);
    } catch { toast.error("Failed"); }
  };

  return (
    <div>
      <PageHeader title="Coaching Templates" subtitle="Pre-built pipelines + your Word quote template" icon={Stack}/>
      <div className="px-8 py-6 space-y-6">
        <QuoteTemplateEditor/>
        <div>
          <div className="label-caps mb-3">Coaching pipeline presets</div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {rows.map((t)=>(
              <div key={t.id} className="card p-6 flex flex-col card-interactive" data-testid={`template-${t.kind}`}>
                <div className="label-caps">{t.kind}</div>
                <h3 className="font-head text-xl font-semibold mt-1">{t.name}</h3>
                <p className="text-sm text-[#94a3b8] mt-2 flex-1">{t.description}</p>

                <div className="mt-4 space-y-1 text-xs">
                  <div className="label-caps">Pipeline stages</div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {t.pipeline_stages.map((s)=><span key={s.name} className="chip">{s.name}</span>)}
                  </div>
                </div>

                <div className="mt-4 space-y-1 text-xs">
                  <div className="label-caps">Sample products</div>
                  {t.sample_products.map((p)=>(
                    <div key={p.sku} className="flex justify-between text-[#94a3b8]"><span>{p.name}</span><span>{fmtMoney(p.unit_price,p.currency)}</span></div>
                  ))}
                </div>

                <button className="btn btn-primary mt-6 justify-center" onClick={()=>apply(t)} data-testid={`apply-template-${t.kind}`}><CheckCircle size={16}/> Apply Template</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuoteTemplateEditor() {
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await api.get("/auth/quote-template");
    setF(data);
  };
  useEffect(()=>{ load(); },[]);

  if (!f) return null;

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/auth/quote-template", f);
      toast.success("Word template saved — next Word export will use these settings.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const previewSample = async () => {
    // Fetch ANY quote and download its Word to let user preview the template.
    const { data: quotes } = await api.get("/quotes");
    if (!quotes.length) return toast.error("Create a quote first, then preview the Word template.");
    const first = quotes[0];
    try {
      const r = await fetch(`${BACKEND}/api/quotes/${first.id}/export/docx`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("ascent_token") || ""}` },
      });
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Preview_${first.number}.docx`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      toast.success("Preview downloaded — check your browser's Downloads folder (usually ~/Downloads on Mac, C:\\Users\\<you>\\Downloads on Windows).");
    } catch {
      toast.error("Preview failed");
    }
  };

  return (
    <div className="card p-6" data-testid="quote-template-editor">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="label-caps">Word Quote Template</div>
          <h3 className="font-head text-xl font-semibold mt-1">Customise your quote documents</h3>
          <p className="text-xs text-[#94a3b8] mt-1">These values are merged into every Word (.docx) export. Save then click "Preview Word" to see the result.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary text-sm" onClick={previewSample} data-testid="template-preview-word"><FileDoc size={14}/> Preview Word</button>
          <button className="btn btn-primary text-sm" onClick={save} disabled={saving} data-testid="template-save"><FloppyDisk size={14}/> {saving ? "Saving…" : "Save template"}</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Document title (heading)">
          <input className="input" value={f.title_label || ""} placeholder="QUOTATION" onChange={(e)=>setF({...f,title_label:e.target.value})} data-testid="tpl-title"/>
        </Field>
        <Field label="Company name (FROM block)">
          <input className="input" value={f.company_name || ""} placeholder="Climb Leadership Lab" onChange={(e)=>setF({...f,company_name:e.target.value})} data-testid="tpl-company"/>
        </Field>
        <Field label="Accent colour (hex, without #)">
          <div className="flex gap-2 items-center">
            <input className="input" value={f.accent_color_hex || ""} placeholder="E26E4A" maxLength={6} onChange={(e)=>setF({...f,accent_color_hex:e.target.value.toUpperCase().replace(/[^0-9A-F]/g,"")})} data-testid="tpl-color"/>
            <div className="w-10 h-10 rounded border border-[#283341]" style={{background: `#${(f.accent_color_hex||"E26E4A")}`}}/>
          </div>
        </Field>
        <Field label="Tagline (bottom footer line)">
          <input className="input" value={f.tagline || ""} placeholder="Ascent CRM · Climb Leadership Lab" onChange={(e)=>setF({...f,tagline:e.target.value})} data-testid="tpl-tagline"/>
        </Field>
        <div className="col-span-2">
          <Field label="Footer text (after terms, italic)">
            <textarea className="textarea" rows={2} value={f.footer_text || ""} placeholder="Thank you for your business. Please sign and return to accept." onChange={(e)=>setF({...f,footer_text:e.target.value})} data-testid="tpl-footer"/>
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Signature block (your name, role, email — appears before the footer)">
            <textarea className="textarea" rows={3} value={f.signature_block || ""} placeholder={"Aleksia van der Merwe\nSenior Coach — Climb Leadership Lab\naleksia@climbleadershiplab.com"} onChange={(e)=>setF({...f,signature_block:e.target.value})} data-testid="tpl-signature"/>
          </Field>
        </div>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-[#94a3b8] hover:text-[#e26e4a]">Where are my downloaded Word files?</summary>
        <div className="text-xs text-[#94a3b8] mt-2 space-y-1">
          <div><strong>Windows:</strong> <code className="text-[#e26e4a]">C:\Users\&lt;your-name&gt;\Downloads\Quote_QT-2026-0001.docx</code></div>
          <div><strong>macOS:</strong> <code className="text-[#e26e4a]">~/Downloads/Quote_QT-2026-0001.docx</code> (Finder → ⌘+Shift+L)</div>
          <div><strong>Linux:</strong> <code className="text-[#e26e4a]">~/Downloads/Quote_QT-2026-0001.docx</code></div>
          <div className="mt-1">Your browser's toolbar usually shows the file at the bottom — click it to open in Word. If no toast appears, allow pop-ups / automatic downloads for this site.</div>
        </div>
      </details>
    </div>
  );
}
