import { Point, BufferEncoding, Buf, Token, Type } from "types";

export function parser(): (
  value: Buf | undefined,
  encoding?: BufferEncoding | undefined,
  end?: boolean | undefined
) => Array<Token> {
  const values: Array<string> = [];
  let line: number = 1;
  let column: number = 1;
  let offset: number = 0;
  let preformatted: boolean = false;
  const results: Array<Token> = [];

  function createToken(
    type: Type,
    value: string,
    start: Point,
    fields?: Record<string, any>
  ): Token {
    const token: Token = {
      type: type,
      value: value,
      start: start,
      end: now(), // Set `end` here or ensure it is set before using the token
    };

    if (fields) {
      Object.assign(token, fields);
    }

    return token;
  }

  function now(): Point {
    return { line, column, offset };
  }

  const add = (
    type: Type,
    value: string,
    fields?: Record<string, any>
  ): void => {
    const start: Point = now();
    const token: Token = createToken(type, value, start, fields);

    offset += value.length;
    column += value.length;

    // Note that only a final line feed is supported: it’s assumed that
    // they’ve been split over separate tokens already.
    if (value.charCodeAt(value.length - 1) === 10 /* `\n` */) {
      line++;
      column = 1;
    }

    token.type = type;
    token.value = value;
    if (fields) Object.assign(token, fields);
    token.start = start;
    token.end = now();

    results.push(token);
  };

  return function parse(
    buf?: Buf,
    encoding?: BufferEncoding,
    done: boolean = false
  ): Array<Token> {
    let end: number = buf ? buf.toString(encoding).indexOf("\n") : -1;
    let start: number = 0;

    while (end > -1) {
      const value: string =
        values.join("") + buf?.toString(encoding).slice(start, end);
      values.length = 0; // Clear the values array

      parseLine(value);
      add("eol", "\n", { hard: !preformatted && value.length === 0 });

      start = end + 1;
      end = buf ? buf.toString(encoding).indexOf("\n", start) : -1;
    }

    if (buf) values.push(buf.toString(encoding).slice(start));

    if (done) {
      parseLine(values.join(""));
      add("eof", "");
    }

    function parseLine(value: string): void {
      let index: number;
      let start: number;
      const code: number = value.charCodeAt(0);

      switch (code) {
        case 96: // '`'
          if (value.slice(0, 3) === "```") {
            add("preSequence", value.slice(0, 3));
            if (value.length > 3) add("preAlt", value.slice(3));
            preformatted = !preformatted;
          }
          break;
        case 35: // '#'
          index = 1;
          while (index < 3 && value.charCodeAt(index) === 35 /* `#` */) index++;
          add("headingSequence", value.slice(0, index));

          // Optional whitespace.
          start = index;
          while (ws(value.charCodeAt(index))) index++;
          if (start !== index) add("whitespace", value.slice(start, index));

          // Optional heading text.
          if (index !== value.length) add("headingText", value.slice(index));
          break;
        case 42: // '*'
          add("listSequence", "*");

          // Optional whitespace.
          index = 1;
          while (ws(value.charCodeAt(index))) index++;
          if (index > 1) add("whitespace", value.slice(1, index));

          // Optional list text.
          if (value.length > index) add("listText", value.slice(index));
          break;
        case 61: // '='
          add("linkSequence", value.slice(0, 2));

          // Optional whitespace.
          index = 2;
          while (ws(value.charCodeAt(index))) index++;
          if (index > 2) add("whitespace", value.slice(2, index));

          // Optional non-whitespace is the URL.
          start = index;
          while (index < value.length && !ws(value.charCodeAt(index))) index++;
          if (index > start) add("linkUrl", value.slice(start, index));

          // Optional whitespace.
          start = index;
          while (ws(value.charCodeAt(index))) index++;
          if (index > start) add("whitespace", value.slice(start, index));

          // Rest is optional link text.
          if (value.length > index) add("linkText", value.slice(index));
          break;
        case 62: // '>'
          add("quoteSequence", value.slice(0, 1));

          // Optional whitespace.
          index = 1;
          while (ws(value.charCodeAt(index))) index++;
          if (index > 1) add("whitespace", value.slice(1, index));

          if (value.length > index) add("quoteText", value.slice(index));
          break;
        default:
          add("text", value);
          break;
      }
    }

    return results;
  };
}

function ws(code: number) {
  return code === 9 /* `\t` */ || code === 32; /* ` ` */
}
