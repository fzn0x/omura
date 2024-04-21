import * as tls from "node:tls";
import { URL } from "node:url";
import { Transform } from "node:stream";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

// Specs: gemini://geminiprotocol.net/docs/protocol-specification.gmi
export default class Client {
  private static CRLF = "\r\n";
  private static GEMINI_PORT = 1965; // Default port for Gemini

  private knownHostsPath = path.resolve(
    import.meta.dirname,
    "known_hosts.json"
  );
  private knownHosts: { [hostname: string]: string } = {};

  constructor() {
    this.loadKnownHosts();
  }

  private loadKnownHosts() {
    if (fs.existsSync(this.knownHostsPath)) {
      this.knownHosts = JSON.parse(
        fs.readFileSync(this.knownHostsPath, "utf8")
      );
    }
  }

  private saveKnownHosts() {
    fs.writeFileSync(
      this.knownHostsPath,
      JSON.stringify(this.knownHosts, null, 2)
    );
  }

  public sendRequest(uri: string | URL): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(uri);

      if (url.username || url.password) {
        reject(new Error("Userinfo not allowed in URI"));
        return;
      }
      if (url.hash) {
        reject(new Error("URI must not include a fragment"));
        return;
      }
      if ((uri as string).length > 1024) {
        reject(new Error("URI must not exceed 1024 bytes"));
        return;
      }

      const requestString = `${url.toString()}\r\n`;

      const options: tls.ConnectionOptions = {
        host: url.hostname,
        ALPNProtocols: ["gemini"],
        minVersion: "TLSv1.2",
        rejectUnauthorized: false, // Necessary for TOFU
        cert: undefined,
        key: undefined,
        passphrase: undefined,

        checkServerIdentity: (host, cert) => {
          const expectedFingerprint = this.knownHosts[host];
          const actualFingerprint = crypto
            .createHash("sha256")
            .update(cert.raw)
            .digest("hex");

          if (
            expectedFingerprint &&
            expectedFingerprint !== actualFingerprint
          ) {
            throw new Error(`Certificate fingerprint mismatch for ${host}`);
          }

          // Store new fingerprint
          if (!expectedFingerprint) {
            this.knownHosts[host] = actualFingerprint;
            this.saveKnownHosts();
          }
          return undefined;
        },
        timeout: 30 * 1000, // 30 seconds
      };

      const socket = tls.connect(Client.GEMINI_PORT, url.hostname, options);

      let data = "";

      const responseParser = this.createGeminiResponseParser();

      socket.pipe(responseParser);

      socket.on("data", (chunk) => {
        data += chunk.toString();
      });

      socket.on("end", () => {
        try {
          // You need to parse the raw HTTP response here
          const statusCode = this.getStatusCodeFromGeminiResponse(data);
          const response = this.processResponse(statusCode, data);

          resolve(response);
        } catch (error) {
          reject(error);
        }
        socket.end();
      });

      socket.on("error", (error) => {
        reject(error);
        socket.destroy();
      });

      socket.write(requestString);
    });
  }

  private createGeminiResponseParser(): Transform {
    let headerParsed = false;
    let peek: Buffer | null = Buffer.alloc(0);

    return new Transform({
      transform(chunk, encoding, callback) {
        if (headerParsed) {
          this.push(chunk);
          callback();
          return;
        }

        peek = Buffer.concat([peek, chunk], peek?.length + chunk.length);

        const iCRLF = peek.indexOf(Client.CRLF);
        if (iCRLF === -1) {
          if (peek.length > 2048) {
            this.destroy(new Error("Header too long or CRLF not found"));
          }
          callback();
          return;
        }

        const headerPart = peek.subarray(0, iCRLF).toString("utf8");
        const statusCode = parseInt(headerPart.substring(0, 2));
        const meta = headerPart.substring(3).trim();

        this.emit("header", {
          statusCode,
          meta,
        });

        headerParsed = true;
        const bodyStart = iCRLF + Client.CRLF.length;
        const remaining = peek.subarray(bodyStart); // Use remaining data after header
        peek = null; // Allow garbage collection of the header

        if (remaining.length > 0) {
          this.push(remaining);
        }

        callback();
      },
    });
  }

  private getStatusCodeFromGeminiResponse(response: string): number {
    const match = response.match(/^\d{2}/);
    return match ? parseInt(match[0], 10) : 0;
  }

  private processResponse(statusCode: number, data: string): string {
    if (statusCode < 10 || statusCode > 69) {
      throw new Error("Received an invalid status code.");
    }

    const statusGroup = Math.floor(statusCode / 10);
    switch (statusGroup) {
      case 1: // Input expected
      case 2: // Success
      case 3: // Redirection
      case 4: // Temporary failure
      case 5: // Permanent failure
      case 6: // Client certificates
        break;
      default:
        // Handle undefined codes as their group's default
        const defaultStatus = statusGroup * 10;
        console.warn(
          `Received undefined status code '${statusCode}', treating as '${defaultStatus}'.`
        );
    }

    return data;
  }
}
