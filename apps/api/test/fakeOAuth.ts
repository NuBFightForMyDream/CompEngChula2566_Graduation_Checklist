// Google ปลอมสำหรับ test: อยู่ในโฟลเดอร์ test เท่านั้น โค้ดจริงไม่มีทางเลี่ยงการ login
import type { OAuthProfile, OAuthProvider } from "../src/modules/auth/oauth.ts";

export const fakeProfile = (code: string): OAuthProfile => ({
  sub: `sub-${code}`,
  email: `${code}@example.com`,
  name: `User ${code}`,
});

/** authPath คือหน้าที่แทนหน้า login ของ Google */
export function fakeOAuth(authPath = "https://accounts.example.test/auth"): OAuthProvider {
  return {
    createAuthUrl(state, codeVerifier) {
      const url = new URL(authPath, "http://localhost");
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge_source", codeVerifier);
      return url;
    },
    async exchangeCode(code) {
      if (code === "rejected-by-google") throw new Error("invalid_grant");
      return fakeProfile(code);
    },
  };
}
