import type { LocalImportSource } from './types';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');
const maxLocalImportBytes = 25 * 1024 * 1024;

export async function readSourceText(source: LocalImportSource): Promise<string> {
  if (typeof source.content === 'string') return assertTextLimit(source.content);
  if (source.text) return assertTextLimit(await source.text());

  const bytes = await readSourceBytes(source);
  return textDecoder.decode(bytes);
}

export async function readSourceBytes(source: LocalImportSource): Promise<Uint8Array> {
  if (source.content instanceof Uint8Array) return assertByteLimit(source.content);
  if (source.content instanceof ArrayBuffer) return assertByteLimit(new Uint8Array(source.content));
  if (typeof source.content === 'string') return assertByteLimit(textEncoder.encode(source.content));
  if (source.arrayBuffer) return assertByteLimit(new Uint8Array(await source.arrayBuffer()));
  if (source.text) return assertByteLimit(textEncoder.encode(await source.text()));

  return new Uint8Array();
}

function assertByteLimit(bytes: Uint8Array) {
  if (bytes.byteLength > maxLocalImportBytes) {
    throw new Error('Local import file exceeds the 25 MB parser limit.');
  }
  return bytes;
}

function assertTextLimit(text: string) {
  if (textEncoder.encode(text).byteLength > maxLocalImportBytes) {
    throw new Error('Local import file exceeds the 25 MB parser limit.');
  }
  return text;
}
