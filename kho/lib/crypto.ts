import { requireEnv } from "./runtime";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array) {
  let value = "";
  bytes.forEach((byte) => (value += String.fromCharCode(byte)));
  return btoa(value);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function key() {
  const raw = fromBase64(requireEnv("ENCRYPTION_KEY"));
  if (raw.byteLength !== 32) throw new Error("ENCRYPTION_KEY phải là 32 byte dạng base64");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), encoder.encode(value));
  return { encryptedValue: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

export async function decryptSecret(encryptedValue: string, iv: string) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    await key(),
    fromBase64(encryptedValue),
  );
  return decoder.decode(plain);
}
