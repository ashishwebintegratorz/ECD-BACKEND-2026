/**
 * AiSensy WhatsApp Business API — OTP Provider
 * Sends OTP via WhatsApp message using AiSensy campaign template
 *
 * Required .env variables:
 *   AISENSY_API_KEY=your_api_key
 *   AISENSY_CAMPAIGN_NAME=otp_verification
 */

const AISENSY_API_URL = "https://backend.aisensy.com/campaign/t1/api/v2";

export async function sendSms(phone: string, message: string): Promise<boolean> {
  const apiKey = process.env.AISENSY_API_KEY;
  const campaignName = process.env.AISENSY_CAMPAIGN_NAME || "otp_verification";

  // Fallback to console in development if key not set
  if (!apiKey) {
    console.log(`[OTP - DEV MODE] ${phone} -> ${message}`);
    return true;
  }

  // AiSensy expects phone in international format without +
  // Indian numbers: 9876543210 → 919876543210
  const formattedPhone = phone.startsWith("91") ? phone : `91${phone}`;

  // Extract OTP code from message (6-digit number)
  const otpMatch = message.match(/\d{6}/);
  const otpCode = otpMatch ? otpMatch[0] : message;

  try {
    const response = await fetch(AISENSY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey,
        campaignName,
        destination: formattedPhone,
        userName: "ECD KART",
        templateParams: [otpCode],   // passed into WhatsApp template variable {{1}}
        source: "ECD-KART-OTP",
        media: {},
        buttons: [],
        carouselCards: [],
        location: {},
      }),
    });

    const data = await response.json() as any;

    if (response.ok) {
      console.log(`[AiSensy] OTP sent to ${phone} via WhatsApp ✅`);
      return true;
    } else {
      console.error(`[AiSensy] Failed to send OTP to ${phone}:`, data);
      return false;
    }
  } catch (err) {
    console.error(`[AiSensy] Error sending OTP to ${phone}:`, err);
    return false;
  }
}
