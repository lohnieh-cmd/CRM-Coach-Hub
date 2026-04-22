import React from "react";

export function PageHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <div
      className="sticky top-0 z-10 backdrop-blur-xl bg-[#0b0f15]/70 border-b border-[#283341] px-8 py-5 flex items-center justify-between"
      data-testid="page-header"
    >
      <div className="flex items-center gap-3">
        {Icon && <Icon size={24} weight="duotone" color="#e26e4a" />}
        <div>
          <h1 className="font-head text-2xl font-semibold tracking-tight text-white">{title}</h1>
          {subtitle && <p className="text-sm text-[#94a3b8] mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

export function KPI({ label, value, hint, testid }) {
  return (
    <div className="card p-5" data-testid={testid}>
      <div className="label-caps">{label}</div>
      <div className="font-head text-3xl font-semibold mt-2 text-white">{value}</div>
      {hint && <div className="text-xs text-[#94a3b8] mt-1">{hint}</div>}
    </div>
  );
}

export function Altitude({ label }) {
  const kind = (() => {
    const l = (label || "").toLowerCase();
    if (l.includes("won")) return "won";
    if (l.includes("lost")) return "lost";
    if (l.includes("summit")) return "summit";
    if (l.includes("ascent")) return "ascent";
    return "basecamp";
  })();
  return (
    <span className={`altitude ${kind}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

export function Empty({ title, subtitle, cta, icon: Icon }) {
  return (
    <div className="card topo-card p-10 text-center flex flex-col items-center gap-3">
      {Icon && <Icon size={48} weight="duotone" color="#e26e4a" />}
      <h3 className="font-head text-xl font-semibold">{title}</h3>
      <p className="text-sm text-[#94a3b8] max-w-md">{subtitle}</p>
      {cta}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="modal-overlay"
    >
      <div
        className={`card ${wide ? "max-w-3xl" : "max-w-lg"} w-full max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
        data-testid="modal-dialog"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#283341]">
          <h3 className="font-head text-lg font-semibold">{title}</h3>
          <button className="btn btn-ghost" onClick={onClose} data-testid="modal-close">
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <div className="label-caps mb-2">{label}</div>
      {children}
      {hint && <div className="text-xs text-[#94a3b8] mt-1">{hint}</div>}
    </label>
  );
}

export function fmtMoney(n, cur = "USD") {
  if (n === undefined || n === null || isNaN(n)) return `${cur} 0`;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(n);
  } catch {
    return `${cur} ${Number(n).toLocaleString()}`;
  }
}
