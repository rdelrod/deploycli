/**
 * deploycli - deploy client for... you guessed it... deploy!
 *
 * @author Jared Allard <jaredallard@outlook.com:
 * @license MIT
 * @version 1.0.0
 **/

'use strict';

const fs      = require('fs'),
      path    = require('path'),
      os      = require('os'),
      grn     = require('git-repo-name'),
      async   = require('async'),
      spawn   = require('child_process').spawn;

let   config;
const LOCAL   = path.join(os.homedir(), '.deploy');
const CONFIG  = path.join(LOCAL, 'default.json');

// our modules
const log     = require('./lib/log.js');

if(fs.existsSync(LOCAL)) {
  config = require(CONFIG);
} else {
  log('error', 'No default production config found!');
  process.exit(1);
}

async.waterfall([
  /**
   * Process our config.
   **/
  function(next) {
    let name = grn.sync();
    return next(false, {
      name: name,
      origin: config.git.replace('{name}', name)
    });
  },

  /**
   * Prepare the enviroment
   **/
  function(config, next) {
    let name = config.name;
    log('checking git repo:', name);
  }
], function(err) {
  if(err) {
    log('error', err);
    process.exit(1);
  }

  log('success', '{name}', 'has been deployed.');
})
