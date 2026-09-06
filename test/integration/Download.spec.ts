import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {FileEntry} from "ssh2";
import {Kysely} from "kysely";
import {Container} from "../../src/cli/Container";
import {DownloadCommand} from "../../src/cli/DownloadCommand";
import {ImportFeedCommand} from "../../src/cli/ImportFeedCommand";
import {PromiseSFTP} from "../../src/sftp/PromiseSFTP";
import {zipFixture} from "./support";

/**
 * The download works out what to fetch from the last file an import recorded, which is the one query it
 * makes and the only reason it needs a database at all.
 *
 * The server is a stub. What is worth testing here is that the log is read the same way by all three
 * databases, not that ssh2 copies files.
 */
describe("downloading a feed", () => {

  let db: Kysely<any>;
  let feed: ImportFeedCommand;
  let directory: string;
  let requested: string[];

  const remote: FileEntry[] = [
    entry("RJFAF998.ZIP", 1),
    entry("RJFAF999.ZIP", 2),
    entry("RJFAC001.ZIP", 3),
    entry("RJFAC002.ZIP", 4)
  ];

  beforeAll(async () => {
    const container = new Container();

    db = container.getKysely();
    feed = await container.getFaresImportCommand();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "dtd-download")) + path.sep;

    // the suite shares one database, so the state the first case is about is made rather than assumed
    await db.schema.dropTable("log").ifExists().execute();
  });

  afterAll(async () => {
    await feed?.end();
  });

  it("takes the last full refresh and everything since when nothing has been imported", async () => {
    requested = [];

    const files = await download();

    expect(files).to.deep.equal(
      ["RJFAF999.ZIP", "RJFAC001.ZIP", "RJFAC002.ZIP"].map(name => directory + name)
    );
    expect(requested.sort()).to.deep.equal(
      ["/fares/RJFAC001.ZIP", "/fares/RJFAC002.ZIP", "/fares/RJFAF999.ZIP"]
    );
  });

  it("takes only what has arrived since the last file an import recorded", async () => {
    await feed.doImport(zipFixture("fares", "RJFAF999.ZIP"));

    requested = [];

    const files = await download();

    expect(files).to.deep.equal(["RJFAC001.ZIP", "RJFAC002.ZIP"].map(name => directory + name));
  });

  function download(): Promise<string[]> {
    const sftp = {
      readdir: async () => remote,
      fastGet: async (from: string, to: string) => {
        requested.push(from);
        fs.writeFileSync(to, "");
      },
      end: () => {}
    } as unknown as PromiseSFTP;

    // download rather than run, as run closes the connection the next case still needs
    return new DownloadCommand(db, sftp, "/fares/").download(directory);
  }

});

/**
 * The command sorts on the modified time, which is all it looks at
 */
function entry(filename: string, mtime: number): FileEntry {
  return { filename, longname: filename, attrs: { mtime } } as FileEntry;
}
