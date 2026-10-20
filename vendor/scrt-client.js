/*! @scrt-link/client 0.0.11 - MIT License - (c) stophe */
// ../core/src/constants.ts
var MASTER_PASSWORD_LENGTH = 36;
var SECRET_ID_LENGTH = 28;

// ../core/src/crypto.ts
var getRandomBytes = (length = 16) => crypto.getRandomValues(new Uint8Array(length));
var blobToBase64 = async (blob) => {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:application/octet-stream;base64,${btoa(binary)}`;
};
var encodeText = (text) => {
  const encoder = new TextEncoder();
  return encoder.encode(text);
};
var generateRandomUrlSafeString = (length = 36) => {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const specialCharacters = "$~-_.";
  const charset = [...letters, ...numbers, ...specialCharacters];
  const values = getRandomBytes(length);
  return Array.from(values, (v) => charset[v % charset.length]).join("");
};
var sha256Hash = async (message) => {
  const buffer = await crypto.subtle.digest("SHA-256", encodeText(message));
  return Array.prototype.map.call(new Uint8Array(buffer), (x) => ("00" + x.toString(16)).slice(-2)).join("");
};
var binaryToBase64 = (arrayBuffer) => {
  const arrayBufferToString = (buffer) => String.fromCharCode(...new Uint8Array(buffer));
  return btoa(arrayBufferToString(arrayBuffer));
};
var encryptData = async (data, cryptoKey, salt) => {
  const iv = getRandomBytes();
  const result = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, data);
  const encryptedBlob = new Blob([salt, iv, result]);
  return encryptedBlob;
};
var generateKeyFromPassword = async (password) => {
  const salt = getRandomBytes();
  const passwordKey = await crypto.subtle.importKey("raw", encodeText(password), "PBKDF2", false, [
    "deriveKey"
  ]);
  const cryptoKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 1e5,
      hash: "SHA-256"
    },
    passwordKey,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt"]
  );
  return {
    cryptoKey,
    salt
  };
};
var encryptString = async (text, password) => {
  const data = encodeText(text).buffer;
  const { cryptoKey, salt } = await generateKeyFromPassword(password);
  const encryptedData = await encryptData(data, cryptoKey, salt);
  const encryptedDataBase64 = await blobToBase64(encryptedData);
  return encryptedDataBase64;
};
var generateKeyPair = async () => await crypto.subtle.generateKey(
  {
    name: "ECDSA",
    namedCurve: "P-384"
  },
  true,
  ["sign", "verify"]
);
var pemHeader = "-----BEGIN PUBLIC KEY-----";
var pemFooter = "-----END PUBLIC KEY-----";
var exportPublicKey = async (key) => {
  const exported = await crypto.subtle.exportKey("spki", key);
  const exportedAsBase64 = binaryToBase64(exported);
  const pemExported = `${pemHeader}
${exportedAsBase64}
${pemFooter}`;
  return pemExported;
};

// ../core/src/enums.ts
var SecretType = /* @__PURE__ */ ((SecretType2) => {
  SecretType2["TEXT"] = "text";
  SecretType2["FILE"] = "file";
  SecretType2["REDIRECT"] = "redirect";
  SecretType2["SNAP"] = "snap";
  SecretType2["NEOGRAM"] = "neogram";
  return SecretType2;
})(SecretType || {});

// ../core/src/units.ts
var MIN = 1e3 * 60;
var DAY = 24 * 60 * MIN;

// src/index.ts
var PROTOCOL = "https";
var DEFAULT_HOST = "scrt.link";
var scrtLink = (apiKey) => {
  if (!apiKey) {
    throw new Error("API key is required");
  }
  const createSecret = async (secret, options = {}) => {
    const {
      secretType = "text" /* TEXT */,
      password,
      publicNote,
      expiresIn = 7 * DAY,
      viewLimit = 1,
      host = DEFAULT_HOST
    } = options;
    let encryptedContent = secret;
    let encryptedMeta = JSON.stringify({
      secretType
    });
    const masterKey = generateRandomUrlSafeString(MASTER_PASSWORD_LENGTH);
    const keyPair = await generateKeyPair();
    const secretIdSubstring = masterKey.substring(SECRET_ID_LENGTH);
    const secretIdHash = await sha256Hash(secretIdSubstring);
    const publicKey = await exportPublicKey(keyPair.publicKey);
    if (password) {
      encryptedMeta = await encryptString(encryptedMeta, password);
      encryptedContent = await encryptString(encryptedContent, password);
    }
    encryptedMeta = await encryptString(encryptedMeta, masterKey);
    encryptedContent = await encryptString(encryptedContent, masterKey);
    const body = JSON.stringify({
      secretIdHash,
      meta: encryptedMeta,
      content: encryptedContent,
      publicKey,
      publicNote,
      expiresIn,
      viewLimit,
      password
    });
    const checksum = await sha256Hash(body);
    const res = await fetch(`${PROTOCOL}://${host}/api/v1/secrets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Checksum": checksum,
        ...host ? { "X-Host": host } : {}
      },
      body
    });
    const data = await res.json();
    if (!res.ok) {
      return data;
    }
    const secretLink = `${PROTOCOL}://${host}/s#${masterKey}`;
    return { secretLink, ...data };
  };
  return {
    createSecret
  };
};
var index_default = scrtLink;
export {
  SecretType,
  index_default as default,
  scrtLink
};
