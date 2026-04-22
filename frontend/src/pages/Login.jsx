import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api";
import { Mountains } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("demo@climbleadershiplab.com");
  const [password, setPassword] = useState("SherpaDemo2026!");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/signup";
      const payload = mode === "login" ? { email, password } : { email, password, name };
      const { data } = await api.post(path, payload);
      localStorage.setItem("ascent_token", data.token);
      localStorage.setItem("ascent_user", JSON.stringify(data.user));
      toast.success(`Welcome, ${data.user.name || "climber"}`);
      nav("/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex topo-bg" data-testid="login-page">
      <div className="flex-1 hidden lg:flex items-center justify-center relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1705873339772-605ce4d98e99?crop=entropy&cs=srgb&fm=jpg&q=85"
          alt="Mountain sunrise"
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0b0f15]/60 via-[#0b0f15]/40 to-[#0b0f15]" />
        <div className="relative z-10 max-w-lg px-12">
          <Mountains size={56} weight="duotone" color="#e26e4a" />
          <h1 className="font-head text-5xl font-bold tracking-tight mt-6 gradient-heading">
            Stop managing the plateau.
            <br />
            Start leading the ascent.
          </h1>
          <p className="text-[#94a3b8] mt-4 text-lg leading-relaxed">
            Ascent CRM — the companion platform for CLiMB Leadership Lab. Own your client journey
            from Basecamp to Summit.
          </p>
        </div>
      </div>

      <div className="w-full lg:w-[480px] flex items-center justify-center p-8 border-l border-[#283341]">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-6 flex items-center gap-2">
            <Mountains size={32} weight="duotone" color="#e26e4a" />
            <span className="font-head text-xl font-bold">Ascent CRM</span>
          </div>
          <div className="label-caps mb-2">{mode === "login" ? "Sign in" : "Create account"}</div>
          <h2 className="font-head text-3xl font-semibold mb-6">
            {mode === "login" ? "Welcome back, Sherpa." : "Begin your ascent."}
          </h2>

          <form onSubmit={submit} className="space-y-4" data-testid="auth-form">
            {mode === "signup" && (
              <div>
                <div className="label-caps mb-2">Name</div>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  data-testid="signup-name"
                />
              </div>
            )}
            <div>
              <div className="label-caps mb-2">Email</div>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="auth-email"
              />
            </div>
            <div>
              <div className="label-caps mb-2">Password</div>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="auth-password"
              />
            </div>
            <button type="submit" className="btn btn-primary w-full justify-center" disabled={loading} data-testid="auth-submit">
              {loading ? "..." : mode === "login" ? "Begin the ascent" : "Create & begin"}
            </button>
          </form>

          <div className="text-xs text-[#94a3b8] mt-6">
            {mode === "login" ? (
              <>
                No account?{" "}
                <button className="text-[#e26e4a] hover:underline" onClick={() => setMode("signup")} data-testid="switch-to-signup">
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have one?{" "}
                <button className="text-[#e26e4a] hover:underline" onClick={() => setMode("login")} data-testid="switch-to-login">
                  Sign in
                </button>
              </>
            )}
          </div>

          <div className="mt-8 p-3 card bg-[#0b0f15]" data-testid="demo-creds">
            <div className="label-caps mb-1">Demo credentials</div>
            <div className="text-xs text-[#94a3b8]">
              <div>demo@climbleadershiplab.com</div>
              <div>SherpaDemo2026!</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
