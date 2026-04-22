import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, Modal, Field, fmtMoney } from "@/components/ui-kit";
import { Receipt, Plus, CreditCard, PaperPlaneTilt, Copy, CurrencyDollar } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { AttachmentsPanel } from "./Quotes";

export default function Invoices() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(null);
  const [params, setParams] = useSearchParams();

  const load = async () => {
    const [i, p, c, co] = await Promise.all([api.get("/invoices"), api.get("/products"), api.get("/contacts"), api.get("/companies")]);
    setRows(i.data); setProducts(p.data); setContacts(c.data); setCompanies(co.data);
  };
  useEffect(()=>{ load(); }, []);

  // Poll Stripe session if returning
  useEffect(() => {
    const sid = params.get("session_id");
    if (!sid) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      try {
        const { data } = await api.get(`/payments/status/${sid}`);
        if (data.payment_status === "paid") { toast.success("Payment received!"); clearInterval(timer); load(); }
        else if (data.status === "expired" || tries > 8) { clearInterval(timer); }
      } catch { clearInterval(timer); }
    }, 2000);
    return () => clearInterval(timer);
  }, [params]);

  // PayPal return: poll status until captured (PP redirects with ?paypal=success&token=<order_id>)
  useEffect(() => {
    const pp = params.get("paypal");
    const token = params.get("token") || params.get("paypal_order_id");
    if (pp !== "success" || !token) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      try {
        const { data } = await api.get(`/payments/paypal/status/${token}`);
        if (data.payment_status === "paid") { toast.success("PayPal payment captured!"); clearInterval(timer); load(); }
        else if (tries > 10) { clearInterval(timer); toast("Payment still pending — refresh in a moment."); }
      } catch { clearInterval(timer); }
    }, 2000);
    return () => clearInterval(timer);
  }, [params]);

  const send = async (id) => { await api.post(`/invoices/${id}/send`); toast.success("Marked sent"); load(); };
  const checkout = async (inv) => {
    try {
      const { data } = await api.post("/payments/checkout", { invoice_id: inv.id, origin_url: window.location.origin });
      window.location.href = data.url;
    } catch(e){ toast.error(e?.response?.data?.detail||"Failed to create checkout"); }
  };
  const paypalPay = async (inv) => {
    try {
      const { data } = await api.post("/payments/paypal/checkout", { invoice_id: inv.id, origin_url: window.location.origin });
      window.location.href = data.url;
    } catch(e){ toast.error(e?.response?.data?.detail||"PayPal unavailable"); }
  };
  const copyLink = (link) => { navigator.clipboard.writeText(link); toast.success("Payment link copied"); };

  const statusChip = (s) => {
    const color = s==="paid"?"#10b981":s==="sent"?"#e26e4a":s==="overdue"?"#ef4444":"#94a3b8";
    return <span className="chip" style={{color}}>{s}</span>;
  };

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle={`${rows.length} invoices — ${rows.filter((x)=>x.status==="paid").length} paid`}
        icon={Receipt}
        actions={<button className="btn btn-primary" onClick={()=>{setEdit(null); setShow(true);}} data-testid="new-invoice-btn"><Plus size={16}/> New Invoice</button>}
      />
      <div className="px-8 py-6">
        <div className="card overflow-hidden">
          <table className="atable" data-testid="invoices-table">
            <thead><tr><th>Number</th><th>Status</th><th>Issued</th><th>Due</th><th>Total</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {rows.map((inv)=>(
                <tr key={inv.id} data-testid={`invoice-row-${inv.id}`}>
                  <td className="font-mono text-sm">{inv.number}</td>
                  <td>{statusChip(inv.status)}</td>
                  <td className="text-xs text-[#94a3b8]">{(inv.issue_date||"").slice(0,10)}</td>
                  <td className="text-xs text-[#94a3b8]">{(inv.due_date||"").slice(0,10)}</td>
                  <td className="font-medium">{fmtMoney(inv.grand_total, inv.currency)}</td>
                  <td className="text-right space-x-1">
                    <button className="btn btn-ghost text-xs" onClick={()=>{setEdit(inv); setShow(true);}} data-testid={`invoice-edit-${inv.id}`}>Edit</button>
                    {inv.status!=="paid" && inv.status!=="sent" && <button className="btn btn-secondary text-xs" onClick={()=>send(inv.id)}><PaperPlaneTilt size={14}/> Send</button>}
                    {inv.payment_link && <button className="btn btn-secondary text-xs" onClick={()=>copyLink(inv.payment_link)}><Copy size={14}/> Copy Link</button>}
                    {inv.status!=="paid" && <button className="btn btn-primary text-xs" onClick={()=>checkout(inv)} data-testid={`invoice-pay-${inv.id}`}><CreditCard size={14}/> Stripe</button>}
                    {inv.status!=="paid" && <button className="btn btn-secondary text-xs" onClick={()=>paypalPay(inv)} data-testid={`invoice-paypal-${inv.id}`} style={{borderColor:"#0070ba", color:"#0070ba"}}><CurrencyDollar size={14}/> PayPal</button>}
                  </td>
                </tr>
              ))}
              {rows.length===0 && <tr><td colSpan={6} className="text-center text-[#94a3b8] py-10">No invoices yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <InvoiceModal open={show} onClose={()=>setShow(false)} initial={edit} products={products} contacts={contacts} companies={companies} onSaved={load}/>
    </div>
  );
}

function InvoiceModal({ open, onClose, initial, products, contacts, companies, onSaved }) {
  const [f, setF] = useState(null);
  useEffect(()=>{
    setF(initial || { currency:"USD", line_items:[{description:"", qty:1, unit_price:0, discount_pct:0, tax_rate:0}], contact_id:null, company_id:null });
  },[initial, open]);
  if (!f) return null;

  const updateLine = (i,p) => { const l=[...f.line_items]; l[i]={...l[i],...p}; setF({...f,line_items:l}); };
  const addLine = () => setF({...f, line_items:[...f.line_items, {description:"",qty:1,unit_price:0,discount_pct:0,tax_rate:0}]});
  const delLine = (i) => setF({...f, line_items:f.line_items.filter((_,x)=>x!==i)});
  const totals = (()=>{let sub=0,disc=0,tax=0; f.line_items.forEach((l)=>{const s=l.qty*l.unit_price;const d=s*(l.discount_pct||0)/100;const n=s-d;const t=n*(l.tax_rate||0)/100;sub+=s;disc+=d;tax+=t;});return{sub,disc,tax,grand:sub-disc+tax};})();

  const save = async () => {
    try {
      if (initial?.id) await api.put(`/invoices/${initial.id}`, f);
      else await api.post("/invoices", f);
      toast.success("Saved"); onSaved(); onClose();
    } catch(e){ toast.error(e?.response?.data?.detail||"Failed"); }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial?`Edit ${initial.number}`:"New Invoice"} wide>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Field label="Contact"><select className="select" value={f.contact_id||""} onChange={(e)=>setF({...f,contact_id:e.target.value||null})}><option value="">—</option>{contacts.map((c)=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}</select></Field>
        <Field label="Company"><select className="select" value={f.company_id||""} onChange={(e)=>setF({...f,company_id:e.target.value||null})}><option value="">—</option>{companies.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      </div>
      <div className="card p-4 mb-4">
        <div className="label-caps mb-2">Line items</div>
        {f.line_items.map((l,i)=>(
          <div key={i} className="grid grid-cols-[2fr_1fr_1fr_80px_80px_auto] gap-2 items-center mb-2">
            <div className="space-y-1">
              <select className="select text-xs" onChange={(e)=>{const p=products.find((x)=>x.id===e.target.value);if(p)updateLine(i,{product_id:p.id,description:p.name,unit_price:p.unit_price,tax_rate:p.tax_rate});}}><option value="">— pick —</option>{products.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <input className="input" placeholder="Description" value={l.description||""} onChange={(e)=>updateLine(i,{description:e.target.value})}/>
            </div>
            <input type="number" className="input" value={l.qty} onChange={(e)=>updateLine(i,{qty:parseFloat(e.target.value)||0})}/>
            <input type="number" className="input" value={l.unit_price} onChange={(e)=>updateLine(i,{unit_price:parseFloat(e.target.value)||0})}/>
            <input type="number" className="input" value={l.discount_pct||0} onChange={(e)=>updateLine(i,{discount_pct:parseFloat(e.target.value)||0})}/>
            <input type="number" className="input" value={l.tax_rate||0} onChange={(e)=>updateLine(i,{tax_rate:parseFloat(e.target.value)||0})}/>
            <button className="btn btn-ghost" onClick={()=>delLine(i)}>✕</button>
          </div>
        ))}
        <button className="btn btn-secondary text-xs" onClick={addLine}><Plus size={14}/> Add line</button>
        <div className="flex justify-end mt-4">
          <div className="min-w-[220px] space-y-1 text-right">
            <div className="flex justify-between text-sm"><span className="text-[#94a3b8]">Subtotal</span><span>{fmtMoney(totals.sub,f.currency)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#94a3b8]">Tax</span><span>{fmtMoney(totals.tax,f.currency)}</span></div>
            <div className="flex justify-between font-head text-xl font-semibold"><span>Total</span><span>{fmtMoney(totals.grand,f.currency)}</span></div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Currency"><select className="select" value={f.currency} onChange={(e)=>setF({...f,currency:e.target.value})}><option>USD</option><option>ZAR</option><option>EUR</option><option>GBP</option></select></Field>
        <Field label="Due Date"><input type="date" className="input" value={(f.due_date||"").slice(0,10)} onChange={(e)=>setF({...f, due_date:e.target.value})}/></Field>
      </div>
      {initial?.id && <AttachmentsPanel resource="invoices" resourceId={initial.id}/>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} data-testid="invoice-save">Save Invoice</button>
      </div>
    </Modal>
  );
}
