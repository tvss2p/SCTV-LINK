/**
 * crypto-util.js
 * ブラウザ標準の Web Crypto API (SubtleCrypto) だけを使った
 * AES-GCM + PBKDF2 の暗号化・復号ユーティリティ。
 * 外部ライブラリに依存しないため、社内ネットワーク等 CDN が使えない
 * 環境でも動作する。
 *
 * 保存形式: base64( salt(16byte) + iv(12byte) + ciphertext(+tag) )
 */
(function (global) {
  const PBKDF2_ITERATIONS = 100000;

  function bufToBase64(buf) {
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToBuf(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  async function deriveKey(password, salt, usage) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      [usage]
    );
  }

  async function encryptJSON(password, obj) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, "encrypt");
    const enc = new TextEncoder();
    const data = enc.encode(JSON.stringify(obj));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
    const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
    return bufToBase64(combined);
  }

  async function decryptJSON(password, base64Str) {
    const combined = base64ToBuf(base64Str);
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);
    const key = await deriveKey(password, salt, "decrypt");
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(plainBuf));
  }

  global.SctvCrypto = { encryptJSON, decryptJSON };
})(window);
