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

module.exports = {
  isMobile: isMobile,
  getInputURL: getInputURL,
  seeReport: seeReport,
  share: share,
  getUrlParam: getUrlParam,
  isMobile: isMobile,
  injectCSS: injectCSS,
  getControlText: getControlText,
  createRandomPointOutsideGame: createRandomPointOutsideGame,
  screenWrap: screenWrap,
  makeShipInvincible: makeShipInvincible,
  destroyAsteroid: destroyAsteroid,
  showExplosion: showExplosion,
  createFloatingLabel: createFloatingLabel,
  updateLabels: updateLabels
}


var explosionEmitter;
var labels = [];


/**
* Function to inject css async for Performance
* in general we use critters for that, but this seems to fail for one file
*/
function injectCSS(url) {
  var myCSS = document.createElement('link');
  myCSS.rel = 'stylesheet';
  myCSS.href = url;
  document.head.insertBefore(myCSS, document.head.childNodes[ document.head.childNodes.length - 1 ].nextSibling);
}


function getInputURL() {
  var u = document.getElementById('url').value;
  if (u.indexOf('http') !== 0) {
    u = 'http://' + u;
  }
  return u;
}


/**
* Route the user towards a full performance report on PSI domain
**/
function seeReport() {
  var url = getInputURL();
  var report_url = 'https://developers.google.com/speed/pagespeed/insights/?url=' + encodeURI(url);
  window.open(report_url, '_blank');
}


function share() {
  if (navigator.share) {
    navigator.share({
      title: 'The Performance Game',
      text: 'I am fighting slow loading websites - are you too? #perfmatters #perfgame',
      url: 'https://g.co/perfgame',
    })
      .then(() => {
        console.log('Successful share');
        gtag('event', 'share', {
          event_category: 'success',
          event_label: '',
        });
      })
      .catch((error) => {
        console.log('Error sharing', error);
        gtag('event', 'share', {
          event_category: 'error',
          event_label: error.message,
        });
      });
  }
}

function getUrlParam(key) {
  var match = window.location.href.match('[?&]' + key + '=([^&#]+)');
  return match ? match[1] : null;
}

function isMobile() {
  return navigator.appVersion.indexOf('Mobile') >= 0;
}

function getControlText() {
  var content = "";
  if (isMobile()) {
    content = 'Control with device movement (tilt!), fire with touch.  Please level device before starting!';
  } else {
    content = 'Control with arrow keys, fire with space, close dialogs with Enter!';
  }
  return content;
}

function createRandomPointOutsideGame(game) {
  var dist = 80; // distance to gamefield, we'll create them a bit outside
  var rnd = Math.random();
  var point = {x: 0, y: 0};
  if (rnd < 0.25) point = {x: -dist, y: game.world.randomY};
  else if (rnd < 0.5) point = {x: game.width + dist, y: game.world.randomY};
  else if (rnd < 0.75) point = {x: game.world.randomX, y: -dist};
  else point = {x: game.world.randomX, y: game.height + dist};
  return point;
}


function screenWrap(sprite, game, margin = 80) {
  if (sprite.x < -margin) {
    sprite.x = game.width;
  } else if (sprite.x > game.width + margin) {
    sprite.x = 0;
  }

  if (sprite.y < -margin) {
    sprite.y = game.height;
  } else if (sprite.y > game.height + margin) {
    sprite.y = 0;
  }
}


function makeShipInvincible(ship, duration, showShip) {
  ship.alpha = showShip ? 1 : 0;
  ship.loadTexture('ship_shielded');
  ship.invincible = true;
  setTimeout(function(){
    ship.loadTexture('ship');
    ship.invincible = false;
  }, duration);
}


function destroyAsteroid(game, asteroids, asteroid) {
  asteroids.remove(asteroid, true);
  // and an explosion with particles!
  showExplosion(game, asteroid.x, asteroid.y);
}


function showExplosion(game, x, y) {
  if(!explosionEmitter) {
    // emitter  for particles when a asteroid is destroyes
    explosionEmitter = game.add.emitter(0, 0, 70);
    explosionEmitter.makeParticles('explosion_particle');
    explosionEmitter.gravity = 0;
    explosionEmitter.setAlpha(0, 0.1);
  }
  explosionEmitter.x = x;
  explosionEmitter.y = y;
  explosionEmitter.start(true, 300, 50, 70);
}


function createFloatingLabel(game, text, x, y, sourceSprite) {
  var style = { font: '19px Arial', fill: '#ff0044', align: 'center' };
  var t = game.add.text(x, y, text, style);
  labels.push(t);
  t.sourceSprite = sourceSprite;
  sourceSprite.floatLabel = t;
}

function updateLabels() {
  // update floating labels
  for (var i = labels.length - 1; i >= 0; i--) {
    labels[i].alpha -= 0.003;
    labels[i].y -= 2;
    if (labels[i].alpha <= 0) {
      labels[i].sourceSprite.floatLabel = null;
      labels[i].sourceSprite = null;
      labels[i].destroy();
      labels.splice(i, 1);
    }
  }
}
