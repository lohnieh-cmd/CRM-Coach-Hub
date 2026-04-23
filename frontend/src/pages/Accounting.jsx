import React, { useEffect, useState } from "react";
import { api } from "@/api";
import { PageHeader, Modal, Field } from "@/components/ui-kit";
import { Calculator, Plus, Lock, LockOpen, CheckCircle, ArrowClockwise, FileText, DownloadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";

const TABS = [
  { key: "dashboard", label: "Overview",         testid: "tab-overview" },
  { key: "coa",       label: "Chart of Accounts", testid: "tab-coa" },
  { key: "journals",  label: "Journals",         testid: "tab-journals" },
  { key: "tb",        label: "Trial Balance",    testid: "tab-tb" },
  { key: "is",        label: "Income Statement", testid: "tab-is" },
  { key: "bs",        label: "Balance Sheet",    testid: "tab-bs" },
  { key: "vat",       label: "VAT 201",          testid: "tab-vat" },
  { key: "assets",    label: "Fixed Assets",     testid: "tab-assets" },
  { key: "bank",      label: "Bank & Recon",     testid: "tab-bank" },
  { key: "receipts",  label: "Receipts (OCR)",   testid: "tab-receipts" },
  { key: "payroll",   label: "Payroll & Tax",    testid: "tab-payroll" },
  { key: "periods",   label: "Periods & Sign-off", testid: "tab-periods" },
];

const ZAR = (v) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(v || 0);

export default function Accounting() {
  const [tab, setTab] = useState("dashboard");
  const [seeded, setSeeded] = useState(null);

  const checkSeeded = async () => {
    const { data } = await api.get("/accounting/accounts");
    setSeeded(data.length > 0);
  };
  useEffect(() => { checkSeeded(); }, []);

  const seed = async () => {
    if (!window.confirm("Seed the South African Chart of Accounts and open the current fiscal period? Safe to run again — existing accounts are preserved.")) return;
    try {
      const { data } = await api.post("/accounting/seed");
      toast.success(`Seeded ${data.accounts_added} accounts · Period ${data.period_opened} opened`);
      checkSeeded();
    } catch (e) { toast.error(e?.response?.data?.detail || "Seed failed"); }
  };

  if (seeded === null) return <div className="p-8 text-[#94a3b8]">Loading…</div>;

  if (!seeded) {
    return (
      <div>
        <PageHeader title="Accounting" subtitle="South African double-entry accounting — not yet initialised" icon={Calculator}/>
        <div className="px-8 py-10">
          <div className="card p-8 max-w-2xl">
            <h3 className="font-head text-xl font-semibold mb-3">Set up your accounting books</h3>
            <p className="text-sm text-[#94a3b8] mb-4">This will create a South African Chart of Accounts tailored for a coaching / professional-services business (66 accounts across assets, liabilities, equity, income and expenses), seed the standard SARS VAT codes (Standard 15%, Zero, Exempt, Non-vatable), and open the current month as a fiscal period.</p>
            <p className="text-xs text-[#94a3b8] mb-4">All figures produced by this module (trial balance, income statement, VAT201, tax estimates) are for accountant review. <strong className="text-[#e26e4a]">Must be signed off by a CA(SA) / SAICA / SAIPA member before filing with SARS.</strong></p>
            <button className="btn btn-primary" onClick={seed} data-testid="accounting-seed"><Plus size={16}/> Initialise accounting books</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Accounting" subtitle="South African double-entry · IFRS for SMEs compatible" icon={Calculator}/>
      <div className="px-8 pt-4">
        <div className="flex gap-1 border-b border-[#283341] overflow-x-auto" data-testid="accounting-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              role="tab"
              className={`px-4 py-2 text-sm ${tab === t.key ? "text-[#e26e4a] border-b-2 border-[#e26e4a]" : "text-[#94a3b8] hover:text-[#cdd6e0]"}`}
              onClick={() => setTab(t.key)}
              data-testid={t.testid}
            >{t.label}</button>
          ))}
        </div>
      </div>
      <div className="px-8 py-6">
        {tab === "dashboard" && <Dashboard/>}
        {tab === "coa"       && <ChartOfAccounts/>}
        {tab === "journals"  && <Journals/>}
        {tab === "tb"        && <TrialBalance/>}
        {tab === "is"        && <IncomeStatement/>}
        {tab === "bs"        && <BalanceSheet/>}
        {tab === "vat"       && <VAT201/>}
        {tab === "assets"    && <FixedAssets/>}
        {tab === "bank"      && <BankRecon/>}
        {tab === "receipts"  && <Receipts/>}
        {tab === "payroll"   && <PayrollAndTax/>}
        {tab === "periods"   && <Periods/>}
      </div>
    </div>
  );
}

// ── Overview -----------------------------------------------------------------
function Dashboard() {
  const [tb, setTb] = useState(null);
  const [is, setIs] = useState(null);
  const [bs, setBs] = useState(null);
  useEffect(() => {
    (async () => {
      const [a, b, c] = await Promise.all([
        api.get("/accounting/reports/trial-balance"),
        api.get("/accounting/reports/income-statement"),
        api.get("/accounting/reports/balance-sheet"),
      ]);
      setTb(a.data); setIs(b.data); setBs(c.data);
    })();
  }, []);
  if (!tb || !is || !bs) return <div className="text-[#94a3b8]">Loading books…</div>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="card p-5">
        <div className="label-caps">Trial Balance</div>
        <div className="font-head text-2xl mt-2">{tb.balanced ? <span className="text-[#10b981]">Balanced</span> : <span className="text-[#ef4444]">Unbalanced</span>}</div>
        <div className="text-xs text-[#94a3b8] mt-1">DR {ZAR(tb.total_debit)} · CR {ZAR(tb.total_credit)}</div>
      </div>
      <div className="card p-5">
        <div className="label-caps">Net Income (YTD)</div>
        <div className="font-head text-2xl mt-2">{ZAR(is.net_income_before_tax)}</div>
        <div className="text-xs text-[#94a3b8] mt-1">Est. tax @ 27%: {ZAR(is.estimated_tax_at_27pct)} → after-tax {ZAR(is.net_income_after_tax)}</div>
      </div>
      <div className="card p-5">
        <div className="label-caps">Balance Sheet</div>
        <div className="font-head text-2xl mt-2">{ZAR(bs.total_assets)}</div>
        <div className="text-xs text-[#94a3b8] mt-1">Liab {ZAR(bs.total_liabilities)} · Equity {ZAR(bs.total_equity)} · {bs.balanced ? <span className="text-[#10b981]">Balanced</span> : <span className="text-[#ef4444]">⚠ Check</span>}</div>
      </div>
      <div className="card p-5 lg:col-span-3 text-xs text-[#94a3b8]">
        <strong className="text-[#cdd6e0]">Disclaimer:</strong> {is.disclaimer}
      </div>
    </div>
  );
}

// ── Chart of Accounts --------------------------------------------------------
function ChartOfAccounts() {
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const load = async () => { const { data } = await api.get("/accounting/accounts"); setRows(data); };
  useEffect(() => { load(); }, []);
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <div className="text-xs text-[#94a3b8]">{rows.length} accounts</div>
        <button className="btn btn-secondary text-xs" onClick={() => setShow(true)} data-testid="new-account-btn"><Plus size={14}/> New account</button>
      </div>
      <div className="card overflow-hidden">
        <table className="atable" data-testid="coa-table">
          <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Subtype</th><th>VAT</th><th>Normal</th></tr></thead>
          <tbody>
            {rows.map(a => (
              <tr key={a.id} className={a.is_header ? "text-[#e26e4a] font-medium" : ""} data-testid={`acct-${a.code}`}>
                <td className="font-mono">{a.code}</td>
                <td>{a.name}</td>
                <td className="text-[#94a3b8]">{a.type}</td>
                <td className="text-[#94a3b8]">{a.subtype}</td>
                <td>{a.vat_code ? <span className="chip">{a.vat_code}</span> : ""}</td>
                <td className="text-[#94a3b8]">{a.normal_balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NewAccountModal open={show} onClose={() => setShow(false)} onSaved={load}/>
    </div>
  );
}

function NewAccountModal({ open, onClose, onSaved }) {
  const [f, setF] = useState({ code: "", name: "", type: "expense", subtype: "", vat_code: "NV" });
  const save = async () => {
    try {
      await api.post("/accounting/accounts", f);
      toast.success("Account created"); onSaved(); onClose();
      setF({ code: "", name: "", type: "expense", subtype: "", vat_code: "NV" });
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  return (
    <Modal open={open} onClose={onClose} title="New Account">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code"><input className="input" value={f.code} onChange={e => setF({...f, code: e.target.value})} placeholder="82900" data-testid="acct-code"/></Field>
        <Field label="Type">
          <select className="select" value={f.type} onChange={e => setF({...f, type: e.target.value})}>
            <option>asset</option><option>liability</option><option>equity</option><option>income</option><option>expense</option>
          </select>
        </Field>
        <div className="col-span-2"><Field label="Name"><input className="input" value={f.name} onChange={e => setF({...f, name: e.target.value})} placeholder="Coffee & client hospitality" data-testid="acct-name"/></Field></div>
        <Field label="Sub-type"><input className="input" value={f.subtype} onChange={e => setF({...f, subtype: e.target.value})} placeholder="opex"/></Field>
        <Field label="VAT Code">
          <select className="select" value={f.vat_code} onChange={e => setF({...f, vat_code: e.target.value})}>
            <option value="">—</option><option>S</option><option>SI</option><option>Z</option><option>E</option><option>NV</option><option>CI</option>
          </select>
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} data-testid="acct-save">Create</button>
      </div>
    </Modal>
  );
}

// ── Journals -----------------------------------------------------------------
function Journals() {
  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [show, setShow] = useState(false);
  const load = async () => {
    const [j, a] = await Promise.all([api.get("/accounting/journals"), api.get("/accounting/accounts")]);
    setRows(j.data); setAccounts(a.data);
  };
  useEffect(() => { load(); }, []);
  const reverse = async (id) => {
    if (!window.confirm("Post a reversing entry for this journal?")) return;
    try { await api.post(`/accounting/journals/${id}/reverse`); toast.success("Reversed"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <div className="text-xs text-[#94a3b8]">{rows.length} posted journals</div>
        <button className="btn btn-primary text-xs" onClick={() => setShow(true)} data-testid="new-journal-btn"><Plus size={14}/> New journal</button>
      </div>
      <div className="space-y-2">
        {rows.map(j => (
          <div key={j.id} className="card p-4" data-testid={`journal-${j.id}`}>
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xs text-[#94a3b8]">{j.date} · {j.period} · <span className="chip">{j.source}</span></div>
                <div className="font-medium mt-1">{j.memo}</div>
                {j.reference && <div className="text-xs text-[#94a3b8]">Ref: {j.reference}</div>}
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-[#94a3b8]">{ZAR(j.total_debit)}</div>
                {!j.reversed_by && j.source !== "reversing" && (
                  <button className="btn btn-ghost text-xs" onClick={() => reverse(j.id)} data-testid={`reverse-${j.id}`}><ArrowClockwise size={12}/> Reverse</button>
                )}
                {j.reversed_by && <span className="chip" style={{color: "#ef4444"}}>reversed</span>}
              </div>
            </div>
            <table className="w-full text-xs mt-3">
              <thead className="text-[#94a3b8]"><tr><th className="text-left">Code</th><th className="text-left">Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
              <tbody>
                {j.lines.map(ln => (
                  <tr key={ln.id}>
                    <td className="font-mono py-1">{ln.account_code}</td>
                    <td>{ln.account_name}{ln.description ? <span className="text-[#94a3b8]"> — {ln.description}</span> : ""}</td>
                    <td className="text-right font-mono">{ln.debit > 0 ? ZAR(ln.debit) : ""}</td>
                    <td className="text-right font-mono">{ln.credit > 0 ? ZAR(ln.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {rows.length === 0 && <div className="text-[#94a3b8]">No journals posted yet. Create an invoice or post a manual journal to start the books.</div>}
      </div>
      <NewJournalModal open={show} onClose={() => setShow(false)} accounts={accounts} onSaved={load}/>
    </div>
  );
}

function NewJournalModal({ open, onClose, accounts, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState(null);
  useEffect(() => {
    setF({ date: today, memo: "", reference: "", lines: [
      { account_code: "", debit: 0, credit: 0, description: "" },
      { account_code: "", debit: 0, credit: 0, description: "" },
    ]});
  }, [open]);
  if (!f) return null;
  const line = (i, patch) => { const l = [...f.lines]; l[i] = { ...l[i], ...patch }; setF({ ...f, lines: l }); };
  const addLine = () => setF({ ...f, lines: [...f.lines, { account_code: "", debit: 0, credit: 0, description: "" }]});
  const delLine = (i) => setF({ ...f, lines: f.lines.filter((_, x) => x !== i)});
  const totals = f.lines.reduce((acc, l) => ({ d: acc.d + (parseFloat(l.debit)||0), c: acc.c + (parseFloat(l.credit)||0) }), { d: 0, c: 0 });
  const balanced = totals.d === totals.c && totals.d > 0;
  const save = async () => {
    try {
      await api.post("/accounting/journals", f);
      toast.success("Journal posted"); onSaved(); onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Posting failed"); }
  };
  return (
    <Modal open={open} onClose={onClose} title="New Journal Entry" wide>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Field label="Date"><input type="date" className="input" value={f.date} onChange={e => setF({...f, date: e.target.value})} data-testid="j-date"/></Field>
        <Field label="Reference"><input className="input" value={f.reference} onChange={e => setF({...f, reference: e.target.value})}/></Field>
        <div className="col-span-2"><Field label="Memo (required)"><input className="input" value={f.memo} onChange={e => setF({...f, memo: e.target.value})} data-testid="j-memo"/></Field></div>
      </div>
      <div className="card p-3">
        <div className="label-caps mb-2">Lines</div>
        {f.lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1.5fr_2fr_1fr_1fr_auto] gap-2 items-center mb-2">
            <select className="select text-xs" value={l.account_code} onChange={e => line(i, { account_code: e.target.value })} data-testid={`j-acct-${i}`}>
              <option value="">— account —</option>
              {accounts.filter(a => !a.is_header && a.active).map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
            </select>
            <input className="input" placeholder="Description" value={l.description} onChange={e => line(i, { description: e.target.value })}/>
            <input type="number" className="input" placeholder="Debit" value={l.debit} onChange={e => line(i, { debit: parseFloat(e.target.value)||0, credit: 0 })}/>
            <input type="number" className="input" placeholder="Credit" value={l.credit} onChange={e => line(i, { credit: parseFloat(e.target.value)||0, debit: 0 })}/>
            <button className="btn btn-ghost" onClick={() => delLine(i)}>✕</button>
          </div>
        ))}
        <button className="btn btn-secondary text-xs" onClick={addLine}><Plus size={12}/> Add line</button>
        <div className="flex justify-end gap-6 mt-3 text-sm">
          <span>DR {ZAR(totals.d)}</span><span>CR {ZAR(totals.c)}</span>
          <span className={balanced ? "text-[#10b981]" : "text-[#ef4444]"}>{balanced ? "Balanced" : "Unbalanced"}</span>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={!balanced || !f.memo} data-testid="j-post">Post journal</button>
      </div>
    </Modal>
  );
}

// ── Trial Balance, Income, Balance Sheet -------------------------------------
function TrialBalance() {
  const today = new Date().toISOString().slice(0, 10);
  const [to, setTo] = useState(today);
  const [r, setR] = useState(null);
  const load = async () => { const { data } = await api.get(`/accounting/reports/trial-balance?date_to=${to}`); setR(data); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [to]);
  if (!r) return <div className="text-[#94a3b8]">Loading…</div>;
  return (
    <div>
      <div className="flex items-end gap-3 mb-3">
        <Field label="As at"><input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} data-testid="tb-date"/></Field>
        <CsvDownloadBtn data={[["Code","Name","Type","Debit","Credit"], ...r.rows.map(x => [x.code, x.name, x.type, x.debit, x.credit])]} name={`trial-balance-${to}.csv`}/>
        <PdfDownloadBtn path={`/accounting/reports/trial-balance/pdf?date_to=${to}`} name={`TrialBalance_${to}.pdf`} testid="tb-pdf"/>
      </div>
      <div className="card overflow-hidden">
        <table className="atable" data-testid="tb-table">
          <thead><tr><th>Code</th><th>Name</th><th>Type</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
          <tbody>
            {r.rows.map(x => (
              <tr key={x.code}>
                <td className="font-mono">{x.code}</td>
                <td>{x.name}</td>
                <td className="text-[#94a3b8]">{x.type}</td>
                <td className="text-right font-mono">{x.debit > 0 ? ZAR(x.debit) : ""}</td>
                <td className="text-right font-mono">{x.credit > 0 ? ZAR(x.credit) : ""}</td>
              </tr>
            ))}
            <tr className="font-head border-t-2 border-[#e26e4a]">
              <td colSpan={3} className="text-right">Totals</td>
              <td className="text-right font-mono">{ZAR(r.total_debit)}</td>
              <td className="text-right font-mono">{ZAR(r.total_credit)}</td>
            </tr>
            <tr>
              <td colSpan={5} className={`text-center ${r.balanced ? "text-[#10b981]" : "text-[#ef4444]"}`}>
                {r.balanced ? "✓ Trial balance is balanced" : "✗ Trial balance is UNBALANCED — investigate"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IncomeStatement() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0,4)}-01-01`);
  const [to, setTo] = useState(today);
  const [r, setR] = useState(null);
  const load = async () => { const { data } = await api.get(`/accounting/reports/income-statement?date_from=${from}&date_to=${to}`); setR(data); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to]);
  if (!r) return <div className="text-[#94a3b8]">Loading…</div>;
  return (
    <div>
      <div className="flex items-end gap-3 mb-3">
        <Field label="From"><input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)}/></Field>
        <Field label="To"><input type="date" className="input" value={to} onChange={e => setTo(e.target.value)}/></Field>
        <PdfDownloadBtn path={`/accounting/reports/income-statement/pdf?date_from=${from}&date_to=${to}`} name={`IncomeStatement_${from}_to_${to}.pdf`} testid="is-pdf"/>
      </div>
      <div className="card p-6 max-w-2xl" data-testid="is-card">
        <h3 className="font-head text-xl font-semibold mb-4">Income Statement · {from} → {to}</h3>
        <div className="label-caps mt-2">Revenue</div>
        {r.income.map(x => <div key={x.code} className="flex justify-between text-sm py-1"><span>{x.name}</span><span className="font-mono">{ZAR(x.amount)}</span></div>)}
        <div className="flex justify-between font-medium border-t border-[#283341] mt-2 pt-2"><span>Total Revenue</span><span className="font-mono">{ZAR(r.total_income)}</span></div>

        <div className="label-caps mt-4">Operating Expenses</div>
        {r.expenses.map(x => <div key={x.code} className="flex justify-between text-sm py-1"><span>{x.name}</span><span className="font-mono">{ZAR(x.amount)}</span></div>)}
        <div className="flex justify-between font-medium border-t border-[#283341] mt-2 pt-2"><span>Total Expenses</span><span className="font-mono">{ZAR(r.total_expense)}</span></div>

        <div className="flex justify-between font-head text-lg border-t-2 border-[#e26e4a] mt-3 pt-2"><span>Net Income before Tax</span><span className="font-mono">{ZAR(r.net_income_before_tax)}</span></div>
        <div className="flex justify-between text-sm text-[#94a3b8] mt-1"><span>Estimated Corporate Tax @ 27%</span><span className="font-mono">{ZAR(r.estimated_tax_at_27pct)}</span></div>
        <div className="flex justify-between font-head text-lg border-t border-[#283341] mt-2 pt-2"><span>Net Income after Tax</span><span className="font-mono">{ZAR(r.net_income_after_tax)}</span></div>

        <p className="text-xs text-[#94a3b8] mt-4">{r.disclaimer}</p>
      </div>
    </div>
  );
}

function BalanceSheet() {
  const today = new Date().toISOString().slice(0, 10);
  const [as_at, setAsAt] = useState(today);
  const [r, setR] = useState(null);
  const load = async () => { const { data } = await api.get(`/accounting/reports/balance-sheet?as_at=${as_at}`); setR(data); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [as_at]);
  if (!r) return <div className="text-[#94a3b8]">Loading…</div>;
  const col = (title, rows, total) => (
    <div className="card p-5">
      <div className="label-caps mb-2">{title}</div>
      {rows.length === 0 && <div className="text-xs text-[#94a3b8]">—</div>}
      {rows.map(x => <div key={x.code} className="flex justify-between text-sm py-1"><span>{x.name}</span><span className="font-mono">{ZAR(x.amount)}</span></div>)}
      <div className="flex justify-between font-head border-t-2 border-[#e26e4a] mt-3 pt-2"><span>Total {title}</span><span className="font-mono">{ZAR(total)}</span></div>
    </div>
  );
  return (
    <div>
      <div className="flex items-end gap-3 mb-3">
        <Field label="As at"><input type="date" className="input" value={as_at} onChange={e => setAsAt(e.target.value)}/></Field>
        <PdfDownloadBtn path={`/accounting/reports/balance-sheet/pdf?as_at=${as_at}`} name={`BalanceSheet_${as_at}.pdf`} testid="bs-pdf"/>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="bs-card">
        {col("Assets", r.assets, r.total_assets)}
        {col("Liabilities", r.liabilities, r.total_liabilities)}
        {col("Equity", r.equity, r.total_equity)}
      </div>
      <div className="mt-4 p-3 card text-center">
        {r.balanced ? <span className="text-[#10b981]">✓ Balance sheet balances — Assets {ZAR(r.total_assets)} = Liabilities + Equity {ZAR(r.liabilities_plus_equity)}</span> :
          <span className="text-[#ef4444]">⚠ Balance sheet does not balance — check ledger</span>}
      </div>
    </div>
  );
}

function VAT201() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0,7)}-01`);
  const [to, setTo]     = useState(today);
  const [r, setR]       = useState(null);
  const load = async () => { const { data } = await api.get(`/accounting/reports/vat201?date_from=${from}&date_to=${to}`); setR(data); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to]);
  if (!r) return <div className="text-[#94a3b8]">Loading…</div>;
  return (
    <div>
      <div className="flex items-end gap-3 mb-3">
        <Field label="From"><input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)}/></Field>
        <Field label="To"><input type="date" className="input" value={to} onChange={e => setTo(e.target.value)}/></Field>
        <PdfDownloadBtn path={`/accounting/reports/vat201/pdf?date_from=${from}&date_to=${to}`} name={`VAT201_${from}_to_${to}.pdf`} testid="vat-pdf"/>
      </div>
      <div className="card p-6 max-w-3xl" data-testid="vat-card">
        <h3 className="font-head text-xl font-semibold mb-4">VAT 201 · {from} → {to}</h3>
        <div className="label-caps">Output Tax (supplies)</div>
        <div className="flex justify-between text-sm py-1"><span>Box 1 — Standard-rated 15%</span><span className="font-mono">{ZAR(r.output_tax.box_1_standard_rated_15pct)}</span></div>
        <div className="flex justify-between text-sm py-1"><span>Box 2 — Zero-rated supplies (value)</span><span className="font-mono">{ZAR(r.output_tax.box_2_zero_rated_supplies_value)}</span></div>
        <div className="flex justify-between text-sm py-1"><span>Box 3 — Exempt + other (value)</span><span className="font-mono">{ZAR(r.output_tax.box_3_exempt_and_other_supplies_value)}</span></div>

        <div className="label-caps mt-4">Input Tax</div>
        <div className="flex justify-between text-sm py-1"><span>Box 14 — Standard inputs 15%</span><span className="font-mono">{ZAR(r.input_tax.box_14_standard_inputs_15pct)}</span></div>
        <div className="flex justify-between text-sm py-1"><span>Box 15 — Capital inputs 15%</span><span className="font-mono">{ZAR(r.input_tax.box_15_capital_inputs_15pct)}</span></div>
        <div className="flex justify-between text-sm py-1"><span>Total Input Tax Claim</span><span className="font-mono">{ZAR(r.input_tax.total_input_tax_claim)}</span></div>

        <div className="flex justify-between font-head text-lg border-t-2 border-[#e26e4a] mt-3 pt-2">
          <span>VAT Payable to SARS</span>
          <span className="font-mono" data-testid="vat-payable">{ZAR(r.vat_payable_to_sars)}</span>
        </div>
        <p className="text-xs text-[#94a3b8] mt-4">{r.disclaimer}</p>
      </div>
    </div>
  );
}

// ── Periods + sign-off -------------------------------------------------------
function AfsBundleCard() {
  // SA fiscal year default: 1 March prev year → end of Feb current year,
  // or YTD for the current SA fiscal year.
  const today = new Date();
  const saFyStart = today.getMonth() >= 2   // Mar = 2 (0-indexed)
    ? `${today.getFullYear()}-03-01`
    : `${today.getFullYear() - 1}-03-01`;
  const [from, setFrom] = useState(saFyStart);
  const [to, setTo] = useState(today.toISOString().slice(0, 10));

  return (
    <div className="card p-5 mb-4" data-testid="afs-bundle-card">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="label-caps text-[#e26e4a] mb-1">Annual Financial Statements</div>
          <h3 className="font-head text-xl font-semibold mb-1">AFS bundle · accountant-ready pack</h3>
          <p className="text-sm text-[#94a3b8] leading-relaxed">
            One branded PDF: cover · Income Statement · Balance Sheet · Cash Flow (indirect) · VAT 201 summary · 8 auto-generated notes (IFRS for SMEs baseline) · CA(SA)/SAIPA/SAICA sign-off block.
            Defaults to the current SA fiscal year (1 Mar → today).
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <Field label="From"><input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} data-testid="afs-from"/></Field>
          <Field label="To"><input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} data-testid="afs-to"/></Field>
          <PdfDownloadBtn
            path={`/accounting/reports/afs-bundle/pdf?date_from=${from}&date_to=${to}`}
            name={`AFS_${from}_to_${to}.pdf`}
            testid="afs-pdf"
          />
        </div>
      </div>
    </div>
  );
}

function Periods() {
  const [rows, setRows] = useState([]);
  const [signoff, setSignoff] = useState(null);
  const load = async () => { const { data } = await api.get("/accounting/periods"); setRows(data); };
  useEffect(() => { load(); }, []);

  const act = async (period, action) => {
    if (!window.confirm(`${action.toUpperCase()} period ${period}?`)) return;
    try { await api.post(`/accounting/periods/${period}/${action}`); toast.success(`${action} · ${period}`); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div>
      <AfsBundleCard/>
      <div className="card overflow-hidden">
        <table className="atable" data-testid="periods-table">
          <thead><tr><th>Period</th><th>Status</th><th>Closed</th><th>Locked</th><th>Signed off</th><th className="text-right">Actions</th></tr></thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.period} data-testid={`period-${p.period}`}>
                <td className="font-mono">{p.period}</td>
                <td><span className="chip" style={{color: p.status === "locked" ? "#ef4444" : p.status === "closed" ? "#e26e4a" : "#10b981"}}>{p.status}</span></td>
                <td className="text-xs text-[#94a3b8]">{p.closed_at ? new Date(p.closed_at).toLocaleDateString() : "—"}</td>
                <td className="text-xs text-[#94a3b8]">{p.locked_at ? new Date(p.locked_at).toLocaleDateString() : "—"}</td>
                <td className="text-xs text-[#94a3b8]">{p.signed_off_at ? new Date(p.signed_off_at).toLocaleDateString() : "—"}</td>
                <td className="text-right space-x-1">
                  {p.status === "open"   && <button className="btn btn-secondary text-xs" onClick={() => act(p.period, "close")}>Close</button>}
                  {p.status === "closed" && <button className="btn btn-secondary text-xs" onClick={() => act(p.period, "lock")}><Lock size={12}/> Lock</button>}
                  {p.status === "locked" && <button className="btn btn-ghost text-xs" onClick={() => act(p.period, "reopen")}><LockOpen size={12}/> Reopen</button>}
                  <button className="btn btn-primary text-xs" onClick={() => setSignoff(p)} data-testid={`signoff-${p.period}`}><CheckCircle size={12}/> Sign off</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SignoffModal period={signoff} onClose={() => setSignoff(null)} onSaved={load}/>
    </div>
  );
}

function SignoffModal({ period, onClose, onSaved }) {
  const [note, setNote] = useState("");
  useEffect(() => { setNote(""); }, [period]);
  const save = async () => {
    try { await api.post(`/accounting/periods/${period.period}/signoff`, { note }); toast.success("Signed off"); onSaved(); onClose(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  return (
    <Modal open={!!period} onClose={onClose} title={`Accountant Sign-off · ${period?.period || ""}`}>
      <p className="text-xs text-[#94a3b8] mb-3">Record an accountant-reviewed sign-off for this period. Does not lock the period — call Lock separately if you want to freeze it.</p>
      <Field label="Review note (visible in audit trail)">
        <textarea className="textarea" rows={4} value={note} onChange={e => setNote(e.target.value)} placeholder="Reviewed trial balance, VAT201, and income statement against supporting documents. Approved for filing." data-testid="signoff-note"/>
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} data-testid="signoff-confirm"><FileText size={14}/> Sign off</button>
      </div>
    </Modal>
  );
}

// ── Shared CSV download ------------------------------------------------------
function CsvDownloadBtn({ data, name }) {
  const download = () => {
    const csv = data.map(row => row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };
  return <button className="btn btn-secondary text-xs" onClick={download}><DownloadSimple size={12}/> CSV</button>;
}

// ── Shared PDF download (authenticated) --------------------------------------
function PdfDownloadBtn({ path, name, testid }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    try {
      setBusy(true);
      const res = await api.get(path, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success("PDF downloaded · check your Downloads folder");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "PDF export failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="btn btn-primary text-xs" onClick={download} disabled={busy} data-testid={testid}>
      <FileText size={12}/> {busy ? "Generating…" : "Download PDF"}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  Fixed Assets
// ══════════════════════════════════════════════════════════════════════════════
function FixedAssets() {
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0,7));
  const [schedule, setSchedule] = useState(null);
  const load = async () => { const { data } = await api.get("/accounting/fixed-assets"); setRows(data); };
  useEffect(() => { load(); }, []);

  const dispose = async (id) => {
    if (!window.confirm("Mark this asset as disposed? This stops future depreciation.")) return;
    try { await api.delete(`/accounting/fixed-assets/${id}`); toast.success("Asset disposed"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const depreciate = async () => {
    if (!window.confirm(`Post straight-line depreciation journals for period ${period}? This is idempotent.`)) return;
    try {
      const { data } = await api.post("/accounting/fixed-assets/depreciate", { period });
      toast.success(`Posted ${data.posted.length} journals · skipped ${data.skipped.length}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Depreciation failed"); }
  };
  const viewSchedule = async (id) => {
    const { data } = await api.get(`/accounting/fixed-assets/${id}`);
    setSchedule(data);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <button className="btn btn-primary" onClick={() => setShow(true)} data-testid="asset-new"><Plus size={14}/> New Asset</button>
        <div className="flex items-end gap-2 ml-auto">
          <Field label="Period (YYYY-MM)">
            <input className="input font-mono" value={period} onChange={e => setPeriod(e.target.value)} data-testid="depr-period"/>
          </Field>
          <button className="btn btn-secondary" onClick={depreciate} data-testid="depr-run"><ArrowClockwise size={14}/> Post Depreciation</button>
        </div>
      </div>
      <div className="card overflow-hidden">
        <table className="atable" data-testid="assets-table">
          <thead><tr><th>Name</th><th>Category</th><th>Acquired</th><th className="text-right">Cost</th><th className="text-right">Depr to date</th><th className="text-right">Book Value</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="text-center text-[#94a3b8] py-6">No assets yet. Add one to start tracking depreciation.</td></tr>}
            {rows.map(a => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td className="text-xs text-[#94a3b8]">{a.asset_category}</td>
                <td className="text-xs">{a.acquisition_date}</td>
                <td className="text-right font-mono">{ZAR(a.acquisition_cost)}</td>
                <td className="text-right font-mono text-[#94a3b8]">{ZAR(a.depreciation_to_date)}</td>
                <td className="text-right font-mono">{ZAR(a.book_value)}</td>
                <td><span className="chip" style={{color: a.status === "disposed" ? "#ef4444" : a.status === "fully-depreciated" ? "#94a3b8" : "#10b981"}}>{a.status}</span></td>
                <td className="text-right space-x-1">
                  <button className="btn btn-ghost text-xs" onClick={() => viewSchedule(a.id)} data-testid={`asset-schedule-${a.id}`}>Schedule</button>
                  {a.status === "active" && <button className="btn btn-ghost text-xs" onClick={() => dispose(a.id)} data-testid={`asset-dispose-${a.id}`}>Dispose</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NewAssetModal open={show} onClose={() => setShow(false)} onSaved={() => { setShow(false); load(); }}/>
      {schedule && <ScheduleModal schedule={schedule} onClose={() => setSchedule(null)}/>}
    </div>
  );
}

function NewAssetModal({ open, onClose, onSaved }) {
  const blank = {
    name: "", asset_category: "computers",
    acquisition_date: new Date().toISOString().slice(0,10),
    acquisition_cost: 0, residual_value: 0, useful_life_months: 36,
    depreciation_method: "straight_line",
    asset_account_code: "11100", accumulated_depr_account_code: "11110",
    depreciation_expense_account_code: "82500",
    serial_number: "", location: "",
  };
  const [f, setF] = useState(blank);
  useEffect(() => { if (open) setF(blank); /* eslint-disable-next-line */ }, [open]);
  const save = async () => {
    try {
      await api.post("/accounting/fixed-assets", { ...f, acquisition_cost: Number(f.acquisition_cost), residual_value: Number(f.residual_value), useful_life_months: Number(f.useful_life_months) });
      toast.success("Asset created"); onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  return (
    <Modal open={open} onClose={onClose} title="New Fixed Asset" wide>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><input className="input" value={f.name} onChange={e => setF({...f, name: e.target.value})} data-testid="asset-name"/></Field>
        <Field label="Category">
          <select className="input" value={f.asset_category} onChange={e => setF({...f, asset_category: e.target.value})}>
            <option value="computers">Computers</option><option value="equipment">Equipment</option>
            <option value="vehicles">Vehicles</option><option value="furniture">Furniture</option>
            <option value="buildings">Buildings</option><option value="software">Software</option>
          </select>
        </Field>
        <Field label="Acquisition date"><input type="date" className="input" value={f.acquisition_date} onChange={e => setF({...f, acquisition_date: e.target.value})}/></Field>
        <Field label="Acquisition cost (ZAR)"><input type="number" step="0.01" className="input" value={f.acquisition_cost} onChange={e => setF({...f, acquisition_cost: e.target.value})} data-testid="asset-cost"/></Field>
        <Field label="Residual value (ZAR)"><input type="number" step="0.01" className="input" value={f.residual_value} onChange={e => setF({...f, residual_value: e.target.value})}/></Field>
        <Field label="Useful life (months)"><input type="number" className="input" value={f.useful_life_months} onChange={e => setF({...f, useful_life_months: e.target.value})}/></Field>
        <Field label="Asset account code"><input className="input font-mono" value={f.asset_account_code} onChange={e => setF({...f, asset_account_code: e.target.value})}/></Field>
        <Field label="Accumulated depr code"><input className="input font-mono" value={f.accumulated_depr_account_code} onChange={e => setF({...f, accumulated_depr_account_code: e.target.value})}/></Field>
        <Field label="Depr expense code"><input className="input font-mono" value={f.depreciation_expense_account_code} onChange={e => setF({...f, depreciation_expense_account_code: e.target.value})}/></Field>
        <Field label="Serial number"><input className="input" value={f.serial_number} onChange={e => setF({...f, serial_number: e.target.value})}/></Field>
        <Field label="Location"><input className="input" value={f.location} onChange={e => setF({...f, location: e.target.value})}/></Field>
      </div>
      <p className="text-xs text-[#94a3b8] mt-3">Default codes match the SA Chart of Accounts for Computer Equipment (11100 / 11110 / 82500). Adjust for furniture (11200/11210) or other categories.</p>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} data-testid="asset-save">Save Asset</button>
      </div>
    </Modal>
  );
}

function ScheduleModal({ schedule, onClose }) {
  const { asset, monthly_depreciation, schedule: rows } = schedule;
  return (
    <Modal open={true} onClose={onClose} title={`Depreciation schedule — ${asset.name}`} wide>
      <p className="text-xs text-[#94a3b8] mb-3">Monthly: <span className="font-mono text-[#cdd6e0]">{ZAR(monthly_depreciation)}</span> · Useful life: {asset.useful_life_months} months · Method: {asset.depreciation_method.replace("_"," ")}</p>
      <div className="max-h-96 overflow-y-auto">
        <table className="atable" data-testid="schedule-table">
          <thead><tr><th>Month</th><th>Period</th><th className="text-right">Depr</th><th className="text-right">Accumulated</th><th className="text-right">Book Value</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.month}>
                <td className="font-mono">{r.month}</td>
                <td className="font-mono text-xs">{r.period}</td>
                <td className="text-right font-mono">{ZAR(r.depreciation)}</td>
                <td className="text-right font-mono text-[#94a3b8]">{ZAR(r.accumulated)}</td>
                <td className="text-right font-mono">{ZAR(r.book_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  Bank & Reconciliation
// ══════════════════════════════════════════════════════════════════════════════
function BankRecon() {
  const [banks, setBanks] = useState([]);
  const [activeBank, setActiveBank] = useState(null);
  const [txs, setTxs] = useState([]);
  const [filter, setFilter] = useState("unreconciled");
  const [showNewBank, setShowNewBank] = useState(false);
  const [reconTx, setReconTx] = useState(null);
  const loadBanks = async () => {
    const { data } = await api.get("/accounting/bank-accounts");
    setBanks(data); if (!activeBank && data.length) setActiveBank(data[0]);
  };
  const loadTxs = async () => {
    if (!activeBank) return;
    const { data } = await api.get(`/accounting/bank-accounts/${activeBank.id}/transactions${filter === "all" ? "" : "?status=" + filter}`);
    setTxs(data);
  };
  useEffect(() => { loadBanks(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadTxs(); /* eslint-disable-next-line */ }, [activeBank, filter]);

  const onUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      const { data } = await api.post(`/accounting/bank-accounts/${activeBank.id}/import-csv`, fd, { headers: { "Content-Type": "multipart/form-data" }});
      toast.success(`Imported ${data.inserted} · dupes ${data.skipped_duplicates}${data.errors?.length ? " · errors " + data.errors.length : ""}`);
      e.target.value = ""; loadTxs();
    } catch (err) { toast.error(err?.response?.data?.detail || "Import failed"); }
  };
  const unreconcile = async (tid) => {
    if (!window.confirm("Reverse the reconciliation journal and mark this transaction as unreconciled?")) return;
    try { await api.post(`/accounting/bank-transactions/${tid}/unreconcile`); toast.success("Unreconciled"); loadTxs(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  if (!banks.length) {
    return (
      <div className="card p-6 max-w-xl">
        <h3 className="font-head text-xl mb-2">No bank accounts yet</h3>
        <p className="text-sm text-[#94a3b8] mb-4">Add a bank account to import CSV statements and reconcile transactions to invoices or expenses.</p>
        <button className="btn btn-primary" onClick={() => setShowNewBank(true)} data-testid="bank-new"><Plus size={14}/> Add Bank Account</button>
        <NewBankModal open={showNewBank} onClose={() => setShowNewBank(false)} onSaved={() => { setShowNewBank(false); loadBanks(); }}/>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <select className="input" value={activeBank?.id || ""} onChange={e => setActiveBank(banks.find(b => b.id === e.target.value))} data-testid="bank-select">
          {banks.map(b => <option key={b.id} value={b.id}>{b.name} ({b.bank}) · GL {b.gl_account_code}</option>)}
        </select>
        <button className="btn btn-ghost text-xs" onClick={() => setShowNewBank(true)} data-testid="bank-new"><Plus size={12}/> Add</button>
        <label className="btn btn-secondary text-xs cursor-pointer" data-testid="bank-import-csv">
          <DownloadSimple size={12} style={{transform: "rotate(180deg)"}}/> Import CSV
          <input type="file" accept=".csv" className="hidden" onChange={onUpload}/>
        </label>
        <select className="input" value={filter} onChange={e => setFilter(e.target.value)} data-testid="bank-filter">
          <option value="unreconciled">Unreconciled</option>
          <option value="reconciled">Reconciled</option>
          <option value="all">All</option>
        </select>
      </div>
      <p className="text-xs text-[#94a3b8] mb-3">Expected CSV columns (case-insensitive): <code className="font-mono text-[#cdd6e0]">date, description, amount</code>. Positive amounts = money in, negative = money out. Optional: <code className="font-mono">balance</code>. Duplicates are skipped automatically.</p>
      <div className="card overflow-hidden">
        <table className="atable" data-testid="bank-tx-table">
          <thead><tr><th>Date</th><th>Description</th><th className="text-right">Amount</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
          <tbody>
            {txs.length === 0 && <tr><td colSpan={5} className="text-center text-[#94a3b8] py-6">No transactions in this view.</td></tr>}
            {txs.map(tx => (
              <tr key={tx.id}>
                <td className="font-mono text-xs">{tx.date}</td>
                <td className="max-w-md truncate" title={tx.description}>{tx.description}</td>
                <td className={`text-right font-mono ${tx.direction === "in" ? "text-[#10b981]" : "text-[#ef4444]"}`}>{ZAR(tx.amount)}</td>
                <td><span className="chip" style={{color: tx.status === "reconciled" ? "#10b981" : "#e26e4a"}}>{tx.status}</span></td>
                <td className="text-right">
                  {tx.status === "unreconciled" && <button className="btn btn-primary text-xs" onClick={() => setReconTx(tx)} data-testid={`recon-${tx.id}`}>Reconcile</button>}
                  {tx.status === "reconciled" && <button className="btn btn-ghost text-xs" onClick={() => unreconcile(tx.id)}>Unreconcile</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NewBankModal open={showNewBank} onClose={() => setShowNewBank(false)} onSaved={() => { setShowNewBank(false); loadBanks(); }}/>
      {reconTx && <ReconcileModal tx={reconTx} onClose={() => setReconTx(null)} onSaved={() => { setReconTx(null); loadTxs(); }}/>}
    </div>
  );
}

function NewBankModal({ open, onClose, onSaved }) {
  const [f, setF] = useState({ name: "", bank: "FNB", account_number: "", gl_account_code: "21000", currency: "ZAR" });
  useEffect(() => { if (open) setF({ name: "", bank: "FNB", account_number: "", gl_account_code: "21000", currency: "ZAR" }); }, [open]);
  const save = async () => {
    try { await api.post("/accounting/bank-accounts", f); toast.success("Bank account created"); onSaved(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  return (
    <Modal open={open} onClose={onClose} title="New Bank Account">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Display name"><input className="input" value={f.name} onChange={e => setF({...f, name: e.target.value})} data-testid="bank-name"/></Field>
        <Field label="Bank"><input className="input" value={f.bank} onChange={e => setF({...f, bank: e.target.value})}/></Field>
        <Field label="Account number"><input className="input" value={f.account_number} onChange={e => setF({...f, account_number: e.target.value})}/></Field>
        <Field label="GL account code"><input className="input font-mono" value={f.gl_account_code} onChange={e => setF({...f, gl_account_code: e.target.value})}/></Field>
        <Field label="Currency"><input className="input" value={f.currency} onChange={e => setF({...f, currency: e.target.value})}/></Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} data-testid="bank-save">Save</button>
      </div>
    </Modal>
  );
}

function ReconcileModal({ tx, onClose, onSaved }) {
  const [matchType, setMatchType] = useState(tx.direction === "in" ? "invoice" : "expense");
  const [suggestions, setSuggestions] = useState([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [expenseCode, setExpenseCode] = useState("81700");
  const [description, setDescription] = useState(tx.description);
  const [expenseAccounts, setExpenseAccounts] = useState([]);

  useEffect(() => {
    (async () => {
      if (tx.direction === "in") {
        const { data } = await api.get(`/accounting/bank-transactions/${tx.id}/suggest-matches`);
        setSuggestions(data.suggestions || []);
        if (data.suggestions?.length) setInvoiceId(data.suggestions[0].id);
      }
      const { data: accts } = await api.get("/accounting/accounts");
      setExpenseAccounts(accts.filter(a => a.type === "expense" && !a.is_header));
    })();
  }, [tx.id, tx.direction]);

  const submit = async () => {
    try {
      const body = matchType === "invoice"
        ? { match_type: "invoice", invoice_id: invoiceId }
        : { match_type: "expense", expense_account_code: expenseCode, description };
      await api.post(`/accounting/bank-transactions/${tx.id}/reconcile`, body);
      toast.success("Reconciled · journal posted");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Reconcile failed"); }
  };

  return (
    <Modal open={true} onClose={onClose} title={`Reconcile · ${ZAR(tx.amount)}`}>
      <p className="text-xs text-[#94a3b8] mb-3">{tx.date} — {tx.description}</p>
      <div className="flex gap-2 mb-3">
        <button className={`btn text-xs ${matchType === "invoice" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMatchType("invoice")} disabled={tx.direction !== "in"}>Invoice payment</button>
        <button className={`btn text-xs ${matchType === "expense" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMatchType("expense")} disabled={tx.direction !== "out"}>Expense</button>
      </div>
      {matchType === "invoice" && (
        <Field label="Matching invoice">
          <select className="input" value={invoiceId} onChange={e => setInvoiceId(e.target.value)} data-testid="recon-invoice">
            <option value="">— Select invoice —</option>
            {suggestions.map(s => <option key={s.id} value={s.id}>{s.label} · confidence {Math.round(s.confidence * 100)}%</option>)}
          </select>
          {!suggestions.length && <p className="text-xs text-[#94a3b8] mt-1">No unpaid invoices match this amount within 5%. Create/send the invoice first, then reconcile.</p>}
        </Field>
      )}
      {matchType === "expense" && (
        <>
          <Field label="Expense account">
            <select className="input" value={expenseCode} onChange={e => setExpenseCode(e.target.value)} data-testid="recon-expense">
              {expenseAccounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
            </select>
          </Field>
          <Field label="Description">
            <input className="input" value={description} onChange={e => setDescription(e.target.value)}/>
          </Field>
        </>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} data-testid="recon-confirm" disabled={matchType === "invoice" && !invoiceId}>Post Journal</button>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  Receipts (OCR via Gemini vision)
// ══════════════════════════════════════════════════════════════════════════════
function Receipts() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [postRcp, setPostRcp] = useState(null);
  const load = async () => { const { data } = await api.get("/accounting/receipts"); setRows(data); };
  useEffect(() => { load(); }, []);

  const onUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      setBusy(true);
      await api.post("/accounting/receipts/scan", fd, { headers: { "Content-Type": "multipart/form-data" }});
      toast.success("Receipt scanned — review and post");
      e.target.value = ""; load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Scan failed"); }
    finally { setBusy(false); }
  };
  const remove = async (rid) => {
    if (!window.confirm("Delete this scanned receipt?")) return;
    try { await api.delete(`/accounting/receipts/${rid}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <label className="btn btn-primary cursor-pointer" data-testid="receipt-upload">
          <Plus size={14}/> {busy ? "Scanning…" : "Upload Receipt"}
          <input type="file" accept=".jpg,.jpeg,.png,.pdf,.webp,.heic" className="hidden" onChange={onUpload} disabled={busy}/>
        </label>
        <p className="text-xs text-[#94a3b8]">Upload a photo or PDF of a receipt/invoice. Gemini 3 vision will extract vendor, date, subtotal, VAT and total. Review the extracted data and confirm before posting an expense journal.</p>
      </div>
      <div className="card overflow-hidden">
        <table className="atable" data-testid="receipts-table">
          <thead><tr><th>File</th><th>Vendor</th><th>Date</th><th className="text-right">Total</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-[#94a3b8] py-6">No receipts yet.</td></tr>}
            {rows.map(r => {
              const ex = r.extracted || {};
              return (
                <tr key={r.id}>
                  <td className="text-xs">{r.filename}</td>
                  <td>{ex.vendor || "—"}</td>
                  <td className="font-mono text-xs">{ex.date || "—"}</td>
                  <td className="text-right font-mono">{ex.total ? ZAR(ex.total) : "—"}</td>
                  <td><span className="chip" style={{color: r.status === "posted" ? "#10b981" : "#e26e4a"}}>{r.status}</span></td>
                  <td className="text-right space-x-1">
                    {r.status === "pending_review" && <button className="btn btn-primary text-xs" onClick={() => setPostRcp(r)} data-testid={`receipt-post-${r.id}`}>Post</button>}
                    {r.status !== "posted" && <button className="btn btn-ghost text-xs" onClick={() => remove(r.id)}>Delete</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {postRcp && <PostReceiptModal receipt={postRcp} onClose={() => setPostRcp(null)} onSaved={() => { setPostRcp(null); load(); }}/>}
    </div>
  );
}

function PostReceiptModal({ receipt, onClose, onSaved }) {
  const ex = receipt.extracted || {};
  const [f, setF] = useState({
    vendor: ex.vendor || "",
    date: ex.date || new Date().toISOString().slice(0,10),
    subtotal: ex.subtotal || 0,
    vat: ex.vat || 0,
    total: ex.total || 0,
    expense_account_code: "81100",
    vat_code: "SI",
    payment_account_code: "51000",
  });
  const [expenseAccounts, setExpenseAccounts] = useState([]);
  useEffect(() => {
    (async () => {
      const { data } = await api.get("/accounting/accounts");
      setExpenseAccounts(data.filter(a => a.type === "expense" && !a.is_header));
    })();
  }, []);
  const save = async () => {
    try {
      await api.post(`/accounting/receipts/${receipt.id}/post`, {
        ...f,
        subtotal: Number(f.subtotal), vat: Number(f.vat), total: Number(f.total),
      });
      toast.success("Posted as expense journal");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  return (
    <Modal open={true} onClose={onClose} title={`Post Receipt — ${ex.vendor || receipt.filename}`} wide>
      <p className="text-xs text-[#94a3b8] mb-3">Review the AI-extracted fields. Subtotal + VAT must equal Total. Choose the correct expense category before posting.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vendor"><input className="input" value={f.vendor} onChange={e => setF({...f, vendor: e.target.value})} data-testid="rcp-vendor"/></Field>
        <Field label="Date"><input type="date" className="input" value={f.date} onChange={e => setF({...f, date: e.target.value})}/></Field>
        <Field label="Subtotal (ZAR)"><input type="number" step="0.01" className="input" value={f.subtotal} onChange={e => setF({...f, subtotal: e.target.value})}/></Field>
        <Field label="VAT (ZAR)"><input type="number" step="0.01" className="input" value={f.vat} onChange={e => setF({...f, vat: e.target.value})}/></Field>
        <Field label="Total (ZAR)"><input type="number" step="0.01" className="input" value={f.total} onChange={e => setF({...f, total: e.target.value})} data-testid="rcp-total"/></Field>
        <Field label="VAT code">
          <select className="input" value={f.vat_code} onChange={e => setF({...f, vat_code: e.target.value})}>
            <option value="SI">SI — Standard input 15%</option>
            <option value="CI">CI — Capital input 15%</option>
            <option value="Z">Z — Zero-rated</option>
            <option value="E">E — Exempt</option>
            <option value="NV">NV — Non-vatable</option>
          </select>
        </Field>
        <Field label="Expense account">
          <select className="input" value={f.expense_account_code} onChange={e => setF({...f, expense_account_code: e.target.value})} data-testid="rcp-expense">
            {expenseAccounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
          </select>
        </Field>
        <Field label="Payment / counter account">
          <select className="input" value={f.payment_account_code} onChange={e => setF({...f, payment_account_code: e.target.value})}>
            <option value="51000">51000 — Trade Creditors</option>
            <option value="21000">21000 — Bank (FNB)</option>
            <option value="21200">21200 — Petty Cash</option>
          </select>
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} data-testid="rcp-post">Post Journal</button>
      </div>
    </Modal>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
//  Phase 2 Batch D — Payroll & Tax (Employees · EMP201 · IRP6 · Dividends Tax)
// ══════════════════════════════════════════════════════════════════════════════
function PayrollAndTax() {
  const [sub, setSub] = useState("employees");
  const SUBTABS = [
    { k: "employees",  l: "Employees" },
    { k: "emp201",     l: "EMP201 (PAYE/UIF/SDL)" },
    { k: "irp6",       l: "IRP6 Provisional Tax" },
    { k: "dividends",  l: "Dividends Tax" },
  ];
  return (
    <div>
      <div className="flex gap-1 border-b border-[#283341] mb-4" data-testid="payroll-subtabs">
        {SUBTABS.map(t => (
          <button
            key={t.k}
            role="tab"
            className={`px-3 py-2 text-xs ${sub === t.k ? "text-[#e26e4a] border-b-2 border-[#e26e4a]" : "text-[#94a3b8] hover:text-[#cdd6e0]"}`}
            onClick={() => setSub(t.k)}
            data-testid={`payroll-sub-${t.k}`}
          >{t.l}</button>
        ))}
      </div>
      {sub === "employees" && <EmployeesRegister/>}
      {sub === "emp201"    && <Emp201Panel/>}
      {sub === "irp6"      && <Irp6Panel/>}
      {sub === "dividends" && <DividendsPanel/>}
    </div>
  );
}

function EmployeesRegister() {
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const emptyForm = {
    name: "", monthly_gross: "", role: "", tax_status: "standard",
    date_of_birth: "", medical_aid_members: 0, retirement_monthly: "",
  };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    const { data } = await api.get("/accounting/employees?active_only=false");
    setRows(data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post("/accounting/employees", {
        ...form,
        monthly_gross: parseFloat(form.monthly_gross || 0),
        medical_aid_members: parseInt(form.medical_aid_members || 0),
        retirement_monthly: parseFloat(form.retirement_monthly || 0),
        date_of_birth: form.date_of_birth || null,
      });
      toast.success("Employee added");
      setShow(false); setForm(emptyForm);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const terminate = async (id) => {
    if (!window.confirm("Terminate this employee?")) return;
    try { await api.delete(`/accounting/employees/${id}`); toast.success("Terminated"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-[#94a3b8]">Register of employees used for EMP201 payroll tax computation. Monthly gross is the base before PAYE/UIF deductions. Optional fields (DOB, medical aid, retirement) refine PAYE per SARS 2025/26.</p>
        <button className="btn btn-primary" onClick={() => setShow(true)} data-testid="emp-new"><Plus size={14}/> New Employee</button>
      </div>
      <div className="card overflow-hidden">
        <table className="atable" data-testid="employees-table">
          <thead><tr><th>Name</th><th>Role</th><th>Monthly Gross</th><th>Tax status</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-[#94a3b8] py-6">No employees yet — click <b>New Employee</b> to add one.</td></tr>
            )}
            {rows.map(e => (
              <tr key={e.id} data-testid={`emp-row-${e.id}`}>
                <td className="font-semibold">{e.name}</td>
                <td className="text-sm text-[#94a3b8]">{e.role || "—"}</td>
                <td className="font-mono">{ZAR(e.monthly_gross)}</td>
                <td className="text-xs">{e.tax_status}</td>
                <td><span className="chip" style={{color: e.active ? "#10b981" : "#94a3b8"}}>{e.active ? "active" : "terminated"}</span></td>
                <td className="text-right">
                  {e.active && <button className="btn btn-ghost text-xs" onClick={() => terminate(e.id)} data-testid={`emp-term-${e.id}`}>Terminate</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={show} onClose={() => setShow(false)} title="New Employee">
        <Field label="Name"><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="emp-name"/></Field>
        <Field label="Role / Title"><input className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}/></Field>
        <Field label="Monthly Gross (ZAR)"><input type="number" className="input" value={form.monthly_gross} onChange={e => setForm({ ...form, monthly_gross: e.target.value })} data-testid="emp-gross"/></Field>
        <Field label="Tax status">
          <select className="input" value={form.tax_status} onChange={e => setForm({ ...form, tax_status: e.target.value })}>
            <option value="standard">Standard SA resident</option>
            <option value="director">Director</option>
            <option value="non_resident">Non-resident (15% WHT)</option>
          </select>
        </Field>
        <Field label="Date of birth (for 65+/75+ rebates — optional)">
          <input type="date" className="input" value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} data-testid="emp-dob"/>
        </Field>
        <Field label="Medical-aid members (0 = none, 1 = main only, 2+ = main + deps)">
          <input type="number" min="0" className="input" value={form.medical_aid_members} onChange={e => setForm({ ...form, medical_aid_members: e.target.value })} data-testid="emp-medical"/>
        </Field>
        <Field label="Retirement / pension contribution per month (ZAR — optional)">
          <input type="number" className="input" value={form.retirement_monthly} onChange={e => setForm({ ...form, retirement_monthly: e.target.value })} data-testid="emp-ra"/>
        </Field>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn btn-secondary" onClick={() => setShow(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} data-testid="emp-save">Save</button>
        </div>
      </Modal>
    </div>
  );
}

function Emp201Panel() {
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`);
  const [data, setData] = useState(null);
  const [posting, setPosting] = useState(null);   // existing posting record (if any)
  const [busy, setBusy] = useState(false);

  const run = async () => {
    try {
      const r = await api.get(`/accounting/reports/emp201?period=${period}`);
      setData(r.data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    // Load posting state for this period (404 = not posted — not an error)
    try {
      const p = await api.get(`/accounting/reports/emp201/${period}/posting`);
      setPosting(p.data);
    } catch { setPosting(null); }
  };
  useEffect(() => { run(); }, []); // eslint-disable-line

  const postToGl = async () => {
    if (!window.confirm(`Post EMP201 ${period} to the General Ledger? This creates a journal entry: DR Salaries/SDL/UIF-er, CR PAYE/UIF/SDL/Bank.`)) return;
    setBusy(true);
    try {
      const r = await api.post(`/accounting/reports/emp201/${period}/post`);
      toast.success(`Posted. Journal ${r.data.journal_id.slice(0, 8)}…`);
      await run();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };

  const reverse = async () => {
    if (!window.confirm(`Reverse the EMP201 ${period} journal? This creates a reversing entry and unlocks the period for re-posting.`)) return;
    setBusy(true);
    try {
      await api.delete(`/accounting/reports/emp201/${period}/post`);
      toast.success("Reversed");
      await run();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };

  const isPosted = posting && !posting.reversed_at;

  return (
    <div>
      <div className="flex items-end gap-3 mb-3 flex-wrap">
        <Field label="Period (YYYY-MM)">
          <input type="text" className="input" value={period} onChange={e => setPeriod(e.target.value)} placeholder="2026-04" data-testid="emp201-period"/>
        </Field>
        <button className="btn btn-primary" onClick={run} data-testid="emp201-run"><Calculator size={14}/> Run</button>
        {data && data.employees && data.employees.length > 0 && !isPosted && (
          <button className="btn btn-secondary" onClick={postToGl} disabled={busy} data-testid="emp201-post">
            Post to GL
          </button>
        )}
        {isPosted && (
          <button className="btn btn-ghost" onClick={reverse} disabled={busy} data-testid="emp201-reverse">
            Reverse journal
          </button>
        )}
      </div>
      {isPosted && (
        <div className="card p-3 mb-3" style={{ borderLeft: "3px solid #10b981" }} data-testid="emp201-posted-banner">
          <div className="text-sm">
            <b style={{ color: "#10b981" }}>Finalised.</b> Posted to GL on {new Date(posting.posted_at).toLocaleString()}.
            Journal ID: <code className="text-xs">{posting.journal_id}</code>
          </div>
        </div>
      )}
      {data && (
        <div className="card p-5" data-testid="emp201-card">
          <h3 className="font-head text-lg font-semibold mb-3">EMP201 · {data.period}</h3>
          <table className="atable mb-4">
            <thead><tr><th>Employee</th><th>Gross</th><th>PAYE</th><th>UIF (emp)</th><th>UIF (er)</th><th>SDL</th><th>Net pay</th></tr></thead>
            <tbody>
              {data.employees.map(e => (
                <tr key={e.employee_id}>
                  <td>{e.name}</td>
                  <td className="font-mono">{ZAR(e.monthly_gross)}</td>
                  <td className="font-mono">{ZAR(e.paye)}</td>
                  <td className="font-mono">{ZAR(e.uif_employee)}</td>
                  <td className="font-mono">{ZAR(e.uif_employer)}</td>
                  <td className="font-mono">{ZAR(e.sdl)}</td>
                  <td className="font-mono">{ZAR(e.net_pay)}</td>
                </tr>
              ))}
              {data.employees.length === 0 && (
                <tr><td colSpan={7} className="text-center text-[#94a3b8] py-4">No active employees.</td></tr>
              )}
            </tbody>
          </table>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><div className="label-caps">PAYE</div><div className="font-mono font-semibold">{ZAR(data.totals.paye)}</div></div>
            <div><div className="label-caps">UIF (total)</div><div className="font-mono font-semibold">{ZAR(data.totals.uif_total)}</div></div>
            <div><div className="label-caps">SDL</div><div className="font-mono font-semibold">{ZAR(data.totals.sdl)}</div></div>
            <div><div className="label-caps text-[#e26e4a]">EMP201 due to SARS</div><div className="font-mono font-semibold text-[#e26e4a]" data-testid="emp201-payable">{ZAR(data.totals.emp201_payable_to_sars)}</div></div>
          </div>
          <p className="text-xs text-[#94a3b8] mt-4">{data.disclaimer}</p>
        </div>
      )}
    </div>
  );
}

function Irp6Panel() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ tax_year: new Date().getFullYear(), period: 1, estimated_taxable_income: "", provisional_payment_prior: "0" });
  const load = async () => { const { data } = await api.get("/accounting/reports/irp6"); setRows(data); };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      const r = await api.post("/accounting/reports/irp6", {
        tax_year: parseInt(form.tax_year),
        period: parseInt(form.period),
        estimated_taxable_income: parseFloat(form.estimated_taxable_income || 0),
        provisional_payment_prior: parseFloat(form.provisional_payment_prior || 0),
      });
      toast.success(`IRP6 ${r.data.period} · Payable ${ZAR(r.data.provisional_tax_payable)}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="font-head text-lg font-semibold mb-3">New IRP6 workpaper</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Tax year (Feb end)"><input type="number" className="input" value={form.tax_year} onChange={e => setForm({ ...form, tax_year: e.target.value })} data-testid="irp6-year"/></Field>
          <Field label="Period">
            <select className="input" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} data-testid="irp6-period">
              <option value={1}>1 · Aug (half-year)</option>
              <option value={2}>2 · Feb (year-end)</option>
            </select>
          </Field>
          <Field label="Estimated taxable income"><input type="number" className="input" value={form.estimated_taxable_income} onChange={e => setForm({ ...form, estimated_taxable_income: e.target.value })} data-testid="irp6-income"/></Field>
          <Field label="Prior provisional payments"><input type="number" className="input" value={form.provisional_payment_prior} onChange={e => setForm({ ...form, provisional_payment_prior: e.target.value })}/></Field>
        </div>
        <button className="btn btn-primary mt-3" onClick={submit} data-testid="irp6-submit"><Calculator size={14}/> Compute IRP6</button>
      </div>
      <div className="card overflow-hidden">
        <table className="atable" data-testid="irp6-table">
          <thead><tr><th>Tax year</th><th>Period</th><th>Estimated income</th><th>Tax @ 27%</th><th>Prior paid</th><th>Payable</th><th>Due by</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="text-center text-[#94a3b8] py-4">No IRP6 workpapers yet.</td></tr>}
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.tax_year}</td>
                <td>{r.period === 1 ? "1 (Aug)" : "2 (Feb)"}</td>
                <td className="font-mono">{ZAR(r.estimated_taxable_income)}</td>
                <td className="font-mono">{ZAR(r.tax_at_27pct)}</td>
                <td className="font-mono">{ZAR(r.prior_payment)}</td>
                <td className="font-mono font-semibold text-[#e26e4a]">{ZAR(r.provisional_payable)}</td>
                <td className="text-xs">{r.due_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DividendsPanel() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({
    beneficiary_name: "", beneficiary_type: "sa_resident_individual",
    declaration_date: new Date().toISOString().slice(0,10),
    gross_dividend: "", beneficiary_tax_number: "",
  });
  const load = async () => { const { data } = await api.get("/accounting/reports/dividends-tax"); setRows(data); };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      await api.post("/accounting/reports/dividends-tax", {
        ...form,
        gross_dividend: parseFloat(form.gross_dividend || 0),
      });
      toast.success("Dividend declared");
      setForm({ ...form, beneficiary_name: "", gross_dividend: "", beneficiary_tax_number: "" });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="font-head text-lg font-semibold mb-3">Declare a dividend</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Beneficiary name"><input className="input" value={form.beneficiary_name} onChange={e => setForm({ ...form, beneficiary_name: e.target.value })} data-testid="div-name"/></Field>
          <Field label="Beneficiary type">
            <select className="input" value={form.beneficiary_type} onChange={e => setForm({ ...form, beneficiary_type: e.target.value })} data-testid="div-type">
              <option value="sa_resident_individual">SA resident individual (20% WHT)</option>
              <option value="company">SA resident company (exempt)</option>
              <option value="non_resident">Non-resident (20% WHT, DTA may apply)</option>
            </select>
          </Field>
          <Field label="Declaration date"><input type="date" className="input" value={form.declaration_date} onChange={e => setForm({ ...form, declaration_date: e.target.value })}/></Field>
          <Field label="Gross dividend (ZAR)"><input type="number" className="input" value={form.gross_dividend} onChange={e => setForm({ ...form, gross_dividend: e.target.value })} data-testid="div-gross"/></Field>
          <Field label="Beneficiary tax number (optional)"><input className="input" value={form.beneficiary_tax_number} onChange={e => setForm({ ...form, beneficiary_tax_number: e.target.value })}/></Field>
        </div>
        <button className="btn btn-primary mt-3" onClick={submit} data-testid="div-submit"><Plus size={14}/> Declare</button>
      </div>
      <div className="card overflow-hidden">
        <table className="atable" data-testid="dividends-table">
          <thead><tr><th>Date</th><th>Beneficiary</th><th>Type</th><th>Gross</th><th>WHT (20%)</th><th>Net paid</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-[#94a3b8] py-4">No dividends declared.</td></tr>}
            {rows.map(r => (
              <tr key={r.id}>
                <td className="font-mono text-xs">{r.declaration_date}</td>
                <td>{r.beneficiary_name}</td>
                <td className="text-xs">{r.beneficiary_type.replace(/_/g, " ")}</td>
                <td className="font-mono">{ZAR(r.gross_dividend)}</td>
                <td className="font-mono">{ZAR(r.dividends_tax_withheld)}</td>
                <td className="font-mono">{ZAR(r.net_dividend_paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[#94a3b8]">Submit the DTR01 return to SARS by the end of the month following declaration. SA resident companies are generally exempt under section 64F. Non-resident rates may be reduced by DTA.</p>
    </div>
  );
}
