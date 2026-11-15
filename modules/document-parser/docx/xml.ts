export type OrderedNode = Record<string, unknown>;

export function tagName(node: OrderedNode): string | null {
  for (const key of Object.keys(node)) {
    if (key !== ":@" && key !== "#text") return key;
  }
  return null;
}

export function nodeChildren(node: OrderedNode, tag?: string): OrderedNode[] {
  const key = tag ?? tagName(node);
  if (!key) return [];
  const value = node[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is OrderedNode => Boolean(item) && typeof item === "object");
}

export function firstChild(node: OrderedNode, tag: string): OrderedNode | null {
  return nodeChildren(node, tag)[0] ?? null;
}

export function childrenNamed(node: OrderedNode, tag: string): OrderedNode[] {
  return nodeChildren(node, tag);
}

export function attributes(node: OrderedNode): Record<string, string> {
  const value = node[":@"];
  if (!value || typeof value !== "object") return {};
  const output: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
      output[key.replace(/^@_/, "")] = String(raw);
    }
  }
  return output;
}

export function getAttribute(node: OrderedNode | null, name: string): string | null {
  if (!node) return null;
  const attrs = attributes(node);
  return attrs[name] ?? null;
}

export function nodeText(node: OrderedNode): string {
  let text = "";
  for (const [key, value] of Object.entries(node)) {
    if (key === ":@" || key === "#text") continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === "object") {
          text += nodeText(child as OrderedNode);
        }
      }
    }
  }
  const direct = node["#text"];
  if (typeof direct === "string" || typeof direct === "number") text += String(direct);
  return text;
}

export function textOfChild(node: OrderedNode | null, tag: string): string {
  if (!node) return "";
  const child = firstChild(node, tag);
  return child ? nodeText(child) : "";
}

export function walkNodes(nodes: OrderedNode[], visit: (node: OrderedNode) => void): void {
  for (const node of nodes) {
    visit(node);
    const tag = tagName(node);
    if (!tag) continue;
    walkNodes(nodeChildren(node, tag), visit);
  }
}

export function findDescendant(nodes: OrderedNode[], tag: string): OrderedNode | null {
  for (const node of nodes) {
    if (tagName(node) === tag) return node;
    const tagValue = tagName(node);
    if (!tagValue) continue;
    const found = findDescendant(nodeChildren(node, tagValue), tag);
    if (found) return found;
  }
  return null;
}
