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

const bodyParser = require('body-parser');
const {URL} = require('url');

const express = require('express');
const puppeteer = require('puppeteer');
const lighthouse = require('lighthouse');

// create express server
const app = express();

// set up body parsing to later on parse json from responses
app.use(bodyParser.json());


// setting up routes for the various files
app.use(express.static('public'));

/* app.get('/',function(req,res){
     res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/game.html',function(req,res){
     res.sendFile(path.join(__dirname, 'game.html'));
});
app.get('/endscreen.html',function(req,res){
     res.sendFile(path.join(__dirname, 'endscreen.html'));
});*/


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
  var lhr_screenshots = lhr.audits['screenshot-thumbnails'].details.items;
  var lhr_network = lhr.audits['network-requests'].details.items;
  var lhr_unused_css = lhr.audits['unused-css-rules'].details.items;
  var lhr_optimized_images = lhr.audits['uses-optimized-images'].details.items;
  var lhr_uses_webp = lhr.audits['uses-webp-images'].details.items;
  var lhr_perf_score = lhr.categories.performance.score;
  var lhr_pwa_score = lhr.categories.pwa.score;
  // var lhr_unused_js = lhr.audits["unused-js-rules"].details.items;

  // merge several of the byteefficiency audits in a general 'wasted' hashmap
  var wasted = {};
  addToWasted(lhr_unused_css, wasted, 'unused-css');
  addToWasted(lhr_optimized_images, wasted, 'optimized-images');
  addToWasted(lhr_uses_webp, wasted, 'optimized-images');

  console.log('Lighthouse  finished, fcp: ' + lhr_fcp + ' - PSI: ' + lhr_psi + ' - TTI: ' + lhr_interactive);

  await browser.close();

  // now segment resource loading into levels based on performance metrics
  var resources1 = [];
  var resources2 = [];
  var resources3 = [];
  var resources4 = [];
  for (var i = 0; i < lhr_network.length; i++) {
    var res = lhr_network[i];
    var name = res.url.split('/').pop().replace(/[^a-zA-Z._ ]{3,}/g, '*'); // get just filename, and replace everything unreadable with * (fingerprints, hashes etc.)
    if (name.includes('?')) name = name.substring(0, name.indexOf('?')); // also strip off url params
    if (!name) name = res.url.substring(res.url.indexOf('//') + 2); // let's use host if path is empty
    res.label = name;
    res.coverage = 100;
    if (wasted[res.url]) res.coverage = wasted[res.url].coverage;
    if (res.endTime < lhr_fcp) resources1.push(res);
    else if (res.endTime < lhr_psi) resources2.push(res);
    else if (res.endTime < lhr_interactive) resources3.push(res);
    else resources4.push(res);
  }
  var levels = [];
  var level1 = {name: 'First Contentful Paint\nHit ENTER to start', resources: resources1};
  var level2 = {name: 'Speed Index\nHit ENTER to start', resources: resources2};
  var level3 = {name: 'Interactive\nHit ENTER to start', resources: resources3};
  var level4 = {name: 'Full Load\nHit ENTER to start', resources: resources4};
  // only add levels with resources in them
  if (resources1.length > 0) levels.push(level1);
  if (resources2.length > 0) levels.push(level2);
  if (resources3.length > 0) levels.push(level3);
  if (resources4.length > 0) levels.push(level4);
  // fix the naming, in case we omitted empty levels
  for (i = 0; i < levels.length; i++) {
    levels[i].name = 'Level ' + (i+1) + '\n' + levels[i].name;
  }
  // finalize gamestate
  var gameplay = {
    lhr_perf_score: lhr_perf_score,
    lhr_pwa_score: lhr_pwa_score,
    lhr_screenshots: lhr_screenshots,
    levels: levels,
  };

  // console.log(JSON.stringify(gameplay, null, 4));
  // send out gameplay
  response.header('Access-Control-Allow-Origin', '*');
  response.contentType('application/json');
  response.end(JSON.stringify(gameplay));
});

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
