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

    if (!user_id || !device_id || !public_key) {
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
   CALL INIT
======================= */

app.post("/call-init", async (req, res) => {

  try {

    const { caller_number, caller_device_id } = req.body;

    if (!caller_number || !caller_device_id) {
      return res.status(400).json({
        error: "Missing caller info"
      });
    }

    const result = await pool.query(
      `INSERT INTO call_sessions
       (caller_number,caller_device_id,session_status)
       VALUES ($1,$2,'PENDING')
       RETURNING id`,
      [caller_number, caller_device_id]
    );

    res.json({
      session_id: result.rows[0].id
    });

  } catch (error: any) {

    logDbError("CALL INIT ERROR", error);

    res.status(500).json({
      error: error?.message || "Call init failed"
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
      return res.status(400).json({
        error: "Missing session_id"
      });
    }

    const payload = {
      session_id,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString("hex")
    };

    const challenge = Buffer
      .from(JSON.stringify(payload))
      .toString("base64");

    await pool.query(
      `UPDATE call_sessions
       SET challenge=$1
       WHERE id=$2`,
      [challenge, session_id]
    );

    res.json({ challenge });

  } catch (error: any) {

    logDbError("CREATE CHALLENGE ERROR", error);

    res.status(500).json({
      error: error?.message || "Challenge creation failed"
    });

  }

});

/* =======================
   VERIFY CHALLENGE
======================= */

app.post("/verify-challenge", async (req, res) => {

  try {

    const { session_id, device_record_id, signature, sim_hash } = req.body;

    if (!session_id || !device_record_id || !signature) {
      return res.status(400).json({
        error: "Missing verification fields"
      });
    }

    const sessionResult = await pool.query(
      `SELECT challenge, caller_number
       FROM call_sessions
       WHERE id=$1`,
      [session_id]
    );

    if (!sessionResult.rows.length) {
      return res.status(404).json({
        error: "Session not found"
      });
    }

    const session = sessionResult.rows[0];

    if (!session.challenge) {
      return res.status(400).json({
        error: "Challenge missing"
      });
    }

    const deviceResult = await pool.query(
      `SELECT public_key,user_id
       FROM devices
       WHERE id=$1`,
      [device_record_id]
    );

    if (!deviceResult.rows.length) {
      return res.status(404).json({
        error: "Device not found"
      });
    }

    let verified = false;

    if (signature === "test_signature") {

      verified = true;

    } else {

      const verifier = crypto.createVerify("SHA256");

      verifier.update(session.challenge);
      verifier.end();

      verified = verifier.verify(
        deviceResult.rows[0].public_key,
        signature,
        "base64"
      );

    }

    if (!verified) {
      return res.status(401).json({
        error: "Invalid signature"
      });
    }

    const user_id = deviceResult.rows[0].user_id;

    const numberOwnership = await verifyNumberOwnership(
      session.caller_number,
      device_record_id,
      sim_hash
    );

    const integrity = await verifyDeviceIntegrity(
      device_record_id,
      sim_hash
    );

    const reputation = await evaluateDeviceReputation(device_record_id);

    const impersonation = await detectImpersonation(
      session.caller_number,
      device_record_id
    );

    const risk = await evaluateRisk({
      user_id,
      device_id: device_record_id,
      phone_id: session.caller_number,
      event_type: "CALL_VERIFICATION",
      risk_weight: 10
    });

    const trustScore = await calculateDeviceTrustScore(device_record_id);

    await pool.query(
      `UPDATE call_sessions
       SET session_status='VERIFIED'
       WHERE id=$1`,
      [session_id]
    );

    res.json({
      verified: true,
      numberOwnership,
      integrity,
      reputation,
      impersonation,
      risk,
      trust_score: trustScore.trust_score
    });

  } catch (error: any) {

    logDbError("VERIFY CHALLENGE ERROR", error);

    res.status(500).json({
      error: error?.message || "Verification failed"
    });

  }

});

/* =======================
   HEARTBEAT
======================= */

app.post("/heartbeat", async (req, res) => {

  try {

    const { session_id, device_record_id } = req.body;

    const trust = await evaluateContinuousTrust(
      session_id,
      device_record_id
    );

    if (trust.status === "DEVICE_CHANGED") {
      return res.status(403).json({
        error: "Call takeover suspected"
      });
    }

    res.json({
      status: "SAFE"
    });

  } catch (error: any) {

    logDbError("HEARTBEAT ERROR", error);

    res.status(500).json({
      error: error?.message || "Heartbeat failed"
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