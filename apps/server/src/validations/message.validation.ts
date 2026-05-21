export interface MediaAttachment {
  url: string;
  mediaType: "image" | "video" | "audio" | "file";
  fileName: string;
  sizeBytes: number;
}

export interface SendMessageInput {
  clientMid: string;
  body: string;
  media?: MediaAttachment[];
}

export interface MessageListQuery {
  beforeSeq?: number;
  limit: number;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MESSAGE_MEDIA_TYPES = ["image", "video", "audio", "file"] as const;

export function validateSendMessageInput(payload: unknown): SendMessageInput {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid payload");
  }

  const { clientMid, body, media } = payload as Record<string, unknown>;

  if (typeof clientMid !== "string" || !UUID_REGEX.test(clientMid.trim())) {
    throw new Error("clientMid must be a valid UUID");
  }

  if (
    typeof body !== "string" ||
    body.trim().length === 0 ||
    body.length > 5000
  ) {
    throw new Error("body must be between 1 and 5000 characters");
  }

  const validatedMedia =
    media === undefined ? undefined : validateMediaArray(media);

  return {
    clientMid: clientMid.trim(),
    body: body.trim(),
    media: validatedMedia,
  };
}

function validateMediaArray(media: unknown): MediaAttachment[] {
  if (!Array.isArray(media)) {
    throw new Error("media must be an array");
  }

  return media.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`media[${index}] must be an object`);
    }

    const { url, mediaType, fileName, sizeBytes } = item as Record<
      string,
      unknown
    >;

    if (typeof url !== "string" || url.trim().length === 0) {
      throw new Error(`media[${index}].url is required`);
    }

    if (
      typeof mediaType !== "string" ||
      !MESSAGE_MEDIA_TYPES.includes(mediaType as any)
    ) {
      throw new Error(
        `media[${index}].mediaType must be one of: ${MESSAGE_MEDIA_TYPES.join(", ")}`,
      );
    }

    if (typeof fileName !== "string" || fileName.trim().length === 0) {
      throw new Error(`media[${index}].fileName is required`);
    }

    if (
      typeof sizeBytes !== "number" ||
      !Number.isInteger(sizeBytes) ||
      sizeBytes < 0
    ) {
      throw new Error(
        `media[${index}].sizeBytes must be a non-negative integer`,
      );
    }

    return {
      url: url.trim(),
      mediaType: mediaType as MediaAttachment["mediaType"],
      fileName: fileName.trim(),
      sizeBytes,
    };
  });
}

export function validateEditMessageInput(payload: unknown): { body: string } {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid payload");
  }

  const { body } = payload as Record<string, unknown>;

  if (
    typeof body !== "string" ||
    body.trim().length === 0 ||
    body.length > 5000
  ) {
    throw new Error("body must be between 1 and 5000 characters");
  }

  return { body: body.trim() };
}

export function validateMessageListQuery(payload: unknown): MessageListQuery {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid query parameters");
  }

  const { before_seq, limit } = payload as Record<string, unknown>;

  const validated: MessageListQuery = {
    limit: 50,
  };

  if (before_seq !== undefined) {
    const parsedSeq = Number(before_seq);
    if (!Number.isFinite(parsedSeq) || parsedSeq <= 0) {
      throw new Error("before_seq must be a positive number");
    }
    validated.beforeSeq = Math.floor(parsedSeq);
  }

  if (limit !== undefined) {
    const parsedLimit = Number(limit);
    if (
      !Number.isFinite(parsedLimit) ||
      parsedLimit <= 0 ||
      parsedLimit > 100
    ) {
      throw new Error("limit must be a number between 1 and 100");
    }
    validated.limit = Math.floor(parsedLimit);
  }

  return validated;
}

export function validateMessageSeqParam(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid message seq parameter");
  }

  const { seq } = payload as Record<string, unknown>;
  const parsed = Number(seq);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Message seq must be a positive number");
  }

  return Math.floor(parsed);
}

export function validateReactionInput(payload: unknown): { emoji: string } {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid payload");
  }

  const { emoji } = payload as Record<string, unknown>;

  if (typeof emoji !== "string" || emoji.trim().length === 0 || emoji.length > 32) {
    throw new Error("emoji must be a non-empty string between 1 and 32 characters");
  }

  return { emoji: emoji.trim() };
}
