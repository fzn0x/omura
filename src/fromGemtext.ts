import { Point, BufferEncoding, Buf, Token } from "types";
import {
  Root,
  Parent,
  Node,
  Link,
  Heading,
  Pre,
  Quote,
  List,
} from "universal-ast";
import { parser } from "parser";

export function fromGemtext(
  doc: Buf,
  encoding: BufferEncoding = "utf8"
): Root | List {
  return compile(parser()(doc, encoding, true));
}

function compile(tokens: Array<Token>): Root | List {
  const root: Root = {
    type: "root",
    children: [],
    position: {
      start: point(tokens[0].start),
      end: point(tokens[tokens.length - 1].end),
    },
  };
  const stack: Array<Extract<Node, Parent>> = [root];
  let index = -1;

  while (++index < tokens.length) {
    const token = tokens[index];

    switch (token.type) {
      case "eol":
        if (token.hard) {
          enter({ type: "break" }, token);
          exit(token);
        }
        break;
      case "headingSequence":
        let nodeHeading: Heading = enter(
          {
            type: "heading",
            rank:
              (token.value.length === 1 ||
                token.value.length === 2 ||
                token.value.length === 3) &&
              token.value.length,
            value: "",
          },
          token
        );

        if (tokens[index + 1].type === "whitespace") index++;
        if (tokens[index + 1].type === "headingText") {
          index++;
          nodeHeading.value = tokens[index].value;
        }

        exit(tokens[index]);
        break;
      case "linkSequence":
        let nodeSequence: Link = enter(
          { type: "link", url: null, value: "", rank: undefined },
          token
        );

        if (tokens[index + 1].type === "whitespace") index++;
        if (tokens[index + 1].type === "linkUrl") {
          index++;
          nodeSequence.url = tokens[index].value;

          if (tokens[index + 1].type === "whitespace") index++;
          if (tokens[index + 1].type === "linkText") {
            index++;
            nodeSequence.value = tokens[index].value;
          }
        }

        exit(tokens[index]);
        break;
      case "listSequence":
        if (stack[stack.length - 1].type !== "list") {
          enter({ type: "list", children: [] }, token);
        }

        const node = enter({ type: "listItem", value: "" }, token);

        if (tokens[index + 1].type === "whitespace") index++;
        if (tokens[index + 1].type === "listText") {
          index++;
          node.value = tokens[index].value;
        }

        exit(tokens[index]);

        if (
          tokens[index + 1].type !== "eol" ||
          tokens[index + 2].type !== "listSequence"
        ) {
          exit(tokens[index]);
        }
        break;
      case "preSequence":
        /** @type {Pre} */
        const nodePreSequence: Pre = enter(
          { type: "pre", alt: null, value: "" },
          token
        );
        /** @type {Array<string>} */
        const values = [];

        if (tokens[index + 1].type === "preAlt") {
          index++;
          nodePreSequence.alt = tokens[index].value;
        }

        // Slurp the first EOL.
        if (tokens[index + 1].type === "eol") index++;

        while (++index < tokens.length) {
          if (
            tokens[index].type === "eol" ||
            tokens[index].type === "preText"
          ) {
            values.push(tokens[index].value);
          } else {
            // This can only be the closing `preSequence` or and `EOF`.
            // In the case of the former, there was an EOL, which we remove.
            // eslint-disable-next-line max-depth
            if (tokens[index].type === "preSequence") {
              values.pop();

              // Move past an (ignored) closing alt.
              // eslint-disable-next-line max-depth
              if (tokens[index + 1].type === "preAlt") index++;
            }

            break;
          }
        }

        nodePreSequence.value = values.join("");

        exit(tokens[index]);
        break;
      case "quoteSequence":
        const nodeQuoteSequence: Quote = enter(
          { type: "quote", value: "" },
          token
        );

        if (tokens[index + 1].type === "whitespace") index++;
        if (tokens[index + 1].type === "quoteText") {
          index++;
          nodeQuoteSequence.value = tokens[index].value;
        }

        exit(tokens[index]);
        break;
      case "text":
        enter({ type: "text", value: token.value }, token);
        exit(token);
        break;
      // soft EOLs and EOF do not require handling
    }
  }

  function enter<N extends Node>(node: N, token: Token): N {
    const parent = stack[stack.length - 1];
    parent.children.push(node);
    stack.push(node);
    node.position = { start: point(token.start), end: point(token.end) };
    return node;
  }

  function exit(token: Token): Node {
    const node = stack.pop();
    node.position.end = point(token.end);
    return node;
  }

  function point(d: Point): Point {
    return { line: d.line, column: d.column, offset: d.offset };
  }

  // Get the first root
  return stack[0];
}
