import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "10.10.80.51",
  port: Number(process.env.SMTP_PORT) || 26,
  secure: process.env.SMTP_SECURE === "true",
  tls: {
    rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED === "true"
  }
});
