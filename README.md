# StatsD Zabbix backend

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

## Usage
This plugin is primarily designed for use with logstash > statsd > zabbix pipline, but should work for getting data from any source into Zabbix.

### General
Send your host:key separated by an underscore, for example: example.com_my.key:1|c

### Logstash
Logstash automatically converts hostnames like example.com to example_com.  This backend will convert all _ in both hostname and key to . before sending to zabbix, but it should also work as expected to use . as the key separator in your logstash config.

## Issues
I have only tested using counters, but changes have been made so other metric types should work.
