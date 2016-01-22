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
 *   zabbixSender: Path to zabbix_sender utility.
 *
 */

var util = require('util'),
    proc = require('child_process');

var debug;
var flushInterval;
var zabbixHost;
var zabbixPort;
var zabbixSender;

var zabbixStats = {};

var post_stats = function zabbix_post_stats(statString) {
  if (zabbixHost) {
    if (debug) {
      util.log(statString);
    }

    try {
      var zabbixExec = proc.exec(zabbixCmd, function(error, stdout, stderr) {
        if (error && error.code !== 0 && debug) {
          util.log(zabbixSender + ': ' + stderr);
        }
      });

      zabbixExec.stdin.write(statString);
      zabbixExec.stdin.end();
    } catch(e) {
      if (debug) {
        util.log(e);
      }
      zabbixStats.last_exception = Math.round(new Date().getTime() / 1000);
    }
  }
}

var zabbix_host_key = function (key) {
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
        key = remaining.
          join('.').
          replace(/_/g, '.');
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

var flush_stats = function zabbix_flush(ts, metrics) {
  var statString = '';
  var numStats = 0;
  var key;
  var zabbix;

  var counters = metrics.counters;
  var gauges = metrics.gauges;
  var timers = metrics.timers;
  var pctThreshold = metrics.pctThreshold;

  for (key in counters) {
    var value = counters[key];
    var valuePerSecond = value / (flushInterval / 1000); // calculate "per second" rate

    zabbix = zabbix_host_key(key);

    statString += zabbix.host + ' ' + zabbix.key + '[total] ' + ts + ' ' + value          + "\n";
    statString += zabbix.host + ' ' + zabbix.key + '[avg] '   + ts + ' ' + valuePerSecond + "\n";

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
        message += zabbix.host + ' ' + zabbix.key + '[mean]['  + clean_pct + '] ' + ts + ' ' + mean           + "\n";
        message += zabbix.host + ' ' + zabbix.key + '[upper][' + clean_pct + '] ' + ts + ' ' + maxAtThreshold + "\n";
      }

      message += zabbix.host + ' ' + zabbix.key + '[upper] ' + ts + ' ' + max   + "\n";
      message += zabbix.host + ' ' + zabbix.key + '[lower] ' + ts + ' ' + min   + "\n";
      message += zabbix.host + ' ' + zabbix.key + '[count] ' + ts + ' ' + count + "\n";
      statString += message;

      numStats += 1;
    }
  }

  for (key in gauges) {
    zabbix = zabbix_host_key(key);

    statString += zabbix.host + ' ' + zabbix.key + ' ' + ts + ' ' + gauges[key] + "\n";
    numStats += 1;
  }

  post_stats(statString);
};

var backend_status = function zabbix_status(writeCb) {
  for (stat in zabbixStats) {
    writeCb(null, 'zabbix', stat, zabbixStats[stat]);
  }
};

exports.zabbix_host_key = zabbix_host_key;

exports.init = function zabbix_init(startup_time, config, events) {
  debug = config.debug;
  zabbixHost = config.zabbixHost;
  zabbixPort = config.zabbixPort;
  zabbixSender = config.zabbixSender;
  zabbixCmd = zabbixSender + ' -T -i - -z ' + zabbixHost + ' -p ' + zabbixPort;

  zabbixStats.last_flush = startup_time;
  zabbixStats.last_exception = startup_time;

  flushInterval = config.flushInterval;

  events.on('flush', flush_stats);
  events.on('status', backend_status);

  return true;
};
