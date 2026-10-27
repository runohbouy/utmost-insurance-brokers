import { useEffect, useState } from "react";
import { api, setAuthToken } from "./api";
import type { StaffSession } from "./types";

const TOKEN_KEY = "crm_staff_token";

export function useAuth() {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    setAuthToken(token);
    api.auth.me()
      .then(setSession)
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setAuthToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { token } = await api.auth.login(email, password);
    localStorage.setItem(TOKEN_KEY, token);
    setAuthToken(token);
    const me = await api.auth.me();
    setSession(me);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setSession(null);
  }

  return { session, loading, login, logout };
}
