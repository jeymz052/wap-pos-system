"use client";
import { useEffect, useRef } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Download, Mail, MessageSquare, Printer, X, CheckCircle2 } from "lucide-react";
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
  issuedAt?: string;
  shopName?: string;
  shopAddress?: string;
  shopPhone?: string;
  shopTaxId?: string;
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
    issuedAt,
    shopName,
    shopAddress,
    shopPhone,
    shopTaxId,
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
      shopName || receiptHeader || branchName,
      shopAddress ? `Address: ${shopAddress}` : "",
      shopPhone ? `Contact: ${shopPhone}` : "",
      shopTaxId ? `TIN/VAT No.: ${shopTaxId}` : "",
      `Receipt: ${invoiceNumber}`,
      `Customer: ${customerName}`,
      `Cashier: ${cashierName}`,
      ...items.map((item) => `${item.quantity} x ${item.name} = ${fmt(item.totalPrice)}`),
      `Total: ${fmt(total)}`,
      `Payments: ${payments.map((payment) => `${METHOD_LABELS[payment.method] ?? payment.method} ${fmt(payment.amount)}`).join(", ")}`,
      receiptFooter || "Thank you for your purchase!",
    ].join("\n");
  }

  function handleSavePdf() {
    const doc = new jsPDF({
      unit: "mm",
      format: [80, 180],
    });

    const receiptDate = new Date(issuedAt ?? new Date().toISOString());
    const dateLabel = new Intl.DateTimeFormat("en-PH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(receiptDate);

    let cursorY = 8;
    doc.setFont("courier", "bold");
    doc.setFontSize(11);
    doc.text("WAP POS", 40, cursorY, { align: "center" });
    cursorY += 5;
    doc.setFontSize(8.5);
    doc.text("Motorparts POS & Inventory", 40, cursorY, { align: "center" });
    cursorY += 5;
    doc.setFont("courier", "normal");
    doc.text(`Shop Name: ${shopName || receiptHeader || branchName}`, 6, cursorY);
    cursorY += 4;
    if (shopAddress) {
      doc.text(`Address: ${shopAddress}`, 6, cursorY, { maxWidth: 68 });
      cursorY += 8;
    }
    if (shopPhone) {
      doc.text(`Contact: ${shopPhone}`, 6, cursorY);
      cursorY += 4;
    }
    doc.text(`TIN/VAT No.: ${shopTaxId || "-"}`, 6, cursorY);
    cursorY += 4;
    doc.text("------------------------------------------------", 6, cursorY);
    cursorY += 4;
    doc.text(`Receipt No.: ${invoiceNumber}`, 6, cursorY);
    cursorY += 4;
    doc.text(`Date: ${dateLabel}`, 6, cursorY);
    cursorY += 4;
    doc.text(`Cashier: ${cashierName}`, 6, cursorY);
    cursorY += 4;
    doc.text(`Branch: ${branchName}`, 6, cursorY);
    cursorY += 4;
    doc.text("------------------------------------------------", 6, cursorY);
    cursorY += 2;

    autoTable(doc, {
      startY: cursorY,
      theme: "plain",
      margin: { left: 6, right: 6 },
      styles: { font: "courier", fontSize: 7, cellPadding: 0.6 },
      headStyles: { fontStyle: "bold" },
      head: [["Item", "Qty", "Price", "Total"]],
      body: items.map((item) => [
        item.name,
        String(item.quantity),
        fmt(item.unitPrice),
        fmt(item.totalPrice),
      ]),
    });

    cursorY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? cursorY + 8;
    cursorY += 2;
    doc.text("------------------------------------------------", 6, cursorY);
    cursorY += 4;
    doc.text(`Subtotal: ${fmt(subtotal)}`, 6, cursorY);
    cursorY += 4;
    doc.text(`Discount: ${fmt(discountAmount)}`, 6, cursorY);
    cursorY += 4;
    doc.text(`VAT/Tax: ${fmt(taxAmount)}`, 6, cursorY);
    cursorY += 4;
    doc.setFont("courier", "bold");
    doc.text(`TOTAL: ${fmt(total)}`, 6, cursorY);
    cursorY += 4;
    doc.setFont("courier", "normal");
    for (const payment of payments) {
      doc.text(`${METHOD_LABELS[payment.method] ?? payment.method}: ${fmt(payment.amount)}`, 6, cursorY);
      cursorY += 4;
    }
    if (payments.some((payment) => payment.method === "cash")) {
      doc.text(`Change: ${fmt(changeAmount)}`, 6, cursorY);
      cursorY += 4;
    }
    doc.text("------------------------------------------------", 6, cursorY);
    cursorY += 4;
    doc.text(receiptFooter || "Thank you for your purchase!", 40, cursorY, { align: "center", maxWidth: 68 });
    cursorY += 5;
    doc.text("No return without receipt.", 40, cursorY, { align: "center" });
    cursorY += 4;
    doc.text("Powered by WAP POS", 40, cursorY, { align: "center" });

    doc.save(`${invoiceNumber}.pdf`);
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

  const now = new Date(issuedAt ?? new Date().toISOString());
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
              <div className="pos-receipt__store">WAP POS</div>
              <div className="pos-receipt__tagline">Motorparts POS & Inventory</div>
              <div className="pos-receipt__meta">
                <span>Shop Name: {shopName || receiptHeader || branchName}</span>
              </div>
              {shopAddress ? <div className="pos-receipt__meta"><span>Address: {shopAddress}</span></div> : null}
              {shopPhone ? <div className="pos-receipt__meta"><span>Contact: {shopPhone}</span></div> : null}
              <div className="pos-receipt__meta">
                <span>TIN/VAT No.: {shopTaxId || "-"}</span>
              </div>
              <div className="pos-receipt__divider" />
              <div className="pos-receipt__meta">
                <span>Receipt No.: {invoiceNumber}</span>
                <span>{dateStr} {timeStr}</span>
              </div>
              <div className="pos-receipt__meta">
                <span>Cashier: {cashierName}</span>
                <span>Branch: {branchName}</span>
              </div>
              <div className="pos-receipt__meta">
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
              <p>No return without receipt.</p>
              <p>Powered by WAP POS</p>
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
          <button type="button" className="pos-btn-ghost" onClick={handleSavePdf}>
            <Download size={15} /> Save as PDF
          </button>
          <button type="button" className="pos-btn-primary" onClick={onClose}>
            <CheckCircle2 size={15} /> Done - New Sale
          </button>
        </div>
      </div>
    </div>
  );
}
