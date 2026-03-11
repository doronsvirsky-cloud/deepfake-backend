import { pool } from "../db/client";

export async function evaluateContinuousTrust(
  session_id: string,
  device_id: string
) {

  const session = await pool.query(
    `
    SELECT caller_device_id, receiver_device_id
    FROM call_sessions
    WHERE id = $1
    `,
    [session_id]
  );

  if (!session.rows.length) {

    return {
      status: "SESSION_NOT_FOUND",
      risk: 50
    };

  }

  const { caller_device_id, receiver_device_id } = session.rows[0];

  if (device_id !== caller_device_id && device_id !== receiver_device_id) {

    return {
      status: "DEVICE_CHANGED",
      risk: 90
    };

  }

  return {
    status: "SESSION_TRUSTED",
    risk: 0
  };

}