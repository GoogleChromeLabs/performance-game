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

module.exports.isMobile = isMobile;
module.exports.getInputURL = getInputURL;
module.exports.seeReport = seeReport;
module.exports.share = share;
module.exports.getUrlParam = getUrlParam;
module.exports.isMobile = isMobile;
module.exports.injectCSS = injectCSS;
module.exports.getControlText = getControlText;


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
