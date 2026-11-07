// คุยกับ Google ผ่าน interface นี้ ใน test จึงใช้ตัวปลอมได้โดยไม่ต้องมี flag พิเศษในโค้ดจริง

import { decodeIdToken, Google } from "arctic";
import { z } from "zod";

export interface OAuthProfile {
  sub: string;
  email: string;
  name: string;
}

export interface OAuthProvider {
  createAuthUrl(state: string, codeVerifier: string): URL;
  exchangeCode(code: string, codeVerifier: string): Promise<OAuthProfile>;
}

// ขอเท่าที่จำเป็น: ระบุตัวตน อีเมล และชื่อ ไม่ขอเข้าถึงข้อมูลอื่นใน Google
const SCOPES = ["openid", "email", "profile"];

const claimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().min(1),
  name: z.string().optional(),
});

export function googleProvider(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthProvider {
  const google = new Google(config.clientId, config.clientSecret, config.redirectUri);
  return {
    createAuthUrl: (state, codeVerifier) => google.createAuthorizationURL(state, codeVerifier, SCOPES),
    async exchangeCode(code, codeVerifier) {
      const tokens = await google.validateAuthorizationCode(code, codeVerifier);
      // id token มาจาก token endpoint ของ Google โดยตรงผ่าน TLS ตามมาตรฐาน OIDC จึงไม่ต้องตรวจลายเซ็นซ้ำ
      const claims = claimsSchema.parse(decodeIdToken(tokens.idToken()));
      return { sub: claims.sub, email: claims.email, name: claims.name ?? claims.email };
    },
  };
}
