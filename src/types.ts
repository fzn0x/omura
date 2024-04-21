export type Point = {
  line: number;
  column: number;
  offset: number;
};

export type BufferEncoding =
  | "ascii"
  | "utf8"
  | "utf-16le"
  | "ucs2"
  | "base64"
  | "latin1"
  | "binary"
  | "hex";

export type Buf = string | Buffer | undefined;

export type Type =
  | "whitespace"
  | "eof"
  | "eol"
  | "preSequence"
  | "preAlt"
  | "preText"
  | "headingSequence"
  | "headingText"
  | "listSequence"
  | "listText"
  | "linkSequence"
  | "linkUrl"
  | "linkText"
  | "quoteSequence"
  | "quoteText"
  | "text";

export interface Token {
  type: Type;
  value: string;
  hard?: boolean;
  start: Point;
  end: Point;
}
