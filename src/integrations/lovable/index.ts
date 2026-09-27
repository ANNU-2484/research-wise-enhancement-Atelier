// Localhost-friendly replacement for the Lovable cloud-auth broker.
// Keeps the same call signature used in src/routes/auth.tsx:
//   lovable.auth.signInWithOAuth("google", { redirect_uri })
// but performs the OAuth flow directly against the (local) Supabase GoTrue
// server using @supabase/supabase-js. This is the minimum change required
// to keep Google Sign-In working against a local Supabase stack.

import { supabase } from "../supabase/client";

type Provider = "google" | "apple" | "microsoft" | "lovable";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type SignInResult = {
  redirected?: boolean;
  error?: Error | null;
};

function mapProvider(provider: Provider): "google" | "apple" | "azure" {
  if (provider === "microsoft") return "azure";
  if (provider === "lovable") {
    // Local stack has no "lovable" provider — fall back to Google.
    return "google";
  }
  return provider;
}

export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: Provider,
      opts?: SignInOptions,
    ): Promise<SignInResult> => {
      const redirectTo =
        opts?.redirect_uri ??
        (typeof window !== "undefined" ? window.location.origin : undefined);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: mapProvider(provider),
        options: {
          redirectTo,
          queryParams: opts?.extraParams,
        },
      });

      if (error) return { error };
      // supabase-js performs a full-page redirect to the provider; the
      // session is established by the auth-state listener on return.
      return { redirected: true };
    },
  },
};
