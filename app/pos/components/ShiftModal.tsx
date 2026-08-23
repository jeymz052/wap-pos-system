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
          <div className="pos-shift-hero">
            <div className="pos-shift-hero__copy">
              <span className="pos-shift-hero__eyebrow">Cash Drawer Control</span>
              <h3>{shift ? "Manage the active shift" : "Open a new cashier shift"}</h3>
              <p>
                Keep drawer activity, opening cash, and closing variance in one clean workspace.
              </p>
            </div>
            <div className="pos-shift-hero__stack">
              <div className="pos-shift-hero__chip">
                <span>Cashier</span>
                <strong>{cashierName}</strong>
              </div>
              <div className="pos-shift-hero__chip">
                <span>Status</span>
                <strong className={`pos-shift-badge ${shift ? "pos-shift-badge--open" : "pos-shift-badge--closed"}`}>
                  {shift?.status === "pending_approval" ? "Pending Approval" : shift ? "Shift Open" : "No Active Shift"}
                </strong>
              </div>
              {shift?.shift_number ? (
                <div className="pos-shift-hero__chip">
                  <span>Shift No.</span>
                  <strong>{shift.shift_number}</strong>
                </div>
              ) : null}
            </div>
          </div>

          {loading ? <div className="pos-status">Loading shift details...</div> : null}

          {!shift ? (
            <div className="pos-shift-grid">
              <section className="pos-shift-card">
                <div className="pos-shift-card__head">
                  <div className="pos-shift-card__icon"><DollarSign size={16} /></div>
                  <div>
                    <h4>Opening Cash</h4>
                    <p>Enter the cash placed in the drawer before selling.</p>
                  </div>
                </div>
                <label className="pos-pay-label">
                  Starting Cash in Drawer
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
              </section>

              <section className="pos-shift-card">
                <div className="pos-shift-card__head">
                  <div className="pos-shift-card__icon pos-shift-card__icon--soft"><Clock size={16} /></div>
                  <div>
                    <h4>Opening Notes</h4>
                    <p>Optional notes for drawer handoff or special instructions.</p>
                  </div>
                </div>
                <label className="pos-pay-label">
                  Notes
                  <textarea
                    rows={6}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Record opening drawer notes..."
                    className="pos-pay-input"
                  />
                </label>
              </section>
            </div>
          ) : (
            <>
              <div className="pos-shift-summary pos-shift-summary--grid">
                {summaryRows.map((row, index) => (
                  <div key={row.label} className="pos-shift-summary__row">
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                    {index === 0 ? <em>Shift baseline</em> : null}
                  </div>
                ))}
              </div>

              {shift.status === "open" ? (
                <div className="pos-shift-grid">
                  <section className="pos-shift-card">
                    <div className="pos-shift-card__head">
                      <div className="pos-shift-card__icon"><Wallet size={16} /></div>
                      <div>
                        <h4>Cash Movement</h4>
                        <p>Record any cash in or cash out during the shift.</p>
                      </div>
                    </div>
                    <div className="pos-shift-stack">
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
                  </section>

                  <section className="pos-shift-card pos-shift-card--accent">
                    <div className="pos-shift-card__head">
                      <div className="pos-shift-card__icon pos-shift-card__icon--soft"><CheckCircle2 size={16} /></div>
                      <div>
                        <h4>Closing Count</h4>
                        <p>Use this when you are ready to balance and close the shift.</p>
                      </div>
                    </div>
                    <label className="pos-pay-label">
                      Actual Cash Count in Drawer
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={actualCash}
                        onChange={(event) => setActualCash(event.target.value)}
                        className="pos-pay-input"
                      />
                      <span className="pos-shift-hint">Count all bills and coins before closing the shift.</span>
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
                        rows={5}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Explain overages, shortages, or drawer activity..."
                        className="pos-pay-input"
                      />
                    </label>
                  </section>

                  <section className="pos-shift-card pos-shift-card--log">
                    <div className="pos-shift-card__head">
                      <div className="pos-shift-card__icon pos-shift-card__icon--soft"><AlertCircle size={16} /></div>
                      <div>
                        <h4>Cash Movement Log</h4>
                        <p>Track every drawer adjustment for audit purposes.</p>
                      </div>
                    </div>
                    <div className="pos-shift-log">
                      {shiftPayload?.movements.length ? shiftPayload.movements.map((movement) => (
                        <div key={movement.id} className="pos-shift-log__row">
                          <div>
                            <div className="pos-shift-log__title">{movement.type === "cash_in" ? "Cash In" : "Cash Out"}</div>
                            <div className="pos-shift-log__meta">{movement.reason || "No reason"} · {formatDateTime(movement.created_at)}</div>
                          </div>
                          <strong className={movement.type === "cash_in" ? "pos-shift-log__amount pos-shift-log__amount--in" : "pos-shift-log__amount pos-shift-log__amount--out"}>
                            {movement.type === "cash_in" ? "+" : "-"}{fmt(parseNumber(movement.amount))}
                          </strong>
                        </div>
                      )) : (
                        <div className="pos-empty-note">No cash movements recorded for this shift.</div>
                      )}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="pos-shift-grid">
                  <section className="pos-shift-card">
                    <div className="pos-shift-card__head">
                      <div className="pos-shift-card__icon"><Wallet size={16} /></div>
                      <div>
                        <h4>Shift Balance</h4>
                        <p>Review the drawer count before marking the shift as closed.</p>
                      </div>
                    </div>
                    <div className="pos-shift-summary">
                    <div className="pos-shift-summary__row"><span>Actual Cash</span><strong>{fmt(shiftActualCash)}</strong></div>
                    <div className={`pos-shift-summary__row pos-shift-summary__row--diff ${difference < 0 ? "pos-shift-summary__row--neg" : difference > 0 ? "pos-shift-summary__row--pos" : ""}`}>
                      <span>Difference</span>
                      <strong>{difference >= 0 ? "+" : ""}{fmt(difference)}</strong>
                    </div>
                    <div className="pos-shift-summary__row"><span>Closed At</span><strong>{formatDateTime(shift.closed_at)}</strong></div>
                    </div>
                  </section>

                  <section className="pos-shift-card pos-shift-card--approval">
                    {requiresApproval ? (
                      <>
                        <div className="pos-shift-card__head">
                          <div className="pos-shift-card__icon pos-shift-card__icon--warn"><ShieldCheck size={16} /></div>
                          <div>
                            <h4>Manager Approval Required</h4>
                            <p>This shift has an over/short amount and needs sign-off before closing.</p>
                          </div>
                        </div>
                        <p className="pos-shift-note pos-shift-note--warn">
                          Review the amount, then enter the approving manager credentials below.
                        </p>
                        <div className="pos-shift-stack">
                          <input
                            type="text"
                            value={approverUsername}
                            onChange={(event) => setApproverUsername(event.target.value)}
                            placeholder="Manager username"
                            className="pos-pay-input"
                          />
                          <input
                            type="password"
                            value={approverPin}
                            onChange={(event) => setApproverPin(event.target.value)}
                            placeholder="Manager PIN"
                            className="pos-pay-input"
                          />
                          <textarea
                            rows={4}
                            value={approvalNotes}
                            onChange={(event) => setApprovalNotes(event.target.value)}
                            placeholder="Approval notes"
                            className="pos-pay-input"
                          />
                        </div>
                      </>
                    ) : (
                      <p className="pos-shift-note pos-shift-note--ok">
                        <CheckCircle2 size={15} style={{ display: "inline", verticalAlign: "text-bottom" }} /> Shift balanced and closed.
                      </p>
                    )}
                  </section>
                </div>
              )}
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
