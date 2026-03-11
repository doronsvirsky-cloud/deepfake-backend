import { pool } from "../db/client";
import { v4 as uuidv4 } from "uuid";

interface RiskPayload {
  user_id: string;
  device_id: string;
  phone_id: string;
  event_type: string;
  risk_weight: number;
  metadata?: Record<string, any>;
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

  /* =======================
     DEVICE VALIDATION
  ======================= */

  const deviceCheck = await pool.query(
    `
    SELECT id, user_id, status, reputation_score
    FROM devices
    WHERE device_id = $1
    `,
    [device_id]
  );

  if (deviceCheck.rows.length === 0) {
    throw new Error("Device not found");
  }

  if (deviceCheck.rows[0].user_id !== user_id) {
    throw new Error("Device does not belong to user");
  }

  if (deviceCheck.rows[0].status !== "ACTIVE") {
    throw new Error("Device is not active");
  }

  const reputation = deviceCheck.rows[0].reputation_score ?? 80;

  /* =======================
     STORE RISK EVENT
  ======================= */

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

  /* =======================
     UPDATE DEVICE REPUTATION
  ======================= */

  await pool.query(
    `
    UPDATE devices
    SET reputation_score =
      GREATEST(0, reputation_score - $1)
    WHERE device_id=$2
    `,
    [
      risk_weight,
      device_id
    ]
  );

  /* =======================
     CALCULATE RISK SCORE
  ======================= */

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

  /* =======================
     COMBINE WITH DEVICE REPUTATION
  ======================= */

  const adjustedScore = Math.max(0, score - reputation / 5);

  /* =======================
     POLICY DECISION
  ======================= */

  const policy = await pool.query(
    `
    SELECT decision
    FROM policy_rules
    WHERE $1 BETWEEN min_score AND max_score
    LIMIT 1
    `,
    [adjustedScore]
  );

  const decision = policy.rows[0]?.decision || "BLOCK";

  return {
    risk_score: score,
    reputation,
    adjusted_score: adjustedScore,
    decision
  };

}