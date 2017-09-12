/*
 * Flush stats to zabbix (http://www.zabbix.com/).
 *
 * To enable this backend, include 'statsd-zabbix-backend'
 * in the backends * configuration array:
 *
 *   backends: ['statsd-zabbix-backend']
 *
 * This backend supports the following config options:
 *
 *   zabbixHost: Hostname of zabbix server.
 *   zabbixPort: Port to contact zabbix server at.
 *   zabbixTimeout: true or false
 *
 *   Optional option:
 *   hostname: Static hostname/IP associated with the stats to send to zabbix
 *             If not provided, StatsD Zabbix backend will  attempt to decode a
 *             hostname from each key
 *             note that this must match the hostname in Zabbix, and remember
 *             to "allow" that host in each Zabbix trap item that you're tracking.
 *
 */

var util = require('util'),
    proc = require('child_process');
var senderModule = require('node-zabbix-sender');

var debug;
var flushInterval;
var zabbixHost;
var zabbixPort;
var zabbixTimestamps;
var zabbixSender;

var zabbixStats = {};

var zabbix_host_key_from_encoding = function (key) {
    // Logstash uses a . separator, but what is standard?
    var host_key = key.split('.');

    // Handle a namespace in front of host.key
    if (host_key.length >= 3) {
      var namespace = host_key[0];
      var host = host_key[1];
      var remaining = host_key.slice(2);

      // When the key is greater than 3 then we join the tail of host key
      var key = remaining.join('_');

      // Replace underscores with periods
      if (namespace === "logstash") {
        host = host.replace(/_/g, '.');
        key = remaining.join('.').replace(/_/g, '.');
      }

      if (namespace === "kamon") {
        host = host.replace(/_/g, '.');
        key = remaining.join('_');
      }
    } else {
      // Split on host_key by default separator
      host_key = key.split('_');
      var host = host_key[0];
      var key = host_key[1];
    }

    return {
      'host': host,
      'key': key
    }
}

var zabbix_host_key_from_config = function (host, key) {
    return {
        'host': host,
        'key': key
    };
}

/**
 * Periodically collate and send the data to zabbix
 * @param zabbix_host_key
 * @param ts - timestamp
 * @param metrics
 */
var flush_stats = function zabbix_flush(zabbix_host_key, ts, metrics) {
  if (debug) {
    util.log('flushing stats. ' + ts);  // TODO: do we need ts?
  }
  var statString = '';
  var numStats = 0;
  var key;
  var zabbix;

  var counters = metrics.counters;
  var gauges = metrics.gauges;
  var timers = metrics.timers;
  var pctThreshold = metrics.pctThreshold;

  if (zabbixHost) {
    // we're using only the module now, not a shell command
    var senderConfig = {
      host: zabbixHost,
      port: zabbixPort,
      with_timestamps: zabbixTimestamps
    };
  }
  else {
    throw('zabbixHost is required.');
  }

  var Sender = new senderModule(senderConfig);

  // we don't need to construct the elaborate statString now that we're using the node-zabbix-sender module.
  // we just add each item to the sender object.
  for (key in counters) {
    var value = counters[key];
    var valuePerSecond = value / (flushInterval / 1000); // calculate "per second" rate

    zabbix = zabbix_host_key(key);

    // note that if with_timestamps is set, timestamps will be added to each item when sent.
    Sender.addItem(zabbix.host, zabbix.key + '[total]', value);
    Sender.addItem(zabbix.host, zabbix.key + '[avg]', valuePerSecond);

    numStats += 1;
  }

  for (key in timers) {
    if (timers[key].length > 0) {
      var values = timers[key].sort(function (a,b) { return a-b; });
      var count = values.length;
      var min = values[0];
      var max = values[count - 1];

      var mean = min;
      var maxAtThreshold = max;

      var message = "";

      zabbix = zabbix_host_key(key);

      var key2;

      for (key2 in pctThreshold) {
        var pct = pctThreshold[key2];
        if (count > 1) {
          var thresholdIndex = Math.round(((100 - pct) / 100) * count);
          var numInThreshold = count - thresholdIndex;
          var pctValues = values.slice(0, numInThreshold);
          maxAtThreshold = pctValues[numInThreshold - 1];

          // average the remaining timings
          var sum = 0;
          for (var i = 0; i < numInThreshold; i++) {
            sum += pctValues[i];
          }

          mean = sum / numInThreshold;
        }

        var clean_pct = '' + pct;
        clean_pct.replace('.', '_');
        Sender.addItem(zabbix.host, zabbix.key + '[mean]['  + clean_pct + ']', mean);
        Sender.addItem(zabbix.host, zabbix.key + '[upper][' + clean_pct + ']', maxAtThreshold);
      }

      Sender.addItem(zabbix.host, zabbix.key + '[upper]', max);
      Sender.addItem(zabbix.host, zabbix.key + '[lower]', min);
      Sender.addItem(zabbix.host, zabbix.key + '[count]', count);

      numStats += 1;
    }
  }

  for (key in gauges) {
    zabbix = zabbix_host_key(key);

    Sender.addItem(zabbix.host, zabbix.key, gauges[key]);
    numStats += 1;
  }

  if (debug) {
    util.log(Sender.items);
  }

  // now actually send the items to zabbix
  Sender.send(function (err, res) {
    if (debug && err) {
      util.log('node-zabbix-sender send error: ' + err);
    }

    // print the response object - for testing
    if (debug) {
      util.log(res);
    }
  });
};

var backend_status = function zabbix_status(writeCb) {
  for (stat in zabbixStats) {
    writeCb(null, 'zabbix', stat, zabbixStats[stat]);
  }
};

exports.zabbix_host_key_from_encoding = zabbix_host_key_from_encoding;
exports.zabbix_host_key_from_config = zabbix_host_key_from_config;

exports.init = function zabbix_init(startup_time, config, events) {
  debug = config.debug;
  zabbixHost = config.zabbixHost;
  zabbixPort = config.zabbixPort;
  zabbixSender = config.zabbixSender;
  zabbixTimestamps = config.timestamps;
  zabbix_host_key = config.hostname ? zabbix_host_key_from_config.bind(undefined, config.hostname) : zabbix_host_key_from_encoding;

  zabbixStats.last_flush = startup_time;
  zabbixStats.last_exception = startup_time;

  flushInterval = config.flushInterval;

  events.on('flush', flush_stats.bind(undefined, zabbix_host_key));
  events.on('status', backend_status);

  return true;
};

