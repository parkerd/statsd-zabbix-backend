# StatsD Zabbix backend

Backend for [StatsD](https://github.com/etsy/statsd) to publish stats to Zabbix.

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [Installation](#installation)
- [Configuration](#configuration)
  - [Options](#options)
- [Usage](#usage)
  - [Zabbix](#zabbix)
  - [General](#general)
  - [Static Hostname](#static-hostname)
  - [Logstash](#logstash)
    - [Counters](#counters)
    - [Timers](#timers)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Installation

Tested with Node 6+.

```
npm install statsd-zabbix-backend
```

## Configuration

Example StatsD configuration:

```js
{
  debug: true,
  flushInterval: 10000,
  percentThreshold: [95, 99],
  backends: ["statsd-zabbix-backend"],
  zabbixHost: "zabbix.example.com",
}
```

### Options

- `zabbixHost`: Hostname or IP for Zabbix server [default: localhost]
- `zabbixPort`: Port for Zabbix server [default: 10051]
- `zabbixSendTimestamps`: Send timestamps to Zabbix, otherwise  [default: false]
- `zabbixTargetHostname`: Set static hostname, use full stat as key [default: undefined]

## Usage

This plugin is primarily designed for use with logstash > statsd > zabbix pipline,
but should work for getting data from any source into Zabbix.

### Zabbix

All Zabbix items are expected to be type `Zabbix trapper` to support receiving push data.

Most values should be `decimal`. Average (avg) or mean values should be `float`.

### Stat Names

Send your host and key separated by an underscore, for example:

```
host.example.com_my.key:1|c
```

Stats starting with any of the following prefixes will be handled differently:

- `logstash.`
- `kamon.`
- `statsd.`

### Static Hostname

If you run statsd on each host, set option `zabbixTargetHostname`
to send all stats to a single host. In this mode, the full stat name
will be used as the item key in Zabbix.

### Logstash

Logstash's statsd output sends data in the format `namespace.sender.metric`.

- namespace: default is "logstash"
- sender: default is "%{host}", replacing dots with underscores
- metric: name of the metric used in increment

See Logstash examples for specific keys Zabbix will receive based on metric type.

**Note:** `sender` and `metric` will have underscores replaced by periods
before being sent to Zabbix.

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

Statsd calculates 2 values every `flushInterval` and sends each as a separate key to Zabbix for host "host.example.com":

- `my.key[avg]`
- `my.key[total]`

#### Timers

Logstash statsd output using timing:

```
{
  statsd {
    host => "127.0.0.1"
    timing => {
      "my_key" => "1"
    }
  }
}
```

Logstash sends to Statsd: `logstash.host_example_com.my_key:1|ms`

Given the percentThreshold in the example Statsd config, each of the following values would be calculated every flushInterval and sent as a separate keys to Zabbix for host "host.example.com":

- `my.key[mean][95]`
- `my.key[upper][95]`
- `my.key[mean][99]`
- `my.key[upper][99]`
- `my.key[upper]`
- `my.key[lower]`
- `my.key[count]`

#### Gauges

Gauges are also supported.

```
{
  statsd {
    host => "127.0.0.1"
    gauge => {
      "my_key" => "1"
    }
  }
}
```

Logstash sends to Statsd: `logstash.host_example_com.my_key:1|g`

Zabbix will receive a single item:

- `my.key`