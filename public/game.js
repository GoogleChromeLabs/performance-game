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

var game = new Phaser.Game(window.innerWidth, window.innerHeight, Phaser.AUTO, 'phaser-example',
  { preload: preload, create: create, update: update, render: render });

function preload() {
  game.load.crossOrigin = 'Anonymous';
  game.load.image('meteroid_green', 'img/asteroid_green.png');
  game.load.image('meteroid_red', 'img/asteroid_red.png');
  game.load.image('meteroid_neutral', 'img/asteroid_neutral.png');
  game.load.image('meteroid_orange', 'img/asteroid_orange.png');
  game.load.image('bullet', 'img/bullets.png');
  game.load.image('ship', 'img/ship.png');
  game.load.image('heart', 'img/heart.png');
  game.load.image('particle', 'img/bullets.png');
  game.load.image('popupBg', 'img/popup.png');
  game.load.image('background', 'img/background.png');
  game.load.image('screenshot', 'img/popup.png'); // placeholder image for now, will be replaced later in game with real image from backend
  game.load.image('shield_powerup', 'img/shield_powerup.png');
  game.load.image('ship_shielded', 'img/ship_shielded.png');
  game.load.image('pwa_logo', 'img/pwa_logo.png');
  game.load.image('sw_logo', 'img/sw_logo.png');
}

var hints = [
  'Every asteroid represents one loaded resource.',
  'Every shot represents a 10kb download.',
  "Unsed CSS/JS asteroids can't be destroyed",
  'An orange asteroid means more than 50% of the resource is unused',
  'A red asteroid means more than 50% of the resource is used',
  'A green asteroid means more than 85% of the resource is used',
  'An active service worker gives faster fire rate',
  'Active HTTPS will give you a shield.',
  '52% of users abandon a site which loads longer than 3s',
  'A well-built PWA gives you a powerup to destroy all asteroids at once',
];

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
var shoot_delay = 300;
var asteroids;
var goodies; // the goodies for the ship to catch

var hearts = [];
var heartWidth = 35;
var heartHeight = 30;

var labels = [];

var score = 0;
var scoreLabel;

var gameOver = false;
var emitter;

var synthesizer;

function getGamestateAndStart() {
  //show loading popup
  showInfoPopup('Loading Game...');
  hintInterval = setInterval(function() {
    if (showLoadingText) showInfoPopup('Loading Game...');
    else showInfoPopup(hints[parseInt(Math.random() * hints.length, 10)]);
    showLoadingText = !showLoadingText;
  }, 4000);
  // get gamestate from server to start game
  urlToPlay = document.getElementById('url').value;
  fetch('gamestate.json?url=' + urlToPlay, {mode: 'cors', credentials: 'same-origin'}).then(function(response) {
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
    showInfoPopup("Level " + currentLevel.levelNumber + "<br>" + currentLevel.name, "");
  }).catch(function(error) {
    console.log('There has been a problem with your fetch operation: ', error.message);
  });
}

function create() {

  //  This will run in Canvas mode, so let's gain a little speed and display
  game.renderer.clearBeforeRender = true;
  game.renderer.roundPixels = true;

  //  We need arcade physics
  game.physics.startSystem(Phaser.Physics.ARCADE);

  //  A spacey background
  game.add.tileSprite(0, 0, game.width, game.height, 'background');

  // the asteroids
  asteroids = game.add.group();
  asteroids.enableBody = true;
  asteroids.physicsBodyType = Phaser.Physics.ARCADE;

  //  Our ships bullets
  bullets = game.add.group();
  bullets.enableBody = true;
  bullets.physicsBodyType = Phaser.Physics.ARCADE;

  //  The goodies
  goodies = game.add.group();
  goodies.enableBody = true;
  goodies.physicsBodyType = Phaser.Physics.ARCADE;

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

  // Screenshot of the loading progress
  screenshot = game.add.sprite(0, 0, 'screenshot');
  screenshot.height = 168;
  screenshot.width = 240;
  screenshot.visible = false;

  // display lives - let's generate 10 to haev buffer for goodies, but only show the ones left
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

  // emitter  for particles when a asteroid is destroyed
  emitter = game.add.emitter(0, 0, 100);
  emitter.makeParticles('particle');

  // label for score
  var style = { font: '20px Arial', fill: '#ff0000' };
  scoreLabel = game.add.text(game.world.centerX, 25, '0', style);
  scoreLabel.anchor.set(0.5);


  var keyEnter = game.input.keyboard.addKey(Phaser.Keyboard.ENTER);
  keyEnter.onDown.add(function() {
    if (gameOver)document.location.href = '/endscreen.html?url=' + urlToPlay + '&score=' + score + '&lhr_perf_score=' + gamestate.lhr_perf_score;
    else {
      if(isDetailsPopupShowing()) closeDetailsPopup();
      else closeInfoPopup();
    }
  }, this);

  game.paused = true;

  document.getElementById('urlInputDialog').showModal();
}

function update() {
  // lazy load synthesizer, as lib is async
  if(!synthesizer && typeof Tone !== 'undefined') {
    synthesizer = new Tone.Synth({
    	oscillator : {
      	type : 'triangle8'
      },
      envelope : {
      	attack : 2,
        decay : 1,
        sustain: 0.4,
        release: 4
      }
    }).toMaster()
  }

  if(!currentLevel) return;

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
    if(Date.now() - lastShotTime > shoot_delay) {
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

  // check if we need to create a goodie
  for (i = gamestate.goodies.length-1; i>=0; i--) {
    var goodie = gamestate.goodies[i];
    if (goodie.time < currentTime) {
      gamestate.goodies.splice(i, 1);
      var point = createRandomPointOutsideGame();
      var goodieSprite;
      if(goodie.type === "extra-life") {
          goodieSprite = goodies.create(point.x, point.y, 'heart');
      }
      else if(goodie.type === "shield") {
          goodieSprite = goodies.create(point.x, point.y, 'shield_powerup');
      }
      else if(goodie.type === "bomb") {
          goodieSprite = goodies.create(point.x, point.y, 'pwa_logo');
      }
      else if(goodie.type === "shoot-rate") {
          goodieSprite = goodies.create(point.x, point.y, 'sw_logo');
      }
      goodieSprite.width = heartWidth;
      goodieSprite.height = heartHeight;
      goodieSprite.anchor.set(0.5);
      goodieSprite.goodie = goodie;
      game.physics.enable(goodieSprite, Phaser.Physics.ARCADE);
      game.physics.arcade.moveToXY(goodieSprite, game.world.randomX, game.world.randomY, parseInt(Math.random() * 60 + 40, 10));
    }
  }


  generateAsteroids();

  screenWrap(ship);

  bullets.forEachExists(screenWrap, this);
  asteroids.forEachExists(screenWrap, this);
  goodies.forEachExists(screenWrap, this);

  game.physics.arcade.overlap(bullets, asteroids, asteroidHit, null, this);
  game.physics.arcade.overlap(ship, asteroids, shipHit, null, this);
  game.physics.arcade.overlap(ship, goodies, shipHitGoodie, null, this);

  // next level reached?
  if (asteroids.length === 0 && currentLevel.resources.length === 0 && levels.length > 0) {
    while (currentLevel.resources.length === 0 && levels.length > 0) {
      lastLevel = currentLevel;
      currentLevel = levels.shift();
    }

    if (currentLevel.resources.length === 0) {
      endGame(true);
    } else {
      var values = [["Resources loaded", lastLevel.resourcesCount],
                    ["KB Downloaded", parseInt(lastLevel.totalSize/1024)],
                    ["KB Wasted", parseInt(lastLevel.wastedSize/1024)],
                    ["JS Bootup", (lastLevel.bootupTime/1000).toFixed(1) + "s"]];
      showDetailsPopup("Level " + lastLevel.levelNumber + "<br>" + lastLevel.name + " finished!", values);
    }
  } else if (levels.length === 0 && currentLevel.resources.length === 0 && asteroids.length === 0 && ship.health > 0) {
    // was the game won?
    endGame(true);
  }

  // update floating labels
  for (i = labels.length - 1; i >= 0; i--) {
    labels[i].alpha -= 0.003;
    labels[i].y -= 2;
    if (labels[i].alpha <= 0) {
      labels[i].sourceSprite.floatLabel = null;
      labels[i].sourceSprite = null;
      labels[i].destroy();
      labels.splice(i, 1);
    }
  }

  // update score
  scoreLabel.text = score;

}

//  Called if the bullet hits one of the veg sprites
function asteroidHit(bullet, asteroid) {
  asteroid.health -= 10; // every bullet represents 10kb download right now
  bullet.kill();
  if (!asteroid.floatLabel || asteroid.floatLabel.alpha<0.5) {
    createFloatingLabel(asteroid.label, asteroid.x, asteroid.y, asteroid);
  }

  // and an explosion with particles!
  emitter.x = asteroid.x;
  emitter.y = asteroid.y;
  emitter.start(true, 1000, null, 20);

  if (asteroid.health <= 0) {
    destroyAsteroid(asteroid);
  }
}

function destroyAsteroid(asteroid) {
  asteroids.remove(asteroid, true);
  score += parseInt(asteroid.size, 10);
}

function createFloatingLabel(text, x, y, sourceSprite) {
  var style = { font: '19px Arial', fill: '#ff0044', align: 'center' };
  var t = game.add.text(x, y, text, style);
  labels.push(t);
  t.sourceSprite = sourceSprite;
  sourceSprite.floatLabel = t;
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

function screenWrap(sprite) {

  if (sprite.x < 0) {
    sprite.x = game.width;
  } else if (sprite.x > game.width) {
    sprite.x = 0;
  }

  if (sprite.y < 0) {
    sprite.y = game.height;
  } else if (sprite.y > game.height) {
    sprite.y = 0;
  }
}

function render() {
}


function generateAsteroids() {
  if (!currentLevel || !currentLevel.resources) return;
  for (var i = currentLevel.resources.length - 1; i >= 0; i--) {
    var item = currentLevel.resources[i];
    if (item.startTime < currentTime) {
      var size = item.transferSize / 1000;
      size = Math.max(size, 35);
      size = Math.min(size, 300);
      var rnd = Math.random();
      var c = null;
      var asset_name = 'meteroid_neutral';
      if (item.coverage && item.coverage > 85) asset_name = 'meteroid_green';
      else if (item.coverage && item.coverage > 50) asset_name = 'meteroid_red';
      else if (item.coverage && item.coverage > 0) asset_name = 'meteroid_orange';
      // psoition new asteroids on random point outside game
      var point = createRandomPointOutsideGame();
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
      c.rotation = game.physics.arcade.moveToXY(c, game.world.randomX, game.world.randomY, parseInt(Math.random() * 60 + 40, 10));
      currentLevel.resources.splice(i, 1);
      // playing a sound for the new asteroid
      /*if(synthesizer) {
          Tone.Transport.scheduleRepeat(function(time){
              synthesizer.triggerAttackRelease('c4','8n');
          },"2n");
          Tone.Transport.scheduleRepeat(function(time){
              synthesizer.triggerAttackRelease('d5','8n');
          },"2n");
          Tone.Transport.scheduleRepeat(function(time){
              synthesizer.triggerAttackRelease('a2','8n');
          },"2n");
          Tone.Transport.start();
      }*/
      console.log('Adding asteroid for resource: ' + item);
    }
  }
}

function createRandomPointOutsideGame() {
  var rnd = Math.random();
  var point = {x: 0, y: 0};
  if (rnd < 0.25) point = {x: 0, y: game.world.randomY};
  else if (rnd < 0.5) point = {x: game.width, y: game.world.randomY};
  else if (rnd < 0.75) point = {x: game.world.randomX, y: 0};
  else point = {x: game.world.randomX, y: game.height};
  return point;
}

function shipHitGoodie(ship, goodieSprite) {
  var goodie = goodieSprite.goodie;
  goodies.remove(goodieSprite);
  if(goodie.type === "extra-life") {
    ship.health++;
  }
  else if(goodie.type === "shield") {
    ship.loadTexture('ship_shielded');
    ship.invincible = true;
    setTimeout(function(){
      ship.loadTexture('ship');
      ship.invincible = false;
    }, 10000)
  }
  else if(goodie.type === "bomb") {
    for (var i = asteroids.children.length - 1; i >= 0; i--) {
      destroyAsteroid(asteroids.children[i]);
    }
  }
  else if(goodie.type === "shoot-rate") {
    shoot_delay = 100;
  }
  createFloatingLabel(goodie.name, goodieSprite.x, goodieSprite.y, goodieSprite);
}

function shipHit(ship, asteroid) {
  if (ship.invincible) return; // after a hit make the ship indestructible for some secs to recover
  asteroids.remove(asteroid, true);
  ship.health--;
  if (ship.health === 0) {
    endGame(false);
  }
  ship.invincible = true;
  ship.alpha = 0.5;
  setTimeout(function() { ship.invincible = false; ship.alpha = 1; }, 3000);
}


function getUrlParam(key) {
  var match = window.location.href.match('[?&]' + key + '=([^&#]+)');
  return match ? match[1] : null;
}

function endGame(won) {
  gameOver = true;
  if (won) showInfoPopup('You won!');
  else showInfoPopup('Sorry, you lost!');
}

// ------------------ popup handling -----------------------

function showInfoPopup(title, text='') {
  if(!text) text = '';
  document.getElementById("infoPopupTitle").innerHTML = title;
  document.getElementById("infoPopupContent").innerHTML = text;
  var popup = document.getElementById("infoPopup");
  if(!popup.open) popup.showModal();
  game.paused = true;
}

function closeInfoPopup() {
  document.getElementById("infoPopup").close();
  game.paused = false;
}

function showDetailsPopup(title, values) {
  document.getElementById("tablePopupTitle").innerHTML = title;
  var tbl = document.getElementById("tablePopupContent");
  tbl.innerHTML = "";
  for(var i = 0; i < values.length; i++) {
    var row = tbl.insertRow();
    row.insertCell().innerText = values[i][0];
    row.insertCell().innerText = values[i][1];
  }
  var popup = document.getElementById("tablePopup");
  if(!popup.open) popup.showModal();
  game.paused = true;
}

function closeDetailsPopup() {
  document.getElementById("tablePopup").close();
  game.paused = false;
  // we show this only at level end, so when this dialog closes we open
  // the dialog which announces the next level
  showInfoPopup("Level " + currentLevel.levelNumber + " " + currentLevel.name);
}

function isDetailsPopupShowing() {
  return document.getElementById("tablePopup").open;
}
