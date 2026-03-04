import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import { Pool } from "pg";

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
    timestamp: new Date().toISOString(),
  });
});

/* =======================
   RISK ENGINE
======================= */

app.post("/evaluate-risk", async (req, res) => {
  try {
    console.log("REQUEST BODY:", req.body);

    const { user_id, device_id, sim_hash } = req.body;

    console.log("DEVICE RECEIVED:", device_id);
    console.log("DEVICE TYPE:", typeof device_id);

    if (!user_id || !device_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    /* =======================
       FETCH DEVICE
    ======================= */

    const deviceResult = await pool.query(
      `SELECT device_id, sim_hash, current_sim_hash
       FROM devices
       WHERE TRIM(LOWER(device_id)) = TRIM(LOWER($1))`,
      [device_id]
    );

    console.log("DEVICE QUERY RESULT:", deviceResult.rows);

    if (deviceResult.rows.length === 0) {
      console.log("❌ Device lookup failed for:", device_id);
      return res.status(404).json({ error: "Device not found" });
    }

    const device = deviceResult.rows[0];

    const storedSimHash =
      device.current_sim_hash || device.sim_hash;

    let simSwapDetected = false;

    if (storedSimHash && sim_hash && storedSimHash !== sim_hash) {
      simSwapDetected = true;
    }

    /* =======================
       CALL RISK ENGINE
    ======================= */

    let riskWeight = 0;

    try {
      const response = await axios.post(
        "http://localhost:4000/evaluate-risk",
        req.body
      );

      riskWeight = response.data?.score || 0;

    } catch (err) {
      console.log("Risk engine offline, using base score");
    }

    if (simSwapDetected) {
      riskWeight += 40;

      console.log("⚠️ SIM SWAP DETECTED for device:", device_id);
    }

    const eventType = simSwapDetected
      ? "SIM_SWAP"
      : "RISK_EVALUATION";

    /* =======================
       STORE EVENT
    ======================= */

    const insertResult = await pool.query(
      `INSERT INTO risk_events
       (user_id, device_id, event_type, risk_weight, final_score, classification)
       VALUES ($1,$2,$3,$4,0,'PENDING')
       RETURNING id`,
      [user_id, device_id, eventType, riskWeight]
    );

    const eventId = insertResult.rows[0].id;

    /* =======================
       CALCULATE 24H WINDOW
    ======================= */

    const totalResult = await pool.query(
      `SELECT COALESCE(SUM(risk_weight),0) AS total
       FROM risk_events
       WHERE user_id = $1
       AND created_at > NOW() - INTERVAL '24 hours'`,
      [user_id]
    );

    const finalScore = Number(totalResult.rows[0].total);

    let classification = "ALLOW";

    if (finalScore >= 70) classification = "BLOCK";
    else if (finalScore >= 50) classification = "WARNING";

    /* =======================
       UPDATE EVENT
    ======================= */

    await pool.query(
      `UPDATE risk_events
       SET final_score = $1,
           classification = $2
       WHERE id = $3`,
      [finalScore, classification, eventId]
    );

    /* =======================
       UPDATE CURRENT SIM
    ======================= */

    if (sim_hash) {
      await pool.query(
        `UPDATE devices
         SET current_sim_hash = $1,
             last_seen_at = NOW()
         WHERE TRIM(LOWER(device_id)) = TRIM(LOWER($2))`,
        [sim_hash, device_id]
      );
    }

    /* =======================
       RESPONSE
    ======================= */

    return res.status(200).json({
      simSwapDetected,
      riskWeight,
      finalScore,
      classification,
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

app.listen(PORT, () => {
  console.log(`Core API running on port ${PORT}`);
});