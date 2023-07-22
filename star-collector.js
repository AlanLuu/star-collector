import { assert, isMobile } from './util.js';

//Not going to add mobile device support for this game
if (isMobile.any()) {
    try {
        swal({
            text: "Sorry, but this game can only be played on a computer or a tablet with an external keyboard.",
            icon: "error",
            closeOnClickOutside: false
        }).then(_ => {
            if (window.history.length <= 1) {
                location.href = "about:blank";
            } else {
                window.history.back();
            }
        });
    } finally {
        throw new Error("Mobile device detected");
    }
}

const debug = false;
const loading = document.getElementById("loading");

/*
    ERROR HANDLER
*/
window.addEventListener("error", e => loading.innerHTML = `An error has been detected and the game has been stopped to prevent a crash. Please refresh the page. <br> Technical details: ${e.message} (at ${e.filename.substring(e.filename.lastIndexOf("/") + 1)} [Line ${e.lineno}])`);

/*
    Saves the player's high score in localStorage when they exit or reload the page
*/
window.addEventListener("beforeunload", _ => !debug && score > highScore ? window.localStorage.setItem("highScore", score) : {});

/*
    GAME OBJECT VARIABLES
*/
let background;
let platforms;
let player;
let cursors;
let stars;
let bombs;
let pause;
let resume;
let scoreText;
let infoText;
let livesText;
let levelText;
let highScoreText;
let fpsDebugText;

const COLOR = Object.freeze({
    RED: 0xff0000,
    WHITE: 0xffffff,
    ARMOR: 0x64eb34,
    INVINCIBLE: 0xffff00,
    MERCY: 0xffab00
});
const TIME = Object.freeze({
    MERCY: 3000,
    MESSAGE: 2000,
    RUNNING: 5000
});
const SPEED = Object.freeze({
    WALK: 160,
    RUN: 250,
    JUMP: 330,
    BOUNCE: 0,
    GROUND_POUND: 500
});
const VOLUME = Object.freeze({
    MUSIC: 1.0,
    POWER_UP: 0.3
});

const STARTING_LIVES = 5;

/*
    Rewards the player with an extra life after passing a certain number of levels
    Set this value to 0 to disable this feature
*/
const BONUS_LIFE_LEVELS = 0;

let score = 0;
let level = 1;
let lives = debug ? Infinity : STARTING_LIVES;
const highScore = window.localStorage.getItem("highScore") !== null ? Number(window.localStorage.getItem("highScore")) : 0;

/*
    Prevents the player from repeatedly jumping if the up arrow key is constantly held down
*/
let upKeyDown = false;

/*
    Represents whether the player has finished their jump
*/
let jumpEnabled = false;

/*
    When this is true, the player is unaffected by bombs
    This however, by itself, doesn't allow the player to destroy any bomb on contact
*/
let invincible = false;

/*
    When this is true, the player will be able to destroy any bomb on contact
    This boolean should NEVER be true if the player is not invincible
    canDestroy -> invincible, but it's not always the case that invincible -> canDestroy
*/
let canDestroy = false;

/*
    This is true when a power-up that causes invincibility is collected
    It stays true for the duration of the power-up
*/
let invinciblePowerup = false;

/*
    If this variable is true, the player can ground pound bombs without any consequences
    This variable is always false in daredevil mode
*/
let invincibleGroundPound = false;

/*
    Provides a time limit on holding down the shift key to speed up
*/
let isTired = false;

/*
    Daredevil mode: how far can you get with only one life and no power-ups?
*/
let daredevil = false;

/*
    Toggle these to enable or disable the background music or the sfx
*/
const musicEnabled = true;
const sfxEnabled = true;

/*
    Flag that represents whether the user attempted to ground-pound a bomb
    If true, show a special message to the user regarding ground-pounding bombs
*/
let bombGroundPounded = false;

/*
    Flag for update function
*/
let gameIsOver = false;

/*
    When this is true, the player can absorb one hit from a bomb
*/
let hasArmor = false;

/*
    Function to pause script execution for a period of time
*/
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function resetInfoText() {
    infoText.setText(level < infoTextList.length + 1 ? infoTextList[level - 1] : "");
}

function despawnEverything() {
    bombs.children.iterate(child => child.disableBody(true, true));
    stars.children.iterate(child => child.disableBody(true, true));
    despawnPowerUps();
}

function despawnPowerUps() {
    for (let [key] of Object.entries(powerups)) {
        powerups[key]["ref"].disableBody(true, true);
    }
}

function createBomb() {
    let x = (player.x < 400) ? Phaser.Math.Between(400, 800) : Phaser.Math.Between(0, 400);
    let bomb = bombs.create(x, 16, 'bomb');
    bomb.setBounce(1);
    bomb.setCollideWorldBounds(true);
    bomb.setVelocity(Phaser.Math.Between(-200, 200), 20);
    bomb.allowGravity = false;
}

/*
    Called when lives < 1
    You can also call this explicitly if you want to manually trigger a game over
*/
function gameOver(_this) {
    gameIsOver = true;
    invincible = false; //Ignore any invincibility the player has
    lives = 0;
    despawnEverything();
    infoText.setText("You died! Refresh the page to try again.");
    if (sfxEnabled) _this.sound.play("explosion");
    _this.physics.shutdown(); //Stops the game
    _this.input.keyboard.removeAllListeners();
    _this.cameras.main.shake(500);
    if (musicEnabled) _this.sound.removeByKey("music"); //Stops the music
    player.disableBody(true, true); 
    pause.visible = false;
    resume.visible = false;
    if (!debug && score > highScore) {
        window.localStorage.setItem("highScore", score);
    }
}

function levelCheck(...levels) {
    let isLevel = false;
    for (let lev of levels) {
        isLevel = isLevel || level === lev;
    }
    return isLevel;
}

/*
    CONFIGURATION
*/
const canvas = {
    type: Phaser.AUTO, //Defaults to WebGL if supported, otherwise canvas
    width: 800,
    height: 600,
    
    physics: {
        default: 'arcade',
        arcade: {
            gravity: {
                y: 300
            },
            debug: debug
        }
    },
    
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

/*
    GAME ASSETS
*/
const assets = {
    sky: 'assets/sky.png',
    ground: 'assets/platform.png',
    star: 'assets/star.png',
    bomb: 'assets/bomb.png',
    player: 'assets/player.png',
    pause: 'assets/pause.png',
    resume: 'assets/resume.png',
    
    powerups: {
        ultimate: {
            sprite: 'assets/ultimatepotion.png',
            key: 'ultimate',
            spawnRate: 0.05,
            duration: 10000,

            onCollect: function() {
                invincible = true;
                canDestroy = true;
                invinciblePowerup = true;
                lives++;
                
                bombs.children.iterate(child => {
                    child.setVelocity(0, 5);
                    child.setBounce(0.1);
                    child.allowGravity = false;
                });
                stars.children.iterate(child => {
                    if (child.body.velocity.x !== 0) {
                        child.setVelocity(0, 5);
                        child.setBounce(0.1);
                        child.allowGravity = false;
                    }
                });
                for (let [key] of Object.entries(powerups)) {
                    let powerup = powerups[key]["ref"];
                    if (powerup.visible) {
                        powerup.setVelocity(0, 5);
                        powerup.setBounce(0.1);
                        powerup.allowGravity = false;
                    }
                }
                
                infoText.setText("Lives increased by one, \nyou are now invincible, \nand all game objects have been stopped!");
                wait(this.duration).then(_ => {
                    invincible = false;
                    canDestroy = false;
                    invinciblePowerup = false;
                    bombs.children.iterate(child => {
                        child.setBounce(1);
                        child.setVelocity(Phaser.Math.Between(-200, 200), 20);
                        child.setY(child.y - 60);
                        child.allowGravity = false;
                    });
                    stars.children.iterate(child => {
                        if (child.body.velocity.x === 0 && level >= 6) {
                            child.setBounce(1);
                            child.setVelocity(Phaser.Math.Between(-200, 200), 20);
                            child.allowGravity = false;
                        }
                    });
                    for (let [key] of Object.entries(powerups)) {
                        let powerup = powerups[key]["ref"];
                        if (powerup.visible) {
                            powerup.setBounce(1);
                            powerup.setVelocity(Phaser.Math.Between(-200, 200), 20);
                            powerup.setY(powerup.y - 60);
                            powerup.allowGravity = false;
                        }
                    }
                    resetInfoText();
                });
            }
        },

        armor: {
            sprite: 'assets/armorpotion.png',
            key: 'armor',
            spawnRate: 0.4,
            duration: TIME.MERCY / 2,

            onCollect: function() {
                hasArmor = true;
                infoText.setText("You gained some armor!");
                wait(this.duration).then(resetInfoText);
            }
        },

        invincibility: {
            sprite: 'assets/invinciblepotion.png',
            key: 'invincibility',
            spawnRate: 0.3,
            duration: 10000,

            onCollect: function() {
                if (!invincible && !canDestroy) {
                    invincible = true;
                    canDestroy = true;
                    invinciblePowerup = true;
                    infoText.setText("You obtained an invincibility potion! \nYou're invincible!");
                    wait(this.duration).then(_ => {
                        invincible = false;
                        canDestroy = false;
                        invinciblePowerup = false;
                        resetInfoText();
                    });
                }
            }
        },
        
        oneUp: {
            sprite: 'assets/lifepotion.png',
            key: '1up',
            spawnRate: 0.6,
            duration: TIME.MERCY / 2,

            onCollect: function() {
                lives++;
                infoText.setText(levelCheck(4) ? "Nice!" : "You got an extra life!");
                wait(this.duration).then(_ => levelCheck(4) ? infoText.setText("Be sure to take advantage of extra lives!") : resetInfoText());
            }
        },

        stop: {
            sprite: 'assets/stopobject.png',
            key: 'stop',
            spawnRate: 0.0,
            duration: 10000,

            onCollect: function() {
                bombs.children.iterate(child => {
                    child.setVelocity(0, 5);
                    child.setBounce(0.1);
                    child.allowGravity = false;
                });
                
                stars.children.iterate(child => {
                    if (child.body.velocity.x !== 0) {
                        child.setVelocity(0, 5);
                        child.setBounce(0.1);
                        child.allowGravity = false;
                    }
                });
                
                for (let [key] of Object.entries(powerups)) {
                    let powerup = powerups[key]["ref"];
                    if (powerup.visible) {
                        powerup.setVelocity(0, 5);
                        powerup.setBounce(0.1);
                        powerup.allowGravity = false;
                    }
                }
                
                infoText.setText("Game objects stopped!");
                wait(this.duration).then(_ => {
                    bombs.children.iterate(child => {
                        child.setBounce(1);
                        child.setVelocity(Phaser.Math.Between(-200, 200), 20);
                        child.setY(child.y - 60);
                        child.allowGravity = false;
                    });
                    
                    stars.children.iterate(child => {
                        if (child.body.velocity.x === 0 && level >= 6) {
                            child.setBounce(1);
                            child.setVelocity(Phaser.Math.Between(-200, 200), 20);
                            child.allowGravity = false;
                        }
                    });
                    
                    for (let [key] of Object.entries(powerups)) {
                        let powerup = powerups[key]["ref"];
                        if (powerup.visible) {
                            powerup.setBounce(1);
                            powerup.setVelocity(Phaser.Math.Between(-200, 200), 20);
                            powerup.setY(powerup.y - 60);
                            powerup.allowGravity = false;
                        }
                    }

                    resetInfoText();
                });
            }
        },
    },

    sounds: {
        music: {
            music: 'assets/audio/music.mp3'
        },

        sfx: {
            explosion: 'assets/audio/explosion.mp3',
            starcollect: 'assets/audio/starcollect.mp3',
            powerupcollect: 'assets/audio/powerup.mp3'
        }
    }
};

const powerups = assets["powerups"];

const infoTextList = [
    "Welcome to Star Collector!\nUse the arrow keys to move, jump, and \nground pound. Hold shift to move faster.\nCollect every star to progress through the game!",
    "Don't touch the bomb!",
    "Yikes! Another bomb!",
    "Hey look, a life potion! \nGrab it for an extra life!",
    "Other powerups have a chance of spawning \nas well. Be sure to take advantage of them \nif they spawn!",
    "Hey look, the stars move now!",
    "Does that make this game harder?",
    "Hey, this game wasn't meant to be easy.",
    "It would quickly get boring if \nthat was the case.",
    "Are these messages distracting?",
    "Ok, I'll stop.",
    "So, how was your day so far?",
    "Good? That's good.",
    "Ok ok, I'm stopping for real this time! \n\nSheesh...",
];

const game = new Phaser.Game(canvas); //Actually load the canvas

/*
    PRELOAD ASSETS HERE
*/
function preload() {
    let p = [
        "Made with <a href='https://phaser.io/' target='_blank'>Phaser.JS</a>"
    ];
    if (musicEnabled) p.push("Music: <a href='https://youtu.be/JV41UkBQDhE' target='_blank'>https://youtu.be/JV41UkBQDhE</a>");
    for (let e of p) {
        let paragraph = document.createElement("p");
        paragraph.innerHTML = e;
        paragraph.className = "bottom";
        document.body.appendChild(paragraph);
    }

    loading.innerHTML = `${debug ? "Debug mode loading" : "Loading"}... Please wait.`;
    if (debug && console.time) console.time("Game loading time");

    for (let [key] of Object.entries(assets)) {
        let subObject = assets[key];
        
        out: {
            for (let [key2] of Object.entries(subObject)) {
                switch (key) {
                    case 'powerups':
                        this.load.image(subObject[key2]["key"], subObject[key2]["sprite"]);
                        break;
                    case 'sounds':
                        if (!musicEnabled && !sfxEnabled) {
                            break out;
                        }
                        if (musicEnabled) {
                            for (let [musicKey] of Object.entries(subObject["music"])) {
                                this.load.audio(musicKey, subObject["music"][musicKey]);
                            }
                        }
                        if (sfxEnabled) {
                            for (let [sfxKey] of Object.entries(subObject["sfx"])) {
                                this.load.audio(sfxKey, subObject["sfx"][sfxKey]);
                            }
                        }
                        break;
                    default:
                        this.load.image(key, subObject);
                        break out;
                }
            }
        }
    }

    if (debug) {
        console.log("Debug mode enabled");
        console.log("Documentation: https://photonstorm.github.io/phaser3-docs/index.html");
        console.log("Uncompressed engine code: https://cdn.jsdelivr.net/npm/phaser@3.11.0/dist/phaser.js");
    }
}

function create() {
    const _this = this;
    
    loading.innerHTML = "&nbsp;";
    background = this.add.image(canvas.width / 2, canvas.height / 2, 'sky');
    
    /*
        Init platforms
    */
    platforms = this.physics.add.staticGroup(); //Platforms do not move
    platforms.create(canvas.width / 2, canvas.height - 32, 'ground').setScale(2).refreshBody(); //GROUND
    platforms.create(canvas.width - 50, canvas.height - 380, 'ground'); //TOPMOST PLATFORM
    platforms.create(canvas.width - 750, canvas.height - 350, 'ground'); //MIDMOST PLATFORM
    platforms.create(canvas.width - 300, canvas.height - 200, 'ground'); //BOTTOMMOST PLATFORM
    
    /*
        Init pause and resume buttons
    */
    pause = this.add.image(canvas.width - 30, 35, 'pause');
    pause.setInteractive();
    resume = this.add.image(canvas.width - 30, 35, 'resume');
    resume.visible = false;
    resume.setInteractive();
    
    /*
        Init game info text
    */
    scoreText = this.add.text(16, 16, "Score: 0", { fontSize: '25px', fill: '#000'});
    infoText = this.add.text(200, 16, infoTextList[0], {fontSize: '20px', fill: '#000'});
    livesText = this.add.text(16, 84, `Lives: ${lives}`, {fontSize: '25px', fill: '#000'});
    levelText = this.add.text(16, 50, `Level: ${level}`, {fontSize: '25px', fill: '#000'});
    highScoreText = this.add.text(16, 120, `High Score: ${highScore}`, {fontSize: '25px', fill: '#000'});
    if (debug) {
        let fps = (Math.round(game.loop.actualFps * 100.0) / 100.0) + "";
        fpsDebugText = this.add.text(16, 500, `FPS: ${fps.length === 4 ? `${fps}0` : fps}`, {fontSize: '25px', fill: '#000'});
        this.add.text(510, 500, "Debug mode enabled", {fontSize: '25px', fill: '#000'});
    }
    if (daredevil) {
        lives = 1;
        infoTextList[3] = infoTextList[4] = "";
        this.add.text(620, 510, "Daredevil mode", {fontSize: '20px', fill: '#ff0000'});
    }
    
    /*
        Init player
    */
    player = this.physics.add.image(10, canvas.height - 220, 'player');
    player.setBounce(SPEED.BOUNCE);
    player.setCollideWorldBounds(true); //Prevent the player from going out of bounds
    
    cursors = this.input.keyboard.createCursorKeys();
    bombs = this.physics.add.group();
    
    this.physics.add.collider(player, platforms);
    this.physics.add.collider(bombs, platforms);
    this.physics.add.collider(bombs, bombs);
    
    /*
        INITIALIZE STARS HERE
    */
    stars = this.physics.add.group({
        key: 'star',
        
        /*
            Change this number to control how many stars spawn
            The numbers of stars spawned is the number here plus one
            If you increase this number, make sure to decrease stepX as well
        */
        repeat: 11,
        setXY: {
            x: 12,
            y: 0,
            stepX: 70
        },
        collider: true
    });
    stars.children.iterate(child => child.setBounceY(Phaser.Math.FloatBetween(0.4, 0.8)));
    this.physics.add.collider(stars, platforms);

    //Power ups
    {
        let references = [];
        for (let [key] of Object.entries(powerups)) {
            let x = Phaser.Math.Between(10, canvas.width - 30), y = 10;
            powerups[key]["ref"] = this.physics.add.image(x, y, powerups[key]["key"]);
            let powerup = powerups[key]["ref"];
            references.push(powerup);
            powerup.disableBody(true, true);
            this.physics.add.collider(powerup, platforms);
            this.physics.add.collider(powerup, bombs);
            this.physics.add.overlap(player, powerup, () => {
                if (sfxEnabled) _this.sound.play('powerupcollect', {volume: VOLUME.POWER_UP});
                powerup.disableBody(true, true);
                powerups[key].onCollect(player, powerup, _this);
            }, null, this);
        }
        
        for (let i = 0; i < references.length; i++) {
            for (let j = i + 1; j < references.length; j++) {
                this.physics.add.collider(references[i], references[j]);
            }
        }
    }
    
    if (musicEnabled) {
        this.sound.play("music", {loop: true, volume: VOLUME.MUSIC});
    }
    
    /*
        ON DEATH
    */
    this.physics.add.collider(player, bombs, (player, bomb) => {
        if (canDestroy && !invincible) canDestroy = false;
        
        let groundPounding = cursors.down.isDown && !jumpEnabled && !invinciblePowerup;
        if (invincibleGroundPound && groundPounding) {
            invincible = true;
            canDestroy = true;
        }

        if (!invincible && hasArmor) {
            infoText.setText("The armor absorbed damage!");
            hasArmor = false;
            invincible = true;
            canDestroy = false;
            wait(TIME.MERCY).then(_ => {
                invincible = false;
                resetInfoText();
            });
        } else if (!invincible) {
            lives--;
            if (lives >= 1) {
                let ouch = groundPounding && !bombGroundPounded;
                infoText.setText(ouch ? "Ouch!" : `${lives} ${lives > 1 ? "lives left" : "life left! Better be careful"}!`);
                player.setPosition(10, canvas.height - 80);
                invincible = true;
                canDestroy = false;
                wait(TIME.MERCY / (ouch ? 2 : 1)).then(_ => {
                    invincible = false;
                    if (ouch) {
                        infoText.setText("You can't ground pound bombs!");
                        invincible = true;
                        bombGroundPounded = true;
                        return wait(TIME.MERCY);
                    } else {
                        resetInfoText();
                    }
                }).then(_ => {
                    resetInfoText();
                    invincible = false;
                })
            } else {
                gameOver(_this);
            }
        } else if (canDestroy) {
            bomb.disableBody(true, true);
            score += 20;
            
            if (sfxEnabled) {
                this.sound.play('starcollect', {
                    volume: 0.25
                });
            }
        }

        if (invincibleGroundPound && groundPounding) {
            invincible = false;
            canDestroy = false;
        }
    }, null, this);
    
    /*
        ON STAR COLLECT
    */
    this.physics.add.overlap(player, stars, (player, star) => {
        star.disableBody(true, true);
        score += 10;
        if (!debug && score > highScore) {
            highScoreText.setText(`High Score: ${score}`);
        }
        
        if (sfxEnabled) {
            this.sound.play('starcollect', {
                volume: 0.25
            });
        }
        
        /*
            Once the user collects all the stars, spawn 12 new stars and add 1 bomb into the game
        */
        if (stars.countActive(true) === 0) {
            if (level >= 1) level++;
            
            stars.children.iterate(child => {
                child.enableBody(true, child.x, 0, true, true);
                
                //Stars move at level 6 and above, which makes the game harder :)
                if (level >= 6) {
                    child.setBounce(1);
                    child.setCollideWorldBounds(true);
                    child.setVelocity(Phaser.Math.Between(-200, 200), 20);
                    child.allowGravity = false;
                }
            });
            
            resetInfoText();
            createBomb();

            if (daredevil) return;
            if (level > 5) {
                for (let [key] of Object.entries(powerups)) {
                    let powerup = powerups[key]["ref"];
                    let spawnRate = powerups[key]["spawnRate"];
                    let randomNumber = Math.floor(Math.random() * 100) / 100;
                    let willSpawn = !powerup.visible && randomNumber < spawnRate;
                    if (debug) console.log(key, spawnRate, randomNumber, willSpawn);
                    
                    if (willSpawn) {
                        let x = Phaser.Math.Between(10, canvas.width - 30), y = 10;
                        powerup.enableBody(true, x, y, true, true);
                        powerup.setBounce(1);
                        powerup.setVelocity(Phaser.Math.Between(-200, 200), 20);
                        powerup.allowGravity = false;
                        powerup.setCollideWorldBounds(true);
                        break; //If one does get spawned, do not attempt to spawn anymore.
                    }
                }
                
            /*
                Spawns an extra life potion at level 4
                This introduces the player to the concept of power-ups
            */
            } else if (levelCheck(4)) {
                let oneUp = powerups["oneUp"]["ref"];
                let x = (player.x < 400) ? Phaser.Math.Between(400, 800) : Phaser.Math.Between(0, 400);
                let y = 10;
                oneUp.enableBody(true, x, y, true, true);
                oneUp.setBounce(1);
                oneUp.setVelocity(Phaser.Math.Between(-200, 200), 20);
                oneUp.allowGravity = false;
                oneUp.setCollideWorldBounds(true);
            
            /*
                50% chance to spawn an armor potion on level 5
            */
            } else if (levelCheck(5)) {
                let randomNumber = Math.floor(Math.random() * 100) / 100;
                if (randomNumber < 0.5) {
                    let armor = powerups["armor"]["ref"];
                    let x = (player.x < 400) ? Phaser.Math.Between(400, 800) : Phaser.Math.Between(0, 400);
                    let y = 10;
                    armor.enableBody(true, x, y, true, true);
                    armor.setBounce(1);
                    armor.setVelocity(Phaser.Math.Between(-200, 200), 20);
                    armor.allowGravity = false;
                    armor.setCollideWorldBounds(true);
                }
            }

            /*
                Bonus life implementation
            */
            if (BONUS_LIFE_LEVELS > 0 && !daredevil && !debug && level % BONUS_LIFE_LEVELS === 0) {
                lives++;
                if (sfxEnabled) this.sound.play('powerupcollect', {volume: VOLUME.POWER_UP});
                infoText.setText(`You got an extra life for passing ${BONUS_LIFE_LEVELS} ${BONUS_LIFE_LEVELS === 1 ? "level" : "levels"}!`)
                invincible = true;
                wait(TIME.MESSAGE).then(_ => {
                    resetInfoText();
                    invincible = false;
                });
            }
        } 
    }, null, this);
    
    /*
        CALL THIS WHEN PAUSE BUTTON IS CLICKED
    */
    pause.on('pointerdown', () => {
        this.physics.pause();
        this.sound.pauseAll();
        infoText.setText("Game paused.");
        pause.visible = false;
        resume.visible = true;
    }, this);
    
    /*
        CALL THIS WHEN RESUME BUTTON IS CLICKED
    */
    resume.on('pointerdown', () => {
        this.physics.resume();
        this.sound.resumeAll();
        resetInfoText();
        pause.visible = true;
        resume.visible = false;
    }, this);
    
    /*
        CHEAT CODES
    */
    {
        function keyCodes(str) {
            let result = "";
            let len = str.length;
            for (let i = 0; i < len; i++) {
                result += str.toUpperCase().charCodeAt(i) + (i !== len - 1 ? "," : "");
            }
            return result;
        }
        function keyCodesPlusEnter(str) {
            return `${keyCodes(str)},13`;
        }

        let codesMap = new Map();
        let repeatingCodesMap = new Map();

        /*
            Implementation for each cheat code
        */
        codesMap.set("38,38,40,40,37,39,37,39,66,65", () => { //Konami code
            invincible = false;
            pause.visible = false;
            gameIsOver = true;
            despawnEverything();
            background.setTint(COLOR.RED);
            player.setTintFill(COLOR.RED);
            scoreText.setTintFill(COLOR.WHITE);
            infoText.setTintFill(COLOR.WHITE);
            livesText.setTintFill(COLOR.WHITE);
            levelText.setTintFill(COLOR.WHITE);
            highScoreText.setTintFill(COLOR.WHITE);

            (async function loop(messages, counter) {
                infoText.setText(messages[counter]);
                await wait(TIME.MESSAGE).then(_ => counter < messages.length - 1 ? loop(messages, ++counter) : gameOver(_this));
            })([
                "Konami code?",
                "Ah, you're so clever.",
                "Why did you enter this code?",
                "Did you think it would help you out?",
                "Nope, it actually kills you.",
                "LOL"
            ], 0);
        });
        repeatingCodesMap.set("40,40,38,38,39,37,39,37,65,66", () => { //Reverse konami code
            lives += STARTING_LIVES;
            infoText.setText(`Lives increased by ${STARTING_LIVES}.`);
            wait(TIME.MESSAGE).then(resetInfoText);
        });
        repeatingCodesMap.set(keyCodes("powerups"), () => {
            if (debug) {
                for (let [key] of Object.entries(powerups)) {
                    let powerup = powerups[key]["ref"];
                    let x = Phaser.Math.Between(10, canvas.width - 30), y = 10;
                    powerup.enableBody(true, x, y, true, true);
                    powerup.setBounce(1);
                    powerup.setVelocity(Phaser.Math.Between(-200, 200), 20);
                    powerup.allowGravity = false;
                    powerup.setCollideWorldBounds(true);
                }
            }
        });
        repeatingCodesMap.set(keyCodes("bomb"), () => debug ? createBomb() : {});
        codesMap.set(keyCodesPlusEnter("daredevil"), () => {
            daredevil = true;
            lives = 1;
            despawnPowerUps();
            infoTextList[3] = infoTextList[4] = "";
            invincibleGroundPound = false;
            infoText.setText("Daredevil mode activated!");
            _this.add.text(620, 510, "Daredevil mode", {fontSize: '20px', fill: '#ff0000'});
            wait(TIME.MESSAGE).then(resetInfoText);
        });
        codesMap.set(keyCodesPlusEnter("kill"), () => gameOver(_this));

        /*
            Make the game recognize each cheat code
        */
        for (let [key] of codesMap) {
            let codeArr = key.split(",").map(element => window.parseInt(element, 10));
            _this.input.keyboard.createCombo(codeArr);
        }
        for (let [key] of repeatingCodesMap) {
            let codeArr = key.split(",").map(element => window.parseInt(element, 10));
            _this.input.keyboard.createCombo(codeArr, {resetOnMatch: true});
        }
        this.input.keyboard.on('keycombomatch', e => {
            if (daredevil) return; //Cheat codes do not work in daredevil mode

            const code = e.keyCodes + "";
            if (codesMap.has(code)) {
                codesMap.get(code)();
            } else {
                repeatingCodesMap.get(code)();
            }
        });
    }
    
    if (lives === 0) gameOver(this);
    if (debug && console.timeEnd) console.timeEnd("Game loading time");
}

/*
    UPDATE LOOP
*/
function update() {
    livesText.setText(`Lives: ${!window.isFinite(lives) ? "∞" : lives}`);
    levelText.setText(`Level: ${level}`);
    scoreText.setText(`Score: ${score}`);
    if (gameIsOver) return;

    /*
        Allows the player to move
        Speed increases when the shift key is held down
    */
    if (!cursors.down.isDown) {
        if (cursors.shift.isDown && !isTired) {
            player.setVelocityX(cursors.left.isDown ? -SPEED.RUN : cursors.right.isDown ? SPEED.RUN : 0);
            wait(TIME.RUNNING).then(_ => cursors.shift.isDown ? isTired = true : {});
        } else {
            player.setVelocityX(cursors.left.isDown ? -SPEED.WALK : cursors.right.isDown ? SPEED.WALK : 0);
            wait(TIME.RUNNING).then(_ => isTired = false);
        }
    } else { //Allows the player to ground pound
        player.setVelocityX(0);
        player.setVelocityY(!jumpEnabled || !player.body.touching.down ? SPEED.GROUND_POUND : 0);
    }
    
    /*
        Allows the player to jump
    */
    if (cursors.up.isDown) {
        if (!upKeyDown && jumpEnabled) {
            player.setVelocityY(-SPEED.JUMP);
            jumpEnabled = false;
        }
        upKeyDown = true;
    } else {
        upKeyDown = false;
    }

    /*
        Only allow the player to jump when they're standing on a platform
        and not in the air
    */
    jumpEnabled = player.body.touching.down;
    
    /*
        If invincible, change the player's color to yellow
    */
    if (hasArmor) {
        player.setTintFill(COLOR.ARMOR);
    } else if (invincible && canDestroy) {
        player.setTintFill(COLOR.INVINCIBLE);
    } else if (invincible) {
        player.setTintFill(COLOR.MERCY);
    } else {
        player.clearTint();
    }
    
    /*
        Prevents the player from getting stuck if they somehow accidentally clip through the bottom platform
    */
    if (player.y >= 530) player.y = 510;

    //(!canDestroy || invincible) is equivalent to (canDestroy -> invincible)
    assert(!canDestroy || invincible, "canDestroy is true, but invincible is false");
    
    if (debug) {
        let fps = (Math.round(game.loop.actualFps * 100.0) / 100.0) + "";
        fpsDebugText.setText(`FPS: ${fps.length === 4 ? `${fps}0` : fps}`);
    }
}
