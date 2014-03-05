/* global PouchDBVersion110,PouchDBVersion200,PouchDB */
'use strict';

var scenarios = [
  ['PouchDB v1.1.0', 'PouchDB'],
  ['PouchDB v2.0.0', 'PouchDB'],
  ['websql', 'idb'],
  ['websql', 'websql']
];

describe('migration', function () {

  var constructors = {
    'PouchDB v1.1.0': PouchDBVersion110,
    'PouchDB v2.0.0': PouchDBVersion200,
    PouchDB: PouchDB
  };

  scenarios.map(function (scenario) {

    if (scenario.filter(function (pouchType) {
      var isAdapter = ['websql', 'idb'].indexOf(pouchType) !== -1;
      return isAdapter && !(pouchType in PouchDB.adapters);
    }).length) {
      return; // scenario doesn't make sense for this browser
    }

    var suiteName = 'migrate from ' + scenario[0] + ' to ' + scenario[1];

    describe(suiteName, function () {
      var dbs = {
      };

      beforeEach(function (done) {
        // need actual unique db names for these tests
        var localName = testUtils.adapterUrl('local', 'test_migration_local');
        var remoteName = testUtils.adapterUrl('http', 'test_migration_remote');

        var firstLocal = scenario[0] in PouchDB.adapters ?
          scenario[0] + '://' + localName : localName;

        var secondLocal = scenario[1] in PouchDB.adapters ?
          scenario[1] + '://' + localName : localName;

        dbs.first = {
          pouch : constructors[scenario[0]] || PouchDB,
          local : firstLocal,
          remote : remoteName
        };

        dbs.second = {
          pouch : constructors[scenario[1]] || PouchDB,
          local : secondLocal,
          remote : remoteName
        };

        testUtils.cleanup([dbs.first.local, dbs.second.local], done);

      });

      afterEach(function (done) {
        testUtils.cleanup([dbs.first.local, dbs.second.local], done);
      });

      var origDocs = [
        {_id: '0', a: 1, b: 1},
        {_id: '3', a: 4, b: 16},
        {_id: '1', a: 2, b: 4},
        {_id: '2', a: 3, b: 9}
      ];

      it('Testing basic migration integrity', function (done) {
        var oldPouch = new dbs.first.pouch(dbs.first.local, function (err) {
          should.not.exist(err, 'got error: ' + JSON.stringify(err));
          if (err) {
            done();
          }
        });
        oldPouch.bulkDocs({docs: origDocs}, function (err, res) {
          origDocs[0]._deleted = true;
          origDocs[0]._rev = res[0].rev;
          oldPouch.remove(origDocs[0], function (err, res) {
            oldPouch.close(function (err) {
              should.not.exist(err, 'got error: ' + JSON.stringify(err));
              var newPouch = new dbs.second.pouch(dbs.second.local);
              newPouch.then(function (newPouch) {
                return newPouch.allDocs({key: '2'});
              }).then(function (res) {
                  res.total_rows.should.equal(3);
                  res.rows.should.have.length(1);
                  return newPouch.allDocs({key: '0'});
                }).then(function (res) {
                  res.total_rows.should.equal(3);
                  res.rows.should.have.length(0);
                  done();
                }).catch(function (err) {
                  should.not.exist(err, 'got error: ' + JSON.stringify(err));
                  done();
                });
            });
          });
        });
      });

      it("Test basic replication with migration", function (done) {

        var docs = [
          {_id: "0", integer: 0, string: '0'},
          {_id: "1", integer: 1, string: '1'},
          {_id: "2", integer: 2, string: '2'},
          {_id: "3", integer: 3, string: '3', _deleted : true},
          {_id: "4", integer: 4, string: '4', _deleted : true}
        ];

        new dbs.first.pouch(dbs.first.remote, function (err, oldPouch) {
          should.not.exist(err, 'got error in constructor: ' + JSON.stringify(err));
          if (err) {
            done();
          }
          oldPouch.bulkDocs({docs: docs}, {}, function (err, res) {
            should.not.exist(err, 'got error in bulkDocs: ' + JSON.stringify(err));
            oldPouch.replicate.to(dbs.first.local, {}, function (err, result) {
              should.not.exist(err, 'got error in replicate: ' + JSON.stringify(err));
              if (err) {
                done();
              }
              should.exist(result.ok, 'replication was ok');
              oldPouch.close(function (err) {
                should.not.exist(err, 'got error in close: ' + JSON.stringify(err));
                if (err) {
                  done();
                }
                new dbs.first.pouch(dbs.first.local, function (err, oldLocalPouch) {
                  should.not.exist(err, 'got error: ' + JSON.stringify(err));
                  if (err) {
                    done();
                  }
                  oldLocalPouch.close(function (err) {
                    should.not.exist(err, 'got error in close: ' + JSON.stringify(err));
                    if (err) {
                      done();
                    }
                    new dbs.second.pouch(dbs.second.local, function (err, newPouch) {
                      should.not.exist(err, 'got error in 2nd constructor: ' + JSON.stringify(err));
                      if (err) {
                        done();
                      }
                      newPouch.allDocs({}, function (err, res) {
                        should.not.exist(err, 'got error in allDocs: ' + JSON.stringify(err));
                        res.rows.should.have.length(3, 'unexpected rows: ' + JSON.stringify(res.rows));
                        res.total_rows.should.equal(3);
                        done();
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});