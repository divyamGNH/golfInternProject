import { query } from "../db/client.js";
import { isValidUuid } from "../db/utils.js";

export const createEvent = async (req, res) => {
  const {
    title,
    description,
    location,
    category,
    imageUrl,
    startDate,
    endDate,
    capacity,
    priceInCents,
    currency,
  } = req.body;

  if (!title || !startDate || !endDate || !capacity) {
    return res
      .status(400)
      .json({
        message: "title, startDate, endDate and capacity are required.",
      });
  }

  if (new Date(startDate) >= new Date(endDate)) {
    return res
      .status(400)
      .json({ message: "endDate must be after startDate." });
  }

  try {
    const eventResult = await query(
      `
        INSERT INTO events (
          title,
          description,
          location,
          category,
          image_url,
          start_date,
          end_date,
          capacity,
          price_in_cents,
          currency,
          status,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11)
        RETURNING
          id AS "_id",
          title,
          description,
          location,
          category,
          image_url AS "imageUrl",
          start_date AS "startDate",
          end_date AS "endDate",
          capacity,
          0::int AS "seatsBooked",
          price_in_cents AS "priceInCents",
          currency,
          status,
          created_by AS "createdBy",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [
        String(title).trim(),
        String(description || "").trim(),
        String(location || "Online").trim(),
        String(category || "General").trim(),
        String(imageUrl || "").trim(),
        startDate,
        endDate,
        Number(capacity),
        Number(priceInCents || 0),
        String(currency || "inr").toLowerCase(),
        req.user.userId,
      ],
    );

    const eventItem = eventResult.rows[0];

    await query(
      `
        INSERT INTO admin_action_logs (
          admin_user_id,
          action_type,
          target_type,
          target_id,
          metadata
        )
        VALUES ($1, 'CREATE_EVENT', 'Event', $2, $3::jsonb)
      `,
      [
        req.user.userId,
        eventItem._id,
        JSON.stringify({
          title: eventItem.title,
          priceInCents: eventItem.priceInCents,
        }),
      ],
    );

    return res.status(201).json({ event: eventItem });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to create event.", error: error.message });
  }
};

export const deleteEvent = async (req, res) => {
  const { eventId } = req.params;

  if (!isValidUuid(eventId)) {
    return res.status(400).json({ message: "Invalid event ID." });
  }

  try {
    const eventResult = await query(
      `
        UPDATE events
        SET status = 'deleted'
        WHERE id = $1
          AND status <> 'deleted'
        RETURNING
          id AS "_id",
          title
      `,
      [eventId],
    );

    const eventItem = eventResult.rows[0];

    if (!eventItem) {
      return res.status(404).json({ message: "Event not found." });
    }

    await query(
      `
        INSERT INTO admin_action_logs (
          admin_user_id,
          action_type,
          target_type,
          target_id,
          metadata
        )
        VALUES ($1, 'DELETE_EVENT', 'Event', $2, $3::jsonb)
      `,
      [
        req.user.userId,
        eventItem._id,
        JSON.stringify({ title: eventItem.title }),
      ],
    );

    return res.status(200).json({ message: "Event deleted successfully." });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to delete event.", error: error.message });
  }
};

export const listAllEvents = async (_req, res) => {
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
        ORDER BY e.created_at DESC
      `,
    );

    const events = eventsResult.rows;

    return res.status(200).json({ events });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to fetch events.", error: error.message });
  }
};

export const listEventRegistrations = async (req, res) => {
  const { eventId } = req.params;

  if (!isValidUuid(eventId)) {
    return res.status(400).json({ message: "Invalid event ID." });
  }

  try {
    const usersResult = await query(
      `
        SELECT
          u.id AS "userId",
          u.username,
          u.email,
          er.paid_at AS "paidAt"
        FROM event_registrations er
        JOIN users u ON u.id = er.user_id
        WHERE er.event_id = $1
          AND er.status = 'registered'
        ORDER BY er.created_at ASC
      `,
      [eventId],
    );

    await query(
      `
        INSERT INTO admin_action_logs (
          admin_user_id,
          action_type,
          target_type,
          target_id,
          metadata
        )
        VALUES ($1, 'VIEW_EVENT_REGISTRATIONS', 'EventRegistration', $2, $3::jsonb)
      `,
      [
        req.user.userId,
        eventId,
        JSON.stringify({ registrationCount: usersResult.rows.length }),
      ],
    );

    const userIds = usersResult.rows;

    return res.status(200).json({ users: userIds });
  } catch (error) {
    return res
      .status(500)
      .json({
        message: "Failed to fetch registrations.",
        error: error.message,
      });
  }
};
