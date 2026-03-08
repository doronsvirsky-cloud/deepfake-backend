import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import { Pool } from "pg";
import { markDeviceCompromised } from "./trust/trustEngine";

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
  .then(() => {
    console.log("✅ Connected to PostgreSQL");
    console.log("DATABASE URL:", process.env.DATABASE_URL);
  })
  .catch((err) => console.error("❌ DB Connection Error:", err));

/* =======================
   HEALTH CHECK
======================= */

app.get("/health", (req, res) => {
  res.json({
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
      return res.status(400).json({
        error: "Missing required fields"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO users (full_name, national_id, email)
      VALUES ($1,$2,$3)
      RETURNING id
      `,
      [full_name, national_id, email]
    );

    return res.json({
      user_id: result.rows[0].id
    });

  } catch (error: any) {

    console.error("Register user failed:", error.message);

    return res.status(500).json({
      error: "Register user failed",
      details: error.message
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
      return res.status(400).json({
        error: "Missing required fields"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO phone_numbers
      (user_id, e164_format, is_primary)
      VALUES ($1,$2,$3)
      RETURNING id
      `,
      [user_id, e164_format, is_primary || false]
    );

    return res.json({
      phone_record_id: result.rows[0].id
    });

  } catch (error: any) {

    console.error("Add phone number failed:", error.message);

    return res.status(500).json({
      error: "Add phone number failed",
      details: error.message
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
      return res.status(400).json({
        error: "Missing required fields"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO devices
      (user_id, device_id, public_key)
      VALUES ($1,$2,$3)
      RETURNING id
      `,
      [user_id, device_id, public_key]
    );

    return res.json({
      device_record_id: result.rows[0].id
    });

  } catch (error: any) {

    console.error("Register device failed:", error.message);

    return res.status(500).json({
      error: "Register device failed"
    });

  }

});

/* =======================
   ADD SIM
======================= */

app.post("/add-sim", async (req, res) => {

  try {

    const { device_id, sim_hash } = req.body;

    if (!device_id || !sim_hash) {
      return res.status(400).json({
        error: "Missing fields"
      });
    }

    await pool.query(
      `
      INSERT INTO device_sims (device_id, sim_hash)
      VALUES ($1,$2)
      `,
      [device_id, sim_hash]
    );

    return res.json({
      status: "SIM added"
    });

  } catch (error: any) {

    console.error("Add SIM failed:", error.message);

    return res.status(500).json({
      error: "Add SIM failed"
    });

  }

});

/* =======================
   ADD TRUSTED CONTACT
======================= */

app.post("/add-trusted-contact", async (req, res) => {

  try {

    const { user_id, contact_name, phone_number } = req.body;

    if (!user_id || !phone_number) {
      return res.status(400).json({
        error: "Missing fields"
      });
    }

    await pool.query(
      `
      INSERT INTO trusted_contacts
      (user_id, contact_name, phone_number)
      VALUES ($1,$2,$3)
      `,
      [user_id, contact_name, phone_number]
    );

    return res.json({
      status: "Trusted contact added"
    });

  } catch (error: any) {

    console.error("Add trusted contact failed:", error.message);

    return res.status(500).json({
      error: "Add trusted contact failed"
    });

  }

});

/* =======================
   RISK ENGINE
======================= */

app.post("/evaluate-risk", async (req, res) => {

  console.log("REQUEST BODY:", req.body);

  try {

    const { user_id, device_id, sim_hash } = req.body;

    if (!user_id || !device_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const deviceResult = await pool.query(
      `
      SELECT id, sim_hash, current_sim_hash, trust_score
      FROM devices
      WHERE device_id = $1
      `,
      [device_id]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: "Device not found" });
    }

    const device = deviceResult.rows[0];

    const storedSimHash =
      device.current_sim_hash || device.sim_hash;

    let simSwapDetected = false;

    if (storedSimHash && sim_hash && storedSimHash !== sim_hash) {
      simSwapDetected = true;
    }

    let riskWeight = 0;

    try {

      const response = await axios.post(
        "http://localhost:4000/evaluate-risk",
        req.body
      );

      riskWeight = response.data?.score || 0;

    } catch {

      console.log("Risk engine offline → using base score");

    }

    if (simSwapDetected) {

      riskWeight += 40;

      await markDeviceCompromised(
        device_id,
        "SIM_SWAP_DETECTED"
      );

    }

    const eventType = simSwapDetected
      ? "SIM_SWAP"
      : "RISK_EVALUATION";

    const insertResult = await pool.query(
      `
      INSERT INTO risk_events
      (user_id, device_id, event_type, risk_weight, final_score, classification)
      VALUES ($1,$2,$3,$4,0,'PENDING')
      RETURNING id
      `,
      [user_id, device.id, eventType, riskWeight]
    );

    const eventId = insertResult.rows[0].id;

    const totalResult = await pool.query(
      `
      SELECT COALESCE(SUM(risk_weight),0) AS total
      FROM risk_events
      WHERE user_id = $1
      AND created_at > NOW() - INTERVAL '24 hours'
      `,
      [user_id]
    );

    const finalScore = Number(totalResult.rows[0].total);

    const trustScore = device.trust_score ?? 100;

    let classification = "ALLOW";

    if (finalScore >= 70 || trustScore <= 20)
      classification = "BLOCK";

    else if (finalScore >= 50 || trustScore <= 50)
      classification = "WARNING";

    let action = "ALLOW";

    if (classification === "BLOCK")
      action = "BLOCK";

    else if (classification === "WARNING")
      action = "STEP_UP";

    await pool.query(
      `
      UPDATE risk_events
      SET final_score = $1,
          classification = $2
      WHERE id = $3
      `,
      [finalScore, classification, eventId]
    );

    return res.json({
      simSwapDetected,
      riskWeight,
      finalScore,
      trustScore,
      classification,
      action
    });

  } catch (error: any) {

    console.error("Risk flow failed:", error.message);

    return res.status(500).json({
      error: "Risk flow failed",
      details: error.message,
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