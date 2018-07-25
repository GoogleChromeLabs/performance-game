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
  game.load.image('bullet', 'img/bullets.png');
  game.load.image('ship', 'img/ship.png');
  game.load.image('heart', 'img/heart.png');
  game.load.image('particle', 'img/bullets.png');
  game.load.image('popupBg', 'img/popup.png');
}

var hints = [
  'Every asteroid\nrepresents one\nloaded resource.',
  'Every shot\nrepresents a\n20kb download.',
  "Unsed CSS/JS\nasteroids can't\nbe destroyed",
  'A red asteroid\nmeans more than\n75% of the resource\nis unused',
  'A green asteroid\nmeans more than\n75% of the resource\nis used',
  'A deployed\nservice worker\ngives you dual\nguns',
  'Active HTTPS will\ngive you a shield.',
  '52% of users\nabandon a site\nwhich loads longer\nthan 3s',
];

var urlToPlay; // the url being played
var playerName; // name of the player

var showLoadingText = true; // will laternatie between 'loading' and hints
var hintInterval;

var gamestate = [];
var currentLevel;
var startTime = Math.max();

var ship;
var cursors;

var bullet;
var bullets;
var bulletTime = 0;
var meteors;

var hearts = [];
var heartWidth = 35;
var heartHeight = 30;

var invincible = false;

var labels = [];

var popupLabel;
var score = 0;
var scoreLabel;

var popup;
var gameOver = false;
var popupOpenTime; // while popup is open we pause game, so we don't want to count this time
var emitter;

function create() {

  //  This will run in Canvas mode, so let's gain a little speed and display
  game.renderer.clearBeforeRender = true;
  game.renderer.roundPixels = true;

  //  We need arcade physics
  game.physics.startSystem(Phaser.Physics.ARCADE);

  //  A spacey background
  // game.add.tileSprite(0, 0, game.width, game.height, 'space');

  // the meteors
  meteors = game.add.group();
  meteors.enableBody = true;
  meteors.physicsBodyType = Phaser.Physics.ARCADE;

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
  ship.health = 3;

  // display lives
  for (var i = 0; i < ship.health; i++) {
    var top = 5;
    var left = game.width - 40 - i * (heartWidth + 20);
    var heart = game.add.sprite(left, top, 'heart');
    heart.width = heartWidth;
    heart.height = heartHeight;
    hearts.push(heart);
  }

  //  and its physics settings
  game.physics.enable(ship, Phaser.Physics.ARCADE);

  ship.body.drag.set(100);
  ship.body.maxVelocity.set(200);

  //  Game input
  cursors = game.input.keyboard.createCursorKeys();
  game.input.keyboard.addKeyCapture([ Phaser.Keyboard.SPACEBAR, Phaser.Keyboard.ENTER ]);

  // emitter  for particles when a meteor is destroyed
  emitter = game.add.emitter(0, 0, 100);
  emitter.makeParticles('particle');

  // label for score
  var style = { font: '20px Arial', fill: '#ff0000' };
  scoreLabel = game.add.text(10, 10, '0', style);

  //  create popup for later use
  popup = game.add.sprite(game.world.centerX, game.world.centerY, 'popupBg');
  popup.anchor.set(0.5);
  popup.inputEnabled = true;

  style = { font: '35px Arial', fill: '#ffffff', boundsAlignH: 'center', boundsAlignV: 'middle'};
  popupLabel = game.add.text(0, 0, 'Game is loading...', style);
  popupLabel.setTextBounds(0, 0, game.width, game.height);
  popupLabel.visible = false;

  var keyEnter = game.input.keyboard.addKey(Phaser.Keyboard.ENTER);
  keyEnter.onDown.add(function() {
    if (gameOver)document.location.href = '/endscreen.html?url=' + urlToPlay;
    else closePopup();
  }, this);

  game.paused = true;

  openPopup('Loading Game');
  hintInterval = setInterval(function() {
    if (showLoadingText) openPopup('Loading Game');
    else openPopup(hints[parseInt(Math.random() * hints.length, 10)]);
    showLoadingText = !showLoadingText;
  }, 4000);

}

function update() {

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
    fireBullet();
  }

  generateMeteorites();

  screenWrap(ship);

  bullets.forEachExists(screenWrap, this);
  meteors.forEachExists(screenWrap, this);

  game.physics.arcade.overlap(bullets, meteors, meteorHit, null, this);
  game.physics.arcade.overlap(ship, meteors, shipHit, null, this);

  // next level reached?
  if (meteors.length === 0 && currentLevel.resources.length === 0 && gamestate.length > 0) {
    currentLevel = gamestate.shift();
    openPopup(currentLevel.name);
  // was the game won?
  } else if (gamestate.length === 0 && currentLevel.resources.length === 0 && meteors.length === 0 && ship.health > 0) {
    endGame(true);
  }

  // update floating labels
  for (var i = labels.length - 1; i >= 0; i--) {
    labels[i].alpha -= 0.003;
    labels[i].y -= 2;
    if (labels[i].alpha <= 0) {
      labels[i].meteor.floatLabel = null;
      labels[i].meteor = null;
      labels[i].destroy();
      labels.splice(i, 1);
    }
  }

  // update score
  scoreLabel.text = score;

}

//  Called if the bullet hits one of the veg sprites
function meteorHit(bullet, meteor) {
  meteor.health -= 20; // every bullet represents 20kb download right now
  bullet.kill();
  if (!meteor.floatLabel) {
    var text = meteor.label;
    var style = { font: '19px Arial', fill: '#ff0044', align: 'center' };
    var t = game.add.text(meteor.x, meteor.y, text, style);
    labels.push(t);
    t.meteor = meteor;
    meteor.floatLabel = t;
  }

  // and an explosion with aprticles!
  emitter.x = meteor.x;
  emitter.y = meteor.y;
  emitter.start(true, 1000, null, 20);

  if (meteor.health <= 0) {
    meteors.remove(meteor, true);
    score += parseInt(meteor.size, 10);
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


function generateMeteorites() {
  if (!currentLevel || !currentLevel.resources) return;
  for (var i = currentLevel.resources.length - 1; i >= 0; i--) {
    var item = currentLevel.resources[i];
    if (item.time * 20 < Date.now() - startTime) { // 20x time slowdown compared to real load
      var size = item.size;
      size = Math.max(size, 35);
      size = Math.min(size, 200);
      var rnd = Math.random();
      var c = null;
      var asset_name = 'meteroid_neutral';
      if (item.coverage && item.coverage > 75) asset_name = 'meteroid_green';
      if (item.coverage && item.coverage < 25) asset_name = 'meteroid_red';
      // psoition new meteors on random point outside game
      if (rnd < 0.25) c = meteors.create(0, game.world.randomY, asset_name);
      else if (rnd < 0.5) c = meteors.create(game.width, game.world.randomY, asset_name);
      else if (rnd < 0.75) c = meteors.create(game.world.randomX, 0, asset_name);
      else c = meteors.create(game.world.randomX, game.height, asset_name);
      c.width = size;
      c.height = size;
      c.name = 'met' + i;
      c.label = item.label;
      c.size = item.size;
      c.health = item.size; // download size represents health
      // c.body.immovable = true;
      game.physics.enable(c, Phaser.Physics.ARCADE);
      c.rotation = game.physics.arcade.moveToXY(c, game.world.randomX, game.world.randomY, parseInt(Math.random() * 60 + 40, 10));
      currentLevel.resources.splice(i, 1);
      console.log('Adding meteorit for resource: ' + item);
    }
  }
}


function shipHit(ship, meteor) {
  if (invincible) return; // after a hit make the ship indestructible for some secs to recover
  meteors.remove(meteor, true);
  ship.health--;
  if (ship.health === 0) {
    endGame(false);
  }
  invincible = true;
  ship.alpha = 0.5;
  setTimeout(function() { invincible = false; ship.alpha = 1; }, 3000);
  var heart = hearts.pop();
  heart.destroy();
}


// get gamestate from server to start game
urlToPlay = getUrlParam('urlToPlay');
playerName = getUrlParam('playerName');
fetch('gamestate.json?url=' + urlToPlay, {mode: 'cors', credentials: 'same-origin'}).then(function(response) {
  if (response.ok) {
    console.log('success');
    return response.json();
  }
  throw new Error('Network response was not ok.');
}).then(function(myJSON) {
  console.log('Startin game with gamestate:');
  console.log(myJSON);
  gamestate = myJSON;
  currentLevel = gamestate.shift();
  clearInterval(hintInterval);
  openPopup(currentLevel.name);
  startTime = Date.now();
}).catch(function(error) {
  console.log('There has been a problem with your fetch operation: ', error.message);
});

function getUrlParam(key) {
  var match = window.location.href.match('[?&]' + key + '=([^&#]+)');
  return match ? match[1] : null;
}

function endGame(won) {
  fetch('saveScore', {
    method: 'POST',
    mode: 'cors', // no-cors, cors, *same-origin
    body: JSON.stringify({playerName: playerName, score: score, url: urlToPlay}),
    headers: {
      'Content-Type': 'application/json',
    },
  }).catch(error => console.error('Error sending score:', error))
    .then(response => console.log('Success sending score:', response));
  gameOver = true;
  if (won) openPopup('You won!');
  else openPopup('Sorry, you lost!');
}

// ------------------ popup handling -----------------------


function openPopup(msg) {
  popupLabel.text = msg;
  popup.visible = true;
  popupLabel.visible = true;
  game.paused = true;
  popupOpenTime = Date.now();
}

function closePopup() {
  game.paused = false;
  popupLabel.visible = false;
  popup.visible = false;
  startTime += Date.now() - popupOpenTime; // deduct the time the popup was open, as game was paused
}
