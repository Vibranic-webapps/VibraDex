import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";

// Store (or refresh) a browser Web Push subscription.
export async function POST(request: NextRequest) {
    const guard = await requireSession();
    if (!guard.ok) return guard.response;

    try {
        const sub = await request.json();
        const endpoint: string | undefined = sub?.endpoint;
        const p256dh: string | undefined = sub?.keys?.p256dh;
        const auth: string | undefined = sub?.keys?.auth;

        if (!endpoint || !p256dh || !auth) {
            return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
        }

        await prisma.pushSubscription.upsert({
            where: { endpoint },
            update: { p256dh, auth },
            create: { endpoint, p256dh, auth },
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("Push subscribe error:", error);
        return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
    }
}
