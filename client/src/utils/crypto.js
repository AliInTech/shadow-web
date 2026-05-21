/**
 * client/src/utils/crypto.js
 * Cryptographic engine using the native Web Crypto API (AES-GCM 256-bit)
 */

// Helper to convert raw text strings into Uint8Arrays
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Derives a deterministic cryptographic key from the active room name string.
 * Uses PBKDF2 with a static salt to ensure both clients derive the exact same key.
 */
async function deriveRoomKey(roomName) {
  const passwordBuffer = textEncoder.encode(roomName);
  
  // Static salt used to anchor room-specific derivations
  const salt = textEncoder.encode("shadow_mesh_network_salt_2026");

  // Import raw room passphrase into temporary key material
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // Derive the absolute AES-GCM 256-bit key from the temporary material
  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, // Key is non-extractable for runtime security
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a cleartext string payload using the derived room key.
 * Returns an object containing the ciphertext and initialization vector (IV).
 */
export async function encryptPayload(plainText, roomName) {
  try {
    const cryptoKey = await deriveRoomKey(roomName);
    
    // Generate a unique 12-byte Initialization Vector (IV) for this specific message packet
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedPayload = textEncoder.encode(plainText);

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      cryptoKey,
      encodedPayload
    );

    // Convert binary array buffers to standard transmission strings
    return {
      cipherText: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
      iv: btoa(String.fromCharCode(...iv))
    };
  } catch (err) {
    console.error("❌ Cryptographic Encryption Fault:", err);
    throw err;
  }
}

/**
 * Decrypts a secure ciphertext payload back into legible cleartext.
 */
export async function decryptPayload(cipherTextBase64, ivBase64, roomName) {
  try {
    const cryptoKey = await deriveRoomKey(roomName);
    
    // Reconstruct binary arrays from received transmission strings
    const encryptedData = new Uint8Array(
      atob(cipherTextBase64).split("").map((c) => c.charCodeAt(0))
    );
    const iv = new Uint8Array(
      atob(ivBase64).split("").map((c) => c.charCodeAt(0))
    );

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      cryptoKey,
      encryptedData
    );

    return textDecoder.decode(decryptedBuffer);
  } catch (err) {
    // Throws automatically if the cryptographic keys don't match (wrong room or altered packet)
    console.warn("⚠️ Cryptographic Decryption Failed (Malformed packet or structural key mismatch)");
    return "🚨 [UNABLE TO DECRYPT: Cryptographic signature mismatch] 🚨";
  }
}