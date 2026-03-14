import { pool } from "../db/client";

export async function detectSimSwap(
  deviceRecordId: string,
  simHash: string
) {

  if (!simHash) {
<<<<<<< HEAD

=======
>>>>>>> 16015a8
    return {
      status: "SIM_UNKNOWN",
      risk: 20
    };
<<<<<<< HEAD

  }

  try {

    const simResult = await pool.query(
      `
      SELECT device_id, approved
      FROM device_sims
      WHERE sim_hash = $1
      `,
      [simHash]
    );

    // SIM חדש
    if (simResult.rows.length === 0) {

      console.log("⚠ NEW SIM DETECTED");

      await pool.query(
        `
        INSERT INTO device_sims
        (device_id, sim_hash, approved)
        VALUES ($1,$2,false)
        ON CONFLICT (sim_hash) DO NOTHING
        `,
        [deviceRecordId, simHash]
      );

      return {
        status: "NEW_SIM_DETECTED",
        risk: 40
      };

    }

    const existingDevice = simResult.rows[0].device_id;
    const approved = simResult.rows[0].approved;

    // SIM עבר למכשיר אחר
    if (existingDevice !== deviceRecordId) {

      console.log("🚨 SIM SWAP DETECTED");

      return {
        status: "SIM_MOVED_DEVICE",
        risk: 90
      };

    }

    // SIM לא מאושר עדיין
    if (!approved) {

      return {
        status: "SIM_PENDING_APPROVAL",
        risk: 25
      };

    }

    return {
      status: "SIM_OK",
      risk: 0
    };

  } catch (error) {

    console.error("SIM SWAP ENGINE ERROR", error);

    return {
      status: "SIM_CHECK_FAILED",
      risk: 50
=======
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
>>>>>>> 16015a8
    };

  }

<<<<<<< HEAD
=======
  return {
    status: "SIM_OK",
    risk: 0
  };

>>>>>>> 16015a8
}