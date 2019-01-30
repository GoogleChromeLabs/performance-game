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

const commons = require('./common.js');

module.exports = {
  initPowerups: initPowerups,
  updatePowerups: updatePowerups
};

var game;
var asteroids;
var ship;
var powerups;
var bullets;

function initPowerups(gameParam, asteroidsParam, shipParam, bulletsParam) {
  game = gameParam;
  asteroids = asteroidsParam;
  ship = shipParam;
  bullets = bulletsParam;

  powerups = game.add.group();
  powerups.enableBody = true;
  powerups.physicsBodyType = Phaser.Physics.ARCADE;
}

function updatePowerups(gamestate, currentTime) {
  for (var i = gamestate.powerups.length - 1; i >= 0; i--) {
    var powerup = gamestate.powerups[i];
    if (powerup.time < currentTime) {
      gamestate.powerups.splice(i, 1);
      var point = commons.createRandomPointOutsideGame(game);
      var powerupSprite;
      powerupSprite = powerups.create(point.x, point.y, powerup.asset);
      powerupSprite.width = 30;
      powerupSprite.height = 30;
      powerupSprite.anchor.set(0.5);
      powerupSprite.powerup = powerup;
      game.physics.enable(powerupSprite, Phaser.Physics.ARCADE);
      game.physics.arcade.moveToXY(powerupSprite, game.world.randomX, game.world.randomY, parseInt(Math.random() * 60 + 40, 10));
    }
  }
  powerups.forEachExists(commons.screenWrap, this, game);
  game.physics.arcade.overlap(ship, powerups, shipHitPowerup, null, this);
}


function shipHitPowerup(ship, powerupSprite) {
  var powerup = powerupSprite.powerup;
  powerups.remove(powerupSprite);
  if (powerup.type === 'extra-life') {
    ship.health++;
  } else if (powerup.type === 'shield') {
    commons.makeShipInvincible(ship, 10000, true);
  } else if (powerup.type === 'bomb') {
    for (var i = asteroids.children.length - 1; i >= 0; i--) {
      commons.destroyAsteroid(game, asteroids, asteroids.children[i]);
    }
  } else if (powerup.type === 'shoot-rate') {
    ship.shoot_delay = 100;
  } else if (powerup.type === 'stronger-shots') {
    ship.shoot_strength = 30;
    for (var i = bullets.children.length - 1; i >= 0; i--) {
      bullets.children[i].loadTexture("bullet_strong");
    }
  }
  commons.createFloatingLabel(game, powerup.name, powerupSprite.x, powerupSprite.y, powerupSprite);
}
