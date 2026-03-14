import { pool } from "../db/client";

export async function verifyNumberOwnership(
  caller_number: string,
  device_id: string,
  sim_hash: string
) {

  console.log("📞 NUMBER OWNERSHIP CHECK");

  try {

    if (!caller_number || !device_id) {

      return {
        status: "INVALID_REQUEST",
        risk: 40
      };

    }

    /* =======================
       FIND OWNER OF NUMBER
    ======================= */

    const result = await pool.query(
      `
      SELECT d.device_id
      FROM devices d
      JOIN phone_numbers p
        ON p.user_id = d.user_id
      WHERE p.e164_format = $1
      `,
      [caller_number]
    );

    if (result.rows.length === 0) {

      console.log("⚠ NUMBER NOT REGISTERED");

      return {
        status: "NUMBER_NOT_REGISTERED",
        risk: 30
      };

    }

    const allowedDevices = result.rows.map((r) => r.device_id);

    /* =======================
       DEVICE MATCH
    ======================= */

    if (!allowedDevices.includes(device_id)) {

      console.log("🚨 NUMBER OWNERSHIP FAILED");

      return {
        status: "NUMBER_DEVICE_MISMATCH",
        risk: 70
      };

    }

    /* =======================
       SIM HASH CHECK
    ======================= */

    if (!sim_hash) {

      return {
        status: "NUMBER_NOT_VERIFIED",
        risk: 20
      };

    }

    console.log("✅ NUMBER OWNERSHIP VERIFIED");

    return {
      status: "NUMBER_VERIFIED",
      risk: 0
    };

  } catch (error) {

    console.error("Number ownership check failed:", error);

    return {
      status: "ERROR",
      risk: 40
    };

  }

}