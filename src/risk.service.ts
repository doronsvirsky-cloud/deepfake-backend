import { pool } from "./db/client";
import { v4 as uuidv4 } from "uuid";

interface RiskPayload {
  user_id: string;
  device_id: string;
  phone_number: string;
  event_type: string;
  risk_weight: number;
}

export async function evaluateRisk(payload: RiskPayload) {

  const {
    user_id,
    device_id,
    phone_number,
    event_type,
    risk_weight
  } = payload;

  const eventId = uuidv4();

  /* =======================
     INSERT RISK EVENT
  ======================= */

  await pool.query(
    `
    INSERT INTO risk_events
    (id, event_id, user_id, device_id, phone_number, event_type, risk_weight, final_score)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `,
    [
      uuidv4(),
      eventId,
      user_id,
      device_id,
      phone_number,
      event_type,
      risk_weight,
      risk_weight
    ]
  );

  /* =======================
     CALCULATE RISK SCORE
  ======================= */

  const result = await pool.query(
    `
    SELECT COALESCE(SUM(risk_weight),0) as score
    FROM risk_events
    WHERE phone_number = $1
    AND created_at > NOW() - INTERVAL '30 days'
    `,
    [phone_number]
  );

  const score = Number(result.rows[0]?.score || 0);

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
    [score]
  );

  const decision = policy.rows[0]?.decision || "ALLOW";

  return {
    score,
    decision
  };

}