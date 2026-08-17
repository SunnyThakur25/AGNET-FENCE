import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { organizationBilling } from "../../drizzle/schema";
import { getDb } from "../db";

export const BILLING_PLANS = {
  pilot: {
    key: "pilot",
    name: "Pilot",
    monthlyPriceCents: 9900,
    summary: "For a first governed production workflow.",
    features: ["Up to 3 governed agents", "Core policy, approvals, Action Capture, and evidence export", "One pilot workspace"],
  },
  growth: {
    key: "growth",
    name: "Growth",
    monthlyPriceCents: 29900,
    summary: "For cross-functional agent deployments.",
    features: ["Up to 20 governed agents", "Teams, advanced observability, and enterprise connection profiles", "Priority pilot support"],
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    monthlyPriceCents: null,
    summary: "For regulated, multi-team, or custom-control deployments.",
    features: ["Custom agent capacity and enterprise rollout plan", "Vault, SIEM/SOAR, IdP/SCIM activation assistance", "Security architecture and procurement support"],
  },
} as const;

export type BillingPlanKey = keyof typeof BILLING_PLANS;

export function isBillingPlanKey(value: string): value is BillingPlanKey {
  return value === "pilot" || value === "growth" || value === "enterprise";
}

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured. Open Settings → Payment to finish activation.");
  return new Stripe(key);
}

function originFrom(value: string | undefined) {
  if (!value) return "http://localhost:3000";
  try {
    return new URL(value).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export async function getBillingRecord(organizationId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(organizationBilling).where(eq(organizationBilling.organizationId, organizationId)).limit(1);
  return rows[0] ?? null;
}

export async function createSubscriptionCheckout(input: {
  organizationId: number;
  userId: number;
  customerEmail: string | null | undefined;
  customerName: string | null | undefined;
  plan: Exclude<BillingPlanKey, "enterprise">;
  origin?: string;
}) {
  const plan = BILLING_PLANS[input.plan];
  const existing = await getBillingRecord(input.organizationId);
  const stripe = stripeClient();
  const origin = originFrom(input.origin);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(existing?.stripeCustomerId ? { customer: existing.stripeCustomerId } : { customer_email: input.customerEmail ?? undefined }),
    client_reference_id: String(input.userId),
    metadata: {
      user_id: String(input.userId),
      organization_id: String(input.organizationId),
      plan: input.plan,
      customer_email: input.customerEmail ?? "",
      customer_name: input.customerName ?? "",
    },
    subscription_data: {
      metadata: { organization_id: String(input.organizationId), plan: input.plan },
    },
    allow_promotion_codes: true,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: plan.monthlyPriceCents,
        recurring: { interval: "month" },
        product_data: { name: `AgentFence ${plan.name}` },
      },
    }],
    success_url: `${origin}/billing?checkout=success`,
    cancel_url: `${origin}/billing?checkout=cancelled`,
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
  return session.url;
}

export async function createBillingPortal(input: { organizationId: number; origin?: string }) {
  const existing = await getBillingRecord(input.organizationId);
  if (!existing?.stripeCustomerId) throw new Error("No Stripe customer exists for this workspace yet.");
  const stripe = stripeClient();
  const session = await stripe.billingPortal.sessions.create({ customer: existing.stripeCustomerId, return_url: `${originFrom(input.origin)}/billing` });
  return session.url;
}

export async function recordStripeSubscription(input: {
  organizationId: number;
  plan: BillingPlanKey;
  customerId: string | null;
  subscriptionId: string | null;
  priceId: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(organizationBilling).values({
    organizationId: input.organizationId,
    stripeCustomerId: input.customerId,
    stripeSubscriptionId: input.subscriptionId,
    stripePriceId: input.priceId,
    plan: input.plan,
  }).onDuplicateKeyUpdate({
    set: {
      stripeCustomerId: input.customerId,
      stripeSubscriptionId: input.subscriptionId,
      stripePriceId: input.priceId,
      plan: input.plan,
    },
  });
}

export function stripeWebhookClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !secret) throw new Error("Stripe webhook is not configured.");
  return { stripe: new Stripe(key), secret };
}
