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

const common = require('./common.js');

var mobileSettings = {
  min_asteroid_size: 25,
  max_asteroid_size: 200,
  min_asteroid_speed: 30,
  max_asteroid_speed: 70,
  max_asteroids_at_once: 5,
  asteroid_size_threshold: 2, // in kb, to ignore plain pings
};

var desktopSettings = {
  min_asteroid_size: 35,
  max_asteroid_size: 300,
  min_asteroid_speed: 40,
  max_asteroid_speed: 120,
  max_asteroids_at_once: 30,
  asteroid_size_threshold: 1, // in kb, to ignore plain pings
};

var settings;
if (common.isMobile()) settings = mobileSettings;
else settings = desktopSettings;

settings.hints = [
  'This game visualizes the loading process of a website.',
  'It will help to identify performance bottlenecks and problems.',
  'The gameplay is built from a Google Lighthouse audit.',
  'Every level represents one reached performance metric.',
  'Every asteroid represents one loaded resource.',
  'Every shot represents a 10kb download.',
  'The color of an asteroid repesents how much of the resource was used.',
  'A green asteroid means more than 85% of the resource is used.',
  'An orange asteroid means less than 85% of the resource is used.',
  'A red asteroid means less than 50% of the resource is used.',
  'On the upper left you can see the current visual state of the website.',
  'If your site can be installed, a powerup for faster fire rate is enabled.',
  'If your site is secure, a shield powerup will show up.',
  'A full PWA enables a powerup to destroy all asteroids at once.',
  'A full Lighthouse SEO score makes your shots stronger.'
];

module.exports.settings = settings;
