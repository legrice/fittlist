import { getDb } from "./index";

getDb().then(() => { console.log("Database migrations applied."); process.exit(0); }).catch((error) => { console.error("Database migration failed", error); process.exit(1); });
