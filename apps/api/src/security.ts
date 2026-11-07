// นโยบายความปลอดภัยของหน้าเว็บ ใช้ร่วมกันทั้งตอนเสิร์ฟจาก API และตอนเสิร์ฟจาก CDN ของ Vercel

// อนุญาต inline style เพราะ React ใช้ style attribute กำหนดสีการ์ด ส่วนสคริปต์ต้องมาจากเว็บนี้เท่านั้น
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
