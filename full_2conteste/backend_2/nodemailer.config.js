// backend/nodemailer.config.js
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

export async function sendMail(opts) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    // Non configurato: simulate success (non bloccare)
    console.warn('sendMail: SMTP not configured, skipping send');
    return;
  }
  return transporter.sendMail(opts);
}
