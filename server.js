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

const path = require('path');
const compression = require('compression');
const express = require('express');
const fetch = require('node-fetch');
const helmet = require('helmet');

// create express server
const app = express();

const API_KEY = null;
const PSI_REST_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?category=performance&category=best-practices&category=pwa&strategy=mobile';

// enable compression
app.use(compression());
// enable some security stuff, especially hsts
app.use(helmet());


// setting up routes for the various files
app.use(express.static('public'));

// index.html is generated, so we changed the name to make this clear into generated.Html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/generated.html'));
});
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/generated.html'));
});


// this is the main hook. It will open puppeteer, load the URL and grab performance metrics and log resource loading
// All this will be used to create a level to play through
app.get('/gamestate.json', async(request, response) => {

  // construct rest api url
  var api_url = PSI_REST_API;
  api_url += '&url=' + request.query.url;
  if (API_KEY) {
    api_url += '&key=' + API_KEY;
  }

  // get the lighthouse report
  var status;
  var json;

  try {
    const res = await fetch(api_url);
    status = res.status;
    json = await res.json();
  } catch (err) {
    // handle error for example:
    console.error(err);
  }
  console.log(status + '   --    ' + JSON.stringify(json).substring(0, 200));


  var lhr = json.lighthouseResult;

  // get the audit results from lighthouse
  var lhr_fcp = lhr.audits.metrics.details.items[0].firstContentfulPaint;
  var lhr_observed_fcp = lhr.audits.metrics.details.items[0].observedFirstContentfulPaint;
  var lhr_fmp = lhr.audits.metrics.details.items[0].firstMeaningfulPaint;
  var lhr_observed_fmp = lhr.audits.metrics.details.items[0].observedFirstMeaningfulPaint;
  var lhr_interactive = lhr.audits.metrics.details.items[0].interactive;
  var lhr_screenshots = lhr.audits['screenshot-thumbnails'] && lhr.audits['screenshot-thumbnails'].details ? lhr.audits['screenshot-thumbnails'].details.items : [];
  var lhr_network = lhr.audits['network-requests'].details.items;
  var lhr_perf_score = lhr.categories.performance.score;
  var lhr_pwa_score = lhr.categories.pwa.score;
  var lhr_has_sw = lhr.audits['service-worker'].rawValue;
  var lhr_has_a2hs = lhr.audits['webapp-install-banner'].rawValue;
  var lhr_has_http2 = lhr.audits['uses-http2'] ? lhr.audits['uses-http2'].rawValue : false;
  var lhr_has_https = lhr.audits['is-on-https'].rawValue;
  var lhr_has_offline = lhr.audits['works-offline'].rawValue;
  var lhr_bootup_time = lhr.audits['bootup-time'] && lhr.audits['bootup-time'].details ? lhr.audits['bootup-time'].details.items : [];

  // for efficiency let's move the bootup time from list into a hash, indexed by url
  var bootupHash = [];
  for (var i = 0; i < lhr_bootup_time.length; i++) {
    var item = lhr_bootup_time[i];
    bootupHash[item.url] = item.total; // total scriting time
  }

  // merge several of the byteefficiency audits in a general 'wasted' hashmap
  var wasted = getWasted(lhr.audits);

  console.log('Lighthouse  finished, fcp: ' + lhr_fcp + ' - FMP: ' + lhr_fmp + ' - TTI: ' + lhr_interactive);
  console.log('Lighthouse  observed, fcp: ' + lhr_observed_fcp + ' - FMP: ' + lhr_observed_fmp + ' - TTI: ' + lhr_interactive);

  // now segment resource loading into levels based on performance metrics
  var resources1 = [];
  var resources2 = [];
  var resources3 = [];
  var resources4 = [];
  var lastResTime;
  for (i = 0; i < lhr_network.length; i++) {
    var res = lhr_network[i];
    // let's skip the really small ones (analytics pings etc.)
    // they'll just distract from the real problems
    if (res.transferSize < 700) continue; // smaller than 700 byte
    var name = res.url.split('/').pop().replace(/[^a-zA-Z._ ]{3,}/g, '*'); // get just filename, and replace everything unreadable with * (fingerprints, hashes etc.)
    if (name.includes('?')) name = name.substring(0, name.indexOf('?')); // also strip off url params
    if (!name) name = res.url.substring(res.url.indexOf('//') + 2); // let's use host if path is empty
    res.label = name;
    res.coverage = 100;
    res.bootupTime = bootupHash[res.url] ? bootupHash[res.url] : 0;
    res.coverage = wasted[res.url] ? wasted[res.url].coverage : 100;
    res.wastedSize = wasted[res.url] ? wasted[res.url].wastedSize : 0;
    if (res.endTime < lhr_observed_fcp) {
      resources1.push(res);
      res.startTime = res.startTime * (lhr_fcp / lhr_observed_fcp);
      res.endTime = res.endTime * (lhr_fcp / lhr_observed_fcp);
    } else if (res.endTime < lhr_observed_fmp) {
      resources2.push(res);
      res.startTime = res.startTime * (lhr_fmp / lhr_observed_fmp);
      res.endTime = res.endTime * (lhr_fmp / lhr_observed_fmp);
    } else if (res.endTime * (lhr_fmp / lhr_observed_fmp) < lhr_interactive) {
      resources3.push(res);
      res.startTime = res.startTime * (lhr_fmp / lhr_observed_fmp);
      res.endTime = res.endTime * (lhr_fmp / lhr_observed_fmp);
    } else {
      resources4.push(res);
      res.startTime = res.startTime * (lhr_fmp / lhr_observed_fmp);
      res.endTime = res.endTime * (lhr_fmp / lhr_observed_fmp);
      lastResTime = res.endTime;
    }
  }

  // fix screenshot timings as well
  for (i = 0; i < lhr_screenshots.length; i++) {
    var shot = lhr_screenshots[i];
    if (shot.timing < lhr_fcp) {
      shot.timing = shot.timing * (lhr_fcp / lhr_observed_fcp);
    } else {
      shot.timing = shot.timing * (lhr_fmp / lhr_observed_fmp);
    }
  }

  var levels = [];
  var level1 = {name: 'First Contentful Paint', resources: resources1, time: lhr_fcp};
  var level2 = {name: 'First Meaningful Paint', resources: resources2, time: lhr_fmp};
  var level3 = {name: 'Interactive', resources: resources3, time: lhr_interactive};
  var level4 = {name: 'Full Load', resources: resources4, time: lastResTime};
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
  var is_pwa = lhr_pwa_score > 0.7;
  // if it's not a full PWA we'll reward the individual features at least
  if (!is_pwa) {
    addGoodie(goodies, lhr_has_sw, 'ServiceWorker registered', 'shoot-rate', lhr_interactive);
    addGoodie(goodies, lhr_has_a2hs, 'Add-To-Homescreen', 'extra-life', lhr_interactive);
    addGoodie(goodies, lhr_has_offline, 'Offline Mode', 'extra-life', lhr_interactive);
  } else {
    addGoodie(goodies, is_pwa, 'Progressive Web App', 'bomb', lhr_interactive);
  }
  addGoodie(goodies, lhr_has_http2, 'HTTP2 enabled', 'extra-life', lhr_interactive);
  addGoodie(goodies, lhr_has_https, 'Page is secure', 'shield', lhr_interactive);


  // finalize gamestate
  var gameplay = {
    lhr_perf_score: lhr_perf_score,
    lhr_pwa_score: lhr_pwa_score,
    lhr_screenshots: lhr_screenshots,
    levels: levels,
    goodies: goodies,
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
  for (var i = 0; i < level.resources.length; i++) {
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
    var randomTime = parseInt(Math.random() * gameDuration, 10);
    goodies.push({
      name: name, // name of the goodie, will be displayed on client side
      type: goodieToGive, // goodie name, will be resolved to the goodie on client side
      time: randomTime, // time to hand out the goodie in the game - random between start and end
    });
  }
}

function getWasted(audits) {
  var wastedList = {};
  for (var name in audits) {
    var audit = audits[name];
    if (!audit.details) continue;
    if (!audit.details.items) continue;
    var items = audit.details.items;
    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      if (!wastedList[item.url]) wastedList[item.url] = {coverage: -1}; // -1 for unknown
      var newCoverage;
      if (item.wastedPercent) {
        newCoverage = 100 - item.wastedPercent;
      } else if (item.wastedBytes) {
        newCoverage = 100 - item.wastedBytes * 100 / item.totalBytes;
      } else continue;
      var oldCoverage = wastedList[item.url].coverage;
      if (oldCoverage !== -1 && newCoverage > oldCoverage) continue;
      wastedList[item.url].coverage = newCoverage;
      wastedList[item.url].type = name;
      wastedList[item.url].wastedSize = parseInt(item.totalBytes - (newCoverage / 100) * item.totalBytes, 10); // in kb
    }
  }
  return wastedList;
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
