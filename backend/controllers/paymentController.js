import stripe from "../config/stripe.js";
import { query, withTransaction } from "../db/client.js";
import { isValidUuid } from "../db/utils.js";

const resolveBaseUrl = () =>
  process.env.FRONTEND_URL || "http://localhost:5173";
const normalizeTier = (value) =>
  String(value || "standard").toLowerCase() === "vip" ? "vip" : "standard";
const tierMultiplier = (tier) => (tier === "vip" ? 2 : 1);

const insertPaymentLog = async (db, {
  paymentId,
  source,
  fromStatus = null,
  toStatus,
  note = "",
  metadata = {},
  webhookEventId = null,
}) => {
  await db.query(
    `
      INSERT INTO payment_logs (
        payment_id,
        webhook_event_id,
        source,
        from_status,
        to_status,
        note,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      paymentId,
      webhookEventId,
      source,
      fromStatus,
      toStatus,
      note,
      JSON.stringify(metadata),
    ],
  );
};

const finalizeSuccessfulSession = async (session) => {
  const metadata = session.metadata || {};
  const paymentRecordId = metadata.paymentRecordId;
  const registrationId = metadata.registrationId;
  const eventId = metadata.eventId;
  const userId = metadata.userId;

  if (!registrationId || !eventId || !userId) {
    return { updated: false };
  }

  if (!isValidUuid(registrationId) || !isValidUuid(eventId) || !isValidUuid(userId)) {
    return { updated: false };
  }

  return withTransaction(async (client) => {
    const registrationResult = await client.query(
      `
        SELECT
          id,
          user_id,
          event_id,
          status,
          paid_at,
          payment_id
        FROM event_registrations
        WHERE id = $1
        FOR UPDATE
      `,
      [registrationId],
    );

    if (registrationResult.rowCount === 0) {
      return { updated: false };
    }

    const registration = registrationResult.rows[0];
    if (
      String(registration.user_id) !== String(userId) ||
      String(registration.event_id) !== String(eventId)
    ) {
      return { updated: false };
    }

    let payment = null;

    if (paymentRecordId && isValidUuid(paymentRecordId)) {
      const paymentById = await client.query(
        `SELECT id, status FROM payments WHERE id = $1 FOR UPDATE`,
        [paymentRecordId],
      );
      payment = paymentById.rows[0] || null;
    }

    if (!payment && session.id) {
      const paymentBySession = await client.query(
        `SELECT id, status FROM payments WHERE stripe_checkout_session_id = $1 FOR UPDATE`,
        [session.id],
      );
      payment = paymentBySession.rows[0] || null;
    }

    if (!payment) {
      const upsertPayment = await client.query(
        `
          INSERT INTO payments (
            registration_id,
            amount_in_cents,
            currency,
            status,
            stripe_checkout_session_id,
            stripe_payment_intent_id,
            stripe_customer_id
          )
          VALUES ($1, $2, $3, 'pending', $4, $5, $6)
          ON CONFLICT (registration_id)
          DO UPDATE SET
            amount_in_cents = EXCLUDED.amount_in_cents,
            currency = EXCLUDED.currency
          RETURNING id, status
        `,
        [
          registrationId,
          Math.max(Number(session.amount_total || 0), 0),
          String(session.currency || "inr").toLowerCase(),
          session.id || null,
          session.payment_intent || null,
          session.customer || null,
        ],
      );

      payment = upsertPayment.rows[0];
    }

    const updatedPayment = await client.query(
      `
        UPDATE payments
        SET status = 'paid',
            stripe_checkout_session_id = COALESCE($2, stripe_checkout_session_id),
            stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id),
            stripe_customer_id = COALESCE($4, stripe_customer_id)
        WHERE id = $1
        RETURNING id, status
      `,
      [payment.id, session.id || null, session.payment_intent || null, session.customer || null],
    );

    const previousStatus = payment.status || "pending";
    const paymentId = updatedPayment.rows[0].id;
    const currentStatus = updatedPayment.rows[0].status;

    if (previousStatus !== currentStatus) {
      await insertPaymentLog(client, {
        paymentId,
        source: "status_sync",
        fromStatus: previousStatus,
        toStatus: currentStatus,
        note: "Payment marked as paid from checkout status sync.",
        metadata: {
          registrationId,
          stripeCheckoutSessionId: session.id || null,
          stripePaymentIntentId: session.payment_intent || null,
        },
      });
    }

    let registrationStatus = registration.status;

    if (registration.status !== "registered") {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [eventId]);

      const eventResult = await client.query(
        `
          SELECT id, capacity, status
          FROM events
          WHERE id = $1
          FOR UPDATE
        `,
        [eventId],
      );

      const eventItem = eventResult.rows[0];
      if (!eventItem || eventItem.status !== "active") {
        registrationStatus = "pending_payment";
      } else {
        const registeredCountResult = await client.query(
          `
            SELECT COUNT(*)::int AS count
            FROM event_registrations
            WHERE event_id = $1
              AND status = 'registered'
          `,
          [eventId],
        );

        const registeredCount = registeredCountResult.rows[0].count;
        if (registeredCount < Number(eventItem.capacity)) {
          const registrationUpdate = await client.query(
            `
              UPDATE event_registrations
              SET status = 'registered',
                  paid_at = COALESCE(paid_at, NOW()),
                  payment_id = $2
              WHERE id = $1
              RETURNING status
            `,
            [registrationId, paymentId],
          );
          registrationStatus = registrationUpdate.rows[0].status;
        } else {
          registrationStatus = "pending_payment";
          await client.query(
            `
              UPDATE event_registrations
              SET payment_id = $2
              WHERE id = $1
            `,
            [registrationId, paymentId],
          );
        }
      }
    } else {
      await client.query(
        `
          UPDATE event_registrations
          SET paid_at = COALESCE(paid_at, NOW()),
              payment_id = $2
          WHERE id = $1
        `,
        [registrationId, paymentId],
      );
      registrationStatus = "registered";
    }

    return { updated: true, registrationStatus };
  });
};

export const createCheckoutSession = async (req, res) => {
  const { eventId } = req.params;
  const ticketTier = normalizeTier(req.body?.ticketTier);

  if (!isValidUuid(eventId)) {
    return res.status(400).json({ error: "Invalid event ID." });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res
        .status(500)
        .json({ error: "Missing Stripe secret key configuration." });
    }

    if (!req.user?.userId || !req.user?.email) {
      return res.status(401).json({ error: "User is not authorized." });
    }

    const eventResult = await query(
      `
        SELECT
          e.id AS "_id",
          e.title,
          e.description,
          e.price_in_cents AS "priceInCents",
          e.currency,
          e.capacity,
          e.status,
          COALESCE(rc.registered_count, 0)::int AS "seatsBooked"
        FROM events e
        LEFT JOIN (
          SELECT event_id, COUNT(*)::int AS registered_count
          FROM event_registrations
          WHERE status = 'registered'
          GROUP BY event_id
        ) rc ON rc.event_id = e.id
        WHERE e.id = $1
          AND e.status = 'active'
        LIMIT 1
      `,
      [eventId],
    );

    const eventItem = eventResult.rows[0];
    if (!eventItem) {
      return res.status(404).json({ error: "Event not found." });
    }

    if (eventItem.seatsBooked >= eventItem.capacity) {
      return res.status(400).json({ error: "Event is sold out." });
    }

    const registrationResult = await query(
      `
        INSERT INTO event_registrations (user_id, event_id, status)
        VALUES ($1, $2, 'pending_payment')
        ON CONFLICT (user_id, event_id)
        DO UPDATE SET updated_at = NOW()
        RETURNING
          id AS "_id",
          status,
          paid_at AS "paidAt",
          payment_id AS "paymentId"
      `,
      [req.user.userId, eventId],
    );

    const registration = registrationResult.rows[0];

    if (registration?.status === "registered") {
      return res.status(200).json({
        alreadyRegistered: true,
        message: "You are already registered for this event.",
      });
    }

    const paymentRecordResult = await query(
      `
        SELECT
          id AS "_id",
          status,
          amount_in_cents AS "amountInCents",
          currency,
          stripe_checkout_session_id AS "stripeCheckoutSessionId"
        FROM payments
        WHERE registration_id = $1
        LIMIT 1
      `,
      [registration._id],
    );

    let paymentRecord = paymentRecordResult.rows[0] || null;

    if (paymentRecord?.status === "paid") {
      await query(
        `
          UPDATE event_registrations
          SET status = 'registered',
              paid_at = COALESCE(paid_at, NOW()),
              payment_id = $2
          WHERE id = $1
        `,
        [registration._id, paymentRecord._id],
      );

      return res.status(200).json({
        alreadyRegistered: true,
        message: "Payment already completed for this event.",
      });
    }

    const targetAmount = Math.round(
      eventItem.priceInCents * tierMultiplier(ticketTier),
    );

    if (!paymentRecord) {
      const insertedPayment = await query(
        `
          INSERT INTO payments (
            registration_id,
            amount_in_cents,
            currency,
            status
          )
          VALUES ($1, $2, $3, 'pending')
          RETURNING
            id AS "_id"
        `,
        [registration._id, targetAmount, eventItem.currency],
      );
      paymentRecord = insertedPayment.rows[0];

      await insertPaymentLog({ query }, {
        paymentId: paymentRecord._id,
        source: "checkout",
        fromStatus: null,
        toStatus: "pending",
        note: "Payment record created from checkout flow.",
        metadata: {
          registrationId: registration._id,
          eventId,
          ticketTier,
        },
      });
    }

    await query(
      `
        UPDATE payments
        SET amount_in_cents = $2,
            currency = $3
        WHERE id = $1
      `,
      [paymentRecord._id, targetAmount, eventItem.currency],
    );

    const baseUrl = resolveBaseUrl();
    const successUrl = `${baseUrl}/dashboard/events?payment=success&eventId=${eventId}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/dashboard/events?payment=cancel&eventId=${eventId}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: req.user.email,
      client_reference_id: req.user.userId,
      metadata: {
        userId: req.user.userId,
        userEmail: req.user.email,
        eventId,
        registrationId: String(registration._id),
        paymentRecordId: String(paymentRecord._id),
        ticketTier,
      },

      line_items: [
        {
          price_data: {
            currency: eventItem.currency,
            product_data: {
              name: `${eventItem.title} (${ticketTier === "vip" ? "VIP" : "Standard"})`,
              description: eventItem.description || "Event registration",
            },
            unit_amount: Math.round(
              eventItem.priceInCents * tierMultiplier(ticketTier),
            ),
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    await query(
      `
        UPDATE payments
        SET stripe_checkout_session_id = $2,
            status = 'pending'
        WHERE id = $1
      `,
      [paymentRecord._id, session.id],
    );

    await insertPaymentLog({ query }, {
      paymentId: paymentRecord._id,
      source: "checkout",
      fromStatus: paymentRecord.status || "pending",
      toStatus: "pending",
      note: "Stripe checkout session linked to payment.",
      metadata: {
        registrationId: registration._id,
        eventId,
        stripeCheckoutSessionId: session.id,
        ticketTier,
      },
    });

    return res.status(200).json({ url: session.url, alreadyRegistered: false });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getCheckoutStatus = async (req, res) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({ error: "Missing checkout session id." });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res
        .status(500)
        .json({ error: "Missing Stripe secret key configuration." });
    }

    if (!req.user?.userId) {
      return res.status(401).json({ error: "User is not authorized." });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Checkout session not found." });
    }

    if (String(session.metadata?.userId || "") !== String(req.user.userId)) {
      return res
        .status(403)
        .json({ error: "Forbidden: session does not belong to this user." });
    }

    if (session.mode !== "payment") {
      return res
        .status(400)
        .json({ error: "Unsupported checkout session mode." });
    }

    if (session.payment_status === "paid") {
      const result = await finalizeSuccessfulSession(session);
      return res.status(200).json({
        paymentStatus: "paid",
        registrationStatus: result.registrationStatus || "registered",
      });
    }

    return res
      .status(200)
      .json({ paymentStatus: session.payment_status || "unpaid" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export default createCheckoutSession;
