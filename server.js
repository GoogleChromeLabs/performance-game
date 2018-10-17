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

const {URL} = require('url');

const express = require('express');
const puppeteer = require('puppeteer');
const lighthouse = require('lighthouse');

// create express server
const app = express();


// setting up routes for the various files
app.use(express.static('public'));


// this is the main hook. It will open puppeteer, load the URL and grab performance metrics and log resource loading
// All this will be used to create a level to play through
app.get('/gamestate.json', async(request, response) => {
  // todo: verify this is multi-thread safe and can handle the load
  const browser = await puppeteer.launch({
    args: ['--no-sandbox'],
    timeout: 10000,
  });
  var url = request.query.url;
  console.log('Starting game for url: ' + url);

  // now run lighthouse
  // Lighthouse will open URL. Puppeteer observes `targetchanged` and sets up network conditions.
  // Possible race condition.
  const {lhr} = await lighthouse(url, {
    port: (new URL(browser.wsEndpoint())).port,
    output: 'json',
    logLevel: 'error',
    throttlingMethod: 'devtools', // without that resource loading timeline doesn't fit perf metrics
  });

  // for testing and debugging we can write out the result json, you Can
  // inspect it via the lighthouse viewer here: https://googlechrome.github.io/lighthouse/viewer/
  // fs.writeFile('myjsonfile.json', JSON.stringify(lhr), 'utf8', function(){});

  // get the audit results from lighthouse
  var lhr_fcp = lhr.audits['first-contentful-paint'].rawValue;
  var lhr_psi = lhr.audits['speed-index'].rawValue;
  var lhr_interactive = lhr.audits['interactive'].rawValue;
  var lhr_screenshots = lhr.audits['screenshot-thumbnails'] && lhr.audits['screenshot-thumbnails'].details ? lhr.audits['screenshot-thumbnails'].details.items : [];
  var lhr_network = lhr.audits['network-requests'].details.items;
  var lhr_unused_css = lhr.audits['unused-css-rules'] ? lhr.audits['unused-css-rules'].details.items : [];
  var lhr_optimized_images = lhr.audits['uses-optimized-images'].details.items;
  var lhr_responsive_images = lhr.audits['uses-responsive-images'].details.items;
  var lhr_offscreen_images = lhr.audits['offscreen-images'] && lhr.audits['offscreen-images'].details ? lhr.audits['offscreen-images'].details.items : [];
  var lhr_uses_webp = lhr.audits['uses-webp-images'].details.items;
  var lhr_perf_score = lhr.categories.performance.score;
  var lhr_pwa_score = lhr.categories.pwa.score;
  var lhr_has_sw = lhr.audits['service-worker'].rawValue;
  var lhr_has_a2hs = lhr.audits['webapp-install-banner'].rawValue;
  var lhr_has_http2 = lhr.audits['uses-http2'].rawValue;
  var lhr_has_https = lhr.audits['is-on-https'].rawValue;
  var lhr_has_offline = lhr.audits['works-offline'].rawValue;
  var lhr_unused_js = lhr.audits['unused-javascript'] ? lhr.audits['unused-javascript'].details.items : [];
  var lhr_bootup_time = lhr.audits['bootup-time'] ? lhr.audits['bootup-time'].details.items : [];

  // for efficiency let's move the bootup time from list into a has, indexed by url
  var bootupHash = [];
  for (var i = 0; i < lhr_bootup_time.length; i++) {
    var item = lhr_bootup_time[i];
    bootupHash[item.url] = item.total; // total scriting time
  }

  // merge several of the byteefficiency audits in a general 'wasted' hashmap
  var wasted = {};
  addToWasted(lhr_unused_css, wasted, 'unused-css');
  addToWasted(lhr_optimized_images, wasted, 'optimized-images');
  addToWasted(lhr_uses_webp, wasted, 'optimized-images');
  addToWasted(lhr_responsive_images, wasted, 'optimized-images');
  addToWasted(lhr_offscreen_images, wasted, 'offscreen-images');
  addToWasted(lhr_unused_js, wasted, 'unused-javascript');

  console.log('Lighthouse  finished, fcp: ' + lhr_fcp + ' - PSI: ' + lhr_psi + ' - TTI: ' + lhr_interactive);

  await browser.close();

  // now segment resource loading into levels based on performance metrics
  var resources1 = [];
  var resources2 = [];
  var resources3 = [];
  var resources4 = [];
  for (var i = 0; i < lhr_network.length; i++) {
    var res = lhr_network[i];
    // let's skip the really small ones (analytics pings etc.)
    // they'll just distract from the real problems
    if(res.transferSize<700) continue; // smaller than 700 byte
    var name = res.url.split('/').pop().replace(/[^a-zA-Z._ ]{3,}/g, '*'); // get just filename, and replace everything unreadable with * (fingerprints, hashes etc.)
    if (name.includes('?')) name = name.substring(0, name.indexOf('?')); // also strip off url params
    if (!name) name = res.url.substring(res.url.indexOf('//') + 2); // let's use host if path is empty
    res.label = name;
    res.coverage = 100;
    res.bootupTime = bootupHash[res.url] ? bootupHash[res.url] : 0;
    res.coverage = wasted[res.url] ? wasted[res.url].coverage : 100;
    res.wastedSize = wasted[res.url] ? wasted[res.url].wastedSize : 0;
    if (res.endTime < lhr_fcp) resources1.push(res);
    else if (res.endTime < lhr_psi) resources2.push(res);
    else if (res.endTime < lhr_interactive) resources3.push(res);
    else resources4.push(res);
  }
  var levels = [];
  var level1 = {name: 'First Contentful Paint', resources: resources1};
  var level2 = {name: 'Speed Index', resources: resources2};
  var level3 = {name: 'Interactive', resources: resources3};
  var level4 = {name: 'Full Load', resources: resources4};
  // only add levels with resources in them
  if (resources1.length > 0) levels.push(level1);
  if (resources2.length > 0) levels.push(level2);
  if (resources3.length > 0) levels.push(level3);
  if (resources4.length > 0) levels.push(level4);
  // fix the numbering, and add in statsitics
  for (i = 0; i < levels.length; i++) {
    levels[i].levelNumber = (i + 1);
    calcLevelStatistics(levels[i]);
  }

  // create some goodies
  var goodies = [];
  var gameDuration = lhr_network[lhr_network.length-1].startTime;
  var is_pwa = lhr_pwa_score > 0.7;
  // if it's not a full PWA we'll reward the individual features at least
  if(!is_pwa) {
    addGoodie(goodies, lhr_has_sw, "ServiceWorker registered", "shoot-rate", gameDuration);
    addGoodie(goodies, lhr_has_a2hs, "Add-To-Homescreen", "extra-life", gameDuration);
    addGoodie(goodies, lhr_has_offline, "Offline Mode", "extra-life", gameDuration);
  }
  else {
    addGoodie(goodies, is_pwa, "Progressive Web App", "bomb", gameDuration);
  }
  addGoodie(goodies, lhr_has_http2, "HTTP2 enabled", "extra-life", gameDuration);
  addGoodie(goodies, lhr_has_https, "Page is secure", "shield", gameDuration);




  // finalize gamestate
  var gameplay = {
    lhr_perf_score: lhr_perf_score,
    lhr_pwa_score: lhr_pwa_score,
    lhr_screenshots: lhr_screenshots,
    levels: levels,
    goodies: goodies
  };

  // console.log(JSON.stringify(gameplay, null, 4));
  // send out gameplay
  response.header('Access-Control-Allow-Origin', '*');
  response.contentType('application/json');
  response.end(JSON.stringify(gameplay));
});

function calcLevelStatistics(level){
  var size = 0;
  var wasted = 0;
  var bootupTime = 0;
  for(var i = 0; i < level.resources.length; i++) {
    var res = level.resources[i];
    size += res.transferSize ? res.transferSize : 0;
    wasted += res.wastedSize ? res.wastedSize : 0;
    bootupTime += res.bootupTime;
  }
  level.totalSize = size;
  level.wastedSize = wasted;
  level.resourcesCount = level.resources.length;
  level.bootupTime = bootupTime;
}

function addGoodie(goodies, flag, name, goodieToGive, gameDuration) {
  if (flag) {
    var randomTime = parseInt(Math.random() * gameDuration);
    goodies.push({
      name: name, // name of the goodie, will be displayed on client side
      type: goodieToGive, // goodie name, will be resolved to the goodie on client side
      time: randomTime //time to hand out the goodie in the game - random between start and end
    });
  }
}

function addToWasted(auditItems, wastedList, auditName) {
  for (var i = 0; i < auditItems.length; i++) {
    var item = auditItems[i];
    if (!wastedList[item.url]) wastedList[item.url] = {coverage: -1}; // -1 for unknown
    var newCoverage;
    if (item.wastedPercent) {
      newCoverage = 100 - item.wastedPercent;
    } else {
      newCoverage = 100 - item.wastedBytes * 100 / item.totalBytes;
    }
    var oldCoverage = wastedList[item.url].coverage;
    if (oldCoverage !== -1 && newCoverage > oldCoverage) continue;
    wastedList[item.url].coverage = newCoverage;
    wastedList[item.url].type = auditName;
    wastedList[item.url].wastedSize = parseInt(item.totalBytes - (newCoverage/100)*item.totalBytes); // in kb
  }
}


app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Start the server
const PORT = process.env.PORT || 8080;
var listener = app.listen(PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});
