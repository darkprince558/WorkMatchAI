const zipLocalFileHeaderSignature = 0x04034b50;
const zipCentralDirectorySignature = 0x02014b50;
const zipEndOfCentralDirectorySignature = 0x06054b50;
const maxZipEntries = 2048;
const maxZipEntryBytes = 15 * 1024 * 1024;
const maxZipTotalUncompressedBytes = 50 * 1024 * 1024;

export interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export class ZipParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipParseError';
  }
}

export async function readZipEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
  const entries = new Map<string, Uint8Array>();
  let cursor = centralDirectoryOffset;
  let totalUncompressedSize = 0;

  if (entryCount > maxZipEntries) {
    throw new ZipParseError(`ZIP contains too many entries (${entryCount}).`);
  }

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(cursor, true) !== zipCentralDirectorySignature) {
      throw new ZipParseError('Invalid ZIP central directory.');
    }

    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const name = decodeAscii(bytes.subarray(cursor + 46, cursor + 46 + fileNameLength));
    const normalizedName = normalizeZipPath(name);

    totalUncompressedSize += uncompressedSize;
    if (compressedSize > bytes.byteLength || uncompressedSize > maxZipEntryBytes || totalUncompressedSize > maxZipTotalUncompressedBytes) {
      throw new ZipParseError('ZIP entry size exceeds WorkMatch parser limits.');
    }

    entries.set(
      normalizedName,
      await readEntryData(bytes, {
        name,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      })
    );

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

export function getZipText(entries: Map<string, Uint8Array>, path: string) {
  const entry = entries.get(normalizeZipPath(path));
  if (!entry) return undefined;
  return new TextDecoder('utf-8').decode(entry);
}

async function readEntryData(bytes: Uint8Array, entry: ZipEntry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cursor = entry.localHeaderOffset;

  if (view.getUint32(cursor, true) !== zipLocalFileHeaderSignature) {
    throw new ZipParseError(`Invalid ZIP local file header for ${entry.name}.`);
  }

  const fileNameLength = view.getUint16(cursor + 26, true);
  const extraLength = view.getUint16(cursor + 28, true);
  const dataStart = cursor + 30 + fileNameLength + extraLength;
  const compressed = bytes.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return compressed;
  if (entry.compressionMethod === 8) return inflate(compressed, 'deflate-raw');

  throw new ZipParseError(`ZIP entry ${entry.name} uses unsupported compression method ${entry.compressionMethod}.`);
}

export async function inflate(bytes: Uint8Array, format: 'deflate' | 'deflate-raw' = 'deflate') {
  if (typeof DecompressionStream === 'undefined') {
    throw new ZipParseError('This browser does not support built-in decompression streams.');
  }

  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream(format as CompressionFormat));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function findEndOfCentralDirectory(view: DataView) {
  const minOffset = Math.max(0, view.byteLength - 65557);

  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === zipEndOfCentralDirectorySignature) return offset;
  }

  throw new ZipParseError('ZIP end-of-central-directory record was not found.');
}

function decodeAscii(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
}

function normalizeZipPath(path: string) {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').includes('..')) {
    throw new ZipParseError(`Unsafe ZIP entry path: ${path}.`);
  }
  return normalized;
}
