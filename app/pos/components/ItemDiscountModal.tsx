"use client";
import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Tag, X } from "lucide-react";

type CartItem = {
  id: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  overridePrice?: number;
  itemDiscountType?: string;
  itemDiscountValue?: number;
  itemDiscountAmount?: number;
  approvedByUserId?: string;
};

type Props = {
  item: CartItem;
  canOverridePrice: boolean;
  canApplyDiscount: boolean;
  onClose: () => void;
  onApply: (
    productId: string,
    overridePrice: number | undefined,
    discountType: string | undefined,
    discountValue: number,
    discountAmount: number,
    approvedByUserId?: string
  ) => void;
};

function fmt(v: number) {
  return `P${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ItemDiscountModal({ item, canOverridePrice, canApplyDiscount, onClose, onApply }: Props) {
  const [priceOverride, setPriceOverride] = useState((item.overridePrice ?? item.price).toFixed(2));
  const [discountType, setDiscountType] = useState(item.itemDiscountType ?? "fixed");
  const [discountValue, setDiscountValue] = useState(String(item.itemDiscountValue ?? "0"));
  const [supervisorUsername, setSupervisorUsername] = useState("");
  const [supervisorPin, setSupervisorPin] = useState("");
  const [error, setError] = useState("");

  const effectivePrice = useMemo(() => Math.max(0, parseFloat(priceOverride) || 0), [priceOverride]);

  const discVal = useMemo(() => Math.max(0, parseFloat(discountValue) || 0), [discountValue]);

  const discAmt = useMemo(() => {
    return discountType === "percent"
      ? Math.min((effectivePrice * discVal) / 100, effectivePrice)
      : Math.min(discVal, effectivePrice);
  }, [discVal, discountType, effectivePrice]);

  const finalPrice = Math.max(0, effectivePrice - discAmt);
  const lineTotal = finalPrice * item.quantity;

  async function handleApply() {
    const normalizedOverride = Math.abs(effectivePrice - item.price) > 0.009
      ? effectivePrice
      : undefined;

    const requestedPermissions: string[] = [];
    if (normalizedOverride !== undefined && !canOverridePrice) {
      requestedPermissions.push("pos:edit");
    }
    if (canApplyDiscount ? false : discAmt > 0) {
      requestedPermissions.push("pos:apply_discount");
    }

    let approvedByUserId = item.approvedByUserId;
    if (requestedPermissions.length) {
      if (!supervisorUsername.trim() || !supervisorPin.trim()) {
        setError("Supervisor username and PIN are required for this price change.");
        return;
      }

      const approvalResp = await fetch("/api/auth/verify-pos-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: supervisorUsername.trim(),
          pin: supervisorPin.trim(),
          permissions: requestedPermissions,
        }),
      });
      const approvalData = await approvalResp.json();
      if (!approvalResp.ok) {
        setError(approvalData.error || "Supervisor approval failed.");
        return;
      }
      approvedByUserId = approvalData.approver.userId;
    }

    const allowDiscountForThisChange = canApplyDiscount || requestedPermissions.includes("pos:apply_discount");
    const allowOverrideForThisChange = canOverridePrice || requestedPermissions.includes("pos:edit");

    onApply(
      item.id,
      allowOverrideForThisChange ? normalizedOverride : undefined,
      allowDiscountForThisChange && discAmt > 0 ? discountType : undefined,
      allowDiscountForThisChange ? discVal : 0,
      allowDiscountForThisChange ? discAmt : 0,
      approvedByUserId
    );
    onClose();
  }

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal pos-modal--item-disc" onClick={(e) => e.stopPropagation()}>
        <div className="pos-modal__head">
          <div className="pos-modal__title-wrap">
            <Tag size={18} />
            <h2 className="pos-modal__title">Item Price and Discount</h2>
          </div>
          <button className="pos-modal__close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="pos-modal__body">
          <div className="pos-item-disc__product">
            <div className="pos-item-disc__name">{item.name}</div>
            <div className="pos-item-disc__sku">{item.sku} · Qty: {item.quantity}</div>
            <div className="pos-item-disc__orig">Original Price: {fmt(item.price)}</div>
          </div>

          <label className="pos-pay-label">
            Price Override (per unit)
            <input
              type="number"
              min={0}
              step="0.01"
              value={priceOverride}
              onChange={(e) => setPriceOverride(e.target.value)}
              className="pos-pay-input"
            />
          </label>
          {!canOverridePrice ? <p className="pos-pay-warning">Price override needs `pos:edit` or supervisor approval.</p> : null}

          <div className="pos-item-disc__disc-row">
            <label className="pos-pay-label" style={{ flex: 1 }}>
              Discount Type
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}
                className="pos-pay-input"
              >
                <option value="fixed">Fixed (P)</option>
                <option value="percent">Percent (%)</option>
              </select>
            </label>
            <label className="pos-pay-label" style={{ flex: 1 }}>
              Discount Value
              <input
                type="number"
                min={0}
                step="0.01"
                max={discountType === "percent" ? 100 : undefined}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="pos-pay-input"
              />
            </label>
          </div>
          {!canApplyDiscount ? <p className="pos-pay-warning">Item discount needs `pos:apply_discount` or supervisor approval.</p> : null}

          {((!canOverridePrice && effectivePrice !== item.price) || (!canApplyDiscount && discAmt > 0)) ? (
            <>
              <label className="pos-pay-label">
                Supervisor Username
                <input
                  type="text"
                  value={supervisorUsername}
                  onChange={(e) => setSupervisorUsername(e.target.value)}
                  className="pos-pay-input"
                  placeholder="Enter approving username"
                />
              </label>
              <label className="pos-pay-label">
                Supervisor PIN
                <input
                  type="password"
                  value={supervisorPin}
                  onChange={(e) => setSupervisorPin(e.target.value)}
                  className="pos-pay-input"
                  placeholder="Enter approving PIN"
                />
              </label>
            </>
          ) : null}

          <div className="pos-item-disc__preview">
            <div className="pos-item-disc__preview-row"><span>Unit Price</span><span>{fmt(effectivePrice)}</span></div>
            {discAmt > 0 ? <div className="pos-item-disc__preview-row pos-item-disc__preview-row--disc"><span>Discount</span><span>- {fmt(discAmt)}</span></div> : null}
            <div className="pos-item-disc__preview-row"><span>Net Unit Price</span><span>{fmt(finalPrice)}</span></div>
            <div className="pos-item-disc__preview-row pos-item-disc__preview-row--total"><span>Line Total x{item.quantity}</span><strong>{fmt(lineTotal)}</strong></div>
          </div>

          {error ? (
            <div className="pos-pay-error">
              <AlertCircle size={15} /> {error}
            </div>
          ) : null}
        </div>

        <div className="pos-modal__foot">
          <button type="button" className="pos-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="pos-btn-primary" onClick={() => void handleApply()}>
            <CheckCircle2 size={15} /> Apply
          </button>
        </div>
      </div>
    </div>
  );
}
