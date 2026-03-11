import { pool } from "../db/client";

export async function calculateDeviceTrustScore(device_id: string) {

  const events = await pool.query(
    `
    SELECT COALESCE(SUM(risk_weight),0) as risk
    FROM risk_events
    WHERE device_id = $1
    AND created_at > NOW() - INTERVAL '30 days'
    `,
    [device_id]
  );

  const riskScore = Number(events.rows[0].risk);

  let trustScore = 100 - riskScore;

  if (trustScore < 0) trustScore = 0;

  return {
    trust_score: trustScore
  };

}