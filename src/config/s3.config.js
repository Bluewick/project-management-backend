import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env.config.js";
import { ApiError } from "../utils/api_error.util.js";

let cached_s3_client = null;

export const ensure_s3_configured = () => {
  if (
    !env.aws_region ||
    !env.aws_s3_bucket ||
    !env.aws_access_key_id ||
    !env.aws_secret_access_key
  ) {
    throw new ApiError(
      503,
      "STORAGE_NOT_CONFIGURED",
      "Object storage is not configured on the server."
    );
  }
};

export const get_s3_client = () => {
  ensure_s3_configured();

  if (!cached_s3_client) {
    const client_config = {
      region: env.aws_region,
      forcePathStyle: env.aws_s3_force_path_style,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: env.aws_access_key_id,
        secretAccessKey: env.aws_secret_access_key,
      },
    };

    if (env.aws_s3_endpoint) {
      client_config.endpoint = env.aws_s3_endpoint;
    }

    cached_s3_client = new S3Client(client_config);
  }

  return cached_s3_client;
};

export const generate_presigned_put_url = async ({
  s3_key,
  mime_type,
  file_size,
}) => {
  const client = get_s3_client();
  const command = new PutObjectCommand({
    Bucket: env.aws_s3_bucket,
    Key: s3_key,
    ContentType: mime_type,
    ContentLength: file_size,
  });

  return getSignedUrl(client, command, {
    expiresIn: env.s3_presign_expires_seconds,
  });
};

export const generate_presigned_get_url = async (s3_key) => {
  const client = get_s3_client();
  const command = new GetObjectCommand({
    Bucket: env.aws_s3_bucket,
    Key: s3_key,
  });

  return getSignedUrl(client, command, {
    expiresIn: env.s3_presign_expires_seconds,
  });
};

export const head_s3_object = async (s3_key) => {
  const client = get_s3_client();
  const command = new HeadObjectCommand({
    Bucket: env.aws_s3_bucket,
    Key: s3_key,
  });

  return client.send(command);
};

export const upload_buffer_to_s3 = async ({ s3_key, mime_type, buffer }) => {
  const client = get_s3_client();
  const command = new PutObjectCommand({
    Bucket: env.aws_s3_bucket,
    Key: s3_key,
    Body: buffer,
    ContentType: mime_type,
    ContentLength: buffer.length,
  });

  await client.send(command);
};

export const delete_s3_object = async (s3_key) => {
  const client = get_s3_client();
  const command = new DeleteObjectCommand({
    Bucket: env.aws_s3_bucket,
    Key: s3_key,
  });

  await client.send(command);
};