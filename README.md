
![npm](https://img.shields.io/npm/v/dtd2mysql.svg?style=flat-square) ![npm](https://img.shields.io/npm/dw/dtd2mysql.svg?style=flat-square) 


An import tool for the British rail fares, routeing and timetable feeds into a database.

Although both the timetable and fares feed are open data you will need to obtain the fares feed via the [ATOC website](http://data.atoc.org/fares-data). The formal specification for the data inside the feed also available on the [ATOC website](http://data.atoc.org/sites/all/themes/atoc/files/SP0035.pdf).

Every command runs against MySQL, Postgres and SQLite, chosen with `DATABASE_DIALECT` and defaulting to
MySQL. The database driver is yours to choose, so install the one you need alongside this:

| database | install |
| --- | --- |
| MySQL | `mysql2` |
| Postgres | `pg`, and `pg-cursor` as well if you want the GTFS output, which streams |
| SQLite | nothing, it is built into node |

`DATABASE_PORT` defaults to 3306, so Postgres needs it setting to 5432.

## Requirements

Node.js 26 or later. Date handling uses the built-in `Temporal` API, which is only available as a global
from Node 26 onwards.

## Download / Install

You don't have to install it globally but it makes it easier if you are not going to use it as part of another project. The `-g` option usually requires `sudo`. It is not necessary to git clone this repository unless you would like to contribute.

```
npm install -g dtd2mysql
```

## Fares 

Each of these commands relies on the database settings being set in the environment variables. For example `DATABASE_USERNAME=root DATABASE_NAME=fares dtd2mysql --fares-clean`.

### Import

Import the fares into a database, creating the schema if necessary. This operation is destructive and will remove any existing data.

```
dtd2mysql --fares /path/to/RJFAFxxx.ZIP
```
### Clean 

Removes expired data and invalid fares, corrects railcard passenger quantities, adds full date entries to restriction date records. It also records which restriction applies to each origin, destination and route in `network_flow_restriction`.

```
dtd2mysql --fares-clean
```
## Timetables
### Import

Import the timetable information into a database, creating the schema if necessary. This operation is destructive and will remove any existing data.

```
dtd2mysql --timetable /path/to/RJTTFxxx.ZIP
```

### Convert to GTFS

Convert the DTD/TTIS version of the timetable (up to 3 months into the future) to GTFS. 

```
dtd2mysql --timetable /path/to/RJTTFxxx.ZIP
dtd2mysql --gtfs-zip filename-of-gtfs.zip
```

### Load GTFS back into the database

Reads the GTFS files in a directory into a table per file, replacing whatever is already there. The
tables are named after the files, so `stops.txt` becomes `stops`.

```
dtd2mysql --gtfs /path/to/output/
dtd2mysql --gtfs-import /path/to/output/
```

## Routeing Guide
### Import
```
dtd2mysql --routeing /path/to/RJRGxxxx.ZIP
# optional
dtd2mysql --nfm64 /path/to/nfm64.zip 
```

## Download from SFTP server

The download commands will take the latest full refresh from an SFTP server (by default the DTD server).

Requires the following environment variables:

```
SFTP_USERNAME=dtd_username
SFTP_PASSWORD=dtd_password
SFTP_HOSTNAME=dtd_hostname (this will default to dtd.atocrsp.org)
```

There is a command for each feed

```
dtd2mysql --download-fares /path/
dtd2mysql --download-timetable /path/
dtd2mysql --download-routeing /path/
dtd2mysql --download-nfm64 /path/
```

Or download and process in one command

```
dtd2mysql --get-fares
dtd2mysql --get-timetable
dtd2mysql --get-routeing
dtd2mysql --get-nfm64
```

## Notes
### null values

Values marked as all asterisks, empty spaces, or in the case of dates - zeros, are set to null. This is to preverse the integrity of the column type. For instance a route code is numerical although the data feed often uses ***** to signify any so this value is converted to null. 

### keys
Although every record format has a composite key defined in the specification an `id` field is added as the fields in the composite key are sometimes null. This is no longer supported in modern versions of MariaDB or MySQL.

### missing data
At present journey segments, class legends, rounding rules, print formats  and the fares data feed meta data are not imported. They are either deprecated or irrelevant. Raise an issue or PR if you would like them added.

### timetable format

The timetable data does not map to a relational database in a very logical fashion so all LO, LI and LT records map to a single `stop_time` table.

### GTFS feed cutoff date

Only schedule records that **start** up to 3 months into the future (using date of import as a reference point) are exported to GTFS for performance reasons.
This will cause any data after that point to be either incomplete or incorrect, as override/cancellation records after that will be ignored as well.

## Contributing

Issues and PRs are very welcome. To get the project set up run

```
git clone git@github.com:planarnetwork/dtd2mysql
npm install --dev
npm test
```

There is also an integration test that imports every feed and compares every row it writes against
`test/integration/expected`. It needs a database, so it is run separately:

```
docker compose up -d
npm run test:integration
```

It runs against MySQL by default. Set `DATABASE_DIALECT` to `postgres`, or to `sqlite` with
`DATABASE_NAME` pointing at a file, to run the same tests against the same recorded rows on those
instead. Every database is expected to produce the same rows, so one that needs its own expectations is
a bug rather than something to record.

The timetable fixture is hand written and realistic. The fares, routeing and nfm64 fixtures are derived
from the feed definitions by `npm run fixture:generate`, which is only needed when a record definition
changes. The expected rows are updated deliberately with `npm run test:integration -- -u`, and a change
to them should be explained rather than accepted.

If you would like to send a pull request please write your contribution in TypeScript and if possible, add a test.

## License

This software is licensed under [GNU GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html).

Copyright 2017 Linus Norton.
