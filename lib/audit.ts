export type AuditActivityKind =
  | "login_history"
  | "product_change"
  | "price_change"
  | "stock_adjustment"
  | "deleted_record"
  | "void_log"
  | "refund_log"
  | "user_activity";

export type AuditEventSource = "audit_logs" | "login_history";

export type AuditActivityRow = {
  event_source: AuditEventSource;
  activity_kind: AuditActivityKind;
  event_id: string;
  event_at: string;
  user_id?: string | null;
  actor_name?: string | null;
  branch_id?: string | null;
  branch_name?: string | null;
  module: string;
  action: string;
  reference_type?: string | null;
  reference_id?: string | null;
  summary: string;
  record_label?: string | null;
  event_payload?: Record<string, unknown> | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
};

export type AuditSummary = {
  total: number;
  logins: number;
  productChanges: number;
  priceChanges: number;
  stockAdjustments: number;
  deletedRecords: number;
  voids: number;
  refunds: number;
  userActivities: number;
};

export type AuditWorkspace = {
  actor: {
    profileId: string;
    branchId: string | null;
    roleName: string | null;
    dataAccessScope: string;
  };
  rows: AuditActivityRow[];
  branches: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string }>;
  summary: AuditSummary;
  total: number;
  page: number;
  limit: number;
};

function csvCell(value: unknown) {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);

  return `"${text.replace(/"/g, '""')}"`;
}

export function buildAuditCsv(rows: AuditActivityRow[]) {
  const header = [
    "Date",
    "Source",
    "Type",
    "Module",
    "Action",
    "User",
    "Branch",
    "Reference Type",
    "Reference ID",
    "Record Label",
    "Summary",
    "Old Values",
    "New Values",
  ];

  const lines = rows.map((row) =>
    [
      row.event_at,
      row.event_source,
      row.activity_kind,
      row.module,
      row.action,
      row.actor_name ?? "",
      row.branch_name ?? "",
      row.reference_type ?? "",
      row.reference_id ?? "",
      row.record_label ?? "",
      row.summary,
      row.old_values ?? {},
      row.new_values ?? {},
    ]
      .map(csvCell)
      .join(","),
  );

  return [header.map(csvCell).join(","), ...lines].join("\n");
}
