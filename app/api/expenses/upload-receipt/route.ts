import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const BUCKET = "expense-receipts";
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (!hasAnyPermission(user, "expenses:create", "expenses:edit", "expenses:manage")) {
      return NextResponse.json({ error: "You do not have permission to upload expense receipts." }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const expenseId = (formData.get("expenseId") as string | null)?.trim() ?? "";

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File size exceeds 10 MB limit." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF, PDF." },
        { status: 400 }
      );
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const timestamp = Date.now();
    const safeName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
    const storagePath = expenseId
      ? `${expenseId}/${timestamp}-${safeName}.${extension}`
      : `unlinked/${user.profileId}/${timestamp}-${safeName}.${extension}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    let uploadResult = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

    if (uploadResult.error) {
      if (uploadResult.error.message?.includes("not found") || uploadResult.error.message?.includes("Bucket")) {
        await supabaseAdmin.storage.createBucket(BUCKET, {
          public: true,
          fileSizeLimit: MAX_SIZE,
          allowedMimeTypes: ALLOWED_TYPES,
        });

        uploadResult = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, buffer, {
          contentType: file.type,
          upsert: false,
        });
      }

      if (uploadResult.error) {
        throw uploadResult.error;
      }
    }

    const { data: publicUrl } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);

    return NextResponse.json({
      success: true,
      url: publicUrl.publicUrl,
      fileName: file.name,
      storagePath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[expenses-upload-receipt]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
