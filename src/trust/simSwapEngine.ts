import { pool } from "../db/client";

export async function detectSimSwap(
  deviceRecordId: string,
  simHash: string
) {

  if (!simHash) {
    return {
      status: "SIM_UNKNOWN",
      risk: 20
    };
  }

  const simResult = await pool.query(
    `
    SELECT device_id, approved
    FROM device_sims
    WHERE sim_hash = $1
    `,
    [simHash]
  );

  // SIM חדש שלא נראה קודם
  if (simResult.rows.length === 0) {

    await pool.query(
      `
      INSERT INTO device_sims
      (device_id, sim_hash, approved)
      VALUES ($1,$2,false)
      `,
      [deviceRecordId, simHash]
    );

    return {
      status: "NEW_SIM_DETECTED",
      risk: 40
    };
  }

  const existingDevice = simResult.rows[0].device_id;

  // הסים שייך למכשיר אחר
  if (existingDevice !== deviceRecordId) {

    return {
      status: "SIM_MOVED_DEVICE",
      risk: 90
    };

  }

  return {
    status: "SIM_OK",
    risk: 0
  };

}