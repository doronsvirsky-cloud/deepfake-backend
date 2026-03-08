import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function markDeviceCompromised(
  deviceId: string,
  reason: string
) {
  try {

    const result = await pool.query(
      `
      UPDATE devices
      SET
        device_status = 'COMPROMISED',
        trust_score = GREATEST(trust_score - 40, 0),
        status_reason = $1,
        compromised_at = NOW(),
        status_updated_at = NOW()
      WHERE device_id = $2
      RETURNING trust_score
      `,
      [reason, deviceId]
    );

    const newScore = result.rows[0]?.trust_score;

    console.log("⚠ Device compromised:", deviceId);
    console.log("New trust score:", newScore);

  } catch (err) {

    console.error("Failed to mark device compromised:", err);

  }
}