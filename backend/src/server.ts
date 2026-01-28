import express from "express";
import cors from "cors";
import sessionsRouter from "./routes/sessions";
import reportRouter from "./routes/report";
import authRouter from "./routes/auth";

const app = express();
const PORT = 4001;

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("Worktime API OK");
});

app.use("/api/auth", authRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/report", reportRouter);

app.listen(PORT, () => {
  console.log(`API démarrée sur http://localhost:${PORT}`);
});

