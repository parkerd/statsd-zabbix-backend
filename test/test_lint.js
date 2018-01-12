const lint = require('mocha-eslint');

const paths = [
  'lib',
  'test',
];

lint(paths);