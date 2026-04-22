import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, Field } from "@/components/ui-kit";
import { Sparkle, Lightning, ShieldCheck, Question } from "@phosphor-icons/react";
import { toast } from "sonner";

const KIND_LABEL = { blog:"Blog draft", email:"Email draft", quote_summary:"Quote summary", reply:"Reply suggestion" };

export default function AIStudio() {
  const [tab, setTab] = useState("reply");
  const [kind, setKind] = useState("reply");
  const [prompt, setPrompt] = useState("Draft a warm 3-sentence reply acknowledging their discovery call request and suggesting two time slots.");
  const [incoming, setIncoming] = useState("Hi, I'm interested in your 100X Leader program and would love to schedule a call to learn more. What's your availability?");
  const [tone, setTone] = useState("warm-sherpa");
  const [contactId, setContactId] = useState("");
  const [dealId, setDealId] = useState("");
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [bv, setBv] = useState(null);

  const loadHistory = async () => { const { data } = await api.get("/ai/history"); setHistory(data); };

  useEffect(()=>{
    (async ()=>{
      const [c, d, me] = await Promise.all([api.get("/contacts"), api.get("/deals"), api.get("/auth/me")]);
      setContacts(c.data); setDeals(d.data); setBv(me.data.brand_voice);
    })();
    loadHistory();
  },[]);

  useEffect(()=>{
    if (tab === "reply") setKind("reply");
    else if (tab === "content") setKind("blog");
  },[tab]);

  const generate = async () => {
    setLoading(true); setResult(null);
    try {
      const payload = { kind, prompt, tone, contact_id: contactId||null, deal_id: dealId||null };
      if (kind === "reply") payload.incoming_email = incoming;
      const { data } = await api.post("/ai/generate", payload);
      setResult(data);
      loadHistory();
    } catch(e){ toast.error(e?.response?.data?.detail||"Generation failed"); }
    finally { setLoading(false); }
  };

  const saveBrandVoice = async () => {
    await api.put("/auth/brand-voice", bv);
    toast.success("Brand voice saved");
  };

  return (
    <div>
      <PageHeader
        title="AI Studio"
        subtitle="Grounded by your CRM · Powered by Gemini 3 · Never invents facts"
        icon={Sparkle}
      />
      <div className="px-8 py-6">
        <div className="flex gap-2 mb-6">
          {[["reply","Reply Suggester"],["content","Content Generator"],["voice","Brand Voice"]].map(([k,l])=>(
            <button key={k} className={`btn ${tab===k?"btn-primary":"btn-secondary"}`} onClick={()=>setTab(k)} data-testid={`ai-tab-${k}`}>{l}</button>
          ))}
        </div>

        {tab!=="voice" ? (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* LEFT: Inputs */}
            <div className="card p-5 xl:col-span-2 space-y-4" data-testid="ai-input-panel">
              <div className="grid grid-cols-2 gap-3">
                {tab==="content" && (
                  <Field label="Kind">
                    <select className="select" value={kind} onChange={(e)=>setKind(e.target.value)}>
                      <option value="blog">Blog draft</option><option value="email">Email draft</option><option value="quote_summary">Quote summary</option>
                    </select>
                  </Field>
                )}
                <Field label="Tone">
                  <select className="select" value={tone} onChange={(e)=>setTone(e.target.value)} data-testid="ai-tone">
                    <option value="professional">Professional</option>
                    <option value="friendly">Friendly</option>
                    <option value="warm-sherpa">Warm Sherpa</option>
                    <option value="authoritative">Authoritative</option>
                    <option value="short">Short & direct</option>
                  </select>
                </Field>
                <Field label="Contact (grounding)">
                  <select className="select" value={contactId} onChange={(e)=>setContactId(e.target.value)}>
                    <option value="">— none —</option>
                    {contacts.map((c)=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                  </select>
                </Field>
                {tab!=="voice" && (
                  <Field label="Deal (grounding)">
                    <select className="select" value={dealId} onChange={(e)=>setDealId(e.target.value)}>
                      <option value="">— none —</option>
                      {deals.map((d)=><option key={d.id} value={d.id}>{d.title}</option>)}
                    </select>
                  </Field>
                )}
              </div>

              {tab==="reply" && (
                <Field label="Incoming email"><textarea className="textarea" rows={5} value={incoming} onChange={(e)=>setIncoming(e.target.value)} data-testid="ai-incoming"/></Field>
              )}
              <Field label="What should the AI do?">
                <textarea className="textarea" rows={4} value={prompt} onChange={(e)=>setPrompt(e.target.value)} data-testid="ai-prompt"/>
              </Field>
              <button className="btn btn-primary" onClick={generate} disabled={loading} data-testid="ai-generate">
                <Lightning size={16}/> {loading?"Generating…":"Generate grounded draft"}
              </button>

              {result && (
                <div className="card p-4 mt-4" data-testid="ai-output">
                  <div className="label-caps mb-2">Draft</div>
                  <pre className="whitespace-pre-wrap text-sm text-[#f0f3f8] font-sans">{result.draft}</pre>
                  {(result.questions_for_user||[]).length>0 && (
                    <div className="mt-4 p-3 rounded-lg border border-[#5a3524] bg-[#2a1812]">
                      <div className="flex items-center gap-2 label-caps mb-2"><Question size={14} color="#e26e4a"/> Missing info — please confirm</div>
                      <ul className="text-sm list-disc pl-5 space-y-1">
                        {result.questions_for_user.map((q,i)=><li key={i}>{q}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT: Fields used panel */}
            <div className="card p-5" data-testid="ai-fields-used">
              <div className="flex items-center gap-2 label-caps"><ShieldCheck size={14} color="#10b981"/> Grounding · fields used</div>
              <div className="mt-3 space-y-3">
                {!result && <div className="text-sm text-[#94a3b8]">Generate a draft to see which CRM fields informed the output. We never let the model invent facts.</div>}
                {result?.fields_used?.map((fu,i)=>(
                  <div key={i} className="text-xs">
                    <div className="text-[#e26e4a] font-semibold">{fu.entity} · {fu.id?.slice(0,8)}</div>
                    <div className="text-[#94a3b8]">{(fu.fields||[]).join(", ")}</div>
                  </div>
                ))}
                {result && (
                  <>
                    <div className="divider my-3"/>
                    <div className="label-caps">LLM self-reported</div>
                    <ul className="text-xs text-[#94a3b8] list-disc pl-4 mt-1 space-y-0.5">
                      {(result.llm_fields_used||[]).map((x,i)=><li key={i}>{x}</li>)}
                    </ul>
                  </>
                )}
              </div>
              <div className="divider my-4"/>
              <div className="label-caps">Recent generations</div>
              <div className="space-y-2 mt-2 max-h-64 overflow-y-auto">
                {history.slice(0,8).map((h)=>(
                  <div key={h.id} className="text-xs text-[#94a3b8] border-b border-[#283341] pb-1">
                    <div className="text-[#f0f3f8]">{KIND_LABEL[h.kind]||h.kind}</div>
                    <div className="truncate">{h.prompt}</div>
                  </div>
                ))}
                {history.length===0 && <div className="text-xs text-[#94a3b8]">No generations yet.</div>}
              </div>
            </div>
          </div>
        ) : (
          bv && (
            <div className="card p-6 max-w-2xl" data-testid="brand-voice-form">
              <div className="grid grid-cols-1 gap-4">
                <Field label="Tone">
                  <select className="select" value={bv.tone||"professional"} onChange={(e)=>setBv({...bv,tone:e.target.value})}>
                    <option>professional</option><option>friendly</option><option>warm-sherpa</option><option>authoritative</option>
                  </select>
                </Field>
                <Field label="Vocabulary hints"><textarea className="textarea" value={bv.vocabulary_hints||""} onChange={(e)=>setBv({...bv, vocabulary_hints:e.target.value})}/></Field>
                <Field label="Signature"><input className="input" value={bv.signature||""} onChange={(e)=>setBv({...bv, signature:e.target.value})}/></Field>
                <Field label="Banned phrases (comma)"><input className="input" value={(bv.banned_phrases||[]).join(", ")} onChange={(e)=>setBv({...bv, banned_phrases:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})}/></Field>
              </div>
              <button className="btn btn-primary mt-4" onClick={saveBrandVoice} data-testid="bv-save">Save Brand Voice</button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
