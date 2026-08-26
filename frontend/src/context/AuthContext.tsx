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
  /** Only the async token exchange needs stored state; see `error` below. */
  const [exchangeError, setExchangeError] = useState<string | null>(null);

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

  /**
   * Whatever the last sign-in attempt went wrong with.
   *
   * The two synchronous failures are *derived* from `response` rather than
   * copied into state. Setting state in an effect body just to mirror a value
   * already available during render causes a cascading render for no gain — and
   * leaves two sources of truth to keep in step. Only the token exchange, which
   * is genuinely async, needs its own state.
   */
  const idToken = response?.type === "success" ? response.authentication?.idToken : undefined;
  const responseError =
    response?.type === "error"
      ? "Google sign-in was cancelled or failed."
      : response?.type === "success" && !idToken
        // Failing silently here looks to the user like the button did nothing,
        // and the cause is almost always a misconfigured OAuth client type.
        ? "Google didn't return an ID token. Check the OAuth client type."
        : null;
  const error = exchangeError ?? responseError;

  // Exchange Google's id token for a Trace session token.
  useEffect(() => {
    if (!idToken) return;

    (async () => {
      try {
        const data = await apiFetch<{ user: User; session_token: string }>("/auth/google", {
          method: "POST",
          body: { id_token: idToken },
          auth: false,
        });
        await setToken(data.session_token);
        setUser(data.user);
        setExchangeError(null);
      } catch (e) {
        console.warn("Google sign-in exchange failed", e);
        setExchangeError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
      }
    })();
  }, [idToken]);

  const signIn = useCallback(async () => {
    setExchangeError(null);
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
