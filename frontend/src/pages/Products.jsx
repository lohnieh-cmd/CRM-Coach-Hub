import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, Modal, Field, Altitude, fmtMoney } from "@/components/ui-kit";
import { Package, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Products() {
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(null);

  const load = async () => {
    const { data } = await api.get("/products");
    setRows(data);
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader
        title="Price List"
        subtitle={`${rows.length} service products`}
        icon={Package}
        actions={<button className="btn btn-primary" onClick={() => { setEdit(null); setShow(true); }} data-testid="new-product-btn"><Plus size={16}/> Add Product</button>}
      />
      <div className="px-8 py-6">
        <div className="card overflow-hidden">
          <table className="atable" data-testid="products-table">
            <thead><tr><th>SKU</th><th>Name</th><th>Tier</th><th>Unit Price</th><th>Tax %</th><th>Active</th></tr></thead>
            <tbody>
              {rows.map((p)=>(
                <tr key={p.id} className="cursor-pointer" onClick={()=>{setEdit(p); setShow(true);}}>
                  <td className="font-mono text-[#94a3b8] text-xs">{p.sku}</td>
                  <td className="font-medium">{p.name}</td>
                  <td><Altitude label={p.tier==="summit"?"Summit":p.tier==="ascent"?"Ascent":"Basecamp"}/></td>
                  <td>{fmtMoney(p.unit_price, p.currency)}</td>
                  <td>{p.tax_rate}%</td>
                  <td>{p.active ? <span className="chip" style={{color:"#10b981"}}>Active</span> : <span className="chip">Off</span>}</td>
                </tr>
              ))}
              {rows.length===0 && <tr><td colSpan={6} className="text-center text-[#94a3b8] py-10">No products yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <ProductModal open={show} onClose={()=>setShow(false)} initial={edit} onSaved={load}/>
    </div>
  );
}

function ProductModal({ open, onClose, initial, onSaved }) {
  const [f, setF] = useState({});
  useEffect(()=>{ setF(initial || { sku:"", name:"", unit_price:0, currency:"USD", tax_rate:0, tier:"foundation", active:true }); },[initial, open]);
  const save = async () => {
    try {
      if (initial?.id) await api.put(`/products/${initial.id}`, f);
      else await api.post("/products", f);
      toast.success("Saved"); onSaved(); onClose();
    } catch(e){ toast.error(e?.response?.data?.detail||"Failed"); }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?"Edit Product":"New Product"} wide>
      <div className="grid grid-cols-2 gap-4" data-testid="product-form">
        <Field label="SKU"><input className="input" value={f.sku||""} onChange={(e)=>setF({...f,sku:e.target.value})} data-testid="pr-sku"/></Field>
        <Field label="Name"><input className="input" value={f.name||""} onChange={(e)=>setF({...f,name:e.target.value})} data-testid="pr-name"/></Field>
        <Field label="Unit Price"><input type="number" className="input" value={f.unit_price||0} onChange={(e)=>setF({...f,unit_price:parseFloat(e.target.value)||0})} data-testid="pr-price"/></Field>
        <Field label="Currency">
          <select className="select" value={f.currency||"USD"} onChange={(e)=>setF({...f,currency:e.target.value})}>
            <option>USD</option><option>ZAR</option><option>EUR</option><option>GBP</option>
          </select>
        </Field>
        <Field label="Tax Rate (%)"><input type="number" className="input" value={f.tax_rate||0} onChange={(e)=>setF({...f,tax_rate:parseFloat(e.target.value)||0})}/></Field>
        <Field label="Tier">
          <select className="select" value={f.tier||"foundation"} onChange={(e)=>setF({...f,tier:e.target.value})}>
            <option value="foundation">Foundation</option><option value="ascent">Ascent</option><option value="summit">Summit</option>
          </select>
        </Field>
        <div className="col-span-2"><Field label="Description"><textarea className="textarea" value={f.description||""} onChange={(e)=>setF({...f,description:e.target.value})}/></Field></div>
        <div className="col-span-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.active} onChange={(e)=>setF({...f,active:e.target.checked})}/> Active in price list</label></div>
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} data-testid="pr-save">Save</button>
      </div>
    </Modal>
  );
}
