import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { BookOpenText, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Atelier Research Framework" },
      { name: "description", content: "Sign in to your Atelier workspace to manage your multi-agent research topics." },
      { property: "og:title", content: "Sign in — Atelier Research Framework" },
      { property: "og:description", content: "Sign in to your Atelier workspace to manage your multi-agent research topics." },
      { property: "og:url", content: "https://cozy-connect-73.lovable.app/auth" },
    ],
    links: [{ rel: "canonical", href: "https://cozy-connect-73.lovable.app/auth" }],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

import { PasswordRequirements, validatePassword } from "@/components/PasswordRequirements";

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/dashboard" });
    });
    return () => { sub.data.subscription.unsubscribe(); };
  }, [navigate]);

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (res.error) toast.error("Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
  };

  const handleSignUp = async () => {
    if (!validatePassword(password).isValid) {
      return toast.error("Password does not meet all required rules.");
    }
    if (password !== confirmPassword) {
      return toast.error("Passwords do not match.");
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin, data: { display_name: name } },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Account created — you're signed in.");
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-ink text-primary-foreground shadow-paper mb-3">
            <BookOpenText className="h-5 w-5" />
          </div>
          <h1 className="font-serif text-3xl text-foreground">Sign in to Atelier</h1>
          <p className="text-sm text-muted-foreground mt-1">A multi-agent research framework</p>
        </div>

        <Card className="bg-paper shadow-paper p-6">
          <Tabs defaultValue="signin">
            <TabsList className="w-full bg-secondary/60">
              <TabsTrigger value="signin" className="flex-1">Sign in</TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="space-y-3 mt-4">
              <div className="space-y-1.5">
                <Label htmlFor="email-in">Email</Label>
                <Input id="email-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw-in">Password</Label>
                <Input id="pw-in" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <PasswordRequirements />
              </div>
              <Button className="w-full" onClick={handleSignIn} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
              </Button>
            </TabsContent>

            <TabsContent value="signup" className="space-y-3 mt-4">
              <div className="space-y-1.5">
                <Label htmlFor="name-up">Display name</Label>
                <Input id="name-up" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Ada Lovelace" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email-up">Email</Label>
                <Input id="email-up" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw-up">Password</Label>
                <Input id="pw-up" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <PasswordRequirements password={password} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-pw-up">Confirm Password</Label>
                <Input id="confirm-pw-up" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
              <Button className="w-full" onClick={handleSignUp} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
              </Button>
            </TabsContent>
          </Tabs>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="w-full gap-2" onClick={handleGoogle} disabled={loading}>
            <GoogleIcon /> Continue with Google
          </Button>
        </Card>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.44a5.5 5.5 0 01-2.39 3.6v3h3.86c2.26-2.08 3.58-5.15 3.58-8.84z"/>
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0012 24z"/>
      <path fill="#FBBC05" d="M5.27 14.29A7.21 7.21 0 014.89 12c0-.79.14-1.56.38-2.29V6.62H1.29A12 12 0 000 12c0 1.94.46 3.78 1.29 5.38l3.98-3.09z"/>
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 001.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"/>
    </svg>
  );
}
