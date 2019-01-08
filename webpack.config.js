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

const path = require('path')
const webpack = require('webpack');
const Critters = require('critters-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ScriptExtHtmlWebpackPlugin = require('script-ext-html-webpack-plugin');

var phaserModule = path.join(__dirname, '/node_modules/phaser/');
var phaser = path.join(phaserModule, 'build/custom/phaser-split.js'),
  pixi = path.join(phaserModule, 'build/custom/pixi.js'),
  p2 = path.join(phaserModule, 'build/custom/p2.js');

module.exports = {
  entry: {
    main: './src/game.js',
    deferred: './src/deferred.js'
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'public')
  },
  module: {
      rules: [
          { test: /pixi.js/, use: "script-loader" },
          { test: /p2.js/, use: "script-loader" },
          { test: /dialog-polyfill.js/, use: "script-loader" },
          { test: /phaser-split\.js$/, use: ['expose-loader?Phaser'] },
      ]
  },
  resolve: {
      alias: {
          'phaser': phaser,
          'pixi.js': pixi,
          'p2': p2,
      }
  },
  plugins: [
    new HtmlWebpackPlugin({
        filename: 'generated.html',
        template: 'templates/index.html',
        chunksSortMode: 'none'
    }),
    new ScriptExtHtmlWebpackPlugin({
      sync: 'main.bundle.js',
      defaultAttribute: 'async'
    }),
     new Critters({
       // optional configuration (see below)
     })
  ]
}
