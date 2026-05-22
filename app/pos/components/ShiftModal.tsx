"use client";
import { useState } from "react";
import { X, Clock, CheckCircle2, AlertCircle, DollarSign } from "lucide-react";

type Props = {
  branchId: string; cashierId: string; cashierName: string;
  currentShiftId: string | null;
  expectedCash: number;
  onClose: () => void;
  onSuccess: (shiftId: string | null) => void;
};

function fmt(v: number) { return `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export default function ShiftModal({ branchId, cashierId, cashierName, currentShiftId, expectedCash, onClose, onSuccess }: Props) {
  const isOpen = !!currentShiftId;
  const [startingCash, setStartingCash] = useState("0");
  const [actualCash, setActualCash] = useState(expectedCash.toFixed(2));
  const [notes, setNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ expectedCash: number; actualCash: number; difference: number } | null>(null);

  async function handleOpenShift() {
    setError(""); setProcessing(true);
    try {
      const resp = await fetch("/api/pos/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open", branchId, cashierId, startingCash: parseFloat(startingCash) || 0 }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to open shift.");
      onSuccess(data.shiftId);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally { setProcessing(false); }
  }

  async function handleCloseShift() {
    setError(""); setProcessing(true);
    try {
      const resp = await fetch("/api/pos/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "close", shiftId: currentShiftId, cashierId,
          actualCash: parseFloat(actualCash) || 0, notes,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to close shift.");
      setResult({ expectedCash: data.expectedCash, actualCash: data.actualCash, difference: data.difference });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally { setProcessing(false); }
  }

  if (result) {
    const diff = result.difference;
    return (
      <div className="pos-modal-overlay">
        <div className="pos-modal pos-modal--shift" onClick={e => e.stopPropagation()}>
          <div className="pos-modal__head">
            <div className="pos-modal__title-wrap"><CheckCircle2 size={18} style={{ color: "#22c55e" }} /><h2 className="pos-modal__title">Shift Closed</h2></div>
          </div>
          <div className="pos-modal__body">
            <div className="pos-shift-summary">
              <div className="pos-shift-summary__row"><span>Cashier</span><strong>{cashierName}</strong></div>
              <div className="pos-shift-summary__row"><span>Expected Cash</span><strong>{fmt(result.expectedCash)}</strong></div>
              <div className="pos-shift-summary__row"><span>Actual Cash</span><strong>{fmt(result.actualCash)}</strong></div>
              <div className={`pos-shift-summary__row pos-shift-summary__row--diff ${diff < 0 ? "pos-shift-summary__row--neg" : diff > 0 ? "pos-shift-summary__row--pos" : ""}`}>
                <span>Difference</span>
                <strong>{diff >= 0 ? "+" : ""}{fmt(diff)}</strong>
              </div>
            </div>
            {diff < 0 && <p className="pos-shift-note pos-shift-note--warn">⚠️ Cash shortage detected. Please review transactions.</p>}
            {diff > 0 && <p className="pos-shift-note pos-shift-note--ok">✅ Cash surplus. Verify any overages.</p>}
            {diff === 0 && <p className="pos-shift-note pos-shift-note--ok">✅ Shift balanced perfectly.</p>}
          </div>
          <div className="pos-modal__foot">
            <button type="button" className="pos-btn-primary" onClick={() => { onSuccess(null); onClose(); }}>
              <CheckCircle2 size={15} /> Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal pos-modal--shift" onClick={e => e.stopPropagation()}>
        <div className="pos-modal__head">
          <div className="pos-modal__title-wrap">
            <Clock size={18} />
            <h2 className="pos-modal__title">{isOpen ? "Close Cashier Shift" : "Open Cashier Shift"}</h2>
          </div>
          <button className="pos-modal__close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="pos-modal__body">
          <div className="pos-shift-info">
            <div className="pos-shift-info__row"><span>Cashier</span><strong>{cashierName}</strong></div>
            <div className="pos-shift-info__row"><span>Status</span>
              <span className={`pos-shift-badge ${isOpen ? "pos-shift-badge--open" : "pos-shift-badge--closed"}`}>
                {isOpen ? "Shift Open" : "No Active Shift"}
              </span>
            </div>
            {isOpen && <div className="pos-shift-info__row"><span>Expected Cash</span><strong>{fmt(expectedCash)}</strong></div>}
          </div>

          {!isOpen && (
            <label className="pos-pay-label" style={{ marginTop: 16 }}>
              <DollarSign size={14} style={{ display: "inline", verticalAlign: "middle" }} /> Starting Cash in Drawer
              <input type="number" min={0} step="0.01" value={startingCash}
                onChange={e => setStartingCash(e.target.value)} className="pos-pay-input" autoFocus />
            </label>
          )}

          {isOpen && (
            <>
              <label className="pos-pay-label" style={{ marginTop: 16 }}>
                Actual Cash Count in Drawer
                <input type="number" min={0} step="0.01" value={actualCash}
                  onChange={e => setActualCash(e.target.value)} className="pos-pay-input" autoFocus />
                <span style={{ fontSize: 11, color: "#64748b", marginTop: 4, display: "block" }}>
                  Count all bills and coins in the cash drawer.
                </span>
              </label>
              <div className="pos-shift-diff-preview">
                <span>Projected Difference</span>
                <strong style={{ color: (parseFloat(actualCash) || 0) - expectedCash < 0 ? "#ef4444" : "#22c55e" }}>
                  {fmt((parseFloat(actualCash) || 0) - expectedCash)}
                </strong>
              </div>
              <label className="pos-pay-label">
                Closing Notes (optional)
                <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Add notes about any discrepancies…" className="pos-pay-input" />
              </label>
            </>
          )}

          {error && <div className="pos-pay-error"><AlertCircle size={14} /> {error}</div>}
        </div>

        <div className="pos-modal__foot">
          <button type="button" className="pos-btn-ghost" onClick={onClose} disabled={processing}>Cancel</button>
          <button type="button" className="pos-btn-primary" onClick={isOpen ? handleCloseShift : handleOpenShift} disabled={processing}>
            <Clock size={15} /> {processing ? "Processing…" : isOpen ? "Close Shift" : "Open Shift"}
          </button>
        </div>
      </div>
    </div>
  );
}
