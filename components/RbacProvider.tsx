"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  type RbacContextValue,
  type UserProfile,
  type RoleInfo,
  type Permission,
  ROUTE_PERMISSIONS,
  LOGIN_REDIRECT,
  DENIED_REDIRECT,
  PUBLIC_ROUTES,
} from "@/lib/rbac";

const RbacContext = createContext<RbacContextValue>({
  user: null,
  role: null,
  permissions: new Set(),
  loading: true,
  can: () => false,
  canAny: () => false,
});

const RBAC_CACHE_KEY = "wap-pos-rbac-cache";

type CachedRbacState = {
  user: UserProfile | null;
  role: RoleInfo | null;
  permissions: string[];
};

function readCachedRbacState(): CachedRbacState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(RBAC_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedRbacState;
    return {
      user: parsed.user ?? null,
      role: parsed.role ?? null,
      permissions: Array.isArray(parsed.permissions) ? parsed.permissions : [],
    };
  } catch {
    return null;
  }
}

function writeCachedRbacState(state: CachedRbacState) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(RBAC_CACHE_KEY, JSON.stringify(state));
}

function clearCachedRbacState() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(RBAC_CACHE_KEY);
}

export function useRbac() {
  return useContext(RbacContext);
}

export function RbacProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [cachedState] = useState<CachedRbacState | null>(() => readCachedRbacState());

  const [user, setUser] = useState<UserProfile | null>(cachedState?.user ?? null);
  const [role, setRole] = useState<RoleInfo | null>(cachedState?.role ?? null);
  const [permissions, setPermissions] = useState<Set<string>>(
    new Set(cachedState?.permissions ?? [])
  );
  const [loading, setLoading] = useState(!cachedState);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setLoading(true);
    }

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      setUser(null);
      setRole(null);
      setPermissions(new Set());
      clearCachedRbacState();
      setLoading(false);

      if (!PUBLIC_ROUTES.includes(pathname)) {
        router.replace(LOGIN_REDIRECT);
      }
      return;
    }

    let profile: UserProfile | null = null;

    const { data: profileByAuthId } = await supabase
      .from("users")
      .select("id,first_name,last_name,username,email,role_id,branch_id,is_active")
      .eq("auth_id", session.user.id)
      .maybeSingle();

    profile = (profileByAuthId as UserProfile | null) ?? null;

    if (!profile && session.user.email) {
      const { data: profileRows } = await supabase
        .from("users")
        .select("id,first_name,last_name,username,email,role_id,branch_id,is_active")
        .eq("email", session.user.email)
        .limit(1);

      profile = (profileRows?.[0] as UserProfile | undefined) ?? null;
    }

    if (!profile) {
      setUser(null);
      setRole(null);
      setPermissions(new Set());
      clearCachedRbacState();
      setLoading(false);
      return;
    }

    setUser(profile);

    if (!profile.role_id) {
      setRole(null);
      setPermissions(new Set());
      writeCachedRbacState({
        user: profile,
        role: null,
        permissions: [],
      });
      setLoading(false);
      return;
    }

    const { data: roleRow } = await supabase
      .from("roles")
      .select("id,name,description")
      .eq("id", profile.role_id)
      .single();

    const resolvedRole = (roleRow as RoleInfo | null) ?? null;
    setRole(resolvedRole);

    const { data: rpRows } = await supabase
      .from("role_permissions")
      .select("permission_id, is_allowed, permissions(module, action)")
      .eq("role_id", profile.role_id)
      .eq("is_allowed", true);

    const permSet = new Set<string>();
    (rpRows as unknown as Array<{ permissions: { module: string; action: string } | null }> ?? []).forEach((rp) => {
      if (rp.permissions) {
        permSet.add(`${rp.permissions.module}:${rp.permissions.action}`);
      }
    });

    setPermissions(permSet);
    writeCachedRbacState({
      user: profile,
      role: resolvedRole,
      permissions: Array.from(permSet),
    });
    setLoading(false);
  }, [pathname, router]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void load(!cachedState);
    }, 0);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void load(false);
    });

    return () => {
      window.clearTimeout(loadTimer);
      subscription.unsubscribe();
    };
  }, [cachedState, load]);

  useEffect(() => {
    if (loading) return;
    if (PUBLIC_ROUTES.includes(pathname)) return;

    if (!user) {
      router.replace(LOGIN_REDIRECT);
      return;
    }

    const requiredPerm = Object.entries(ROUTE_PERMISSIONS).find(([route]) =>
      pathname === route || pathname.startsWith(`${route}/`)
    )?.[1];

    if (requiredPerm && !permissions.has(requiredPerm)) {
      if (role?.name === "super_admin") return;
      router.replace(DENIED_REDIRECT);
    }
  }, [pathname, loading, user, permissions, role, router]);

  const can = useCallback(
    (...perms: Permission[]) => {
      if (role?.name === "super_admin") return true;
      return perms.every((perm) => permissions.has(perm));
    },
    [permissions, role]
  );

  const canAny = useCallback(
    (...perms: Permission[]) => {
      if (role?.name === "super_admin") return true;
      return perms.some((perm) => permissions.has(perm));
    },
    [permissions, role]
  );

  return (
    <RbacContext.Provider value={{ user, role, permissions, loading, can, canAny }}>
      {children}
    </RbacContext.Provider>
  );
}
