import { pool } from "../db/client";

interface ReputationResult {
  score: number;
  level: "LOW" | "MEDIUM" | "HIGH" | "BLOCK";
  reasons: string[];
}

export async function evaluateDeviceReputation(
  device_id: string
): Promise<ReputationResult> {

  console.log("📊 DEVICE REPUTATION CHECK");

  try {

    if (!device_id) {

      return {
        score: 50,
        level: "MEDIUM",
        reasons: ["Invalid device id"]
      };

    }

    let score = 0;
    const reasons: string[] = [];

    /* =========================
       FAILED AUTH ATTEMPTS
    ========================= */

    const failedAuth = await pool.query(
      `
      SELECT COUNT(*) as count
      FROM risk_events
      WHERE device_id=$1
      AND event_type='AUTH_FAIL'
      AND created_at > NOW() - INTERVAL '24 hours'
      `,
      [device_id]
    );

    const failCount = Number(failedAuth.rows[0]?.count || 0);

    if (failCount > 5) {

      score += 40;
      reasons.push("Multiple authentication failures");

    }

    /* =========================
       SIM SWAP HISTORY
    ========================= */

    const simSwap = await pool.query(
      `
      SELECT COUNT(*) as count
      FROM risk_events
      WHERE device_id=$1
      AND event_type='SIM_SWAP'
      AND created_at > NOW() - INTERVAL '30 days'
      `,
      [device_id]
    );

    const swapCount = Number(simSwap.rows[0]?.count || 0);

    if (swapCount > 0) {

      score += 50;
      reasons.push("Recent SIM swap detected");

    }

    /* =========================
       DEVICE STATUS
    ========================= */

    const deviceStatus = await pool.query(
      `
      SELECT status
      FROM devices
      WHERE device_id=$1
      `,
      [device_id]
    );

    if (!deviceStatus.rows.length) {

      score += 100;
      reasons.push("Unknown device");

    }

    /* =========================
       NORMALIZE SCORE
    ========================= */

    if (score > 100) score = 100;

    /* =========================
       DETERMINE LEVEL
    ========================= */

    let level: ReputationResult["level"] = "LOW";

    if (score >= 80) level = "BLOCK";
    else if (score >= 50) level = "HIGH";
    else if (score >= 20) level = "MEDIUM";

    console.log("Device:", device_id);
    console.log("Score:", score);
    console.log("Level:", level);
    console.log("Reasons:", reasons);

    return {
      score,
      level,
      reasons
    };

  } catch (error) {

    console.error("Device reputation evaluation failed:", error);

    return {
      score: 50,
      level: "MEDIUM",
      reasons: ["Reputation engine error"]
    };

  }

}