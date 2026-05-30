import { supabaseAdmin } from "@/lib/supabase-admin";

export type AlertType =
  | "low_stock"
  | "out_of_stock"
  | "pending_po"
  | "credit_due"
  | "supplier_payment_due"
  | "shift_closing"
  | "unusual_discount"
  | "negative_stock"
  | "expiring_warranty";

export type AlertSeverity = "info" | "warning" | "critical";

type SettingsMap = Record<string, string>;

type RecipientRow = {
  id: string;
  email?: string | null;
  branch_id?: string | null;
  data_access_scope?: string | null;
  role?: { name?: string | null } | null;
};

type PreferenceRow = {
  user_id: string;
  notification_type?: AlertType | null;
  in_app_enabled?: boolean | null;
  email_enabled?: boolean | null;
  email_address?: string | null;
};

type RecipientWithPreferences = RecipientRow & {
  preferences: PreferenceRow[];
};

type NotificationPayload = {
  type: AlertType;
  branchId?: string | null;
  title: string;
  message: string;
  severity?: AlertSeverity;
  referenceType?: string | null;
  referenceId?: string | null;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
  actionUrl?: string | null;
};

type DiscountAlertInput = {
  saleId: string;
  branchId: string;
  cashierId: string;
  invoiceNumber: string;
  subtotal: number;
  orderDiscountAmount: number;
  itemDiscountAmount: number;
};

const DEFAULT_SETTINGS = {
  notifications_enabled: "true",
  email_notifications_enabled: "true",
  notification_credit_due_days: "3",
  notification_supplier_payment_due_days: "5",
  notification_warranty_expiry_days: "14",
  notification_shift_closing_hours: "10",
  notification_unusual_discount_percent: "20",
  notification_unusual_discount_amount: "1000",
} satisfies SettingsMap;

const ALERT_EMAIL_SUBJECT_PREFIX = "[WAP POS]";

function parseNumber(value: unknown, fallback = 0) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value == null) return fallback;
  return value.toLowerCase() !== "false";
}

function formatDateBucket(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function normalizeEmail(value: string | null | undefined) {
  const next = value?.trim().toLowerCase() ?? "";
  return next || null;
}

async function getSettings() {
  const result = await supabaseAdmin
    .from("settings")
    .select("key, value")
    .is("branch_id", null)
    .in("key", Object.keys(DEFAULT_SETTINGS));

  if (result.error) {
    throw result.error;
  }

  const resolved: SettingsMap = { ...DEFAULT_SETTINGS };
  for (const row of (result.data ?? []) as Array<{ key?: string | null; value?: string | null }>) {
    if (row.key) {
      const key = row.key as keyof typeof DEFAULT_SETTINGS;
      resolved[row.key] = row.value ?? DEFAULT_SETTINGS[key] ?? "";
    }
  }

  return resolved;
}

async function getRecipients(branchId?: string | null) {
  const usersResult = await supabaseAdmin
    .from("users")
    .select("id, email, branch_id, data_access_scope, role:roles(name)")
    .eq("is_active", true)
    .eq("allow_login", true);

  if (usersResult.error) {
    throw usersResult.error;
  }

  const users = ((usersResult.data ?? []) as RecipientRow[]).filter((row) => {
    const roleName = String(row.role?.name ?? "").toLowerCase();
    if (!branchId) return true;
    if (roleName === "super_admin" || roleName === "admin") return true;
    if (row.data_access_scope === "all_data") return true;
    return row.branch_id === branchId;
  });

  if (!users.length) {
    return [] as RecipientWithPreferences[];
  }

  const preferencesResult = await supabaseAdmin
    .from("notification_preferences")
    .select("user_id, notification_type, in_app_enabled, email_enabled, email_address")
    .in("user_id", users.map((row) => row.id));

  if (preferencesResult.error) {
    throw preferencesResult.error;
  }

  const groupedPreferences = new Map<string, PreferenceRow[]>();
  for (const row of (preferencesResult.data ?? []) as PreferenceRow[]) {
    const bucket = groupedPreferences.get(row.user_id) ?? [];
    bucket.push(row);
    groupedPreferences.set(row.user_id, bucket);
  }

  return users.map((row) => {
    const preferences = groupedPreferences.get(row.id) ?? [];
    return {
      ...row,
      preferences,
    };
  }) as RecipientWithPreferences[];
}

async function logEmailDelivery(input: {
  notificationId?: string | null;
  userId?: string | null;
  branchId?: string | null;
  type: AlertType;
  recipientEmail: string;
  subject: string;
  status: "queued" | "sent" | "failed" | "skipped";
  providerMessageId?: string | null;
  errorMessage?: string | null;
  payload?: Record<string, unknown>;
}) {
  const result = await supabaseAdmin.from("notification_email_logs").insert({
    notification_id: input.notificationId ?? null,
    user_id: input.userId ?? null,
    branch_id: input.branchId ?? null,
    notification_type: input.type,
    recipient_email: input.recipientEmail,
    subject: input.subject,
    provider: "resend",
    status: input.status,
    provider_message_id: input.providerMessageId ?? null,
    error_message: input.errorMessage ?? null,
    payload: input.payload ?? {},
    sent_at: input.status === "sent" ? new Date().toISOString() : null,
  });

  if (result.error) {
    throw result.error;
  }
}

async function sendNotificationEmail(args: {
  notificationId?: string | null;
  userId: string;
  branchId?: string | null;
  type: AlertType;
  recipientEmail: string;
  title: string;
  message: string;
  actionUrl?: string | null;
}) {
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM ||
    process.env.RESEND_FROM_EMAIL ||
    process.env.SMTP_FROM_EMAIL ||
    "alerts@example.com";
  const subject = `${ALERT_EMAIL_SUBJECT_PREFIX} ${args.title}`;

  if (!resendKey) {
    await logEmailDelivery({
      notificationId: args.notificationId,
      userId: args.userId,
      branchId: args.branchId ?? null,
      type: args.type,
      recipientEmail: args.recipientEmail,
      subject,
      status: "skipped",
      errorMessage: "Missing RESEND_API_KEY environment variable.",
      payload: { actionUrl: args.actionUrl ?? null },
    });
    return;
  }

  const html = [
    "<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#0f172a\">",
    `<h2 style="margin:0 0 12px">${args.title}</h2>`,
    `<p style="margin:0 0 16px">${args.message}</p>`,
    args.actionUrl
      ? `<p style="margin:0"><a href="${args.actionUrl}" style="color:#2563eb">Open in WAP POS</a></p>`
      : "",
    "</div>",
  ].join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [args.recipientEmail],
      subject,
      html,
    }),
  });

  const responseBody = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    error?: string;
  };

  if (!response.ok) {
    await logEmailDelivery({
      notificationId: args.notificationId,
      userId: args.userId,
      branchId: args.branchId ?? null,
      type: args.type,
      recipientEmail: args.recipientEmail,
      subject,
      status: "failed",
      errorMessage: responseBody.message || responseBody.error || "Unable to send notification email.",
      payload: { actionUrl: args.actionUrl ?? null },
    });
    return;
  }

  await logEmailDelivery({
    notificationId: args.notificationId,
    userId: args.userId,
    branchId: args.branchId ?? null,
    type: args.type,
    recipientEmail: args.recipientEmail,
    subject,
    status: "sent",
    providerMessageId: responseBody.id ?? null,
    payload: { actionUrl: args.actionUrl ?? null },
  });

  if (args.notificationId) {
    await supabaseAdmin
      .from("notifications")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", args.notificationId);
  }
}

export async function createOperationalNotification(payload: NotificationPayload) {
  const settings = await getSettings();
  if (!parseBoolean(settings.notifications_enabled, true)) {
    return { inserted: 0 };
  }

  const recipients = await getRecipients(payload.branchId ?? null);
  if (!recipients.length) {
    return { inserted: 0 };
  }

  const existingMap = new Map<string, { id: string }>();
  if (payload.dedupeKey) {
    const existingResult = await supabaseAdmin
      .from("notifications")
      .select("id, user_id")
      .eq("dedupe_key", payload.dedupeKey)
      .in("user_id", recipients.map((row) => row.id));

    if (existingResult.error) {
      throw existingResult.error;
    }

    for (const row of (existingResult.data ?? []) as Array<{ id: string; user_id: string }>) {
      existingMap.set(row.user_id, { id: row.id });
    }
  }

  const preferenceByUser = new Map<string, PreferenceRow[]>();
  for (const recipient of recipients) {
    preferenceByUser.set(recipient.id, recipient.preferences ?? []);
  }

  const inserts: Array<Record<string, unknown>> = [];
  const emailQueue: Array<{
    userId: string;
    email: string;
    notificationId?: string | null;
  }> = [];

  for (const recipient of recipients) {
    const preferences = preferenceByUser.get(recipient.id) ?? [];
    const typePreference = preferences.find((row) => row.notification_type === payload.type);

    const inAppEnabled = typePreference?.in_app_enabled ?? true;
    const emailEnabled = typePreference?.email_enabled ?? false;
    const emailAddress = normalizeEmail(typePreference?.email_address) ?? normalizeEmail(recipient.email);

    if (inAppEnabled && !existingMap.has(recipient.id)) {
      inserts.push({
        user_id: recipient.id,
        branch_id: payload.branchId ?? null,
        notification_type: payload.type,
        title: payload.title,
        message: payload.message,
        reference_type: payload.referenceType ?? null,
        reference_id: payload.referenceId ?? null,
        is_read: false,
        severity: payload.severity ?? "warning",
        dedupe_key: payload.dedupeKey ?? null,
        metadata: payload.metadata ?? {},
        action_url: payload.actionUrl ?? null,
      });
    }

    if (
      parseBoolean(settings.email_notifications_enabled, true) &&
      emailEnabled &&
      emailAddress &&
      !existingMap.has(recipient.id)
    ) {
      emailQueue.push({
        userId: recipient.id,
        email: emailAddress,
      });
    }
  }

  let insertedRows: Array<{ id: string; user_id: string }> = [];
  if (inserts.length) {
    const insertResult = await supabaseAdmin
      .from("notifications")
      .insert(inserts)
      .select("id, user_id");

    if (insertResult.error) {
      throw insertResult.error;
    }

    insertedRows = (insertResult.data ?? []) as Array<{ id: string; user_id: string }>;
  }

  const notificationByUser = new Map(insertedRows.map((row) => [row.user_id, row.id]));
  await Promise.all(
    emailQueue.map((item) =>
      sendNotificationEmail({
        notificationId: notificationByUser.get(item.userId) ?? null,
        userId: item.userId,
        branchId: payload.branchId ?? null,
        type: payload.type,
        recipientEmail: item.email,
        title: payload.title,
        message: payload.message,
        actionUrl: payload.actionUrl ?? null,
      })
    )
  );

  return { inserted: inserts.length };
}

export async function syncStockAlertForLevel(input: {
  productId: string;
  branchId: string;
  quantityAfter: number;
  referenceId?: string | null;
}) {
  const productResult = await supabaseAdmin
    .from("products")
    .select("id, name, reorder_level, critical_stock_level, status")
    .eq("id", input.productId)
    .maybeSingle();

  if (productResult.error) {
    throw productResult.error;
  }

  const product = productResult.data as {
    id: string;
    name?: string | null;
    reorder_level?: number | null;
    critical_stock_level?: number | null;
    status?: string | null;
  } | null;

  if (!product || product.status !== "active") {
    return;
  }

  const reorderLevel = parseNumber(product.reorder_level);
  const criticalLevel = parseNumber(product.critical_stock_level);
  const alertDate = formatDateBucket();

  if (input.quantityAfter < 0) {
    await createOperationalNotification({
      type: "negative_stock",
      branchId: input.branchId,
      title: "Negative stock detected",
      message: `${product.name ?? "Product"} dropped below zero stock.`,
      severity: "critical",
      referenceType: "product",
      referenceId: input.referenceId ?? product.id,
      dedupeKey: `negative_stock:${input.branchId}:${product.id}:${alertDate}`,
      metadata: { quantity_after: input.quantityAfter },
      actionUrl: "/inventory",
    });
    return;
  }

  if (input.quantityAfter <= 0) {
    await createOperationalNotification({
      type: "out_of_stock",
      branchId: input.branchId,
      title: "Out-of-stock alert",
      message: `${product.name ?? "Product"} is now out of stock.`,
      severity: "critical",
      referenceType: "product",
      referenceId: input.referenceId ?? product.id,
      dedupeKey: `out_of_stock:${input.branchId}:${product.id}:${alertDate}`,
      metadata: { quantity_after: input.quantityAfter },
      actionUrl: "/inventory",
    });
    return;
  }

  if (input.quantityAfter <= Math.max(reorderLevel, criticalLevel)) {
    await createOperationalNotification({
      type: "low_stock",
      branchId: input.branchId,
      title: "Low stock alert",
      message: `${product.name ?? "Product"} is below its reorder level.`,
      severity: "warning",
      referenceType: "product",
      referenceId: input.referenceId ?? product.id,
      dedupeKey: `low_stock:${input.branchId}:${product.id}:${alertDate}`,
      metadata: {
        quantity_after: input.quantityAfter,
        reorder_level: reorderLevel,
        critical_stock_level: criticalLevel,
      },
      actionUrl: "/inventory",
    });
  }
}

export async function notifyUnusualDiscount(input: DiscountAlertInput) {
  const settings = await getSettings();
  const totalDiscount = Math.max(0, input.orderDiscountAmount + input.itemDiscountAmount);
  const discountPercent = input.subtotal > 0 ? (totalDiscount / input.subtotal) * 100 : 0;
  const thresholdPercent = parseNumber(settings.notification_unusual_discount_percent, 20);
  const thresholdAmount = parseNumber(settings.notification_unusual_discount_amount, 1000);

  if (totalDiscount <= 0) {
    return;
  }

  if (totalDiscount < thresholdAmount && discountPercent < thresholdPercent) {
    return;
  }

  await createOperationalNotification({
    type: "unusual_discount",
    branchId: input.branchId,
    title: "Unusual discount alert",
    message: `Sale ${input.invoiceNumber} used a discount of ${totalDiscount.toFixed(2)} (${discountPercent.toFixed(1)}%).`,
    severity: discountPercent >= thresholdPercent * 1.5 ? "critical" : "warning",
    referenceType: "sale",
    referenceId: input.saleId,
    dedupeKey: `unusual_discount:${input.saleId}`,
    metadata: {
      cashier_id: input.cashierId,
      subtotal: input.subtotal,
      total_discount: totalDiscount,
      discount_percent: discountPercent,
    },
    actionUrl: "/pos",
  });
}

export async function syncNotificationAlerts(branchId?: string | null) {
  const settings = await getSettings();
  const today = new Date();
  const todayIso = formatDateBucket(today);
  const creditDueDays = parseNumber(settings.notification_credit_due_days, 3);
  const supplierDueDays = parseNumber(settings.notification_supplier_payment_due_days, 5);
  const warrantyDays = parseNumber(settings.notification_warranty_expiry_days, 14);
  const shiftClosingHours = parseNumber(settings.notification_shift_closing_hours, 10);

  const [
    inventoryResult,
    purchaseOrdersResult,
    receivablesResult,
    supplierDueResult,
    shiftsResult,
    warrantyResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("inventory_stocks")
      .select("product_id, branch_id, quantity, products(name, reorder_level, critical_stock_level, status)")
      .then((result) => result),
    supabaseAdmin
      .from("purchase_orders")
      .select("id, po_number, branch_id, status, expected_date, suppliers(name)")
      .in("status", ["pending_approval", "approved", "ordered", "partially_received"]),
    supabaseAdmin
      .from("receivables")
      .select("id, invoice_number, branch_id, customer_id, due_date, balance, customers(name)")
      .gt("balance", 0)
      .neq("status", "paid"),
    supabaseAdmin
      .from("v_supplier_payables_due")
      .select("purchase_order_id, po_number, branch_id, supplier_id, supplier_name, due_date, balance_due")
      .gt("balance_due", 0),
    supabaseAdmin
      .from("cash_shifts")
      .select("id, shift_number, branch_id, cashier_id, opened_at, status")
      .eq("status", "open"),
    supabaseAdmin
      .from("customer_warranty_records")
      .select("id, warranty_number, expiry_date, sales(branch_id), customers(name, branch_id), products(name)")
      .eq("status", "active")
      .not("expiry_date", "is", null),
  ]);

  if (inventoryResult.error) throw inventoryResult.error;
  if (purchaseOrdersResult.error) throw purchaseOrdersResult.error;
  if (receivablesResult.error) throw receivablesResult.error;
  if (supplierDueResult.error) throw supplierDueResult.error;
  if (shiftsResult.error) throw shiftsResult.error;
  if (warrantyResult.error) throw warrantyResult.error;

  const tasks: Array<Promise<unknown>> = [];

  for (const row of (inventoryResult.data ?? []) as Array<{
    product_id: string;
    branch_id: string;
    quantity: number;
  }>) {
    if (branchId && row.branch_id !== branchId) continue;
    tasks.push(
      syncStockAlertForLevel({
        productId: row.product_id,
        branchId: row.branch_id,
        quantityAfter: parseNumber(row.quantity),
      })
    );
  }

  for (const row of (purchaseOrdersResult.data ?? []) as Array<{
    id: string;
    po_number: string;
    branch_id: string;
    status: string;
    expected_date?: string | null;
    suppliers?: { name?: string | null } | null;
  }>) {
    if (branchId && row.branch_id !== branchId) continue;
    const targetDate = row.expected_date ? new Date(`${row.expected_date}T00:00:00`) : null;
    if (!targetDate || targetDate.getTime() > today.getTime()) continue;

    tasks.push(
      createOperationalNotification({
        type: "pending_po",
        branchId: row.branch_id,
        title: "Pending purchase order alert",
        message: `PO ${row.po_number} for ${row.suppliers?.name ?? "supplier"} is still pending fulfillment.`,
        severity: "warning",
        referenceType: "purchase_order",
        referenceId: row.id,
        dedupeKey: `pending_po:${row.id}:${todayIso}`,
        metadata: { expected_date: row.expected_date, status: row.status },
        actionUrl: "/purchasing",
      })
    );
  }

  for (const row of (receivablesResult.data ?? []) as Array<{
    id: string;
    invoice_number: string;
    branch_id: string;
    due_date?: string | null;
    balance?: number | string | null;
    customers?: { name?: string | null } | null;
  }>) {
    if (branchId && row.branch_id !== branchId) continue;
    if (!row.due_date) continue;

    const dueDate = new Date(`${row.due_date}T00:00:00`);
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + creditDueDays);
    if (dueDate.getTime() > thresholdDate.getTime()) continue;

    tasks.push(
      createOperationalNotification({
        type: "credit_due",
        branchId: row.branch_id,
        title: "Customer credit due alert",
        message: `${row.customers?.name ?? "Customer"} has receivable ${row.invoice_number} due on ${row.due_date}.`,
        severity: dueDate.getTime() < today.getTime() ? "critical" : "warning",
        referenceType: "receivable",
        referenceId: row.id,
        dedupeKey: `credit_due:${row.id}:${todayIso}`,
        metadata: { due_date: row.due_date, balance: parseNumber(row.balance) },
        actionUrl: "/receivables",
      })
    );
  }

  for (const row of (supplierDueResult.data ?? []) as Array<{
    purchase_order_id: string;
    po_number: string;
    branch_id: string;
    supplier_name?: string | null;
    due_date?: string | null;
    balance_due?: number | string | null;
  }>) {
    if (branchId && row.branch_id !== branchId) continue;
    if (!row.due_date) continue;

    const dueDate = new Date(`${row.due_date}T00:00:00`);
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + supplierDueDays);
    if (dueDate.getTime() > thresholdDate.getTime()) continue;

    tasks.push(
      createOperationalNotification({
        type: "supplier_payment_due",
        branchId: row.branch_id,
        title: "Supplier payment due alert",
        message: `Supplier payment for PO ${row.po_number} is due on ${row.due_date}.`,
        severity: dueDate.getTime() < today.getTime() ? "critical" : "warning",
        referenceType: "purchase_order",
        referenceId: row.purchase_order_id,
        dedupeKey: `supplier_payment_due:${row.purchase_order_id}:${todayIso}`,
        metadata: { due_date: row.due_date, balance_due: parseNumber(row.balance_due) },
        actionUrl: "/payables",
      })
    );
  }

  for (const row of (shiftsResult.data ?? []) as Array<{
    id: string;
    shift_number?: string | null;
    branch_id: string;
    opened_at: string;
  }>) {
    if (branchId && row.branch_id !== branchId) continue;
    const openedAt = new Date(row.opened_at);
    const hoursOpen = (Date.now() - openedAt.getTime()) / (1000 * 60 * 60);
    if (hoursOpen < shiftClosingHours) continue;

    tasks.push(
      createOperationalNotification({
        type: "shift_closing",
        branchId: row.branch_id,
        title: "Shift closing reminder",
        message: `Shift ${row.shift_number ?? "open shift"} has been open for ${hoursOpen.toFixed(1)} hours.`,
        severity: hoursOpen >= shiftClosingHours + 2 ? "critical" : "warning",
        referenceType: "cash_shift",
        referenceId: row.id,
        dedupeKey: `shift_closing:${row.id}:${todayIso}`,
        metadata: { opened_at: row.opened_at, hours_open: hoursOpen },
        actionUrl: "/pos",
      })
    );
  }

  for (const row of (warrantyResult.data ?? []) as Array<{
    id: string;
    warranty_number: string;
    expiry_date?: string | null;
    sales?: { branch_id?: string | null } | null;
    customers?: { name?: string | null; branch_id?: string | null } | null;
    products?: { name?: string | null } | null;
  }>) {
    const resolvedBranchId = row.sales?.branch_id ?? row.customers?.branch_id ?? null;
    if (!resolvedBranchId) continue;
    if (branchId && resolvedBranchId !== branchId) continue;
    if (!row.expiry_date) continue;

    const expiryDate = new Date(`${row.expiry_date}T00:00:00`);
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + warrantyDays);
    if (expiryDate.getTime() > thresholdDate.getTime()) continue;

    tasks.push(
      createOperationalNotification({
        type: "expiring_warranty",
        branchId: resolvedBranchId,
        title: "Expiring warranty alert",
        message: `Warranty ${row.warranty_number} for ${row.products?.name ?? "product"} expires on ${row.expiry_date}.`,
        severity: expiryDate.getTime() < today.getTime() ? "critical" : "info",
        referenceType: "customer_warranty_record",
        referenceId: row.id,
        dedupeKey: `expiring_warranty:${row.id}:${todayIso}`,
        metadata: {
          expiry_date: row.expiry_date,
          customer_name: row.customers?.name ?? null,
          product_name: row.products?.name ?? null,
        },
        actionUrl: "/returns",
      })
    );
  }

  await Promise.all(tasks);
  return { processed: tasks.length };
}
