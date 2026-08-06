import AdmZip from "adm-zip";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {FeedConfig} from "../../config";
import {DatabaseConnection} from "../../src/database/DatabaseConnection";

// docker-compose.yml and the CI service both provide this database, everything else Container defaults
process.env.DATABASE_NAME ??= "dtd2mysql";

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
export async function readTables(db: DatabaseConnection, tables: string[]): Promise<string> {
  const contents: { [table: string]: unknown[] } = {};

  for (const table of tables) {
    const [rows] = await db.query(`SELECT * FROM \`${table}\` ORDER BY id`);

    contents[table] = JSON.parse(JSON.stringify(rows));
  }

  return JSON.stringify(contents, null, 2);
}

/**
 * The most recent file the import recorded, which is appended to rather than reset
 */
export async function lastProcessedFile(db: DatabaseConnection): Promise<string | undefined> {
  const [rows] = await db.query<{ filename: string }>("SELECT filename FROM log ORDER BY id DESC LIMIT 1");

  return rows[0]?.filename;
}
