import { Schema } from "effect";
import { XMLParser } from "fast-xml-parser";

import { decodeSchema } from "../shared/decode.js";

export type XmlRecord = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  removeNSPrefix: true,
  trimValues: true,
});

const xmlRootSchema = Schema.Record(Schema.String, Schema.Unknown);

/** A parsed feed document: RSS channel items or Atom entries, never both. */
export function xmlFeed(xml: string): { channelItems: XmlRecord[]; atomEntries: XmlRecord[] } {
  const parsed: unknown = parser.parse(xml);
  const decoded = decodeSchema(xmlRootSchema, parsed);
  // A document the schema rejects still follows the historical soft cast.
  const root = decoded._tag === "Ok" ? decoded.value : asRecord(parsed);
  const rssChannel = asRecord(asRecord(root.rss).channel);
  if (Object.keys(rssChannel).length > 0) {
    return { channelItems: xmlChildren(rssChannel.item).map(itemOf), atomEntries: [] };
  }

  const atomFeed = asRecord(root.feed);
  if (Object.keys(atomFeed).length > 0) {
    return { channelItems: [], atomEntries: xmlChildren(atomFeed.entry).map(itemOf) };
  }

  return { channelItems: [], atomEntries: [] };
}

function itemOf(value: unknown): XmlRecord {
  return asRecord(value);
}

/** XML nodes: missing → [], single → [node], list → list. An existing array is kept; every other value is wrapped. */
export function xmlChildren(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function text(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") return String(value);
  const record = asRecord(value);
  const textNode = record["#text"];
  if (typeof textNode === "string" || typeof textNode === "number") return String(textNode);
  return undefined;
}

export function asRecord(value: unknown): XmlRecord {
  return isPlainObject(value) ? value : {};
}

const objectCtorString = Function.prototype.toString.call(Object);

function isPlainObject(value: unknown): value is XmlRecord {
  if (value === null || typeof value !== "object") return false;
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const proto: object | null = Object.getPrototypeOf(value);
  if (proto === null) return true;
  const ctor = Object.prototype.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  return (
    typeof ctor === "function" &&
    ctor instanceof ctor &&
    Function.prototype.toString.call(ctor) === objectCtorString
  );
}
