import multer from "multer";
import { env } from "../config/env.config.js";
import { ApiError } from "../utils/api_error.util.js";

export const ALLOWED_ATTACHMENT_MIME_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "text/plain",
  "application/json",
  "application/pdf",
]);

const storage = multer.memoryStorage();

const file_filter = (req, file, cb) => {
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      ApiError.bad_request(
        `Unsupported file type '${file.mimetype}'. Allowed types: ${ALLOWED_ATTACHMENT_MIME_TYPES.join(", ")}.`,
        [],
        "UNSUPPORTED_MEDIA_TYPE"
      )
    );
  }
  return cb(null, true);
};

const multer_upload = multer({
  storage,
  limits: {
    fileSize: env.max_direct_upload_size_bytes,
    files: 1,
  },
  fileFilter: file_filter,
});

export const handle_single_file_upload = (req, res, next) => {
  const uploader = multer_upload.single("file");

  uploader(req, res, (err) => {
    if (!err) {
      if (!req.file) {
        return next(
          ApiError.bad_request(
            "A file upload under field 'file' is required.",
            [],
            "FILE_REQUIRED"
          )
        );
      }
      return next();
    }

    if (err instanceof ApiError) {
      return next(err);
    }

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(
          ApiError.bad_request(
            `Direct upload file size cannot exceed ${env.max_direct_upload_size_bytes} bytes.`,
            [],
            "FILE_TOO_LARGE"
          )
        );
      }
      return next(
        ApiError.bad_request(err.message, [], "FILE_UPLOAD_ERROR")
      );
    }

    return next(err);
  });
};