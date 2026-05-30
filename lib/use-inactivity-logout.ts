"use client";

import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { InactivityTimer } from "@/lib/auth-security";

const INACTIVITY_KEY = "wap-inactivity-warning";

interface UseInactivityLogoutOptions {
  timeoutMinutes: number;
  warningMinutes?: number;
  onWarning?: () => void;
  onLogout?: () => void;
}

export function useInactivityLogout({
  timeoutMinutes,
  warningMinutes = 2,
  onWarning,
  onLogout,
}: UseInactivityLogoutOptions) {
  const timerRef = useRef<InactivityTimer | null>(null);

  const doLogout = useCallback(async () => {
    sessionStorage.removeItem("wap-pos-rbac-cache");
    sessionStorage.removeItem(INACTIVITY_KEY);
    await supabase.auth.signOut();
    if (onLogout) onLogout();
    window.location.replace("/?reason=inactivity");
  }, [onLogout]);

  const handleWarning = useCallback(() => {
    sessionStorage.setItem(INACTIVITY_KEY, "1");
    if (onWarning) onWarning();
  }, [onWarning]);

  useEffect(() => {
    if (!timeoutMinutes || timeoutMinutes <= 0) return;

    const timeoutMs = timeoutMinutes * 60 * 1000;
    const warningMs = warningMinutes * 60 * 1000;

    timerRef.current = new InactivityTimer({
      timeoutMs,
      warningMs: Math.min(warningMs, timeoutMs - 10_000),
      onWarning: handleWarning,
      onLogout:  doLogout,
    });

    timerRef.current.start();

    return () => timerRef.current?.stop();
  }, [timeoutMinutes, warningMinutes, handleWarning, doLogout]);

  return {
    restartTimer: () => {
      sessionStorage.removeItem(INACTIVITY_KEY);
      timerRef.current?.ping();
    },
  };
}
