import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, Modal, Field, Empty } from "@/components/ui-kit";
import { CheckSquare, Plus, CheckCircle, Circle, Trash, PencilSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

// Tasks may store the linked entity as raw contact_id/deal_id (from POST /tasks) OR
// under related_entity_type/related_entity_id (set by automations + our POST). We read
// both to stay robust.
function taskLinks(task) {
  const contact_id = task.contact_id || (task.related_entity_type === "contact" ? task.related_entity_id : null);
  const deal_id    = task.deal_id    || (task.related_entity_type === "deal"    ? task.related_entity_id : null);
  return { contact_id, deal_id };
}

export default function Tasks() {
  const [rows, setRows] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [filter, setFilter] = useState("open");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);

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
              <thead>
                <tr>
                  <th></th>
                  <th>Title</th>
                  <th>Related</th>
                  <th>Notes</th>
                  <th>Source</th>
                  <th>Due</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t)=>{
                  const { contact_id, deal_id } = taskLinks(t);
                  const c = contact_id ? contactById[contact_id] : null;
                  const d = deal_id ? dealById[deal_id] : null;
                  return (
                    <tr key={t.id} data-testid={`task-row-${t.id}`}>
                      <td style={{width:40}}>
                        <button onClick={()=>toggle(t)} data-testid={`task-toggle-${t.id}`}>
                          {t.status==="done" ? <CheckCircle size={20} weight="fill" color="#10b981"/> : <Circle size={20} color="#94a3b8"/>}
                        </button>
                      </td>
                      <td className={t.status==="done" ? "line-through text-[#94a3b8]" : "font-medium"}>{t.title}</td>
                      <td className="text-xs">
                        {c && (
                          <Link className="text-[#e26e4a] hover:underline block" to={`/contacts/${c.id}`}>
                            {c.first_name} {c.last_name}
                          </Link>
                        )}
                        {d && (
                          <span className="text-[#94a3b8] block">Deal · {d.title}</span>
                        )}
                        {!c && !d && <span className="text-[#64748b]">—</span>}
                      </td>
                      <td className="text-xs text-[#94a3b8] max-w-[280px]" title={t.notes || ""}>
                        {t.notes ? (
                          <span className="line-clamp-2 whitespace-pre-wrap" data-testid={`task-notes-${t.id}`}>
                            {t.notes.length > 120 ? t.notes.slice(0, 120) + "…" : t.notes}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="text-xs"><span className="chip">{t.source || "automation"}</span></td>
                      <td className="text-xs text-[#94a3b8]">{t.due_date ? t.due_date.slice(0,10) : "—"}</td>
                      <td className="text-right space-x-1">
                        <button className="btn btn-secondary text-xs" onClick={()=>setEditing(t)} data-testid={`task-edit-${t.id}`}><PencilSimple size={14}/> Edit</button>
                        <button className="btn btn-ghost text-xs" onClick={()=>del(t.id)} data-testid={`task-delete-${t.id}`}><Trash size={14}/></button>
                      </td>
                    </tr>
                  );
                })}
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

function TaskModal({ mode, open, task, onClose, contacts, deals, onSaved }) {
  const emptyForm = { title:"", contact_id:"", deal_id:"", due_date:"", notes:"", status:"open" };
  const [f, setF] = useState(emptyForm);

  useEffect(()=>{
    if (!open) return;
    if (mode === "edit" && task) {
      const { contact_id, deal_id } = taskLinks(task);
      setF({
        title: task.title || "",
        contact_id: contact_id || "",
        deal_id: deal_id || "",
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
      const payload = {
        title: f.title,
        contact_id: f.contact_id || null,
        deal_id: f.deal_id || null,
        due_date: f.due_date || null,
        notes: f.notes || "",
      };
      if (mode === "edit") {
        await api.patch(`/tasks/${task.id}`, { ...payload, status: f.status });
        toast.success("Task updated");
      } else {
        await api.post("/tasks", payload);
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
        <Field label="Title">
          <input className="input" value={f.title} onChange={(e)=>setF({...f,title:e.target.value})} data-testid="task-title"/>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Related contact">
            <select className="select" value={f.contact_id} onChange={(e)=>setF({...f,contact_id:e.target.value})} data-testid="task-contact">
              <option value="">—</option>
              {contacts.map((c)=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </Field>
          <Field label="Related deal">
            <select className="select" value={f.deal_id} onChange={(e)=>setF({...f,deal_id:e.target.value})} data-testid="task-deal">
              <option value="">—</option>
              {deals.map((d)=><option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </Field>
        </div>
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
        <Field label="Notes">
          <textarea className="textarea" rows={4} value={f.notes} onChange={(e)=>setF({...f,notes:e.target.value})} data-testid="task-notes"/>
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} data-testid={testid}>{saveLabel}</button>
      </div>
    </Modal>
  );
}
