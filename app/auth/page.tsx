"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { signIn, signUp } from "../../lib/auth-client";

export default function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      if (mode === "signin") {
        await signIn(email, password);
        window.location.href = "/courses/sap-mm-level-1";
      } else {
        const result = await signUp(email, password, fullName);
        if ((result as { access_token?: string }).access_token) {
          window.location.href = "/courses/sap-mm-level-1";
        } else {
          setMessage("Account created. Check your email to confirm your account, then sign in.");
          setMode("signin");
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="authPage">
      <div className="authCard">
        <Link href="/" className="brandLink">ERP Edu</Link>
        <span className="eyebrow">Learner account</span>
        <h1>{mode === "signin" ? "Continue your SAP journey" : "Create your learner profile"}</h1>
        <p>Your practice attempts and verified progress are saved securely to your account.</p>

        <div className="authTabs">
          <button className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>Sign in</button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Create account</button>
        </div>

        <form onSubmit={submit} className="authForm">
          {mode === "signup" && (
            <label>Full name<input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>
          )}
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <button className="primaryButton full" disabled={loading}>{loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
        </form>
        {message && <p className="authMessage">{message}</p>}
      </div>
    </main>
  );
}
