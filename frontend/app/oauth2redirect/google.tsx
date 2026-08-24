/**
 * Google OAuth native redirect target.
 *
 * `expo-auth-session` has already consumed the response by the time this
 * mounts — the redirect URI only needs a route that exists, so the deep link
 * resolves instead of 404ing. Bouncing to the root lets index.tsx decide where
 * the now-signed-in user belongs.
 */
import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function GoogleRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return null;
}
