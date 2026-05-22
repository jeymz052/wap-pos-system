import { NextRequest, NextResponse } from "next/server";

const PAYMONGO_BASE = "https://api.paymongo.com/v1";
const SECRET_KEY = process.env.PAYMONGO_SECRET_KEY ?? "";
const authHeader = `Basic ${Buffer.from(`${SECRET_KEY}:`).toString("base64")}`;

// GET /api/pos/paymongo/check-status?linkId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get("linkId");

    if (!linkId) return NextResponse.json({ error: "linkId required." }, { status: 400 });
    if (!SECRET_KEY || SECRET_KEY.startsWith("sk_test_REPLACE")) {
      return NextResponse.json({ error: "PayMongo not configured." }, { status: 503 });
    }

    const resp = await fetch(`${PAYMONGO_BASE}/links/${linkId}`, {
      headers: { Authorization: authHeader },
    });

    const data = await resp.json() as {
      data?: {
        id: string;
        attributes: {
          status: string;
          amount: number;
          payments?: Array<{ id: string; attributes: { status: string; payment_method_used: string } }>;
        };
      };
      errors?: Array<{ detail: string }>;
    };

    if (!resp.ok) {
      const msg = data.errors?.map(e => e.detail).join(", ") ?? "PayMongo error";
      return NextResponse.json({ error: msg }, { status: resp.status });
    }

    const attrs = data.data?.attributes;
    const paid = attrs?.status === "paid";
    const paymentId = paid ? attrs?.payments?.[0]?.id : null;

    return NextResponse.json({
      linkId: data.data?.id,
      status: attrs?.status,
      paid,
      amount: (attrs?.amount ?? 0) / 100,
      paymentId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[paymongo/check-status]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
