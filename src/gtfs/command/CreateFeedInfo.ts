import {FeedInfo} from "../file/FeedInfo";
import {toYYYYMMDD} from "../native/PlainDate";

/**
 * The window over which the exported feed is complete.
 *
 * `to` is the schedule cutoff: only schedules that *start* before it are exported, so overlays and
 * cancellations that begin after it are missing and the data beyond that point is incomplete (see
 * the GTFS feed cutoff date note in the README). Publishing the cutoff as `feed_end_date` is what
 * makes that boundary machine-readable rather than folklore.
 */
export interface FeedValidity {
  from: Temporal.PlainDate;
  to: Temporal.PlainDate;
}

export interface FeedPublisher {
  name: string;
  url: string;
}

const defaultPublisher: FeedPublisher = {
  name: "dtd2mysql",
  url: "https://github.com/planarnetwork/dtd2mysql"
};

/**
 * Return the single feed_info.txt record for this export.
 */
export function createFeedInfo(
  validity: FeedValidity,
  publisher: FeedPublisher,
  generatedAt: Temporal.Instant
): FeedInfo {
  return {
    feed_publisher_name: publisher.name,
    feed_publisher_url: publisher.url,
    feed_lang: "en",
    feed_start_date: toYYYYMMDD(validity.from),
    feed_end_date: toYYYYMMDD(validity.to),
    feed_version: feedVersion(generatedAt)
  };
}

/**
 * The publisher of the feed, which is whoever is running the export rather than anything the DTD
 * feed itself knows, so it comes from the environment.
 */
export function feedPublisher(env: Record<string, string | undefined>): FeedPublisher {
  return {
    name: env.GTFS_FEED_PUBLISHER_NAME || defaultPublisher.name,
    url: env.GTFS_FEED_PUBLISHER_URL || defaultPublisher.url
  };
}

/**
 * Identify the export by when it was generated, to the second, in UTC.
 *
 * The DTD timetable feed carries no version this could be derived from - the CIF header record is
 * not imported - so generation time is the most specific thing available. It is what a real-time
 * feed published against this export uses to assert the two were built from the same data.
 */
function feedVersion(generatedAt: Temporal.Instant): string {
  return generatedAt.toZonedDateTimeISO("UTC").toPlainDateTime().toString({ smallestUnit: "second" }) + "Z";
}
