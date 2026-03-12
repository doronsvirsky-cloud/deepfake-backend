import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { Pool } from "pg";
import crypto from "crypto";

import { evaluateDeviceReputation } from "./trust/deviceReputationEngine";
import { evaluateContinuousTrust } from "./trust/continuousTrustEngine";
import { detectImpersonation } from "./trust/impersonationEngine";
import { calculateDeviceTrustScore } from "./trust/deviceTrustScore";
import { verifyNumberOwnership } from "./trust/numberOwnershipEngine";
import { verifyDeviceIntegrity } from "./trust/deviceIntegrityEngine";
import { detectSimSwap } from "./trust/simSwapEngine";

import { evaluateRisk } from "./risk.service";

console.log("🚀 RUNNING SRC SERVER FILE");

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
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "deepfake",
});

pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch(err => console.error("DB ERROR:", err));

/* =======================
   ERROR LOGGER
======================= */

function logDbError(label: string, error: any) {

  console.log("================================");
  console.log(`❌ ${label}`);
  console.log("message:", error?.message);
  console.log("code:", error?.code);
  console.log("detail:", error?.detail);
  console.log("table:", error?.table);
  console.log("constraint:", error?.constraint);
  console.log("schema:", error?.schema);
  console.log("stack:", error?.stack);
  console.log("================================");

}

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
        error: "Missing fields"
      });

    }

    const result = await pool.query(
      `INSERT INTO users (full_name,national_id,email,status)
       VALUES ($1,$2,$3,'ACTIVE')
       RETURNING id`,
      [full_name, national_id, email]
    );

    res.json({
      user_id: result.rows[0].id
    });

  } catch (error: any) {

    logDbError("REGISTER USER ERROR", error);

    res.status(500).json({
      error: error?.message || "Register user failed"
    });

  }

});

/* =======================
   REGISTER DEVICE
======================= */

app.post("/register-device", async (req, res) => {

  try {

    const { user_id, device_id, public_key, sim_hash } = req.body;

    if (!user_id || !device_id || !public_key || !sim_hash) {

      return res.status(400).json({
        error: "Missing device fields"
      });

    }

    const result = await pool.query(
      `INSERT INTO devices
       (user_id,device_id,public_key,sim_hash,current_sim_hash)
       VALUES ($1,$2,$3,$4,$4)
       RETURNING id`,
      [user_id, device_id, public_key, sim_hash]
    );

    res.json({
      device_record_id: result.rows[0].id
    });

  } catch (error: any) {

    logDbError("REGISTER DEVICE ERROR", error);

    res.status(500).json({
      error: error?.message || "Register device failed"
    });

  }

});

/* =======================
   SERVER START
======================= */

const PORT = 3000;

app.listen(PORT, () => {

  console.log(`🚀 Core API running on port ${PORT}`);

});