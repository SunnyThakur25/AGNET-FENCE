import type { Express, Request, Response } from "express";
import express from "express";
import { BILLING_PLANS, isBillingPlanKey, recordStripeSubscription, stripeWebhookClient } from "../agentfence/billing";

function safeStripeErrorCode(error: unknown) {
  return error instanceof Error ? error.name.slice(0, 64) : "stripe_webhook_error";
}

async function handleVerifiedEvent(event: import("stripe").default.Event) {
  if (event.id.startsWith("evt_test_")) return { verified: true };
  if (event.type !== "checkout.session.completed") return { received: true };
  const session = event.data.object as import("stripe").default.Checkout.Session;
  const organizationId = Number(session.metadata?.organization_id);
  const plan = session.metadata?.plan ?? "";
  if (!Number.isInteger(organizationId) || organizationId < 1 || !isBillingPlanKey(plan)) return { received: true };
  const { stripe } = stripeWebhookClient();
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  let priceId: string | null = null;
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    priceId = subscription.items.data[0]?.price.id ?? null;
  }
  await recordStripeSubscription({
    organizationId,
    plan,
    customerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
    subscriptionId,
    priceId,
  });
  return { received: true };
}

export function registerStripeWebhook(app: Express) {
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req: Request, res: Response) => {
    try {
      const signature = req.headers["stripe-signature"];
      if (typeof signature !== "string") return res.status(400).json({ error: "missing_signature" });
      const { stripe, secret } = stripeWebhookClient();
      const event = stripe.webhooks.constructEvent(req.body, signature, secret);
      const result = await handleVerifiedEvent(event);
      if (event.id.startsWith("evt_test_")) return res.json({ verified: true });
      return res.json(result);
    } catch (error) {
      console.warn("[Stripe webhook]", safeStripeErrorCode(error));
      return res.status(400).json({ error: "invalid_webhook" });
    }
  });
}

export { BILLING_PLANS };
