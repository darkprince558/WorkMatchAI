import type { LocalImportSource } from '../../lib/imports/types';

const textEncoder = new TextEncoder();

interface TestXmlAttribute {
  name: string;
  localName: string;
  value: string;
}

class TestXmlElement {
  readonly children: TestXmlElement[] = [];
  readonly attributes: TestXmlAttribute[];
  private readonly textParts: string[] = [];

  constructor(readonly tagName: string, attributes: Array<{ name: string; value: string }> = []) {
    this.attributes = attributes.map((attribute) => ({
      name: attribute.name,
      localName: localName(attribute.name),
      value: decodeXml(attribute.value),
    }));
  }

  get localName() {
    return localName(this.tagName);
  }

  get textContent(): string {
    return [...this.textParts, ...this.children.map((child) => child.textContent ?? '')].join('');
  }

  appendChild(child: TestXmlElement) {
    this.children.push(child);
  }

  appendText(value: string) {
    this.textParts.push(decodeXml(value));
  }

  getAttribute(name: string) {
    return this.attributes.find((attribute) => attribute.name === name || attribute.localName === localName(name))?.value ?? null;
  }

  getElementsByTagName(name: string) {
    const matches: TestXmlElement[] = [];

    this.children.forEach((child) => {
      if (name === '*' || child.tagName === name || child.localName === localName(name)) matches.push(child);
      matches.push(...child.getElementsByTagName(name));
    });

    return matches;
  }
}

class TestXmlDocument {
  readonly children: TestXmlElement[] = [];

  appendChild(child: TestXmlElement) {
    this.children.push(child);
  }

  getElementsByTagName(name: string) {
    const matches: TestXmlElement[] = [];

    this.children.forEach((child) => {
      if (name === '*' || child.tagName === name || child.localName === localName(name)) matches.push(child);
      matches.push(...child.getElementsByTagName(name));
    });

    return matches;
  }
}

export function installDomParserShim() {
  if (typeof globalThis.DOMParser !== 'undefined') return;

  globalThis.DOMParser = class TestDomParser {
    parseFromString(text: string) {
      return parseTestXml(text) as unknown as Document;
    }
  } as unknown as typeof DOMParser;
}

export function textImportSource(name: string, content: string, mimeType?: string): LocalImportSource {
  return {
    name,
    mimeType,
    content,
    size: textEncoder.encode(content).byteLength,
  };
}

export function byteImportSource(name: string, content: Uint8Array, mimeType?: string): LocalImportSource {
  return {
    name,
    mimeType,
    content,
    size: content.byteLength,
  };
}

export function createXlsxFixture(rows: string[][], sheetName = 'Sheet1') {
  const sharedStrings: string[] = [];
  const sharedStringIndexes = new Map<string, number>();
  const cellXml = rows
    .map((row, rowIndex) => {
      const cells = row.map((value, columnIndex) => {
        const sharedStringIndex = getSharedStringIndex(value, sharedStrings, sharedStringIndexes);
        return `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="s"><v>${sharedStringIndex}</v></c>`;
      });

      return `<row r="${rowIndex + 1}">${cells.join('')}</row>`;
    })
    .join('');
  const sharedStringXml = sharedStrings.map((value) => `<si><t>${escapeXml(value)}</t></si>`).join('');

  return createUncompressedZip({
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships>
        <Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
      </Relationships>`,
    'xl/sharedStrings.xml': `<?xml version="1.0" encoding="UTF-8"?><sst>${sharedStringXml}</sst>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?><worksheet><sheetData>${cellXml}</sheetData></worksheet>`,
  });
}

export function createDocxTableFixture(rows: string[][]) {
  const tableXml = rows
    .map(
      (row) =>
        `<w:tr>${row
          .map((cell) => `<w:tc><w:p><w:r><w:t>${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`)
          .join('')}</w:tr>`
    )
    .join('');

  return createUncompressedZip({
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:tbl>${tableXml}</w:tbl></w:body>
      </w:document>`,
  });
}

export function createSelectableTextPdf(lines: string[]) {
  const operators = lines.map((line) => `(${escapePdfLiteral(line)}) Tj`).join('\n');
  const stream = `BT\n${operators}\nET`;
  const streamBytes = textEncoder.encode(stream);

  return textEncoder.encode(`%PDF-1.4
1 0 obj
<< /Length ${streamBytes.byteLength} >>
stream
${stream}
endstream
endobj
%%EOF`);
}

function parseTestXml(text: string) {
  const document = new TestXmlDocument();
  const stack: Array<TestXmlDocument | TestXmlElement> = [document];
  const tokens = text.match(/<[^>]+>|[^<]+/g) ?? [];

  tokens.forEach((token) => {
    if (token.startsWith('<?') || token.startsWith('<!--') || token.startsWith('<!')) return;

    if (token.startsWith('</')) {
      if (stack.length > 1) stack.pop();
      return;
    }

    if (token.startsWith('<')) {
      const selfClosing = /\/\s*>$/.test(token);
      const body = token.slice(1, selfClosing ? token.lastIndexOf('/') : -1).trim();
      const [tagName = '', ...rest] = body.split(/\s+/);
      const attributeText = rest.join(' ');
      const attributes = Array.from(attributeText.matchAll(/([^\s=]+)\s*=\s*"([^"]*)"/g)).map((match) => ({
        name: match[1],
        value: match[2],
      }));
      const element = new TestXmlElement(tagName, attributes);
      stack[stack.length - 1].appendChild(element);

      if (!selfClosing) stack.push(element);
      return;
    }

    const current = stack[stack.length - 1];
    if (current instanceof TestXmlElement) current.appendText(token);
  });

  return document;
}

function createUncompressedZip(entries: Record<string, string | Uint8Array>) {
  const localFileParts: Uint8Array[] = [];
  const centralDirectoryParts: Uint8Array[] = [];
  let offset = 0;

  Object.entries(entries).forEach(([name, value]) => {
    const nameBytes = textEncoder.encode(name);
    const data = typeof value === 'string' ? textEncoder.encode(value) : value;
    const checksum = crc32(data);
    const localHeader = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(data.byteLength),
      u32(data.byteLength),
      u16(nameBytes.byteLength),
      u16(0),
      nameBytes,
    ]);
    const centralDirectoryHeader = concatBytes([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(data.byteLength),
      u32(data.byteLength),
      u16(nameBytes.byteLength),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);

    localFileParts.push(localHeader, data);
    centralDirectoryParts.push(centralDirectoryHeader);
    offset += localHeader.byteLength + data.byteLength;
  });

  const centralDirectory = concatBytes(centralDirectoryParts);
  const endOfCentralDirectory = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(Object.keys(entries).length),
    u16(Object.keys(entries).length),
    u32(centralDirectory.byteLength),
    u32(offset),
    u16(0),
  ]);

  return concatBytes([...localFileParts, centralDirectory, endOfCentralDirectory]);
}

function getSharedStringIndex(value: string, sharedStrings: string[], indexes: Map<string, number>) {
  const existing = indexes.get(value);
  if (existing !== undefined) return existing;

  const index = sharedStrings.length;
  sharedStrings.push(value);
  indexes.set(value, index);
  return index;
}

function columnName(index: number) {
  let name = '';
  let current = index + 1;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }

  return name;
}

function concatBytes(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;

  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.byteLength;
  });

  return output;
}

function u16(value: number) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let current = index;

  for (let bit = 0; bit < 8; bit += 1) {
    current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  }

  return current >>> 0;
});

function crc32(bytes: Uint8Array) {
  let checksum = 0xffffffff;

  bytes.forEach((byte) => {
    checksum = crcTable[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  });

  return (checksum ^ 0xffffffff) >>> 0;
}

function localName(value: string) {
  return value.includes(':') ? value.split(':').pop() ?? value : value;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(value: string) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function escapePdfLiteral(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
