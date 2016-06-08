var test = require('unit.js'),
    zabbix = require("../lib/zabbix");

describe('Test key parsing', function() {
    it('longer key', function(){
        var obj = zabbix.zabbix_host_key_from_encoding("namespace.host.first.second_1.third");

        test.assert(obj.host == "host");
        test.assert(obj.key == "first_second_1_third");});

    it('some normal key', function() {
        var obj = zabbix.zabbix_host_key_from_encoding("namespace.host.first");

        test.assert(obj.host == "host");
        test.assert(obj.key == "first");
    });

    it('some normal key with _', function() {
        var obj = zabbix.zabbix_host_key_from_encoding("namespace.host.first_second");

        test.assert(obj.host == "host");
        test.assert(obj.key == "first_second");
    });


    it('some logstash key', function() {
        var obj = zabbix.zabbix_host_key_from_encoding("logstash.host_1.first_second");

        test.assert(obj.host == "host.1");
        test.assert(obj.key == "first.second");
    });

    it('some kamon key', function() {
        var obj = zabbix.zabbix_host_key_from_encoding("kamon.host_1.first_second");

        test.assert(obj.host == "host.1");
        test.assert(obj.key == "first_second");
    });


    it('some logstash key with no logstash namespace', function() {
        var obj = zabbix.zabbix_host_key_from_encoding("blabla.host_1.first_second");

        test.assert(obj.host == "host_1");
        test.assert(obj.key == "first_second");
    });


});


describe('Test key from configuration', function() {
    it('returns hostname from configuration then key', function() {
        var obj = zabbix.zabbix_host_key_from_config("host", "my.statsd.key");

        test.assert(obj.host == "host");
        test.assert(obj.key == "my.statsd.key");
    });
});
