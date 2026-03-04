import { pool } from "./db/client";
import { v4 as uuidv4 } from "uuid";

interface RiskPayload {
  user_id: string;
  device_id: string;
  phone_id: string;
  event_type: string;
  risk_weight: number;
  metadata?: any;
}

export async function evaluateRisk(payload: RiskPayload) {
  const {
    user_id,
    device_id,
    phone_id,
    event_type,
    risk_weight,
    metadata,
  } = payload;

  const eventId = uuidv4();

  // Insert risk event
  await pool.query(
    `
    INSERT INTO risk_events 
    (id, event_id, user_id, device_id, phone_id, event_type, risk_weight, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      uuidv4(),
      eventId,
      user_id,
      device_id,
      phone_id,
      event_type,
      risk_weight,
      metadata || {},
    ]
  );

  // Calculate risk score (last 30 days for this phone)
  const result = await pool.query(
    `
    SELECT COALESCE(SUM(risk_weight),0) as score
    FROM risk_events
    WHERE phone_id = $1
    AND created_at > NOW() - INTERVAL '30 days'
    `,
    [phone_id]
  );

  const score = Number(result.rows[0]?.score || 0);

  // Get policy decision
  const policy = await pool.query(
    `
    SELECT decision
    FROM policy_rules
    WHERE $1 BETWEEN min_score AND max_score
    LIMIT 1
    `,
    [score]
  );

  const decision = policy.rows[0]?.decision || "ALLOW";

  return { score, decision };
}