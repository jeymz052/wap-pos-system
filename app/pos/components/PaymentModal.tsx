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
import { supabase } from "@/lib/supabase";

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

type CustomerCreditInfo = {
  creditLimit: number;
  currentBalance: number;
  availableCredit: number;
  allowCredit: boolean;
  defaultCreditTermsDays: number;
};

type PayMongoLinkState = {
  linkId: string;
  checkoutUrl: string;
  referenceNumber: string;
  status: string;
  paid: boolean;
  method: string;
};

type Props = {
  cartItems: CartItemPayload[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  customerId: string | null;
  customerName: string;
  customerCredit?: CustomerCreditInfo | null;
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

const LIVE_METHODS = new Set(["cash", "gcash", "card", "bank_transfer", "customer_credit", "split"]);
const PAYMONGO_METHODS = new Set(["gcash", "card", "bank_transfer"]);

function fmt(v: number) {
  return `P${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
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
    customerCredit,
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
  const [paymongoLoading, setPaymongoLoading] = useState(false);
  const [error, setError] = useState("");
  const [gcashMode, setGcashMode] = useState<"manual" | "paymongo">("manual");
  const [paymongoLink, setPaymongoLink] = useState<PayMongoLinkState | null>(null);

  const isSplit = selectedMethod === "split";
  const usesPayMongo = PAYMONGO_METHODS.has(selectedMethod);
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

  async function createPayMongoLink() {
    setError("");
    setPaymongoLoading(true);

    try {
      const response = await fetch("/api/pos/paymongo/create-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          amount: total,
          currency: "PHP",
          description: `POS sale for ${customerName}`,
          method: selectedMethod,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create PayMongo payment link.");

      setPaymongoLink({
        linkId: data.linkId,
        checkoutUrl: data.checkoutUrl,
        referenceNumber: data.referenceNumber,
        status: data.status ?? "unpaid",
        paid: false,
        method: selectedMethod,
      });
      setReferenceNo(data.referenceNumber ?? "");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create PayMongo payment link.");
    } finally {
      setPaymongoLoading(false);
    }
  }

  async function refreshPayMongoStatus() {
    if (!paymongoLink?.linkId) return;

    setError("");
    setPaymongoLoading(true);

    try {
      const response = await fetch(`/api/pos/paymongo/check-status?linkId=${encodeURIComponent(paymongoLink.linkId)}`, {
        headers: await getAuthHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to check PayMongo status.");

      setPaymongoLink((current) => current ? {
        ...current,
        status: data.status ?? current.status,
        paid: Boolean(data.paid),
      } : current);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Unable to check PayMongo status.");
    } finally {
      setPaymongoLoading(false);
    }
  }

  async function handlePay() {
    setError("");
    setProcessing(true);

    try {
      let payments: PaymentLine[];
      if (isSplit) {
        if (Math.abs(splitRemaining) > 0.01) {
          setError(`Split amounts must sum to ${fmt(total)}. Remaining: ${fmt(splitRemaining)}`);
          setProcessing(false);
          return;
        }
        if (splitLines.some((line) => !LIVE_METHODS.has(line.method))) {
          setError("Split payment includes a method that is not active yet.");
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
        if (usesPayMongo && selectedMethod !== "gcash") {
          if (!paymongoLink?.linkId || paymongoLink.method !== selectedMethod) {
            setError("Generate a PayMongo checkout link first for this payment method.");
            setProcessing(false);
            return;
          }

          if (!paymongoLink.paid) {
            setError("PayMongo payment is not marked paid yet. Refresh the link status after the customer completes checkout.");
            setProcessing(false);
            return;
          }
        }

        if (selectedMethod === "gcash" && gcashMode === "paymongo") {
          if (!paymongoLink?.linkId) {
            setError("Generate a PayMongo QR checkout link first, or switch back to manual QR reference.");
            setProcessing(false);
            return;
          }

          if (!paymongoLink.paid) {
            setError("PayMongo payment is not marked paid yet. Refresh the link status after the customer completes checkout.");
            setProcessing(false);
            return;
          }
        }
        payments = [{ method: selectedMethod, amount: total, referenceNo }];
      }

      const creditTotal = payments
        .filter((payment) => payment.method === "customer_credit")
        .reduce((sum, payment) => sum + payment.amount, 0);

      if (creditTotal > 0) {
        if (!customerId) {
          setError("Select a registered customer to use customer credit.");
          setProcessing(false);
          return;
        }

        if (!customerCredit?.allowCredit) {
          setError("This customer is not allowed to purchase on credit.");
          setProcessing(false);
          return;
        }

        if (creditTotal > (customerCredit?.availableCredit ?? 0)) {
          setError(`Customer credit exceeds available limit of ${fmt(customerCredit?.availableCredit ?? 0)}.`);
          setProcessing(false);
          return;
        }
      }

      const amountPaid = isSplit ? splitTotal : parseFloat(cashReceived || String(total));
      const changeAmount = isSplit ? 0 : cashChange;

      const resp = await fetch("/api/pos/complete-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
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
                  <div className="pos-quick-cash">
                    <button type="button" onClick={() => setGcashMode("manual")} disabled={gcashMode === "manual"}>Manual QR Ref</button>
                    <button type="button" onClick={() => setGcashMode("paymongo")} disabled={gcashMode === "paymongo"}>PayMongo Link</button>
                  </div>

                  {gcashMode === "manual" ? (
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
                  ) : (
                    <>
                      <div className="pos-split-footer" style={{ justifyContent: "flex-start", gap: 10 }}>
                        <button type="button" onClick={() => void createPayMongoLink()} className="pos-split-add" disabled={paymongoLoading}>
                          {paymongoLoading ? "Generating..." : "Generate PayMongo QR Link"}
                        </button>
                        {paymongoLink ? (
                          <button type="button" onClick={() => void refreshPayMongoStatus()} className="pos-split-add" disabled={paymongoLoading}>
                            {paymongoLoading ? "Checking..." : "Refresh Status"}
                          </button>
                        ) : null}
                      </div>
                      {paymongoLink ? (
                        <div className="pos-pay-warning" style={{ display: "grid", gap: 8 }}>
                          <span>Reference: <strong>{paymongoLink.referenceNumber}</strong></span>
                          <span>Status: <strong>{paymongoLink.paid ? "Paid" : paymongoLink.status}</strong></span>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              className="pos-split-add"
                              onClick={() => window.open(paymongoLink.checkoutUrl, "_blank", "noopener,noreferrer")}
                            >
                              Open Checkout
                            </button>
                          </div>
                          <span>Use this when the client wants the POS to launch a PayMongo checkout page instead of collecting the QR Ph reference manually.</span>
                        </div>
                      ) : (
                        <p className="pos-pay-warning">Generate a PayMongo link to open the hosted QR Ph / GCash checkout and confirm payment after it is marked paid.</p>
                      )}
                    </>
                  )}
                </>
              )}

              {(selectedMethod === "card" || selectedMethod === "bank_transfer") && (
                <>
                  <div className="pos-split-footer" style={{ justifyContent: "flex-start", gap: 10 }}>
                    <button type="button" onClick={() => void createPayMongoLink()} className="pos-split-add" disabled={paymongoLoading}>
                      {paymongoLoading ? "Generating..." : `Generate ${selectedMethod === "card" ? "Card" : "Bank"} Checkout`}
                    </button>
                    {paymongoLink?.method === selectedMethod ? (
                      <button type="button" onClick={() => void refreshPayMongoStatus()} className="pos-split-add" disabled={paymongoLoading}>
                        {paymongoLoading ? "Checking..." : "Refresh Status"}
                      </button>
                    ) : null}
                  </div>
                  {paymongoLink?.method === selectedMethod ? (
                    <div className="pos-pay-warning" style={{ display: "grid", gap: 8 }}>
                      <span>Reference: <strong>{paymongoLink.referenceNumber}</strong></span>
                      <span>Status: <strong>{paymongoLink.paid ? "Paid" : paymongoLink.status}</strong></span>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="pos-split-add"
                          onClick={() => window.open(paymongoLink.checkoutUrl, "_blank", "noopener,noreferrer")}
                        >
                          Open Checkout
                        </button>
                      </div>
                      <span>
                        {selectedMethod === "card"
                          ? "Use this hosted PayMongo checkout for card payments, then refresh status before confirming the sale."
                          : "Use this hosted PayMongo checkout for bank transfer, then refresh status before confirming the sale."}
                      </span>
                    </div>
                  ) : (
                    <p className="pos-pay-warning">
                      Generate a hosted PayMongo checkout link for this payment method, let the customer complete payment, then refresh the status before confirming the sale.
                    </p>
                  )}
                </>
              )}

              {selectedMethod === "customer_credit" && !customerId && (
                <p className="pos-pay-warning">Select a registered customer to use customer credit.</p>
              )}

              {selectedMethod === "customer_credit" && customerId && (
                <p className="pos-pay-warning">
                  Available credit: {fmt(customerCredit?.availableCredit ?? 0)}. Terms:
                  {" "}{customerCredit?.defaultCreditTermsDays ?? 30} days.
                </p>
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

          {!shiftId ? (
            <div className="pos-pay-error">
              <AlertCircle size={15} /> Open a cashier shift before processing payment.
            </div>
          ) : null}
        </div>

        <div className="pos-modal__foot">
          <button type="button" className="pos-btn-ghost" onClick={onClose} disabled={processing}>Cancel</button>
          <button
            type="button"
            className="pos-btn-primary"
            onClick={handlePay}
            disabled={
              processing ||
              !shiftId ||
              (selectedMethod === "customer_credit" && (!customerId || !customerCredit?.allowCredit))
            }
          >
            {processing ? "Processing..." : <><CheckCircle2 size={16} /> Confirm Payment {fmt(total)}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
