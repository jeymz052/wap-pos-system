"use client";
import { useState } from "react";
import { X, RotateCcw, Search, AlertCircle, CheckSquare, Square } from "lucide-react";
import { supabase } from "@/lib/supabase";

type SaleItem = { id: string; product_id: string; product_name: string; product_sku: string; quantity: number; unit_price: number; selected: boolean; returnQty: number; condition: string; restock: boolean };
type Props = { branchId: string; cashierId: string; onClose: () => void; onSuccess: () => void; };

function fmt(v: number) { return `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export default function ReturnModal({ branchId, cashierId, onClose, onSuccess }: Props) {
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [foundSale, setFoundSale] = useState<{ id: string; invoice_number: string; customer_id: string | null } | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [refundMethod, setRefundMethod] = useState("cash");
  const [reason, setReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [searchErr, setSearchErr] = useState("");

  async function handleSearch() {
    if (!invoiceQuery.trim()) return;
    setSearching(true); setSearchErr(""); setFoundSale(null); setSaleItems([]);
    const { data: sales } = await supabase
      .from("sales")
      .select("id, invoice_number, customer_id")
      .eq("branch_id", branchId)
      .eq("status", "completed")
      .ilike("invoice_number", `%${invoiceQuery.trim()}%`)
      .limit(1);

    if (!sales?.length) { setSearchErr("No completed sale found with that invoice number."); setSearching(false); return; }
    const sale = (sales as { id: string; invoice_number: string; customer_id: string | null }[])[0];
    setFoundSale(sale);

    const { data: items } = await supabase
      .from("sale_items")
      .select("id, product_id, quantity, unit_price, product:products(name, sku)")
      .eq("sale_id", sale.id);

    setSaleItems(((items ?? []) as unknown as { id: string; product_id: string; quantity: number; unit_price: string | number; product: { name: string; sku: string } | null }[]).map(item => ({
      id: item.id,
      product_id: item.product_id,
      product_name: item.product?.name ?? "Unknown",
      product_sku: item.product?.sku ?? "",
      quantity: item.quantity,
      unit_price: Number(item.unit_price),
      selected: false,
      returnQty: item.quantity,
      condition: "good",
      restock: true,
    })));
    setSearching(false);
  }

  function toggleItem(idx: number) {
    setSaleItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it));
  }
  function updateItem(idx: number, field: string, value: unknown) {
    setSaleItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }

  const selectedItems = saleItems.filter(it => it.selected);
  const refundTotal = selectedItems.reduce((s, it) => s + it.unit_price * it.returnQty, 0);

  async function handleReturn() {
    if (!foundSale) { setError("Search for a sale first."); return; }
    if (!selectedItems.length) { setError("Select at least one item to return."); return; }
    if (!reason.trim()) { setError("Enter a reason for the return."); return; }
    setError(""); setProcessing(true);
    try {
      const resp = await fetch("/api/pos/return-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: foundSale.id,
          branchId, cashierId,
          customerId: foundSale.customer_id,
          items: selectedItems.map(it => ({
            productId: it.product_id,
            saleItemId: it.id,
            quantity: it.returnQty,
            unitPrice: it.unit_price,
            condition: it.condition,
            restock: it.restock,
          })),
          refundMethod,
          refundAmount: refundTotal,
          reason: reason.trim(),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Return failed.");
      onSuccess(); onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally { setProcessing(false); }
  }

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal pos-modal--return" onClick={e => e.stopPropagation()}>
        <div className="pos-modal__head">
          <div className="pos-modal__title-wrap"><RotateCcw size={18} style={{ color: "#f59e0b" }} /><h2 className="pos-modal__title">Return / Refund</h2></div>
          <button className="pos-modal__close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="pos-modal__body">
          {/* Invoice search */}
          <div className="pos-void-search">
            <input type="text" placeholder="Enter invoice number to look up…" value={invoiceQuery}
              onChange={e => setInvoiceQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()} className="pos-void-search__input" />
            <button type="button" onClick={handleSearch} className="pos-void-search__btn" disabled={searching}>
              <Search size={15} />
            </button>
          </div>
          {searchErr && <div className="pos-pay-error"><AlertCircle size={13} /> {searchErr}</div>}

          {foundSale && (
            <>
              <div className="pos-void-selected-info">Found: <strong>{foundSale.invoice_number}</strong></div>
              <div className="pos-return-items">
                {saleItems.map((item, i) => (
                  <div key={item.id} className={`pos-return-item${item.selected ? " pos-return-item--selected" : ""}`}>
                    <button type="button" className="pos-return-item__check" onClick={() => toggleItem(i)}>
                      {item.selected ? <CheckSquare size={16} style={{ color: "#3b82f6" }} /> : <Square size={16} />}
                    </button>
                    <div className="pos-return-item__info">
                      <div className="pos-return-item__name">{item.product_name}</div>
                      <div className="pos-return-item__sku">{item.product_sku} · {fmt(item.unit_price)} each · Sold: {item.quantity}</div>
                    </div>
                    {item.selected && (
                      <div className="pos-return-item__controls">
                        <label>Qty
                          <input type="number" min={1} max={item.quantity} value={item.returnQty}
                            onChange={e => updateItem(i, "returnQty", Math.min(item.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                            className="pos-return-qty" />
                        </label>
                        <label>Condition
                          <select value={item.condition} onChange={e => updateItem(i, "condition", e.target.value)} className="pos-return-select">
                            <option value="good">Good</option>
                            <option value="damaged">Damaged</option>
                            <option value="defective">Defective</option>
                          </select>
                        </label>
                        <label className="pos-return-restock">
                          <input type="checkbox" checked={item.restock} onChange={e => updateItem(i, "restock", e.target.checked)} />
                          Restock
                        </label>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="pos-return-form">
                <label className="pos-pay-label">Reason for Return <span style={{ color: "#ef4444" }}>*</span>
                  <select value={reason} onChange={e => setReason(e.target.value)} className="pos-pay-input">
                    <option value="">— Select reason —</option>
                    <option value="Wrong part ordered">Wrong part ordered</option>
                    <option value="Defective item">Defective item</option>
                    <option value="Duplicate purchase">Duplicate purchase</option>
                    <option value="Changed mind">Changed mind</option>
                    <option value="Warranty claim">Warranty claim</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <label className="pos-pay-label">Refund Method
                  <select value={refundMethod} onChange={e => setRefundMethod(e.target.value)} className="pos-pay-input">
                    <option value="cash">Cash</option>
                    <option value="card">Card Reversal</option>
                    <option value="gcash">GCash / E-Wallet</option>
                    <option value="customer_credit">Store Credit</option>
                  </select>
                </label>
                {selectedItems.length > 0 && (
                  <div className="pos-return-total">
                    Refund Amount: <strong>{fmt(refundTotal)}</strong>
                  </div>
                )}
              </div>
            </>
          )}
          {error && <div className="pos-pay-error"><AlertCircle size={14} /> {error}</div>}
        </div>
        <div className="pos-modal__foot">
          <button type="button" className="pos-btn-ghost" onClick={onClose} disabled={processing}>Cancel</button>
          <button type="button" className="pos-btn-warn" onClick={handleReturn}
            disabled={processing || !foundSale || !selectedItems.length || !reason}>
            <RotateCcw size={15} /> {processing ? "Processing…" : `Process Return ${selectedItems.length > 0 ? fmt(refundTotal) : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
