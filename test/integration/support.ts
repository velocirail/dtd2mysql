import AdmZip from "adm-zip";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {Kysely} from "kysely";
import {FeedConfig} from "../../config";

/**
 * Which database the suite runs against. MySQL is the default because that is what the recorded rows
 * were taken from, and every dialect is compared against the same ones.
 */
export const dialect = process.env.DATABASE_DIALECT ?? "mysql";

// docker-compose.yml and the CI service both provide this database, sqlite just needs somewhere to live
process.env.DATABASE_NAME ??= dialect === "sqlite"
  ? path.join(os.tmpdir(), "dtd2mysql-integration.sqlite")
  : "dtd2mysql";

// the project compiles to CommonJS so import.meta is out, and vitest runs from the project root
const directory = path.join(process.cwd(), "test", "integration");

/**
 * The recorded rows for a feed, which the import is compared against
 */
export function expectedRows(name: string): string {
  return path.join(directory, "expected", name);
}

/**
 * Zip a fixture folder up, as the import takes an archive rather than a folder.
 *
 * The archive name matters, the fifth character says whether the feed is a full refresh or a set of
 * changes to apply on top of one.
 */
export function zipFixture(fixture: string, archive: string): string {
  const zip = new AdmZip();

  zip.addLocalFolder(path.join(directory, "fixture", fixture));

  const filename = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dtd-fixture")), archive);

  zip.writeZip(filename);

  return filename;
}

/**
 * The tables a feed writes to, in a stable order, deduplicated because some files share their records
 */
export function tableNames(feed: FeedConfig): string[] {
  const names = Object.values(feed).flatMap(file => file.recordTypes.map(record => record.name));

  return [...new Set(names)].sort();
}

/**
 * Every row of every table, JSON so that the driver's row objects compare as plain data
 */
export async function readTables(db: Kysely<any>, tables: string[]): Promise<string> {
  const contents: { [table: string]: unknown[] } = {};

  for (const table of tables) {
    const rows = await db.selectFrom(table).selectAll().orderBy("id").execute();

    contents[table] = JSON.parse(JSON.stringify(rows));
  }

  return JSON.stringify(contents, null, 2);
}

/**
 * The most recent file the import recorded, which is appended to rather than reset
 */
export async function lastProcessedFile(db: Kysely<any>): Promise<string | undefined> {
  const [row] = await db.selectFrom("log").select("filename").orderBy("id", "desc").limit(1).execute();

  return row?.filename;
}
