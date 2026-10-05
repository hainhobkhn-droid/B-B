'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// Execute the actual shared helper with the caller's DOM/RPC fixture context.
module.exports = context => {
  const app = fs.readFileSync(path.resolve(__dirname, '../../app.js'), 'utf8');
  const source = app.slice(app.indexOf('// WP-C8 SHARED LIST START'), app.indexOf('// WP-C8 SHARED LIST END'));
  const scope = { ...context, fold: value => String(value).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase() };
  vm.runInNewContext(source + '\nthis.createList = paginatedList;', scope);
  return scope.createList;
};
