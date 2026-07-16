export interface NotifyPayload {
  title: string;
  lines: string[];
}

export interface NotifyResult {
  sent: boolean;
  channels: string[];
  error?: string;
}

/**
 * Mengirim notifikasi lewat channel yang dikonfigurasi via env var:
 * - NOTIFY_WEBHOOK_URL: webhook generik, format {text: "..."} - kompatibel
 *   langsung dengan Slack/Discord/Mattermost incoming webhook, atau bisa
 *   diarahkan ke Zapier/Make untuk diteruskan ke WhatsApp/email/dsb.
 * - RESEND_API_KEY + NOTIFY_EMAIL_TO + NOTIFY_EMAIL_FROM: email langsung
 *   lewat Resend (resend.com, ada tier gratis).
 * Tidak ada satupun yang wajib diisi - kalau kosong semua, fungsi ini cuma
 * melaporkan "belum dikonfigurasi" tanpa error, supaya /api/notify-check
 * tetap bisa dipakai untuk sekadar mengecek temuan tanpa harus kirim kemana-mana.
 */
export async function sendNotification(payload: NotifyPayload): Promise<NotifyResult> {
  const channels: string[] = [];
  const errors: string[] = [];

  const webhookUrl = process.env.NOTIFY_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const text = `*${payload.title}*\n${payload.lines.map((l) => `- ${l}`).join("\n")}`;
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) channels.push("webhook");
      else errors.push(`Webhook error ${res.status}`);
    } catch (err) {
      errors.push(`Webhook gagal: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  const resendKey = process.env.RESEND_API_KEY;
  const emailTo = process.env.NOTIFY_EMAIL_TO;
  const emailFrom = process.env.NOTIFY_EMAIL_FROM;
  if (resendKey && emailTo && emailFrom) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: emailFrom, to: [emailTo], subject: payload.title, text: payload.lines.join("\n") }),
      });
      if (res.ok) channels.push("email");
      else errors.push(`Resend error ${res.status}`);
    } catch (err) {
      errors.push(`Email gagal: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  if (!webhookUrl && !(resendKey && emailTo && emailFrom)) {
    return { sent: false, channels: [], error: "Belum ada channel notifikasi dikonfigurasi (NOTIFY_WEBHOOK_URL atau RESEND_API_KEY+NOTIFY_EMAIL_TO+NOTIFY_EMAIL_FROM)." };
  }

  return { sent: channels.length > 0, channels, error: errors.length > 0 ? errors.join("; ") : undefined };
}
