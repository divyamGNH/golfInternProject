import stripe from "../config/stripe.js";
import { query, withTransaction } from "../db/client.js";
import { isValidUuid } from "../db/utils.js";

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

  const persistWebhookEvent = async () => {
    try {
      const existingResult = await query(
        `
          SELECT id, processed
          FROM webhook_events
          WHERE stripe_event_id = $1
          LIMIT 1
        `,
        [event.id],
      );

      const existing = existingResult.rows[0];

      if (existing?.processed) {
        return { alreadyProcessed: true, webhookEventId: existing.id || null };
      }

      if (!existing) {
        const insertedResult = await query(
          `
            INSERT INTO webhook_events (
              stripe_event_id,
              type,
              processed,
              payload
            )
            VALUES ($1, $2, FALSE, $3::jsonb)
            RETURNING id
          `,
          [event.id, event.type, JSON.stringify(event)],
        );

        return {
          alreadyProcessed: false,
          webhookEventId: insertedResult.rows[0].id,
        };
      }

      return { alreadyProcessed: false, webhookEventId: existing.id || null };
    } catch (error) {
      if (error?.code === "23505") {
        return { alreadyProcessed: true, webhookEventId: null };
      }
      throw error;
    }
  };

  const markWebhookComplete = async () => {
    await query(
      `
        UPDATE webhook_events
        SET processed = TRUE,
            processing_error = ''
        WHERE stripe_event_id = $1
      `,
      [event.id],
    );
  };

  const markWebhookFailed = async (message) => {
    await query(
      `
        UPDATE webhook_events
        SET processed = FALSE,
            processing_error = $2
        WHERE stripe_event_id = $1
      `,
      [event.id, message || "Unknown webhook error"],
    );
  };

  const markPaymentAsCompleted = async (session, webhookEventId) => {
    const metadata = session.metadata || {};
    const paymentRecordId = metadata.paymentRecordId;
    const registrationId = metadata.registrationId;
    const eventId = metadata.eventId;
    const userId = metadata.userId;

    if (!registrationId || !eventId || !userId) {
      return;
    }

    if (!isValidUuid(registrationId) || !isValidUuid(eventId) || !isValidUuid(userId)) {
      return;
    }

    await withTransaction(async (client) => {
      const registrationResult = await client.query(
        `
          SELECT
            id,
            user_id,
            event_id,
            status
          FROM event_registrations
          WHERE id = $1
          FOR UPDATE
        `,
        [registrationId],
      );

      if (registrationResult.rowCount === 0) {
        return;
      }

      const registration = registrationResult.rows[0];
      if (
        String(registration.user_id) !== String(userId) ||
        String(registration.event_id) !== String(eventId)
      ) {
        return;
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
        const inserted = await client.query(
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
        payment = inserted.rows[0];
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
          webhookEventId,
          source: "webhook",
          fromStatus: previousStatus,
          toStatus: currentStatus,
          note: "Payment marked as paid from checkout.session.completed webhook.",
          metadata: {
            stripeCheckoutSessionId: session.id || null,
            stripePaymentIntentId: session.payment_intent || null,
            eventType: event.type,
          },
        });
      }

      if (registration.status !== "registered") {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [eventId]);

        const eventResult = await client.query(
          `
            SELECT capacity, status
            FROM events
            WHERE id = $1
            FOR UPDATE
          `,
          [eventId],
        );

        const eventItem = eventResult.rows[0];
        if (!eventItem || eventItem.status !== "active") {
          await client.query(
            `
              UPDATE event_registrations
              SET payment_id = $2
              WHERE id = $1
            `,
            [registrationId, paymentId],
          );
          return;
        }

        const countResult = await client.query(
          `
            SELECT COUNT(*)::int AS count
            FROM event_registrations
            WHERE event_id = $1
              AND status = 'registered'
          `,
          [eventId],
        );

        const registeredCount = countResult.rows[0].count;
        if (registeredCount < Number(eventItem.capacity)) {
          await client.query(
            `
              UPDATE event_registrations
              SET status = 'registered',
                  paid_at = COALESCE(paid_at, NOW()),
                  payment_id = $2
              WHERE id = $1
            `,
            [registrationId, paymentId],
          );
        } else {
          await client.query(
            `
              UPDATE event_registrations
              SET payment_id = $2
              WHERE id = $1
            `,
            [registrationId, paymentId],
          );
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
      }
    });
  };

  const markPaymentAsExpired = async (session, webhookEventId) => {
    const registrationId = session.metadata?.registrationId;
    if (!registrationId || !isValidUuid(registrationId)) {
      return;
    }

    const updateResult = await query(
      `
        UPDATE payments
        SET status = 'expired'
        WHERE registration_id = $1
          AND status <> 'paid'
        RETURNING id, status
      `,
      [registrationId],
    );

    for (const row of updateResult.rows) {
      await insertPaymentLog({ query }, {
        paymentId: row.id,
        webhookEventId,
        source: "webhook",
        fromStatus: null,
        toStatus: row.status,
        note: "Payment marked as expired from checkout.session.expired webhook.",
        metadata: {
          registrationId,
          eventType: event.type,
          stripeCheckoutSessionId: session.id || null,
        },
      });
    }
  };

  try {
    const persistenceResult = await persistWebhookEvent();
    if (persistenceResult.alreadyProcessed) {
      return res.json({ received: true, duplicate: true });
    }

    const webhookEventId = persistenceResult.webhookEventId || null;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.mode === "payment" && session.payment_status === "paid") {
        await markPaymentAsCompleted(session, webhookEventId);
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object;
      if (session.mode === "payment") {
        await markPaymentAsExpired(session, webhookEventId);
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object;
      const failedResult = await query(
        `
          UPDATE payments
          SET status = 'failed'
          WHERE stripe_payment_intent_id = $1
          RETURNING id, status
        `,
        [paymentIntent.id],
      );

      for (const row of failedResult.rows) {
        await insertPaymentLog({ query }, {
          paymentId: row.id,
          webhookEventId,
          source: "webhook",
          fromStatus: null,
          toStatus: row.status,
          note: "Payment marked as failed from payment_intent.payment_failed webhook.",
          metadata: {
            eventType: event.type,
            stripePaymentIntentId: paymentIntent.id,
          },
        });
      }
    }

    await markWebhookComplete();

    return res.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    await markWebhookFailed(err.message);
    return res.status(500).send("Server error");
  }
}