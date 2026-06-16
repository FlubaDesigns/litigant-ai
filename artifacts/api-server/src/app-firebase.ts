import express, { type Express } from "express";
import cors from "cors";
import router from "./routes/index-firebase.js";
import { initFirebaseAdmin } from "./lib/firebaseAdmin.js";

initFirebaseAdmin();

const app: Express = express();

app.use((req, _res, next) => {
  console.log(`[${req.method}] ${req.url?.split("?")[0]}`);
  next();
});

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
