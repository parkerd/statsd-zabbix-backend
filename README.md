# StatsD Zabbix publisher backend

## Overview
This is a pluggable backend for [StatsD](https://github.com/etsy/statsd), which publishes stats to Zabbix.

## Installation

    npm install statsd-zabbix-backend

## Configuration
```js
{
  backends: ["statsd-zabbix-backend"],
  zabbixPort: 10051,
  zabbixHost: "localhost",
  zabbixSender: "/usr/bin/zabbix_sender"
}
```

## Issues
I have only tested using counters, but changes have been made so other metric types should work.

My specific use case involves logstash; there is some framework so logstash will work, but which should not affect other uses.
