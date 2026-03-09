import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";
import crypto from "crypto";

console.log("RUNNING SRC SERVER FILE");

dotenv.config();

/* =======================
   APP INIT
======================= */

const app = express();
app.use(cors());
app.use(express.json());

/* =======================
   DATABASE CONNECTION
======================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect()
  .then(() => console.log("Connected to PostgreSQL"))
  .catch((err) => console.error("DB Connection Error:", err));

/* =======================
   HEALTH CHECK
======================= */

app.get("/health", (req, res) => {

  return res.json({
    status: "OK",
    service: "Deepfake API",
    timestamp: new Date().toISOString(),
  });

});

/* =======================
   REGISTER USER
======================= */

app.post("/register-user", async (req, res) => {

  try {

    const { full_name, national_id, email } = req.body;

    if (!full_name || !national_id || !email) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await pool.query(
      `INSERT INTO users (full_name, national_id, email)
       VALUES ($1,$2,$3)
       RETURNING id`,
      [full_name, national_id, email]
    );

    return res.json({
      user_id: result.rows[0].id
    });

  } catch (error:any) {

    console.error("Register user failed:", error.message);

    return res.status(500).json({
      error: "Register user failed"
    });

  }

});

/* =======================
   ADD PHONE NUMBER
======================= */

app.post("/add-phone-number", async (req, res) => {

  try {

    const { user_id, e164_format, is_primary } = req.body;

    if (!user_id || !e164_format) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const result = await pool.query(
      `INSERT INTO phone_numbers
       (user_id, e164_format, is_primary)
       VALUES ($1,$2,$3)
       RETURNING id`,
      [user_id, e164_format, is_primary || false]
    );

    return res.json({
      phone_record_id: result.rows[0].id
    });

  } catch (error:any) {

    console.error("Add phone number failed:", error.message);

    return res.status(500).json({
      error: "Add phone number failed"
    });

  }

});

/* =======================
   REGISTER DEVICE
======================= */

app.post("/register-device", async (req, res) => {

  try {

    const { user_id, device_id, public_key } = req.body;

    if (!user_id || !device_id || !public_key) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const result = await pool.query(
      `INSERT INTO devices
       (user_id, device_id, public_key)
       VALUES ($1,$2,$3)
       RETURNING id`,
      [user_id, device_id, public_key]
    );

    return res.json({
      device_record_id: result.rows[0].id
    });

  } catch (error:any) {

    console.error("Register device failed:", error.message);

    return res.status(500).json({
      error: "Register device failed"
    });

  }

});

/* =======================
   CALL INIT
======================= */

app.post("/call-init", async (req, res) => {

  try {

    const { caller_number, caller_device_id } = req.body;

    if (!caller_number || !caller_device_id) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const result = await pool.query(
      `INSERT INTO call_sessions
       (caller_number, caller_device_id, session_status)
       VALUES ($1,$2,'PENDING')
       RETURNING id`,
      [caller_number, caller_device_id]
    );

    return res.json({
      message: "Call initiation stored",
      session_id: result.rows[0].id
    });

  } catch (error:any) {

    console.error(error);

    return res.status(500).json({
      error: "Call init failed"
    });

  }

});

/* =======================
   AUTH START
======================= */

app.post("/auth-start", async (req, res) => {

  try {

    const { caller_number, receiver_number, receiver_device_id } = req.body;

    const result = await pool.query(
      `SELECT id
       FROM call_sessions
       WHERE caller_number=$1
       AND session_status='PENDING'
       ORDER BY created_at DESC
       LIMIT 1`,
      [caller_number]
    );

    if (result.rows.length === 0) {
      return res.json({
        message: "No matching call session"
      });
    }

    const session_id = result.rows[0].id;

    await pool.query(
      `UPDATE call_sessions
       SET receiver_number=$1,
           receiver_device_id=$2,
           session_status='CORRELATED'
       WHERE id=$3`,
      [receiver_number, receiver_device_id, session_id]
    );

    return res.json({
      message: "Call correlated",
      session_id
    });

  } catch (error:any) {

    console.error(error);

    return res.status(500).json({
      error: "Auth start failed"
    });

  }

});

/* =======================
   CREATE CHALLENGE
======================= */

app.post("/create-challenge", async (req, res) => {

  try {

    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: "Missing session_id" });
    }

    const challenge = crypto.randomUUID();

    await pool.query(
      `UPDATE call_sessions
       SET challenge=$1
       WHERE id=$2`,
      [challenge, session_id]
    );

    return res.json({
      challenge
    });

  } catch (error:any) {

    console.error(error);

    return res.status(500).json({
      error: "Challenge creation failed"
    });

  }

});

/* =======================
   VERIFY CHALLENGE
======================= */

app.post("/verify-challenge", async (req, res) => {

  try {

    const { session_id, device_id, signature, role } = req.body;

    if (!session_id || !device_id || !signature || !role) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const sessionResult = await pool.query(
      `SELECT challenge FROM call_sessions WHERE id=$1`,
      [session_id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const challenge = sessionResult.rows[0].challenge;

    const deviceResult = await pool.query(
      `SELECT public_key FROM devices WHERE device_id=$1`,
      [device_id]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: "Device not found" });
    }

    const publicKey = deviceResult.rows[0].public_key;

    const verifier = crypto.createVerify("SHA256");

    verifier.update(challenge);
    verifier.end();

    const verified = verifier.verify(publicKey, signature, "base64");

    if (!verified) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    if (role === "caller") {

      await pool.query(
        `UPDATE call_sessions
         SET caller_verified=true
         WHERE id=$1`,
        [session_id]
      );

    }

    if (role === "receiver") {

      await pool.query(
        `UPDATE call_sessions
         SET receiver_verified=true
         WHERE id=$1`,
        [session_id]
      );

    }

    const status = await pool.query(
      `SELECT caller_verified, receiver_verified
       FROM call_sessions
       WHERE id=$1`,
      [session_id]
    );

    const mutualAuth =
      status.rows[0].caller_verified &&
      status.rows[0].receiver_verified;

    if (mutualAuth) {

      await pool.query(
        `UPDATE call_sessions
         SET session_status='AUTHENTICATED'
         WHERE id=$1`,
        [session_id]
      );

    }

    return res.json({
      verified: true,
      mutual_authentication: mutualAuth
    });

  } catch (error) {

    console.error("Verify challenge error:", error);

    return res.status(500).json({
      error: "Verification failed"
    });

  }

});

/* =======================
   HEARTBEAT
======================= */

app.post("/heartbeat", async (req, res) => {

  try {

    const { session_id, device_id } = req.body;

    if (!session_id || !device_id) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const session = await pool.query(
      `SELECT id FROM call_sessions WHERE id=$1`,
      [session_id]
    );

    if (session.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    await pool.query(
      `UPDATE call_sessions
       SET last_heartbeat = NOW()
       WHERE id=$1`,
      [session_id]
    );

    return res.json({
      status: "heartbeat received"
    });

  } catch (error) {

    console.error("Heartbeat error:", error);

    return res.status(500).json({
      error: "Heartbeat failed"
    });

  }

});

/* =======================
   SERVER START
======================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {

  console.log(`Core API running on port ${PORT}`);

});