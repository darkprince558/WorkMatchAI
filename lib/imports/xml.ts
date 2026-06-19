export function parseXml(text: string, label: string) {
  const document = new DOMParser().parseFromString(text, 'application/xml');
  const parserError = document.getElementsByTagName('parsererror')[0];

  if (parserError) {
    throw new Error(`Could not parse ${label} XML.`);
  }

  return document;
}

export function descendantsByLocalName(parent: Element | Document, localName: string) {
  return Array.from(parent.getElementsByTagName('*')).filter((element) => element.localName === localName);
}

export function directChildrenByLocalName(parent: Element, localName: string) {
  return Array.from(parent.children).filter((element) => element.localName === localName);
}

export function getAttrByLocalName(element: Element, localName: string) {
  return Array.from(element.attributes).find((attribute) => attribute.localName === localName)?.value;
}

export function getTextByLocalName(parent: Element | Document, localName: string) {
  return descendantsByLocalName(parent, localName)
    .map((element) => element.textContent ?? '')
    .join('');
}
