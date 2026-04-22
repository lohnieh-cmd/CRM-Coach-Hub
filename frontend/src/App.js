import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, Link } from "react-router-dom";
import { Toaster } from "sonner";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Pipeline from "@/pages/Pipeline";
import Contacts from "@/pages/Contacts";
import Companies from "@/pages/Companies";
import Products from "@/pages/Products";
import Quotes from "@/pages/Quotes";
import Invoices from "@/pages/Invoices";
import LeadForms from "@/pages/LeadForms";
import PublicForm from "@/pages/PublicForm";
import AIStudio from "@/pages/AIStudio";
import Automations from "@/pages/Automations";
import Subscriptions from "@/pages/Subscriptions";
import SEOTools from "@/pages/SEOTools";
import Tasks from "@/pages/Tasks";
import ContactDetail from "@/pages/ContactDetail";
import TeamSettings from "@/pages/TeamSettings";
import AcceptInvite from "@/pages/AcceptInvite";
import EmailSync from "@/pages/EmailSync";
import Analytics from "@/pages/Analytics";
import Templates from "@/pages/Templates";
import Integrations from "@/pages/Integrations";
import GDPRCenter from "@/pages/GDPRCenter";
import Accounting from "@/pages/Accounting";
import Layout from "@/components/Layout";
import { api } from "@/api";

function RequireAuth({ children }) {
  const token = localStorage.getItem("ascent_token");
  const location = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "#161d26",
            border: "1px solid #283341",
            color: "#f8fafc",
            fontFamily: "Manrope",
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/f/:slug" element={<PublicForm />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="contacts/:id" element={<ContactDetail />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="companies" element={<Companies />} />
          <Route path="products" element={<Products />} />
          <Route path="quotes" element={<Quotes />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="invoices/:id" element={<Invoices />} />
          <Route path="forms" element={<LeadForms />} />
          <Route path="ai-studio" element={<AIStudio />} />
          <Route path="automations" element={<Automations />} />
          <Route path="subscriptions" element={<Subscriptions />} />
          <Route path="seo" element={<SEOTools />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="accounting" element={<Accounting />} />
          <Route path="templates" element={<Templates />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="team" element={<TeamSettings />} />
          <Route path="email-sync" element={<EmailSync />} />
          <Route path="gdpr" element={<GDPRCenter />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
