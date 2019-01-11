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
  setupDialogs: setupDialogs,
  showInfoPopup: showInfoPopup,
  closeInfoPopup: closeInfoPopup,
  showLoadingPopup: showLoadingPopup,
  closeLoadingPopup: closeLoadingPopup,
  showDetailsPopup: showDetailsPopup,
  closeDetailsPopup: closeDetailsPopup,
  isDetailsPopupShowing: isDetailsPopupShowing,
  showGameEndPopup: showGameEndPopup,
  setGame: setGame,
};

var game;
var currentHint = 0;
var button_delay = 800;
var dialogOpened; // timestamp to remember when a dialog was opened, we'll disalow closing for like 2s


function setGame(phaserGame) {
  game = phaserGame;
}


function setupDialogs(gameStartFct) {
  document.addEventListener('DOMContentLoaded', function(event) {

    commons.injectCSS('https://fonts.googleapis.com/icon?family=Material+Icons');

    // only use polyfill if needed
    var dialogs = document.querySelectorAll('dialog');
    if (typeof HTMLDialogElement !== 'function') {
      for (var i = 0; i < dialogs.length; i++) {
        dialogPolyfill.registerDialog(dialogs[i]);
      }
    }

    // default close of all dialogs pauses game
    for (i = 0; i < dialogs.length; i++) {
      dialogs[i].addEventListener('close', function(e) {
        if (game) game.paused = false;
      });
    }

    // init all close buttons in dialogs
    var closebtn1 = document.querySelector('#info_close_btn');
    closebtn1.addEventListener('click', function(e) {
      closeInfoPopup();
    });
    closebtn1.addEventListener('keyup', function(e){
      if (e.keyCode === 13)
        closeInfoPopup();
    });
    var closebtn2 = document.querySelector('#table_close_btn');
    closebtn2.addEventListener('click', function(e) {
      closeDetailsPopup();
    });
    closebtn2.addEventListener('keyup', function(e){
      if (e.keyCode === 13)
        closeDetailsPopup();
    });

    var elem = document.getElementById('url');
    var btn = document.getElementById('start_btn');
    btn.onclick = gameStartFct;
    // enable disble button depending on if input is valid
    elem.oninput = function(e) {
      btn.disabled = !elem.validity.valid;
    };
    // enter on input triggers button
    elem.addEventListener('keyup', function(e){
      if (e.keyCode === 13)
        gameStartFct();
    });

    document.getElementById('replay_btn').onclick = function() { document.location.href = '/'; };
    document.getElementById('share_btn').onclick = commons.share;
    document.getElementById('report_btn').onclick = commons.seeReport;

    document.getElementById('urlInputDialog').showModal();
  });
}


function showInfoPopup(game, title, text = '', closable = true) {
  if (!text) text = '';
  document.getElementById('infoPopupTitle').innerHTML = title;
  document.getElementById('infoPopupContent').innerHTML = text;
  var popup = document.getElementById('infoPopup');
  var closebtn = document.querySelector('#info_close_btn');
  if (!popup.open) {
    popup.showModal();
    dialogOpened = Date.now();
    closebtn.disabled = true;
    setTimeout(function() { closebtn.disabled = false; }, button_delay);
  }
  closebtn.style.display = closable ? 'inline-block' : 'none';
  if (game && game.isBooted) game.paused = true;
}

function closeInfoPopup() {
  document.getElementById('infoPopup').close();
}

function showLoadingPopup(game, title, hints) {
  document.getElementById('loadingPopupTitle').innerHTML = title;
  document.getElementById('loadingPopupHint').innerHTML = hints[currentHint];
  document.getElementById('last_hint').onclick = function(e) {
    currentHint = currentHint > 0 ? currentHint - 1 : hints.length - 1; ;
    document.getElementById('loadingPopupHint').innerHTML = hints[currentHint];
  };
  document.getElementById('next_hint').onclick = function(e) {
    currentHint++;
    currentHint = currentHint % hints.length;
    document.getElementById('loadingPopupHint').innerHTML = hints[currentHint];
  };
  var popup = document.getElementById('loadingPopup');
  if (!popup.open) {
    popup.showModal();
    dialogOpened = Date.now();
  }
  if (game && game.isBooted) game.paused = true;
}

function closeLoadingPopup() {
  document.getElementById('loadingPopup').close();
}

function showDetailsPopup(game, title, values) {
  document.getElementById('tablePopupTitle').innerHTML = title;
  var tbl = document.getElementById('tablePopupContent');
  tbl.innerHTML = '';
  for (var i = 0; i < values.length; i++) {
    var row = tbl.insertRow();
    row.insertCell().innerText = values[i][0];
    row.insertCell().innerText = values[i][1];
  }
  var popup = document.getElementById('tablePopup');
  if (!popup.open) {
    popup.showModal();
    dialogOpened = Date.now();
    var closebtn = document.querySelector('#table_close_btn');
    closebtn.disabled = true;
    setTimeout(function() { closebtn.disabled = false; }, button_delay);
  }
  game.paused = true;
}

function closeDetailsPopup() {
  document.getElementById('tablePopup').close();
}

function isDetailsPopupShowing() {
  return document.getElementById('tablePopup').open;
}

function prepareEndPopup(installPromptEvent) {
  var share_btn = document.getElementById('share_btn');
  var install_btn = document.getElementById('install_btn');
  var replay_btn = document.getElementById('replay_btn');
  var report_btn = document.getElementById('report_btn');

  var buttons = [share_btn, install_btn, replay_btn, report_btn];

  // disable the buttons for a small time on first show
  // to avoid accidential clicks
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].disabled = true;
  }
  setTimeout(function(){
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = false;
    }
  }, button_delay);

  if (navigator.share) {
    share_btn.style.display = 'inline-block';
  } else {
    share_btn.style.display = 'none';
    console.log('Weh Share unavailable, hiding sharing option!');
  }
  if (installPromptEvent) {
    install_btn.style.display = 'inline-block';
    install_btn.onclick = function() {
      installPromptEvent.prompt();
      installPromptEvent.userChoice
        .then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            gtag('event', 'a2hs', {
              event_category: 'installed',
            });
          } else {
            gtag('event', 'a2hs', {
              event_category: 'aborted',
            });
          }
        });
    };
  } else {
    install_btn.style.display = 'none';
    console.log('Web Share unavailable, hiding sharing option!');
  }
}

function showGameEndPopup(game, installPromptEvent, won) {
  prepareEndPopup(installPromptEvent);
  var title = document.getElementById('gameEndPopupTitle');
  if (!won) title.innerHTML = 'You have lost the game!';
  else title.innerHTML = 'You won the game!';

  var popup = document.getElementById('gameEndPopup');
  if (!popup.open) {
    popup.showModal();
    dialogOpened = Date.now();
  }
  game.paused = true;
}
