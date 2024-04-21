#!/usr/bin/env node
import * as readline from "node:readline";

import Client from "client";

import { fromGemtext } from "fromGemtext";
import { transform } from "transform";

import { Link } from "universal-ast";

// TODO: remove code when https://github.com/oven-sh/bun/issues/10403 is fixed
if (process.stdin.isTTY) {
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  process.stdin.on("keypress", (_str, key) => {
    if (key.ctrl && key.name === "c") process.exit(0);
  });
}

const client = new Client();
const rl = readline
  .createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  .on("SIGINT", function () {
    process.emit("SIGINT");
  });

process.on("SIGINT", function () {
  // graceful shutdown
  process.exit(0);
});

import pkg from "../package.json";

function isOnlyPathname(urlString: string | URL) {
  // Regex to check if the string contains protocol or host
  const pattern = /^[^\/]+:\/\/|^\/\//;
  return !pattern.test(urlString as string);
}

function getUrlWithoutPath(urlString: string | URL) {
  const url = new URL(urlString);
  // Rebuild the URL without the pathname or search/query
  return `${url.protocol}//${url.host}`;
}

async function handleGeminiRequest(
  inputUrl: URL | string
): Promise<Link[] | undefined> {
  try {
    const parsedUrl = new URL(inputUrl);

    const response = await client.sendRequest(parsedUrl);

    const ast = fromGemtext(response);
    const transformed = transform(ast.children);

    console.log(transformed.styledResponse);

    transformed.navigation.map((navigation) => {
      console.log(navigation);
    });

    return transformed.links;
  } catch (err) {
    console.log(err);
  }
}

console.log(`\x1b[1mfzn0x/omura v${pkg.version}\x1b[0m`);

console.log(`
   U  ___ u  __  __     _   _    ____        _      \r\n    \\\/\"_ \\\/U|\' \\\/ \'|uU |\"|u| |U |  _\"\\ u U  \/\"\\  u\r\n    | | | |\\| |\\\/| |\/ \\| |\\| | \\| |_) |\/  \\\/ _ \\\/\r\n.-,_| |_| | | |  | |   | |_| |  |  _ <    \/ ___ \\\r\n \\_)-\\___\/  |_|  |_|  <<\\___\/   |_| \\_\\  \/_\/   \\_\\\r\n      \\\\   <<,-,,-.  (__) )(    \/\/   \\\\_  \\\\    >>\r\n     (__)   (.\/  \\.)     (__)  (__)  (__)(__)  (__)
`);

console.log(`
   Pushing lightweight gemtext-based internet through gemini:// protocol client. Made by https://github.com/fzn0x.
`);

console.log(
  `Platform ${process.platform}, Node ${process.version}, isTTY? ${process.stdout.isTTY}`
);

console.log(`
   List of commands:
   /c - exit gracefully
   /q <query> - search engine
   /checkout <link index> - checkout specific link from latest response
`);

function createCommands(string: string) {
  if (string.includes("/q ") && string.indexOf("/q") === 0) {
    return "search-engine";
  }
  if (
    string.includes("/c") &&
    string.indexOf("/c") === 0 &&
    string.indexOf("/ch") !== 0
  ) {
    return "exit";
  }
  if (string.includes("/checkout") && string.indexOf("/checkout") === 0) {
    return "checkout";
  }
  return string || "";
}

// Function to prompt and process commands
function promptAndProcessCommand(
  previousLinks: Link[] | undefined,
  parentURL: URL | string
) {
  rl.question("> ", async (cmd) => {
    const command = createCommands(cmd.toLowerCase());
    let links: Link[] | undefined = [];
    switch (command) {
      case "":
        promptAndProcessCommand(links, parentURL);
        break;
      case "exit":
        console.log("Bye!");
        rl.close(); // This ensures the readline interface is closed properly
        process.exit(0); // Exit cleanly
      case "checkout":
        if ((previousLinks || []).length === 0) {
          console.log("Nothing to checkout.");
          promptAndProcessCommand(links, parentURL);
        }

        const index = Number(cmd.split(" ")[1]) as number;

        try {
          const linkSource: URL | string = String(previousLinks?.[index]);
          const searchEngineUrl = new URL(
            String(
              isOnlyPathname(linkSource)
                ? getUrlWithoutPath(parentURL) + linkSource
                : linkSource
            )
          );

          console.log(`Requesting to ${searchEngineUrl}`);
          links = await handleGeminiRequest(String(searchEngineUrl));

          parentURL = String(searchEngineUrl);
        } catch (e) {
          console.error("Error processing the Gemini request:", e);
        }
        // Call promptAndProcessCommand recursively to continue the loop
        promptAndProcessCommand(
          (links || []).length === 0 ? previousLinks : links,
          parentURL
        );
        break;
      case "search-engine":
        try {
          const searchEngineUrl = `gemini://geminispace.info/search?${
            cmd.split(" ")[1]
          }`;
          console.log(`Requesting to ${searchEngineUrl}`);
          links = await handleGeminiRequest(searchEngineUrl);

          parentURL = searchEngineUrl;
        } catch (e) {
          console.error("Error processing the Gemini request:", e);
        }
        // Call promptAndProcessCommand recursively to continue the loop
        promptAndProcessCommand(
          (links || []).length === 0 ? previousLinks : links,
          parentURL
        );
        break;
      default:
        try {
          links = await handleGeminiRequest(
            cmd.includes("://") ? cmd : "gemini://" + cmd
          );

          parentURL = cmd.includes("://") ? cmd : "gemini://" + cmd;
        } catch (e) {
          console.error("Error processing the Gemini request:", e);
        }
        // Call promptAndProcessCommand recursively to continue the loop
        promptAndProcessCommand(
          (links || []).length === 0 ? previousLinks : links,
          parentURL
        );
        break;
    }
  });

  if (process.platform === "win32") {
    rl.on("SIGINT", function () {
      rl.close();
      console.log("Process terminated (SIGINT).");
      process.stdout.write("\n");
      process.kill(process.pid, "SIGINT");
    });
  }
}

// Start the command loop
promptAndProcessCommand([], "");
