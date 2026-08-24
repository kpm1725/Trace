import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { makeRedirectUri } from "expo-auth-session";

import { apiFetch, clearToken, getToken, setToken } from "@/src/api/client";

WebBrowser.maybeCompleteAuthSession();

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  /** Set when a sign-in attempt failed, so the login screen can say why. */
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  error: null,
  signIn: async () => {},
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [, response, promptAsync] = Google.useAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    redirectUri: makeRedirectUri({
      native: "com.violetseedlabs.trace:/oauth2redirect/google",
    }),
  });

  // Bootstrap: trade a stored token for the current user, or discard it.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const t = await getToken();
        if (t) {
          const me = await apiFetch<{ user: User }>("/auth/me");
          if (mounted) setUser(me.user);
        }
      } catch {
        await clearToken();
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Exchange Google's id token for a Trace session token.
  useEffect(() => {
    if (!response) return;

    if (response.type === "error") {
      setError("Google sign-in was cancelled or failed.");
      return;
    }
    if (response.type !== "success") return;

    const idToken = response.authentication?.idToken;
    if (!idToken) {
      // Scribe silently does nothing here, which looks to the user like the
      // button did not work.
      setError("Google didn't return an ID token. Check the OAuth client type.");
      return;
    }

    (async () => {
      try {
        const data = await apiFetch<{ user: User; session_token: string }>("/auth/google", {
          method: "POST",
          body: { id_token: idToken },
          auth: false,
        });
        await setToken(data.session_token);
        setUser(data.user);
        setError(null);
      } catch (e: any) {
        console.warn("Google sign-in exchange failed", e);
        setError(e?.message ?? "Sign-in failed. Please try again.");
      }
    })();
  }, [response]);

  const signIn = useCallback(async () => {
    setError(null);
    await promptAsync();
  }, [promptAsync]);

  const signOut = useCallback(async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // The local token is cleared either way — a failed logout call must not
      // strand someone in a signed-in state they cannot leave.
    }
    await clearToken();
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, error, signIn, signOut }}>{children}</Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
