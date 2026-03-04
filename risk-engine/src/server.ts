import express from "express";
import cors from "cors";
import dotenv from "dotenv";

console.log("RUNNING RISK ENGINE");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.post("/evaluate-risk", (req, res) => {
  const { user_id, device_id, phone_id, event_type, risk_weight } = req.body;

  console.log("Risk request received:", req.body);

  const baseScore = 50;
  const finalScore = baseScore + (risk_weight || 0);

  const classification =
    finalScore > 80 ? "BLOCKED"
    : finalScore > 60 ? "REVIEW"
    : "ALLOWED";

  res.json({
    score: finalScore,
    classification,
    event_type,
  });
});

const PORT = 4000;

app.listen(PORT, () => {
  console.log(`Risk Engine running on port ${PORT}`);
});