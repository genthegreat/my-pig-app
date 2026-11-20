// Outgoing mail for password resets.
//
// With SMTP_URL set (smtp://user:pass@host:587 or smtps://…:465) mail goes
// out through that server. Without it there is nowhere to send to, so the
// reset link is printed to the server log instead — whoever runs the box can
// read it there (`docker compose logs app`) and pass it on.
export function createMailer({ smtpUrl = "", from = "" } = {}) {
  if (!smtpUrl) {
    console.warn("mail: SMTP_URL is not set — password reset links will be printed to this log instead of emailed.");
    return async ({ to, link }) => {
      console.log(`mail: password reset for ${to}\n      ${link}`);
    };
  }
  let transport;
  return async ({ to, subject, text, html }) => {
    if (!transport) {
      const { default: nodemailer } = await import("nodemailer");
      transport = nodemailer.createTransport(smtpUrl);
    }
    await transport.sendMail({ from: from || `My Pigs <${new URL(smtpUrl).username || "no-reply@localhost"}>`, to, subject, text, html });
  };
}
