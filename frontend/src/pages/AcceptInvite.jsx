import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/api";
import { Mountains } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function AcceptInvite() {
  const { token } = useParams();
  const nav = useNavigate();
  const [invite, setInvite] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  useEffect(()=>{
    api.get(`/auth/invite/${token}`).then(({data})=>setInvite(data)).catch((e)=>setErr(e?.response?.data?.detail||"Invalid invite"));
  },[token]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/accept-invite", { token, password, name });
      localStorage.setItem("ascent_token", data.token);
      localStorage.setItem("ascent_user", JSON.stringify(data.user));
      toast.success(`Welcome to the team, ${data.user.name}!`);
      nav("/");
    } catch(er){ toast.error(er?.response?.data?.detail||"Failed"); }
    finally { setLoading(false); }
  };

  if (err) return <div className="min-h-screen flex items-center justify-center topo-bg"><div className="card p-8 max-w-md text-center"><Mountains size={40} weight="duotone" color="#e26e4a" className="mx-auto"/><h2 className="font-head text-xl mt-3">Invite unavailable</h2><p className="text-sm text-[#94a3b8] mt-2">{err}</p></div></div>;
  if (!invite) return <div className="min-h-screen flex items-center justify-center text-[#94a3b8]">Loading…</div>;

  return (
    <div className="min-h-screen flex items-center justify-center topo-bg p-6">
      <div className="card p-8 max-w-md w-full" data-testid="accept-invite">
        <div className="flex items-center gap-2 mb-4">
          <Mountains size={28} weight="duotone" color="#e26e4a"/>
          <span className="font-head font-bold">Ascent CRM</span>
        </div>
        <div className="label-caps mb-1">You've been invited</div>
        <h1 className="font-head text-2xl font-semibold">Join {invite.invited_by_name || "the team"}</h1>
        <p className="text-sm text-[#94a3b8] mt-1 mb-4">
          as <span className="chip">{invite.role}</span> using email <b>{invite.email}</b>
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div><div className="label-caps mb-2">Your name</div><input className="input" value={name} onChange={(e)=>setName(e.target.value)} required data-testid="accept-name"/></div>
          <div><div className="label-caps mb-2">Choose a password</div><input type="password" className="input" value={password} onChange={(e)=>setPassword(e.target.value)} required minLength={6} data-testid="accept-password"/></div>
          <button type="submit" className="btn btn-primary w-full justify-center" disabled={loading} data-testid="accept-submit">{loading?"Joining…":"Join the ascent"}</button>
        </form>
      </div>
    </div>
  );
}
