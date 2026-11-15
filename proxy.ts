import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/config/site";
import {
  parseSessionValue,
  sessionCookieOptions,
  signOwnerId,
} from "@/lib/session-token";

const PUBLIC_FILE = /\.(?:svg|png|jpg|jpeg|webp|ico|woff2?|ttf|css|js|map|mjs)$/i;

export async function proxy(request: NextRequest) {
  const existing = request.cookies.get(COOKIE_NAME)?.value;
  const parsed = await parseSessionValue(existing);

  if (parsed.valid && parsed.ownerId) {
    return NextResponse.next();
  }

  const ownerId = crypto.randomUUID();
  const signed = await signOwnerId(ownerId);
  const response = NextResponse.next();
  response.cookies.set({ ...sessionCookieOptions, value: signed });
  // Private workspace responses must never be cached by shared proxies.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|pdf.worker.min.mjs|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2?|ttf|css|js|map|mjs)$).*)",
  ],
};

export { PUBLIC_FILE };
