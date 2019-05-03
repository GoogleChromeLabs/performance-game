/**
Copyright 2018 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/


'use strict';

require('dialog-polyfill');
const commons = require('./common.js');
const settings_module = require('./settings.js');
const dialogs = require('./dialogs.js');
const powerups = require('./powerups.js');

var game;

var settings = settings_module.settings;
var urlToPlay; // the url being played

var showLoadingText = true; // will laternatie between 'loading' and hints
var hintInterval;

var gamestate = {};
var levels = [];
var lastLevel;
var currentLevel;
var currentTime = -1; // the current time in game with respect to resource loading in lighthouse

var ship;
var cursors;
var screenshot;

var bullet;
var bullets;
var bulletTime = 0;
var lastShotTime = Date.now();
var asteroids;

var hearts = [];
var heartWidth = 35;
var heartHeight = 30;

var gameOver = false;
var hitEmitter;


var deferredPrompt;

window.dataLayer = window.dataLayer || [];
function gtag(){ dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', 'UA-123358764-1', { anonymize_ip: true });


window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}

dialogs.setupDialogs(startGame);


function startGame() {
  var url = commons.getInputURL();
  var hostname = (new URL(url)).hostname;
  gtag('event', 'game', {
    event_category: 'start',
    event_label: hostname,
  });
  document.getElementById('urlInputDialog').close();
  getGamestateAndStart();
}

function getGamestateAndStart() {
  // show loading popup
  var dlg = dialogs.showLoadingPopup(game, 'Loading Game...', settings.hints);
  dlg.addEventListener("close", function() {
        // give correct control advice
        // we do not (!!) use user agent here, to accomodate for chrome emulator
        var content = commons.getControlText();
        dialogs.showInfoPopup(game, 'Level ' + currentLevel.levelNumber + '<br>' + currentLevel.name, content);
  });
  // get gamestate from server to start game
  urlToPlay = commons.getInputURL();
  fetch('gamestate.json?url=' + urlToPlay, {mode: 'cors', credentials: 'same-origin'}).then(function(response) {
    // this one is a bit tricky, as phaser is loade deferred.
    // But creating the gameplay on server takes that long, that we can be sure it's loaded at this point
    game = new Phaser.Game(window.innerWidth, window.innerHeight, Phaser.AUTO, 'myCanvas',
      { preload: preload, create: create, update: update, render: render }, true);
    dialogs.setGame(game);
    if (response.ok) {
      console.log('success');
      return response.json();
    }
    throw new Error('Network response was not ok.');
  }).then(function(myJSON) {
    console.log('Startin game with gamestate:');
    console.log(JSON.parse(JSON.stringify(myJSON))); // log a copy, as we'll change the original
    gamestate = myJSON;
    levels = JSON.parse(JSON.stringify(gamestate.levels)); // we'll manipulate that later on, so we'll use a copy
    currentLevel = levels.shift();
    clearInterval(hintInterval);
    dialogs.setLoadingDone(true);
  }).catch(function(error) {
    clearInterval(hintInterval);
    console.log('There has been a problem with your fetch operation: ', error.message);
    console.trace(error);
    dialogs.setInfoCloseFct(function() {document.location.href = '/';});
    dialogs.showInfoPopup(game, "Sorry, we couldn't load this URL right now. Please try a different URL, or come back later.");
  });
}

/**
Something is off with the pausing
**/
function unpauseFix() {
  if(game && game.isBooted && dialogs && !dialogs.isDialogShowing() && game.paused) {
    game.paused = false;
  }
}
setInterval(unpauseFix, 3000);

function preload() {
  game.load.crossOrigin = 'Anonymous';
  game.load.image('asteroid_green', 'img/asteroid_green.png');
  game.load.image('asteroid_red', 'img/asteroid_red.png');
  game.load.image('asteroid_neutral', 'img/asteroid_neutral.png');
  game.load.image('asteroid_orange', 'img/asteroid_orange.png');
  game.load.image('bullet', 'img/bullet.png');
  game.load.image('bullet_strong', 'img/bullet_strong.png');
  game.load.image('ship', 'img/ship.png');
  game.load.image('heart', 'img/heart.png');
  game.load.image('popupBg', 'img/popup.png');
  game.load.image('screenshot', 'img/popup.png'); // placeholder image for now, will be replaced later in game with real image from backend
  game.load.image('pwa_secure', 'img/pwa_secure.png');
  game.load.image('pwa_reliable', 'img/pwa_reliable.png');
  game.load.image('pwa_installable', 'img/pwa_installable.png');
  game.load.image('pwa_optimized', 'img/pwa_optimized.png');
  game.load.image('seo_optimized', 'img/seo_powerup.png');
  game.load.image('ship_shielded', 'img/ship_shielded.png');
  game.load.image('pwa_logo', 'img/pwa_logo.png');
  game.load.image('sw_logo', 'img/sw_logo.png');
  game.load.image('explosion_particle', 'img/explosion_particle.png');
}

function create() {

  //  This will run in Canvas mode, so let's gain a little speed and display
  game.renderer.clearBeforeRender = true;
  game.renderer.roundPixels = true;

  //  We need arcade physics
  game.physics.startSystem(Phaser.Physics.ARCADE);

  // the asteroids
  asteroids = game.add.group();
  asteroids.enableBody = true;
  asteroids.physicsBodyType = Phaser.Physics.ARCADE;

  //  Our ships bullets
  bullets = game.add.group();
  bullets.enableBody = true;
  bullets.physicsBodyType = Phaser.Physics.ARCADE;

  //  All 40 of them
  bullets.createMultiple(40, 'bullet');
  bullets.setAll('anchor.x', 0.5);
  bullets.setAll('anchor.y', 0.5);

  //  Our player ship
  ship = game.add.sprite(game.width / 2, game.height / 2, 'ship');
  ship.anchor.set(0.5);
  ship.height = 30;
  ship.width = 30;
  ship.health = 3; // 3 lives
  ship.shoot_delay = 300;
  ship.shoot_strength = 10; // correspods to download rate in kb

  // Screenshot of the loading progress
  screenshot = game.add.sprite(0, 0, 'screenshot');
  screenshot.height = 168;
  screenshot.width = 240;
  screenshot.visible = false;

  // display lives - let's generate 10 to have buffer for powerups, but only show the ones left
  for (var i = 0; i < 10; i++) {
    var top = 5;
    var left = game.width - 40 - i * (heartWidth + 20);
    var heart = game.add.sprite(left, top, 'heart');
    heart.width = heartWidth;
    heart.height = heartHeight;
    heart.visible = false;
    hearts.push(heart);
  }

  //  and its physics settings
  game.physics.enable(ship, Phaser.Physics.ARCADE);

  ship.body.drag.set(0);
  ship.body.maxVelocity.set(200);

  //  Game input
  cursors = game.input.keyboard.createCursorKeys();
  game.input.keyboard.addKeyCapture([ Phaser.Keyboard.SPACEBAR, Phaser.Keyboard.ENTER ]);

  // emitter  for particles when a asteroid is hit
  hitEmitter = game.add.emitter(0, 0, 50);
  hitEmitter.makeParticles('asteroid_neutral');
  hitEmitter.gravity = 0;
  hitEmitter.maxParticleScale = 0.1;
  hitEmitter.minParticleScale = 0.05;
  hitEmitter.setAlpha(0, 1);

  powerups.initPowerups(game, asteroids, ship, bullets);

  document.body.addEventListener('touchend', function(e) {
    if (!game.paused) {
      game.physics.arcade.moveToPointer(ship, 40);
      ship.rotation = game.physics.arcade.angleToPointer(ship, e.x, e.y);
      fireBullet();
    }
  }, false);

  // motion info
  //window.addEventListener('deviceorientation', handleOrientation, true);

  game.paused = dialogs.isDialogShowing();
}

/*function handleOrientation(e) {
  if (game.paused) return;
  var x = e.gamma;
  var y = e.beta;
  var radian = Phaser.Math.angleBetweenPoints(ship.body.position, new Phaser.Point(ship.body.x + x, ship.body.y + y));
  ship.angle = radian * 180 / Math.PI;
  ship.body.velocity.x += x;
  ship.body.velocity.y += y;

}*/

function update() {

  if (!currentLevel) return;

  if (cursors.up.isDown) {
    game.physics.arcade.accelerationFromRotation(ship.rotation, 200, ship.body.acceleration);
  } else {
    ship.body.acceleration.set(0);
  }

  if (cursors.left.isDown) {
    ship.body.angularVelocity = -300;
  } else if (cursors.right.isDown) {
    ship.body.angularVelocity = 300;
  } else {
    ship.body.angularVelocity = 0;
  }

  if (game.input.keyboard.isDown(Phaser.Keyboard.SPACEBAR)) {
    // we'll only allow one shot every x ms
    if (Date.now() - lastShotTime > ship.shoot_delay) {
      fireBullet();
      lastShotTime = Date.now();
    }

  }

  // update the game time - we consider the minimum end time of asteroids in the gamefield as current time
  currentTime = Number.MAX_VALUE;
  if (currentLevel.resources.length > 0) currentTime = currentLevel.resources[0].endTime;
  for (var i = 0; i < asteroids.children.length; i++) {
    var asteroid = asteroids.children[i];
    currentTime = Math.min(currentTime, asteroid.endTime);
  }
  if (!currentTime) currentTime = Number.MAX_VALUE;


  // update the screenshot if needed
  var last = null;
  for (i = 0; i < gamestate.lhr_screenshots.length; i++) {
    var shot = gamestate.lhr_screenshots[i];
    if (shot.timing < currentTime) last = shot;
  }
  if (last) {
    var loader = new Phaser.Loader(game);
    var key = 'screenshot' + last.timing;
    loader.image(key, 'data:image/jpeg;base64,' + last.data);
    loader.onLoadComplete.addOnce(function(){ screenshot.loadTexture(key); screenshot.visible = true; });
    loader.start();
  }

  // update life displayed
  for (var i = 0; i < hearts.length; i++) {
    var show = i < ship.health;
    hearts[i].visible = show;
  }

  powerups.updatePowerups(gamestate, currentTime);

  generateAsteroids();

  commons.screenWrap(ship, game, 0);

  bullets.forEachExists(commons.screenWrap, this, game);
  asteroids.forEachExists(commons.screenWrap, this, game);

  game.physics.arcade.overlap(bullets, asteroids, asteroidHit, null, this);
  game.physics.arcade.overlap(ship, asteroids, shipHit, null, this);

  // next level reached?
  if (asteroids.length === 0 && currentLevel.resources.length === 0 && levels.length > 0) {
    while (currentLevel.resources.length === 0 && levels.length > 0) {
      lastLevel = currentLevel;
      currentLevel = levels.shift();
    }

    if (currentLevel.resources.length === 0) {
      endGame(true);
    } else {
      var values = [['Load Time', (lastLevel.time / 1000).toFixed(1) + 's'],
        ['Resources', lastLevel.resourcesCount],
        ['KB Loaded', parseInt(lastLevel.totalSize / 1024)],
        ['KB Wasted', parseInt(lastLevel.wastedSize / 1024)],
        ['JS Bootup', (lastLevel.bootupTime / 1000).toFixed(1) + 's']];
      var detDlg = dialogs.showDetailsPopup(game, 'Level ' + lastLevel.levelNumber + '<br>' + lastLevel.name + ' finished!', values);
      detDlg.onclose = function() {
        dialogs.showInfoPopup(game, 'Level ' + currentLevel.levelNumber + '<br>' + currentLevel.name, commons.getControlText());
      }
    }
  } else if (levels.length === 0 && currentLevel.resources.length === 0 && asteroids.length === 0 && ship.health > 0) {
    // was the game won?
    endGame(true);
  }

  commons.updateLabels();

}

//  Called if the bullet hits one of the veg sprites
function asteroidHit(bullet, asteroid) {
  asteroid.health -= ship.shoot_strength; // every bullet represents x kb download
  bullet.kill();
  if (!asteroid.floatLabel || asteroid.floatLabel.alpha < 0.5) {
    commons.createFloatingLabel(game, asteroid.label, asteroid.x, asteroid.y, asteroid);
  }

  if (asteroid.health <= 0) {
    commons.destroyAsteroid(game, asteroids, asteroid);
  } else {
    // show hit particles
    hitEmitter.x = asteroid.x;
    hitEmitter.y = asteroid.y;
    hitEmitter.start(true, 1000, null, 5);
  }
}

function fireBullet() {

  if (game.time.now > bulletTime){
    bullet = bullets.getFirstExists(false);

    if (bullet) {
      bullet.reset(ship.body.x + 16, ship.body.y + 16);
      bullet.lifespan = 2000;
      bullet.rotation = ship.rotation;
      game.physics.arcade.velocityFromRotation(ship.rotation, 400, bullet.body.velocity);
      bulletTime = game.time.now + 50;
    }
  }

}

function render() {
}


function generateAsteroids() {
  // game not initialized or no resources to visualize any more?
  if (!currentLevel || !currentLevel.resources) return;
  // generate a new asteroid for all resources which are loaded at this point in time
  for (var i = currentLevel.resources.length - 1; i >= 0; i--) {
    // current max amount of asteroids on the screen?
    if (asteroids.length >= settings.max_asteroids_at_once) return;
    var item = currentLevel.resources[i];
    if (item.startTime < currentTime) {
      var size = item.transferSize / 1000;
      // remove too small ones after first paint - just distracting from the real problems
      if (currentLevel.levelNumber > 1 && size < settings.asteroid_size_threshold) {
        currentLevel.resources.splice(i, 1);
        continue;
      }
      size = Math.max(size, settings.min_asteroid_size);
      size = Math.min(size, settings.max_asteroid_size);
      var rnd = Math.random();
      var c = null;
      var asset_name = 'asteroid_neutral';
      if (item.coverage && item.coverage > 85) asset_name = 'asteroid_green';
      else if (item.coverage && item.coverage > 50) asset_name = 'asteroid_orange';
      else if (item.coverage && item.coverage > 0) asset_name = 'asteroid_red';
      var point = commons.createRandomPointOutsideGame(game);
      c = asteroids.create(point.x, point.y, asset_name);
      c.width = size;
      c.height = size;
      c.anchor.set(0.5);
      c.name = 'met' + i;
      c.label = item.label;
      c.startTime = item.startTime;
      c.endTime = item.endTime;
      c.size = item.transferSize / 1000;
      c.health = item.transferSize / 1000; // download size represents health
      // c.body.immovable = true;
      game.physics.enable(c, Phaser.Physics.ARCADE);
      c.rotation = game.physics.arcade.moveToXY(c, game.world.randomX, game.world.randomY, parseInt(Math.random() * (settings.max_asteroid_speed - settings.min_asteroid_speed) + settings.min_asteroid_speed, 10));
      currentLevel.resources.splice(i, 1);
      console.log('Adding asteroid for resource: ' + item);
    }
  }
}

function shipHit(ship, asteroid) {
  if (ship.invincible) return; // after a hit make the ship indestructible for some secs to recover
  asteroids.remove(asteroid, true);
  ship.health--;
  commons.showExplosion(game, ship.x, ship.y);
  if (ship.health === 0) {
    endGame(false);
  } else {
    // hide the ship
    ship.alpha = 0;
    // make the ship invincible, a bit longer than it's hidden, so that player can respwan safely
    commons.makeShipInvincible(ship, 5000, false);
    // reset everything for respawn
    setTimeout(function() {
      ship.alpha = 1;
      ship.body.acceleration.set(0);
      ship.body.speed = 0;
      ship.body.velocity.set(0, 0);
      ship.x = game.width / 2;
      ship.y = game.height / 2;
    }, 3000);
  }
}

function endGame(won) {
  gameOver = true;
  dialogs.showGameEndPopup(game, deferredPrompt, won);
  gtag('event', 'game', {
    event_category: 'end',
    event_label: won ? 'won' : 'lost',
  });
}
