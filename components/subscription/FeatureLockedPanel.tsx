"use client";

import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { formatPlanName, type SubscriptionPlan } from "@/lib/subscription-config";

type FeatureLockedPanelProps = {
  featureName: string;
  requiredPlan: SubscriptionPlan;
  description: string;
};

export default function FeatureLockedPanel({
  featureName,
  requiredPlan,
  description,
}: FeatureLockedPanelProps) {
  return (
    <section
      style={{
        borderRadius: 28,
        padding: "32px 28px",
        background: "linear-gradient(145deg, #0f172a 0%, #1d4ed8 62%, #60a5fa 100%)",
        color: "#eff6ff",
        boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
      }}
    >
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 999, background: "rgba(255,255,255,0.14)", fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
        <Lock size={14} />
        Subscription Lock
      </div>
      <h1 style={{ margin: "16px 0 10px", fontSize: "2rem", lineHeight: 1.1 }}>{featureName}</h1>
      <p style={{ margin: 0, maxWidth: 720, lineHeight: 1.7, color: "rgba(239,246,255,0.9)" }}>
        {description}
      </p>
      <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 999, background: "rgba(255,255,255,0.16)", fontWeight: 700 }}>
          <Sparkles size={14} />
          Requires {formatPlanName(requiredPlan)}
        </span>
        <Link
          href="/subscription"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 16px",
            borderRadius: 999,
            background: "#f8fafc",
            color: "#0f172a",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Open Subscription Workspace
        </Link>
      </div>
    </section>
  );
}
