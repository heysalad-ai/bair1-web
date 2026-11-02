import { requireRole } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["super_admin"]);
  if (auth instanceof Response) return auth;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-05-27.dahlia",
    httpClient: Stripe.createFetchHttpClient(),
  });

  // Create coupon: £50 off (makes Pro £149 → £99)
  let coupon;
  try {
    coupon = await stripe.coupons.retrieve("WELOVEVERCELDOM");
  } catch {
    coupon = await stripe.coupons.create({
      id: "WELOVEVERCELDOM",
      amount_off: 5000,
      currency: "gbp",
      name: "We Love Vercel - Dom",
      max_redemptions: 1,
      duration: "once",
    });
  }

  // Create promotion code
  let promo;
  try {
    const existing = await stripe.promotionCodes.list({ code: "WELOVEVERCELDOM", limit: 1 });
    if (existing.data.length > 0) {
      promo = existing.data[0];
    } else {
      promo = await stripe.promotionCodes.create({
        promotion: { type: "coupon", coupon: coupon.id },
        code: "WELOVEVERCELDOM",
        max_redemptions: 1,
      });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err), coupon: coupon.id }, { status: 500 });
  }

  return NextResponse.json({ ok: true, couponId: coupon.id, promoCode: promo.code, promoId: promo.id });
}
