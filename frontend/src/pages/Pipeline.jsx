import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, Altitude, fmtMoney, Modal, Field, Empty } from "@/components/ui-kit";
import { Kanban, Plus, Mountains, PencilSimple, Calendar } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Pipeline() {
  const [stages, setStages] = useState([]);
  const [deals, setDeals] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [view, setView] = useState("kanban");
  const [showNew, setShowNew] = useState(false);
  const [editingDeal, setEditingDeal] = useState(null);
  const [draggingId, setDraggingId] = useState(null);

  const load = async () => {
    const [s, d, c, co] = await Promise.all([
      api.get("/pipeline-stages"),
      api.get("/deals"),
      api.get("/contacts"),
      api.get("/companies"),
    ]);
    setStages(s.data);
    setDeals(d.data);
    setContacts(c.data);
    setCompanies(co.data);
  };
  useEffect(() => { load(); }, []);

  const onDrop = async (stageId) => {
    if (!draggingId) return;
    const deal = deals.find((d) => d.id === draggingId);
    if (!deal || deal.pipeline_stage_id === stageId) { setDraggingId(null); return; }
    try {
      await api.patch(`/deals/${draggingId}/stage`, { pipeline_stage_id: stageId });
      toast.success("Deal moved");
      load();
    } catch { toast.error("Could not move deal"); }
    setDraggingId(null);
  };

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle="Drag deals up the mountain."
        icon={Kanban}
        actions={
          <>
            <div className="flex rounded-lg border border-[#283341] overflow-hidden">
              <button className={`px-3 py-2 text-sm ${view === "kanban" ? "bg-[#212a36] text-white" : "text-[#94a3b8]"}`} onClick={() => setView("kanban")} data-testid="view-kanban">Kanban</button>
              <button className={`px-3 py-2 text-sm ${view === "list" ? "bg-[#212a36] text-white" : "text-[#94a3b8]"}`} onClick={() => setView("list")} data-testid="view-list">List</button>
            </div>
            <button className="btn btn-primary" onClick={() => setShowNew(true)} data-testid="new-deal-btn">
              <Plus size={16} /> New Deal
            </button>
          </>
        }
      />

      {stages.length === 0 ? (
        <div className="p-8">
          <Empty title="No stages yet" subtitle="Apply a coaching template to start with a ready pipeline (Basecamp → Summit)." icon={Mountains}
            cta={<a className="btn btn-primary" href="/templates" data-testid="goto-templates">Browse Templates</a>} />
        </div>
      ) : view === "kanban" ? (
        <div className="px-8 py-6 overflow-x-auto" data-testid="kanban-board">
          <div className="flex gap-4 pb-4">
            {stages.map((s) => {
              const inStage = deals.filter((d) => d.pipeline_stage_id === s.id && d.deleted_at === undefined);
              const total = inStage.reduce((x, d) => x + (d.value || 0), 0);
              return (
                <div key={s.id} className="kanban-col" onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(s.id)} data-testid={`kanban-col-${s.name}`}>
                  <div className="flex items-center justify-between mb-3">
                    <Altitude label={s.altitude_label} />
                    <span className="text-xs text-[#94a3b8]">{inStage.length}</span>
                  </div>
                  <div className="text-sm font-semibold mb-1">{s.name}</div>
                  <div className="text-xs text-[#94a3b8] mb-3">{fmtMoney(total, "USD")}</div>
                  <div className="overflow-y-auto space-y-2 flex-1">
                    {inStage.map((d) => {
                      const bars = Math.max(1, Math.min(5, Math.round((d.probability || 10) / 20)));
                      return (
                        <div
                          key={d.id}
                          className={`kanban-card ${draggingId === d.id ? "dragging" : ""}`}
                          draggable
                          onDragStart={() => setDraggingId(d.id)}
                          onDragEnd={() => setDraggingId(null)}
                          onClick={() => setEditingDeal(d)}
                          role="button"
                          title="Click to edit · drag to move"
                          data-testid={`deal-card-${d.id}`}
                        >
                          <div className="font-medium text-sm">{d.title}</div>
                          <div className="flex items-center justify-between mt-2">
                            <div className="text-xs text-[#94a3b8]">{fmtMoney(d.value, d.currency)}</div>
                            <div className="elev" title={`${d.probability}% likely`}>
                              {[0, 1, 2, 3, 4].map((i) => (<span key={i} className={i < bars ? "on" : ""} />))}
                            </div>
                          </div>
                          {d.expected_close_date && (
                            <div className="text-[10px] text-[#94a3b8] mt-2 flex items-center gap-1">
                              <Calendar size={10}/> close {d.expected_close_date.slice(0, 10)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {inStage.length === 0 && <div className="text-xs text-[#94a3b8]">—</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="px-8 py-6">
          <div className="card overflow-hidden">
            <table className="atable" data-testid="deals-list">
              <thead>
                <tr>
                  <th>Deal</th>
                  <th>Stage</th>
                  <th>Value</th>
                  <th>Probability</th>
                  <th>Expected close</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deals.filter(d => !d.deleted_at).map((d) => {
                  const st = stages.find((s) => s.id === d.pipeline_stage_id);
                  return (
                    <tr key={d.id} data-testid={`deal-row-${d.id}`}>
                      <td className="font-medium">{d.title}</td>
                      <td>{st && <Altitude label={st.altitude_label} />} <span className="ml-2 text-sm text-[#94a3b8]">{st?.name}</span></td>
                      <td>{fmtMoney(d.value, d.currency)}</td>
                      <td>{d.probability}%</td>
                      <td className="text-xs text-[#94a3b8]">{d.expected_close_date ? d.expected_close_date.slice(0, 10) : "—"}</td>
                      <td className="text-right">
                        <button className="btn btn-secondary text-xs" onClick={() => setEditingDeal(d)} data-testid={`deal-edit-${d.id}`}>
                          <PencilSimple size={12}/> Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DealModal mode="create" open={showNew} onClose={() => setShowNew(false)} stages={stages} contacts={contacts} companies={companies} onSaved={load} />
      <DealModal mode="edit" open={!!editingDeal} deal={editingDeal} onClose={() => setEditingDeal(null)} stages={stages} contacts={contacts} companies={companies} onSaved={load} />
    </div>
  );
}

function DealModal({ mode, open, deal, onClose, stages, contacts, companies, onSaved }) {
  const emptyForm = { title: "", value: 0, currency: "USD", probability: 10, expected_close_date: "", notes: "" };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && deal) {
      setForm({
        title: deal.title || "",
        value: deal.value || 0,
        currency: deal.currency || "USD",
        probability: deal.probability ?? 10,
        pipeline_stage_id: deal.pipeline_stage_id,
        contact_id: deal.contact_id || null,
        company_id: deal.company_id || null,
        expected_close_date: deal.expected_close_date ? deal.expected_close_date.slice(0, 10) : "",
        notes: deal.notes || "",
      });
    } else if (mode === "create" && stages.length) {
      setForm({ ...emptyForm, pipeline_stage_id: stages[0].id, probability: stages[0].probability });
    }
    // eslint-disable-next-line
  }, [open, deal, mode, stages]);

  const save = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    try {
      const payload = {
        title: form.title,
        value: parseFloat(form.value) || 0,
        currency: form.currency,
        probability: parseInt(form.probability) || 0,
        pipeline_stage_id: form.pipeline_stage_id,
        contact_id: form.contact_id || null,
        company_id: form.company_id || null,
        expected_close_date: form.expected_close_date || null,
        notes: form.notes || null,
      };
      if (mode === "edit") {
        await api.put(`/deals/${deal.id}`, payload);
        toast.success("Deal updated");
      } else {
        await api.post("/deals", payload);
        toast.success("Deal created");
      }
      onSaved(); onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const del = async () => {
    if (!window.confirm("Delete this deal? This cannot be undone from the UI.")) return;
    try {
      await api.delete(`/deals/${deal.id}`);
      toast.success("Deal deleted");
      onSaved(); onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const title = mode === "edit" ? "Edit Deal" : "Create Deal";
  const saveLabel = mode === "edit" ? "Save" : "Create Deal";
  const testid = mode === "edit" ? "deal-save-edit" : "deal-save";

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4" data-testid={mode === "edit" ? "edit-deal-form" : "new-deal-form"}>
        <Field label="Title">
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="deal-title"/>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Stage">
            <select className="select" value={form.pipeline_stage_id || ""} onChange={(e) => {
              const s = stages.find((x) => x.id === e.target.value);
              setForm({ ...form, pipeline_stage_id: e.target.value, probability: s?.probability ?? form.probability });
            }} data-testid="deal-stage">
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Value">
            <input type="number" className="input" value={form.value} onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })} data-testid="deal-value"/>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Currency">
            <select className="select" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option>USD</option><option>ZAR</option><option>EUR</option><option>GBP</option>
            </select>
          </Field>
          <Field label="Probability %">
            <input type="number" min="0" max="100" className="input" value={form.probability} onChange={(e) => setForm({ ...form, probability: parseInt(e.target.value) || 0 })}/>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Contact (optional)">
            <select className="select" value={form.contact_id || ""} onChange={(e) => setForm({ ...form, contact_id: e.target.value || null })}>
              <option value="">—</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </Field>
          <Field label="Company (optional)">
            <select className="select" value={form.company_id || ""} onChange={(e) => setForm({ ...form, company_id: e.target.value || null })}>
              <option value="">—</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Expected close date">
          <input type="date" className="input" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} data-testid="deal-close-date"/>
        </Field>
        <Field label="Notes">
          <textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}/>
        </Field>
        <div className="flex justify-between pt-2">
          <div>
            {mode === "edit" && (
              <button className="btn btn-ghost text-xs text-[#ef4444]" onClick={del} data-testid="deal-delete">Delete</button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={save} data-testid={testid}>{saveLabel}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
