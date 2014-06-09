# StatsD Zabbix backend

## Overview
This is a pluggable backend for [StatsD](https://github.com/etsy/statsd), which publishes stats to Zabbix.

## Installation

    npm install statsd-zabbix-backend

## Configuration
```js
{
  debug: true,
  flushInterval: 10000,
  backends: ["statsd-zabbix-backend"],
  zabbixPort: 10051,
  zabbixHost: "localhost",
  zabbixSender: "/usr/bin/zabbix_sender"
}
```

## Usage
This plugin is primarily designed for use with logstash > statsd > zabbix pipline, but should work for getting data from any source into Zabbix.

### General
Send your host:key separated by an underscore, for example: `host.example.com_my.key:1|c`

Zabbix will receive data for host "host.example.com" on key "my.key".

### Logstash
Logstash automatically converts hostnames like example.com to example_com. Using the general example, logstash would send: `logstash.host_example_com.my_key:1|c`

Underscores are converted back to periods, so Zabbix will receive data for host "host.example.com" on key "my.key".

## Issues
I have only tested using counters, but changes have been made so other metric types should work.
