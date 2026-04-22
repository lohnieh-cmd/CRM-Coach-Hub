import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, Modal, Field } from "@/components/ui-kit";
import { Users, Plus, MagnifyingGlass } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function Contacts() {
  const [rows, setRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [q, setQ] = useState("");
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(null);
  const nav = useNavigate();

  const load = async () => {
    const [c, co] = await Promise.all([api.get("/contacts"), api.get("/companies")]);
    setRows(c.data.filter((x) => !x.deleted_at));
    setCompanies(co.data);
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    const s = q.toLowerCase();
    return !s || `${r.first_name} ${r.last_name} ${r.email} ${r.role_title}`.toLowerCase().includes(s);
  });

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle={`${rows.length} people in your orbit`}
        icon={Users}
        actions={
          <button className="btn btn-primary" onClick={() => { setEdit(null); setShow(true); }} data-testid="new-contact-btn">
            <Plus size={16}/> Add Contact
          </button>
        }
      />
      <div className="px-8 py-6 space-y-4">
        <div className="relative max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-3 top-3 text-[#94a3b8]" />
          <input className="input pl-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="contact-search"/>
        </div>
        <div className="card overflow-hidden">
          <table className="atable" data-testid="contacts-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Company</th><th>Tags</th><th>Consent</th><th className="text-right">Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const company = companies.find((x) => x.id === c.company_id);
                return (
                  <tr key={c.id} className="cursor-pointer" onClick={() => nav(`/contacts/${c.id}`)} data-testid={`contact-row-${c.id}`}>
                    <td className="font-medium">{c.first_name} {c.last_name}</td>
                    <td className="text-[#94a3b8]">{c.email}</td>
                    <td>{c.role_title}</td>
                    <td>{company?.name}</td>
                    <td><div className="flex flex-wrap gap-1">{(c.tags||[]).slice(0,3).map((t)=><span key={t} className="chip">{t}</span>)}</div></td>
                    <td>{c.consent?.marketing ? <span className="chip" style={{color:"#10b981"}}>Opted-in</span> : <span className="chip">—</span>}</td>
                    <td className="text-right">
                      <button className="btn btn-secondary text-xs" onClick={(e)=>{e.stopPropagation(); setEdit(c); setShow(true);}} data-testid={`contact-edit-${c.id}`}>Edit</button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={7} className="text-center text-[#94a3b8] py-10">No contacts found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <ContactModal open={show} onClose={() => setShow(false)} initial={edit} companies={companies} onSaved={load}/>
    </div>
  );
}

function ContactModal({ open, onClose, initial, companies, onSaved }) {
  const [f, setF] = useState({});
  useEffect(() => {
    setF(initial || { first_name: "", last_name: "", email: "", phone: "", role_title: "", company_id: null, tags: [], consent: { marketing: false, newsletter: false } });
  }, [initial, open]);

  const save = async () => {
    try {
      if (initial?.id) await api.put(`/contacts/${initial.id}`, f);
      else await api.post("/contacts", f);
      toast.success("Saved");
      onSaved(); onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const del = async () => {
    if (!initial?.id) return;
    if (!window.confirm("Delete contact?")) return;
    await api.delete(`/contacts/${initial.id}`);
    toast.success("Deleted");
    onSaved(); onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit Contact" : "New Contact"} wide>
      <div className="grid grid-cols-2 gap-4" data-testid="contact-form">
        <Field label="First name"><input className="input" value={f.first_name||""} onChange={(e)=>setF({...f, first_name:e.target.value})} data-testid="cf-first-name"/></Field>
        <Field label="Last name"><input className="input" value={f.last_name||""} onChange={(e)=>setF({...f, last_name:e.target.value})}/></Field>
        <Field label="Email"><input type="email" className="input" value={f.email||""} onChange={(e)=>setF({...f, email:e.target.value})} data-testid="cf-email"/></Field>
        <Field label="Phone"><input className="input" value={f.phone||""} onChange={(e)=>setF({...f, phone:e.target.value})}/></Field>
        <Field label="Role / Title"><input className="input" value={f.role_title||""} onChange={(e)=>setF({...f, role_title:e.target.value})}/></Field>
        <Field label="Company">
          <select className="select" value={f.company_id||""} onChange={(e)=>setF({...f, company_id:e.target.value||null})}>
            <option value="">—</option>
            {companies.map((c)=> <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div className="col-span-2">
          <Field label="Tags (comma-separated)">
            <input className="input" value={(f.tags||[]).join(", ")} onChange={(e)=>setF({...f, tags:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})}/>
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Notes"><textarea className="textarea" value={f.notes||""} onChange={(e)=>setF({...f, notes:e.target.value})}/></Field>
        </div>
        <div className="col-span-2 flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.consent?.marketing} onChange={(e)=>setF({...f, consent:{...(f.consent||{}), marketing:e.target.checked}})}/> Marketing consent</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.consent?.newsletter} onChange={(e)=>setF({...f, consent:{...(f.consent||{}), newsletter:e.target.checked}})}/> Newsletter consent</label>
        </div>
      </div>
      <div className="flex justify-between mt-6">
        <div>{initial && <button className="btn btn-danger" onClick={del} data-testid="contact-delete">Delete</button>}</div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} data-testid="contact-save">Save</button>
        </div>
      </div>
    </Modal>
  );
}
