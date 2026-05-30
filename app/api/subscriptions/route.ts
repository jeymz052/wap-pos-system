import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBearerToken } from "@/lib/server-auth";
import { getAccessProfileByAuthUserId, hasAnyPermission, logAuditEvent } from "@/lib/user-access";
import { getSubscriptionAccessSummary, getSubscriptionWorkspace } from "@/lib/subscriptions";
import { PLAN_ORDER, type SubscriptionPlan } from "@/lib/subscription-config";

export const dynamic = "force-dynamic";

type ManageAction =
  | "change_plan"
  | "record_invoice_payment"
  | "update_payment_status"
  | "start_trial"
  | "set_feature_override";

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isPlan(value: unknown): value is SubscriptionPlan {
  return PLAN_ORDER.includes(value as SubscriptionPlan);
}

async function resolveActor(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return null;

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) return null;
  return getAccessProfileByAuthUserId(user.id);
}

async function loadPlanDefinition(plan: SubscriptionPlan) {
  const result = await supabaseAdmin
    .from("subscription_plan_definitions")
    .select("plan, display_name, branch_limit, user_limit, product_limit, monthly_price, annual_price")
    .eq("plan", plan)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) throw new Error("Plan definition not found.");
  return result.data as {
    plan: SubscriptionPlan;
    display_name: string;
    branch_limit: number | null;
    user_limit: number | null;
    product_limit: number | null;
    monthly_price: number | string;
    annual_price: number | string;
  };
}

async function getCurrentSubscriptionId() {
  const current = await supabaseAdmin
    .from("subscriptions")
    .select("id, plan, branch_limit, user_limit, product_limit, payment_status, billing_cycle")
    .order("is_active", { ascending: false })
    .order("renewal_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (current.error) throw current.error;
  if (!current.data) throw new Error("Subscription record not found.");
  return current.data as {
    id: string;
    plan: SubscriptionPlan;
    branch_limit: number | null;
    user_limit: number | null;
    product_limit: number | null;
    payment_status: string;
    billing_cycle: string;
  };
}

async function createInvoiceForPlanChange(input: {
  subscriptionId: string;
  actorId: string;
  plan: SubscriptionPlan;
  billingCycle: string;
  currencyCode?: string;
}) {
  const definition = await loadPlanDefinition(input.plan);
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd =
    input.billingCycle === "annual"
      ? new Date(now.getFullYear() + 1, now.getMonth() + 1, 0)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const amount = input.billingCycle === "annual"
    ? parseNumber(definition.annual_price)
    : parseNumber(definition.monthly_price);

  const invoiceNumber = `SUB-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now.getTime().toString().slice(-6)}`;
  const insertResult = await supabaseAdmin.from("subscription_invoices").insert({
    subscription_id: input.subscriptionId,
    invoice_number: invoiceNumber,
    amount,
    subtotal: amount,
    total_amount: amount,
    paid_amount: 0,
    status: amount > 0 ? "issued" : "paid",
    due_date: now.toISOString().slice(0, 10),
    issued_at: now.toISOString(),
    billing_period_start: periodStart.toISOString().slice(0, 10),
    billing_period_end: periodEnd.toISOString().slice(0, 10),
    currency_code: input.currencyCode ?? "PHP",
    metadata: {
      plan: input.plan,
      billing_cycle: input.billingCycle,
    },
    created_by: input.actorId,
    payment_reference: null,
    paid_at: amount > 0 ? null : now.toISOString(),
  }).select("id, invoice_number").single();

  if (insertResult.error) throw insertResult.error;
  return insertResult.data as { id: string; invoice_number: string };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    if (!actor || !hasAnyPermission(actor, "subscriptions:view", "subscriptions:manage")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const scope = new URL(request.url).searchParams.get("scope");
    if (scope === "access") {
      const summary = await getSubscriptionAccessSummary();
      return NextResponse.json(summary);
    }

    const workspace = await getSubscriptionWorkspace(actor);
    return NextResponse.json(workspace);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[subscriptions:get]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    if (!actor || !hasAnyPermission(actor, "subscriptions:manage")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: ManageAction;
      plan?: SubscriptionPlan;
      billingCycle?: string;
      reason?: string;
      invoiceId?: string;
      paymentReference?: string;
      paidAmount?: number;
      paymentStatus?: string;
      trialDays?: number;
      featureCode?: string;
      enabled?: boolean;
      notes?: string;
    };

    switch (body.action) {
      case "change_plan": {
        if (!isPlan(body.plan)) {
          return NextResponse.json({ error: "A valid plan is required." }, { status: 400 });
        }

        const current = await getCurrentSubscriptionId();
        const definition = await loadPlanDefinition(body.plan);
        const billingCycle = body.billingCycle === "annual" ? "annual" : "monthly";
        const now = new Date();
        const renewalDate =
          billingCycle === "annual"
            ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
            : new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

        const updateResult = await supabaseAdmin
          .from("subscriptions")
          .update({
            plan: definition.plan,
            display_name: definition.display_name,
            branch_limit: definition.branch_limit,
            user_limit: definition.user_limit,
            product_limit: definition.product_limit,
            billing_cycle: billingCycle,
            renewal_date: renewalDate.toISOString().slice(0, 10),
            payment_status: current.payment_status === "trial" ? "trial" : "unpaid",
            is_trial: false,
            trial_ends_at: null,
            updated_at: now.toISOString(),
            updated_by: actor.profileId,
          })
          .eq("id", current.id);

        if (updateResult.error) throw updateResult.error;

        const changeLogResult = await supabaseAdmin.from("subscription_plan_change_log").insert({
          subscription_id: current.id,
          previous_plan: current.plan,
          next_plan: definition.plan,
          previous_branch_limit: current.branch_limit,
          previous_user_limit: current.user_limit,
          previous_product_limit: current.product_limit,
          next_branch_limit: definition.branch_limit,
          next_user_limit: definition.user_limit,
          next_product_limit: definition.product_limit,
          change_reason: cleanText(body.reason) ?? "Plan updated from subscription workspace.",
          effective_on: now.toISOString().slice(0, 10),
          changed_by: actor.profileId,
        });

        if (changeLogResult.error) throw changeLogResult.error;

        const invoice = await createInvoiceForPlanChange({
          subscriptionId: current.id,
          actorId: actor.profileId,
          plan: definition.plan,
          billingCycle,
        });

        await logAuditEvent({
          userId: actor.profileId,
          module: "subscriptions",
          action: "change_plan",
          referenceType: "subscription",
          referenceId: current.id,
          oldValues: { plan: current.plan, billing_cycle: current.billing_cycle },
          newValues: { plan: definition.plan, billing_cycle: billingCycle, invoice_number: invoice.invoice_number },
        });

        return NextResponse.json({ success: true, message: `Plan changed to ${definition.display_name}.`, invoice });
      }

      case "record_invoice_payment": {
        const invoiceId = cleanText(body.invoiceId);
        if (!invoiceId) {
          return NextResponse.json({ error: "Invoice is required." }, { status: 400 });
        }

        const paidAmount = Math.max(0, parseNumber(body.paidAmount));
        const now = new Date().toISOString();
        const invoiceResult = await supabaseAdmin
          .from("subscription_invoices")
          .update({
            status: "paid",
            paid_amount: paidAmount,
            paid_at: now,
            payment_reference: cleanText(body.paymentReference),
            updated_at: now,
          })
          .eq("id", invoiceId);

        if (invoiceResult.error) throw invoiceResult.error;

        const current = await getCurrentSubscriptionId();
        const subscriptionResult = await supabaseAdmin
          .from("subscriptions")
          .update({
            payment_status: "paid",
            updated_at: now,
            updated_by: actor.profileId,
          })
          .eq("id", current.id);

        if (subscriptionResult.error) throw subscriptionResult.error;

        await logAuditEvent({
          userId: actor.profileId,
          module: "subscriptions",
          action: "record_payment",
          referenceType: "subscription_invoice",
          referenceId: invoiceId,
          newValues: { paid_amount: paidAmount, payment_reference: cleanText(body.paymentReference) },
        });

        return NextResponse.json({ success: true, message: "Invoice marked as paid." });
      }

      case "update_payment_status": {
        const status = cleanText(body.paymentStatus);
        if (!status) {
          return NextResponse.json({ error: "Payment status is required." }, { status: 400 });
        }

        const current = await getCurrentSubscriptionId();
        const updateResult = await supabaseAdmin
          .from("subscriptions")
          .update({
            payment_status: status,
            updated_at: new Date().toISOString(),
            updated_by: actor.profileId,
          })
          .eq("id", current.id);

        if (updateResult.error) throw updateResult.error;

        await logAuditEvent({
          userId: actor.profileId,
          module: "subscriptions",
          action: "update_payment_status",
          referenceType: "subscription",
          referenceId: current.id,
          newValues: { payment_status: status },
        });

        return NextResponse.json({ success: true, message: "Payment status updated." });
      }

      case "start_trial": {
        const current = await getCurrentSubscriptionId();
        const trialDays = Math.min(30, Math.max(1, Math.floor(parseNumber(body.trialDays) || 14)));
        const now = new Date();
        const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

        const updateResult = await supabaseAdmin
          .from("subscriptions")
          .update({
            is_trial: true,
            trial_ends_at: trialEndsAt.toISOString(),
            payment_status: "trial",
            renewal_date: trialEndsAt.toISOString().slice(0, 10),
            updated_at: now.toISOString(),
            updated_by: actor.profileId,
          })
          .eq("id", current.id);

        if (updateResult.error) throw updateResult.error;

        await logAuditEvent({
          userId: actor.profileId,
          module: "subscriptions",
          action: "start_trial",
          referenceType: "subscription",
          referenceId: current.id,
          newValues: { trial_days: trialDays, trial_ends_at: trialEndsAt.toISOString() },
        });

        return NextResponse.json({ success: true, message: `Trial extended for ${trialDays} day(s).` });
      }

      case "set_feature_override": {
        const featureCode = cleanText(body.featureCode);
        if (!featureCode || typeof body.enabled !== "boolean") {
          return NextResponse.json({ error: "Feature code and state are required." }, { status: 400 });
        }

        const result = await supabaseAdmin.from("subscription_feature_overrides").upsert({
          feature_code: featureCode,
          is_enabled: body.enabled,
          notes: cleanText(body.notes),
          created_by: actor.profileId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "feature_code" });

        if (result.error) throw result.error;

        await logAuditEvent({
          userId: actor.profileId,
          module: "subscriptions",
          action: "set_feature_override",
          referenceType: "subscription_feature_override",
          newValues: { feature_code: featureCode, is_enabled: body.enabled, notes: cleanText(body.notes) },
        });

        return NextResponse.json({ success: true, message: "Feature override saved." });
      }

      default:
        return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[subscriptions:post]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
