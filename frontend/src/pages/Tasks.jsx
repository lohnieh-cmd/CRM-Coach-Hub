import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, Modal, Field, Empty } from "@/components/ui-kit";
import { CheckSquare, Plus, CheckCircle, Circle, Trash, PencilSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function Tasks() {
  const [rows, setRows] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [filter, setFilter] = useState("open");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);   // task object or null

  const load = async () => {
    const [t, c, d] = await Promise.all([api.get("/tasks"), api.get("/contacts"), api.get("/deals")]);
    setRows(t.data); setContacts(c.data); setDeals(d.data);
  };
  useEffect(()=>{ load(); },[]);

  const toggle = async (task) => {
    const next = task.status === "done" ? "open" : "done";
    await api.patch(`/tasks/${task.id}`, { status: next });
    toast.success(next === "done" ? "Marked done" : "Reopened");
    load();
  };

  const del = async (id) => {
    if (!window.confirm("Delete task?")) return;
    await api.delete(`/tasks/${id}`);
    toast.success("Deleted"); load();
  };

  const visible = rows.filter((t) => filter === "all" || t.status === filter);
  const contactById = Object.fromEntries(contacts.map((c)=>[c.id, c]));
  const dealById = Object.fromEntries(deals.map((d)=>[d.id, d]));

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={`${rows.filter(t=>t.status==="open").length} open · ${rows.filter(t=>t.status==="done").length} done`}
        icon={CheckSquare}
        actions={
          <>
            <div className="flex rounded-lg border border-[#283341] overflow-hidden">
              {["open","done","all"].map((k)=>(
                <button key={k} className={`px-3 py-2 text-sm capitalize ${filter===k?"bg-[#212a36] text-white":"text-[#94a3b8]"}`} onClick={()=>setFilter(k)} data-testid={`tasks-filter-${k}`}>{k}</button>
              ))}
            </div>
            <button className="btn btn-primary" onClick={()=>setShowNew(true)} data-testid="new-task-btn"><Plus size={16}/> New Task</button>
          </>
        }
      />
      <div className="px-8 py-6">
        {visible.length===0 ? (
          <Empty title="No tasks" subtitle="Automations drop tasks here automatically. You can also add them manually." icon={CheckSquare}
            cta={<button className="btn btn-primary" onClick={()=>setShowNew(true)}>Add Task</button>}/>
        ) : (
          <div className="card overflow-hidden">
            <table className="atable" data-testid="tasks-table">
              <thead><tr><th></th><th>Title</th><th>Related</th><th>Source</th><th>Due</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {visible.map((t)=>(
                  <tr key={t.id} data-testid={`task-row-${t.id}`}>
                    <td style={{width:40}}>
                      <button onClick={()=>toggle(t)} data-testid={`task-toggle-${t.id}`}>
                        {t.status==="done" ? <CheckCircle size={20} weight="fill" color="#10b981"/> : <Circle size={20} color="#94a3b8"/>}
                      </button>
                    </td>
                    <td className={t.status==="done" ? "line-through text-[#94a3b8]" : "font-medium"}>{t.title}</td>
                    <td className="text-xs">
                      {t.related_entity_type==="contact" && contactById[t.related_entity_id] && (
                        <Link className="text-[#e26e4a] hover:underline" to={`/contacts/${t.related_entity_id}`}>
                          {contactById[t.related_entity_id].first_name} {contactById[t.related_entity_id].last_name}
                        </Link>
                      )}
                      {t.related_entity_type==="deal" && dealById[t.related_entity_id] && (
                        <span className="text-[#94a3b8]">{dealById[t.related_entity_id].title}</span>
                      )}
                    </td>
                    <td className="text-xs"><span className="chip">{t.source || "automation"}</span></td>
                    <td className="text-xs text-[#94a3b8]">{t.due_date ? t.due_date.slice(0,10) : "—"}</td>
                    <td className="text-right space-x-1">
                      <button className="btn btn-secondary text-xs" onClick={()=>setEditing(t)} data-testid={`task-edit-${t.id}`}><PencilSimple size={14}/> Edit</button>
                      <button className="btn btn-ghost text-xs" onClick={()=>del(t.id)} data-testid={`task-delete-${t.id}`}><Trash size={14}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <TaskModal mode="create" open={showNew} onClose={()=>setShowNew(false)} contacts={contacts} deals={deals} onSaved={load}/>
      <TaskModal mode="edit" open={!!editing} task={editing} onClose={()=>setEditing(null)} contacts={contacts} deals={deals} onSaved={load}/>
    </div>
  );
}

// Single modal handling both create + edit. Date input uses type="date" → OS calendar picker.
function TaskModal({ mode, open, task, onClose, contacts, deals, onSaved }) {
  const emptyForm = { title:"", contact_id:null, deal_id:null, due_date:"", notes:"", status:"open" };
  const [f, setF] = useState(emptyForm);

  useEffect(()=>{
    if (!open) return;
    if (mode === "edit" && task) {
      setF({
        title: task.title || "",
        contact_id: task.related_entity_type === "contact" ? task.related_entity_id : null,
        deal_id: task.related_entity_type === "deal" ? task.related_entity_id : null,
        due_date: task.due_date ? task.due_date.slice(0, 10) : "",
        notes: task.notes || "",
        status: task.status || "open",
      });
    } else {
      setF(emptyForm);
    }
    // eslint-disable-next-line
  }, [open, task, mode]);

  const save = async () => {
    if (!f.title.trim()) { toast.error("Title is required"); return; }
    try {
      if (mode === "edit") {
        // PATCH only whitelisted fields (title, status, due_date, notes, assignee_id per backend).
        // contact_id / deal_id re-parenting is intentionally not allowed server-side in MVP.
        await api.patch(`/tasks/${task.id}`, {
          title: f.title,
          status: f.status,
          due_date: f.due_date || null,
          notes: f.notes,
        });
        toast.success("Task updated");
      } else {
        await api.post("/tasks", f);
        toast.success("Task created");
      }
      onSaved(); onClose();
    } catch(e){ toast.error(e?.response?.data?.detail||"Failed"); }
  };

  const title = mode === "edit" ? "Edit Task" : "New Task";
  const saveLabel = mode === "edit" ? "Save" : "Create";
  const testid = mode === "edit" ? "task-save-edit" : "task-save";

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4" data-testid="task-form">
        <Field label="Title"><input className="input" value={f.title} onChange={(e)=>setF({...f,title:e.target.value})} data-testid="task-title"/></Field>
        {mode === "edit" ? (
          // Read-only links: backend doesn't allow re-parenting in PATCH
          <div className="grid grid-cols-2 gap-3">
            <Field label="Related contact (read-only)">
              <div className="input flex items-center text-sm">
                {f.contact_id
                  ? ((contacts.find(c=>c.id===f.contact_id) || {}).first_name || "—") + " " + ((contacts.find(c=>c.id===f.contact_id) || {}).last_name || "")
                  : <span className="text-[#64748b]">Unlinked</span>}
              </div>
            </Field>
            <Field label="Related deal (read-only)">
              <div className="input flex items-center text-sm">
                {f.deal_id
                  ? (deals.find(d=>d.id===f.deal_id) || {}).title || "—"
                  : <span className="text-[#64748b]">Unlinked</span>}
              </div>
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Related contact">
              <select className="select" value={f.contact_id||""} onChange={(e)=>setF({...f,contact_id:e.target.value||null})} data-testid="task-contact">
                <option value="">—</option>{contacts.map((c)=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </Field>
            <Field label="Related deal">
              <select className="select" value={f.deal_id||""} onChange={(e)=>setF({...f,deal_id:e.target.value||null})} data-testid="task-deal">
                <option value="">—</option>{deals.map((d)=><option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date">
            <input type="date" className="input" value={f.due_date} onChange={(e)=>setF({...f,due_date:e.target.value})} data-testid="task-due-date"/>
          </Field>
          {mode === "edit" && (
            <Field label="Status">
              <select className="select" value={f.status} onChange={(e)=>setF({...f,status:e.target.value})} data-testid="task-status">
                <option value="open">Open</option><option value="done">Done</option>
              </select>
            </Field>
          )}
        </div>
        <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={(e)=>setF({...f,notes:e.target.value})} data-testid="task-notes"/></Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} data-testid={testid}>{saveLabel}</button>
      </div>
    </Modal>
  );
}
