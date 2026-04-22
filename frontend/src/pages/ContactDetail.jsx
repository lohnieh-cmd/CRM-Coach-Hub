import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/api";
import { PageHeader, Modal, Field, Altitude, fmtMoney } from "@/components/ui-kit";
import { User, ArrowLeft, Envelope, Plus, FileText, Receipt, CheckSquare, Sparkle, ClockCounterClockwise, EnvelopeSimpleOpen, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function ContactDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [contact, setContact] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [emails, setEmails] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [showEmail, setShowEmail] = useState(false);
  const [aiReply, setAiReply] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = async () => {
    try {
      const [t, e, tk] = await Promise.all([
        api.get(`/contacts/${id}/timeline`),
        api.get(`/emails?contact_id=${id}`),
        api.get("/tasks"),
      ]);
      setContact(t.data.contact);
      setTimeline(t.data);
      setEmails(e.data);
      setTasks(tk.data.filter((x) => x.related_entity_type === "contact" && x.related_entity_id === id));
    } catch { toast.error("Contact not found"); nav("/contacts"); }
  };
  useEffect(()=>{ load(); // eslint-disable-next-line
  },[id]);

  const suggestReply = async (email) => {
    setAiLoading(true); setAiReply(null);
    try {
      const { data } = await api.post("/ai/generate", {
        kind: "reply", tone: "warm-sherpa",
        contact_id: id,
        incoming_email: `Subject: ${email.subject}\n\n${email.body}`,
        prompt: "Draft a warm, grounded 3-sentence reply that references what they wrote. Do not invent dates, prices, or commitments.",
      });
      setAiReply(data);
    } catch(err) { toast.error(err?.response?.data?.detail||"AI failed"); }
    finally { setAiLoading(false); }
  };

  const deleteEmail = async (eid) => {
    if (!window.confirm("Delete this logged email?")) return;
    await api.delete(`/emails/${eid}`);
    toast.success("Deleted"); load();
  };

  if (!contact) return <div className="p-10 text-[#94a3b8]">Loading…</div>;

  return (
    <div>
      <PageHeader
        title={`${contact.first_name} ${contact.last_name||""}`}
        subtitle={contact.role_title || contact.email}
        icon={User}
        actions={
          <Link to="/contacts" className="btn btn-secondary"><ArrowLeft size={16}/> Back</Link>
        }
      />
      <div className="px-8 py-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* LEFT: Timeline */}
        <div className="xl:col-span-2 space-y-4">
          {/* Email thread */}
          <div className="card p-5" data-testid="contact-emails">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><Envelope size={18} weight="duotone" color="#e26e4a"/> <span className="label-caps">Emails ({emails.length})</span></div>
              <button className="btn btn-secondary text-xs" onClick={()=>setShowEmail(true)} data-testid="log-email-btn"><Plus size={14}/> Log email</button>
            </div>
            <div className="space-y-3">
              {emails.length===0 && <div className="text-sm text-[#94a3b8]">No emails logged yet. Paste an inbound email to see it here — then use "Draft reply" to let Gemini 3 suggest a grounded response.</div>}
              {emails.map((e)=>(
                <div key={e.id} className={`card p-4 ${e.direction==="in"?"border-l-4 border-l-[#e26e4a]":"border-l-4 border-l-[#4f7c8a]"}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs label-caps" style={{color: e.direction==="in"?"#e26e4a":"#4f7c8a"}}>{e.direction==="in"?"Inbound":"Outbound"}</div>
                      <div className="font-head font-semibold mt-1">{e.subject}</div>
                      <div className="text-xs text-[#94a3b8] mt-1">{(e.received_at||"").slice(0,19)} · from {e.from_addr || "—"}</div>
                    </div>
                    <div className="flex gap-1">
                      {e.direction==="in" && <button className="btn btn-secondary text-xs" onClick={()=>suggestReply(e)} disabled={aiLoading} data-testid={`email-ai-reply-${e.id}`}><Sparkle size={12}/> Draft reply</button>}
                      <button className="btn btn-ghost text-xs" onClick={()=>deleteEmail(e.id)}><Trash size={12}/></button>
                    </div>
                  </div>
                  <pre className="mt-3 text-sm text-[#cdd6e0] whitespace-pre-wrap font-sans">{e.body}</pre>
                </div>
              ))}
            </div>

            {aiReply && (
              <div className="card p-4 mt-4 border-l-4 border-l-[#e26e4a]" data-testid="ai-reply-preview">
                <div className="flex items-center gap-2 label-caps"><Sparkle size={14} color="#e26e4a"/> AI-drafted reply · review before sending</div>
                <pre className="mt-2 text-sm text-[#f0f3f8] whitespace-pre-wrap font-sans">{aiReply.draft}</pre>
                {aiReply.questions_for_user?.length>0 && (
                  <div className="mt-3 p-3 bg-[#2a1812] border border-[#5a3524] rounded">
                    <div className="label-caps mb-1">Missing info</div>
                    <ul className="text-xs list-disc pl-5 space-y-0.5">{aiReply.questions_for_user.map((q,i)=><li key={i}>{q}</li>)}</ul>
                  </div>
                )}
                <div className="text-xs text-[#94a3b8] mt-3">Fields used: {(aiReply.fields_used||[]).map((f)=>f.entity).join(" · ")}</div>
              </div>
            )}
          </div>

          {/* Deals */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3"><FileText size={18} weight="duotone" color="#e26e4a"/> <span className="label-caps">Deals ({timeline.deals.length})</span></div>
            <div className="space-y-2">
              {timeline.deals.map((d)=>(
                <div key={d.id} className="flex justify-between items-center py-2 border-b border-[#283341]">
                  <div>
                    <div className="font-medium">{d.title}</div>
                    <div className="text-xs text-[#94a3b8]">{fmtMoney(d.value,d.currency)} · {d.probability}%</div>
                  </div>
                  <span className="chip">{d.status}</span>
                </div>
              ))}
              {timeline.deals.length===0 && <div className="text-sm text-[#94a3b8]">No deals yet.</div>}
            </div>
          </div>

          {/* Invoices */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3"><Receipt size={18} weight="duotone" color="#e26e4a"/> <span className="label-caps">Invoices ({timeline.invoices.length})</span></div>
            <div className="space-y-1 text-sm">
              {timeline.invoices.map((i)=>(
                <div key={i.id} className="flex justify-between py-1">
                  <span className="font-mono text-xs">{i.number}</span>
                  <span>{fmtMoney(i.grand_total,i.currency)}</span>
                  <span className="chip">{i.status}</span>
                </div>
              ))}
              {timeline.invoices.length===0 && <div className="text-sm text-[#94a3b8]">No invoices.</div>}
            </div>
          </div>

          {/* Form submissions */}
          {timeline.form_submissions.length>0 && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3"><EnvelopeSimpleOpen size={18} weight="duotone" color="#e26e4a"/> <span className="label-caps">Form submissions ({timeline.form_submissions.length})</span></div>
              {timeline.form_submissions.map((s)=>(
                <div key={s.id} className="text-xs border-b border-[#283341] py-2">
                  <div className="text-[#94a3b8]">{(s.created_at||"").slice(0,19)}</div>
                  <pre className="mt-1 text-[#cdd6e0] whitespace-pre-wrap">{JSON.stringify(s.answers,null,2)}</pre>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Profile + tasks */}
        <div className="space-y-4">
          <div className="card p-5" data-testid="contact-profile">
            <div className="label-caps">Profile</div>
            <div className="mt-2 space-y-1 text-sm">
              <div className="text-[#94a3b8]">Email</div><div>{contact.email}</div>
              <div className="text-[#94a3b8] mt-2">Phone</div><div>{contact.phone || "—"}</div>
              <div className="text-[#94a3b8] mt-2">Role</div><div>{contact.role_title || "—"}</div>
              <div className="text-[#94a3b8] mt-2">Tags</div>
              <div className="flex flex-wrap gap-1">{(contact.tags||[]).map((t)=><span key={t} className="chip">{t}</span>)}</div>
              <div className="text-[#94a3b8] mt-2">Consent</div>
              <div className="flex gap-1">
                {contact.consent?.marketing && <span className="chip" style={{color:"#10b981"}}>Marketing</span>}
                {contact.consent?.newsletter && <span className="chip" style={{color:"#10b981"}}>Newsletter</span>}
                {!contact.consent?.marketing && !contact.consent?.newsletter && <span className="chip">None</span>}
              </div>
              <div className="text-[#94a3b8] mt-2">Interactions</div><div>{contact.interaction_count || 0}</div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3"><CheckSquare size={18} weight="duotone" color="#e26e4a"/> <span className="label-caps">Tasks ({tasks.filter(t=>t.status==="open").length} open)</span></div>
            <div className="space-y-2 text-sm">
              {tasks.map((t)=>(
                <div key={t.id} className="flex items-center gap-2">
                  <span className={`chip ${t.status==="done"?"":""}`} style={{color: t.status==="done"?"#10b981":"#e26e4a"}}>{t.status}</span>
                  <span className={t.status==="done"?"line-through text-[#94a3b8]":""}>{t.title}</span>
                </div>
              ))}
              {tasks.length===0 && <div className="text-[#94a3b8]">No tasks yet.</div>}
            </div>
          </div>

          {timeline.quotes.length>0 && (
            <div className="card p-5">
              <div className="label-caps mb-2">Quotes</div>
              {timeline.quotes.map((q)=>(
                <div key={q.id} className="text-sm flex justify-between py-1"><span className="font-mono text-xs">{q.number}</span><span>{fmtMoney(q.grand_total,q.currency)}</span><span className="chip">{q.status}</span></div>
              ))}
            </div>
          )}
        </div>
      </div>

      <LogEmailModal open={showEmail} onClose={()=>setShowEmail(false)} contactId={id} contactEmail={contact.email} onSaved={load}/>
    </div>
  );
}

function LogEmailModal({ open, onClose, contactId, contactEmail, onSaved }) {
  const [f, setF] = useState({ direction:"in", subject:"", body:"", from_addr:"", to_addr:"" });
  useEffect(()=>{
    setF({ direction:"in", subject:"", body:"", from_addr: contactEmail||"", to_addr:"" });
  },[open, contactEmail]);
  const save = async () => {
    try {
      await api.post("/emails", { ...f, contact_id: contactId });
      toast.success("Email logged"); onSaved(); onClose();
    } catch(e){ toast.error(e?.response?.data?.detail||"Failed"); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Log an email" wide>
      <div className="space-y-3" data-testid="log-email-form">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Direction">
            <select className="select" value={f.direction} onChange={(e)=>setF({...f, direction:e.target.value})}>
              <option value="in">Inbound (from prospect)</option>
              <option value="out">Outbound (to prospect)</option>
            </select>
          </Field>
          <Field label={f.direction==="in"?"From":"To"}>
            <input className="input" value={f.direction==="in"?f.from_addr:f.to_addr} onChange={(e)=>setF({...f, [f.direction==="in"?"from_addr":"to_addr"]: e.target.value})}/>
          </Field>
        </div>
        <Field label="Subject"><input className="input" value={f.subject} onChange={(e)=>setF({...f,subject:e.target.value})} data-testid="email-subject"/></Field>
        <Field label="Body"><textarea className="textarea" style={{minHeight:160}} value={f.body} onChange={(e)=>setF({...f,body:e.target.value})} data-testid="email-body"/></Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} data-testid="email-save">Log Email</button>
      </div>
    </Modal>
  );
}
