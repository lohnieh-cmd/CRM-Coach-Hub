import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/api";
import { Mountains, CaretRight, CaretLeft } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function PublicForm() {
  const { slug } = useParams();
  const [form, setForm] = useState(null);
  const [answers, setAnswers] = useState({});
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(()=>{
    api.get(`/forms/${slug}/public`).then(({data})=>setForm(data)).catch(()=>setErr("Form not found"));
  },[slug]);

  const steps = useMemo(()=> (form?.steps && form.steps.length > 0) ? form.steps : null, [form]);
  const currentStep = steps ? steps[stepIdx] : null;
  const singleStepFields = steps ? null : (form?.fields || []);

  const nextStep = () => {
    // Evaluate branches
    if (!currentStep) return;
    // Required check
    for (const fl of currentStep.fields || []) {
      if (fl.required && !answers[fl.key]) { toast.error(`${fl.label} is required`); return; }
    }
    const branches = currentStep.branches || [];
    for (const b of branches) {
      if (String(answers[b.if_field] ?? "") === String(b.equals)) {
        if (!b.goto_step_id) { // submit
          submit();
          return;
        }
        const tgt = steps.findIndex((s)=>s.id === b.goto_step_id);
        if (tgt >= 0) { setStepIdx(tgt); return; }
      }
    }
    // Fall through: next in list or submit if last
    if (stepIdx + 1 < steps.length) setStepIdx(stepIdx + 1);
    else submit();
  };

  const submit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!consent) { toast.error("Please provide consent to continue"); return; }
    // Single-step required validation
    if (singleStepFields) {
      for (const fl of singleStepFields) {
        if (fl.required && !answers[fl.key]) { toast.error(`${fl.label} is required`); return; }
      }
    }
    setLoading(true);
    try {
      await api.post(`/forms/${slug}/submit`, { answers, consent_given: consent });
      setDone(true);
    } catch(er){ toast.error(er?.response?.data?.detail||"Submission failed"); }
    finally { setLoading(false); }
  };

  if (err) return <div className="min-h-screen flex items-center justify-center text-[#94a3b8]">{err}</div>;
  if (!form) return <div className="min-h-screen flex items-center justify-center text-[#94a3b8]">Loading…</div>;

  if (done) return (
    <div className="min-h-screen topo-bg flex items-center justify-center p-6">
      <div className="card p-10 max-w-md text-center">
        <Mountains size={48} weight="duotone" color="#e26e4a" className="mx-auto"/>
        <h2 className="font-head text-2xl font-semibold mt-4">Thank you — your ascent begins.</h2>
        <p className="text-sm text-[#94a3b8] mt-2">{form.double_opt_in ? "Please check your inbox to confirm your email (double opt-in)." : "We'll be in touch shortly."}</p>
      </div>
    </div>
  );

  const renderField = (fl) => (
    <div key={fl.key}>
      <div className="label-caps mb-2">{fl.label}{fl.required && " *"}</div>
      {fl.type==="textarea"
        ? <textarea className="textarea" required={fl.required} value={answers[fl.key]||""} onChange={(e)=>setAnswers({...answers,[fl.key]:e.target.value})} data-testid={`pf-${fl.key}`}/>
        : fl.type==="select"
          ? (
            <select className="select" required={fl.required} value={answers[fl.key]||""} onChange={(e)=>setAnswers({...answers,[fl.key]:e.target.value})} data-testid={`pf-${fl.key}`}>
              <option value="">— choose —</option>
              {(fl.options||[]).map((o)=><option key={o} value={o}>{o}</option>)}
            </select>
          )
          : fl.type==="checkbox"
            ? <input type="checkbox" checked={!!answers[fl.key]} onChange={(e)=>setAnswers({...answers,[fl.key]:e.target.checked})} data-testid={`pf-${fl.key}`}/>
            : <input type={fl.type==="email"?"email":fl.type==="phone"?"tel":"text"} className="input" required={fl.required} value={answers[fl.key]||""} onChange={(e)=>setAnswers({...answers,[fl.key]:e.target.value})} data-testid={`pf-${fl.key}`}/>}
    </div>
  );

  return (
    <div className="min-h-screen topo-bg flex items-center justify-center p-6" data-testid="public-form">
      <div className="card p-8 max-w-lg w-full">
        <div className="flex items-center gap-2 mb-6">
          <Mountains size={28} weight="duotone" color="#e26e4a"/>
          <span className="font-head font-bold">CLiMB Leadership Lab</span>
        </div>
        <h1 className="font-head text-3xl font-semibold">{form.name}</h1>

        {steps && (
          <div className="flex items-center gap-1 mt-4 mb-6" data-testid="funnel-progress">
            {steps.map((_, i)=>(
              <div key={i} className={`flex-1 h-1 rounded ${i<=stepIdx?"bg-[#e26e4a]":"bg-[#283341]"}`}/>
            ))}
            <span className="text-xs text-[#94a3b8] ml-2">{stepIdx+1} / {steps.length}</span>
          </div>
        )}

        {currentStep ? (
          <div>
            <div className="label-caps">{currentStep.title}</div>
            {currentStep.description && <p className="text-sm text-[#94a3b8] mt-1 mb-4">{currentStep.description}</p>}
            <div className="space-y-4">
              {currentStep.fields.map(renderField)}
            </div>
            {stepIdx === steps.length - 1 && (
              <label className="flex items-start gap-2 text-xs text-[#94a3b8] pt-4">
                <input type="checkbox" checked={consent} onChange={(e)=>setConsent(e.target.checked)} data-testid="pf-consent"/>
                <span>{form.consent_text}</span>
              </label>
            )}
            <div className="flex justify-between mt-6">
              {stepIdx > 0 ? <button className="btn btn-secondary" onClick={()=>setStepIdx(stepIdx-1)} data-testid="pf-back"><CaretLeft size={14}/> Back</button> : <span/>}
              <button className="btn btn-primary" onClick={nextStep} disabled={loading} data-testid="pf-next">
                {stepIdx === steps.length - 1 ? (loading?"Submitting…":"Submit") : (<>Next <CaretRight size={14}/></>)}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 mt-4">
            <p className="text-sm text-[#94a3b8] mb-2">Fill in the details below to start your conversation.</p>
            {singleStepFields.map(renderField)}
            <label className="flex items-start gap-2 text-xs text-[#94a3b8] pt-2">
              <input type="checkbox" checked={consent} onChange={(e)=>setConsent(e.target.checked)} data-testid="pf-consent"/>
              <span>{form.consent_text}</span>
            </label>
            <button className="btn btn-primary w-full justify-center" disabled={loading} data-testid="pf-submit">{loading?"Submitting…":"Submit"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
