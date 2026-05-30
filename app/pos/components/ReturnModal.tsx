"use client";

import { useState } from "react";
import { AlertCircle, CheckSquare, RotateCcw, Search, Square, UserRound, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatReturnLabel, parseNumber, refundMethodOptions, stockActionOptions } from "@/lib/returns";

type SaleItem = {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  soldQuantity: number;
  availableQuantity: number;
  unit_price: number;
  selected: boolean;
  returnQty: number;
  condition: string;
  stockAction: string;
};

type SearchSale = {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string;
  total_amount: number;
};

type Props = {
  branchId: string;
  cashierId: string;
  onClose: () => void;
  onSuccess: () => void;
};

export default function ReturnModal({ branchId, cashierId, onClose, onSuccess }: Props) {
  const [searchMode, setSearchMode] = useState("receipt");
  const [searchQuery, setSearchQuery] = useState("");
  const [saleMatches, setSaleMatches] = useState<SearchSale[]>([]);
  const [selectedSale, setSelectedSale] = useState<SearchSale | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestType, setRequestType] = useState("refund");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [reason, setReason] = useState("Wrong part ordered");
  const [notes, setNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [searchErr, setSearchErr] = useState("");

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchErr("");
    setSaleMatches([]);
    setSelectedSale(null);
    setSaleItems([]);

    if (searchMode === "receipt") {
      const result = await supabase
        .from("sales")
        .select("id, invoice_number, customer_id, total_amount")
        .eq("branch_id", branchId)
        .eq("status", "completed")
        .ilike("invoice_number", `%${searchQuery.trim()}%`)
        .order("created_at", { ascending: false })
        .limit(8);

      if (result.error) {
        setSearchErr(result.error.message);
        setSearching(false);
        return;
      }

      const rows = ((result.data ?? []) as Array<{ id: string; invoice_number: string; customer_id: string | null; total_amount: number | string }>).map((sale) => ({
        id: sale.id,
        invoice_number: sale.invoice_number,
        customer_id: sale.customer_id,
        customer_name: "Walk-in Customer",
        total_amount: parseNumber(sale.total_amount),
      }));

      if (!rows.length) {
        setSearchErr("No completed sale matched that receipt number.");
      }

      if (rows.some((row) => row.customer_id)) {
        const customerIds = rows.map((row) => row.customer_id).filter(Boolean) as string[];
        const customersResult = customerIds.length
          ? await supabase.from("customers").select("id, name").in("id", customerIds)
          : { data: [], error: null };

        if (customersResult.error) {
          setSearchErr(customersResult.error.message);
          setSearching(false);
          return;
        }

        const customerMap = new Map(((customersResult.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]));
        setSaleMatches(rows.map((row) => ({ ...row, customer_name: row.customer_id ? customerMap.get(row.customer_id) ?? "Walk-in Customer" : "Walk-in Customer" })));
      } else {
        setSaleMatches(rows);
      }

      setSearching(false);
      return;
    }

    const customerResult = await supabase
      .from("customers")
      .select("id, name")
      .eq("branch_id", branchId)
      .ilike("name", `%${searchQuery.trim()}%`)
      .limit(10);

    if (customerResult.error) {
      setSearchErr(customerResult.error.message);
      setSearching(false);
      return;
    }

    const customers = (customerResult.data ?? []) as Array<{ id: string; name: string }>;
    if (!customers.length) {
      setSearchErr("No customer matched that name.");
      setSearching(false);
      return;
    }

    const salesResult = await supabase
      .from("sales")
      .select("id, invoice_number, customer_id, total_amount")
      .eq("branch_id", branchId)
      .eq("status", "completed")
      .in("customer_id", customers.map((customer) => customer.id))
      .order("created_at", { ascending: false })
      .limit(10);

    if (salesResult.error) {
      setSearchErr(salesResult.error.message);
      setSearching(false);
      return;
    }

    const customerMap = new Map(customers.map((customer) => [customer.id, customer.name]));
    const rows = ((salesResult.data ?? []) as Array<{ id: string; invoice_number: string; customer_id: string | null; total_amount: number | string }>).map((sale) => ({
      id: sale.id,
      invoice_number: sale.invoice_number,
      customer_id: sale.customer_id,
      customer_name: sale.customer_id ? customerMap.get(sale.customer_id) ?? "Walk-in Customer" : "Walk-in Customer",
      total_amount: parseNumber(sale.total_amount),
    }));

    setSaleMatches(rows);
    if (!rows.length) {
      setSearchErr("No completed sales were found for that customer.");
    }
    setSearching(false);
  }

  async function loadSaleItems(sale: SearchSale) {
    setSelectedSale(sale);
    setSaleItems([]);
    setError("");

    const itemsResult = await supabase
      .from("sale_items")
      .select("id, product_id, quantity, returned_quantity, unit_price")
      .eq("sale_id", sale.id);

    if (itemsResult.error) {
      setError(itemsResult.error.message);
      return;
    }

    const productIds = ((itemsResult.data ?? []) as Array<{ product_id: string }>).map((item) => item.product_id);
    const productsResult = productIds.length
      ? await supabase.from("products").select("id, name, sku").in("id", productIds)
      : { data: [], error: null };

    if (productsResult.error) {
      setError(productsResult.error.message);
      return;
    }

    const productMap = new Map(((productsResult.data ?? []) as Array<{ id: string; name: string; sku: string }>).map((product) => [product.id, product]));
    const normalizedItems = ((itemsResult.data ?? []) as Array<{ id: string; product_id: string; quantity: number; returned_quantity?: number | null; unit_price: string | number }>)
      .map((item) => {
        const soldQuantity = Number(item.quantity ?? 0);
        const availableQuantity = Math.max(0, soldQuantity - Number(item.returned_quantity ?? 0));
        const product = productMap.get(item.product_id);
        return {
          id: item.id,
          product_id: item.product_id,
          product_name: product?.name ?? "Unknown Product",
          product_sku: product?.sku ?? "",
          soldQuantity,
          availableQuantity,
          unit_price: parseNumber(item.unit_price),
          selected: false,
          returnQty: availableQuantity > 0 ? 1 : 0,
          condition: "good",
          stockAction: "restock",
        };
      })
      .filter((item) => item.availableQuantity > 0);

    setSaleItems(normalizedItems);
  }

  function updateItem(index: number, field: keyof SaleItem, value: boolean | number | string) {
    setSaleItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  }

  const selectedItems = saleItems.filter((item) => item.selected);
  const refundTotal = selectedItems.reduce((sum, item) => sum + item.unit_price * item.returnQty, 0);

  async function handleReturnRequest() {
    if (!selectedSale) {
      setError("Select a completed sale first.");
      return;
    }

    if (!selectedItems.length) {
      setError("Select at least one item to return.");
      return;
    }

    setProcessing(true);
    setError("");

    try {
      const response = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          cashierId,
          saleId: selectedSale.id,
          customerId: selectedSale.customer_id,
          searchMode,
          requestType,
          reason,
          notes,
          refundMethod,
          refundAmount: requestType === "refund" ? refundTotal : 0,
          storeCredit: refundMethod === "customer_credit" ? refundTotal : 0,
          approvalRequired: true,
          stockHandling: selectedItems.some((item) => item.stockAction !== "restock") ? "mixed" : "restock",
          items: selectedItems.map((item) => ({
            productId: item.product_id,
            saleItemId: item.id,
            quantity: item.returnQty,
            unitPrice: item.unit_price,
            condition: item.condition,
            stockAction: item.stockAction,
          })),
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Return request failed.");

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal pos-modal--return" onClick={(event) => event.stopPropagation()}>
        <div className="pos-modal__head">
          <div className="pos-modal__title-wrap">
            <RotateCcw size={18} style={{ color: "#f59e0b" }} />
            <h2 className="pos-modal__title">Return / Refund / Warranty</h2>
          </div>
          <button className="pos-modal__close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="pos-modal__body">
          <div className="pos-return-search-mode">
            <button type="button" className={`pos-pay-chip ${searchMode === "receipt" ? "pos-pay-chip--cash" : "pos-pay-chip--other"}`} onClick={() => setSearchMode("receipt")}>
              <Search size={14} />
              <span>Receipt</span>
            </button>
            <button type="button" className={`pos-pay-chip ${searchMode === "customer" ? "pos-pay-chip--cash" : "pos-pay-chip--other"}`} onClick={() => setSearchMode("customer")}>
              <UserRound size={14} />
              <span>Customer</span>
            </button>
          </div>

          <div className="pos-void-search">
            <input
              type="text"
              placeholder={searchMode === "receipt" ? "Enter receipt number..." : "Enter customer name..."}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void handleSearch()}
              className="pos-void-search__input"
            />
            <button type="button" onClick={() => void handleSearch()} className="pos-void-search__btn" disabled={searching}>
              <Search size={15} />
            </button>
          </div>

          {searchErr ? <div className="pos-pay-error"><AlertCircle size={13} /> {searchErr}</div> : null}

          <div className="pos-return-sales">
            {saleMatches.map((sale) => (
              <button
                key={sale.id}
                type="button"
                className={`pos-return-sale-card ${selectedSale?.id === sale.id ? "pos-return-sale-card--active" : ""}`}
                onClick={() => void loadSaleItems(sale)}
              >
                <strong>{sale.invoice_number}</strong>
                <span>{sale.customer_name}</span>
                <span>{formatCurrency(sale.total_amount)}</span>
              </button>
            ))}
          </div>

          {selectedSale ? (
            <>
              <div className="pos-void-selected-info">Selected: <strong>{selectedSale.invoice_number}</strong> • {selectedSale.customer_name}</div>

              <div className="pos-return-form">
                <label className="pos-pay-label">
                  Request Type
                  <select value={requestType} onChange={(event) => setRequestType(event.target.value)} className="pos-pay-input">
                    <option value="refund">Refund</option>
                    <option value="exchange">Exchange</option>
                    <option value="warranty">Warranty</option>
                  </select>
                </label>
                <label className="pos-pay-label">
                  Reason
                  <select value={reason} onChange={(event) => setReason(event.target.value)} className="pos-pay-input">
                    <option value="Wrong part ordered">Wrong part ordered</option>
                    <option value="Defective item">Defective item</option>
                    <option value="Changed mind">Changed mind</option>
                    <option value="Damaged item">Damaged item</option>
                    <option value="Warranty claim">Warranty claim</option>
                  </select>
                </label>
                <label className="pos-pay-label">
                  Refund Method
                  <select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)} className="pos-pay-input">
                    {refundMethodOptions.map((option) => (
                      <option key={option} value={option}>{formatReturnLabel(option)}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="pos-return-items">
                {saleItems.map((item, index) => (
                  <div key={item.id} className={`pos-return-item${item.selected ? " pos-return-item--selected" : ""}`}>
                    <button type="button" className="pos-return-item__check" onClick={() => updateItem(index, "selected", !item.selected)}>
                      {item.selected ? <CheckSquare size={16} style={{ color: "#3b82f6" }} /> : <Square size={16} />}
                    </button>
                    <div className="pos-return-item__info">
                      <div className="pos-return-item__name">{item.product_name}</div>
                      <div className="pos-return-item__sku">{item.product_sku} • {formatCurrency(item.unit_price)} • Available {item.availableQuantity}</div>
                    </div>

                    {item.selected ? (
                      <div className="pos-return-item__controls">
                        <label>Qty
                          <input
                            type="number"
                            min={1}
                            max={item.availableQuantity}
                            value={item.returnQty}
                            onChange={(event) => updateItem(index, "returnQty", Math.min(item.availableQuantity, Math.max(1, Number(event.target.value) || 1)))}
                            className="pos-return-qty"
                          />
                        </label>
                        <label>Condition
                          <select value={item.condition} onChange={(event) => updateItem(index, "condition", event.target.value)} className="pos-return-select">
                            <option value="good">Good</option>
                            <option value="damaged">Damaged</option>
                            <option value="defective">Defective</option>
                          </select>
                        </label>
                        <label>Handling
                          <select value={item.stockAction} onChange={(event) => updateItem(index, "stockAction", event.target.value)} className="pos-return-select">
                            {stockActionOptions.map((option) => (
                              <option key={option} value={option}>{formatReturnLabel(option)}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <label className="pos-pay-label">
                Notes
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="pos-pay-input" rows={3} />
              </label>

              <div className="pos-return-total">
                Request Amount: <strong>{formatCurrency(refundTotal)}</strong>
              </div>
            </>
          ) : null}

          {error ? <div className="pos-pay-error"><AlertCircle size={14} /> {error}</div> : null}
        </div>

        <div className="pos-modal__foot">
          <button type="button" className="pos-btn-ghost" onClick={onClose} disabled={processing}>Cancel</button>
          <button type="button" className="pos-btn-warn" onClick={handleReturnRequest} disabled={processing || !selectedSale || !selectedItems.length}>
            <RotateCcw size={15} /> {processing ? "Submitting..." : "Submit Return Request"}
          </button>
        </div>
      </div>
    </div>
  );
}
