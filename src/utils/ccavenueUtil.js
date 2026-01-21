/**
 * CCAvenue Encryption/Decryption Utility
 * Uses AES-128-CBC encryption as required by CCAvenue
 */

import crypto from "crypto";

class CCavenueUtil {
  constructor(workingKey) {
    this.workingKey = workingKey;
  }

  /**
   * Generate MD5 hash of working key (used as encryption key)
   */
  _getKey() {
    return crypto.createHash("md5").update(this.workingKey).digest();
  }

  /**
   * Encrypt plain text using AES-128-CBC
   * @param {string} plainText - The text to encrypt
   * @returns {string} - Hex encoded encrypted string
   */
  encrypt(plainText) {
    const key = this._getKey();
    const iv = Buffer.from([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
      0x0c, 0x0d, 0x0e, 0x0f,
    ]);

    const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
    let encrypted = cipher.update(plainText, "utf8", "hex");
    encrypted += cipher.final("hex");

    return encrypted;
  }

  /**
   * Decrypt hex encoded string using AES-128-CBC
   * @param {string} encryptedText - Hex encoded encrypted string
   * @returns {string} - Decrypted plain text
   */
  decrypt(encryptedText) {
    const key = this._getKey();
    const iv = Buffer.from([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
      0x0c, 0x0d, 0x0e, 0x0f,
    ]);

    const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Convert order parameters object to URL encoded string
   * @param {Object} orderParams - Order parameters object
   * @returns {string} - URL encoded string
   */
  getEncryptedOrder(orderParams) {
    const paramString = Object.entries(orderParams)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value || "")}`
      )
      .join("&");

    return this.encrypt(paramString);
  }

  /**
   * Parse CCAvenue response to JSON object
   * @param {string} encryptedResponse - Encrypted response from CCAvenue
   * @returns {Object} - Parsed response object
   */
  redirectResponseToJson(encryptedResponse) {
    const decrypted = this.decrypt(encryptedResponse);
    const params = new URLSearchParams(decrypted);
    const result = {};

    for (const [key, value] of params) {
      result[key] = value;
    }

    return result;
  }
}

// Export singleton instance
let instance = null;

export const initCCAvenue = (workingKey) => {
  instance = new CCavenueUtil(workingKey);
  return instance;
};

export const getCCAvenue = () => {
  if (!instance) {
    throw new Error("CCAvenue not initialized. Call initCCAvenue first.");
  }
  return instance;
};

export default CCavenueUtil;
