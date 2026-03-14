import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import cors from "cors";
import { Pool } from "pg";
import crypto from "crypto";
import net from "net";
import { Server } from "http";

import { evaluateDeviceReputation } from "./trust/deviceReputationEngine";
import { evaluateContinuousTrust } from "./trust/continuousTrustEngine";
import { detectImpersonation } from "./trust/impersonationEngine";
import { calculateDeviceTrustScore } from "./trust/deviceTrustScore";
import { verifyNumberOwnership } from "./trust/numberOwnershipEngine";
import { verifyDeviceIntegrity } from "./trust/deviceIntegrityEngine";
import { detectSimSwap } from "./trust/simSwapEngine";
import { verifyDeviceAttestation } from "./trust/deviceAttestationEngine";

import { evaluateRisk } from "./risk.service";

console.log("🚀 RUNNING SRC SERVER FILE");

/* =======================
   APP INIT
======================= */

const app = express();
app.use(cors());
app.use(express.json());

/* =======================
   DATABASE
======================= */

const pool = new Pool({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "deepfake",
});

pool
  .connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => console.error("DB ERROR:", err));

/* =======================
   PORT PROTECTION
======================= */

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once("error", () => resolve(false))
      .once("listening", () => {
        tester.close();
        resolve(true);
      })
      .listen(port);
  });
}

/* =======================
   HEALTH
======================= */

app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "OK",
    service: "Deepfake API",
    timestamp: new Date().toISOString(),
  });
});

/* =======================
   REGISTER USER
======================= */

app.post("/register-user", async (req: Request, res: Response) => {

  try {

    const { full_name, national_id, email } = req.body;

    if (!full_name || !national_id || !email) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const result = await pool.query(
      `INSERT INTO users(full_name,national_id,email,status)
       VALUES($1,$2,$3,'ACTIVE')
       RETURNING id`,
      [full_name, national_id, email]
    );

    res.json({ user_id: result.rows[0].id });

  } catch (err) {

    console.error("REGISTER USER ERROR", err);
    res.status(500).json({ error: "Register user failed" });

  }

});

/* =======================
   REGISTER DEVICE
======================= */

app.post("/register-device", async (req: Request, res: Response) => {

  try {

    const {
      user_id,
      device_id,
      public_key,
      sim_hash,
      phone_number,
      android_id,
      device_model
    } = req.body;

    if (!user_id || !device_id || !public_key || !sim_hash) {
      return res.status(400).json({ error: "Missing device fields" });
    }

    const result = await pool.query(
      `INSERT INTO devices
      (
        user_id,
        device_id,
        public_key,
        sim_hash,
        current_sim_hash,
        phone_number,
        android_id,
        device_model
      )
      VALUES($1,$2,$3,$4,$4,$5,$6,$7)
      RETURNING id`,
      [
        user_id,
        device_id,
        public_key,
        sim_hash,
        phone_number,
        android_id,
        device_model
      ]
    );

    res.json({
      device_record_id: result.rows[0].id
    });

  } catch (err) {

    console.error("REGISTER DEVICE ERROR", err);
    res.status(500).json({ error: "Register device failed" });

  }

});

/* =======================
   CALL SESSION INIT
======================= */

app.post("/call-init", async (req: Request, res: Response) => {

  try {

    const { caller_device_id, receiver_device_id, phone_number } = req.body;

    if (!caller_device_id || !receiver_device_id || !phone_number) {
      return res.status(400).json({ error: "Missing call fields" });
    }

    const session_id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO call_sessions
       (id,caller_device_id,receiver_device_id,phone_number,status)
       VALUES($1,$2,$3,$4,'PENDING')`,
      [session_id, caller_device_id, receiver_device_id, phone_number]
    );

    res.json({ session_id });

  } catch (err) {

    console.error("CALL INIT ERROR", err);
    res.status(500).json({ error: "Call init failed" });

  }

});

/* =======================
   CREATE CHALLENGE
======================= */

app.post("/create-challenge", async (req: Request, res: Response) => {

  try {

    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: "Missing session id" });
    }

    const challenge = crypto.randomBytes(32).toString("hex");

    const result = await pool.query(
      `UPDATE call_sessions
       SET challenge=$1,
           challenge_created_at=NOW()
       WHERE id=$2
       RETURNING id`,
      [challenge, session_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json({ challenge });

  } catch (err) {

    console.error("CREATE CHALLENGE ERROR", err);
    res.status(500).json({ error: "Challenge creation failed" });

  }

});

/* =======================
   VERIFY CHALLENGE
======================= */

app.post("/verify-challenge", async (req: Request, res: Response) => {

  const client = await pool.connect();

  try {

    const {
      session_id,
      device_id,
      signature,
      sim_hash,
      phone_number,
      user_id,
      attestation_cert
    } = req.body;

    if (!session_id || !device_id || !signature) {
      return res.status(400).json({ error: "Missing verification fields" });
    }

    await client.query("BEGIN");

    const session = await client.query(
      `SELECT * FROM call_sessions WHERE id=$1 FOR UPDATE`,
      [session_id]
    );

    if (!session.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Session not found" });
    }

    const row = session.rows[0];

    if (!row.challenge) {
      await client.query("ROLLBACK");
      return res.status(410).json({ error: "Challenge already used" });
    }

    const age =
      (Date.now() - new Date(row.challenge_created_at).getTime()) / 1000;

    if (age > 30) {
      await client.query("ROLLBACK");
      return res.status(410).json({ error: "Challenge expired" });
    }

    const device = await client.query(
      `
      SELECT
      public_key,
      phone_number,
      android_id,
      device_model,
      sim_hash
      FROM devices
      WHERE device_id=$1
      `,
      [device_id]
    );

    if (!device.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Device not found" });
    }

    const storedDevice = device.rows[0];

    if (storedDevice.phone_number && storedDevice.phone_number !== phone_number) {

      await client.query("ROLLBACK");

      return res.status(403).json({
        error: "Device binding violation: phone mismatch"
      });

    }

    /* ======================
       SIGNATURE VERIFY
    ====================== */

    const verifier = crypto.createVerify("SHA256");
    verifier.update(row.challenge);
    verifier.end();

    const verified = verifier.verify(
      storedDevice.public_key,
      signature,
      "base64"
    );

    if (!verified) {

      await client.query("ROLLBACK");
      return res.status(401).json({ error: "Invalid signature" });

    }

    /* ======================
       RACE CONDITION FIX
    ====================== */

    const update = await client.query(
      `UPDATE call_sessions
       SET status='VERIFIED',
           challenge=NULL
       WHERE id=$1
       AND status!='VERIFIED'
       RETURNING id`,
      [session_id]
    );

    if (!update.rows.length) {

      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Session already verified" });

    }

    /* ======================
       ATTESTATION
    ====================== */

    const attestation = await verifyDeviceAttestation(attestation_cert);

    await client.query(
      `UPDATE devices
       SET attestation_cert=$1,
           attestation_checked_at=NOW(),
           attestation_verified=$2
       WHERE device_id=$3`,
      [
        attestation_cert,
        attestation.status === "ATTESTATION_VALID",
        device_id
      ]
    );

    /* ======================
       SECURITY ENGINES
    ====================== */

    const integrity = await verifyDeviceIntegrity(device_id, sim_hash);
    const ownership = await verifyNumberOwnership(phone_number, device_id, sim_hash);
    const simSwap = await detectSimSwap(device_id, sim_hash);
    const impersonation = await detectImpersonation(phone_number, device_id);
    const reputation = await evaluateDeviceReputation(device_id);
    const continuous = await evaluateContinuousTrust(session_id, device_id);
    const trustScore = await calculateDeviceTrustScore(device_id);

    const risk = await evaluateRisk({
      user_id,
      device_id,
      phone_number,
      event_type: "CALL_VERIFICATION",
      risk_weight: 10,
    });

    await client.query("COMMIT");

    res.json({
      verified: true,
      attestation,
      integrity,
      ownership,
      simSwap,
      impersonation,
      reputation,
      continuous,
      trustScore,
      risk,
    });

  } catch (err) {

    await client.query("ROLLBACK");
    console.error("VERIFY ERROR", err);
    res.status(500).json({ error: "Verification failed" });

  } finally {

    client.release();

  }

});

/* =======================
   SERVER START
======================= */

const PORT = 3000;
let server: Server;

checkPort(PORT).then((available) => {

  if (!available) {
    console.error(`❌ Port ${PORT} already in use`);
    process.exit(1);
  }

  server = app.listen(PORT, () => {
    console.log(`🚀 Core API running on port ${PORT}`);
  });

});

/* =======================
   GRACEFUL SHUTDOWN
======================= */

async function shutdown(signal: string) {

  console.log(`⚠ ${signal} received. Graceful shutdown...`);

  if (server) {

    server.close(async () => {

      console.log("HTTP server closed");

      try {

        await pool.end();
        console.log("PostgreSQL connection closed");

      } catch (err) {

        console.error("DB close error", err);

      }

      process.exit(0);

    });

  }

}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);