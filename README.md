# The Performance Game
There are many excellent tools, metrics and docs regarding page speed, but these often only appeal to a specific audience - basically people already in the mindset anyway. And even for those the material can be sometimes confusing, boring or just too much. This project aims at visualizing key metrics and problems with the loading of a page in a fun and engaging way - as a game. Idea is to educate people about site load speed through gamification, and also encourage sharing of the game (and therefore page speed ideas and resources) through game leaderboards.


# Game Overview
 This project uses bases on a well-known traditional game, and uses obstacles to represent loading of resources. Player controls a spaceship and has to destroy incoming asteroids, representing loaded resources of the page. Key aspects of the game:
* At game start player selects a URL of a website to play
* Player selects difficulty (2G, 3G, 4G, Wifi - changes fire rate, each fired shot is 20kb download)
* If an asteroid is hit enough times, the asteroid is destroyed (resource is downloaded)
* Well implemented best practices will give you boosters
    * Service-Worker - extra life?
    * If page is on https player gets a shield?
    * Http2?
    * font-display css
    * resource hints (link rel preconnect etc.)
* Every meteorite represents one loaded resource of the page (labeled for player)
* Meteorites come in in the sequence of the loading order
* Size of meteorite represents size of resource
* Color of meteorite represents optimization potential (red part is unused JS/CSS or what could be saved by further compressing for images etc.)
    * If a large part of code is unused at page load, it can't be destryed (will stay as obstacle through the whole game)
* Several levels mapping to site load key points (first paint, first meaningful paint, TTI, fully loaded)
* Destroying the last asteroid ends the game, and brings you to the the highscores for the URL you played, which you can then easily share via web-share API

# Can I contribute?

Of course you can! Contributions are always welcome. Please take a look at [CONTRIBUTING](./CONTRIBUTING.md).


# Installation/Contributing
1. Fork the repository (see [here](https://help.github.com/articles/fork-a-repo/#fork-an-example-repository))
2. Clone the repository (see [here](https://help.github.com/articles/cloning-a-repository/))
3. Install dependencies via npm install (be sure to have node and npm installed)

  ```none
  $ npm install 
  ```
4. Run the game via node
  ```none
  $ node run start
  ```
5. Do your changes, test, repeat
6. Lint the code via
  ```none
  $ npm run lint
  ```
7. Push code back to your fork
```none
  $ git add .
  $ git commit -m "update message"
  $ git push
  ```
8. Create PR from this via UI (see [here](https://help.github.com/articles/creating-a-pull-request-from-a-fork/))


