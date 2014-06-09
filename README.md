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

Zabbix will receive data for host "host.example.com" on key "my.key" of type "Zabbix trapper".

### Logstash
Logstash's statsd output sends data in the format namespace.sender.metric.

- namespace: default is "logstash"
- sender: default is "%{host}", replacing dots with underscores
- metric: name of the metric used in increment

To use this plugin, assign metric names in your logstash config using underscores like "my_key" to have Zabbix receive data on key "my.key" of type "Zabbix trapper".

Using the general example, logstash would send: `logstash.host_example_com.my_key:1|c`.

## Issues
I have only tested using counters, but changes have been made so other metric types should work.
