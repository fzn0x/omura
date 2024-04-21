#!/usr/bin/env node
import * as readline from "node:readline";

import Client from "client";

import { fromGemtext } from "fromGemtext";
import { transform } from "transform";

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

async function handleGeminiRequest(inputUrl: string | URL) {
  try {
    const parsedUrl = new URL(inputUrl);

    const response = await client.sendRequest(parsedUrl);

    const ast = fromGemtext(response);
    const transformed = transform(ast.children);

    console.log(transformed.styledResponse);

    transformed.navigation.map((navigation) => {
      console.log(navigation);
    });
  } catch (err) {
    console.log(err);
  }
}

console.log(`\x1b[1mfzn0x/gemini-client v${pkg.version}\x1b[0m`);

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
  if (string.includes("/c") && string.indexOf("/c") === 0) {
    return "exit";
  }
  return string || "";
}

// Function to prompt and process commands
function promptAndProcessCommand() {
  rl.question("> ", async (cmd) => {
    const command = createCommands(cmd.toLowerCase());
    switch (command) {
      case "":
        promptAndProcessCommand();
        break;
      case "exit":
        console.log("Bye!");
        rl.close(); // This ensures the readline interface is closed properly
        process.exit(0); // Exit cleanly
      case "search-engine":
        try {
          const searchEngineUrl = `gemini://geminispace.info/search?${
            cmd.split(" ")[1]
          }`;
          console.log(`Requesting to ${searchEngineUrl}`);
          await handleGeminiRequest(searchEngineUrl);
        } catch (e) {
          console.error("Error processing the Gemini request:", e);
        }
        // Call promptAndProcessCommand recursively to continue the loop
        promptAndProcessCommand();
        break;
      default:
        try {
          await handleGeminiRequest(
            cmd.includes("://") ? cmd : "gemini://" + cmd
          );
        } catch (e) {
          console.error("Error processing the Gemini request:", e);
        }
        // Call promptAndProcessCommand recursively to continue the loop
        promptAndProcessCommand();
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
promptAndProcessCommand();
