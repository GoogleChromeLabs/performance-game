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
	await page.emulate(phone);

  var resources = [];

  // capture and log all resources loaded
  page.on('response', response => {
    var url = response.url();
    var length = response.headers()["content-length"];
    if(!length) length = 1;
    var type = response.headers()["content-type"];
    if(!url || !type) return;
    length = length/1000;   // let's work in kb, more intuitive
    var name = url.split('/').pop().replace(/[^a-zA-Z._ ]{3,}/g, "*");  // get just filename, and replace everything unreadable with * (fingerprints, hashes etc.)
    if(name.includes('?')) name = name.substring(0, name.indexOf('?'));  // also strip off url params
    if(!name) name = "index.html";  //empty path means index.html
    //only do this for common mime types
    if(type.includes("text/html") || type.includes("text/css") || type.includes("javascript") || type.includes("image/") || type.includes("font/") || !startTime) {
      if(!startTime) startTime = Date.now();
      resources.push({"time": Date.now() - startTime, "label": name, "size": length, "url": url, "coverage": 100});
    }
  })

  // collect coverage metrics
  await Promise.all([
    page.coverage.startJSCoverage(),
    page.coverage.startCSSCoverage()
  ]);

  // now load the page. This will trigger the response logging, adn coverage monitoring
  await page.goto(url);
  // we'll need to wait a sec, otherwise FMP isn't calculated yet
  await page.waitFor(1000);

  // stop coverage monitoring, collect coverage stats
  var coverage = {};
  const [jsCoverage, cssCoverage] = await Promise.all([
    page.coverage.stopJSCoverage(),
    page.coverage.stopCSSCoverage(),
  ]);
  // calculate the coverage for every resource
  let totalBytes = 0;
  let usedBytes = 0;
  for (const entry of [...jsCoverage, ...cssCoverage]) {
    totalBytes += entry.text.length;
    for (const range of entry.ranges) {
      usedBytes += range.end - range.start - 1;
    }
    coverage[entry.url] = usedBytes / totalBytes * 100; // coverage in percent
  }


  // collecte performance metrics
  var fmp = (await page._client.send('Performance.getMetrics')).metrics.find(x => x.name === "FirstMeaningfulPaint").value/1000;
  const firstPaint = await page.evaluate("window.performance.getEntriesByName('first-paint')[0].startTime;");
  const domInteractive = await page.evaluate("window.performance.timing.domInteractive - window.performance.timing.navigationStart");
  const loadEventStart = await page.evaluate("window.performance.timing.loadEventStart - window.performance.timing.navigationStart");
  console.log(firstPaint + " - " + fmp + " - " + domInteractive + " - " + loadEventStart);
  //fmp seems sometimes smaller than firstpaint - as a hack take loadevent then for now
  if(fmp < firstPaint) fmp = loadEventStart;


  //now run lighthouse
  // Lighthouse will open URL. Puppeteer observes `targetchanged` and sets up network conditions.
  // Possible race condition.
  const {lhr} = await lighthouse(url, {
    port: (new URL(browser.wsEndpoint())).port,
    output: 'json',
    logLevel: 'info',
  });

  console.log(`Lighthouse scores: ${Object.values(lhr.categories).map(c => c.score).join(', ')}`);

  await browser.close();
  //now segment resource loading into levels based on performance metrics
  var resources1 = [];
  var resources2 = [];
  var resources3 = [];
  for(var i = 0; i < resources.length; i++) {
    var res = resources[i];
    if(coverage[res.url]) res.coverage = coverage[res.url];
    if(res.time < firstPaint) resources1.push(res);
    else if(res.time < fmp) resources2.push(res);
    else resources3.push(res);
  }
  var level1 = {"name": "Level 1\nFirst Paint\nHit ENTER to start", "resources": resources1};
  var level2 = {"name": "Level 2\nMeaningful Paint\nHit ENTER to start", "resources": resources2};
  var level3 = {"name": "Level 3\nFull Load\nHit ENTER to start", "resources": resources3};
  var gameplay = [level1, level2, level3];

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
