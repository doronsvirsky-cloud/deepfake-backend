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

app.get("/", (req, res) => {
  res.json({ message: "Deepfake Backend Running 🚀" });
});
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    service: "Deepfake API",
    timestamp: new Date().toISOString()
  });
});
app.get("/db-check", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      status: "DB Connected",
      time: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      status: "DB Error",
      error
    });
  }
});
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
