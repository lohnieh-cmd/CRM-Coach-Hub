import React from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  HouseLine,
  Kanban,
  Users,
  Buildings,
  Package,
  FileText,
  Receipt,
  Storefront,
  Sparkle,
  Lightning,
  ChartBar,
  Stack,
  PlugsConnected,
  ShieldCheck,
  SignOut,
  Mountains,
  ArrowsClockwise,
  MagnifyingGlass,
  CheckSquare,
  UsersFour,
  Calculator,
  EnvelopeSimple
} from "@phosphor-icons/react";

const NAV = [
  { to: "/", label: "Dashboard", icon: HouseLine, end: true, testid: "nav-dashboard" },
  { to: "/pipeline", label: "Pipeline", icon: Kanban, testid: "nav-pipeline" },
  { to: "/contacts", label: "Contacts", icon: Users, testid: "nav-contacts" },
  { to: "/companies", label: "Companies", icon: Buildings, testid: "nav-companies" },
  { to: "/tasks", label: "Tasks", icon: CheckSquare, testid: "nav-tasks" },
  { to: "/products", label: "Price List", icon: Package, testid: "nav-products" },
  { to: "/quotes", label: "Quotes", icon: FileText, testid: "nav-quotes" },
  { to: "/invoices", label: "Invoices", icon: Receipt, testid: "nav-invoices" },
  { to: "/subscriptions", label: "Recurring", icon: ArrowsClockwise, testid: "nav-subscriptions" },
  { to: "/forms", label: "Lead Forms", icon: Storefront, testid: "nav-forms" },
  { to: "/email-sync", label: "Email Sync", icon: EnvelopeSimple, testid: "nav-email-sync" },
  { to: "/ai-studio", label: "AI Studio", icon: Sparkle, testid: "nav-ai-studio" },
  { to: "/automations", label: "Automations", icon: Lightning, testid: "nav-automations" },
  { to: "/seo", label: "SEO Tools", icon: MagnifyingGlass, testid: "nav-seo" },
  { to: "/analytics", label: "Analytics", icon: ChartBar, testid: "nav-analytics" },
  { to: "/accounting", label: "Accounting", icon: Calculator, testid: "nav-accounting" },
  { to: "/templates", label: "Templates", icon: Stack, testid: "nav-templates" },
  { to: "/integrations", label: "Integrations", icon: PlugsConnected, testid: "nav-integrations" },
  { to: "/team", label: "Team & Access", icon: UsersFour, testid: "nav-team" },
  { to: "/gdpr", label: "GDPR Center", icon: ShieldCheck, testid: "nav-gdpr" },
];

export default function Layout() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("ascent_user") || "{}");

  const logout = () => {
    localStorage.removeItem("ascent_token");
    localStorage.removeItem("ascent_user");
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-[#0b0f15]">
      {/* Sidebar */}
      <aside
        className="w-56 shrink-0 border-r border-[#283341] bg-[#0b0f15] h-screen sticky top-0 flex flex-col"
        data-testid="sidebar"
      >
        <div className="px-5 py-5 flex items-center gap-2 border-b border-[#283341]">
          <Mountains size={26} weight="duotone" color="#e26e4a" />
          <div>
            <div className="font-head font-bold text-base leading-none">Ascent CRM</div>
            <div className="label-caps mt-1">Reach the summit</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end, testid }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-testid={testid}
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              <Icon size={18} weight="duotone" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-3 pb-3 pt-2 border-t border-[#283341]">
          <div className="px-2 py-3 text-xs text-[#94a3b8]">
            <div className="label-caps mb-2">Elevation Status</div>
            <div className="flex items-center justify-between">
              <span className="text-[#f8fafc] text-sm truncate">{user?.name || "—"}</span>
              <div className="elev" title="Engagement level">
                <span className="on"></span>
                <span className="on"></span>
                <span className="on"></span>
                <span></span>
                <span></span>
              </div>
            </div>
            <div className="text-[11px] text-[#94a3b8] truncate">{user?.email}</div>
          </div>
          <button
            onClick={logout}
            className="nav-link w-full justify-start"
            data-testid="logout-btn"
          >
            <SignOut size={18} weight="duotone" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
