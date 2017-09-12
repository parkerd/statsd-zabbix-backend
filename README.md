# StatsD Zabbix backend

## Overview

This is a pluggable backend for [StatsD](https://github.com/etsy/statsd), which publishes stats to Zabbix.

## Installation

    npm install statsd-zabbix-backend

## Example Configuration

```js
{
  debug: true,
  flushInterval: 10000,
  percentThreshold: [95, 99],
  backends: ["statsd-zabbix-backend"],
  zabbixPort: 10051,
  zabbixHost: "zabbix.example.com",
  zabbixTimestamps: true,
  hostname: "statsd.example.com"
}
```

## Usage

This plugin is primarily designed for use with logstash > statsd > zabbix pipline, but should work for getting data from any source into Zabbix.

### Zabbix

All Zabbix items are expected to be type "Zabbix trapper" to support receiving data from zabbix_sender.

### General

Send your host:key separated by an underscore, for example: `host.example.com_my.key:1|c`

Alternatively, configure statsd with `hostname` in order to set a static
hostname to be sent to zabbix. For example, you may run statsd on each
zabbix monitored host and configure statsd-zabbix-backend to always send the
hostname of the current host. This is useful for sources other than logstash
which do not encode the hostname in the statsd key.

### Logstash

Logstash's statsd output sends data in the format namespace.sender.metric.

- namespace: default is "logstash"
- sender: default is "%{host}", replacing dots with underscores
- metric: name of the metric used in increment

See Logstash examples for specific keys Zabbix will receive based on metric type.

#### Counters

Logstash statsd output using increment:

```
{
  statsd {
    host => "127.0.0.1"
    increment => ["my_key"]
  }
}
```

Logstash sends to Statsd: `logstash.host_example_com.my_key:1|c`.

Statsd calculates 2 values every flushInterval and sends each as a separate key to Zabbix for host "host.example.com":

- my.key[avg]
- my.key[total]

#### Timers

Logstash statsd output using timing:

```
{
  statsd {
    host => "127.0.0.1"
    timing => ["my_key", "1"]
  }
}
```

Logstash sends to Statsd: `logstash.host_example_com.my_key:1|ms`

Given the percentThreshold in the example Statsd config, each of the following values would be calculated every flushInterval and sent as a separate keys to Zabbix for host "host.example.com":

- my.key[mean][95]
- my.key[upper][95]
- my.key[mean][99]
- my.key[upper][99]
- my.key[upper]
- my.key[lower]
- my.key[count]
