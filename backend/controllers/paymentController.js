import stripe from "../config/stripe.js";

export default async function paymentController(req,res) {
  try {
    const SUCCESS_URL = process.env.SUCCESS_URL;
    const PRICE_ID = process.env.PRICE_ID;

    if (!SUCCESS_URL || !PRICE_ID) {
      return res.status(500).json({ error: "Missing Stripe configuration in environment variables." });
    }

    if (!req.user?.userId || !req.user?.email) {
      return res.status(401).json({ error: "User is not authorized." });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: req.user.email,
      client_reference_id: req.user.userId,
      metadata: {
        userId: req.user.userId,
        userEmail: req.user.email,
      },
      subscription_data: {
        metadata: {
          userId: req.user.userId,
          userEmail: req.user.email,
        },
      },

      line_items: [
        {
          // Provide the exact Price ID (for example, price_1234) of the product you want to sell
          price: PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: SUCCESS_URL,
    });

    console.log("successful backend call");
    res.json({url:session.url});
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
}
