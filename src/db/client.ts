import { Pool } from "pg";

export const pool = new Pool({
<<<<<<< HEAD
  connectionString: process.env.DATABASE_URL
=======
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "deepfake",
>>>>>>> 16015a8
});

