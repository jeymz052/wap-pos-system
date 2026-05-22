import { NextRequest, NextResponse } from "next/server";

const PAYMONGO_BASE = "https://api.paymongo.com/v1";
const SECRET_KEY = process.env.PAYMONGO_SECRET_KEY ?? "";
const authHeader = `Basic ${Buffer.from(`${SECRET_KEY}:`).toString("base64")}`;

// Supported PayMongo methods: gcash | grab_pay | paymaya | card
const PAYMONGO_METHOD_MAP: Record<string, string> = {
  gcash: "gcash",
  ewallet: "grab_pay",
  card: "card",
  bank_transfer: "dob",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, currency = "PHP", description, method, successUrl, failUrl } = body as {
      amount: number;
      currency?: string;
      description?: string;
      method: string;
      successUrl?: string;
      failUrl?: string;
    };

    if (!SECRET_KEY || SECRET_KEY.startsWith("sk_test_REPLACE")) {
      return NextResponse.json(
        { error: "PayMongo secret key not configured. Add PAYMONGO_SECRET_KEY to .env.local" },
        { status: 503 }
      );
    }

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
    }

    const paymongoMethod = PAYMONGO_METHOD_MAP[method] ?? "gcash";
    const amountCentavos = Math.round(amount * 100);

    // Create a Payment Link (simplest approach for POS — show QR or URL to customer)
    const linkPayload = {
      data: {
        attributes: {
          amount: amountCentavos,
          currency,
          description: description ?? "WAP POS Payment",
          payment_method_types: paymongoMethod === "card"
            ? ["card"]
            : [paymongoMethod],
          ...(successUrl ? { success_url: successUrl } : {}),
          ...(failUrl ? { cancel_url: failUrl } : {}),
        },
      },
    };

    const resp = await fetch(`${PAYMONGO_BASE}/links`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(linkPayload),
    });

    const data = await resp.json() as {
      data?: { id: string; attributes: { checkout_url: string; reference_number: string; status: string } };
      errors?: Array<{ detail: string }>;
    };

    if (!resp.ok) {
      const msg = data.errors?.map(e => e.detail).join(", ") ?? "PayMongo error";
      return NextResponse.json({ error: msg }, { status: resp.status });
    }

    return NextResponse.json({
      linkId: data.data?.id,
      checkoutUrl: data.data?.attributes.checkout_url,
      referenceNumber: data.data?.attributes.reference_number,
      status: data.data?.attributes.status,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[paymongo/create-link]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
