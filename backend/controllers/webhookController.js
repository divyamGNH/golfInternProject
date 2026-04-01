import stripe from "../config/stripe.js";
import User from "../models/User.js";

export default async function webhookController(req, res) {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const findUserForEvent = async ({ userId, email, customerId }) => {
    if (userId) {
      const byId = await User.findById(userId);
      if (byId) return byId;
    }

    if (customerId) {
      const byCustomerId = await User.findOne({
        "subscription.stripeCustomerId": customerId,
      });
      if (byCustomerId) return byCustomerId;
    }

    if (email) {
      const byEmail = await User.findOne({ email });
      if (byEmail) return byEmail;
    }

    return null;
  };

  const markSubscriptionActive = async ({
    user,
    subscriptionId,
    customerId,
    currentPeriodEnd,
  }) => {
    user.subscription = {
      ...user.subscription,
      status: "active",
      stripeCustomerId: customerId || user.subscription?.stripeCustomerId,
      stripeSubscriptionId:
        subscriptionId || user.subscription?.stripeSubscriptionId,
      currentPeriodEnd:
        currentPeriodEnd || user.subscription?.currentPeriodEnd || null,
    };

    await user.save();
  };

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (session.mode === "subscription") {
        const userId = session.metadata?.userId || session.client_reference_id;
        const email =
          session.metadata?.userEmail ||
          session.customer_details?.email ||
          session.customer_email;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        const user = await findUserForEvent({ userId, email, customerId });

        if (!user) {
          console.log("User not found for checkout.session.completed", {
            userId,
            email,
            customerId,
          });
          return res.json({ received: true });
        }

        await markSubscriptionActive({
          user,
          subscriptionId,
          customerId,
          currentPeriodEnd: null,
        });

        console.log("Subscription marked active on checkout for:", user.email);
      }
    }

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;

      if (!subscriptionId) {
        return res.json({ received: true });
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const customerId = subscription.customer;
      const customer = await stripe.customers.retrieve(customerId);

      const userId = subscription.metadata?.userId;
      const email =
        subscription.metadata?.userEmail ||
        customer.email ||
        invoice.customer_email;

      const user = await findUserForEvent({ userId, email, customerId });

      if (!user) {
        console.log("User not found for invoice.payment_succeeded", {
          userId,
          email,
          customerId,
        });
        return res.json({ received: true });
      }

      let currentPeriodEnd = null;

      if (subscription.current_period_end) {
        currentPeriodEnd = new Date(subscription.current_period_end * 1000);
      }

      await markSubscriptionActive({
        user,
        subscriptionId,
        customerId,
        currentPeriodEnd,
      });

      console.log("Subscription updated for:", user.email);
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).send("Server error");
  }
}