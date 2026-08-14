import {CLICommand} from "./CLICommand";
import {FileProvider} from "./DownloadAndProcessCommand";

import * as http from "http";
import * as fs from "fs";


export class DownloadFileCommand implements CLICommand, FileProvider {

  constructor(private readonly url: string) {}

  public run(argv: string[]): Promise<string[]> {
    return this.download(argv[3] || "/tmp/");
  }

  /**
   * Download the file from a HTTP server
   */
  public async download(outputDirectory: string): Promise<string[]> {
    console.log(`Downloading ${this.url}...`);

    const filename = outputDirectory + "nfm64.zip";

    return new Promise<string[]>((resolve, reject) => {
      const file = fs.createWriteStream(filename);

      http.get(this.url, response => {
        response.pipe(file);

        file.on("error", reject);
        file.on("finish", () => {
          file.close();
          resolve([filename]);
        });
      });
    });
  }

}