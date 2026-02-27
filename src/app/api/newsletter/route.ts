import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // Démo: on ne stocke pas réellement. En production: Mailchimp/Brevo etc.
  return NextResponse.redirect(new URL("/", req.url));
}
