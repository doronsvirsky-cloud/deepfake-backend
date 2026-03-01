import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const app = express();

app.use(cors());
app.use(express.json());

/* =======================
   BASIC ENDPOINTS
======================= */

app.get("/", (req, res) => {
  res.json({ message: "Deepfake Backend Running 🚀" });
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    service: "Deepfake API",
    timestamp: new Date().toISOString(),
  });
});

app.get("/db-check", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      status: "DB Connected",
      time: result.rows[0],
    });
  } catch (error: any) {
    res.status(500).json({
      status: "DB Error",
      error: error.message,
    });
  }
});

/* =======================
   USER REGISTRATION
======================= */

app.post("/register", async (req, res) => {
  try {
    const { full_name, email, national_id } = req.body;

    if (!full_name || !email || !national_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await pool.query(
      `
      INSERT INTO users (full_name, email, national_id)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [full_name, email, national_id]
    );

    res.status(201).json({
      status: "User registered",
      user: result.rows[0],
    });

  } catch (error: any) {
    console.error("Registration error:", error);
    res.status(500).json({
      error: "Registration failed",
      details: error.message,
    });
  }
});

/* =======================
   DEVICE REGISTRATION
======================= */

app.post("/register-device", async (req, res) => {
  try {
    const { user_id, device_id, public_key, sim_hash, android_id } = req.body;

    if (!user_id || !device_id || !public_key) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 1️⃣ לבדוק שהמשתמש קיים
    const userCheck = await pool.query(
      `SELECT id FROM users WHERE id = $1`,
      [user_id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // 2️⃣ לרשום את המכשיר
    const result = await pool.query(
      `
      INSERT INTO devices (user_id, device_id, public_key, sim_hash, android_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [user_id, device_id, public_key, sim_hash || null, android_id || null]
    );

    res.status(201).json({
      status: "Device registered",
      device: result.rows[0],
    });

  } catch (error: any) {
    console.error("Device registration error:", error);
    res.status(500).json({
      error: "Device registration failed",
      details: error.message,
    });
  }
});

/* =======================
   SERVER START
======================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});