import { pool } from "../db/client";

interface DeviceRow {
  device_id: string;
}

export async function detectImpersonation(
  phone_number: string,
  device_id: string
) {

  try {

    if (!phone_number || !device_id) {

      return {
        status: "INVALID_REQUEST",
        risk: 50
      };

    }

    const result = await pool.query<DeviceRow>(
      `
      SELECT d.device_id
      FROM devices d
      JOIN phone_numbers p
        ON p.user_id = d.user_id
      WHERE p.e164_format = $1
      `,
      [phone_number]
    );

    /* =======================
       NUMBER NOT REGISTERED
    ======================= */

    if (result.rows.length === 0) {

      console.log("⚠ UNKNOWN NUMBER ATTEMPT:", phone_number);

      return {
        status: "UNKNOWN_NUMBER",
        risk: 30
      };

    }

    /* =======================
       KNOWN DEVICES
    ======================= */

    const knownDevices = result.rows.map((row) => row.device_id);

    /* =======================
       DEVICE MISMATCH
    ======================= */

    if (!knownDevices.includes(device_id)) {

      console.log("🚨 IMPERSONATION DETECTED");
      console.log("Number:", phone_number);
      console.log("Device used:", device_id);
      console.log("Known devices:", knownDevices);

      return {
        status: "IMPERSONATION_SUSPECTED",
        risk: 80
      };

    }

    /* =======================
       DEVICE MATCH
    ======================= */

    return {
      status: "DEVICE_MATCH",
      risk: 0
    };

  } catch (error) {

    console.error("Impersonation check failed:", error);

    return {
      status: "ERROR",
      risk: 50
    };

  }

}