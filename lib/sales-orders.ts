export type CustomerPricingRow = {
  id: string;
  customer_id: string;
  product_id: string;
  price_type?: string | null;
  fixed_price?: number | string | null;
  discount_percent?: number | string | null;
  minimum_quantity?: number | null;
  effective_from?: string | null;
  effective_to?: string | null;
  is_active?: boolean | null;
  notes?: string | null;
};

export type BulkPricingRow = {
  id: string;
  product_id: string;
  minimum_quantity?: number | null;
  unit_price?: number | string | null;
  discount_percent?: number | string | null;
  customer_type?: string | null;
  is_active?: boolean | null;
  notes?: string | null;
};

export type PricingCustomer = {
  id?: string | null;
  name?: string | null;
  customer_type?: string | null;
  email?: string | null;
};

export type PricingProduct = {
  id: string;
  name?: string | null;
  sku?: string | null;
  selling_price?: number | string | null;
  wholesale_price?: number | string | null;
};

export type QuoteLike = {
  quote_number: string;
  valid_until?: string | null;
  subtotal?: number | string | null;
  discount_amount?: number | string | null;
  tax_amount?: number | string | null;
  total_amount?: number | string | null;
  notes?: string | null;
};

export type QuoteLineLike = {
  quantity: number;
  unit_price?: number | string | null;
  line_discount_amount?: number | string | null;
  total_price?: number | string | null;
  price_source?: string | null;
  pricing_notes?: string | null;
  product?: PricingProduct | null;
};

type PricingResult = {
  unitPrice: number;
  lineDiscountAmount: number;
  totalPrice: number;
  priceSource: string;
  pricingNotes: string;
};

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(value: number) {
  return pesoFormatter.format(value).replace("PHP", "PHP ");
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatLabel(value?: string | null) {
  if (!value) return "-";
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function buildQuoteNumber() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `QT-${stamp}`;
}

export function buildSalesOrderNumber() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `SO-${stamp}`;
}

function isPricingActive(row: CustomerPricingRow | BulkPricingRow, quantity: number, customerType?: string | null) {
  if (row.is_active === false) return false;
  if (Number(row.minimum_quantity ?? 1) > quantity) return false;

  if ("customer_type" in row && row.customer_type && customerType && row.customer_type !== customerType) {
    return false;
  }

  const now = new Date().toISOString().slice(0, 10);
  if ("effective_from" in row && row.effective_from && row.effective_from > now) return false;
  if ("effective_to" in row && row.effective_to && row.effective_to < now) return false;
  return true;
}

export function resolveLinePricing({
  customer,
  product,
  quantity,
  customerPricing,
  bulkPricing,
}: {
  customer?: PricingCustomer | null;
  product: PricingProduct;
  quantity: number;
  customerPricing: CustomerPricingRow[];
  bulkPricing: BulkPricingRow[];
}): PricingResult {
  const safeQuantity = Math.max(1, Number(quantity || 1));
  const retailPrice = roundMoney(parseNumber(product.selling_price));
  const wholesalePrice = roundMoney(parseNumber(product.wholesale_price));
  let workingUnitPrice = retailPrice;
  let priceSource = "retail";
  const notes: string[] = [];

  const matchedCustomerPrice = customer?.id
    ? customerPricing
        .filter(
          (row) =>
            row.customer_id === customer.id &&
            row.product_id === product.id &&
            isPricingActive(row, safeQuantity, customer.customer_type)
        )
        .sort(
          (a, b) =>
            Number(b.minimum_quantity ?? 1) - Number(a.minimum_quantity ?? 1) ||
            String(b.effective_from ?? "").localeCompare(String(a.effective_from ?? ""))
        )[0]
    : undefined;

  if (matchedCustomerPrice) {
    if (parseNumber(matchedCustomerPrice.fixed_price) > 0) {
      workingUnitPrice = roundMoney(parseNumber(matchedCustomerPrice.fixed_price));
      priceSource = "customer_specific";
      notes.push("Customer-specific fixed price applied");
    } else if (parseNumber(matchedCustomerPrice.discount_percent) > 0) {
      workingUnitPrice = roundMoney(retailPrice * (1 - parseNumber(matchedCustomerPrice.discount_percent) / 100));
      priceSource = "customer_specific";
      notes.push(`Customer-specific ${parseNumber(matchedCustomerPrice.discount_percent)}% discount`);
    }

    if (matchedCustomerPrice.notes?.trim()) {
      notes.push(matchedCustomerPrice.notes.trim());
    }
  } else if (customer?.customer_type === "wholesale" && wholesalePrice > 0) {
    workingUnitPrice = wholesalePrice;
    priceSource = "wholesale";
    notes.push("Wholesale price applied");
  }

  const matchedBulkPrice = bulkPricing
    .filter(
      (row) =>
        row.product_id === product.id &&
        isPricingActive(row, safeQuantity, customer?.customer_type) &&
        (!row.customer_type || row.customer_type === customer?.customer_type)
    )
    .sort((a, b) => {
      const customerTypeScoreA = a.customer_type ? 1 : 0;
      const customerTypeScoreB = b.customer_type ? 1 : 0;
      return (
        customerTypeScoreB - customerTypeScoreA ||
        Number(b.minimum_quantity ?? 1) - Number(a.minimum_quantity ?? 1)
      );
    })[0];

  if (matchedBulkPrice) {
    if (parseNumber(matchedBulkPrice.unit_price) > 0) {
      const bulkUnitPrice = roundMoney(parseNumber(matchedBulkPrice.unit_price));
      if (bulkUnitPrice < workingUnitPrice || priceSource === "retail") {
        workingUnitPrice = bulkUnitPrice;
        priceSource = priceSource === "retail" ? "bulk" : `${priceSource}_bulk`;
        notes.push(`Bulk unit price for ${safeQuantity}+ units`);
      }
    } else if (parseNumber(matchedBulkPrice.discount_percent) > 0) {
      workingUnitPrice = roundMoney(
        workingUnitPrice * (1 - parseNumber(matchedBulkPrice.discount_percent) / 100)
      );
      priceSource = priceSource === "retail" ? "bulk" : `${priceSource}_bulk`;
      notes.push(`Bulk discount ${parseNumber(matchedBulkPrice.discount_percent)}%`);
    }

    if (matchedBulkPrice.notes?.trim()) {
      notes.push(matchedBulkPrice.notes.trim());
    }
  }

  const unitPrice = Math.max(0, roundMoney(workingUnitPrice));
  const lineDiscountAmount = Math.max(0, roundMoney((retailPrice - unitPrice) * safeQuantity));
  const totalPrice = roundMoney(unitPrice * safeQuantity);

  return {
    unitPrice,
    lineDiscountAmount,
    totalPrice,
    priceSource,
    pricingNotes: notes.join(". "),
  };
}

export function buildQuotationEmailHtml({
  quote,
  customer,
  branchName,
  items,
}: {
  quote: QuoteLike;
  customer?: PricingCustomer | null;
  branchName: string;
  items: QuoteLineLike[];
}) {
  const rows = items
    .map((item, index) => {
      const productName = item.product?.name ?? "Product";
      const sku = item.product?.sku ?? "-";
      return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${index + 1}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;">
            <strong>${productName}</strong><br />
            <span style="color:#64748b;font-size:12px;">${sku}</span>
          </td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;">${item.quantity}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;">${formatCurrency(parseNumber(item.unit_price))}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;">${formatCurrency(parseNumber(item.total_price))}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#0f172a,#1d4ed8);color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.76;">Quotation</div>
          <h1 style="margin:10px 0 6px;font-size:28px;">${quote.quote_number}</h1>
          <p style="margin:0;opacity:0.88;">Prepared by ${branchName} for ${customer?.name ?? "Valued Customer"}</p>
        </div>

        <div style="padding:24px 28px;">
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:24px;">
            <div style="padding:16px;border:1px solid #e2e8f0;border-radius:14px;">
              <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Customer</div>
              <div style="margin-top:8px;font-size:18px;font-weight:700;">${customer?.name ?? "Walk-in Customer"}</div>
              <div style="margin-top:4px;color:#475569;">${customer?.email ?? "-"}</div>
            </div>
            <div style="padding:16px;border:1px solid #e2e8f0;border-radius:14px;">
              <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Validity</div>
              <div style="margin-top:8px;font-size:18px;font-weight:700;">${formatDate(quote.valid_until)}</div>
              <div style="margin-top:4px;color:#475569;">Please confirm before expiry.</div>
            </div>
          </div>

          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <thead>
              <tr style="background:#eff6ff;color:#1e3a8a;text-align:left;">
                <th style="padding:10px;">#</th>
                <th style="padding:10px;">Item</th>
                <th style="padding:10px;text-align:right;">Qty</th>
                <th style="padding:10px;text-align:right;">Unit Price</th>
                <th style="padding:10px;text-align:right;">Line Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <div style="margin-left:auto;max-width:320px;">
            <div style="display:flex;justify-content:space-between;padding:6px 0;"><span>Subtotal</span><strong>${formatCurrency(parseNumber(quote.subtotal))}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;"><span>Discount</span><strong>${formatCurrency(parseNumber(quote.discount_amount))}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;"><span>Tax</span><strong>${formatCurrency(parseNumber(quote.tax_amount))}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:14px 0 0;margin-top:8px;border-top:2px solid #cbd5e1;font-size:18px;"><span>Total</span><strong>${formatCurrency(parseNumber(quote.total_amount))}</strong></div>
          </div>

          ${
            quote.notes?.trim()
              ? `<div style="margin-top:24px;padding:18px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;">
                  <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Notes</div>
                  <div style="margin-top:8px;color:#334155;white-space:pre-wrap;">${quote.notes.trim()}</div>
                </div>`
              : ""
          }
        </div>
      </div>
    </div>
  `;
}
