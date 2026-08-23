import { NextRequest, NextResponse } from "next/server";
import { applyInventoryMovement, getInventoryStock } from "@/lib/inventory-admin";
import {
  buildQuotationEmailHtml,
  buildQuoteNumber,
  buildSalesOrderNumber,
  parseNumber,
  resolveLinePricing,
  type BulkPricingRow,
  type CustomerPricingRow,
  type PricingCustomer,
  type PricingProduct,
} from "@/lib/sales-orders";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type DraftLineInput = {
  productId: string;
  quantity: number;
  notes?: string | null;
};

type CreateDocumentPayload = {
  action: "create_quotation" | "create_sales_order";
  branchId?: string;
  customerId?: string | null;
  createdBy?: string | null;
  validUntil?: string | null;
  expectedFulfillmentDate?: string | null;
  notes?: string | null;
  reserveStock?: boolean;
  items?: DraftLineInput[];
};

type ReservePayload = {
  action: "reserve_stock" | "release_stock";
  salesOrderId?: string;
  actorId?: string | null;
};

type ConvertPayload = {
  action: "convert_quotation";
  quotationId?: string;
  cashierId?: string;
  paymentMethod?: string;
  amountPaid?: number;
  notes?: string | null;
};

type SendPayload = {
  action: "send_quotation_email";
  quotationId?: string;
  recipientEmail?: string;
  sentBy?: string | null;
};

type ApprovePayload = {
  action: "approve_quotation";
  quotationId?: string;
  approverId?: string | null;
};

type RequestPayload = CreateDocumentPayload | ReservePayload | ConvertPayload | SendPayload | ApprovePayload;

type QuoteRow = {
  id: string;
  quote_number: string;
  branch_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  status: string;
  valid_until?: string | null;
  subtotal?: number | string | null;
  discount_amount?: number | string | null;
  tax_amount?: number | string | null;
  total_amount?: number | string | null;
  notes?: string | null;
  created_by?: string | null;
};

type QuoteItemRow = {
  id: string;
  quotation_id: string;
  product_id: string;
  quantity: number;
  unit_price: number | string;
  line_discount_amount?: number | string | null;
  total_price: number | string;
  price_source?: string | null;
  pricing_notes?: string | null;
  notes?: string | null;
};

type SalesOrderRow = {
  id: string;
  order_number: string;
  branch_id: string;
  customer_id?: string | null;
  status: string;
  total_amount?: number | string | null;
};

type SalesOrderItemRow = {
  id: string;
  sales_order_id: string;
  product_id: string;
  quantity: number;
  reserved_quantity?: number | null;
  fulfilled_quantity?: number | null;
  unit_price?: number | string | null;
  total_price?: number | string | null;
  notes?: string | null;
};

type ActorContext = {
  profileId: string;
  branchId: string | null;
  dataAccessScope: string;
  roleName: string;
};

async function getActorContext(profileId: string): Promise<ActorContext> {
  const result = await supabaseAdmin
    .from("users")
    .select("id, branch_id, data_access_scope, role:roles(name)")
    .eq("id", profileId)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) throw new Error("Authenticated user profile was not found.");

  const row = result.data as {
    id: string;
    branch_id?: string | null;
    data_access_scope?: string | null;
    role?: { name?: string | null } | null;
  };

  return {
    profileId: row.id,
    branchId: row.branch_id ?? null,
    dataAccessScope: row.data_access_scope ?? "branch_only",
    roleName: String(row.role?.name ?? "").toLowerCase(),
  };
}

function canAccessBranch(actor: ActorContext, branchId?: string | null) {
  if (!branchId) return true;
  if (actor.roleName === "super_admin") return true;
  if (actor.dataAccessScope === "all_data") return true;
  return actor.branchId === branchId;
}

async function getCustomerBranchId(customerId: string) {
  const result = await supabaseAdmin.from("customers").select("branch_id").eq("id", customerId).maybeSingle();
  if (result.error) throw result.error;
  return (result.data as { branch_id?: string | null } | null)?.branch_id ?? null;
}

async function getCustomerAndPricing(customerId?: string | null) {
  if (!customerId) {
    return {
      customer: null,
      customerPricing: [] as CustomerPricingRow[],
    };
  }

  const [customerResult, pricingResult] = await Promise.all([
    supabaseAdmin
      .from("customers")
      .select("id, name, customer_type, email, allow_credit, credit_limit, current_balance, default_credit_terms_days")
      .eq("id", customerId)
      .maybeSingle(),
    supabaseAdmin
      .from("customer_product_pricing")
      .select("id, customer_id, product_id, price_type, fixed_price, discount_percent, minimum_quantity, effective_from, effective_to, is_active, notes")
      .eq("customer_id", customerId)
      .eq("is_active", true),
  ]);

  if (customerResult.error) throw customerResult.error;
  if (pricingResult.error) throw pricingResult.error;

  return {
    customer: (customerResult.data as PricingCustomer | null) ?? null,
    customerPricing: (pricingResult.data ?? []) as CustomerPricingRow[],
  };
}

async function getBulkPricing(productIds: string[]) {
  if (!productIds.length) return [] as BulkPricingRow[];

  const result = await supabaseAdmin
    .from("product_bulk_pricing")
    .select("id, product_id, minimum_quantity, unit_price, discount_percent, customer_type, is_active, notes")
    .in("product_id", productIds)
    .eq("is_active", true);

  if (result.error) throw result.error;
  return (result.data ?? []) as BulkPricingRow[];
}

async function getProducts(productIds: string[]) {
  const result = await supabaseAdmin
    .from("products")
    .select("id, name, sku, selling_price, wholesale_price")
    .in("id", productIds);

  if (result.error) throw result.error;
  return (result.data ?? []) as PricingProduct[];
}

async function buildPricedLines({
  customerId,
  items,
}: {
  customerId?: string | null;
  items: DraftLineInput[];
}) {
  const normalizedItems = items.filter((item) => item.productId && Number(item.quantity) > 0);
  if (!normalizedItems.length) {
    throw new Error("At least one line item is required.");
  }

  const productIds = Array.from(new Set(normalizedItems.map((item) => item.productId)));
  const [{ customer, customerPricing }, bulkPricing, products] = await Promise.all([
    getCustomerAndPricing(customerId),
    getBulkPricing(productIds),
    getProducts(productIds),
  ]);

  const productMap = new Map(products.map((product) => [product.id, product]));
  const pricedLines = normalizedItems.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new Error(`Product ${item.productId} was not found.`);
    }

    const pricing = resolveLinePricing({
      customer,
      product,
      quantity: Number(item.quantity),
      customerPricing,
      bulkPricing,
    });

    return {
      product,
      quantity: Math.max(1, Number(item.quantity || 1)),
      notes: item.notes?.trim() || null,
      ...pricing,
    };
  });

  return {
    customer,
    pricedLines,
    subtotal: pricedLines.reduce((sum, item) => sum + item.totalPrice, 0),
    discountAmount: pricedLines.reduce((sum, item) => sum + item.lineDiscountAmount, 0),
  };
}

async function reserveSalesOrderStock(salesOrderId: string, actorId?: string | null) {
  const orderResult = await supabaseAdmin
    .from("sales_orders")
    .select("id, order_number, branch_id, customer_id, status")
    .eq("id", salesOrderId)
    .maybeSingle();

  if (orderResult.error) throw orderResult.error;
  if (!orderResult.data) throw new Error("Sales order was not found.");

  const order = orderResult.data as SalesOrderRow;

  const itemsResult = await supabaseAdmin
    .from("sales_order_items")
    .select("id, sales_order_id, product_id, quantity, reserved_quantity, fulfilled_quantity, unit_price, total_price, notes")
    .eq("sales_order_id", salesOrderId)
    .order("created_at", { ascending: true });

  if (itemsResult.error) throw itemsResult.error;

  const existingReservations = await supabaseAdmin
    .from("stock_reservations")
    .update({
      status: "released",
      released_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("sales_order_id", salesOrderId)
    .eq("status", "active");

  if (existingReservations.error) throw existingReservations.error;

  const items = (itemsResult.data ?? []) as SalesOrderItemRow[];
  for (const item of items) {
    const currentStock = await getInventoryStock(item.product_id, order.branch_id);
    const reservationSummary = await supabaseAdmin
      .from("v_stock_reservation_summary")
      .select("reserved_quantity")
      .eq("branch_id", order.branch_id)
      .eq("product_id", item.product_id)
      .maybeSingle();

    if (reservationSummary.error) throw reservationSummary.error;

    const onHand = Number(currentStock?.quantity ?? 0);
    const currentlyReserved = parseNumber(
      (reservationSummary.data as { reserved_quantity?: number | string | null } | null)?.reserved_quantity
    );
    const available = Math.max(0, onHand - currentlyReserved);
    const reserveQuantity = Math.min(available, Number(item.quantity ?? 0));

    if (reserveQuantity <= 0) continue;

    const insertResult = await supabaseAdmin.from("stock_reservations").insert({
      branch_id: order.branch_id,
      product_id: item.product_id,
      sales_order_id: order.id,
      sales_order_item_id: item.id,
      reserved_quantity: reserveQuantity,
      status: "active",
      notes: `Reservation for sales order ${order.order_number}`,
      created_by: actorId ?? null,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    });

    if (insertResult.error) throw insertResult.error;
  }

  return order;
}

async function getQuotationWithItems(quotationId: string) {
  const [quoteResult, itemsResult] = await Promise.all([
    supabaseAdmin
      .from("quotations")
      .select("id, quote_number, branch_id, customer_id, customer_name, customer_email, status, valid_until, subtotal, discount_amount, tax_amount, total_amount, notes, created_by")
      .eq("id", quotationId)
      .maybeSingle(),
    supabaseAdmin
      .from("quotation_items")
      .select("id, quotation_id, product_id, quantity, unit_price, line_discount_amount, total_price, price_source, pricing_notes, notes")
      .eq("quotation_id", quotationId)
      .order("created_at", { ascending: true }),
  ]);

  if (quoteResult.error) throw quoteResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (!quoteResult.data) throw new Error("Quotation was not found.");

  return {
    quote: quoteResult.data as QuoteRow,
    items: (itemsResult.data ?? []) as QuoteItemRow[],
  };
}

async function sendQuotationEmail(payload: SendPayload) {
  const quotationId = payload.quotationId;
  if (!quotationId || !payload.recipientEmail?.trim()) {
    throw new Error("Quotation and recipient email are required.");
  }

  const { quote, items } = await getQuotationWithItems(quotationId);
  const [branchResult, customerResult, productResult] = await Promise.all([
    supabaseAdmin.from("branches").select("name").eq("id", quote.branch_id).maybeSingle(),
    quote.customer_id
      ? supabaseAdmin.from("customers").select("id, name, customer_type, email").eq("id", quote.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    items.length
      ? supabaseAdmin
          .from("products")
          .select("id, name, sku, selling_price, wholesale_price")
          .in("id", items.map((item) => item.product_id))
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (branchResult.error) throw branchResult.error;
  if (customerResult.error) throw customerResult.error;
  if (productResult.error) throw productResult.error;

  const customer = (customerResult.data as PricingCustomer | null) ?? {
    id: quote.customer_id ?? null,
    name: quote.customer_name ?? "Valued Customer",
    email: quote.customer_email ?? payload.recipientEmail.trim(),
  };
  const productMap = new Map(
    ((productResult.data ?? []) as PricingProduct[]).map((product) => [product.id, product])
  );

  const subject = `Quotation ${quote.quote_number} from WAP POS`;
  const html = buildQuotationEmailHtml({
    quote,
    customer,
    branchName: (branchResult.data as { name?: string | null } | null)?.name ?? "WAP POS",
    items: items.map((item) => ({
      ...item,
      product: productMap.get(item.product_id) ?? null,
    })),
  });

  const logInsert = await supabaseAdmin
    .from("quotation_email_logs")
    .insert({
      quotation_id: quotationId,
      customer_id: quote.customer_id ?? null,
      recipient_email: payload.recipientEmail.trim(),
      subject,
      provider: "resend",
      status: "queued",
      sent_by: payload.sentBy ?? null,
    })
    .select("id")
    .single();

  if (logInsert.error) throw logInsert.error;

  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL ||
    process.env.QUOTE_FROM_EMAIL ||
    process.env.SMTP_FROM_EMAIL ||
    "quotes@example.com";

  if (!resendKey) {
    await supabaseAdmin
      .from("quotation_email_logs")
      .update({
        status: "failed",
        error_message: "Missing RESEND_API_KEY environment variable.",
      })
      .eq("id", logInsert.data.id);

    throw new Error("Email delivery is not configured. Set RESEND_API_KEY and a from email.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [payload.recipientEmail.trim()],
      subject,
      html,
      reply_to: customer.email ?? undefined,
    }),
  });

  const responseBody = (await response.json().catch(() => ({}))) as { id?: string; message?: string; error?: string };

  if (!response.ok) {
    await supabaseAdmin
      .from("quotation_email_logs")
      .update({
        status: "failed",
        error_message: responseBody.message || responseBody.error || "Email provider rejected the request.",
      })
      .eq("id", logInsert.data.id);

    throw new Error(responseBody.message || responseBody.error || "Unable to send quotation email.");
  }

  await Promise.all([
    supabaseAdmin
      .from("quotation_email_logs")
      .update({
        status: "sent",
        provider_message_id: responseBody.id ?? null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", logInsert.data.id),
    supabaseAdmin
      .from("quotations")
      .update({
        status: quote.status === "draft" ? "sent" : quote.status,
        sent_at: new Date().toISOString(),
        customer_email: payload.recipientEmail.trim(),
      })
      .eq("id", quotationId),
  ]);
}

async function convertQuotationToSale(payload: ConvertPayload) {
  if (!payload.quotationId || !payload.cashierId) {
    throw new Error("Quotation and cashier are required.");
  }

  const { quote, items } = await getQuotationWithItems(payload.quotationId);
  if (quote.status === "converted") {
    throw new Error("This quotation has already been converted.");
  }

  if (quote.status !== "approved") {
    throw new Error("Only approved quotations can be converted to a sale.");
  }

  const paymentMethod = payload.paymentMethod ?? "cash";
  const supportedPaymentMethods = ["cash", "card", "bank_transfer", "gcash", "ewallet", "customer_credit"];
  if (!supportedPaymentMethods.includes(paymentMethod)) {
    throw new Error("Unsupported payment method.");
  }

  const now = new Date();
  const invoiceNumber = `INV-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now.getTime().toString().slice(-6)}`;
  const totalAmount = round2(parseNumber(quote.total_amount));
  const amountPaid = paymentMethod === "customer_credit" ? 0 : round2(payload.amountPaid ?? totalAmount);

  if (paymentMethod !== "customer_credit" && amountPaid < totalAmount) {
    throw new Error("Non-credit conversion requires the quotation to be fully paid.");
  }

  if (paymentMethod === "customer_credit" && !quote.customer_id) {
    throw new Error("Customer credit conversion requires a registered customer.");
  }

  if (paymentMethod === "customer_credit" && quote.customer_id) {
    const customerResult = await supabaseAdmin
      .from("customers")
      .select("allow_credit, credit_limit, current_balance, default_credit_terms_days")
      .eq("id", quote.customer_id)
      .maybeSingle();

    if (customerResult.error) throw customerResult.error;
    if (!customerResult.data) throw new Error("Customer account was not found.");

    const allowCredit = (customerResult.data as { allow_credit?: boolean | null }).allow_credit ?? true;
    const creditLimit = parseNumber((customerResult.data as { credit_limit?: number | string | null }).credit_limit);
    const currentBalance = parseNumber((customerResult.data as { current_balance?: number | string | null }).current_balance);

    if (!allowCredit) throw new Error("This customer is not allowed to purchase on credit.");
    if (totalAmount > Math.max(0, creditLimit - currentBalance)) {
      throw new Error("The customer does not have enough available credit for this conversion.");
    }
  }

  const saleResult = await supabaseAdmin
    .from("sales")
    .insert({
      invoice_number: invoiceNumber,
      branch_id: quote.branch_id,
      cashier_id: payload.cashierId,
      customer_id: quote.customer_id ?? null,
      status: "completed",
      subtotal: parseNumber(quote.subtotal),
      discount_amount: parseNumber(quote.discount_amount),
      tax_amount: parseNumber(quote.tax_amount),
      total_amount: totalAmount,
      amount_paid: amountPaid,
      change_amount: Math.max(0, amountPaid - totalAmount),
      notes: payload.notes?.trim() || quote.notes || `Converted from quotation ${quote.quote_number}`,
    })
    .select("id, invoice_number")
    .single();

  if (saleResult.error) throw saleResult.error;

  const saleItemsResult = await supabaseAdmin.from("sale_items").insert(
    items.map((item) => ({
      sale_id: saleResult.data.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: parseNumber(item.unit_price),
      discount_amount: parseNumber(item.line_discount_amount),
      total_price: parseNumber(item.total_price),
      notes: item.notes ?? `Converted from quotation ${quote.quote_number}`,
    }))
  );

  if (saleItemsResult.error) throw saleItemsResult.error;

  if (paymentMethod !== "customer_credit") {
    const paymentResult = await supabaseAdmin.from("sale_payments").insert({
      sale_id: saleResult.data.id,
      payment_method: paymentMethod,
      amount: totalAmount,
      reference_no: `${quote.quote_number}-CONVERT`,
    });

    if (paymentResult.error) throw paymentResult.error;
  }

  for (const item of items) {
    await applyInventoryMovement({
      productId: item.product_id,
      branchId: quote.branch_id,
      movementType: "sale",
      quantityDelta: -Math.abs(Number(item.quantity)),
      referenceType: "quotation_conversion",
      referenceId: saleResult.data.id,
      createdBy: payload.cashierId,
      notes: `Converted quotation ${quote.quote_number}`,
    });
  }

  if (paymentMethod === "customer_credit" && quote.customer_id) {
    const customerResult = await supabaseAdmin
      .from("customers")
      .select("default_credit_terms_days")
      .eq("id", quote.customer_id)
      .maybeSingle();

    if (customerResult.error) throw customerResult.error;

    const terms = Math.max(
      1,
      Number((customerResult.data as { default_credit_terms_days?: number | null } | null)?.default_credit_terms_days ?? 30)
    );
    const dueDate = new Date(Date.now() + terms * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const receivableResult = await supabaseAdmin.from("receivables").insert({
      invoice_number: `${saleResult.data.invoice_number}-CR`,
      customer_id: quote.customer_id,
      sale_id: saleResult.data.id,
      branch_id: quote.branch_id,
      total_amount: totalAmount,
      paid_amount: 0,
      due_date: dueDate,
      status: "unpaid",
      notes: `Credit sale converted from quotation ${quote.quote_number}`,
    });

    if (receivableResult.error) throw receivableResult.error;
  }

  const quoteUpdate = await supabaseAdmin
    .from("quotations")
    .update({
      status: "converted",
      converted_to_sale_id: saleResult.data.id,
      converted_at: new Date().toISOString(),
    })
    .eq("id", quote.id);

  if (quoteUpdate.error) throw quoteUpdate.error;

  const releaseReservations = await supabaseAdmin
    .from("stock_reservations")
    .update({
      status: "converted",
      converted_to_sale_id: saleResult.data.id,
      released_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("quotation_id", quote.id)
    .eq("status", "active");

  if (releaseReservations.error) throw releaseReservations.error;

  return saleResult.data;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const actor = await getActorContext(user.profileId);
    const body = (await request.json()) as RequestPayload;

    if (body.action === "create_quotation" || body.action === "create_sales_order") {
      const { branchId, customerId, validUntil, expectedFulfillmentDate, notes, items, reserveStock } = body;

      if (!hasAnyPermission(user, "sales_orders:create", "sales_orders:manage")) {
        return NextResponse.json({ error: "You do not have permission to create quotations or sales orders." }, { status: 403 });
      }

      if (!branchId || !items?.length) {
        return NextResponse.json({ error: "Branch and line items are required." }, { status: 400 });
      }

      if (!canAccessBranch(actor, branchId)) {
        return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
      }

      if (body.action === "create_sales_order" && reserveStock && !hasAnyPermission(user, "sales_orders:edit", "sales_orders:approve", "sales_orders:manage")) {
        return NextResponse.json({ error: "You do not have permission to reserve stock for this sales order." }, { status: 403 });
      }

      if (customerId) {
        const customerBranchId = await getCustomerBranchId(customerId);
        if (customerBranchId && customerBranchId !== branchId) {
          return NextResponse.json({ error: "Selected customer does not belong to the active branch." }, { status: 400 });
        }
      }

      const { customer, pricedLines, subtotal, discountAmount } = await buildPricedLines({
        customerId,
        items,
      });
      const taxAmount = 0;
      const totalAmount = round2(subtotal);

      if (body.action === "create_quotation") {
        const quoteResult = await supabaseAdmin
          .from("quotations")
          .insert({
            quote_number: buildQuoteNumber(),
            branch_id: branchId,
            customer_id: customerId ?? null,
            customer_name: customer?.name ?? null,
            customer_email: customer?.email ?? null,
            status: "draft",
            valid_until: validUntil || null,
            subtotal,
            discount_amount: discountAmount,
            tax_amount: taxAmount,
            total_amount: totalAmount,
            notes: notes?.trim() || null,
            created_by: user.profileId,
          })
          .select("id, quote_number")
          .single();

        if (quoteResult.error) throw quoteResult.error;

        const itemInsert = await supabaseAdmin.from("quotation_items").insert(
          pricedLines.map((item) => ({
            quotation_id: quoteResult.data.id,
            product_id: item.product.id,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            line_discount_amount: item.lineDiscountAmount,
            total_price: item.totalPrice,
            price_source: item.priceSource,
            pricing_notes: item.pricingNotes || null,
            notes: item.notes,
          }))
        );

        if (itemInsert.error) throw itemInsert.error;

        return NextResponse.json({
          success: true,
          documentId: quoteResult.data.id,
          documentNumber: quoteResult.data.quote_number,
          message: "Quotation created successfully.",
        });
      }

      const salesOrderResult = await supabaseAdmin
        .from("sales_orders")
        .insert({
          order_number: buildSalesOrderNumber(),
          branch_id: branchId,
          customer_id: customerId ?? null,
          status: "confirmed",
          expected_fulfillment_date: expectedFulfillmentDate || null,
          subtotal,
          discount_amount: discountAmount,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          notes: notes?.trim() || null,
          created_by: user.profileId,
        })
        .select("id, order_number")
        .single();

      if (salesOrderResult.error) throw salesOrderResult.error;

      const orderItemInsert = await supabaseAdmin.from("sales_order_items").insert(
        pricedLines.map((item) => ({
          sales_order_id: salesOrderResult.data.id,
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          line_discount_amount: item.lineDiscountAmount,
          total_price: item.totalPrice,
          price_source: item.priceSource,
          pricing_notes: item.pricingNotes || null,
          notes: item.notes,
        }))
      );

      if (orderItemInsert.error) throw orderItemInsert.error;

      if (reserveStock) {
        if (!hasAnyPermission(user, "sales_orders:edit", "sales_orders:approve", "sales_orders:manage")) {
          return NextResponse.json({ error: "You do not have permission to reserve stock." }, { status: 403 });
        }
        await reserveSalesOrderStock(salesOrderResult.data.id, user.profileId);
      }

      return NextResponse.json({
        success: true,
        documentId: salesOrderResult.data.id,
        documentNumber: salesOrderResult.data.order_number,
        message: reserveStock
          ? "Sales order created and stock reserved."
          : "Sales order created successfully.",
      });
    }

    if (body.action === "reserve_stock") {
      if (!hasAnyPermission(user, "sales_orders:edit", "sales_orders:approve", "sales_orders:manage")) {
        return NextResponse.json({ error: "You do not have permission to reserve stock." }, { status: 403 });
      }
      if (!body.salesOrderId) {
        return NextResponse.json({ error: "Sales order is required." }, { status: 400 });
      }

      const orderBranchResult = await supabaseAdmin
        .from("sales_orders")
        .select("branch_id")
        .eq("id", body.salesOrderId)
        .maybeSingle();

      if (orderBranchResult.error) throw orderBranchResult.error;
      const orderBranchId = (orderBranchResult.data as { branch_id?: string | null } | null)?.branch_id ?? null;
      if (!canAccessBranch(actor, orderBranchId)) {
        return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
      }

      const order = await reserveSalesOrderStock(body.salesOrderId, user.profileId);
      return NextResponse.json({
        success: true,
        message: `Stock reservation refreshed for ${order.order_number}.`,
      });
    }

    if (body.action === "release_stock") {
      if (!hasAnyPermission(user, "sales_orders:edit", "sales_orders:approve", "sales_orders:manage")) {
        return NextResponse.json({ error: "You do not have permission to release stock reservations." }, { status: 403 });
      }
      if (!body.salesOrderId) {
        return NextResponse.json({ error: "Sales order is required." }, { status: 400 });
      }

      const orderResult = await supabaseAdmin
        .from("sales_orders")
        .select("branch_id")
        .eq("id", body.salesOrderId)
        .maybeSingle();

      if (orderResult.error) throw orderResult.error;
      const orderBranchId = (orderResult.data as { branch_id?: string | null } | null)?.branch_id ?? null;
      if (!canAccessBranch(actor, orderBranchId)) {
        return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
      }

      const releaseResult = await supabaseAdmin
        .from("stock_reservations")
        .update({
          status: "released",
          released_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("sales_order_id", body.salesOrderId)
        .eq("status", "active");

      if (releaseResult.error) throw releaseResult.error;

      const orderUpdate = await supabaseAdmin
        .from("sales_orders")
        .update({
          status: "confirmed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.salesOrderId);

      if (orderUpdate.error) throw orderUpdate.error;

      return NextResponse.json({
        success: true,
        message: "Active stock reservations were released.",
      });
    }

    if (body.action === "convert_quotation") {
      if (!hasAnyPermission(user, "sales_orders:approve", "sales_orders:manage") || !hasAnyPermission(user, "pos:create", "pos:manage")) {
        return NextResponse.json({ error: "You do not have permission to convert a quotation to a sale." }, { status: 403 });
      }
      const quoteBranchResult = body.quotationId
        ? await supabaseAdmin.from("quotations").select("branch_id").eq("id", body.quotationId).maybeSingle()
        : { data: null, error: null };
      if (quoteBranchResult.error) throw quoteBranchResult.error;
      const quoteBranchId = (quoteBranchResult.data as { branch_id?: string | null } | null)?.branch_id ?? null;
      if (!canAccessBranch(actor, quoteBranchId)) {
        return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
      }

      const sale = await convertQuotationToSale({
        ...body,
        cashierId: user.profileId,
      });

      return NextResponse.json({
        success: true,
        saleId: sale.id,
        invoiceNumber: sale.invoice_number,
        message: "Quotation converted to sale successfully.",
      });
    }

    if (body.action === "approve_quotation") {
      if (!hasAnyPermission(user, "sales_orders:approve", "sales_orders:manage")) {
        return NextResponse.json({ error: "You do not have permission to approve quotations." }, { status: 403 });
      }
      if (!body.quotationId) {
        return NextResponse.json({ error: "Quotation is required." }, { status: 400 });
      }

      const quoteResult = await supabaseAdmin
        .from("quotations")
        .select("branch_id, status, converted_to_sale_id")
        .eq("id", body.quotationId)
        .maybeSingle();

      if (quoteResult.error) throw quoteResult.error;
      const quoteBranchId = (quoteResult.data as { branch_id?: string | null } | null)?.branch_id ?? null;
      if (!canAccessBranch(actor, quoteBranchId)) {
        return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
      }

      const quoteStatus = String((quoteResult.data as { status?: string | null } | null)?.status ?? "");
      if (quoteStatus === "converted") {
        return NextResponse.json({ error: "Converted quotations cannot be approved." }, { status: 400 });
      }

      const approveResult = await supabaseAdmin
        .from("quotations")
        .update({
          status: "approved",
          approved_by: user.profileId,
          approved_at: new Date().toISOString(),
        })
        .eq("id", body.quotationId)
        .select("id")
        .maybeSingle();

      if (approveResult.error) throw approveResult.error;

      return NextResponse.json({
        success: true,
        message: "Quotation approved successfully.",
      });
    }

    if (body.action === "send_quotation_email") {
      if (!hasAnyPermission(user, "sales_orders:email", "sales_orders:manage")) {
        return NextResponse.json({ error: "You do not have permission to email quotations." }, { status: 403 });
      }
      const quoteBranchResult = body.quotationId
        ? await supabaseAdmin.from("quotations").select("branch_id").eq("id", body.quotationId).maybeSingle()
        : { data: null, error: null };
      if (quoteBranchResult.error) throw quoteBranchResult.error;
      const quoteBranchId = (quoteBranchResult.data as { branch_id?: string | null } | null)?.branch_id ?? null;
      if (!canAccessBranch(actor, quoteBranchId)) {
        return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
      }
      await sendQuotationEmail({
        ...body,
        sentBy: user.profileId,
      });
      return NextResponse.json({
        success: true,
        message: "Quotation email sent successfully.",
      });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sales-orders]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
