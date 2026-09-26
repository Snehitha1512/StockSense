import nodemailer from "nodemailer";
import { getPasswordResetEmailTemplate } from "./emailTemplates";

export interface SentEmailRecord {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  timestamp: number;
}

// In-memory test mailbox strictly for automated test suites
const testMailbox: SentEmailRecord[] = [];

export function getTestMailbox(): SentEmailRecord[] {
  return [...testMailbox];
}

export function clearTestMailbox(): void {
  testMailbox.length = 0;
}

export function isEmailConfigured(): boolean {
  if (process.env.EMAIL_TEST_MODE === "true") {
    return true;
  }
  const host = process.env.EMAIL_HOST || process.env.EMAIL_SERVER_HOST;
  const user = process.env.EMAIL_USER || process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_PASSWORD || process.env.EMAIL_SERVER_PASSWORD;
  return Boolean(host && user && pass);
}

export async function sendPasswordResetEmail(toEmail: string, otp: string): Promise<void> {
  const isTestMode = process.env.EMAIL_TEST_MODE === "true";
  const { html, text } = getPasswordResetEmailTemplate(otp);
  const from = process.env.EMAIL_FROM || "StockSense Security <no-reply@stocksense.com>";
  const subject = "StockSense Password Reset Verification Code";

  if (isTestMode) {
    // Record in test mailbox for assertion without logging OTP to console
    testMailbox.push({
      to: toEmail,
      from,
      subject,
      text,
      html,
      timestamp: Date.now(),
    });
    return;
  }

  const host = process.env.EMAIL_HOST || process.env.EMAIL_SERVER_HOST;
  const portStr = process.env.EMAIL_PORT || process.env.EMAIL_SERVER_PORT;
  const port = portStr ? parseInt(portStr, 10) : 587;
  const user = process.env.EMAIL_USER || process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_PASSWORD || process.env.EMAIL_SERVER_PASSWORD;
  const secureStr = process.env.EMAIL_SECURE || process.env.EMAIL_SERVER_SECURE;
  const secure = secureStr === "true" || port === 465;

  if (!host || !user || !pass) {
    throw new Error("Email service is not configured. Configure the email environment variables to enable OTP delivery.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  await transporter.sendMail({
    from,
    to: toEmail,
    subject,
    text,
    html,
  });
}
