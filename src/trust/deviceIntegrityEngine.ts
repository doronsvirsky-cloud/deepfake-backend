import { pool } from "../db/client";

export async function verifyDeviceIntegrity(
  device_id: string,
  sim_hash: string
) {

  console.log("🔐 DEVICE INTEGRITY CHECK");

  try {

    if (!device_id) {

      return {
        status: "INVALID_REQUEST",
        risk: 50
      };

    }

    const result = await pool.query(
      `
      SELECT sim_hash, current_sim_hash
      FROM devices
      WHERE device_id = $1
      `,
      [device_id]
    );

    /* =======================
       DEVICE NOT FOUND
    ======================= */

    if (!result.rows.length) {

      console.log("⚠ DEVICE UNKNOWN");

      return {
        status: "DEVICE_UNKNOWN",
        risk: 80
      };

    }

    const storedSim = result.rows[0].sim_hash;
    const currentSim = result.rows[0].current_sim_hash;

    /* =======================
       SIM HASH MISMATCH
    ======================= */

    if (sim_hash !== currentSim) {

      console.log("🚨 SIM HASH MISMATCH");

      return {
        status: "SIM_MISMATCH",
        risk: 90
      };

    }

    /* =======================
       SIM MOVED SINCE REGISTER
    ======================= */

    if (storedSim !== currentSim) {

      console.log("⚠ SIM MOVED FROM ORIGINAL DEVICE");

      return {
        status: "SIM_MOVED",
        risk: 85
      };

    }

    /* =======================
       DEVICE INTEGRITY OK
    ======================= */

    console.log("✅ DEVICE INTEGRITY OK");

    return {
      status: "DEVICE_INTEGRITY_OK",
      risk: 0
    };

  } catch (error) {

    console.error("Device integrity check failed:", error);

    return {
      status: "ERROR",
      risk: 50
    };

  }

}