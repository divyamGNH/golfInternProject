import dotenv from "dotenv";
import { query } from "./client.js";
import { schemaSql } from "./schema.js";

dotenv.config();

const connectDB = async () => {
  try {
    await query("SELECT 1");
    await query(schemaSql);
    console.log("Postgres connected successfully ✅");
  } catch (error) {
    console.error("Postgres connection failed ❌", error);
    process.exit(1);
  }
};

export default connectDB;
