// transform Gemtext in Omura CLI

import { RootContent, ListItem } from "universal-ast";

export function transform(childrens: RootContent[]) {
  console.dir(childrens, { depth: null });
  const links = childrens
    .filter((children) => children.type === "link")
    .map((children) => children.url);

  const navigation = links.map((link, i) => {
    return `/checkout ${i} \x1b[34m${link}\x1b[0m`;
  });

  const styledResponse = childrens
    .map((children) => {
      const type = children.type;
      const url = children.url;
      const rank = children.rank;
      const value = children.value;

      switch (type) {
        case "link":
          return `\x1b[4C\x1b[34m${url} ${value}\x1b[30m`;
        case "break":
          return ""; // Do nothing when break
        case "quote":
          return `\`${value}\``;
        case "text":
          return `\x1b[37m${value}\x1b[0m`;
        case "list":
          return children.children
            .map((value: ListItem) => {
              return value.type === "listItem"
                ? `\x1b[37m\r\r • ${value.value}\x1b[30m`
                : `\x1b[37m\r\r\r • ${value.value}\x1b[30m`;
            })
            .join();
        case "heading":
          if (rank === 1) {
            return `\x1b[34m\x1b[1m${value}\x1b[0m`;
          } else if (rank === 2) {
            return `\x1b[32m\x1b[1m${value}\x1b[0m`;
          } else if (rank === 3) {
            return `\x1b[31m\x1b[1m${value}\x1b[0m`;
          } else {
            return `\x1b[37m${value}\x1b[0m`;
          }
        default:
          return `\x1b[37m${value}\x1b[0m`;
      }
    })
    .join("\n");

  return {
    links,
    navigation,
    styledResponse,
  };
}
