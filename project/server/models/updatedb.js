'use strict';
const server = require('../server');
const mysqlDB = server.dataSources.db;

mysqlDB.autoupdate(function(err, result) {
  if (err) console.log(err);
  console.log('Auto Update Completed.');
  process.exit();
});
