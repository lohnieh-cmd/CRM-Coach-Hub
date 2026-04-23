import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, Modal, Field, fmtMoney } from "@/components/ui-kit";
import { ArrowsClockwise, Plus, Warning, Pause, Play } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Subscriptions() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [show, setShow] = useState(false);

  const load = async () => {
    const [s, p, c] = await Promise.all([api.get("/subscriptions"), api.get("/products"), api.get("/contacts")]);
    setRows(s.data.filter((x) => !x.deleted_at));
    setProducts(p.data);
    setContacts(c.data);
  };
  useEffect(() => { load(); }, []);

  const tick = async (id) => {
    try {
      const { data } = await api.post(`/subscriptions/${id}/tick`);
      if (data.invoice_number) toast.success(`Generated invoice ${data.invoice_number}`);
      else toast.info(`Status: ${data.status || "done"}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const markFailed = async (id) => {
    await api.post(`/subscriptions/${id}/mark-failed`);
    toast.warning("Simulated failed payment — dunning state updated");
    load();
  };

  const setStatus = async (id, status) => {
    await api.patch(`/subscriptions/${id}`, { status });
    toast.success(`Subscription ${status}`);
    load();
  };

  const statusChip = (s) => {
    const color = s==="active"?"#10b981":s==="past_due"?"#f59e0b":s==="paused"?"#ef4444":s==="completed"?"#4f7c8a":"#94a3b8";
    return <span className="chip" style={{color}}>{s}</span>;
  };

  return (
    <div>
      <PageHeader
        title="Recurring Billing"
        subtitle={`${rows.length} subscriptions — ${rows.filter(r=>r.status==="active").length} active`}
        icon={ArrowsClockwise}
        actions={<button className="btn btn-primary" onClick={()=>setShow(true)} data-testid="new-sub-btn"><Plus size={16}/> New Subscription</button>}
      />
      <div className="px-8 py-6">
        <div className="card overflow-hidden">
          <table className="atable" data-testid="subs-table">
            <thead><tr><th>Product</th><th>Interval</th><th>Amount</th><th>Cycle</th><th>Next billing</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {rows.map((s)=>(
                <tr key={s.id} data-testid={`sub-row-${s.id}`}>
                  <td className="font-medium">{s.product_name}</td>
                  <td>{s.interval}</td>
                  <td>{fmtMoney(s.unit_price * s.quantity, s.currency)}</td>
                  <td className="text-[#94a3b8]">{s.cycles_billed}/{s.cycles || "∞"}</td>
                  <td className="text-xs text-[#94a3b8]">{(s.next_billing_at||"").slice(0,10)}</td>
                  <td>
                    {statusChip(s.status)}
                    {s.failed_payments>0 && <span className="chip ml-2" style={{color:"#f59e0b"}} title="Dunning"><Warning size={12}/>&nbsp;{s.failed_payments} fail{s.failed_payments>1?"s":""}</span>}
                  </td>
                  <td className="text-right space-x-1">
                    <button className="btn btn-secondary text-xs" onClick={()=>tick(s.id)} disabled={s.status!=="active"} data-testid={`sub-tick-${s.id}`}>Tick now</button>
                    <button className="btn btn-ghost text-xs" onClick={()=>markFailed(s.id)} data-testid={`sub-fail-${s.id}`}>Simulate fail</button>
                    {s.status==="active" ? (
                      <button className="btn btn-ghost text-xs" onClick={()=>setStatus(s.id,"paused")}><Pause size={14}/></button>
                    ) : s.status!=="completed" && (
                      <button className="btn btn-ghost text-xs" onClick={()=>setStatus(s.id,"active")}><Play size={14}/></button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length===0 && <tr><td colSpan={7} className="text-center text-[#94a3b8] py-10">No subscriptions — create one to demo recurring billing + dunning.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-xs text-[#94a3b8]">
          MVP demo uses internal recurring schedule: each "Tick" creates a new invoice with Stripe payment link. "Simulate fail" bumps the dunning counter; after 3 fails the subscription is auto-paused.
        </div>
      </div>
      <NewSubModal open={show} onClose={()=>setShow(false)} products={products} contacts={contacts} onSaved={load}/>
    </div>
  );
}

function NewSubModal({ open, onClose, products, contacts, onSaved }) {
  const [f, setF] = useState({ interval:"monthly", quantity:1, cycles:null, start_date: "" });
  useEffect(()=>{ if(open && products.length && !f.product_id) setF((x)=>({...x, product_id: products[0].id})); },[open, products]);
  const save = async () => {
    try {
      await api.post("/subscriptions", { ...f, start_date: f.start_date || null });
      toast.success("Subscription created"); onSaved(); onClose();
      setF({ interval:"monthly", quantity:1, cycles:null, start_date: "" });
    } catch(e){ toast.error(e?.response?.data?.detail||"Failed"); }
  };
  return (
    <Modal open={open} onClose={onClose} title="New Subscription">
      <div className="space-y-4" data-testid="sub-form">
        <Field label="Product">
          <select className="select" value={f.product_id||""} onChange={(e)=>setF({...f, product_id:e.target.value})} data-testid="sub-product">
            {products.map((p)=><option key={p.id} value={p.id}>{p.name} · {p.currency} {p.unit_price}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Interval">
            <select className="select" value={f.interval} onChange={(e)=>setF({...f, interval:e.target.value})} data-testid="sub-interval">
              <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option>
            </select>
          </Field>
          <Field label="Quantity"><input type="number" className="input" value={f.quantity} onChange={(e)=>setF({...f, quantity:parseInt(e.target.value)||1})}/></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cycles (empty = indefinite)">
            <input type="number" className="input" value={f.cycles||""} onChange={(e)=>setF({...f, cycles:e.target.value?parseInt(e.target.value):null})}/>
          </Field>
          <Field label="Contact (optional)">
            <select className="select" value={f.contact_id||""} onChange={(e)=>setF({...f, contact_id:e.target.value||null})}>
              <option value="">—</option>
              {contacts.map((c)=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Start date (first billing — defaults to today)">
          <input type="date" className="input" value={f.start_date} onChange={(e)=>setF({...f, start_date:e.target.value})} data-testid="sub-start-date"/>
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} data-testid="sub-save">Create</button>
      </div>
    </Modal>
  );
}
