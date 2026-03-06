import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import type { LaunchStatus } from "@/types";

const TERMINAL_STATUSES: LaunchStatus[] = ["done", "failed"];

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user } = await getSupabaseSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: launch, error } = await supabaseAdmin
    .from("launch_requests")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !launch) {
    return NextResponse.json({ error: "Launch not found." }, { status: 404 });
  }

  return NextResponse.json(launch);
}
