import { pool } from "../db/client";

export async function evaluateContinuousTrust(
  session_id: string,
  device_id: string
) {

  try {

    if (!session_id || !device_id) {

      return {
        status: "INVALID_REQUEST",
        risk: 50
      };

    }

    const session = await pool.query(
      `
      SELECT caller_device_id, receiver_device_id
      FROM call_sessions
      WHERE id = $1
      `,
      [session_id]
    );

    /* =======================
       SESSION NOT FOUND
    ======================= */

    if (!session.rows.length) {

      console.log("⚠ SESSION NOT FOUND:", session_id);

      return {
        status: "SESSION_NOT_FOUND",
        risk: 50
      };

    }

    const { caller_device_id, receiver_device_id } = session.rows[0];

    /* =======================
       DEVICE CHANGED
    ======================= */

    if (device_id !== caller_device_id && device_id !== receiver_device_id) {

      console.log("🚨 DEVICE CHANGED DURING SESSION");
      console.log("Session:", session_id);
      console.log("Device used:", device_id);
      console.log("Caller device:", caller_device_id);
      console.log("Receiver device:", receiver_device_id);

      return {
        status: "DEVICE_CHANGED",
        risk: 90
      };

    }

    /* =======================
       SESSION TRUSTED
    ======================= */

    return {
      status: "SESSION_TRUSTED",
      risk: 0
    };

  } catch (error) {

    console.error("Continuous trust check failed:", error);

    return {
      status: "ERROR",
      risk: 50
    };

  }

}