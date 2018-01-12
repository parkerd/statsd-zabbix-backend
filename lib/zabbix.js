/*
 * Flush stats to Zabbix (http://www.zabbix.com/).
 *
 * To enable this backend, include 'statsd-zabbix-backend'
 * in the backends configuration array:
 *
 *   backends: ['statsd-zabbix-backend']
 *
 * This backend supports the following config options:
 *
 *   zabbixHost: Zabbix sever hostname or IP. [default: localhost]
 *   zabbixPort: Zabbix server port. [default: 10051].
 *   zabbixSendTimestamps: Send StatsD provided timestamp each time data is flushed to Zabbix.
 *                         By default, when false, Zabbix will use the time it received the data.
 *                         [default: false]
 *   zabbixTargetHostname: Static hostname associated with the stats to send to Zabbix.
 *                         If not provided, a hostname will be decoded from the StatsD keys.
 *                         [default: undefined]
 *
 */

const ZabbixSender = require('node-zabbix-sender');
const hostname = require('os').hostname();

const name = 'statsd-zabbix-backend';
const stats = {};

let logger;

/**
 * Returns current unix timestamp in ms.
 * @returns {number} Timestamp.
 */
function tsNow() {
  return Math.round(new Date().getTime() / 1000);
}

/**
 * Write a log.
 * @param {string} level Logging level.
 * @param {string} msg Message to write.
 * @returns {undefined}
 */
function log(level, msg) {
  logger.log(`${name}: ${msg}`, level);
}

const debug = log.bind(undefined, 'DEBUG');
const error = log.bind(undefined, 'ERROR');
const info = log.bind(undefined, 'INFO');

/**
 * Decode {host, key} from a stat.
 * @param {string} stat Metric name to decode.
 * @returns {Object} Object with {host, key} properties.
 */
function targetDecode(stat) {
  let host;
  let key;
  let namespace;

  const parts = stat.split('.');

  if (
    (stat.startsWith('logstash.') || stat.startsWith('kamon.'))
    && parts.length === 3
  ) {
    [namespace, host, key] = parts;

    // Modify target based on namespace
    if (namespace === 'logstash') {
      host = host.replace(/_/g, '.');
      key = key.replace(/_/g, '.');
    } else if (namespace === 'kamon') {
      host = host.replace(/_/g, '.');
    }
  } else if (stat.startsWith('statsd.')) {
    host = hostname;
    key = stat;
  } else {
    // Split parts by default separator
    [host, key] = stat.split('_');
  }

  if (!host || !key) {
    throw new Error(`failed to decode stat: ${stat}`);
  }

  return {
    host,
    key,
  };
}

/**
 * Generate {host, key} using a previously determined hostname.
 * @param {string} host Static hostname to return.
 * @param {string} stat Metric name to use as the key.
 * @returns {Object} Object with {host, key} properties.
 */
function targetStatic(host, stat) {
  return {
    host,
    key: stat,
  };
}

/**
 * Generate items for a counter.
 * @param {number} flushInterval How long stats were collected, for calculating average.
 * @param {string} host Hostname in Zabbix.
 * @param {string} key Item key in Zabbix.
 * @param {number} value Total collected during interval.
 * @returns {array} Array of {host, key, value} objects.
 */
function itemsForCounter(flushInterval, host, key, value) {
  const avg = value / (flushInterval / 1000); // calculate "per second" rate

  return [
    {
      host,
      key: `${key}[total]`,
      value,
    },
    {
      host,
      key: `${key}[avg]`,
      value: avg,
    },
  ];
}

/**
 * Generate items for a timer.
 * @param {array} percentiles Array of numbers, percentiles to calculate mean and max for.
 * @param {string} host Hostname in Zabbix.
 * @param {string} key Item key in Zabbix.
 * @param {number} data All timing values collected during interval.
 * @returns {array} Array of {host, key, value} objects.
 */
function itemsForTimer(percentiles, host, key, data) {
  const values = data.sort((a, b) => (a - b));
  const count = values.length;
  const min = values[0];
  const max = values[count - 1];

  let mean = min;
  let maxAtThreshold = max;

  const items = [
    {
      host,
      key: `${key}[lower]`,
      value: min || 0,
    },
    {
      host,
      key: `${key}[upper]`,
      value: max || 0,
    },
    {
      host,
      key: `${key}[count]`,
      value: count,
    },
  ];

  percentiles.forEach((percentile) => {
    const strPercentile = percentile.toString().replace('.', '_');

    if (count > 1) {
      const thresholdIndex = Math.round(((100 - percentile) / 100) * count);
      const numInThreshold = count - thresholdIndex;
      const percentValues = values.slice(0, numInThreshold);
      maxAtThreshold = percentValues[numInThreshold - 1];

      // Average the remaining timings
      let sum = 0;
      for (let i = 0; i < numInThreshold; i += 1) {
        sum += percentValues[i];
      }

      mean = sum / numInThreshold;
    }

    items.push({
      host,
      key: `${key}[mean][${strPercentile}]`,
      value: mean || 0,
    });
    items.push({
      host,
      key: `${key}[upper][${strPercentile}]`,
      value: maxAtThreshold || 0,
    });
  });

  return items;
}

/**
 * Generate items for a gauge.
 * @param {string} host Hostname in Zabbix.
 * @param {string} key Item key in Zabbix.
 * @param {number} value Current value of the gauge.
 * @returns {array} Array of {host, key, value} objects.
 */
function itemsForGauge(host, key, value) {
  return [
    {
      host,
      key,
      value,
    },
  ];
}

/**
 * Flush metrics data to Zabbix.
 * @param {function} targetBuilder Returns a {host,key} object based on the stat provided.
 * @param {ZabbixSender} sender Instance of ZabbixSender for sending stats to Zabbix.
 * @param {number} flushInterval How long stats were collected, for calculating average.
 * @param {number} timestamp Time of flush as unix timestamp.
 * @param {Object} metrics Metrics provided by StatsD.
 * @returns {undefined}
 */
function flush(targetBuilder, sender, flushInterval, timestamp, metrics) {
  debug(`starting flush for timestamp ${timestamp}`);

  const flushStart = tsNow();
  const handle = (processor, stat, value) => {
    try {
      const { host, key } = targetBuilder(stat);
      processor(host, key, value).forEach((item) => {
        sender.addItem(item.host, item.key, item.value);
        debug(`${item.host} -> ${item.key} -> ${item.value}`);
      });
    } catch (err) {
      stats.last_exception = tsNow();
      error(err);
    }
  };

  const counterProcessor = itemsForCounter.bind(undefined, flushInterval);
  Object.keys(metrics.counters).forEach((stat) => {
    handle(counterProcessor, stat, metrics.counters[stat]);
  });

  const timerProcessor = itemsForTimer.bind(undefined, metrics.pctThreshold);
  Object.keys(metrics.timers).forEach((stat) => {
    handle(timerProcessor, stat, metrics.timers[stat]);
  });

  Object.keys(metrics.gauges).forEach((stat) => {
    handle(itemsForGauge, stat, metrics.gauges[stat]);
  });

  stats.flush_length = sender.items.length;
  debug(`flushing ${stats.flush_length} items to zabbix`);

  // Send the items to Zabbix
  sender.send((err, res) => {
    if (err) {
      stats.last_exception = tsNow();
      error(err);
      // eslint-disable-next-line no-param-reassign
      sender.items = [];
    } else {
      stats.last_flush = timestamp;
      stats.flush_time = flushStart - stats.last_flush;
      debug(`flush completed in ${stats.flush_time} seconds`);
    }
    if (res.info) {
      info(res.info);
    }
  });
}

/**
 * Dump plugin stats.
 * @param {function} writeCb Callback to write stats to.
 * @returns {undefined}
 */
function status(writeCb) {
  Object.keys(stats).forEach((stat) => {
    writeCb(null, 'zabbix', stat, stats[stat]);
  });
}

/**
 * Initalize the plugin.
 * @param {number} startupTime Timestamp StatsD started.
 * @param {Object} config Global configuration provided to StatsD.
 * @param {Object} events Event handler to register actions on.
 * @param {Object} l Global logger instance.
 * @returns {boolean} Status of initialization.
 */
function init(startupTime, config, events, l) {
  logger = l;

  let targetBuilder;
  if (config.zabbixTargetHostname) {
    targetBuilder = targetStatic.bind(undefined, config.zabbixTargetHostname);
  } else {
    targetBuilder = targetDecode;
  }

  const sender = new ZabbixSender({
    host: config.zabbixHost || 'localhost',
    port: config.zabbixPort || '10051',
    with_timestamps: config.zabbixSendTimestamps || false,
  });

  stats.last_flush = 0;
  stats.last_exception = 0;
  stats.flush_time = 0;
  stats.flush_length = 0;

  events.on('flush', flush.bind(undefined, targetBuilder, sender, config.flushInterval));
  events.on('status', status);

  return true;
}

module.exports = {
  init,
  flush,
  status,
  stats,
  itemsForCounter,
  itemsForGauge,
  itemsForTimer,
  targetDecode,
  targetStatic,
};