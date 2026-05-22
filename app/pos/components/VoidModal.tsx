"use client";
import { useEffect, useState } from "react";
import { X, Ban, Search, AlertCircle, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRbac } from "@/components/RbacProvider";

type Sale = {
  id: string; invoice_number: string; total_amount: number;
  created_at: string; status: string;
};

type Props = {
  branchId: string; cashierId: string;
  onClose: () => void; onSuccess: () => void;
};

export default function VoidModal({ branchId, cashierId, onClose, onSuccess }: Props) {
  const { canAny } = useRbac();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Sale[]>([]);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [supervisorUsername, setSupervisorUsername] = useState("");
  const [supervisorPin, setSupervisorPin] = useState("");
  const [approverUserId, setApproverUserId] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const canVoidDirectly = canAny("pos:void", "pos:manage");

  useEffect(() => {
    if (!branchId) return;
    const timer = window.setTimeout(() => {
      setLoading(true);
      supabase
        .from("sales")
        .select("id, invoice_number, total_amount, created_at, status")
        .eq("branch_id", branchId)
        .in("status", ["completed"])
        .order("created_at", { ascending: false })
        .limit(10)
        .then(({ data }) => {
          setResults((data ?? []) as Sale[]);
          setLoading(false);
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [branchId]);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    const { data } = await supabase
      .from("sales")
      .select("id, invoice_number, total_amount, created_at, status")
      .eq("branch_id", branchId)
      .ilike("invoice_number", `%${query.trim()}%`)
      .in("status", ["completed"])
      .limit(10);
    setResults((data ?? []) as Sale[]);
    setLoading(false);
  }

  async function handleVoid() {
    if (!selected) { setError("Select a transaction to void."); return; }
    if (!voidReason.trim()) { setError("Enter a void reason."); return; }
    setError(""); setProcessing(true);
    try {
      let resolvedApproverUserId = approverUserId;
      if (!canVoidDirectly) {
        if (!supervisorUsername.trim() || !supervisorPin.trim()) {
          throw new Error("Supervisor username and PIN are required for void approval.");
        }

        const approvalResp = await fetch("/api/auth/verify-pos-approval", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: supervisorUsername.trim(),
            pin: supervisorPin.trim(),
            permissions: ["pos:void"],
          }),
        });
        const approvalData = await approvalResp.json();
        if (!approvalResp.ok) throw new Error(approvalData.error || "Supervisor approval failed.");
        resolvedApproverUserId = approvalData.approver.userId;
        setApproverUserId(resolvedApproverUserId);
      }

      const resp = await fetch("/api/pos/void-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleId: selected.id, cashierId, voidReason: voidReason.trim(), approverUserId: resolvedApproverUserId || null }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Void failed.");
      onSuccess(); onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setProcessing(false);
    }
  }

  function fmt(v: number) {
    return `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal pos-modal--void" onClick={e => e.stopPropagation()}>
        <div className="pos-modal__head">
          <div className="pos-modal__title-wrap"><Ban size={18} style={{ color: "#ef4444" }} /><h2 className="pos-modal__title">Void Transaction</h2></div>
          <button className="pos-modal__close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="pos-modal__body">
          <div className="pos-void-search">
            <input
              type="text" placeholder="Search invoice number…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              className="pos-void-search__input"
            />
            <button type="button" onClick={handleSearch} className="pos-void-search__btn">
              <Search size={15} />
            </button>
          </div>

          <div className="pos-void-list">
            {loading && <div className="pos-modal-loading">Loading…</div>}
            {!loading && results.map(sale => (
              <button
                key={sale.id}
                type="button"
                className={`pos-void-row${selected?.id === sale.id ? " pos-void-row--selected" : ""}`}
                onClick={() => setSelected(sale)}
              >
                <span className="pos-void-row__invoice">{sale.invoice_number}</span>
                <span className="pos-void-row__amount">{fmt(Number(sale.total_amount))}</span>
                <span className="pos-void-row__time">
                  <Clock size={11} />
                  {new Date(sale.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className={`pos-void-row__status pos-void-row__status--${sale.status}`}>{sale.status}</span>
              </button>
            ))}
          </div>

          {selected && (
            <div className="pos-void-form">
              <div className="pos-void-selected-info">
                Voiding: <strong>{selected.invoice_number}</strong> — {fmt(Number(selected.total_amount))}
              </div>
              <label className="pos-pay-label">
                Void Reason <span style={{ color: "#ef4444" }}>*</span>
                <select value={voidReason} onChange={e => setVoidReason(e.target.value)} className="pos-pay-input">
                  <option value="">— Select reason —</option>
                  <option value="Customer cancelled order">Customer cancelled order</option>
                  <option value="Wrong item entered">Wrong item entered</option>
                  <option value="Duplicate transaction">Duplicate transaction</option>
                  <option value="Price error">Price error</option>
                  <option value="Payment issue">Payment issue</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label className="pos-pay-label">
                Supervisor Username
                <input
                  type="text" placeholder="Enter supervisor username"
                  value={supervisorUsername}
                  onChange={e => setSupervisorUsername(e.target.value)}
                  className="pos-pay-input"
                  disabled={canVoidDirectly}
                />
              </label>
              <label className="pos-pay-label">
                Supervisor PIN {canVoidDirectly ? "(optional)" : ""}
                <input
                  type="password" placeholder="Enter supervisor PIN"
                  value={supervisorPin}
                  onChange={e => setSupervisorPin(e.target.value)}
                  className="pos-pay-input"
                  disabled={canVoidDirectly}
                />
              </label>
              {!canVoidDirectly && <p className="pos-pay-warning">This cashier needs supervisor approval to void a completed sale.</p>}
            </div>
          )}

          {error && <div className="pos-pay-error"><AlertCircle size={14} /> {error}</div>}
        </div>

        <div className="pos-modal__foot">
          <button type="button" className="pos-btn-ghost" onClick={onClose} disabled={processing}>Cancel</button>
          <button
            type="button"
            className="pos-btn-danger"
            onClick={handleVoid}
            disabled={processing || !selected || !voidReason}
          >
            <Ban size={15} /> {processing ? "Voiding…" : "Confirm Void"}
          </button>
        </div>
      </div>
    </div>
  );
}
