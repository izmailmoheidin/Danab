import nodemailer from "nodemailer";

type MailConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

function getMailConfig(): MailConfig {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || "465");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!user || !pass || !from) {
    throw new Error(
      "SMTP_USER, SMTP_PASS, and SMTP_FROM must be configured for admin OTP email delivery",
    );
  }

  return { host, port, user, pass, from };
}

function createTransporter() {
  const config = getMailConfig();
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

export function maskEmail(email: string): string {
  const [localPart, domain = ""] = email.split("@");
  const visibleStart = localPart.slice(0, 2);
  const visibleEnd = localPart.slice(-1);
  const maskedLocal =
    localPart.length <= 3
      ? `${localPart[0] || ""}***`
      : `${visibleStart}${"*".repeat(Math.max(2, localPart.length - 3))}${visibleEnd}`;
  return `${maskedLocal}@${domain}`;
}

export async function sendAdminOtpEmail({
  to,
  username,
  otpCode,
  expiresMinutes,
}: {
  to: string;
  username: string;
  otpCode: string;
  expiresMinutes: number;
}) {
  const transporter = createTransporter();
  const config = getMailConfig();

  await transporter.sendMail({
    from: config.from,
    to,
    subject: "Danab Admin Login OTP",
    text: [
      `Hello ${username},`,
      "",
      `Your Danab admin OTP is: ${otpCode}`,
      `This code expires in ${expiresMinutes} minutes.`,
      "",
      "If you did not attempt to log in, please change your password immediately.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <h2 style="margin-bottom: 12px;">Danab Admin Login OTP</h2>
        <p>Hello <strong>${username}</strong>,</p>
        <p>Your one-time login code is:</p>
        <div style="font-size: 30px; letter-spacing: 6px; font-weight: 700; margin: 18px 0; color: #2563eb;">
          ${otpCode}
        </div>
        <p>This code expires in <strong>${expiresMinutes} minutes</strong>.</p>
        <p>If you did not attempt to log in, please change your password immediately.</p>
      </div>
    `,
  });
}
