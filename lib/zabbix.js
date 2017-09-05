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
 *   zabbixSender: Path to zabbix_sender utility. (leave blank to use node-zabbix-sender module instead)
 *
 *   Optional
 *   hostname: Static hostname associated with the stats to send to zabbix
 *             If provided, StatsD Zabbix backend will not attempt to decode a 
 *             hostname from each key
 *
 */

var util = require('util'),
    proc = require('child_process');

var debug;
var flushInterval;
var zabbixHost;
var zabbixPort;
var zabbixCmd;
var zabbixSender = null;
var senderModule;

var zabbixStats = {};

var post_stats = function zabbix_post_stats(statString) {
  if (zabbixHost) {
    if(zabbixCmd) {
      // we're spawning a child process to run the shell zabbix_sender command
      try {
        var zabbixExec = proc.exec(zabbixCmd, function (error, stdout, stderr) {
          if (error && error.code !== 0 && debug) {
            util.log(zabbixSender + ': ' + stderr);
          }
        });

        zabbixExec.stdin.write(statString);
        zabbixExec.stdin.end();
      } catch (e) {
        if (debug) {
          util.log(e);
        }
        zabbixStats.last_exception = Math.round(new Date().getTime() / 1000);
      }
    }
    else {
      // we're using the module, not a shell command, so no child process
      try {
        var Sender = new senderModule({host: zabbixHost, with_timestamps: true, items_host: '68.226.99.8'});
        // statString is a bunch of lines to be parsed and added one at a time.
        var statArray = statString.split('\n');
        statArray.forEach(function (v, i, array) {
          var data = v.split(' ', 4);
          if (data[1]) {  // there might be a blank line at the end.
            // third one is always the timestamp so leave that out.
            Sender.addItem([data[0], data[1]].join('.'), data[3]);
            if (debug) {
              util.log([data[0], data[1]].join('.'), data[3]);
            }
          }
        });


        Sender.send(function (err, res) {
          if (err) {
            throw err;
          }

          // print the response object - for testing
          if (debug) {
            util.log(res);
          }
        });



      } catch (e) {
        if (debug) {
          util.log('node-zabbix-sender error: ' + e);
        }
      }
    }
  }
}

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

var flush_stats = function zabbix_flush(zabbix_host_key, ts, metrics) {
  console.log('flushing stats...');
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

exports.zabbix_host_key_from_encoding = zabbix_host_key_from_encoding;
exports.zabbix_host_key_from_config = zabbix_host_key_from_config;

exports.init = function zabbix_init(startup_time, config, events) {
  debug = config.debug;
  zabbixHost = config.zabbixHost;
  zabbixPort = config.zabbixPort;
  zabbixSender = config.zabbixSender;
  zabbix_host_key = config.hostname ? zabbix_host_key_from_config.bind(undefined, config.hostname) : zabbix_host_key_from_encoding;

  if(zabbixSender) {
    zabbixCmd = zabbixSender + ' -T -i - -z ' + zabbixHost + ' -p ' + zabbixPort;
  }
  else {
    senderModule = require('node-zabbix-sender');
  }

  zabbixStats.last_flush = startup_time;
  zabbixStats.last_exception = startup_time;

  flushInterval = config.flushInterval;

  events.on('flush', flush_stats.bind(undefined, zabbix_host_key));
  events.on('status', backend_status);

  return true;
};

