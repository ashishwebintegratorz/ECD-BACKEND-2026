// types/jsonwebtoken.d.ts
// Minimal ambient declarations so TypeScript stops complaining.
// This intentionally keeps things simple — it covers the small surface our app needs.
// If you later want fully typed jwt defs, you can remove this after ensuring
// the bundled types from jsonwebtoken are being picked up.

declare module "jsonwebtoken" {
  export type Secret = string | Buffer | { key: string } | Uint8Array;
  export type JwtPayload = { [key: string]: any };

  export interface SignOptions {
    algorithm?: string;
    expiresIn?: string | number;
    notBefore?: string | number;
    audience?: string | string[];
    issuer?: string;
    subject?: string;
    jwtid?: string;
    noTimestamp?: boolean;
    header?: { [k: string]: any };
  }

  export function sign(
    payload: string | object | Buffer,
    secretOrPrivateKey: Secret,
    options?: SignOptions
  ): string;

  export function verify<T = any>(
    token: string,
    secretOrPublicKey: Secret
  ): T;

  const jwt: {
    sign: typeof sign;
    verify: typeof verify;
    decode: (token: string) => any;
  };

  export default jwt;
}
