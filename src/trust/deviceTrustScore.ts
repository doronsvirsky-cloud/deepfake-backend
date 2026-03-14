import { pool } from "../db/client";

export async function calculateDeviceTrustScore(device_id: string) {

  try {

    const events = await pool.query(
      `
      SELECT COALESCE(SUM(risk_weight),0) AS risk
      FROM risk_events
      WHERE device_id = $1
      AND created_at > NOW() - INTERVAL '30 days'
      `,
      [device_id]
    );

    const riskScore = Number(events.rows[0]?.risk || 0);

    /* =======================
       LIMIT RISK SCORE
    ======================= */

    const normalizedRisk = Math.min(riskScore, 100);

    let trustScore = 100 - normalizedRisk;

    if (trustScore < 0) trustScore = 0;

    console.log("📊 DEVICE TRUST SCORE");
    console.log("Device:", device_id);
    console.log("Risk score:", normalizedRisk);
    console.log("Trust score:", trustScore);

    return {
      trust_score: trustScore,
      risk_score: normalizedRisk
    };

  } catch (error) {

    console.error("Device trust score calculation failed:", error);

    return {
      trust_score: 50,
      risk_score: 50
    };

  }

}