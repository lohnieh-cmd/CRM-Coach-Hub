import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, Modal, Field } from "@/components/ui-kit";
import { Buildings, Plus, Users, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Companies() {
  const [rows, setRows] = useState([]);
  const [contactsByCo, setContactsByCo] = useState({});
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(null);
  const [drawer, setDrawer] = useState(null); // company whose contacts list is open

  const load = async () => {
    const [{ data: companies }, { data: allContacts }] = await Promise.all([
      api.get("/companies"),
      api.get("/contacts"),
    ]);
    setRows(companies.filter((x) => !x.deleted_at));
    // pre-count contacts per company
    const map = {};
    (allContacts || []).filter(c => !c.deleted_at).forEach(c => {
      if (c.company_id) map[c.company_id] = (map[c.company_id] || 0) + 1;
    });
    setContactsByCo(map);
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle={`${rows.length} organizations`}
        icon={Buildings}
        actions={<button className="btn btn-primary" onClick={() => { setEdit(null); setShow(true); }} data-testid="new-company-btn"><Plus size={16}/> Add Company</button>}
      />
      <div className="px-8 py-6">
        <div className="card overflow-hidden">
          <table className="atable" data-testid="companies-table">
            <thead><tr><th>Name</th><th>Industry</th><th>Stage</th><th>Contacts</th><th>Website</th><th>Tags</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} data-testid={`company-row-${c.id}`}>
                  <td className="font-medium">{c.name}</td>
                  <td>{c.industry}</td>
                  <td>{c.lifecycle_stage}</td>
                  <td>
                    <button
                      className="chip hover:text-[#e26e4a]"
                      onClick={() => setDrawer(c)}
                      data-testid={`company-contacts-btn-${c.id}`}
                    >
                      <Users size={12}/> {contactsByCo[c.id] || 0}
                    </button>
                  </td>
                  <td><a className="text-[#e26e4a] hover:underline" href={c.website} target="_blank" rel="noreferrer" onClick={(e)=>e.stopPropagation()}>{c.website}</a></td>
                  <td><div className="flex gap-1 flex-wrap">{(c.tags||[]).map((t)=><span key={t} className="chip">{t}</span>)}</div></td>
                  <td className="text-right">
                    <button className="btn btn-ghost text-xs" onClick={()=>{ setEdit(c); setShow(true); }} data-testid={`company-edit-${c.id}`}>Edit</button>
                  </td>
                </tr>
              ))}
              {rows.length===0 && <tr><td colSpan={7} className="text-center text-[#94a3b8] py-10">No companies yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <CompanyModal open={show} onClose={()=>setShow(false)} initial={edit} onSaved={load}/>
      <CompanyContactsDrawer company={drawer} onClose={()=>setDrawer(null)}/>
    </div>
  );
}

function CompanyModal({ open, onClose, initial, onSaved }) {
  const [f, setF] = useState({});
  useEffect(()=>{ setF(initial || { name:"", industry:"", website:"", lifecycle_stage:"lead", tags:[], custom_fields:{} }); },[initial, open]);
  const save = async () => {
    try {
      if (initial?.id) await api.put(`/companies/${initial.id}`, f);
      else await api.post("/companies", f);
      toast.success("Saved"); onSaved(); onClose();
    } catch(e){ toast.error(e?.response?.data?.detail||"Failed"); }
  };
  const del = async () => {
    if (!initial?.id) return;
    if (!window.confirm(`Delete "${initial.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/companies/${initial.id}`);
      toast.success("Company deleted"); onSaved(); onClose();
    } catch(e){ toast.error(e?.response?.data?.detail || "Delete failed"); }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?"Edit Company":"New Company"} wide>
      <div className="grid grid-cols-2 gap-4" data-testid="company-form">
        <Field label="Name"><input className="input" value={f.name||""} onChange={(e)=>setF({...f,name:e.target.value})} data-testid="cmp-name"/></Field>
        <Field label="Industry"><input className="input" value={f.industry||""} onChange={(e)=>setF({...f,industry:e.target.value})}/></Field>
        <Field label="Website"><input className="input" value={f.website||""} onChange={(e)=>setF({...f,website:e.target.value})}/></Field>
        <Field label="Lifecycle Stage">
          <select className="select" value={f.lifecycle_stage||"lead"} onChange={(e)=>setF({...f,lifecycle_stage:e.target.value})}>
            <option>lead</option><option>opportunity</option><option>customer</option><option>churned</option>
          </select>
        </Field>
        <div className="col-span-2">
          <Field label="Tags (comma-separated)"><input className="input" value={(f.tags||[]).join(", ")} onChange={(e)=>setF({...f,tags:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})}/></Field>
        </div>
        <div className="col-span-2"><Field label="Notes"><textarea className="textarea" value={f.notes||""} onChange={(e)=>setF({...f,notes:e.target.value})}/></Field></div>
      </div>
      <div className="flex justify-between gap-2 mt-6">
        <div>
          {initial && <button className="btn btn-danger" onClick={del} data-testid="company-delete"><Trash size={14}/> Delete</button>}
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} data-testid="cmp-save">Save</button>
        </div>
      </div>
    </Modal>
  );
}

function CompanyContactsDrawer({ company, onClose }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!company) return;
    (async () => {
      try {
        const { data } = await api.get(`/companies/${company.id}/contacts`);
        setRows(data);
      } catch { setRows([]); }
    })();
  }, [company]);
  return (
    <Modal open={!!company} onClose={onClose} title={company ? `${company.name} — Contacts` : ""}>
      <div className="space-y-2" data-testid="company-contacts-drawer">
        {rows.length === 0 && <div className="text-sm text-[#94a3b8]">No contacts linked to this company yet. Open the Contacts page to add one and set Company = {company?.name}.</div>}
        {rows.map(c => (
          <div key={c.id} className="flex items-center justify-between p-3 border border-[#283341] rounded" data-testid={`drawer-contact-${c.id}`}>
            <div>
              <a href={`/contacts/${c.id}`} className="font-medium hover:text-[#e26e4a]">{c.first_name} {c.last_name}</a>
              <div className="text-xs text-[#94a3b8]">{c.role_title || "—"}{c.email ? ` · ${c.email}` : ""}</div>
            </div>
            <span className="chip text-xs">{c.interaction_count || 0} touches</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
