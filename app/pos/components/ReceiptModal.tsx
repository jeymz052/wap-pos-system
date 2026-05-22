"use client";
import { useEffect, useRef } from "react";
import { Mail, MessageSquare, Printer, X, CheckCircle2 } from "lucide-react";
import type { PaymentLine } from "./PaymentModal";

type CartRow = { name: string; sku: string; quantity: number; unitPrice: number; discountAmount: number; totalPrice: number };

type Props = {
  invoiceNumber: string;
  saleId: string;
  branchName: string;
  cashierName: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  items: CartRow[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  payments: PaymentLine[];
  amountPaid: number;
  changeAmount: number;
  receiptHeader?: string;
  receiptFooter?: string;
  cashDrawerEnabled?: boolean;
  cashDrawerUrl?: string;
  onClose: () => void;
};

function fmt(v: number) {
  return `P${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank Transfer",
  gcash: "QR Ph / GCash",
  customer_credit: "Customer Credit",
  split: "Split",
};

export default function ReceiptModal(props: Props) {
  const {
    invoiceNumber,
    branchName,
    cashierName,
    customerName,
    customerEmail,
    customerPhone,
    items,
    subtotal,
    discountAmount,
    taxAmount,
    total,
    payments,
    amountPaid,
    changeAmount,
    receiptHeader,
    receiptFooter,
    cashDrawerEnabled,
    cashDrawerUrl,
    onClose,
  } = props;

  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cashDrawerEnabled || !cashDrawerUrl || !payments.some((payment) => payment.method === "cash")) return;
    window.setTimeout(() => {
      window.open(cashDrawerUrl, "_self");
    }, 150);
  }, [cashDrawerEnabled, cashDrawerUrl, payments]);

  function handlePrint() {
    const content = receiptRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=400,height=700");
    if (!win) return;
    win.document.write(`
      <html><head><title>Receipt ${invoiceNumber}</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 300px; margin: 0 auto; padding: 10px; }
        @media print { body { margin:0; } }
      </style></head><body>
      ${content.innerHTML}
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }

  function buildReceiptSummary() {
    return [
      receiptHeader || branchName,
      `Receipt: ${invoiceNumber}`,
      `Customer: ${customerName}`,
      `Cashier: ${cashierName}`,
      ...items.map((item) => `${item.quantity} x ${item.name} = ${fmt(item.totalPrice)}`),
      `Total: ${fmt(total)}`,
      `Payments: ${payments.map((payment) => `${METHOD_LABELS[payment.method] ?? payment.method} ${fmt(payment.amount)}`).join(", ")}`,
      receiptFooter || "Thank you for your purchase!",
    ].join("\n");
  }

  function handleEmailReceipt() {
    if (!customerEmail) return;
    const subject = encodeURIComponent(`Receipt ${invoiceNumber}`);
    const body = encodeURIComponent(buildReceiptSummary());
    window.location.href = `mailto:${customerEmail}?subject=${subject}&body=${body}`;
  }

  function handleSmsReceipt() {
    if (!customerPhone) return;
    const body = encodeURIComponent(buildReceiptSummary());
    window.location.href = `sms:${customerPhone}?body=${body}`;
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="pos-modal-overlay">
      <div className="pos-modal pos-modal--receipt">
        <div className="pos-modal__head">
          <div className="pos-modal__title-wrap">
            <CheckCircle2 size={18} style={{ color: "#22c55e" }} />
            <h2 className="pos-modal__title">Payment Successful</h2>
          </div>
          <button className="pos-modal__close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="pos-receipt-scroll">
          <div ref={receiptRef} className="pos-receipt">
            <div className="pos-receipt__header">
              <div className="pos-receipt__store">{receiptHeader || branchName}</div>
              <div className="pos-receipt__tagline">Official Sales Receipt</div>
              <div className="pos-receipt__divider" />
              <div className="pos-receipt__meta">
                <span>{invoiceNumber}</span>
                <span>{dateStr} {timeStr}</span>
              </div>
              <div className="pos-receipt__meta">
                <span>Cashier: {cashierName}</span>
                <span>Customer: {customerName}</span>
              </div>
            </div>

            <div className="pos-receipt__divider" />

            <div className="pos-receipt__items">
              {items.map((item, i) => (
                <div key={i} className="pos-receipt__item">
                  <div className="pos-receipt__item-name">{item.name}</div>
                  <div className="pos-receipt__item-row">
                    <span>{item.quantity} x {fmt(item.unitPrice)}</span>
                    {item.discountAmount > 0 ? <span className="pos-receipt__item-disc">- {fmt(item.discountAmount)}</span> : null}
                    <span>{fmt(item.totalPrice)}</span>
                  </div>
                  <div className="pos-receipt__item-sku">{item.sku}</div>
                </div>
              ))}
            </div>

            <div className="pos-receipt__divider" />

            <div className="pos-receipt__totals">
              <div className="pos-receipt__total-row"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
              {discountAmount > 0 ? <div className="pos-receipt__total-row"><span>Discount</span><span>- {fmt(discountAmount)}</span></div> : null}
              <div className="pos-receipt__total-row"><span>VAT (12%)</span><span>{fmt(taxAmount)}</span></div>
              <div className="pos-receipt__total-row pos-receipt__total-row--grand"><span>TOTAL</span><strong>{fmt(total)}</strong></div>
            </div>

            <div className="pos-receipt__divider" />

            <div className="pos-receipt__payments">
              {payments.map((p, i) => (
                <div key={i} className="pos-receipt__total-row">
                  <span>{METHOD_LABELS[p.method] ?? p.method}</span>
                  <span>{fmt(p.amount)}</span>
                </div>
              ))}
              {payments.some((p) => p.method === "cash") ? (
                <>
                  <div className="pos-receipt__total-row"><span>Amount Paid</span><span>{fmt(amountPaid)}</span></div>
                  <div className="pos-receipt__total-row"><span>Change</span><span>{fmt(changeAmount)}</span></div>
                </>
              ) : null}
            </div>

            <div className="pos-receipt__divider" />
            <div className="pos-receipt__footer">
              <p>{receiptFooter || "Thank you for your purchase!"}</p>
              <p>Warranty / returns subject to store policy.</p>
            </div>
          </div>
        </div>

        <div className="pos-modal__foot">
          <button type="button" className="pos-btn-ghost" onClick={handlePrint}>
            <Printer size={15} /> Print Receipt
          </button>
          <button type="button" className="pos-btn-ghost" onClick={handleEmailReceipt} disabled={!customerEmail}>
            <Mail size={15} /> Email Receipt
          </button>
          <button type="button" className="pos-btn-ghost" onClick={handleSmsReceipt} disabled={!customerPhone}>
            <MessageSquare size={15} /> SMS Receipt
          </button>
          <button type="button" className="pos-btn-primary" onClick={onClose}>
            <CheckCircle2 size={15} /> Done - New Sale
          </button>
        </div>
      </div>
    </div>
  );
}
