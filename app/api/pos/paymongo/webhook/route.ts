import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function verifySignature(payload: string, signatureHeader: string, secret: string): boolean {
  try {
    // PayMongo sends: t=timestamp,te=signature
    const parts = signatureHeader.split(",");
    const tPart = parts.find(p => p.startsWith("t="))?.slice(2) ?? "";
    const tePart = parts.find(p => p.startsWith("te="))?.slice(3) ?? "";
    const message = `${tPart}.${payload}`;
    const expected = createHmac("sha256", secret).update(message).digest("hex");
    return expected === tePart;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const sigHeader = request.headers.get("paymongo-signature") ?? "";
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET ?? "";

    // Verify webhook authenticity
    if (webhookSecret && !webhookSecret.startsWith("whsec_REPLACE")) {
      if (!verifySignature(rawBody, sigHeader, webhookSecret)) {
        console.warn("[paymongo/webhook] Invalid signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const event = JSON.parse(rawBody) as {
      data: {
        attributes: {
          type: string;
          data: {
            attributes: {
              status: string;
              amount: number;
              currency: string;
              description?: string;
              payment_method_used?: string;
              reference_number?: string;
            };
          };
        };
      };
    };

    const eventType = event.data?.attributes?.type;
    const attrs = event.data?.attributes?.data?.attributes;

    console.log("[paymongo/webhook] Event:", eventType, "Status:", attrs?.status);

    // Handle successful payment events
    if (eventType === "payment.paid" || eventType === "link.payment.paid") {
      // Log to audit_logs for traceability
      await supabaseAdmin.from("audit_logs").insert({
        module: "pos",
        action: "paymongo_payment_received",
        reference_type: "paymongo_event",
        new_values: {
          event_type: eventType,
          amount: (attrs?.amount ?? 0) / 100,
          currency: attrs?.currency,
          description: attrs?.description,
          payment_method: attrs?.payment_method_used,
          reference: attrs?.reference_number,
        },
      });
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[paymongo/webhook]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
