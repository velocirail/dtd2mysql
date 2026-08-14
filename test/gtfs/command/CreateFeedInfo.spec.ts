import {describe, it, expect} from 'vitest';
import {createFeedInfo, feedPublisher, FeedValidity} from "../../../src/gtfs/command/CreateFeedInfo";

describe("CreateFeedInfo", () => {
  const validity: FeedValidity = {
    from: Temporal.PlainDate.from("2026-08-14"),
    to: Temporal.PlainDate.from("2026-11-14")
  };

  const publisher = { name: "Test Publisher", url: "https://example.com/" };
  const generatedAt = Temporal.Instant.from("2026-08-14T09:05:03Z");

  it("publishes the export window as GTFS dates", () => {
    const info = createFeedInfo(validity, publisher, generatedAt);

    expect(info.feed_start_date).to.equal("20260814");
    expect(info.feed_end_date).to.equal("20261114");
  });

  it("identifies the export by generation time in UTC", () => {
    const info = createFeedInfo(validity, publisher, generatedAt);

    expect(info.feed_version).to.equal("2026-08-14T09:05:03Z");
  });

  it("keeps the version in UTC regardless of the instant's origin", () => {
    // 01:05 in California is 08:05 UTC the same day; the version must not follow local time
    const info = createFeedInfo(
      validity,
      publisher,
      Temporal.Instant.from("2026-08-14T01:05:03-07:00")
    );

    expect(info.feed_version).to.equal("2026-08-14T08:05:03Z");
  });

  it("carries the publisher through", () => {
    const info = createFeedInfo(validity, publisher, generatedAt);

    expect(info.feed_publisher_name).to.equal("Test Publisher");
    expect(info.feed_publisher_url).to.equal("https://example.com/");
    expect(info.feed_lang).to.equal("en");
  });

  it("takes the publisher from the environment", () => {
    const publisher = feedPublisher({
      GTFS_FEED_PUBLISHER_NAME: "Some Operator",
      GTFS_FEED_PUBLISHER_URL: "https://operator.example/"
    });

    expect(publisher.name).to.equal("Some Operator");
    expect(publisher.url).to.equal("https://operator.example/");
  });

  it("falls back to the tool's own identity when the environment is unset", () => {
    const publisher = feedPublisher({});

    expect(publisher.name).to.equal("dtd2mysql");
    expect(publisher.url).to.equal("https://github.com/planarnetwork/dtd2mysql");
  });
});
