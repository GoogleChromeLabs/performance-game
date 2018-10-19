importScripts('https://storage.googleapis.com/workbox-cdn/releases/3.0.0/workbox-sw.js');

console.log('this is my custom service worker');

workbox.precaching.precacheAndRoute([]);

workbox.routing.registerRoute(
  new RegExp('.*gamestate.json.*'),
  workbox.strategies.networkFirst()
);

workbox.routing.registerRoute(
  new RegExp('.*'),
  workbox.strategies.networkFirst({"networkTimeoutSeconds": 1})
);
