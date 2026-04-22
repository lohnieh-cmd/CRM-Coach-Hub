import React, { useEffect, useState } from "react";
import { api, API_BASE } from "@/api";
import { PageHeader, Modal, Field, Empty } from "@/components/ui-kit";
import { Users, Plus, Copy, Trash, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";

const ROLES = [
  { value: "admin", label: "Admin — all data, can manage team" },
  { value: "rep", label: "Rep — full CRM access, cannot invite" },
  { value: "va", label: "VA — draft only, cannot send" },
  { value: "view", label: "View-only" },
];

export default function TeamSettings() {
  const [me, setMe] = useState(null);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [showInvite, setShowInvite] = useState(false);

  const load = async () => {
    const [m, mem, inv] = await Promise.all([
      api.get("/auth/me"), api.get("/team/members"), api.get("/team/invites"),
    ]);
    setMe(m.data); setMembers(mem.data); setInvites(inv.data);
  };
  useEffect(()=>{ load(); },[]);

  const canManage = me && (me.role === "owner" || me.role === "admin");

  const inviteLink = (tok) => `${window.location.origin}/invite/${tok}`;
  const copyLink = (tok) => { navigator.clipboard.writeText(inviteLink(tok)); toast.success("Invite link copied"); };

  const revoke = async (id) => {
    if (!window.confirm("Revoke this invite?")) return;
    await api.delete(`/team/invites/${id}`);
    toast.success("Revoked"); load();
  };

  const remove = async (uid) => {
    if (!window.confirm("Remove this team member?")) return;
    await api.delete(`/team/members/${uid}`);
    toast.success("Removed"); load();
  };

  const changeRole = async (uid, role) => {
    await api.patch(`/team/members/${uid}`, { role });
    toast.success("Role updated"); load();
  };

  if (!me) return <div className="p-10 text-[#94a3b8]">Loading…</div>;

  return (
    <div>
      <PageHeader
        title="Team & Access"
        subtitle={`${members.length} member${members.length!==1?"s":""} · ${invites.filter(i=>i.status==="pending").length} pending invite${invites.filter(i=>i.status==="pending").length!==1?"s":""}`}
        icon={Users}
        actions={canManage && <button className="btn btn-primary" onClick={()=>setShowInvite(true)} data-testid="invite-btn"><Plus size={16}/> Invite member</button>}
      />
      <div className="px-8 py-6 space-y-6">
        <div className="card p-5" data-testid="members-card">
          <div className="label-caps mb-3">Team members</div>
          <table className="atable">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {members.map((m)=>(
                <tr key={m.id} data-testid={`member-${m.id}`}>
                  <td className="font-medium">{m.name} {m.id===me.actor_id && <span className="chip ml-2">you</span>}</td>
                  <td className="text-[#94a3b8]">{m.email}</td>
                  <td>
                    {m.role==="owner" || !canManage || m.id===me.actor_id ? (
                      <span className="chip" style={{color: m.role==="owner"?"#e26e4a":"#94a3b8"}}>{m.role}</span>
                    ) : (
                      <select className="select text-xs" value={m.role} onChange={(e)=>changeRole(m.id, e.target.value)} data-testid={`member-role-${m.id}`}>
                        {ROLES.map((r)=><option key={r.value} value={r.value}>{r.value}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="text-right">
                    {canManage && m.role!=="owner" && m.id!==me.actor_id && (
                      <button className="btn btn-ghost text-xs" onClick={()=>remove(m.id)} data-testid={`member-remove-${m.id}`}><Trash size={14}/></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-5" data-testid="invites-card">
          <div className="label-caps mb-3">Invites ({invites.length})</div>
          {invites.length===0 ? (
            <div className="text-sm text-[#94a3b8]">No invites yet. {canManage && "Click 'Invite member' to add someone to your team."}</div>
          ) : (
            <div className="space-y-2">
              {invites.map((i)=>(
                <div key={i.id} className="flex items-center justify-between p-3 border border-[#283341] rounded" data-testid={`invite-${i.id}`}>
                  <div className="min-w-0">
                    <div className="font-medium">{i.email}</div>
                    <div className="text-xs text-[#94a3b8]">
                      <span className="chip mr-2">{i.role}</span>
                      <span className="chip" style={{color: i.status==="pending"?"#f59e0b":"#10b981"}}>{i.status}</span>
                      <span className="ml-2">expires {(i.expires_at||"").slice(0,10)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {i.status==="pending" && (
                      <>
                        <button className="btn btn-secondary text-xs" onClick={()=>copyLink(i.token)} data-testid={`invite-copy-${i.id}`}><Copy size={12}/> Link</button>
                        {canManage && <button className="btn btn-ghost text-xs" onClick={()=>revoke(i.id)} data-testid={`invite-revoke-${i.id}`}><Trash size={12}/></button>}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!canManage && (
          <div className="card p-4 border-l-4 border-l-[#f59e0b] bg-[#2a1d12] text-sm">
            <Warning size={16} className="inline mr-2 text-[#f59e0b]"/>
            Your role ({me.role}) can view team members but cannot invite or remove.
          </div>
        )}
      </div>
      <InviteModal open={showInvite} onClose={()=>setShowInvite(false)} onSaved={load}/>
    </div>
  );
}

function InviteModal({ open, onClose, onSaved }) {
  const [f, setF] = useState({ email:"", role:"rep" });
  const [result, setResult] = useState(null);
  const save = async () => {
    try {
      const { data } = await api.post("/team/invites", f);
      setResult(data);
      toast.success("Invite created — copy the link"); onSaved();
    } catch(e){ toast.error(e?.response?.data?.detail||"Failed"); }
  };
  const close = () => { setF({ email:"", role:"rep" }); setResult(null); onClose(); };
  return (
    <Modal open={open} onClose={close} title="Invite a team member">
      {result ? (
        <div className="space-y-3" data-testid="invite-result">
          <div className="text-sm">Invite created for <b>{result.email}</b> as <b>{result.role}</b>.</div>
          <div className="card p-3 bg-[#0b0f15]">
            <div className="label-caps mb-1">Share this link</div>
            <code className="text-xs text-[#e26e4a] break-all">{`${window.location.origin}/invite/${result.token}`}</code>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={()=>{ navigator.clipboard.writeText(`${window.location.origin}/invite/${result.token}`); toast.success("Copied"); }}>Copy link</button>
            <button className="btn btn-primary" onClick={close}>Done</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4" data-testid="invite-form">
          <Field label="Email"><input type="email" className="input" value={f.email} onChange={(e)=>setF({...f,email:e.target.value})} data-testid="invite-email"/></Field>
          <Field label="Role">
            <select className="select" value={f.role} onChange={(e)=>setF({...f,role:e.target.value})} data-testid="invite-role">
              {ROLES.map((r)=><option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={close}>Cancel</button>
            <button className="btn btn-primary" onClick={save} data-testid="invite-create">Create invite</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
