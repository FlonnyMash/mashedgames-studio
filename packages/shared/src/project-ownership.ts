import {
  ClientProjectPayloadSchema,
  type ClientProjectPayload,
  type GameProjectManifest,
} from "./game-project";

export class UnauthorizedProjectAccessError extends Error {
  constructor(message = "Project ownership verification failed.") {
    super(message);
    this.name = "UnauthorizedProjectAccessError";
  }
}

export function isLegacyProjectManifest(manifest: GameProjectManifest): boolean {
  return !manifest.ownerId || !manifest.signature;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }

  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    normalized[key] = record[key];
  }
  return JSON.stringify(normalized);
}

export function buildProjectSignaturePayload(
  client: ClientProjectPayload,
  ownerId: string,
): string {
  const stripped = ClientProjectPayloadSchema.parse(client);
  return `${stableStringify(stripped)}${ownerId}`;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function importOwnerHmacKey(ownerId: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ownerId),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signProjectPayload(
  client: ClientProjectPayload,
  ownerId: string,
): Promise<string> {
  const message = buildProjectSignaturePayload(client, ownerId);
  const key = await importOwnerHmacKey(ownerId);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return bytesToHex(signature);
}

export async function verifyProjectSignature(
  client: ClientProjectPayload,
  ownerId: string,
  signature: string,
): Promise<boolean> {
  const message = buildProjectSignaturePayload(client, ownerId);
  const key = await importOwnerHmacKey(ownerId);
  const signatureBytes = new Uint8Array(signature.length / 2);
  for (let index = 0; index < signature.length; index += 2) {
    signatureBytes[index / 2] = Number.parseInt(
      signature.slice(index, index + 2),
      16,
    );
  }
  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(message),
  );
}

export async function assertProjectOwnership(
  manifest: Pick<GameProjectManifest, "ownerId" | "signature">,
  client: ClientProjectPayload,
  currentOwnerId?: string,
): Promise<void> {
  if (!manifest.ownerId || !manifest.signature) {
    throw new UnauthorizedProjectAccessError(
      "Project is missing ownership credentials.",
    );
  }

  if (currentOwnerId && manifest.ownerId !== currentOwnerId) {
    throw new UnauthorizedProjectAccessError(
      "Project belongs to a different user.",
    );
  }

  const valid = await verifyProjectSignature(
    client,
    manifest.ownerId,
    manifest.signature,
  );
  if (!valid) {
    throw new UnauthorizedProjectAccessError("Project signature is invalid.");
  }
}
