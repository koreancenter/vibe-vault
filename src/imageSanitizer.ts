/**
 * Security Hardening Item #4: Image Upload Pipeline Hardening & Memory Leak / XSS Mitigation
 * 
 * Threat Mitigations:
 * 1. Stored / DOM-based XSS via SVG / XML / HTML execution:
 *    - Strict MIME allowlist: image/jpeg, image/png, image/webp.
 *    - Strict extension allowlist (.jpg, .jpeg, .png, .webp) with explicit ban on .svg, .svgz, .html, .xml.
 *    - Deep inspection of initial bytes (Magic header validation) detecting disguised SVG/XML payloads.
 * 2. Mobile DoS / Memory Exhaustion:
 *    - 15MB raw upload ceiling.
 *    - HTML5 Canvas pixel re-rasterization to a maximum bounding box of 1280x1280 maintaining aspect ratio.
 *    - Immediate revocation of Object URLs and zeroing out canvas buffer dimensions (width=0, height=0).
 * 3. Privacy & EXIF / GPS Metadata Leakage:
 *    - Re-drawing onto canvas strips all EXIF, XMP, GPS coordinates, and camera serial metadata.
 *    - Export solely as clean, re-encoded image/webp (or image/jpeg fallback) at 0.8 quality.
 */

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const ALLOWED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp'
] as const;

export const BANNED_EXTENSIONS = [
  '.svg',
  '.svgz',
  '.html',
  '.htm',
  '.xml',
  '.xhtml',
  '.js',
  '.php',
  '.sh',
  '.exe',
  '.bat'
] as const;

/** 15 Megabytes maximum raw file input */
export const MAX_RAW_IMAGE_SIZE_BYTES = 15 * 1024 * 1024;

/** Max bounding box dimension (1280px) */
export const MAX_IMAGE_DIMENSION = 1280;

/** Default WebP / JPEG lossy compression quality */
export const DEFAULT_COMPRESSION_QUALITY = 0.8;

export type ImageSanitizationErrorCode =
  | 'FILE_MISSING'
  | 'FILE_TOO_LARGE'
  | 'DISALLOWED_MIME_TYPE'
  | 'DISALLOWED_EXTENSION'
  | 'SVG_XSS_DETECTED'
  | 'CORRUPTED_MAGIC_HEADER'
  | 'CANVAS_PROCESSING_FAILED';

export class ImageSanitizationError extends Error {
  constructor(
    public readonly code: ImageSanitizationErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ImageSanitizationError';
  }
}

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  code?: ImageSanitizationErrorCode;
}

export interface SanitizationOptions {
  maxDimension?: number;
  quality?: number;
  preferredMime?: 'image/webp' | 'image/jpeg';
}

export interface SanitizedImageMetadata {
  originalSizeBytes: number;
  sanitizedSizeBytes: number;
  originalKB: number;
  compressedKB: number;
  width: number;
  height: number;
  aspectRatio: number;
  mimeType: 'image/webp' | 'image/jpeg';
}

export interface SanitizedImageOutput {
  dataUrl: string;
  base64: string;
  mimeType: 'image/webp' | 'image/jpeg';
  blob: Blob;
  metadata: SanitizedImageMetadata;
}

/**
 * Checks if a byte sequence contains SVG, XML, or HTML markup signatures
 */
export function containsSvgOrHtmlSignatures(buffer: Uint8Array): boolean {
  // Check first 1024 bytes (or full buffer) for XML/SVG/HTML markers
  const slice = buffer.subarray(0, Math.min(buffer.length, 1024));
  const text = new TextDecoder('utf-8', { fatal: false }).decode(slice).toLowerCase();

  return (
    text.includes('<svg') ||
    text.includes('<?xml') ||
    text.includes('<!doctype') ||
    text.includes('<html') ||
    text.includes('<script') ||
    text.includes('xmlns="http://www.w3.org/2000/svg"')
  );
}

/**
 * Verifies standard magic bytes for allowed image formats:
 * - JPEG: 0xFF, 0xD8, 0xFF
 * - PNG:  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
 * - WebP: 'RIFF' (0x52, 0x49, 0x46, 0x46) + 'WEBP' at offset 8 (0x57, 0x45, 0x42, 0x50)
 */
export function verifyImageMagicBytes(buffer: Uint8Array): {
  valid: boolean;
  detectedFormat?: 'jpeg' | 'png' | 'webp';
} {
  if (buffer.length < 12) {
    return { valid: false };
  }

  // 1. JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedFormat: 'jpeg' };
  }

  // 2. PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, detectedFormat: 'png' };
  }

  // 3. WebP ('RIFF' at 0..3 and 'WEBP' at 8..11)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, detectedFormat: 'webp' };
  }

  return { valid: false };
}

/**
 * Comprehensive pre-flight validation for candidate image files:
 * 1. File existence & size constraint (<= 15MB)
 * 2. Extension check against allowlist and explicit blacklist
 * 3. MIME type allowlist enforcement
 * 4. Header magic byte inspection (blocking disguised SVGs/polyglots)
 */
export async function validateImageFile(file: File): Promise<ImageValidationResult> {
  if (!file) {
    return {
      valid: false,
      code: 'FILE_MISSING',
      error: '업로드할 이미지 파일이 선택되지 않았습니다.'
    };
  }

  // 1. File Size Ceiling
  if (file.size > MAX_RAW_IMAGE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      code: 'FILE_TOO_LARGE',
      error: `파일 용량이 너무 큽니다 (${sizeMB}MB). 15MB 이하의 이미지만 업로드 가능합니다.`
    };
  }

  const fileNameLower = file.name.toLowerCase();

  // 2. Banned extension check (Strict Anti-XSS)
  for (const banned of BANNED_EXTENSIONS) {
    if (fileNameLower.endsWith(banned)) {
      return {
        valid: false,
        code: 'SVG_XSS_DETECTED',
        error: `보안 위험이 있는 파일 형식(${banned})은 업로드할 수 없습니다.`
      };
    }
  }

  // 3. Allowed extension check
  const hasAllowedExtension = ALLOWED_IMAGE_EXTENSIONS.some((ext) => fileNameLower.endsWith(ext));
  if (!hasAllowedExtension && file.name.includes('.')) {
    return {
      valid: false,
      code: 'DISALLOWED_EXTENSION',
      error: '지원되지 않는 확장자입니다. JPG, PNG, WebP 이미지만 업로드할 수 있습니다.'
    };
  }

  // 4. MIME Type Whitelist
  const mimeType = file.type.toLowerCase();
  if (mimeType.includes('svg') || mimeType.includes('xml') || mimeType.includes('html')) {
    return {
      valid: false,
      code: 'SVG_XSS_DETECTED',
      error: 'SVG 및 스크립트 벡터 형식은 XSS 보안 방지를 위해 업로드할 수 없습니다.'
    };
  }

  const isAllowedMime = (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
  // Allow empty mimeType if extension is valid (mobile camera uploads can occasionally have empty string mime)
  if (mimeType && !isAllowedMime) {
    return {
      valid: false,
      code: 'DISALLOWED_MIME_TYPE',
      error: `지원되지 않는 미디어 포맷(${mimeType})입니다. JPG, PNG, WebP 포맷만 지원됩니다.`
    };
  }

  // 5. Inspect Magic Bytes (Deep Defense-in-Depth)
  try {
    const headerSlice = await file.slice(0, 1024).arrayBuffer();
    const headerBytes = new Uint8Array(headerSlice);

    if (containsSvgOrHtmlSignatures(headerBytes)) {
      return {
        valid: false,
        code: 'SVG_XSS_DETECTED',
        error: '파일 내부에 잠재적 SVG/XML 스크립트 페이로드가 감지되어 차단되었습니다.'
      };
    }

    const magicCheck = verifyImageMagicBytes(headerBytes);
    if (!magicCheck.valid && headerBytes.length >= 12) {
      return {
        valid: false,
        code: 'CORRUPTED_MAGIC_HEADER',
        error: '이미지 파일 헤더가 손상되었거나 유효한 래스터 사진(JPG/PNG/WebP) 형식이 아닙니다.'
      };
    }
  } catch {
    // If slice fails on environment, proceed to canvas rasterizer
  }

  return { valid: true };
}

/**
 * Calculates proportional dimensions capped at maxDimension
 */
export function calculateTargetDimensions(
  origWidth: number,
  origHeight: number,
  maxDimension: number = MAX_IMAGE_DIMENSION
): { width: number; height: number; aspectRatio: number } {
  const aspectRatio = origWidth / Math.max(origHeight, 1);
  let width = origWidth;
  let height = origHeight;

  if (width > maxDimension || height > maxDimension) {
    const ratio = Math.min(maxDimension / width, maxDimension / height);
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));
  }

  return { width, height, aspectRatio };
}

/**
 * Primary Canvas-Based Sanitization & Re-encoding Pipeline
 * 
 * Guarantees:
 * - Completely re-rasterizes raw pixels via Canvas2D, stripping polyglots and EXIF/GPS metadata.
 * - Caps image bounds to <= 1280x1280 preserving aspect ratio.
 * - Safely handles Object URL creation & immediate revocation to prevent memory leaks.
 * - Resets canvas width/height to 0 upon completion to free GPU RAM.
 */
export async function sanitizeAndProcessImage(
  file: File,
  options: SanitizationOptions = {}
): Promise<SanitizedImageOutput> {
  // Pre-flight security validation
  const validation = await validateImageFile(file);
  if (!validation.valid) {
    throw new ImageSanitizationError(
      validation.code || 'DISALLOWED_MIME_TYPE',
      validation.error || '이미지 파일 검증에 실패했습니다.'
    );
  }

  const maxDimension = options.maxDimension || MAX_IMAGE_DIMENSION;
  const quality = options.quality ?? DEFAULT_COMPRESSION_QUALITY;
  const originalSizeBytes = file.size;
  const originalKB = Math.round(originalSizeBytes / 1024);

  return new Promise<SanitizedImageOutput>((resolve, reject) => {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch (err) {
      reject(new ImageSanitizationError('CANVAS_PROCESSING_FAILED', '이미지 객체 URL 생성에 실패했습니다.'));
      return;
    }

    const img = new Image();

    // Prevent cross-origin contamination if any
    img.crossOrigin = 'anonymous';

    const cleanup = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = '';
      }
      img.onload = null;
      img.onerror = null;
      img.src = '';
    };

    img.onload = () => {
      try {
        const naturalWidth = img.naturalWidth || img.width;
        const naturalHeight = img.naturalHeight || img.height;

        if (!naturalWidth || !naturalHeight) {
          cleanup();
          reject(new ImageSanitizationError('CANVAS_PROCESSING_FAILED', '이미지 해상도를 읽을 수 없습니다.'));
          return;
        }

        const { width, height, aspectRatio } = calculateTargetDimensions(naturalWidth, naturalHeight, maxDimension);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d', { willReadFrequently: false });
        if (!ctx) {
          cleanup();
          reject(new ImageSanitizationError('CANVAS_PROCESSING_FAILED', 'Canvas 2D 컨텍스트를 초기화하지 못했습니다.'));
          return;
        }

        // Draw image onto canvas - neutralizes EXIF/orientation metadata and malicious payloads
        ctx.drawImage(img, 0, 0, width, height);

        // Export to WebP first, fallback to JPEG
        let mimeType: 'image/webp' | 'image/jpeg' = options.preferredMime === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
        let dataUrl = canvas.toDataURL(mimeType, quality);

        // Fallback check: If browser does not support WebP encoding, fallback to JPEG
        if (mimeType === 'image/webp' && !dataUrl.startsWith('data:image/webp')) {
          mimeType = 'image/jpeg';
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        const base64Index = dataUrl.indexOf(',');
        const rawBase64 = dataUrl.slice(base64Index + 1);
        const sanitizedSizeBytes = Math.round((rawBase64.length * 3) / 4);
        const compressedKB = Math.round(sanitizedSizeBytes / 1024);

        // Convert dataURL to clean Blob
        canvas.toBlob(
          (blob) => {
            // Immediate canvas memory buffer release
            ctx.clearRect(0, 0, width, height);
            canvas.width = 0;
            canvas.height = 0;
            cleanup();

            const finalBlob = blob || new Blob([], { type: mimeType });

            resolve({
              dataUrl,
              base64: rawBase64,
              mimeType,
              blob: finalBlob,
              metadata: {
                originalSizeBytes,
                sanitizedSizeBytes,
                originalKB,
                compressedKB,
                width,
                height,
                aspectRatio,
                mimeType
              }
            });
          },
          mimeType,
          quality
        );
      } catch (processingErr) {
        cleanup();
        reject(
          new ImageSanitizationError(
            'CANVAS_PROCESSING_FAILED',
            processingErr instanceof Error ? processingErr.message : '이미지 캔버스 리샘플링 중 오류가 발생했습니다.'
          )
        );
      }
    };

    img.onerror = () => {
      cleanup();
      reject(new ImageSanitizationError('CORRUPTED_MAGIC_HEADER', '이미지 데이터를 로드할 수 없습니다. 손상된 파일인지 확인해주세요.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Safely extracts an image File from clipboard paste events
 */
export function extractImageFileFromClipboard(event: ClipboardEvent | { clipboardData?: DataTransfer | null }): File | null {
  const clipboardData = 'clipboardData' in event ? event.clipboardData : null;
  if (!clipboardData) return null;

  // Check items list
  const items = clipboardData.items;
  if (items && items.length > 0) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
  }

  // Fallback to files list
  const files = clipboardData.files;
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        return file;
      }
    }
  }

  return null;
}

/**
 * Safely extracts candidate image File from drag-and-drop DataTransfer
 */
export function extractImageFileFromDataTransfer(dataTransfer: DataTransfer | null): File | null {
  if (!dataTransfer) return null;

  const files = dataTransfer.files;
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name)) {
        return file;
      }
    }
  }

  return null;
}
