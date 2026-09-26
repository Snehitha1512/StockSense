export function getPasswordResetEmailTemplate(otp: string): { html: string; text: string } {
  const text = `StockSense Password Reset

Your one-time password (OTP) for resetting your StockSense account password is:

${otp}

This code will expire in 10 minutes and can only be used once.
If you did not request a password reset, please ignore this email or contact your administrator immediately.

StockSense Inventory Management System
`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StockSense Password Reset</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background-color: #0f172a; padding: 28px 24px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .content { padding: 32px 28px; }
    .title { font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0; margin-bottom: 12px; }
    .message { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
    .otp-box { background-color: #f1f5f9; border: 1px dashed #6366f1; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0; }
    .otp-code { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #4f46e5; margin: 0; }
    .security-notice { font-size: 12px; color: #64748b; line-height: 1.5; border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 28px; }
    .footer { background-color: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>StockSense</h1>
    </div>
    <div class="content">
      <h2 class="title">Password Reset Code</h2>
      <p class="message">
        You requested to reset your password for your StockSense account. Use the one-time verification code below to complete the reset.
      </p>
      <div class="otp-box">
        <div class="otp-code">${otp}</div>
      </div>
      <p class="message" style="margin-bottom: 0;">
        <strong>Notice:</strong> This code is valid for <strong>10 minutes</strong> and can only be used once.
      </p>
      <div class="security-notice">
        If you did not request this password reset, please ignore this email. Your account remains secure and no changes have been made.
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} StockSense IMS &bull; Automated Security Notification
    </div>
  </div>
</body>
</html>
`;

  return { html, text };
}
