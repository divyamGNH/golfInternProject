import { query } from "../db/client.js";
import { isValidUuid } from "../db/utils.js";

export const listActiveEvents = async (req, res) => {
  try {
    const eventsResult = await query(
      `
        SELECT
          e.id AS "_id",
          e.title,
          e.description,
          e.location,
          e.category,
          e.image_url AS "imageUrl",
          e.start_date AS "startDate",
          e.end_date AS "endDate",
          e.capacity,
          COALESCE(rc.registered_count, 0)::int AS "seatsBooked",
          e.price_in_cents AS "priceInCents",
          e.currency,
          e.status,
          e.created_by AS "createdBy",
          e.created_at AS "createdAt",
          e.updated_at AS "updatedAt"
        FROM events e
        LEFT JOIN (
          SELECT event_id, COUNT(*)::int AS registered_count
          FROM event_registrations
          WHERE status = 'registered'
          GROUP BY event_id
        ) rc ON rc.event_id = e.id
        WHERE e.status = 'active'
        ORDER BY e.start_date ASC
      `,
    );

    const events = eventsResult.rows;

    if (events.length === 0) {
      return res.status(200).json({ events: [] });
    }

    const userRegistrationsResult = await query(
      `
        SELECT
          event_id AS "eventId",
          status
        FROM event_registrations
        WHERE user_id = $1
          AND event_id = ANY($2::uuid[])
      `,
      [
        req.user.userId,
        events.map((eventItem) => eventItem._id),
      ],
    );

    const userRegistrations = userRegistrationsResult.rows;

    const registrationMap = new Map(
      userRegistrations.map((registration) => [
        String(registration.eventId),
        registration.status,
      ]),
    );

    const data = events.map((eventItem) => ({
      ...eventItem,
      availableSeats: Math.max(eventItem.capacity - eventItem.seatsBooked, 0),
      isRegistered: registrationMap.get(String(eventItem._id)) === "registered",
      registrationStatus:
        registrationMap.get(String(eventItem._id)) || "not_registered",
    }));

    return res.status(200).json({ events: data });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to fetch events.", error: error.message });
  }
};

export const listMyRegistrations = async (req, res) => {
  try {
    const registrationsResult = await query(
      `
        SELECT
          er.id AS "registrationId",
          er.status,
          er.paid_at AS "paidAt",
          e.id AS "event_id",
          e.title AS "event_title",
          e.location AS "event_location",
          e.start_date AS "event_startDate",
          e.end_date AS "event_endDate",
          e.price_in_cents AS "event_priceInCents",
          e.currency AS "event_currency",
          e.status AS "event_status",
          p.id AS "payment_id",
          p.status AS "payment_status",
          p.amount_in_cents AS "payment_amountInCents",
          p.currency AS "payment_currency",
          p.stripe_checkout_session_id AS "payment_stripeCheckoutSessionId",
          p.stripe_payment_intent_id AS "payment_stripePaymentIntentId",
          p.updated_at AS "payment_updatedAt"
        FROM event_registrations er
        LEFT JOIN events e ON e.id = er.event_id
        LEFT JOIN payments p ON p.id = er.payment_id
        WHERE er.user_id = $1
        ORDER BY er.created_at DESC
      `,
      [req.user.userId],
    );

    const data = registrationsResult.rows
      .filter((entry) => entry.event_id)
      .map((entry) => ({
        registrationId: entry.registrationId,
        status: entry.status,
        paidAt: entry.paidAt,
        event: {
          _id: entry.event_id,
          title: entry.event_title,
          location: entry.event_location,
          startDate: entry.event_startDate,
          endDate: entry.event_endDate,
          priceInCents: entry.event_priceInCents,
          currency: entry.event_currency,
          status: entry.event_status,
        },
        payment: entry.payment_id
          ? {
              _id: entry.payment_id,
              status: entry.payment_status,
              amountInCents: entry.payment_amountInCents,
              currency: entry.payment_currency,
              stripeCheckoutSessionId: entry.payment_stripeCheckoutSessionId,
              stripePaymentIntentId: entry.payment_stripePaymentIntentId,
              updatedAt: entry.payment_updatedAt,
            }
          : null,
      }));

    return res.status(200).json({ registrations: data });
  } catch (error) {
    return res
      .status(500)
      .json({
        message: "Failed to fetch registrations.",
        error: error.message,
      });
  }
};

export const getEventById = async (req, res) => {
  const { eventId } = req.params;

  if (!isValidUuid(eventId)) {
    return res.status(400).json({ message: "Invalid event ID." });
  }

  try {
    const eventResult = await query(
      `
        SELECT
          e.id AS "_id",
          e.title,
          e.description,
          e.location,
          e.category,
          e.image_url AS "imageUrl",
          e.start_date AS "startDate",
          e.end_date AS "endDate",
          e.capacity,
          COALESCE(rc.registered_count, 0)::int AS "seatsBooked",
          e.price_in_cents AS "priceInCents",
          e.currency,
          e.status,
          e.created_by AS "createdBy",
          e.created_at AS "createdAt",
          e.updated_at AS "updatedAt"
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
      return res.status(404).json({ message: "Event not found." });
    }

    const registrationResult = await query(
      `
        SELECT status
        FROM event_registrations
        WHERE user_id = $1
          AND event_id = $2
        LIMIT 1
      `,
      [req.user.userId, eventId],
    );

    const registration = registrationResult.rows[0];

    return res.status(200).json({
      event: {
        ...eventItem,
        availableSeats: Math.max(eventItem.capacity - eventItem.seatsBooked, 0),
      },
      registrationStatus: registration?.status || "not_registered",
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to fetch event.", error: error.message });
  }
};

export const listMyPayments = async (req, res) => {
  try {
    const paymentsResult = await query(
      `
        SELECT
          p.id AS "_id",
          p.status,
          p.amount_in_cents AS "amountInCents",
          p.currency,
          p.stripe_checkout_session_id AS "stripeCheckoutSessionId",
          p.stripe_payment_intent_id AS "stripePaymentIntentId",
          p.created_at AS "createdAt",
          p.updated_at AS "updatedAt",
          e.id AS "event_id",
          e.title AS "event_title",
          e.start_date AS "event_startDate"
        FROM payments p
        JOIN event_registrations er ON er.id = p.registration_id
        LEFT JOIN events e ON e.id = er.event_id
        WHERE er.user_id = $1
        ORDER BY p.created_at DESC
      `,
      [req.user.userId],
    );

    const payments = paymentsResult.rows.map((entry) => ({
      _id: entry._id,
      status: entry.status,
      amountInCents: entry.amountInCents,
      currency: entry.currency,
      stripeCheckoutSessionId: entry.stripeCheckoutSessionId,
      stripePaymentIntentId: entry.stripePaymentIntentId,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      eventId: entry.event_id
        ? {
            _id: entry.event_id,
            title: entry.event_title,
            startDate: entry.event_startDate,
          }
        : null,
    }));

    return res.status(200).json({ payments });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to fetch payments.", error: error.message });
  }
};
