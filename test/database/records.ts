import config, {FeedConfig} from "../../config";
import {Record} from "../../src/feed/record/Record";
import {FixedWidthRecord} from "../../src/feed/record/FixedWidthRecord";
import {IntField, ZeroFillIntField} from "../../src/feed/field/IntField";
import {TextField, VariableLengthText} from "../../src/feed/field/TextField";
import {DateField} from "../../src/feed/field/DateField";
import {TimeField} from "../../src/feed/field/TimeField";
import {BooleanField} from "../../src/feed/field/BooleanField";
import {DoubleField} from "../../src/feed/field/DoubleField";

/**
 * A record using every field type, with a unique key and two indexes
 */
export function testRecord(name: string = "test"): Record {
  return new FixedWidthRecord(
    name,
    ["field", "field4"], {
      "field": new IntField(0, 4),
      "field2": new ZeroFillIntField(1, 3),
      "field3": new TextField(2, 5),
      "field4": new VariableLengthText(3, 5),
      "field5": new DateField(7),
      "field6": new TimeField(7, 4),
      "field7": new BooleanField(7),
      "field8": new DoubleField(7, 7, 5),
    },
    ["field5", "field6"]
  );
}

/**
 * A record with a single integer field of the given length
 */
export function intRecord(length: number): Record {
  return new FixedWidthRecord("ints", [], { "sized": new IntField(0, length) }, []);
}

/**
 * Every record type across all of the feeds
 */
export function feedRecords(): Record[] {
  const feeds: FeedConfig[] = Object.values(config);

  return feeds.flatMap(feed => Object.values(feed).flatMap(file => file.recordTypes));
}
