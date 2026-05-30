"use client";

import { useDeferredValue, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Printer,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  Truck,
  UserRound,
  Wallet,
} from "lucide-react";
import { useRbac } from "@/components/RbacProvider";
import { supabase } from "@/lib/supabase";
import {
  EXPENSE_PAYMENT_METHOD_OPTIONS,
  EXPENSE_STATUS_OPTIONS,
  EXPENSE_TYPE_OPTIONS,
  formatCurrency,
  formatDate,
  formatLabel,
  formatUserName,
  monthKey,
  parseNumber,
  type ExpenseCategoryRow,
  type ExpensePaymentMethod,
  type ExpenseRow,
  type ExpensesSnapshot,
  type ExpenseStatus,
  type ExpenseType,
  type StaffUserRow,
} from "@/lib/expenses";

type FormState = {
  id: string | null;
  branchId: string;
  expenseCategoryId: string;
  supplierId: string;
  staffUserId: string;
  expenseType: ExpenseType;
  amount: string;
  description: string;
  expenseDate: string;
  paymentMethod: ExpensePaymentMethod;
  receiptUrl: string;
  receiptFileName: string;
  referenceNumber: string;
  approvalNotes: string;
  status: ExpenseStatus;
};

type WorkspaceTab = "entries" | "approvals" | "reports";

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartInput() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function buildEmptyForm(branchId = ""): FormState {
  return {
    id: null,
    branchId,
    expenseCategoryId: "",
    supplierId: "",
    staffUserId: "",
    expenseType: "operating",
    amount: "",
    description: "",
    expenseDate: todayInput(),
    paymentMethod: "cash",
    receiptUrl: "",
    receiptFileName: "",
    referenceNumber: "",
    approvalNotes: "",
    status: "pending",
  };
}

function statusTone(status: ExpenseStatus) {
  if (status === "approved") return "green";
  if (status === "rejected") return "red";
  return "amber";
}

function countByStatus(expenses: ExpenseRow[], status: ExpenseStatus) {
  return expenses.filter((expense) => expense.status === status).length;
}

function sumExpenses(expenses: ExpenseRow[]) {
  return expenses.reduce((sum, expense) => sum + parseNumber(expense.amount), 0);
}

function escapeCsvCell(value: unknown) {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export default function ExpensesClient() {
  const { can, canAny } = useRbac();
  const [snapshot, setSnapshot] = useState<ExpensesSnapshot | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [fromDate, setFromDate] = useState(monthStartInput());
  const [toDate, setToDate] = useState(todayInput());
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<ExpenseType | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("entries");
  const [form, setForm] = useState<FormState>(buildEmptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const loadSnapshot = async (branchId = selectedBranchId) => {
    setLoading(true);
    setError("");

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setError("Please sign in to manage expenses.");
      setLoading(false);
      return;
    }

    const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
    const response = await fetch(`/api/expenses${query}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = (await response.json()) as ExpensesSnapshot & { error?: string };
    if (!response.ok) {
      setError(payload.error || "Unable to load expenses workspace.");
      setLoading(false);
      return;
    }

    const defaultBranchId =
      branchId ||
      payload.actor.branchId ||
      payload.branches.find((item) => item.is_main)?.id ||
      payload.branches[0]?.id ||
      "";

    setSnapshot(payload);
    setSelectedBranchId(defaultBranchId);
    setForm((current) => ({
      ...current,
      branchId: current.branchId || defaultBranchId,
    }));
    setLoading(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSnapshot("");
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryMap = useMemo(
    () => new Map((snapshot?.categories ?? []).map((category) => [category.id, category])),
    [snapshot]
  );
  const supplierMap = useMemo(
    () => new Map((snapshot?.suppliers ?? []).map((supplier) => [supplier.id, supplier])),
    [snapshot]
  );
  const staffMap = useMemo(
    () => new Map((snapshot?.staff ?? []).map((staff) => [staff.id, staff])),
    [snapshot]
  );
  const branchMap = useMemo(
    () => new Map((snapshot?.branches ?? []).map((branch) => [branch.id, branch])),
    [snapshot]
  );

  const filteredExpenses = useMemo(() => {
    const rows = snapshot?.expenses ?? [];
    return rows.filter((expense) => {
      if (selectedBranchId && expense.branch_id !== selectedBranchId) return false;
      if (statusFilter !== "all" && expense.status !== statusFilter) return false;
      if (typeFilter !== "all" && expense.expense_type !== typeFilter) return false;
      if (categoryFilter !== "all" && expense.expense_category_id !== categoryFilter) return false;
      if (fromDate && expense.expense_date < fromDate) return false;
      if (toDate && expense.expense_date > toDate) return false;
      if (!deferredSearch) return true;

      const categoryName = categoryMap.get(expense.expense_category_id ?? "")?.name ?? "";
      const supplierName = supplierMap.get(expense.supplier_id ?? "")?.name ?? "";
      const staffName = formatUserName(staffMap.get(expense.staff_user_id ?? "") ?? null);
      const haystack = [
        expense.description,
        expense.reference_number,
        expense.expense_type,
        categoryName,
        supplierName,
        staffName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(deferredSearch);
    });
  }, [
    snapshot,
    selectedBranchId,
    statusFilter,
    typeFilter,
    categoryFilter,
    fromDate,
    toDate,
    deferredSearch,
    categoryMap,
    supplierMap,
    staffMap,
  ]);

  const pendingExpenses = useMemo(
    () => filteredExpenses.filter((expense) => expense.status === "pending"),
    [filteredExpenses]
  );

  const monthlyReport = useMemo(() => {
    const totals = new Map<string, { amount: number; sortKey: string }>();
    filteredExpenses.forEach((expense) => {
      const key = monthKey(expense.expense_date);
      const sortKey = expense.expense_date.slice(0, 7);
      const existing = totals.get(key) ?? { amount: 0, sortKey };
      existing.amount += parseNumber(expense.amount);
      totals.set(key, existing);
    });
    return Array.from(totals.entries())
      .map(([month, meta]) => ({ month, amount: meta.amount, sortKey: meta.sortKey }))
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey));
  }, [filteredExpenses]);

  const categoryReport = useMemo(() => {
    const totals = new Map<string, { label: string; amount: number; count: number }>();
    filteredExpenses.forEach((expense) => {
      const category = categoryMap.get(expense.expense_category_id ?? "") as ExpenseCategoryRow | undefined;
      const key = expense.expense_category_id ?? expense.expense_type;
      const existing = totals.get(key) ?? {
        label: category?.name ?? formatLabel(expense.expense_type),
        amount: 0,
        count: 0,
      };
      existing.amount += parseNumber(expense.amount);
      existing.count += 1;
      totals.set(key, existing);
    });
    return Array.from(totals.values()).sort((left, right) => right.amount - left.amount);
  }, [filteredExpenses, categoryMap]);

  const approvalRate = filteredExpenses.length
    ? (countByStatus(filteredExpenses, "approved") / filteredExpenses.length) * 100
    : 0;

  const kpis = [
    {
      label: "Approved Spend",
      value: formatCurrency(
        sumExpenses(filteredExpenses.filter((expense) => expense.status === "approved"))
      ),
      sub: `${countByStatus(filteredExpenses, "approved")} approved records`,
      icon: Wallet,
      tone: "green",
    },
    {
      label: "Pending Review",
      value: String(countByStatus(filteredExpenses, "pending")),
      sub: `${formatCurrency(sumExpenses(pendingExpenses))} waiting approval`,
      icon: ShieldCheck,
      tone: "amber",
    },
    {
      label: "Supplier Payments",
      value: formatCurrency(
        sumExpenses(filteredExpenses.filter((expense) => expense.expense_type === "supplier_payment"))
      ),
      sub: `${filteredExpenses.filter((expense) => expense.expense_type === "supplier_payment").length} payment entries`,
      icon: Truck,
      tone: "blue",
    },
    {
      label: "Payroll + Rent",
      value: formatCurrency(
        sumExpenses(
          filteredExpenses.filter((expense) => expense.expense_type === "salary" || expense.expense_type === "rent")
        )
      ),
      sub: `${approvalRate.toFixed(1)}% approval rate`,
      icon: UserRound,
      tone: "purple",
    },
  ];

  const resetForm = () => {
    setForm(buildEmptyForm(selectedBranchId));
  };

  const populateForm = (expense: ExpenseRow) => {
    setForm({
      id: expense.id,
      branchId: expense.branch_id,
      expenseCategoryId: expense.expense_category_id ?? "",
      supplierId: expense.supplier_id ?? "",
      staffUserId: expense.staff_user_id ?? "",
      expenseType: expense.expense_type,
      amount: String(parseNumber(expense.amount) || ""),
      description: expense.description,
      expenseDate: expense.expense_date,
      paymentMethod: (expense.payment_method ?? "cash") as ExpensePaymentMethod,
      receiptUrl: expense.receipt_url ?? "",
      receiptFileName: expense.receipt_file_name ?? "",
      referenceNumber: expense.reference_number ?? "",
      approvalNotes: expense.approval_notes ?? "",
      status: expense.status,
    });
    setWorkspaceTab(expense.status === "pending" ? "approvals" : "entries");
  };

  const authHeaders = async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  };

  const uploadReceipt = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingReceipt(true);
    setError("");

    try {
      const headers = await authHeaders();
      const body = new FormData();
      body.append("file", file);
      if (form.id) body.append("expenseId", form.id);

      const response = await fetch("/api/expenses/upload-receipt", {
        method: "POST",
        headers,
        body,
      });

      const payload = (await response.json()) as { error?: string; url?: string; fileName?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to upload receipt.");
      }

      setForm((current) => ({
        ...current,
        receiptUrl: payload.url ?? current.receiptUrl,
        receiptFileName: payload.fileName ?? current.receiptFileName,
      }));
      setNotice("Receipt uploaded successfully.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload receipt.");
    } finally {
      setUploadingReceipt(false);
      event.target.value = "";
    }
  };

  const submitExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const headers = await authHeaders();
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          action: form.id ? "update_expense" : "create_expense",
          expenseId: form.id,
          branchId: form.branchId,
          expenseCategoryId: form.expenseCategoryId || null,
          supplierId: form.supplierId || null,
          staffUserId: form.staffUserId || null,
          expenseType: form.expenseType,
          amount: form.amount,
          description: form.description,
          expenseDate: form.expenseDate,
          paymentMethod: form.paymentMethod,
          receiptUrl: form.receiptUrl || null,
          receiptFileName: form.receiptFileName || null,
          referenceNumber: form.referenceNumber || null,
          approvalNotes: form.approvalNotes || null,
          status: form.status,
        }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to save expense.");
      }

      setNotice(payload.message || "Expense saved.");
      resetForm();
      await loadSnapshot(selectedBranchId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save expense.");
    } finally {
      setSaving(false);
    }
  };

  const changeApproval = async (expenseId: string, action: "approve_expense" | "reject_expense") => {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const headers = await authHeaders();
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          action,
          expenseId,
          approvalNotes: form.id === expenseId ? form.approvalNotes : null,
        }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to update approval.");
      }

      setNotice(payload.message || "Expense updated.");
      if (form.id === expenseId) resetForm();
      await loadSnapshot(selectedBranchId);
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "Unable to update approval.");
    } finally {
      setSaving(false);
    }
  };

  const deleteExpense = async (expenseId: string) => {
    if (!window.confirm("Delete this expense record? This will also remove any linked supplier payment.")) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const headers = await authHeaders();
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          action: "delete_expense",
          expenseId,
        }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to delete expense.");
      }

      setNotice(payload.message || "Expense deleted.");
      if (form.id === expenseId) resetForm();
      await loadSnapshot(selectedBranchId);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete expense.");
    } finally {
      setSaving(false);
    }
  };

  const exportExpenseReportCsv = () => {
    const rows = filteredExpenses.map((expense) => {
      const category = categoryMap.get(expense.expense_category_id ?? "")?.name ?? "";
      const supplier = supplierMap.get(expense.supplier_id ?? "")?.name ?? "";
      const staff = expense.staff_user_id ? formatUserName(staffMap.get(expense.staff_user_id ?? "") ?? null) : "";
      const branch = branchMap.get(expense.branch_id)?.name ?? "";

      return [
        expense.expense_date,
        branch,
        formatLabel(expense.status),
        formatLabel(expense.expense_type),
        category,
        supplier,
        staff,
        parseNumber(expense.amount).toFixed(2),
        expense.reference_number ?? "",
        expense.description,
        expense.receipt_url ?? "",
      ]
        .map(escapeCsvCell)
        .join(",");
    });

    const header = [
      "Expense Date",
      "Branch",
      "Status",
      "Expense Type",
      "Category",
      "Supplier",
      "Staff",
      "Amount",
      "Reference Number",
      "Description",
      "Receipt URL",
    ].join(",");

    const csvContent = [header, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `expense-report-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printExpenseReport = () => {
    const branchName = branchMap.get(selectedBranchId)?.name ?? "All Branches";
    const summaryRows = categoryReport
      .map(
        (row) =>
          `<tr><td>${row.label}</td><td>${row.count}</td><td style="text-align:right">${formatCurrency(row.amount)}</td></tr>`
      )
      .join("");

    const detailRows = filteredExpenses
      .map((expense) => {
        const category = categoryMap.get(expense.expense_category_id ?? "")?.name ?? formatLabel(expense.expense_type);
        return `<tr>
          <td>${formatDate(expense.expense_date)}</td>
          <td>${expense.description}</td>
          <td>${category}</td>
          <td>${formatLabel(expense.status)}</td>
          <td style="text-align:right">${formatCurrency(parseNumber(expense.amount))}</td>
        </tr>`;
      })
      .join("");

    const printWindow = window.open("", "_blank", "width=1080,height=720");
    if (!printWindow) {
      setError("Unable to open the print window. Please allow pop-ups for this site.");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Expense Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #0f172a; }
            h1, h2 { margin: 0 0 8px; }
            p { color: #475569; margin: 0 0 18px; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px; font-size: 12px; vertical-align: top; }
            th { background: #eff6ff; text-align: left; }
            .meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 18px 0; }
            .card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; }
            .card span { display: block; font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
            .card strong { font-size: 18px; }
          </style>
        </head>
        <body>
          <h1>Expense Report</h1>
          <p>${branchName} • ${formatDate(fromDate)} to ${formatDate(toDate)}</p>
          <div class="meta">
            <div class="card"><span>Total Expenses</span><strong>${filteredExpenses.length}</strong></div>
            <div class="card"><span>Approved Spend</span><strong>${formatCurrency(sumExpenses(filteredExpenses.filter((expense) => expense.status === "approved")))}</strong></div>
            <div class="card"><span>Pending Count</span><strong>${pendingExpenses.length}</strong></div>
          </div>

          <h2>Category Summary</h2>
          <table>
            <thead>
              <tr><th>Category</th><th>Entries</th><th style="text-align:right">Amount</th></tr>
            </thead>
            <tbody>${summaryRows || '<tr><td colspan="3">No summary data available.</td></tr>'}</tbody>
          </table>

          <h2 style="margin-top:28px;">Expense Details</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Description</th><th>Category</th><th>Status</th><th style="text-align:right">Amount</th></tr>
            </thead>
            <tbody>${detailRows || '<tr><td colspan="5">No expense data available.</td></tr>'}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (loading && !snapshot) {
    return (
      <div className="expenses-state-card">
        <LoaderCircle className="expenses-spin" size={18} />
        <span>Loading expenses workspace...</span>
      </div>
    );
  }

  return (
    <div className="expenses-workspace">
      <section className="expenses-hero">
        <div>
          <div className="expenses-hero__eyebrow">Module 12</div>
          <h1>Expenses Management</h1>
          <p>Capture day-to-day operating spend, supplier disbursements, payroll, rent, utilities, delivery costs, and approvals from one workspace.</p>
        </div>

        <div className="expenses-hero__controls">
          <label className="expenses-field">
            <span>Branch</span>
            <select
              value={selectedBranchId}
              onChange={(event) => {
                const nextBranchId = event.target.value;
                setSelectedBranchId(nextBranchId);
                setForm((current) => ({ ...current, branchId: nextBranchId }));
                void loadSnapshot(nextBranchId);
              }}
            >
              {(snapshot?.branches ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="expenses-button expenses-button--ghost"
            onClick={() => void loadSnapshot(selectedBranchId)}
            disabled={loading}
          >
            <RefreshCcw size={14} className={loading ? "expenses-spin" : ""} />
            Refresh
          </button>
        </div>
      </section>

      {error ? (
        <div className="expenses-alert expenses-alert--error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {notice ? (
        <div className="expenses-alert expenses-alert--success">
          <BadgeCheck size={16} />
          <span>{notice}</span>
        </div>
      ) : null}

      <section className="expenses-kpis">
        {kpis.map(({ label, value, sub, icon: Icon, tone }) => (
          <article key={label} className="expenses-kpi">
            <div className={`expenses-kpi__icon expenses-kpi__icon--${tone}`}>
              <Icon size={18} />
            </div>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{sub}</small>
            </div>
          </article>
        ))}
      </section>

      <section className="expenses-grid">
        <article className="expenses-panel">
          <div className="expenses-panel__head">
            <div>
              <h2>{form.id ? "Edit Expense" : "Record Expense"}</h2>
              <p>Daily expenses, staff salary, supplier settlement, receipts, and approval notes all live here.</p>
            </div>
            {form.id ? (
              <button type="button" className="expenses-button expenses-button--ghost" onClick={resetForm}>
                Clear
              </button>
            ) : null}
          </div>

          <form className="expenses-form" onSubmit={submitExpense}>
            <div className="expenses-form__grid">
              <label className="expenses-field">
                <span>Expense Type</span>
                <select
                  value={form.expenseType}
                  onChange={(event) => setForm((current) => ({ ...current, expenseType: event.target.value as ExpenseType }))}
                >
                  {EXPENSE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="expenses-field">
                <span>Category</span>
                <select
                  value={form.expenseCategoryId}
                  onChange={(event) => setForm((current) => ({ ...current, expenseCategoryId: event.target.value }))}
                >
                  <option value="">No category</option>
                  {(snapshot?.categories ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="expenses-field">
                <span>Amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                  placeholder="0.00"
                  required
                />
              </label>

              <label className="expenses-field">
                <span>Expense Date</span>
                <input
                  type="date"
                  value={form.expenseDate}
                  onChange={(event) => setForm((current) => ({ ...current, expenseDate: event.target.value }))}
                  required
                />
              </label>

              <label className="expenses-field">
                <span>Payment Method</span>
                <select
                  value={form.paymentMethod}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, paymentMethod: event.target.value as ExpensePaymentMethod }))
                  }
                >
                  {EXPENSE_PAYMENT_METHOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="expenses-field">
                <span>Reference No.</span>
                <input
                  value={form.referenceNumber}
                  onChange={(event) => setForm((current) => ({ ...current, referenceNumber: event.target.value }))}
                  placeholder="Cheque no., transfer ref, bill no."
                />
              </label>

              <label className="expenses-field expenses-field--full">
                <span>Description</span>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="What was this expense for?"
                  rows={4}
                  required
                />
              </label>

              {(form.expenseType === "supplier_payment" || form.expenseType === "delivery") ? (
                <label className="expenses-field">
                  <span>Supplier</span>
                  <select
                    value={form.supplierId}
                    onChange={(event) => setForm((current) => ({ ...current, supplierId: event.target.value }))}
                    required={form.expenseType === "supplier_payment"}
                  >
                    <option value="">Select supplier</option>
                    {(snapshot?.suppliers ?? []).map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {form.expenseType === "salary" ? (
                <label className="expenses-field">
                  <span>Staff Member</span>
                  <select
                    value={form.staffUserId}
                    onChange={(event) => setForm((current) => ({ ...current, staffUserId: event.target.value }))}
                    required
                  >
                    <option value="">Select staff</option>
                    {(snapshot?.staff ?? []).map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {formatUserName(staff as StaffUserRow)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="expenses-field expenses-field--full">
                <span>Receipt Attachment</span>
                <div className="expenses-receipt">
                  <input type="file" accept="image/*,.pdf" onChange={uploadReceipt} disabled={uploadingReceipt} />
                  {form.receiptFileName ? <strong>{form.receiptFileName}</strong> : <em>No receipt uploaded yet.</em>}
                  {form.receiptUrl ? (
                    <a href={form.receiptUrl} target="_blank" rel="noreferrer">
                      View receipt
                    </a>
                  ) : null}
                </div>
              </label>

              {canAny("expenses:approve", "expenses:manage") ? (
                <>
                  <label className="expenses-field">
                    <span>Status</span>
                    <select
                      value={form.status}
                      onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ExpenseStatus }))}
                    >
                      {EXPENSE_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="expenses-field">
                    <span>Approval Notes</span>
                    <input
                      value={form.approvalNotes}
                      onChange={(event) => setForm((current) => ({ ...current, approvalNotes: event.target.value }))}
                      placeholder="Optional approval or rejection note"
                    />
                  </label>
                </>
              ) : null}
            </div>

            <div className="expenses-form__actions">
              <button type="submit" className="expenses-button expenses-button--primary" disabled={saving || uploadingReceipt}>
                {saving ? <LoaderCircle size={14} className="expenses-spin" /> : <ReceiptText size={14} />}
                {form.id ? "Update Expense" : "Save Expense"}
              </button>
              <button type="button" className="expenses-button expenses-button--ghost" onClick={resetForm}>
                Reset
              </button>
            </div>
          </form>
        </article>

        <aside className="expenses-panel expenses-panel--side">
          <div className="expenses-panel__head">
            <div>
              <h2>Quick Summary</h2>
              <p>Track who needs approval, where spend is concentrating, and which operational buckets are growing.</p>
            </div>
          </div>

          <div className="expenses-side-stats">
            <div className="expenses-side-stat">
              <span>Approval Queue</span>
              <strong>{pendingExpenses.length}</strong>
              <small>{formatCurrency(sumExpenses(pendingExpenses))}</small>
            </div>
            <div className="expenses-side-stat">
              <span>Delivery Spend</span>
              <strong>
                {formatCurrency(
                  sumExpenses(filteredExpenses.filter((expense) => expense.expense_type === "delivery"))
                )}
              </strong>
              <small>{filteredExpenses.filter((expense) => expense.expense_type === "delivery").length} entries</small>
            </div>
            <div className="expenses-side-stat">
              <span>Utilities + Rent</span>
              <strong>
                {formatCurrency(
                  sumExpenses(
                    filteredExpenses.filter(
                      (expense) => expense.expense_type === "utilities" || expense.expense_type === "rent"
                    )
                  )
                )}
              </strong>
              <small>Core operating overhead</small>
            </div>
          </div>

          <div className="expenses-ranking">
            <h3>Top Categories</h3>
            {categoryReport.slice(0, 5).map((row) => (
              <div key={row.label} className="expenses-ranking__row">
                <span>{row.label}</span>
                <strong>{formatCurrency(row.amount)}</strong>
                <small>{row.count} entries</small>
              </div>
            ))}
            {!categoryReport.length ? <div className="expenses-empty expenses-empty--compact">No expenses matched the active filters.</div> : null}
          </div>
        </aside>
      </section>

      <section className="expenses-panel">
        <div className="expenses-panel__head">
          <div>
            <h2>Expense Register</h2>
            <p>Switch between transaction review, approval queue, and summary reporting without leaving the module.</p>
          </div>

          <div className="expenses-toolbar">
            <div className="expenses-tabs">
              {[
                { key: "entries", label: "Entries" },
                { key: "approvals", label: "Approvals" },
                { key: "reports", label: "Reports" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`expenses-tab ${workspaceTab === tab.key ? "expenses-tab--active" : ""}`}
                  onClick={() => setWorkspaceTab(tab.key as WorkspaceTab)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="expenses-filters">
          <label className="expenses-field">
            <span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Description, ref no., supplier..." />
          </label>

          <label className="expenses-field">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ExpenseStatus | "all")}>
              <option value="all">All statuses</option>
              {EXPENSE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="expenses-field">
            <span>Type</span>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as ExpenseType | "all")}>
              <option value="all">All types</option>
              {EXPENSE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="expenses-field">
            <span>Category</span>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">All categories</option>
              {(snapshot?.categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="expenses-field">
            <span>From</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>

          <label className="expenses-field">
            <span>To</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
        </div>

        {workspaceTab === "entries" ? (
          <div className="expenses-table-wrap">
            <table className="expenses-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Branch</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Receipt</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.length ? (
                  filteredExpenses.map((expense) => {
                    const category = categoryMap.get(expense.expense_category_id ?? "");
                    const supplier = supplierMap.get(expense.supplier_id ?? "");
                    const staff = staffMap.get(expense.staff_user_id ?? "");
                    const branch = branchMap.get(expense.branch_id);
                    return (
                      <tr key={expense.id}>
                        <td>{formatDate(expense.expense_date)}</td>
                        <td>
                          <div className="expenses-table__primary">{expense.description}</div>
                          <div className="expenses-table__meta">
                            {category?.name ?? formatLabel(expense.expense_type)}
                            {supplier?.name ? ` • ${supplier.name}` : ""}
                            {expense.staff_user_id ? ` • ${formatUserName(staff as StaffUserRow)}` : ""}
                          </div>
                        </td>
                        <td>{formatLabel(expense.expense_type)}</td>
                        <td>{branch?.name ?? "-"}</td>
                        <td className="expenses-table__amount">{formatCurrency(parseNumber(expense.amount))}</td>
                        <td>
                          <span className={`expenses-status expenses-status--${statusTone(expense.status)}`}>{formatLabel(expense.status)}</span>
                        </td>
                        <td>
                          {expense.receipt_url ? (
                            <a href={expense.receipt_url} target="_blank" rel="noreferrer" className="expenses-link">
                              View
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>
                          <div className="expenses-actions">
                            {canAny("expenses:edit", "expenses:manage", "expenses:approve") ? (
                              <button type="button" onClick={() => populateForm(expense)}>
                                Edit
                              </button>
                            ) : null}
                            {can("expenses:manage") ? (
                              <button type="button" onClick={() => void deleteExpense(expense.id)}>
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="expenses-empty">
                      No expenses matched the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {workspaceTab === "approvals" ? (
          <div className="expenses-approval-grid">
            {pendingExpenses.length ? (
              pendingExpenses.map((expense) => {
                const category = categoryMap.get(expense.expense_category_id ?? "");
                const supplier = supplierMap.get(expense.supplier_id ?? "");
                const staff = staffMap.get(expense.staff_user_id ?? "");
                const branch = branchMap.get(expense.branch_id);
                return (
                  <article key={expense.id} className="expenses-approval-card">
                    <div className="expenses-approval-card__top">
                      <div>
                        <strong>{expense.description}</strong>
                        <p>{branch?.name ?? "-"} • {formatDate(expense.expense_date)}</p>
                      </div>
                      <span>{formatCurrency(parseNumber(expense.amount))}</span>
                    </div>
                    <div className="expenses-approval-card__meta">
                      <div>
                        <span>Type</span>
                        <strong>{formatLabel(expense.expense_type)}</strong>
                      </div>
                      <div>
                        <span>Category</span>
                        <strong>{category?.name ?? "-"}</strong>
                      </div>
                      <div>
                        <span>Supplier / Staff</span>
                        <strong>{supplier?.name ?? (expense.staff_user_id ? formatUserName(staff as StaffUserRow) : "-")}</strong>
                      </div>
                      <div>
                        <span>Reference</span>
                        <strong>{expense.reference_number ?? "-"}</strong>
                      </div>
                    </div>
                    <div className="expenses-approval-card__actions">
                      {expense.receipt_url ? (
                        <a href={expense.receipt_url} target="_blank" rel="noreferrer" className="expenses-button expenses-button--ghost">
                          View Receipt
                        </a>
                      ) : (
                        <span className="expenses-approval-card__empty">No receipt attached</span>
                      )}
                      {canAny("expenses:approve", "expenses:manage") ? (
                        <div className="expenses-approval-card__buttons">
                          <button
                            type="button"
                            className="expenses-button expenses-button--approve"
                            disabled={saving}
                            onClick={() => void changeApproval(expense.id, "approve_expense")}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="expenses-button expenses-button--reject"
                            disabled={saving}
                            onClick={() => void changeApproval(expense.id, "reject_expense")}
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="expenses-empty expenses-empty--stack">
                <ShieldCheck size={18} />
                <span>No pending approvals in the current filter set.</span>
              </div>
            )}
          </div>
        ) : null}

        {workspaceTab === "reports" ? (
          <>
            <div className="expenses-report-actions">
              <button type="button" className="expenses-button expenses-button--ghost" onClick={exportExpenseReportCsv}>
                <Download size={14} />
                Export CSV
              </button>
              <button type="button" className="expenses-button expenses-button--ghost" onClick={printExpenseReport}>
                <Printer size={14} />
                Print Report
              </button>
            </div>

            <div className="expenses-report-grid">
              <article className="expenses-report-card">
                <div className="expenses-panel__head expenses-panel__head--tight">
                  <div>
                    <h3>Category Summary</h3>
                    <p>Where the money is going right now.</p>
                  </div>
                  <FileSpreadsheet size={16} />
                </div>
                <div className="expenses-report-list">
                  {categoryReport.length ? (
                    categoryReport.map((row) => (
                      <div key={row.label} className="expenses-report-row">
                        <span>{row.label}</span>
                        <strong>{formatCurrency(row.amount)}</strong>
                        <small>{row.count} entries</small>
                      </div>
                    ))
                  ) : (
                    <div className="expenses-empty expenses-empty--compact">No category data to report yet.</div>
                  )}
                </div>
              </article>

              <article className="expenses-report-card">
                <div className="expenses-panel__head expenses-panel__head--tight">
                  <div>
                    <h3>Monthly Trend</h3>
                    <p>Useful for rent, utilities, delivery, and payroll drift checks.</p>
                  </div>
                  <Building2 size={16} />
                </div>
                <div className="expenses-report-list">
                  {monthlyReport.length ? (
                    monthlyReport.map((row) => (
                      <div key={row.month} className="expenses-report-row">
                        <span>{row.month}</span>
                        <strong>{formatCurrency(row.amount)}</strong>
                      </div>
                    ))
                  ) : (
                    <div className="expenses-empty expenses-empty--compact">No monthly report data to show yet.</div>
                  )}
                </div>
              </article>

              <article className="expenses-report-card">
                <div className="expenses-panel__head expenses-panel__head--tight">
                  <div>
                    <h3>Approval Health</h3>
                    <p>Keep spend disciplined without slowing down operations.</p>
                  </div>
                  <CircleDollarSign size={16} />
                </div>
                <div className="expenses-health">
                  <div>
                    <span>Approval Rate</span>
                    <strong>{approvalRate.toFixed(1)}%</strong>
                  </div>
                  <div>
                    <span>Rejected Spend</span>
                    <strong>{formatCurrency(sumExpenses(filteredExpenses.filter((expense) => expense.status === "rejected")))}</strong>
                  </div>
                  <div>
                    <span>Pending Count</span>
                    <strong>{pendingExpenses.length}</strong>
                  </div>
                </div>
              </article>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
