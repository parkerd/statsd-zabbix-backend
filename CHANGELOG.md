# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.0] - 2017-12-04
### Added
- New option `zabbixSendTimestamps` to send timestamp with data. By default, Zabbix will use the current timestamp.
- New option `zabbixTargetHostname` to specify the Zabbix Host to receive all stats.

### Changed
- Major overhaul to modern JS syntax, Node 6+ supported.
- Utilize StatsD global logger, improved logging.
- `zabbixHost` now has a default of `localhost`.
- `zabbixPort` now has a default of `10051`.

### Removed
- Dependency on `zabbix_sender` binary has been removed (contributed by steevhise).