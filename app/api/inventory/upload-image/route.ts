import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const bucketName = "product-images";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasAnyPermission(user, "inventory:create", "inventory:edit", "inventory:manage")) {
      return NextResponse.json({ error: "You do not have permission to upload product images." }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    const bucketResult = await supabaseAdmin.storage.getBucket(bucketName);
    if (bucketResult.error) {
      await supabaseAdmin.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024,
      });
    }

    const extension = file.name.includes(".") ? file.name.split(".").pop() : "png";
    const filePath = `${user.profileId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

    const uploadResult = await supabaseAdmin.storage.from(bucketName).upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });

    if (uploadResult.error) {
      throw uploadResult.error;
    }

    const publicUrlResult = supabaseAdmin.storage.from(bucketName).getPublicUrl(filePath);
    return NextResponse.json({ success: true, url: publicUrlResult.data.publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[inventory-upload-image]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
