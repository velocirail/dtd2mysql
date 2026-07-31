# Can DTD data be correctly represented as pure GTFS?

**Short answer: no — not without loss, and not for all three feeds.**

The timetable feed can be expressed in valid, semantically useful GTFS, and with a few
changes this exporter's output could be made spec-pure. But that mapping is one-way and
lossy: it discards train identity, platform-level granularity and every operational
attribute. Two other classes of data — time-restricted fixed links, and the
fares/routeing guide feeds — have no representation in the GTFS reference at all. The
exporter already concedes this by emitting a non-standard `links.txt`
(`src/cli/OutputGTFSCommand.ts:45`, `src/gtfs/file/FixedLink.ts:5`).

Train joins and splits are a notable exception to the pessimism: GTFS added linked trips
(`transfer_type=4`) specifically for this, so associations are representable properly —
just not by the mechanism this exporter currently uses. See below.

## Scope and method

"DTD data" here means all four feeds this tool imports: the timetable (MCA/CFA/ZTR/MSN/
ALF/FLF/TSI), the fares feed (RJFAF), the routeing guide (RJRG) and NFM64. "Pure GTFS"
means the files and fields in the GTFS Schedule reference — no extensions, no extra files,
no out-of-vocabulary enum values.

This is an evaluation by reading the DTD record definitions in `config/` against the
export path in `src/gtfs/`, and both against the GTFS reference (quotations are from
`gtfs/spec/en/reference.md` in google/transit at time of writing). Nothing was validated
against a real feed: the exporter needs a populated MySQL database from a licensed feed
download, which this environment does not have. Claims about the code are cited by file
and line; claims about live output are not made.

Three separate questions get conflated when people ask this, so they are answered
separately below:

1. **Validity** — would a GTFS validator accept it?
2. **Fidelity** — does a journey planner consuming it produce the same answers as one
   consuming DTD directly?
3. **Round-tripping** — could DTD be reconstructed from the GTFS?

The answers are: yes with modest changes; mostly, with named exceptions; and no.

## 1. What maps cleanly

These parts of the timetable feed have a genuine GTFS home, and the mapping is faithful:

| DTD | GTFS | Notes |
| --- | --- | --- |
| BS schedule + LO/LI/LT stops | `trips.txt` + `stop_times.txt` | The core mapping. Sound. |
| Schedule runs-from/to + day bits | `calendar.txt` | Direct field-for-field (`ScheduleCalendar.toCalendar`). |
| STP exclusions after flattening | `calendar_dates.txt` | `exception_type: 2` per excluded date. |
| MSN physical station | `stops.txt` | CRS as `stop_id`, OSGB easting/northing reprojected to WGS84 (`CIFRepository.ts:69`). |
| MSN minimum change time | `transfers.txt` with `from_stop_id == to_stop_id`, `transfer_type: 2` | A conventional and valid use of the file. |
| ATOC code | `agency.txt` / `routes.agency_id` | Backed by a hand-maintained list, with a `ZZ` catch-all (`ScheduleBuilder.ts:91`). |
| Times past midnight | `HH:MM:SS` with hours ≥ 24 | GTFS explicitly supports this; `ScheduleBuilder.formatTime` produces it. |
| Activity codes T/TB/TF/U/D/N/R | `pickup_type` / `drop_off_type` | Lossy but adequate — see below. |

GTFS's service-day model (noon minus twelve hours) is also a better fit for overnight rail
than it is usually given credit for, and `AddLateNightServices` uses it correctly: services
departing at or before 01:00 are re-dated to the previous service day with 24+ hour times.

## 2. Representable, but only by expansion — and lossy

### STP overlays and cancellations

DTD schedules are layered: a permanent record, then short-term-plan overlays and
cancellations that mask parts of it, resolved by `stp_indicator` precedence. GTFS has no
layering — it is a materialised view. So the layers must be flattened, which
`ApplyOverlays` does by either adding exclude days or splitting the base calendar into
several (`src/gtfs/command/ApplyOverlays.ts:47-58`).

This is *representable*: any DTD schedule set can be expanded into some set of
`calendar` + `calendar_dates` + `trips` rows that runs on exactly the right days.
What is lost:

- **Provenance.** Nothing in the output says "this trip is an overlay of that one" or
  "this date is cancelled" versus "this date was never served". A cancelled day and a
  non-operating day are the same empty set in GTFS.
- **Compactness.** One DTD schedule can become many GTFS trips and service IDs. The
  choice between the two flattening strategies is a size heuristic
  (`SHORT_OVERLAY_LENGTH = 7`, `ScheduleCalendar.ts:8,42`) — correct either way, but it
  exists only to keep the output from exploding.
- **Incremental update.** DTD ships daily change files with insert/amend/delete record
  actions (`config/timetable/file/MCA.ts:52-56`). GTFS has no update semantics at all;
  every publication is a full snapshot. This is a fundamental format difference, not a
  gap in this tool.

### Associations (train joins and splits) — representable, but not the way it's done now

A `VV`/`JJ` association says one physical train splits into two portions, or two trains
join. **GTFS does have vocabulary for this.** `transfer_type=4` ("in-seat transfer")
links trips that are operated by the same vehicle, and the reference is explicit that
"the vehicle MAY be coupled to, or uncoupled from, other vehicles". Links may be 1-to-n
and n-to-1, and the spec's own worked example is two train trips merging into one "after
a vehicle coupling operation at a common station" — a UK-style join, described in the
spec in those words. `from_trip_id` and `to_trip_id` are required for `transfer_type` 4
and 5; the stop IDs become optional. The reference also states that where a `block_id`
and a linked-trips transfer conflict, the transfer wins, and that in-seat transfers
should be expressed this way rather than via blocks.

This is upstream issue
[planarnetwork/dtd2mysql#81](https://github.com/planarnetwork/dtd2mysql/issues/81),
open since March 2024.

What the exporter does instead is materialise a **combined trip** — base portion before
the split point, then the associated portion after — keeping the original schedule alive
for the dates the association doesn't apply (`src/gtfs/native/Association.ts:80-135`).
That is valid GTFS and works in naive consumers, but it is strictly more lossy than
linked trips:

- The shared portion of the journey is **duplicated across two trips**. Any consumer
  summing capacity, counting vehicles, or drawing a service diagram double-counts. With
  `transfer_type=4` the shared portion is one trip and is not duplicated at all.
- Concatenating stop sequences can fabricate journeys that don't exist. Upstream issue
  [#80](https://github.com/planarnetwork/dtd2mysql/issues/80) reports exactly this: a
  join at the *start* of the base schedule produced a bogus circular service across Kent.
  Linked trips cannot produce that failure, because no concatenation happens.
- `DateIndicator.Previous` (`P`) is defined (`Association.ts:196`) but never handled:
  only `Next` is special-cased in `ApplyAssociations.ts:22-31` and
  `Association.ts:52,117,145`, so `P` associations are silently treated as same-day. Rare
  in practice, wrong when it occurs.

The genuine difficulty with linked trips is not expressiveness but **calendar identity**.
The spec requires that in a 1-to-n continuation every `to_trip_id` share an identical
`trips.service_id`, and in an n-to-1 continuation every `from_trip_id` does. DTD
associations carry their own calendar, independent of the calendars of the two schedules
they join, and STP flattening then fragments all three into different exclude-day sets
(`ApplyOverlays.ts:47-58`). Two portions of one split can easily end up on
non-identical service IDs, which the constraint forbids. Satisfying it means reconciling
the association calendar against both schedule calendars and emitting a common service
ID per continuation — real work, but bounded work, and not a limitation of GTFS.

The other cost is consumer support: `transfer_type=4` is newer and unevenly implemented,
whereas a pre-merged through trip works everywhere. That is a defensible reason to keep
the current behaviour, but it is a compatibility argument, not a representability one.

### Change en route (CR records)

A CR record changes a train's category, identity, class, reservations, catering or RSID
part-way through the journey (`config/timetable/file/MCA.ts:181-209`). A GTFS trip has
exactly one route, one route type and one attribute set for its whole length, so the
change point has to become a trip boundary.

That sounds like it breaks the through journey, but linked trips fix it for the same
reason they fix associations: split the trip at the CR point into two trips carrying the
different attributes, then join them with a `transfer_type=4` transfer. Same vehicle, no
alighting, and the passenger-facing continuity is preserved. The same 1-to-1 service ID
considerations apply.

The exporter imports CR into `service_change` and ignores it — `service_change` appears
nowhere in `src/`.

### Platform and TIPLOC granularity

`stops.txt` is keyed on CRS, with `GROUP BY crs_code` picking an arbitrary TIPLOC as
`stop_code` (`CIFRepository.ts:49-65`). Stations with several TIPLOCs — separate bay
platforms, through platforms, or the two halves of a split station — collapse to one
point, and stop times at non-CRS TIPLOCs are dropped outright
(`CIFRepository.ts:107`).

This one is a *self-inflicted* loss: GTFS can model it. `location_type: 1` parent
stations with `location_type: 0` children and `platform_code` would carry TIPLOC-level
detail properly. Today the platform is stuffed into `stop_headsign`
(`ScheduleBuilder.ts:130`), which is not what that field means.

### Activity codes

The DTD activity field carries up to six two-character codes covering both public
behaviour and operational events (crew change, attach/detach, water, examination). Only
six are read (`ScheduleBuilder.ts:9-12,112-115`); the rest are discarded. GTFS's
`pickup_type`/`drop_off_type` are a four-value enum and cannot hold more. Two details of
the current mapping drift slightly:

- `R` (stops when required) sets **both** pickup and drop-off to 3, overriding whatever
  the real pickup/set-down permission was.
- `N` (not advertised) suppresses pickup but not drop-off — the `notAdvertised` check is
  applied to `pickup` only (`ScheduleBuilder.ts:113-115`).

## 3. Not representable in pure GTFS

### Fixed links (ALF and FLF) — the clearest blocker

An additional fixed link is a walk, tube, bus or transfer leg between two stations with a
duration, **a time-of-day window, a day-of-week mask and a date range**
(`config/timetable/file/ALF.ts:55-72`). GTFS `transfers.txt` has none of those: no
validity period, no operating days, no time window, no mode. That is precisely why this
exporter invents `links.txt` (`OutputGTFSCommand.ts:45`) and a `links` table
(`config/gtfs/schema.ts:46-63`) instead.

The pure-GTFS workarounds all distort:

- Emit `transfers.txt` rows and drop the restrictions — wrong outside the window, and
  loses the mode, so the planner cannot tell "20 minute walk" from "20 minutes on the
  Tube".
- Model each link as a route with trips at some headway — technically valid, but invents
  a departure timetable for something that has none, and inflates the feed enormously.

Neither is "correct". This alone means a pure-GTFS feed cannot carry the DTD timetable
feed in full.

### TOC-specific interchange times (TSI)

`toc_interchange` gives a minimum connection time per (station, from-TOC, to-TOC)
triple (`config/timetable/file/TSI.ts`). GTFS transfers can be qualified by route or trip
pair, but not by agency pair, so expressing this means enumerating the cross-product of
every route of the first operator against every route of the second, at that station.
Finite, so arguably "representable", but combinatorially absurd. The exporter imports the
file and never uses it — `toc_interchange` appears nowhere in `src/`.

### Operational and commercial attributes

First class availability, reservations (`R`/`S`/`A`), sleepers, catering code, power type,
timing load, speed, business sector, service branding, bank holiday running — none has a
GTFS field. What survives does so as prose in `route_desc`
(`src/gtfs/native/Schedule.ts:88`), which is human-readable and machine-useless.

`bank_holiday_running` deserves a specific mention: the flag is parsed and stored
(`config/timetable/file/MCA.ts:73`) but never read by the export — it appears nowhere in
`src/`. Services flagged as not running on bank holiday Mondays are therefore shown as
running. GTFS *could* express this via `calendar_dates` exceptions, but only with an
external bank holiday calendar, which the DTD feed does not include. So this one is
representable in GTFS yet not derivable from DTD alone.

### The fares feed and routeing guide

This is where the answer stops being "lossy" and becomes "no".

- **Routeing guide (RJRG)** — permitted routes, maps, route links, exclusions. It is a
  graph-constraint language over journeys. GTFS has no concept of a journey being
  permitted or not. There is no partial mapping.
- **Fares (RJFAF)** — flow-based origin/destination fares keyed by route code, ticket
  type, railcard, restriction code, with date ranges, time bands, price bands and
  supplements (19 record types in `config/fares/file/`). GTFS-Fares v2 could express a
  narrow subset — simple point-to-point products — but it is an extension to the
  reference, not part of "pure GTFS", and it has no vocabulary for railcards,
  restriction codes or routeing.
- **NFM64** — likewise unrepresented.

Since the question is about DTD data rather than the timetable specifically, this is
decisive on its own.

## 4. Where the current output is not pure GTFS today

Distinct from what GTFS *can't* express, the following are places this exporter departs
from the spec where it need not. They are the fixable list.

- **`links.txt`** is not a GTFS file. Nothing in the reference defines it.
- **`route_type: 714`** for rail replacement buses (`src/gtfs/file/Route.ts:26`) comes
  from the extended route type vocabulary, which is an extension proposal; the reference
  enumerates 0–12. Widely tolerated by consumers, still not pure.
- **`trip_headsign` holds the train UID** (`Schedule.ts:66`). The field means the
  destination text shown to passengers.
- **`stop_headsign` holds the platform** (`ScheduleBuilder.ts:130`). Should be
  `platform_code` on a child stop.
- **`stop_desc` holds `cate_interchange_status`** (`CIFRepository.ts:53`), a numeric code,
  not a description.
- **`wheelchair_accessible: 1` on every trip** (`Schedule.ts:70`) asserts wheelchair
  capacity the DTD feed never states. Fabricated accessibility data is worse than absent
  data; `0` (no information) is the honest value.
- **`direction_id: 0` on every trip** — harmless but meaningless.
- **Routes are synthesised** as operator + origin + destination + mode
  (`Schedule.ts:78-90`). GB rail has no route concept in the DTD feed, so something must
  be invented; this is a defensible invention, but `route_short_name` values like
  `GW:PAD->PLY:2` are internal keys leaking into a passenger-facing field.
- **No `feed_info.txt`** — recommended, and its absence raises a validator warning.
- **Orphan service IDs.** `createCalendar` runs over every schedule
  (`OutputGTFSCommand.ts:48`), but `copyTrips` skips schedules with one stop or fewer
  (`OutputGTFSCommand.ts:92`), so `calendar.txt` can contain services no trip references.
- **Three-month horizon.** The exporter only takes schedules starting within the range
  (`OutputGTFSCommand.ts:38`, `CIFRepository.ts:109`), and — as the README notes —
  overlays and cancellations beyond it are dropped too, so data near the boundary is
  incomplete rather than merely absent. A performance choice, not a GTFS limitation.
- **Irish stations** get `stop_timezone: Europe/Dublin` (`CIFRepository.ts:59`) while
  their times are exported as-is. GTFS requires stop times in the agency's timezone.
  Currently harmless because Ireland and the UK share an offset year-round, but it is a
  latent assumption rather than a correct mapping.

## Conclusion

For the **timetable feed**, GTFS is an adequate but lossy target. A journey planner fed
this output will, for most queries, return the same result as one fed DTD directly. That
is a real and useful property, and it is what this exporter delivers. Making the output
*pure* is mostly achievable: fix the field misuse, model platforms as child stops, emit
`feed_info.txt`, drop 714 for 3. The one thing that cannot be fixed while staying pure is
`links.txt` — fixed links must either leave the feed or be misrepresented.

What GTFS can never carry, at any level of effort:

1. Time-restricted, mode-typed fixed links (ALF/FLF).
2. Every commercial and operational attribute — class, reservations, sleepers, catering,
   power type, branding.
3. The entire fares feed and routeing guide.

Note what is *not* on that list. Joins, splits and mid-journey service changes are all
expressible with linked trips (`transfer_type=4`) — they are currently lost because of
how this exporter works, not because GTFS lacks the vocabulary. Platform granularity is
the same story: `parent_station` plus `platform_code` would carry it. Those are the
tractable improvements, and upstream #81 already tracks the first.

So the accurate framing is not "can DTD be represented as GTFS" but "GTFS is a lossy
projection of DTD suitable for journey-plan *rendering*, not a substitute for the feed."
Anything needing fares, permitted routes, portion working or train identity must read
DTD. If a pure-GTFS artefact is a hard requirement — for an off-the-shelf consumer, say —
it should be treated as a derived, disposable export, with the DTD import kept as the
system of record. That is what this repository already does; the honest change would be
to document the losses rather than to try to close them.
