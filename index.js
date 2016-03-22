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
      prompt  = require('prompt'),
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

const commitChanges = function(config, branch, next) {
  async.waterfall([
    function(n) {
      let add = spawn('git', ['add', '-A', '.']);
      add.on('exit', (code) => {
        if(code !== 0) {
          return n('Failed to add . to staging.');
        }

        return n();
      });
    },

    function(n) {
      log('commit changes on', branch);
      prompt.start();

      prompt.get(['commit'], function(err, result) {
        if(err) {
          return n(err);
        }

        return n(false, result.commit);
      });
    },

    function(message, n) {
      let commit = spawn('git', ['commit', '-am', message]);
      commit.on('exit', (code) => {
        if(code !== 0) {
          return n('Failed to commit changes.');
        }

        return n();
      })
    }
  ], function(err) {
    if(err) {
      return next(err);
    }

    let checkout = spawn('git', ['checkout', config.branch]);
    checkout.on('exit', (code) => {
      if(code !== 0) {
        return next('Failed to checkout after commiting');
      }

      return next(false, config, branch);
    });
  })
}

async.waterfall([
  /**
   * Process our config.
   **/
  function(next) {
    let name = grn.sync();
    return next(false, {
      name: name,
      origin: config.git.replace('{name}', name),
      branch: config.branch
    });
  },

  /**
   * Determine the branch it's on.
   **/
  function(config, next) {
    let name   = config.name;

    log('checking git repo:', name);

    let git = spawn('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
    git.stdout.on('data', (data) => {
      let branch = data.toString('ascii');
      if(branch.split(' ')[1] !== undefined) {
        return next('Failed to determine the branch we\'re on. GOT: '+branch);
      }

      return next(false, config, branch.replace(/\n/g, ''));
    })

    git.stderr.on('data', (data) => {
      return next(data.toString('ascii'));
    })
  },

  /**
   * Check the status of master, if dirty, ask to commit it.
   **/
  function(config, branch, next) {
    let status = require('child_process').spawnSync('git', ['status', '-z']);
    let output = status.output.toString('ascii');

    if(output === ',,') {
      log('master is clean');
      return next(false, branch, config);
    }

    commitChanges(config, branch, next);
  },

  /**
   * If we're not on the production branch, go to it.
   *
   * Also attempt to create the branch if it doesn't actuall exist already.
   **/
   function(config, branch, next) {
     if(branch === config.branch) {
       log('already on', config.branch);
       return next(false, config);
     }

     log('checking out to', config.branch, 'from', branch);
     let git = spawn('git', ['checkout', config.branch]);
     git.stdout.on('data', (data) => {
       data = data.toString('ascii');
       console.log(data);
     });
     git.stderr.on('data', (data) => {
       data = data.toString('ascii');
       if(data === 'error: pathspec \''+config.branch+'\' did not match any file(s) known to git.\n') {
         log('creating branch', config.branch);

         // create the "production" branch
         let branchattempt = spawn('git', ['branch', config.branch]);
         branchattempt.on('exit', (code) => {
           if(code !== 0) {
             return next('Failed to create branch :(');
           }

           // checkout to the "production" branch
           let checkout = spawn('git', ['checkout', config.branch]);
           checkout.on('exit', (code) => {
             if(code !== 0) {
               return next('Failed to checkout after creating branch :(');
             }

             return next(false);
           });
         });
       }

       // check if we need to commit (should be obsolete.)
       if(data.match(/Your local changes/g)) {
         return commitChanges(config, config.branch, next);
       }
     })
     git.on('exit', (code) => {
       try {
         if(code === 0) return next(false, config);
       } catch(e) {
         return
       }
     });
   },

   /**
    * Check the status of the production branch, and merge master.
    **/
   function(config, next) {
     let status = require('child_process').spawnSync('git', ['status', '-z']);
     let output = status.output.toString('ascii');

     if(output === ',,') {
       log('production is clean');
       return next(false, config);
     }

     return next('Production is dirty, this shouldn\'t happen, please examine the tree.')
   },

   /**
    * Merge master in config.branch
    **/
   function(config, next) {
     let merge = spawn('git', ['merge', 'master']);
     merge.stdout.on('data', (data) => {
       data = data.toString('ascii');
     });
     merge.stderr.on('data', (data) => {
       data = data.toString('ascii');
     });
     merge.on('exit', (code) => {
       if(code !== 0) {
         return next('Failed to merge master.');
       }

       return next(false, config);
     });
   },

    /**
     * Push the code to the production branch.
     **/
    function(config, next) {
      let push = spawn('git', ['push', 'origin', config.branch]);
      push.stdout.on('data', (data) => {
        data = data.toString('ascii');
        console.log(data);
      });
      push.stderr.on('data', (data) => {
        data = data.toString('ascii');
        console.error(data);
      });
      push.on('exit', (code) => {
        if(code !== 0) {
          return next('Failed to push to origin');
        }

        return next();
      })
    },

    /**
     * git checkout master to return the state.
     **/
     function(config, next) {
       let checkout = spawn('git', ['checkout', 'master']);
       checkout.on('exit', (code) => {
         if(code !== 0) return next('Failed to checkout back to master');

         log('checkout master')
         return next(false, config);
       });
     }
], function(err, config) {
  if(err) {
    spawn('git', ['checkout', 'master']); // failsafe.
    log('error', err);
    process.exit(1);
  }

  log('success', config.name, 'has been deployed.');
})
