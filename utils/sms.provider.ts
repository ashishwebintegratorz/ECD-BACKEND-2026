export async function sendSms(phone: string, message: string): Promise<boolean> {
  console.log(`[SMS] ${phone} -> ${message}`);
  return true;
}
