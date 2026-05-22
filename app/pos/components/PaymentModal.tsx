"use client";
import { useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  CreditCard,
  Plus,
  Smartphone,
  SplitSquareVertical,
  Trash2,
  UserCheck,
  Wallet,
  X,
} from "lucide-react";

export type CartItemPayload = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountType?: string;
  discountValue?: number;
  discountAmount?: number;
  totalPrice: number;
  costPrice?: number;
};

export type PaymentLine = { method: string; amount: number; referenceNo: string };

export type PaymentSuccessPayload = {
  saleId: string;
  invoiceNumber: string;
  payments: PaymentLine[];
  amountPaid: number;
  changeAmount: number;
};

type Props = {
  cartItems: CartItemPayload[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  customerId: string | null;
  customerName: string;
  branchId: string;
  cashierId: string;
  shiftId: string | null;
  notes: string;
  onClose: () => void;
  onSuccess: (payload: PaymentSuccessPayload) => void;
};

const METHODS = [
  { key: "cash", label: "Cash", icon: Wallet },
  { key: "gcash", label: "QR Ph / GCash", icon: Smartphone },
  { key: "card", label: "Card", icon: CreditCard },
  { key: "bank_transfer", label: "Bank Transfer", icon: Building2 },
  { key: "customer_credit", label: "Customer Credit", icon: UserCheck },
  { key: "split", label: "Split Payment", icon: SplitSquareVertical },
];

const LIVE_METHODS = new Set(["cash", "gcash", "split"]);
const COMING_SOON_METHODS = new Set(["card", "bank_transfer", "customer_credit"]);

function fmt(v: number) {
  return `P${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PaymentModal(props: Props) {
  const {
    cartItems,
    subtotal,
    discountAmount,
    taxAmount,
    total,
    customerId,
    customerName,
    branchId,
    cashierId,
    shiftId,
    notes,
    onClose,
    onSuccess,
  } = props;

  const [selectedMethod, setSelectedMethod] = useState("cash");
  const [cashReceived, setCashReceived] = useState(total.toFixed(2));
  const [referenceNo, setReferenceNo] = useState("");
  const [splitLines, setSplitLines] = useState<PaymentLine[]>([
    { method: "cash", amount: total, referenceNo: "" },
  ]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const isSplit = selectedMethod === "split";
  const isComingSoonMethod = COMING_SOON_METHODS.has(selectedMethod);
  const cashChange = Math.max(0, parseFloat(cashReceived || "0") - total);
  const splitTotal = splitLines.reduce((s, l) => s + l.amount, 0);
  const splitRemaining = total - splitTotal;

  function addSplitLine() {
    setSplitLines((prev) => [...prev, { method: "cash", amount: Math.max(0, splitRemaining), referenceNo: "" }]);
  }

  function removeSplitLine(i: number) {
    setSplitLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateSplit(i: number, field: keyof PaymentLine, value: string | number) {
    setSplitLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }

  async function handlePay() {
    setError("");
    setProcessing(true);

    try {
      if (isComingSoonMethod) {
        setError("This payment method is prepared in the POS but is still marked Coming Soon until the client activates it in PayMongo.");
        setProcessing(false);
        return;
      }

      let payments: PaymentLine[];
      if (isSplit) {
        if (Math.abs(splitRemaining) > 0.01) {
          setError(`Split amounts must sum to ${fmt(total)}. Remaining: ${fmt(splitRemaining)}`);
          setProcessing(false);
          return;
        }
        if (splitLines.some((line) => !LIVE_METHODS.has(line.method))) {
          setError("Split payment currently supports Cash and QR Ph / GCash only.");
          setProcessing(false);
          return;
        }
        payments = splitLines;
      } else {
        const amt = selectedMethod === "cash" ? parseFloat(cashReceived || "0") : total;
        if (selectedMethod === "cash" && amt < total) {
          setError(`Cash received (${fmt(amt)}) is less than total (${fmt(total)}).`);
          setProcessing(false);
          return;
        }
        payments = [{ method: selectedMethod, amount: total, referenceNo }];
      }

      const amountPaid = isSplit ? splitTotal : parseFloat(cashReceived || String(total));
      const changeAmount = isSplit ? 0 : cashChange;

      const resp = await fetch("/api/pos/complete-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          cashierId,
          shiftId,
          customerId,
          items: cartItems,
          subtotal,
          discountAmount,
          taxRate: subtotal > 0 ? (taxAmount / Math.max(subtotal - discountAmount, 1)) * 100 : 12,
          taxAmount,
          totalAmount: total,
          payments,
          amountPaid,
          changeAmount,
          notes,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Payment failed.");

      onSuccess({
        saleId: data.saleId,
        invoiceNumber: data.invoiceNumber,
        payments,
        amountPaid,
        changeAmount,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal pos-modal--payment" onClick={(e) => e.stopPropagation()}>
        <div className="pos-modal__head">
          <div className="pos-modal__title-wrap">
            <Wallet size={18} />
            <h2 className="pos-modal__title">Process Payment</h2>
          </div>
          <button className="pos-modal__close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="pos-payment-body">
          <div className="pos-payment-summary">
            <div className="pos-payment-summary__row"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
            <div className="pos-payment-summary__row"><span>Discount</span><span>- {fmt(discountAmount)}</span></div>
            <div className="pos-payment-summary__row"><span>VAT (12%)</span><span>{fmt(taxAmount)}</span></div>
            <div className="pos-payment-summary__total"><span>TOTAL DUE</span><strong>{fmt(total)}</strong></div>
            <div className="pos-payment-summary__customer">
              <UserCheck size={13} />
              <span>{customerName}</span>
            </div>
          </div>

          <div className="pos-pay-methods-grid">
            {METHODS.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.key}
                  type="button"
                  className={`pos-pay-method-btn${selectedMethod === m.key ? " pos-pay-method-btn--active" : ""}`}
                  onClick={() => setSelectedMethod(m.key)}
                >
                  <Icon size={18} />
                  <span>{m.label}</span>
                  {COMING_SOON_METHODS.has(m.key) ? <small>Coming Soon</small> : null}
                </button>
              );
            })}
          </div>

          {!isSplit && (
            <div className="pos-payment-inputs">
              {selectedMethod === "cash" && (
                <>
                  <label className="pos-pay-label">
                    Cash Received
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      className="pos-pay-input"
                      autoFocus
                    />
                  </label>
                  <div className="pos-change-display">
                    <span>Change</span>
                    <strong style={{ color: cashChange >= 0 ? "#22c55e" : "#ef4444" }}>{fmt(cashChange)}</strong>
                  </div>
                  <div className="pos-quick-cash">
                    {[Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000].map((q) => (
                      <button key={q} type="button" onClick={() => setCashReceived(String(q))}>{fmt(q)}</button>
                    ))}
                    <button type="button" onClick={() => setCashReceived(String(total))}>Exact</button>
                  </div>
                </>
              )}

              {selectedMethod === "gcash" && (
                <>
                  <label className="pos-pay-label">
                    QR Ph Reference Number
                    <input
                      type="text"
                      placeholder="Enter the reference from GCash or online banking"
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                      className="pos-pay-input"
                      autoFocus
                    />
                  </label>
                  <p className="pos-pay-warning">Use the client&apos;s active QR Ph code for GCash and supported online banking apps, then record the payment reference here.</p>
                </>
              )}

              {(selectedMethod === "card" || selectedMethod === "bank_transfer") && (
                <p className="pos-pay-warning">This method is prepared for PayMongo activation but is currently Coming Soon.</p>
              )}

              {selectedMethod === "customer_credit" && !customerId && (
                <p className="pos-pay-warning">Select a registered customer to use customer credit.</p>
              )}

              {selectedMethod === "customer_credit" && customerId && (
                <p className="pos-pay-warning">Customer credit posting is prepared but still Coming Soon until the client activates this flow.</p>
              )}
            </div>
          )}

          {isSplit && (
            <div className="pos-split-lines">
              {splitLines.map((line, i) => (
                <div key={i} className="pos-split-line">
                  <select
                    value={line.method}
                    onChange={(e) => updateSplit(i, "method", e.target.value)}
                    className="pos-split-select"
                  >
                    {METHODS.filter((m) => LIVE_METHODS.has(m.key) && m.key !== "split").map((m) => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.amount}
                    onChange={(e) => updateSplit(i, "amount", parseFloat(e.target.value) || 0)}
                    className="pos-split-amount"
                  />
                  <input
                    type="text"
                    placeholder="Ref#"
                    value={line.referenceNo}
                    onChange={(e) => updateSplit(i, "referenceNo", e.target.value)}
                    className="pos-split-ref"
                  />
                  {splitLines.length > 1 && (
                    <button type="button" onClick={() => removeSplitLine(i)} className="pos-split-remove">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              <div className="pos-split-footer">
                <button type="button" onClick={addSplitLine} className="pos-split-add">
                  <Plus size={14} /> Add Payment Line
                </button>
                <span className={`pos-split-remaining ${Math.abs(splitRemaining) > 0.01 ? "pos-split-remaining--err" : ""}`}>
                  Remaining: {fmt(splitRemaining)}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="pos-pay-error">
              <AlertCircle size={15} /> {error}
            </div>
          )}
        </div>

        <div className="pos-modal__foot">
          <button type="button" className="pos-btn-ghost" onClick={onClose} disabled={processing}>Cancel</button>
          <button
            type="button"
            className="pos-btn-primary"
            onClick={handlePay}
            disabled={processing || (selectedMethod === "customer_credit" && !customerId) || isComingSoonMethod}
          >
            {processing ? "Processing..." : <><CheckCircle2 size={16} /> Confirm Payment {fmt(total)}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
