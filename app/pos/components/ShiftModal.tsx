"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  Printer,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type ShiftRecord = {
  id: string;
  shift_number?: string | null;
  status: string;
  branch_id?: string | null;
  cashier_id?: string | null;
  starting_cash?: number | string | null;
  total_cash_sales?: number | string | null;
  total_noncash?: number | string | null;
  cash_in_total?: number | string | null;
  cash_out_total?: number | string | null;
  expected_cash?: number | string | null;
  actual_cash?: number | string | null;
  cash_difference?: number | string | null;
  notes?: string | null;
  approval_notes?: string | null;
  approved_at?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  requiresApproval?: boolean;
};

type ShiftMovement = {
  id: string;
  type: "cash_in" | "cash_out";
  amount: number | string;
  reason?: string | null;
  reference_number?: string | null;
  created_at: string;
};

type ShiftPayload = {
  shift: ShiftRecord;
  movements: ShiftMovement[];
  paymentBreakdown: Array<{ method: string; amount: number }>;
};

type Props = {
  branchId: string;
  cashierId: string;
  cashierName: string;
  currentShiftId: string | null;
  expectedCash: number;
  onClose: () => void;
  onSuccess: (shiftId: string | null) => void;
};

function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function fmt(value: number) {
  return `P${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export default function ShiftModal({
  branchId,
  cashierId,
  cashierName,
  currentShiftId,
  expectedCash,
  onClose,
  onSuccess,
}: Props) {
  const [startingCash, setStartingCash] = useState("0");
  const [actualCash, setActualCash] = useState(expectedCash.toFixed(2));
  const [notes, setNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shiftPayload, setShiftPayload] = useState<ShiftPayload | null>(null);
  const [movementType, setMovementType] = useState<"cash_in" | "cash_out">("cash_in");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [movementReference, setMovementReference] = useState("");
  const [approverUsername, setApproverUsername] = useState("");
  const [approverPin, setApproverPin] = useState("");
  const [approvalNotes, setApprovalNotes] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadShift = async () => {
      if (!currentShiftId) {
        setShiftPayload(null);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/pos/shift?shiftId=${encodeURIComponent(currentShiftId)}`, {
          headers: await getAuthHeaders(),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load shift details.");

        if (!isMounted) return;
        setShiftPayload(data as ShiftPayload);
        const loadedExpectedCash = parseNumber((data as ShiftPayload).shift.expected_cash);
        setActualCash(loadedExpectedCash.toFixed(2));
        setNotes(String((data as ShiftPayload).shift.notes ?? ""));
      } catch (err: unknown) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadShift();

    return () => {
      isMounted = false;
    };
  }, [currentShiftId]);

  async function postShiftAction(payload: Record<string, unknown>) {
    const response = await fetch("/api/pos/shift", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Shift action failed.");
    }

    return data;
  }

  async function handleOpenShift() {
    setError("");
    setProcessing(true);

    try {
      const data = await postShiftAction({
        action: "open_shift",
        branchId,
        cashierId,
        startingCash: parseFloat(startingCash) || 0,
        notes: notes.trim() || null,
      });

      onSuccess((data.shift as ShiftRecord | undefined)?.id ?? null);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setProcessing(false);
    }
  }

  async function handleAddMovement() {
    if (!currentShiftId) return;

    setError("");
    setProcessing(true);

    try {
      const data = await postShiftAction({
        action: "add_movement",
        shiftId: currentShiftId,
        cashierId,
        movementType,
        amount: parseFloat(movementAmount) || 0,
        reason: movementReason,
        referenceNumber: movementReference,
      });

      setShiftPayload(data as ShiftPayload);
      setMovementAmount("");
      setMovementReason("");
      setMovementReference("");
      setActualCash(parseNumber((data as ShiftPayload).shift.expected_cash).toFixed(2));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setProcessing(false);
    }
  }

  async function handleCloseShift() {
    if (!currentShiftId) return;

    setError("");
    setProcessing(true);

    try {
      const data = await postShiftAction({
        action: "close_shift",
        shiftId: currentShiftId,
        cashierId,
        actualCash: parseFloat(actualCash) || 0,
        notes,
      });

      setShiftPayload(data as ShiftPayload);
      setApprovalNotes(String(((data as ShiftPayload).shift.approval_notes ?? "")));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setProcessing(false);
    }
  }

  async function handleApproveShift() {
    if (!shiftPayload?.shift.id) return;

    setError("");
    setProcessing(true);

    try {
      const verifyResponse = await fetch("/api/auth/verify-pos-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: approverUsername,
          pin: approverPin,
          permissions: ["pos:manage"],
        }),
      });

      const verifyData = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(verifyData.error || "Manager approval failed.");

      const data = await postShiftAction({
        action: "approve_shift",
        shiftId: shiftPayload.shift.id,
        approverUserId: verifyData.approver.userId,
        approvalNotes,
      });

      setShiftPayload(data as ShiftPayload);
      setApproverUsername("");
      setApproverPin("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setProcessing(false);
    }
  }

  function handlePrintReport() {
    if (!shiftPayload?.shift) return;

    const shift = shiftPayload.shift;
    const breakdown = shiftPayload.paymentBreakdown
      .map((line) => `<tr><td>${line.method.replace(/_/g, " ")}</td><td style="text-align:right">${fmt(line.amount)}</td></tr>`)
      .join("");
    const movements = shiftPayload.movements
      .map((movement) => `
        <tr>
          <td>${movement.type === "cash_in" ? "Cash In" : "Cash Out"}</td>
          <td>${movement.reason ?? "-"}</td>
          <td>${movement.reference_number ?? "-"}</td>
          <td style="text-align:right">${fmt(parseNumber(movement.amount))}</td>
        </tr>
      `)
      .join("");

    const diff = parseNumber(shift.cash_difference);
    const html = `
      <html>
        <head>
          <title>Shift Report ${shift.shift_number ?? ""}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1, h2 { margin: 0 0 12px; }
            .meta, .summary { margin-bottom: 18px; }
            .row { display: flex; justify-content: space-between; margin: 6px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 12px; }
            th { background: #f8fafc; text-transform: uppercase; letter-spacing: .04em; }
            .diff { color: ${diff < 0 ? "#dc2626" : diff > 0 ? "#16a34a" : "#0f172a"}; }
          </style>
        </head>
        <body>
          <h1>Cash Shift Report</h1>
          <div class="meta">
            <div class="row"><strong>Shift #</strong><span>${shift.shift_number ?? "-"}</span></div>
            <div class="row"><strong>Cashier</strong><span>${cashierName}</span></div>
            <div class="row"><strong>Opened</strong><span>${formatDateTime(shift.opened_at)}</span></div>
            <div class="row"><strong>Closed</strong><span>${formatDateTime(shift.closed_at)}</span></div>
            <div class="row"><strong>Status</strong><span>${shift.status}</span></div>
          </div>
          <div class="summary">
            <div class="row"><strong>Starting Cash</strong><span>${fmt(parseNumber(shift.starting_cash))}</span></div>
            <div class="row"><strong>Cash Sales</strong><span>${fmt(parseNumber(shift.total_cash_sales))}</span></div>
            <div class="row"><strong>Non-Cash Sales</strong><span>${fmt(parseNumber(shift.total_noncash))}</span></div>
            <div class="row"><strong>Cash In</strong><span>${fmt(parseNumber(shift.cash_in_total))}</span></div>
            <div class="row"><strong>Cash Out</strong><span>${fmt(parseNumber(shift.cash_out_total))}</span></div>
            <div class="row"><strong>Expected Cash</strong><span>${fmt(parseNumber(shift.expected_cash))}</span></div>
            <div class="row"><strong>Actual Cash</strong><span>${fmt(parseNumber(shift.actual_cash))}</span></div>
            <div class="row"><strong>Difference</strong><span class="diff">${diff >= 0 ? "+" : ""}${fmt(diff)}</span></div>
          </div>
          <h2>Payment Breakdown</h2>
          <table>
            <thead><tr><th>Method</th><th>Amount</th></tr></thead>
            <tbody>${breakdown || '<tr><td colspan="2">No payments recorded.</td></tr>'}</tbody>
          </table>
          <h2>Cash Movements</h2>
          <table>
            <thead><tr><th>Type</th><th>Reason</th><th>Reference</th><th>Amount</th></tr></thead>
            <tbody>${movements || '<tr><td colspan="4">No cash movements recorded.</td></tr>'}</tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  const shift = shiftPayload?.shift ?? null;
  const shiftExpectedCash = parseNumber(shift?.expected_cash ?? expectedCash);
  const shiftActualCash = parseNumber(shift?.actual_cash ?? actualCash);
  const difference = parseNumber(shift?.cash_difference ?? (parseFloat(actualCash) || 0) - shiftExpectedCash);
  const requiresApproval = Boolean(shift?.requiresApproval || shift?.status === "pending_approval");

  const summaryRows = shift ? [
    { label: "Starting Cash", value: fmt(parseNumber(shift.starting_cash)) },
    { label: "Cash Sales", value: fmt(parseNumber(shift.total_cash_sales)) },
    { label: "Non-Cash Sales", value: fmt(parseNumber(shift.total_noncash)) },
    { label: "Cash In", value: fmt(parseNumber(shift.cash_in_total)) },
    { label: "Cash Out", value: fmt(parseNumber(shift.cash_out_total)) },
    { label: "Expected Cash", value: fmt(shiftExpectedCash) },
  ] : [];

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal pos-modal--shift" onClick={(event) => event.stopPropagation()}>
        <div className="pos-modal__head">
          <div className="pos-modal__title-wrap">
            <Clock size={18} />
            <h2 className="pos-modal__title">{shift ? "Shift Management" : "Open Cashier Shift"}</h2>
          </div>
          <button className="pos-modal__close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="pos-modal__body">
          <div className="pos-shift-info">
            <div className="pos-shift-info__row"><span>Cashier</span><strong>{cashierName}</strong></div>
            <div className="pos-shift-info__row">
              <span>Status</span>
              <span className={`pos-shift-badge ${shift ? "pos-shift-badge--open" : "pos-shift-badge--closed"}`}>
                {shift?.status === "pending_approval" ? "Pending Approval" : shift ? "Shift Open" : "No Active Shift"}
              </span>
            </div>
            {shift?.shift_number ? (
              <div className="pos-shift-info__row"><span>Shift No.</span><strong>{shift.shift_number}</strong></div>
            ) : null}
          </div>

          {loading ? <div className="pos-status">Loading shift details...</div> : null}

          {!shift ? (
            <>
              <label className="pos-pay-label" style={{ marginTop: 16 }}>
                <DollarSign size={14} style={{ display: "inline", verticalAlign: "middle" }} /> Starting Cash in Drawer
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={startingCash}
                  onChange={(event) => setStartingCash(event.target.value)}
                  className="pos-pay-input"
                  autoFocus
                />
              </label>
              <label className="pos-pay-label">
                Opening Notes (optional)
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Record opening drawer notes..."
                  className="pos-pay-input"
                />
              </label>
            </>
          ) : (
            <>
              <div className="pos-shift-summary">
                {summaryRows.map((row) => (
                  <div key={row.label} className="pos-shift-summary__row">
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                ))}
              </div>

              {shift.status === "open" ? (
                <>
                  <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontWeight: 600 }}>
                      <Wallet size={15} /> Cash In / Cash Out
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      <select value={movementType} onChange={(event) => setMovementType(event.target.value as "cash_in" | "cash_out")} className="pos-pay-input">
                        <option value="cash_in">Cash In</option>
                        <option value="cash_out">Cash Out</option>
                      </select>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={movementAmount}
                        onChange={(event) => setMovementAmount(event.target.value)}
                        placeholder="Amount"
                        className="pos-pay-input"
                      />
                      <input
                        type="text"
                        value={movementReason}
                        onChange={(event) => setMovementReason(event.target.value)}
                        placeholder="Reason"
                        className="pos-pay-input"
                      />
                      <input
                        type="text"
                        value={movementReference}
                        onChange={(event) => setMovementReference(event.target.value)}
                        placeholder="Reference no. (optional)"
                        className="pos-pay-input"
                      />
                      <button type="button" className="pos-btn-primary" onClick={() => void handleAddMovement()} disabled={processing}>
                        {movementType === "cash_in" ? <ArrowUpCircle size={15} /> : <ArrowDownCircle size={15} />}
                        <span>{processing ? "Saving..." : "Record Movement"}</span>
                      </button>
                    </div>
                  </div>

                  <label className="pos-pay-label" style={{ marginTop: 16 }}>
                    Actual Cash Count in Drawer
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={actualCash}
                      onChange={(event) => setActualCash(event.target.value)}
                      className="pos-pay-input"
                    />
                    <span style={{ fontSize: 11, color: "#64748b", marginTop: 4, display: "block" }}>
                      Count all bills and coins before closing the shift.
                    </span>
                  </label>

                  <div className="pos-shift-diff-preview">
                    <span>Projected Difference</span>
                    <strong style={{ color: (parseFloat(actualCash) || 0) - shiftExpectedCash < 0 ? "#ef4444" : "#22c55e" }}>
                      {fmt((parseFloat(actualCash) || 0) - shiftExpectedCash)}
                    </strong>
                  </div>

                  <label className="pos-pay-label">
                    Closing Notes
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Explain overages, shortages, or drawer activity..."
                      className="pos-pay-input"
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className="pos-shift-summary" style={{ marginTop: 16 }}>
                    <div className="pos-shift-summary__row"><span>Actual Cash</span><strong>{fmt(shiftActualCash)}</strong></div>
                    <div className={`pos-shift-summary__row pos-shift-summary__row--diff ${difference < 0 ? "pos-shift-summary__row--neg" : difference > 0 ? "pos-shift-summary__row--pos" : ""}`}>
                      <span>Difference</span>
                      <strong>{difference >= 0 ? "+" : ""}{fmt(difference)}</strong>
                    </div>
                    <div className="pos-shift-summary__row"><span>Closed At</span><strong>{formatDateTime(shift.closed_at)}</strong></div>
                  </div>

                  {requiresApproval ? (
                    <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "#fff7ed", border: "1px solid #fdba74" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontWeight: 600, color: "#9a3412" }}>
                        <ShieldCheck size={15} /> Manager Approval Required
                      </div>
                      <p className="pos-shift-note pos-shift-note--warn" style={{ marginBottom: 10 }}>
                        This shift has an over/short amount and must be approved by a manager before final close.
                      </p>
                      <input
                        type="text"
                        value={approverUsername}
                        onChange={(event) => setApproverUsername(event.target.value)}
                        placeholder="Manager username"
                        className="pos-pay-input"
                        style={{ marginBottom: 8 }}
                      />
                      <input
                        type="password"
                        value={approverPin}
                        onChange={(event) => setApproverPin(event.target.value)}
                        placeholder="Manager PIN"
                        className="pos-pay-input"
                        style={{ marginBottom: 8 }}
                      />
                      <textarea
                        rows={2}
                        value={approvalNotes}
                        onChange={(event) => setApprovalNotes(event.target.value)}
                        placeholder="Approval notes"
                        className="pos-pay-input"
                      />
                    </div>
                  ) : (
                    <p className="pos-shift-note pos-shift-note--ok" style={{ marginTop: 16 }}>
                      <CheckCircle2 size={15} style={{ display: "inline", verticalAlign: "text-bottom" }} /> Shift balanced and closed.
                    </p>
                  )}
                </>
              )}

              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 8 }}>Cash Movement Log</div>
                <div style={{ display: "grid", gap: 8, maxHeight: 170, overflowY: "auto" }}>
                  {shiftPayload?.movements.length ? shiftPayload.movements.map((movement) => (
                    <div key={movement.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 12px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{movement.type === "cash_in" ? "Cash In" : "Cash Out"}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{movement.reason || "No reason"}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{formatDateTime(movement.created_at)}</div>
                      </div>
                      <strong style={{ color: movement.type === "cash_in" ? "#16a34a" : "#dc2626" }}>
                        {movement.type === "cash_in" ? "+" : "-"}{fmt(parseNumber(movement.amount))}
                      </strong>
                    </div>
                  )) : (
                    <div className="pos-empty-note">No cash movements recorded for this shift.</div>
                  )}
                </div>
              </div>
            </>
          )}

          {error ? <div className="pos-pay-error"><AlertCircle size={14} /> {error}</div> : null}
        </div>

        <div className="pos-modal__foot">
          <button type="button" className="pos-btn-ghost" onClick={onClose} disabled={processing}>Cancel</button>
          {shift ? (
            shift.status === "open" ? (
              <button type="button" className="pos-btn-primary" onClick={() => void handleCloseShift()} disabled={processing || loading}>
                <Clock size={15} /> {processing ? "Processing..." : "Close Shift"}
              </button>
            ) : (
              <>
                <button type="button" className="pos-btn-ghost" onClick={handlePrintReport}>
                  <Printer size={15} /> Print Report
                </button>
                {requiresApproval ? (
                  <button
                    type="button"
                    className="pos-btn-primary"
                    onClick={() => void handleApproveShift()}
                    disabled={processing || !approverUsername.trim() || !approverPin.trim()}
                  >
                    <ShieldCheck size={15} /> {processing ? "Approving..." : "Manager Approve"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pos-btn-primary"
                    onClick={() => {
                      onSuccess(null);
                      onClose();
                    }}
                  >
                    <CheckCircle2 size={15} /> Done
                  </button>
                )}
              </>
            )
          ) : (
            <button type="button" className="pos-btn-primary" onClick={() => void handleOpenShift()} disabled={processing || loading}>
              <Clock size={15} /> {processing ? "Processing..." : "Open Shift"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
