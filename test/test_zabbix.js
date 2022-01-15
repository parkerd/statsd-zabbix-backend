const hostname = require('os').hostname();
const assert = require('assert');
const events = require('events');
const logger = require('util');
const forEach = require('mocha-each');
const sinon = require('sinon');
const zabbix = require('../lib/zabbix');

const config = {
  flushInterval: 1,
};
const ee = new events.EventEmitter();

describe('decode stat -> {host, key}', () => {
  forEach([
    ['host_first', 'host', 'first'],
    ['host.name_first', 'host.name', 'first'],
    ['host.name_first.second', 'host.name', 'first.second'],
    ['host.example.com_my.key', 'host.example.com', 'my.key'],
    ['statsd.some_data', hostname, 'statsd.some_data'],
    ['logstash.host.first', 'host', 'first'],
    ['logstash.host.first_second', 'host', 'first.second'],
    ['logstash.host_name.first_second', 'host.name', 'first.second'],
    ['kamon.host_name.first_second', 'host.name', 'first_second'],
  ]).it("parses stat '%s' into host '%s' and key '%s'", (stat, host, key) => {
    const target = zabbix.targetDecode(stat);
    assert.equal(target.host, host);
    assert.equal(target.key, key);
  });

  it('handles invalid stats properly', () => {
    assert.throws(zabbix.targetDecode.bind(undefined, 'stat'), Error);
  });
});

describe('static host, stat as key', () => {
  it('returns hostname from config, full stat as key', () => {
    const host = 'host';
    const stat = 'my.statsd.key';
    const target = zabbix.targetStatic(host, stat);
    assert.equal(target.host, host);
    assert.equal(target.key, stat);
  });
});

describe('metrics to items', () => {
  it('counters generate total and avg items', () => {
    const items = zabbix.itemsForCounter(10000, 'test', 'key', 100);
    assert.equal(items.length, 2);

    const [total, avg] = items;
    assert.equal(total.key, 'key[total]');
    assert.equal(total.value, 100);
    assert.equal(avg.key, 'key[avg]');
    assert.equal(avg.value, 10);
  });

  it('timers generate lower, upper, count, and mean, max at each percentile', () => {
    const percentiles = [95, 99];
    const numItems = (percentiles.length * 2) + 3;
    const values = [];

    for (let i = 1; i <= 100; i += 1) {
      values.push(i);
    }

    const items = zabbix.itemsForTimer(percentiles, 'test', 'key', values);
    assert.equal(items.length, numItems);

    const [lower, upper, count, mean95, upper95, mean99, upper99] = items;
    assert.equal(lower.key, 'key[lower]');
    assert.equal(lower.value, 1);
    assert.equal(upper.key, 'key[upper]');
    assert.equal(upper.value, 100);
    assert.equal(count.key, 'key[count]');
    assert.equal(count.value, 100);
    assert.equal(mean95.key, 'key[mean][95]');
    assert.equal(mean95.value, 48);
    assert.equal(upper95.key, 'key[upper][95]');
    assert.equal(upper95.value, 95);
    assert.equal(mean99.key, 'key[mean][99]');
    assert.equal(mean99.value, 50);
    assert.equal(upper99.key, 'key[upper][99]');
    assert.equal(upper99.value, 99);
  });

  it('gauges generate a single item with current value', () => {
    const items = zabbix.itemsForGauge('test', 'key', 100);
    assert.equal(items.length, 1);

    const [item] = items;
    assert.equal(item.key, 'key');
    assert.equal(item.value, 100);
  });
});

// TODO: improve tests
describe('plugin works', () => {
  it('can run init', () => {
    zabbix.init(0, config, ee, logger);
  });

  it('can flush stats', () => {
    logger.log = sinon.spy();
    zabbix.init(0, config, ee, logger);
    ee.emit('flush', 0, {
      counters: {},
      timers: {},
      gauges: {},
      pctThreshold: [],
    });
    sinon.assert.called(logger.log);
    assert.equal(zabbix.stats.flush_length, 0);
  });

  it('can write status', () => {
    const spy = sinon.spy();
    zabbix.init(0, config, ee, logger);
    ee.emit('status', spy);
    sinon.assert.called(spy);
  });
});
