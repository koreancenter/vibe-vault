import { describe, it, expect } from 'vitest';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_IMAGE_EXTENSIONS,
  BANNED_EXTENSIONS,
  MAX_RAW_IMAGE_SIZE_BYTES,
  MAX_IMAGE_DIMENSION,
  validateImageFile,
  verifyImageMagicBytes,
  containsSvgOrHtmlSignatures,
  calculateTargetDimensions,
  extractImageFileFromClipboard,
  extractImageFileFromDataTransfer,
  ImageSanitizationError
} from '../src/imageSanitizer';

describe('Image Upload Pipeline Hardening & Anti-XSS (Item #4)', () => {
  describe('Constants & Security Parameters', () => {
    it('enforces 15MB size ceiling', () => {
      expect(MAX_RAW_IMAGE_SIZE_BYTES).toBe(15 * 1024 * 1024);
    });

    it('enforces 1280px bounding box constraint', () => {
      expect(MAX_IMAGE_DIMENSION).toBe(1280);
    });

    it('strictly whitelists only safe raster image MIME types', () => {
      expect(ALLOWED_IMAGE_MIME_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
      expect(ALLOWED_IMAGE_MIME_TYPES).not.toContain('image/svg+xml');
      expect(ALLOWED_IMAGE_MIME_TYPES).not.toContain('image/gif');
      expect(ALLOWED_IMAGE_MIME_TYPES).not.toContain('text/html');
    });

    it('bans SVG, script, and executable file extensions', () => {
      expect(BANNED_EXTENSIONS).toContain('.svg');
      expect(BANNED_EXTENSIONS).toContain('.svgz');
      expect(BANNED_EXTENSIONS).toContain('.html');
      expect(BANNED_EXTENSIONS).toContain('.xml');
      expect(BANNED_EXTENSIONS).toContain('.js');
      expect(BANNED_EXTENSIONS).toContain('.exe');
    });
  });

  describe('Magic Header Verification', () => {
    it('detects valid JPEG magic bytes (FF D8 FF)', () => {
      const jpegBuffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
      const result = verifyImageMagicBytes(jpegBuffer);
      expect(result.valid).toBe(true);
      expect(result.detectedFormat).toBe('jpeg');
    });

    it('detects valid PNG magic bytes (89 50 4E 47 0D 0A 1A 0A)', () => {
      const pngBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
      const result = verifyImageMagicBytes(pngBuffer);
      expect(result.valid).toBe(true);
      expect(result.detectedFormat).toBe('png');
    });

    it('detects valid WebP magic bytes (RIFF .... WEBP)', () => {
      const webpBuffer = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, // 'RIFF'
        0x20, 0x00, 0x00, 0x00, // file size
        0x57, 0x45, 0x42, 0x50, // 'WEBP'
        0x56, 0x50, 0x38, 0x20  // 'VP8 '
      ]);
      const result = verifyImageMagicBytes(webpBuffer);
      expect(result.valid).toBe(true);
      expect(result.detectedFormat).toBe('webp');
    });

    it('rejects truncated or non-image buffers', () => {
      const shortBuffer = new Uint8Array([0x01, 0x02, 0x03]);
      expect(verifyImageMagicBytes(shortBuffer).valid).toBe(false);

      const randomBuffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      expect(verifyImageMagicBytes(randomBuffer).valid).toBe(false);
    });
  });

  describe('Anti-XSS & Vector Signatures Inspection', () => {
    it('flags raw SVG tag markup', () => {
      const payload = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      expect(containsSvgOrHtmlSignatures(payload)).toBe(true);
    });

    it('flags XML prolog and script injections', () => {
      const xmlPayload = new TextEncoder().encode('<?xml version="1.0" standalone="no"?><!DOCTYPE svg PUBLIC ...>');
      expect(containsSvgOrHtmlSignatures(xmlPayload)).toBe(true);
    });

    it('flags HTML tags masquerading in image buffers', () => {
      const htmlPayload = new TextEncoder().encode('<html><body><script>document.cookie</script></body></html>');
      expect(containsSvgOrHtmlSignatures(htmlPayload)).toBe(true);
    });

    it('does not flag authentic binary JPEG buffers', () => {
      const jpegBuffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00, 0x11, 0x22, 0x33]);
      expect(containsSvgOrHtmlSignatures(jpegBuffer)).toBe(false);
    });
  });

  describe('File Validation (validateImageFile)', () => {
    it('rejects files exceeding the 15MB limit', async () => {
      const largeFile = new File([new Uint8Array(10)], 'receipt.jpg', { type: 'image/jpeg' });
      Object.defineProperty(largeFile, 'size', { value: 16 * 1024 * 1024 });

      const result = await validateImageFile(largeFile);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('FILE_TOO_LARGE');
      expect(result.error).toContain('15MB');
    });

    it('blocks .svg and .svgz uploads immediately', async () => {
      const svgFile = new File(['<svg></svg>'], 'exploit.svg', { type: 'image/svg+xml' });
      const result = await validateImageFile(svgFile);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SVG_XSS_DETECTED');
    });

    it('blocks disguised polyglot SVG files with .jpg extension', async () => {
      const polyglotBytes = new TextEncoder().encode('<?xml version="1.0"?><svg onload="alert(1)"></svg>');
      const disguisedFile = new File([polyglotBytes], 'photo.jpg', { type: 'image/jpeg' });

      const result = await validateImageFile(disguisedFile);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SVG_XSS_DETECTED');
    });

    it('blocks disallowed file extensions (e.g. .pdf, .exe, .html)', async () => {
      const pdfFile = new File(['%PDF-1.4'], 'document.pdf', { type: 'application/pdf' });
      const result = await validateImageFile(pdfFile);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('DISALLOWED_EXTENSION');
    });

    it('blocks disallowed MIME types even if extension is omitted or disguised', async () => {
      const fakeFile = new File([new Uint8Array(20)], 'mystery', { type: 'application/x-sh' });
      const result = await validateImageFile(fakeFile);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('DISALLOWED_MIME_TYPE');
    });

    it('accepts legitimate JPEG image files', async () => {
      const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01]);
      const validJpeg = new File([jpegHeader], 'receipt.jpg', { type: 'image/jpeg' });
      const result = await validateImageFile(validJpeg);
      expect(result.valid).toBe(true);
    });

    it('accepts legitimate PNG image files', async () => {
      const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
      const validPng = new File([pngHeader], 'screenshot.png', { type: 'image/png' });
      const result = await validateImageFile(validPng);
      expect(result.valid).toBe(true);
    });
  });

  describe('Dimension & Aspect Ratio Calculation', () => {
    it('preserves dimensions when image is within 1280px', () => {
      const { width, height, aspectRatio } = calculateTargetDimensions(800, 600, 1280);
      expect(width).toBe(800);
      expect(height).toBe(600);
      expect(aspectRatio).toBeCloseTo(800 / 600);
    });

    it('proportionately scales landscape images exceeding 1280px width', () => {
      const { width, height, aspectRatio } = calculateTargetDimensions(2560, 1440, 1280);
      expect(width).toBe(1280);
      expect(height).toBe(720);
      expect(aspectRatio).toBeCloseTo(2560 / 1440);
    });

    it('proportionately scales portrait receipts exceeding 1280px height', () => {
      const { width, height, aspectRatio } = calculateTargetDimensions(1080, 2160, 1280);
      expect(height).toBe(1280);
      expect(width).toBe(640);
      expect(aspectRatio).toBeCloseTo(1080 / 2160);
    });

    it('handles exact 1280x1280 square boundaries', () => {
      const { width, height } = calculateTargetDimensions(1280, 1280, 1280);
      expect(width).toBe(1280);
      expect(height).toBe(1280);
    });
  });

  describe('Clipboard and Drag-and-Drop Ingestion Helpers', () => {
    it('extracts image from clipboard items', () => {
      const dummyFile = new File([new Uint8Array(10)], 'pasted.png', { type: 'image/png' });
      const mockEvent = {
        clipboardData: {
          items: [
            { kind: 'string', type: 'text/plain', getAsFile: () => null },
            { kind: 'file', type: 'image/png', getAsFile: () => dummyFile }
          ],
          files: []
        }
      } as unknown as ClipboardEvent;

      const extracted = extractImageFileFromClipboard(mockEvent);
      expect(extracted).toBe(dummyFile);
    });

    it('returns null if clipboard does not contain any image', () => {
      const mockEvent = {
        clipboardData: {
          items: [
            { kind: 'string', type: 'text/plain', getAsFile: () => null }
          ],
          files: []
        }
      } as unknown as ClipboardEvent;

      const extracted = extractImageFileFromClipboard(mockEvent);
      expect(extracted).toBeNull();
    });

    it('extracts candidate image from DataTransfer', () => {
      const dummyFile = new File([new Uint8Array(10)], 'dropped.jpg', { type: 'image/jpeg' });
      const mockDataTransfer = {
        files: [dummyFile]
      } as unknown as DataTransfer;

      const extracted = extractImageFileFromDataTransfer(mockDataTransfer);
      expect(extracted).toBe(dummyFile);
    });

    it('returns null if DataTransfer only contains non-images', () => {
      const textFile = new File(['text'], 'notes.txt', { type: 'text/plain' });
      const mockDataTransfer = {
        files: [textFile]
      } as unknown as DataTransfer;

      const extracted = extractImageFileFromDataTransfer(mockDataTransfer);
      expect(extracted).toBeNull();
    });
  });
});
