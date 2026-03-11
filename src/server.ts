import { evaluateDeviceReputation } from "./trust/deviceReputationEngine";
import { evaluateContinuousTrust } from "./trust/continuousTrustEngine";
import { detectImpersonation } from "./trust/impersonationEngine";
import { calculateDeviceTrustScore } from "./trust/deviceTrustScore";
import { verifyNumberOwnership } from "./trust/numberOwnershipEngine";
import { verifyDeviceIntegrity } from "./trust/deviceIntegrityEngine";

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";
import crypto from "crypto";

import { evaluateRisk } from "./risk.service";

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
      `INSERT INTO users
      (full_name, national_id, email, status)
      VALUES ($1,$2,$3,'ACTIVE')
      RETURNING id`,
      [full_name, national_id, email]
    );

    res.json({
      user_id: result.rows[0].id
    });

  } catch (error:any) {

    console.error("REGISTER USER ERROR");
    console.error(error.message);
    console.error(error);

    res.status(500).json({
      error: "Register user failed",
      details: error.message
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
      (user_id, device_id, public_key, sim_hash, current_sim_hash)
      VALUES ($1,$2,$3,$4,$4)
      RETURNING id`,
      [user_id, device_id, public_key, sim_hash]
    );

    res.json({
      device_record_id: result.rows[0].id
    });

  } catch (error:any) {

    console.error("REGISTER DEVICE ERROR");
    console.error(error.message);
    console.error(error);

    res.status(500).json({
      error: "Register device failed",
      details: error.message
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
      (caller_number, caller_device_id, session_status)
      VALUES ($1,$2,'PENDING')
      RETURNING id`,
      [caller_number, caller_device_id]
    );

    res.json({
      session_id: result.rows[0].id
    });

  } catch (error:any) {

    console.error("CALL INIT ERROR");
    console.error(error.message);

    res.status(500).json({
      error: "Call init failed",
      details: error.message
    });

  }

});

/* =======================
   CREATE CHALLENGE
======================= */

app.post("/create-challenge", async (req, res) => {

  try {

    const { session_id } = req.body;

    const session = await pool.query(
      `SELECT caller_number, receiver_number
       FROM call_sessions
       WHERE id=$1`,
      [session_id]
    );

    if (!session.rows.length) {
      return res.status(404).json({
        error: "Session not found"
      });
    }

    const payload = {
      session_id,
      caller_number: session.rows[0].caller_number,
      receiver_number: session.rows[0].receiver_number,
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

  } catch (error:any) {

    console.error("CREATE CHALLENGE ERROR");
    console.error(error.message);

    res.status(500).json({
      error: "Challenge creation failed",
      details: error.message
    });

  }

});

/* =======================
   VERIFY CHALLENGE
======================= */

app.post("/verify-challenge", async (req, res) => {

  try {

    const { session_id, device_id, signature, sim_hash } = req.body;

    const sessionResult = await pool.query(
      `SELECT challenge, caller_device_id, receiver_device_id, caller_number
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

    const payload = JSON.parse(
      Buffer.from(session.challenge, "base64").toString()
    );

    if (Date.now() - payload.timestamp > 60000) {
      return res.status(400).json({
        error: "Challenge expired"
      });
    }

    const device = await pool.query(
      `SELECT public_key FROM devices WHERE device_id=$1`,
      [device_id]
    );

    if (!device.rows.length) {
      return res.status(404).json({
        error: "Device not found"
      });
    }

    const verifier = crypto.createVerify("SHA256");
    verifier.update(session.challenge);
    verifier.end();

    const verified = verifier.verify(
      device.rows[0].public_key,
      signature,
      "base64"
    );

    if (!verified) {
      return res.status(401).json({
        error: "Invalid signature"
      });
    }

    const numberOwnership = await verifyNumberOwnership(
      session.caller_number,
      device_id,
      sim_hash
    );

    if (numberOwnership.status !== "NUMBER_VERIFIED") {

      return res.status(403).json({
        error: "Number ownership verification failed",
        details: numberOwnership
      });

    }

    const integrity = await verifyDeviceIntegrity(
      device_id,
      sim_hash
    );

    if (integrity.status !== "DEVICE_INTEGRITY_OK") {

      return res.status(403).json({
        error: "Device integrity violation",
        details: integrity
      });

    }

    const reputation = await evaluateDeviceReputation(device_id);

    const impersonation = await detectImpersonation(
      session.caller_number,
      device_id
    );

    const risk = await evaluateRisk({
      session_id,
      device_id
    });

    const trustScore = await calculateDeviceTrustScore(device_id);

    await pool.query(
      `UPDATE call_sessions
       SET session_status='VERIFIED'
       WHERE id=$1`,
      [session_id]
    );

    res.json({
      verified: true,
      reputation,
      impersonation,
      risk,
      trust_score: trustScore.trust_score
    });

  } catch (error:any) {

    console.error("VERIFY CHALLENGE ERROR");
    console.error(error.message);

    res.status(500).json({
      error: "Verification failed",
      details: error.message
    });

  }

});

/* =======================
   HEARTBEAT
======================= */

app.post("/heartbeat", async (req, res) => {

  try {

    const { session_id, device_id } = req.body;

    const trust = await evaluateContinuousTrust(
      session_id,
      device_id
    );

    if (trust.status === "DEVICE_CHANGED") {
      return res.status(403).json({
        error: "Call takeover suspected"
      });
    }

    await pool.query(
      `UPDATE call_sessions
       SET last_heartbeat = NOW()
       WHERE id=$1`,
      [session_id]
    );

    res.json({ status: "SAFE" });

  } catch (error:any) {

    console.error("HEARTBEAT ERROR");
    console.error(error.message);

    res.status(500).json({
      error: "Heartbeat failed",
      details: error.message
    });

  }

});

/* =======================
   CALL TRUST STATUS
======================= */

app.get("/call-trust-status", async (req, res) => {

  try {

    const { session_id } = req.query;

    const session = await pool.query(
      `SELECT caller_device_id
       FROM call_sessions
       WHERE id=$1`,
      [session_id]
    );

    if (!session.rows.length) {
      return res.status(404).json({
        error: "Session not found"
      });
    }

    const device_id = session.rows[0].caller_device_id;

    const reputation = await evaluateDeviceReputation(device_id);
    const trustScore = await calculateDeviceTrustScore(device_id);

    const risk = await evaluateRisk({
      session_id,
      device_id
    });

    let trustLevel = "TRUSTED";

    if (risk.score > 70) trustLevel = "HIGH_RISK";
    else if (trustScore.trust_score < 40) trustLevel = "SUSPICIOUS";

    res.json({
      session_id,
      trust_level: trustLevel,
      device_reputation: reputation.level,
      risk_score: risk.score,
      trust_score: trustScore.trust_score
    });

  } catch (error:any) {

    console.error("CALL TRUST STATUS ERROR");
    console.error(error.message);

    res.status(500).json({
      error: "Trust status failed",
      details: error.message
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