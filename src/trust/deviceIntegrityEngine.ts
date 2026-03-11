import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function verifyDeviceIntegrity(
  device_id: string,
  sim_hash: string
) {

  const result = await pool.query(
    `
    SELECT sim_hash, current_sim_hash
    FROM devices
    WHERE device_id = $1
    `,
    [device_id]
  );

  if (!result.rows.length) {

    return {
      status: "DEVICE_UNKNOWN",
      risk: 80
    };

  }

  const storedSim = result.rows[0].sim_hash;
  const currentSim = result.rows[0].current_sim_hash;

  if (sim_hash !== currentSim) {

    return {
      status: "SIM_MISMATCH",
      risk: 90
    };

  }

  if (storedSim !== currentSim) {

    return {
      status: "SIM_MOVED",
      risk: 85
    };

  }

  return {
    status: "DEVICE_INTEGRITY_OK",
    risk: 0
  };

}