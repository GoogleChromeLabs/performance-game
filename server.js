/**-
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
const fs = require('fs')
const path = require('path')
const bodyParser = require('body-parser')
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const adapter = new FileSync('.data/db.json')
const db = low(adapter)
const {URL} = require('url');

const express = require('express');
const puppeteer = require('puppeteer');
const lighthouse = require('lighthouse');

//for all of these we simulate a mobile phone - we'll take the 5x for now
const devices = require('puppeteer/DeviceDescriptors');
const phone = devices['Nexus 5X'];

//create express server
const app = express();

// set up body parsing to later on parse json from responses
app.use(bodyParser.json());


//setting up routes for the various files
app.use(express.static('public'));

/*app.get('/',function(req,res){
     res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/game.html',function(req,res){
     res.sendFile(path.join(__dirname, 'game.html'));
});
app.get('/endscreen.html',function(req,res){
     res.sendFile(path.join(__dirname, 'endscreen.html'));
});*/


// save a new highscore
app.post("/saveScore", function (request, response) {
  var urlPlayed = decodeURIComponent(request.body.url);
  // we'll base64 the url, to avoid problems with special chars etc.
  var urlBase64 = Buffer.from(urlPlayed).toString('base64');
  var scores = db.get(urlBase64).value();
  if(!scores) scores = [];
  //todo: verify player name is safe - but given we'll use key-value store we're safe from sql injection anyway
  scores.push({ playerName: request.body.playerName, score: request.body.score });
  // don't save too many scores, we only need ten max
  if(scores.length > 10) {
    var smallestIndex = 0;
    var smallestScore = Number.MAX_VALUE;
    for(var i = 0; i < scores.length; i++) {
      if(scores[i] <  smallestScore) {
        smallestIndex = i;
        smallestScore = scores[i];
      }
    }
    scores.splice(smallestIndex,1);
  }
  // save back the scores list for this url
  db.set(urlBase64, scores).write();
  console.log("New score inserted in the database: " + urlPlayed + " - " + request.body.playerName + " - " + request.body.score);
  response.sendStatus(200);
});

// get highscores
app.get("/getScores", function (request, response) {
  var urlPlayed = decodeURIComponent(request.query.url);
  // we'll base64 the url, to avoid problems with special chars etc.
  var urlBase64 = Buffer.from(urlPlayed).toString('base64');
  var scores = db.get(urlBase64).value();
  if(!scores) scores = [];
  console.log("Returning scores for url " + urlPlayed + ": " + JSON.stringify(scores));
  response.contentType('application/json');
  response.end(JSON.stringify(scores));
});

// this is the main hook. It will open puppeteer, load the URL and grab performance metrics and log resource loading
// All this will be used to create a level to play through
app.get("/gamestate.json", async (request, response) => {
  // todo: verify this is multi-thread safe and can handle the load
  const browser = await puppeteer.launch({
     args: ['--no-sandbox'],
     timeout: 10000
   });
	const page = await browser.newPage();
  var url = request.query.url;
  console.log("Starting game for url: " + url);
  var startTime;

  //now run lighthouse
  // Lighthouse will open URL. Puppeteer observes `targetchanged` and sets up network conditions.
  // Possible race condition.
  const {lhr} = await lighthouse(url, {
    port: (new URL(browser.wsEndpoint())).port,
    output: 'json',
    logLevel: 'error',
  });

  // for testing and debugging we can write out the result json, you Can
  //inspect it via the lighthouse viewer here: https://googlechrome.github.io/lighthouse/viewer/
  //fs.writeFile('myjsonfile.json', JSON.stringify(lhr), 'utf8', function(){});

  // get the audit results from lighthouse
  var lhr_fcp = lhr.audits["first-contentful-paint"].rawValue;
  var lhr_psi = lhr.audits["speed-index"].rawValue;
  var lhr_interactive = lhr.audits["interactive"].rawValue;
  var lhr_screenshots = lhr.audits["screenshot-thumbnails"].details.items[0].data;
  var lhr_network = lhr.audits["network-requests"].details.items;
  var lhr_unused_css = lhr.audits["unused-css-rules"].details.items;
  var lhr_optimized_images = lhr.audits["uses-optimized-images"].details.items;
  var lhr_uses_webp = lhr.audits["uses-webp-images"].details.items;
  //var lhr_unused_js = lhr.audits["unused-js-rules"].details.items;

  // merge several of the byteefficiency audits in a general 'wasted' hashmap
  var wasted = {};
  for(var i = 0; i < lhr_unused_css.length; i++) {
    var item = lhr_unused_css[i];
    if(!wasted[item.url]) wasted[item.url] = {};
    wasted[item.url].coverage = 100 - item.wastedPercent;
    wasted[item.url].type = "unused-css";
  }
  for(var i = 0; i < lhr_optimized_images.length; i++) {
    var item = lhr_optimized_images[i];
    if(!wasted[item.url]) wasted[item.url] = {};
    wasted[item.url].coverage = 100 - item.wastedBytes*100/item.totalBytes;
    wasted[item.url].type = "optimized-images";
  }
  for(var i = 0; i < lhr_uses_webp.length; i++) {
    var item = lhr_uses_webp[i];
    if(!wasted[item.url]) wasted[item.url] = {};
    newCoverage = 100 - item.wastedBytes*100/item.totalBytes;
    oldCoverage = wasted[item.url].coverage;
    if(newCoverage>oldCoverage) continue;
    wasted[item.url].coverage = newCoverage;
    wasted[item.url].type = "optimized-images";
  }
  console.log("Lighthouse  finished, fcp: " + lhr_fcp + " - PSI: " + lhr_psi + " - TTI: " + lhr_interactive);

  await browser.close();
  
  //now segment resource loading into levels based on performance metrics
  var resources1 = [];
  var resources2 = [];
  var resources3 = [];
  var resources4 = [];
  for(var i = 0; i < lhr_network.length; i++) {
    var res = lhr_network[i];
    var name = res.url.split('/').pop().replace(/[^a-zA-Z._ ]{3,}/g, "*");  // get just filename, and replace everything unreadable with * (fingerprints, hashes etc.)
    if(name.includes('?')) name = name.substring(0, name.indexOf('?'));  // also strip off url params
    if(!name) name = "index.html";  //empty path means index.html
    res.label = name;
    res.coverage = 100;
    if (wasted[res.url]) res.coverage = wasted[res.url].coverage;
    if(res.startTime < lhr_fcp) resources1.push(res);
    else if(res.startTime < lhr_psi) resources2.push(res);
    else if(res.startTime < lhr_interactive) resources3.push(res);
    else resources4.push(res);
  }
  var level1 = {"name": "Level 1\nFirst Contentful Paint\nHit ENTER to start", "resources": resources1};
  var level2 = {"name": "Level 2\nSpeed Index\nHit ENTER to start", "resources": resources2};
  var level3 = {"name": "Level 3\nInteractive\nHit ENTER to start", "resources": resources3};
  var level4 = {"name": "Level 4\nFull Load\nHit ENTER to start", "resources": resources4};
  var gameplay = [level1, level2, level3, level4];

  //console.log(JSON.stringify(gameplay, null, 4));
  // send out gameplay
  response.header("Access-Control-Allow-Origin", "*");
  response.contentType('application/json');
  response.end(JSON.stringify(gameplay));
});


app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// Start the server
const PORT = process.env.PORT || 8080;
var listener = app.listen(PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});
