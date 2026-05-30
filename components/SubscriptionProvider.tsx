"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PUBLIC_ROUTES } from "@/lib/rbac";
import {
  FEATURE_MIN_PLAN,
  type SubscriptionFeatureCode,
  type SubscriptionPlan,
} from "@/lib/subscription-config";

type AccessSnapshot = {
  snapshot: {
    plan: SubscriptionPlan;
    payment_status: string;
    renewal_date: string | null;
    is_trial: boolean;
    trial_ends_at: string | null;
    branch_limit: number | null;
    user_limit: number | null;
    product_limit: number | null;
  };
  usage: {
    active_branch_count: number;
    active_user_count: number;
    active_product_count: number;
    open_invoice_count: number;
  };
  features: Array<{
    code: SubscriptionFeatureCode;
    isEnabled: boolean;
  }>;
};

type SubscriptionContextValue = {
  loading: boolean;
  plan: SubscriptionPlan;
  paymentStatus: string;
  renewalDate: string | null;
  isTrial: boolean;
  trialEndsAt: string | null;
  branchLimit: number | null;
  userLimit: number | null;
  productLimit: number | null;
  usage: AccessSnapshot["usage"];
  hasFeature: (feature: SubscriptionFeatureCode) => boolean;
  requiredPlanFor: (feature: SubscriptionFeatureCode) => SubscriptionPlan;
  refresh: () => Promise<void>;
};

const defaultValue: SubscriptionContextValue = {
  loading: true,
  plan: "starter",
  paymentStatus: "trial",
  renewalDate: null,
  isTrial: true,
  trialEndsAt: null,
  branchLimit: 1,
  userLimit: 3,
  productLimit: 500,
  usage: {
    active_branch_count: 0,
    active_user_count: 0,
    active_product_count: 0,
    open_invoice_count: 0,
  },
  hasFeature: () => false,
  requiredPlanFor: (feature) => FEATURE_MIN_PLAN[feature],
  refresh: async () => undefined,
};

const SubscriptionContext = createContext<SubscriptionContextValue>(defaultValue);

export function useSubscriptionAccess() {
  return useContext(SubscriptionContext);
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AccessSnapshot | null>(null);

  const loadAccess = useCallback(async () => {
    if (PUBLIC_ROUTES.includes(pathname)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data.session?.access_token;
      if (!token) {
        setData(null);
        setLoading(false);
        return;
      }

      const response = await fetch("/api/subscriptions?scope=access", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = (await response.json()) as AccessSnapshot & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load subscription access.");
      }

      setData(payload);
    } catch (error) {
      console.error("[subscription-provider]", error instanceof Error ? error.message : error);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [pathname]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAccess();
    }, 0);
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void loadAccess();
    });

    return () => {
      window.clearTimeout(timer);
      listener.subscription.unsubscribe();
    };
  }, [loadAccess]);

  const value = useMemo<SubscriptionContextValue>(() => {
    const features = new Map<SubscriptionFeatureCode, boolean>();
    for (const item of data?.features ?? []) {
      features.set(item.code, item.isEnabled);
    }

    return {
      loading,
      plan: data?.snapshot.plan ?? "starter",
      paymentStatus: data?.snapshot.payment_status ?? "trial",
      renewalDate: data?.snapshot.renewal_date ?? null,
      isTrial: data?.snapshot.is_trial ?? true,
      trialEndsAt: data?.snapshot.trial_ends_at ?? null,
      branchLimit: data?.snapshot.branch_limit ?? 1,
      userLimit: data?.snapshot.user_limit ?? 3,
      productLimit: data?.snapshot.product_limit ?? 500,
      usage: data?.usage ?? defaultValue.usage,
      hasFeature: (feature) => features.get(feature) ?? false,
      requiredPlanFor: (feature) => FEATURE_MIN_PLAN[feature],
      refresh: loadAccess,
    };
  }, [data, loadAccess, loading]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}
