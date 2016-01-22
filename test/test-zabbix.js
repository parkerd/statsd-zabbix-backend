var test = require('unit.js'),
    zabbix = require("../lib/zabbix");

describe('Test key parsing', function() {
    it('longer key', function(){
        var obj = zabbix.zabbix_host_key("test.test.test.test_test.test");

        test.assert(obj.host == "test");
        test.assert(obj.key == "test_test_test_test");});

    it('some normal key', function() {
        var obj = zabbix.zabbix_host_key("test.test.test");

        test.assert(obj.host == "test");
        test.assert(obj.key == "test");
    });

    it('some logstash key', function() {
        var obj = zabbix.zabbix_host_key("logstash.test_1.test_test");

        test.assert(obj.host == "test.1");
        test.assert(obj.key == "test.test");
    });

});
