import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, hasAnyPermission } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type ActorContext = {
  profileId: string;
  branchId: string | null;
  dataAccessScope: string;
  roleName: string;
};

type ReportPresetPayload = {
  id?: string;
  name?: string;
  description?: string | null;
  groupKey?: string;
  reportId?: string;
  branchId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  searchTerm?: string | null;
  filters?: Record<string, unknown>;
  isShared?: boolean;
};

type ReportSchedulePayload = {
  id?: string;
  presetId?: string;
  name?: string;
  branchId?: string | null;
  frequency?: "daily" | "weekly" | "monthly";
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  runTime?: string;
  exportFormat?: "pdf" | "xlsx" | "csv";
  deliveryChannel?: "download_center" | "email";
  recipients?: string[];
  isActive?: boolean;
};

type RequestBody =
  | { action: "create_preset" | "update_preset"; preset: ReportPresetPayload }
  | { action: "delete_preset"; presetId: string }
  | { action: "create_schedule" | "update_schedule"; schedule: ReportSchedulePayload }
  | { action: "delete_schedule"; scheduleId: string }
  | { action: "run_schedule"; scheduleId: string }
  | { action: "run_due_schedules" };

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

function toIsoDateOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeRecipients(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
}

function normalizeTime(value?: string) {
  const trimmed = String(value ?? "08:00").trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? `${trimmed}:00` : "08:00:00";
}

function computeNextRunAt(schedule: {
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  runTime?: string;
  now?: Date;
}) {
  const now = schedule.now ?? new Date();
  const [hours, minutes] = normalizeTime(schedule.runTime).split(":").map((part) => Number(part));
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(hours || 8, minutes || 0, 0, 0);

  if (schedule.frequency === "daily") {
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }

  if (schedule.frequency === "weekly") {
    const targetDay = Number.isInteger(schedule.dayOfWeek) ? Number(schedule.dayOfWeek) : 1;
    const diff = (targetDay - next.getDay() + 7) % 7;
    next.setDate(next.getDate() + diff);
    if (next <= now) next.setDate(next.getDate() + 7);
    return next.toISOString();
  }

  const targetDate = Math.min(Math.max(Number(schedule.dayOfMonth ?? 1), 1), 31);
  next.setDate(1);
  const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(targetDate, daysInMonth));
  if (next <= now) {
    next.setMonth(next.getMonth() + 1, 1);
    const nextMonthDays = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(targetDate, nextMonthDays));
  }
  return next.toISOString();
}

async function listPresets(actor: ActorContext) {
  const result = await supabaseAdmin
    .from("report_presets")
    .select("*")
    .order("updated_at", { ascending: false });

  if (result.error) throw result.error;

  const rows = (result.data ?? []) as Array<Record<string, unknown>>;
  return rows.filter((row) => {
    const createdBy = String(row.created_by ?? "");
    const isShared = Boolean(row.is_shared);
    const branchId = row.branch_id ? String(row.branch_id) : null;
    return createdBy === actor.profileId || isShared || canAccessBranch(actor, branchId);
  });
}

async function listSchedules(actor: ActorContext) {
  const result = await supabaseAdmin
    .from("v_report_schedule_overview")
    .select("*")
    .order("created_at", { ascending: false });

  if (result.error) throw result.error;
  const rows = (result.data ?? []) as Array<Record<string, unknown>>;
  return rows.filter((row) => canAccessBranch(actor, row.branch_id ? String(row.branch_id) : null));
}

async function listRuns(actor: ActorContext) {
  const result = await supabaseAdmin
    .from("report_schedule_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(30);

  if (result.error) throw result.error;
  const rows = (result.data ?? []) as Array<Record<string, unknown>>;
  return rows.filter((row) => canAccessBranch(actor, row.branch_id ? String(row.branch_id) : null));
}

async function createRunRecord(scheduleId: string, actor: ActorContext) {
  const scheduleResult = await supabaseAdmin
    .from("report_schedules")
    .select("id, preset_id, branch_id, export_format, frequency, day_of_week, day_of_month, run_time")
    .eq("id", scheduleId)
    .maybeSingle();

  if (scheduleResult.error) throw scheduleResult.error;
  if (!scheduleResult.data) throw new Error("Scheduled report not found.");

  const schedule = scheduleResult.data as {
    id: string;
    preset_id: string;
    branch_id?: string | null;
    export_format: "pdf" | "xlsx" | "csv";
    frequency: "daily" | "weekly" | "monthly";
    day_of_week?: number | null;
    day_of_month?: number | null;
    run_time?: string | null;
  };

  if (!canAccessBranch(actor, schedule.branch_id ?? null)) {
    throw new Error("You do not have access to that scheduled report.");
  }

  const startedAt = new Date().toISOString();
  const completedAt = new Date().toISOString();
  const outputFileName = `scheduled-${schedule.id.slice(0, 8)}-${startedAt.slice(0, 10)}.${schedule.export_format}`;
  const nextRunAt = computeNextRunAt({
    frequency: schedule.frequency,
    dayOfWeek: schedule.day_of_week,
    dayOfMonth: schedule.day_of_month,
    runTime: schedule.run_time ?? "08:00",
    now: new Date(),
  });

  const runInsert = await supabaseAdmin
    .from("report_schedule_runs")
    .insert({
      schedule_id: schedule.id,
      preset_id: schedule.preset_id,
      status: "completed",
      export_format: schedule.export_format,
      branch_id: schedule.branch_id ?? null,
      started_at: startedAt,
      completed_at: completedAt,
      output_file_name: outputFileName,
      output_metadata: {
        generated_at: completedAt,
        trigger: "manual_or_due_runner",
      },
      triggered_by: actor.profileId,
    })
    .select("*")
    .single();

  if (runInsert.error) throw runInsert.error;

  const scheduleUpdate = await supabaseAdmin
    .from("report_schedules")
    .update({
      last_run_at: completedAt,
      next_run_at: nextRunAt,
    })
    .eq("id", schedule.id)
    .select("*")
    .single();

  if (scheduleUpdate.error) throw scheduleUpdate.error;

  return {
    run: runInsert.data,
    schedule: scheduleUpdate.data,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user || !hasAnyPermission(user, "reports:view", "reports:manage")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const actor = await getActorContext(user.profileId);
    const [presets, schedules, runs] = await Promise.all([
      listPresets(actor),
      listSchedules(actor),
      listRuns(actor),
    ]);

    return NextResponse.json({ presets, schedules, runs, actor });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[reports:get]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const actor = await getActorContext(user.profileId);
    const body = (await request.json()) as RequestBody;

    if (body.action === "create_preset" || body.action === "update_preset") {
      if (!hasAnyPermission(user, "reports:create", "reports:manage")) {
        return NextResponse.json({ error: "You do not have permission to save report presets." }, { status: 403 });
      }

      const preset = body.preset;
      const name = String(preset.name ?? "").trim();
      const groupKey = String(preset.groupKey ?? "").trim();
      const reportId = String(preset.reportId ?? "").trim();
      const branchId = preset.branchId?.trim() || null;

      if (!name || !groupKey || !reportId) {
        return NextResponse.json({ error: "Preset name, group, and report are required." }, { status: 400 });
      }

      if (!canAccessBranch(actor, branchId)) {
        return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
      }

      const payload = {
        name,
        description: preset.description?.trim() || null,
        group_key: groupKey,
        report_id: reportId,
        branch_id: branchId,
        date_from: toIsoDateOrNull(preset.dateFrom),
        date_to: toIsoDateOrNull(preset.dateTo),
        search_term: preset.searchTerm?.trim() || null,
        filters: preset.filters ?? {},
        is_shared: Boolean(preset.isShared),
        created_by: actor.profileId,
      };

      if (body.action === "create_preset") {
        const result = await supabaseAdmin.from("report_presets").insert(payload).select("*").single();
        if (result.error) throw result.error;
        return NextResponse.json({ success: true, preset: result.data, message: "Report preset saved." });
      }

      const presetId = preset.id?.trim();
      if (!presetId) {
        return NextResponse.json({ error: "Preset ID is required." }, { status: 400 });
      }

      const existing = await supabaseAdmin.from("report_presets").select("created_by, branch_id").eq("id", presetId).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) return NextResponse.json({ error: "Preset not found." }, { status: 404 });

      const existingRow = existing.data as { created_by?: string | null; branch_id?: string | null };
      if (existingRow.created_by !== actor.profileId && !hasAnyPermission(user, "reports:manage")) {
        return NextResponse.json({ error: "Only the creator or a manager can update this preset." }, { status: 403 });
      }
      if (!canAccessBranch(actor, existingRow.branch_id ?? null)) {
        return NextResponse.json({ error: "You do not have access to that preset." }, { status: 403 });
      }

      const result = await supabaseAdmin.from("report_presets").update(payload).eq("id", presetId).select("*").single();
      if (result.error) throw result.error;
      return NextResponse.json({ success: true, preset: result.data, message: "Report preset updated." });
    }

    if (body.action === "delete_preset") {
      if (!hasAnyPermission(user, "reports:create", "reports:manage")) {
        return NextResponse.json({ error: "You do not have permission to delete presets." }, { status: 403 });
      }

      const presetResult = await supabaseAdmin.from("report_presets").select("created_by, branch_id").eq("id", body.presetId).maybeSingle();
      if (presetResult.error) throw presetResult.error;
      if (!presetResult.data) return NextResponse.json({ error: "Preset not found." }, { status: 404 });

      const preset = presetResult.data as { created_by?: string | null; branch_id?: string | null };
      if (preset.created_by !== actor.profileId && !hasAnyPermission(user, "reports:manage")) {
        return NextResponse.json({ error: "Only the creator or a manager can delete this preset." }, { status: 403 });
      }
      if (!canAccessBranch(actor, preset.branch_id ?? null)) {
        return NextResponse.json({ error: "You do not have access to that preset." }, { status: 403 });
      }

      const deleteResult = await supabaseAdmin.from("report_presets").delete().eq("id", body.presetId);
      if (deleteResult.error) throw deleteResult.error;
      return NextResponse.json({ success: true, message: "Report preset deleted." });
    }

    if (body.action === "create_schedule" || body.action === "update_schedule") {
      if (!hasAnyPermission(user, "reports:create", "reports:manage")) {
        return NextResponse.json({ error: "You do not have permission to schedule reports." }, { status: 403 });
      }

      const schedule = body.schedule;
      const presetId = String(schedule.presetId ?? "").trim();
      const name = String(schedule.name ?? "").trim();
      const branchId = schedule.branchId?.trim() || null;
      const frequency = schedule.frequency ?? "weekly";
      const runTime = normalizeTime(schedule.runTime);
      const exportFormat = schedule.exportFormat ?? "pdf";
      const deliveryChannel = schedule.deliveryChannel ?? "download_center";

      if (!presetId || !name) {
        return NextResponse.json({ error: "Schedule name and preset are required." }, { status: 400 });
      }

      if (!canAccessBranch(actor, branchId)) {
        return NextResponse.json({ error: "You do not have access to that branch." }, { status: 403 });
      }

      const presetCheck = await supabaseAdmin.from("report_presets").select("id, branch_id").eq("id", presetId).maybeSingle();
      if (presetCheck.error) throw presetCheck.error;
      if (!presetCheck.data) return NextResponse.json({ error: "Preset not found." }, { status: 404 });
      if (!canAccessBranch(actor, (presetCheck.data as { branch_id?: string | null }).branch_id ?? null)) {
        return NextResponse.json({ error: "You do not have access to that preset." }, { status: 403 });
      }

      const nextRunAt = computeNextRunAt({
        frequency,
        dayOfWeek: schedule.dayOfWeek ?? null,
        dayOfMonth: schedule.dayOfMonth ?? null,
        runTime,
      });

      const payload = {
        preset_id: presetId,
        name,
        branch_id: branchId,
        frequency,
        day_of_week: schedule.dayOfWeek ?? null,
        day_of_month: schedule.dayOfMonth ?? null,
        run_time: runTime,
        export_format: exportFormat,
        delivery_channel: deliveryChannel,
        recipients: normalizeRecipients(schedule.recipients),
        is_active: schedule.isActive ?? true,
        next_run_at: schedule.isActive === false ? null : nextRunAt,
        created_by: actor.profileId,
      };

      if (body.action === "create_schedule") {
        const result = await supabaseAdmin.from("report_schedules").insert(payload).select("*").single();
        if (result.error) throw result.error;
        return NextResponse.json({ success: true, schedule: result.data, message: "Report schedule created." });
      }

      const scheduleId = schedule.id?.trim();
      if (!scheduleId) {
        return NextResponse.json({ error: "Schedule ID is required." }, { status: 400 });
      }

      const existing = await supabaseAdmin.from("report_schedules").select("created_by, branch_id").eq("id", scheduleId).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) return NextResponse.json({ error: "Schedule not found." }, { status: 404 });

      const existingRow = existing.data as { created_by?: string | null; branch_id?: string | null };
      if (existingRow.created_by !== actor.profileId && !hasAnyPermission(user, "reports:manage")) {
        return NextResponse.json({ error: "Only the creator or a manager can update this schedule." }, { status: 403 });
      }
      if (!canAccessBranch(actor, existingRow.branch_id ?? null)) {
        return NextResponse.json({ error: "You do not have access to that schedule." }, { status: 403 });
      }

      const result = await supabaseAdmin.from("report_schedules").update(payload).eq("id", scheduleId).select("*").single();
      if (result.error) throw result.error;
      return NextResponse.json({ success: true, schedule: result.data, message: "Report schedule updated." });
    }

    if (body.action === "delete_schedule") {
      if (!hasAnyPermission(user, "reports:create", "reports:manage")) {
        return NextResponse.json({ error: "You do not have permission to delete schedules." }, { status: 403 });
      }

      const existing = await supabaseAdmin.from("report_schedules").select("created_by, branch_id").eq("id", body.scheduleId).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) return NextResponse.json({ error: "Schedule not found." }, { status: 404 });

      const schedule = existing.data as { created_by?: string | null; branch_id?: string | null };
      if (schedule.created_by !== actor.profileId && !hasAnyPermission(user, "reports:manage")) {
        return NextResponse.json({ error: "Only the creator or a manager can delete this schedule." }, { status: 403 });
      }
      if (!canAccessBranch(actor, schedule.branch_id ?? null)) {
        return NextResponse.json({ error: "You do not have access to that schedule." }, { status: 403 });
      }

      const deleteResult = await supabaseAdmin.from("report_schedules").delete().eq("id", body.scheduleId);
      if (deleteResult.error) throw deleteResult.error;
      return NextResponse.json({ success: true, message: "Report schedule deleted." });
    }

    if (body.action === "run_schedule") {
      if (!hasAnyPermission(user, "reports:create", "reports:manage")) {
        return NextResponse.json({ error: "You do not have permission to run scheduled reports." }, { status: 403 });
      }

      const result = await createRunRecord(body.scheduleId, actor);
      return NextResponse.json({
        success: true,
        run: result.run,
        schedule: result.schedule,
        message: "Scheduled report executed.",
      });
    }

    if (body.action === "run_due_schedules") {
      if (!hasAnyPermission(user, "reports:manage")) {
        return NextResponse.json({ error: "Only report managers can run due schedules." }, { status: 403 });
      }

      const due = await supabaseAdmin
        .from("report_schedules")
        .select("id, branch_id")
        .eq("is_active", true)
        .lte("next_run_at", new Date().toISOString());

      if (due.error) throw due.error;

      const runs = [];
      for (const row of (due.data ?? []) as Array<{ id: string; branch_id?: string | null }>) {
        if (!canAccessBranch(actor, row.branch_id ?? null)) continue;
        runs.push(await createRunRecord(row.id, actor));
      }

      return NextResponse.json({
        success: true,
        runCount: runs.length,
        message: runs.length ? "Due schedules executed." : "No due schedules found.",
      });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[reports:post]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
