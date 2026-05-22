"use client";
import { useCallback, useEffect, useState } from "react";
import { X, Play, Trash2, Clock, ShoppingBag, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

type HeldSale = {
  id: string; invoice_number: string; total_amount: number;
  created_at: string; customer_name: string;
  items: {
    product_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    discount_type?: string | null;
    discount_value?: number | null;
    discount_amount?: number | null;
    product_name: string;
    product_sku: string;
  }[];
};

type SaleItemRow = {
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: string | number;
  total_price: string | number;
  discount_type?: string | null;
  discount_value?: string | number | null;
  discount_amount?: string | number | null;
  product: { name: string; sku: string } | null;
};

type Props = {
  branchId: string;
  onClose: () => void;
  onRecall: (sale: HeldSale) => void;
};

function fmt(v: number) {
  return `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RecallModal({ branchId, onClose, onRecall }: Props) {
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadHeld = useCallback(async () => {
    setLoading(true); setError("");
    const { data: sales, error: salesErr } = await supabase
      .from("sales")
      .select("id, invoice_number, total_amount, created_at, customer_id")
      .eq("branch_id", branchId)
      .eq("status", "held")
      .order("created_at", { ascending: false })
      .limit(20);

    if (salesErr) { setError(salesErr.message); setLoading(false); return; }
    if (!sales?.length) { setHeldSales([]); setLoading(false); return; }

    const saleIds = (sales as { id: string }[]).map(s => s.id);
    const { data: saleItems } = await supabase
      .from("sale_items")
      .select("sale_id, product_id, quantity, unit_price, total_price, discount_type, discount_value, discount_amount, product:products(name, sku)")
      .in("sale_id", saleIds);

    const customerIds = (sales as { customer_id: string | null }[]).map(s => s.customer_id).filter(Boolean) as string[];
    const { data: customers } = customerIds.length
      ? await supabase.from("customers").select("id, name").in("id", customerIds)
      : { data: [] };

    const customerMap = new Map((customers as { id: string; name: string }[] ?? []).map(c => [c.id, c.name]));

    const grouped = new Map<string, SaleItemRow[]>();
    ((saleItems as SaleItemRow[] | null) ?? []).forEach(item => {
      const arr = grouped.get(item.sale_id) ?? [];
      arr.push(item);
      grouped.set(item.sale_id, arr);
    });

    const result: HeldSale[] = (sales as {
      id: string; invoice_number: string; total_amount: string | number;
      created_at: string; customer_id: string | null;
    }[]).map(sale => ({
      id: sale.id,
      invoice_number: sale.invoice_number,
      total_amount: Number(sale.total_amount),
      created_at: sale.created_at,
      customer_name: sale.customer_id ? (customerMap.get(sale.customer_id) ?? "Customer") : "Walk-in",
      items: (grouped.get(sale.id) ?? []).map(item => {
        const i = item;
        return {
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: Number(i.unit_price),
          total_price: Number(i.total_price),
          discount_type: i.discount_type ?? null,
          discount_value: Number(i.discount_value ?? 0),
          discount_amount: Number(i.discount_amount ?? 0),
          product_name: i.product?.name ?? "Unknown",
          product_sku: i.product?.sku ?? "",
        };
      }),
    }));

    setHeldSales(result);
    setLoading(false);
  }, [branchId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHeld();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadHeld]);

  async function handleDelete(saleId: string) {
    setDeleting(saleId);
    await supabase.from("sale_items").delete().eq("sale_id", saleId);
    await supabase.from("sales").delete().eq("id", saleId);
    setHeldSales(prev => prev.filter(s => s.id !== saleId));
    setDeleting(null);
  }

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal pos-modal--recall" onClick={e => e.stopPropagation()}>
        <div className="pos-modal__head">
          <div className="pos-modal__title-wrap"><Play size={18} /><h2 className="pos-modal__title">Recall Held Orders</h2></div>
          <button className="pos-modal__close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="pos-modal__body">
          {loading && <div className="pos-modal-loading">Loading held orders…</div>}
          {error && <div className="pos-modal-error"><AlertCircle size={14} /> {error}</div>}
          {!loading && !error && !heldSales.length && (
            <div className="pos-modal-empty"><ShoppingBag size={32} /><p>No held orders found.</p></div>
          )}
          {!loading && heldSales.map(sale => (
            <div key={sale.id} className="pos-held-card">
              <div className="pos-held-card__top">
                <div>
                  <div className="pos-held-card__invoice">{sale.invoice_number}</div>
                  <div className="pos-held-card__meta">
                    <Clock size={11} />
                    {new Date(sale.created_at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    &nbsp;·&nbsp;{sale.customer_name}
                  </div>
                </div>
                <div className="pos-held-card__amount">{fmt(sale.total_amount)}</div>
              </div>
              <div className="pos-held-card__items">
                {sale.items.slice(0, 3).map((item, i) => (
                  <span key={i} className="pos-held-item-chip">{item.product_name} ×{item.quantity}</span>
                ))}
                {sale.items.length > 3 && <span className="pos-held-item-chip pos-held-item-chip--more">+{sale.items.length - 3} more</span>}
              </div>
              <div className="pos-held-card__actions">
                <button
                  type="button"
                  className="pos-btn-ghost pos-btn-ghost--sm"
                  onClick={() => handleDelete(sale.id)}
                  disabled={deleting === sale.id}
                >
                  <Trash2 size={13} /> Discard
                </button>
                <button
                  type="button"
                  className="pos-btn-primary pos-btn-primary--sm"
                  onClick={() => { onRecall(sale); onClose(); }}
                >
                  <CheckCircle2 size={13} /> Recall to Cart
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
