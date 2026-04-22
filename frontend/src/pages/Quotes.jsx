import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, Modal, Field, fmtMoney } from "@/components/ui-kit";
import { FileText, Plus, Trash, PaperPlaneTilt, CheckCircle, ArrowRight, FileDoc, Paperclip, DownloadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "";

export default function Quotes() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [deals, setDeals] = useState([]);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(null);

  const load = async () => {
    const [q, p, c, co, d] = await Promise.all([
      api.get("/quotes"), api.get("/products"), api.get("/contacts"), api.get("/companies"), api.get("/deals"),
    ]);
    setRows(q.data); setProducts(p.data); setContacts(c.data); setCompanies(co.data); setDeals(d.data);
  };
  useEffect(() => { load(); }, []);

  const statusChip = (s) => {
    const color = s==="accepted"?"#10b981":s==="sent"?"#e26e4a":s==="declined"?"#ef4444":"#94a3b8";
    return <span className="chip" style={{color}}>{s}</span>;
  };

  const send = async (id) => { await api.post(`/quotes/${id}/send`); toast.success("Marked sent"); load(); };
  const accept = async (id) => { await api.post(`/quotes/${id}/accept`, { signature_name: "Demo Client" }); toast.success("Quote accepted"); load(); };
  const toInvoice = async (id) => { const { data } = await api.post(`/quotes/${id}/to-invoice`); toast.success(`Invoice ${data.number} created`); };

  const downloadWord = async (q) => {
    // Fetch .docx via fetch so we can send the Authorization header; browser download via blob URL.
    try {
      const r = await fetch(`${BACKEND}/api/quotes/${q.id}/export/docx`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("ascent_token") || ""}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Quote_${q.number}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Word doc downloaded — check your browser's Downloads folder. Open in Word to preview, print or send.");
    } catch (e) {
      toast.error("Failed to export Word doc");
    }
  };

  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle={`${rows.length} quotes`}
        icon={FileText}
        actions={<button className="btn btn-primary" onClick={()=>{setEdit(null); setShow(true);}} data-testid="new-quote-btn"><Plus size={16}/> New Quote</button>}
      />
      <div className="px-8 py-6">
        <div className="card overflow-hidden">
          <table className="atable" data-testid="quotes-table">
            <thead><tr><th>Number</th><th>Status</th><th>Lines</th><th>Total</th><th>Valid Until</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {rows.map((q)=>(
                <tr key={q.id}>
                  <td className="font-mono text-sm">{q.number}</td>
                  <td>{statusChip(q.status)}</td>
                  <td className="text-[#94a3b8]">{q.line_items?.length || 0}</td>
                  <td className="font-medium">{fmtMoney(q.grand_total, q.currency)}</td>
                  <td className="text-[#94a3b8] text-xs">{q.valid_until || "—"}</td>
                  <td className="text-right space-x-1">
                    <button className="btn btn-ghost text-xs" onClick={()=>{setEdit(q); setShow(true);}} data-testid={`quote-edit-${q.id}`}>Edit</button>
                    <button className="btn btn-secondary text-xs" onClick={()=>downloadWord(q)} data-testid={`quote-word-${q.id}`}><FileDoc size={14}/> Word</button>
                    {q.status!=="sent" && q.status!=="accepted" && <button className="btn btn-secondary text-xs" onClick={()=>send(q.id)} data-testid={`quote-send-${q.id}`}><PaperPlaneTilt size={14}/>Send</button>}
                    {q.status==="sent" && <button className="btn btn-secondary text-xs" onClick={()=>accept(q.id)} data-testid={`quote-accept-${q.id}`}><CheckCircle size={14}/>Accept</button>}
                    {q.status==="accepted" && <button className="btn btn-primary text-xs" onClick={()=>toInvoice(q.id)} data-testid={`quote-invoice-${q.id}`}><ArrowRight size={14}/>Invoice</button>}
                  </td>
                </tr>
              ))}
              {rows.length===0 && <tr><td colSpan={6} className="text-center text-[#94a3b8] py-10">No quotes yet — create your first.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <QuoteModal open={show} onClose={()=>setShow(false)} initial={edit} products={products} contacts={contacts} companies={companies} deals={deals} onSaved={load}/>
    </div>
  );
}

function QuoteModal({ open, onClose, initial, products, contacts, companies, deals, onSaved }) {
  const [f, setF] = useState(null);
  useEffect(()=>{
    setF(initial || { currency: "USD", line_items: [{ description:"", qty:1, unit_price:0, discount_pct:0, tax_rate:0 }], valid_until: "", valid_days: 30, terms: "Net 14", contact_id:null, company_id:null, deal_id:null });
  },[initial, open]);
  if (!f) return null;

  const updateLine = (i, patch) => {
    const lines = [...(f.line_items||[])];
    lines[i] = { ...lines[i], ...patch };
    setF({ ...f, line_items: lines });
  };
  const addLine = () => setF({ ...f, line_items: [...(f.line_items||[]), { description:"", qty:1, unit_price:0, discount_pct:0, tax_rate:0 }] });
  const delLine = (i) => setF({ ...f, line_items: f.line_items.filter((_,x)=>x!==i) });

  const totals = (() => {
    let sub=0, disc=0, tax=0;
    (f.line_items||[]).forEach((l)=>{ const s=l.qty*l.unit_price; const d=s*(l.discount_pct||0)/100; const n=s-d; const t=n*(l.tax_rate||0)/100; sub+=s; disc+=d; tax+=t;});
    return { subtotal: sub, discount: disc, tax, grand: sub-disc+tax };
  })();

  const previewValid = (() => {
    if (f.valid_until) return f.valid_until;
    if (f.valid_days) {
      const d = new Date();
      d.setDate(d.getDate() + parseInt(f.valid_days || 0, 10));
      return d.toISOString().slice(0, 10);
    }
    return "—";
  })();

  const save = async () => {
    try {
      const payload = { ...f };
      if (payload.valid_days === "") payload.valid_days = null;
      if (initial?.id) await api.put(`/quotes/${initial.id}`, payload);
      else await api.post("/quotes", payload);
      toast.success("Saved"); onSaved(); onClose();
    } catch(e){ toast.error(e?.response?.data?.detail||"Failed"); }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial?`Edit ${initial.number}`:"New Quote"} wide>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Field label="Contact">
          <select className="select" value={f.contact_id||""} onChange={(e)=>setF({...f, contact_id:e.target.value||null})} data-testid="quote-contact">
            <option value="">—</option>{contacts.map((c)=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
          </select>
        </Field>
        <Field label="Company">
          <select className="select" value={f.company_id||""} onChange={(e)=>setF({...f, company_id:e.target.value||null})} data-testid="quote-company">
            <option value="">—</option>{companies.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Deal">
          <select className="select" value={f.deal_id||""} onChange={(e)=>setF({...f, deal_id:e.target.value||null})}>
            <option value="">—</option>{deals.map((d)=><option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        </Field>
      </div>

      <div className="card p-4 mb-4" data-testid="quote-lines">
        <div className="label-caps mb-2">Line items</div>
        <div className="space-y-2">
          {(f.line_items||[]).map((l,i)=>(
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_80px_80px_auto] gap-2 items-center">
              <div className="space-y-1">
                <select className="select text-xs" onChange={(e)=>{
                  const p = products.find((x)=>x.id===e.target.value);
                  if (p) updateLine(i, { product_id: p.id, description: p.name, unit_price: p.unit_price, tax_rate: p.tax_rate });
                }} data-testid={`line-product-${i}`}>
                  <option value="">— pick product —</option>
                  {products.map((p)=><option key={p.id} value={p.id}>{p.name} · {p.currency} {p.unit_price}</option>)}
                </select>
                <input className="input" placeholder="Description" value={l.description||""} onChange={(e)=>updateLine(i,{description:e.target.value})}/>
              </div>
              <input type="number" className="input" placeholder="Qty" value={l.qty} onChange={(e)=>updateLine(i,{qty:parseFloat(e.target.value)||0})}/>
              <input type="number" className="input" placeholder="Unit" value={l.unit_price} onChange={(e)=>updateLine(i,{unit_price:parseFloat(e.target.value)||0})}/>
              <input type="number" className="input" placeholder="Disc %" value={l.discount_pct||0} onChange={(e)=>updateLine(i,{discount_pct:parseFloat(e.target.value)||0})}/>
              <input type="number" className="input" placeholder="Tax %" value={l.tax_rate||0} onChange={(e)=>updateLine(i,{tax_rate:parseFloat(e.target.value)||0})}/>
              <button className="btn btn-ghost" onClick={()=>delLine(i)}><Trash size={16}/></button>
            </div>
          ))}
          <button className="btn btn-secondary text-xs" onClick={addLine} data-testid="add-line-btn"><Plus size={14}/> Add line</button>
        </div>
        <div className="divider my-4"/>
        <div className="flex justify-end">
          <div className="text-right space-y-1 min-w-[220px]">
            <div className="flex justify-between text-sm"><span className="text-[#94a3b8]">Subtotal</span><span>{fmtMoney(totals.subtotal,f.currency)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#94a3b8]">Discount</span><span>−{fmtMoney(totals.discount,f.currency)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#94a3b8]">Tax</span><span>{fmtMoney(totals.tax,f.currency)}</span></div>
            <div className="flex justify-between font-head text-xl font-semibold"><span>Total</span><span>{fmtMoney(totals.grand,f.currency)}</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Currency">
          <select className="select" value={f.currency} onChange={(e)=>setF({...f, currency:e.target.value})}>
            <option>USD</option><option>ZAR</option><option>EUR</option><option>GBP</option>
          </select>
        </Field>
        <Field label="Valid for (days)">
          <input type="number" min="1" className="input" value={f.valid_days||""} placeholder="e.g. 30" onChange={(e)=>setF({...f, valid_days: e.target.value ? parseInt(e.target.value,10) : null, valid_until: "" })} data-testid="quote-valid-days"/>
        </Field>
        <Field label="Valid Until (override)">
          <input type="date" className="input" value={f.valid_until||""} onChange={(e)=>setF({...f, valid_until:e.target.value})} data-testid="quote-valid-until"/>
        </Field>
        <div className="col-span-3 text-xs text-[#94a3b8]" data-testid="quote-valid-preview">
          Auto-calculated valid-until: <span className="text-[#e26e4a]">{previewValid}</span>
          {f.valid_days && !f.valid_until && <> (issued today + {f.valid_days} days)</>}
        </div>
        <div className="col-span-3"><Field label="Terms"><textarea className="textarea" value={f.terms||""} onChange={(e)=>setF({...f,terms:e.target.value})}/></Field></div>
      </div>

      {initial?.id && <AttachmentsPanel resource="quotes" resourceId={initial.id}/>}

      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} data-testid="quote-save">Save Quote</button>
      </div>
    </Modal>
  );
}

// Shared attachments panel (used by Quote + Invoice modals)
export function AttachmentsPanel({ resource, resourceId }) {
  const [atts, setAtts] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await api.get(`/${resource}/${resourceId}/attachments`);
    setAtts(data);
  };
  useEffect(()=>{ if (resourceId) load(); /* eslint-disable-next-line */ }, [resourceId]);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", resource === "quotes" ? "signed_quote" : "signed_invoice");
      await api.post(`/${resource}/${resourceId}/attachments`, fd, { headers: { "Content-Type": "multipart/form-data" }});
      toast.success("Attachment uploaded");
      load();
    } catch(err){
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const download = async (att) => {
    const r = await fetch(`${BACKEND}/api/attachments/${att.id}/download`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("ascent_token") || ""}` },
    });
    if (!r.ok) return toast.error("Download failed");
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = att.filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const del = async (id) => {
    if (!window.confirm("Delete this attachment?")) return;
    await api.delete(`/attachments/${id}`);
    load();
  };

  return (
    <div className="card p-4 mt-4" data-testid={`attachments-${resource}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="label-caps flex items-center gap-2"><Paperclip size={14}/> Attachments</div>
        <label className="btn btn-secondary text-xs cursor-pointer" data-testid={`attach-upload-${resource}`}>
          <Plus size={14}/> {busy ? "Uploading…" : "Upload PDF / file"}
          <input type="file" className="hidden" accept=".pdf,.docx,.doc,.png,.jpg,.jpeg" onChange={onPick} disabled={busy} data-testid={`attach-input-${resource}`}/>
        </label>
      </div>
      {atts.length === 0 ? (
        <div className="text-xs text-[#94a3b8]">No attachments yet. Upload a signed {resource === "quotes" ? "quotation" : "invoice"} PDF here.</div>
      ) : (
        <div className="space-y-1">
          {atts.map(a => (
            <div key={a.id} className="flex items-center justify-between p-2 rounded border border-[#283341] text-xs" data-testid={`attach-row-${a.id}`}>
              <div>
                <div className="font-mono">{a.filename}</div>
                <div className="text-[#94a3b8]">{a.kind} · {(a.size/1024).toFixed(1)} KB · {new Date(a.created_at).toLocaleString()}</div>
              </div>
              <div className="flex gap-1">
                <button className="btn btn-ghost text-xs" onClick={()=>download(a)}><DownloadSimple size={12}/></button>
                <button className="btn btn-ghost text-xs" onClick={()=>del(a.id)}><Trash size={12}/></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
