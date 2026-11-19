
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET() {
  const admin = await isAdmin();

  if (!admin) {
    return NextResponse.json(
      { error: "관리자 로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const clientId = process.env.SOOP_CLIENT_ID;
  const redirectUri = process.env.SOOP_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "SOOP 인증 환경 변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const authUrl = new URL(
    "https://openapi.sooplive.com/auth/code"
  );

  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set(
    "scope",
    "broad_access_chatinfo validate_live_status"
  );

  return NextResponse.redirect(authUrl);
}
