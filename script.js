(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const ui = {
    p1Health: document.getElementById('p1Health'),
    p2Health: document.getElementById('p2Health'),
    p1Spirit: document.getElementById('p1Spirit'),
    p2Spirit: document.getElementById('p2Spirit'),
    p1Rounds: document.getElementById('p1Rounds'),
    p2Rounds: document.getElementById('p2Rounds'),
    timer: document.getElementById('timer'),
    roundText: document.getElementById('roundText'),
    announcement: document.getElementById('announcement'),
    restartBtn: document.getElementById('restartBtn'),
    characterSelect: document.getElementById('characterSelect'),
    p1Name: document.getElementById('p1Name'),
    p2Name: document.getElementById('p2Name'),
    playerCardName: document.getElementById('playerCardName'),
    playerCardMoves: document.getElementById('playerCardMoves'),
    aiCardName: document.getElementById('aiCardName'),
    aiCardMoves: document.getElementById('aiCardMoves'),
    specialOneLabel: document.getElementById('specialOneLabel'),
    specialTwoLabel: document.getElementById('specialTwoLabel')
  };

  const W = canvas.width;
  const H = canvas.height;
  const FLOOR = 900;
  const keys = new Set();
  const pressed = new Set();

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const rand = (min, max) => Math.random() * (max - min) + min;

  const ATTACKS = {
    punch:       { duration: .28, activeStart: .075, activeEnd: .15, damage: 5, range: 102, height: 66, yOffset: 53, knockback: 203, stun: .22, spirit: 9, shake: 4 },
    kick:        { duration: .47, activeStart: .14, activeEnd: .25, damage: 9, range: 150, height: 87, yOffset: 75, knockback: 308, stun: .33, spirit: 13, shake: 7 },
    crouchPunch: { duration: .30, activeStart: .08, activeEnd: .17, damage: 4, range: 93, height: 54, yOffset: 126, knockback: 165, stun: .19, spirit: 8, shake: 3 },
    sweep:       { duration: .52, activeStart: .18, activeEnd: .30, damage: 8, range: 162, height: 45, yOffset: 168, knockback: 353, stun: .42, spirit: 13, shake: 7 },
    airPunch:    { duration: .31, activeStart: .07, activeEnd: .18, damage: 6, range: 105, height: 78, yOffset: 68, knockback: 225, stun: .25, spirit: 10, shake: 4 },
    airKick:     { duration: .44, activeStart: .10, activeEnd: .28, damage: 10, range: 153, height: 90, yOffset: 83, knockback: 330, stun: .36, spirit: 15, shake: 8 }
  };

  class Fighter {
    constructor({name, type, x, color, accent, isAI = false, weight = 5}) {
      this.name = name;
      this.type = type;
      this.x = x;
      this.y = FLOOR;
      this.vx = 0;
      this.vy = 0;
      this.w = 105;
      this.h = 225;
      this.color = color;
      this.accent = accent;
      this.isAI = isAI;
      this.weight = weight;
      this.facing = 1;
      this.health = 100;
      this.spirit = 0;
      this.rounds = 0;
      this.crouching = false;
      this.blocking = false;
      this.attack = null;
      this.hitstun = 0;
      this.invuln = 0;
      this.flash = 0;
      this.rage = 0;
      this.basicRage = 0;
      this.unleash = 0;
      this.dot = null;
      this.aiThink = rand(.35, .65);
      this.aiBlock = 0;
      this.aiMove = 0;
      this.aiMoveSpeed = .75;
      this.aiIntent = 0;
      this.specialLock = 0;
      this.basicMoveCooldown = 0;
      this.inputHistory = [];
      this.trail = [];
    }

    get airborne() { return this.y < FLOOR - 1; }
    get rageScale() { return this.rage > 0 ? 1.25 : 1; }
    get bodyWidth() { return this.w * this.rageScale; }
    get bodyHeight() {
      const baseHeight = this.crouching && !this.airborne ? 147 : this.h;
      return baseHeight * this.rageScale;
    }
    get bodyTop() { return this.y - this.bodyHeight; }
    get damageMultiplier() {
      const rageBoost = this.rage > 0 ? 1.75 : this.basicRage > 0 ? 1.35 : 1;
      return rageBoost * (this.unleash > 0 ? 1.25 : 1);
    }
    get speedMultiplier() { return this.unleash > 0 ? 1.15 : 1; }

    reset(x, preserveSpirit = true) {
      this.x = x;
      this.y = FLOOR;
      this.vx = 0;
      this.vy = 0;
      this.health = 100;
      if (!preserveSpirit) this.spirit = 0;
      this.crouching = false;
      this.blocking = false;
      this.attack = null;
      this.hitstun = 0;
      this.invuln = 0;
      this.flash = 0;
      this.rage = 0;
      this.basicRage = 0;
      this.unleash = 0;
      this.dot = null;
      this.aiThink = rand(.35, .65);
      this.aiBlock = 0;
      this.aiMove = 0;
      this.aiMoveSpeed = .75;
      this.specialLock = 0;
      this.basicMoveCooldown = 0;
      this.inputHistory = [];
      this.trail = [];
    }

    recordMotionInput(token) {
      const now = performance.now();
      this.inputHistory.push({ token, time: now });
      this.inputHistory = this.inputHistory.filter(entry => now - entry.time <= 650).slice(-5);
    }

    consumeMotion(sequence) {
      const now = performance.now();
      this.inputHistory = this.inputHistory.filter(entry => now - entry.time <= 650);
      if (this.inputHistory.length < sequence.length) return false;
      const tail = this.inputHistory.slice(-sequence.length).map(entry => entry.token);
      const matched = sequence.every((token, index) => token === tail[index]);
      if (matched) this.inputHistory = [];
      return matched;
    }

    canUseBasicMove() {
      return this.canAct() && this.basicMoveCooldown <= 0;
    }

    canAct() {
      return matchState === 'fight' && this.hitstun <= 0 && !this.attack && this.specialLock <= 0;
    }

    spendSpirit(amount) {
      const cost = amount * 100;
      if (this.spirit + .001 < cost) return false;
      this.spirit -= cost;
      return true;
    }

    gainSpirit(amount) {
      if (this.unleash > 0) return;
      this.spirit = clamp(this.spirit + amount, 0, 300);
    }

    startAttack(type) {
      if (!this.canAct()) return;
      this.blocking = false;
      this.attack = { type, t: 0, hit: false };
    }

    update(dt, opponent) {
      this.facing = opponent.x >= this.x ? 1 : -1;
      this.hitstun = Math.max(0, this.hitstun - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      this.flash = Math.max(0, this.flash - dt);
      this.rage = Math.max(0, this.rage - dt);
      this.basicRage = Math.max(0, this.basicRage - dt);
      this.unleash = Math.max(0, this.unleash - dt);
      this.specialLock = Math.max(0, this.specialLock - dt);
      this.basicMoveCooldown = Math.max(0, this.basicMoveCooldown - dt);

      if (this.dot) {
        this.dot.tick -= dt;
        this.dot.left -= dt;
        if (this.dot.tick <= 0 && this.dot.left > -.1) {
          this.dot.tick += .25;
          this.health = clamp(this.health - this.dot.perTick, 0, 100);
          spawnText(this.x, this.bodyTop - 15, `-${this.dot.perTick.toFixed(1)}`, '#ff7777');
        }
        if (this.dot.left <= 0) this.dot = null;
      }

      if (this.isAI) this.updateAI(dt, opponent);
      else this.updatePlayer(opponent);

      if (this.attack) {
        this.attack.t += dt;
        const data = ATTACKS[this.attack.type];
        if (!this.attack.hit &&
            this.attack.t >= data.activeStart &&
            this.attack.t <= data.activeEnd) {
          const box = this.attackBox(data);
          if (rectsOverlap(box, opponent.bodyBox())) {
            this.attack.hit = true;
            applyHit(this, opponent, data.damage, data.knockback, data.stun, data.spirit, data.shake, 'normal');
          }
        }
        if (this.attack.t >= data.duration) this.attack = null;
      }

      this.vy += 2700 * dt;
      this.y += this.vy * dt;
      if (this.y >= FLOOR) {
        this.y = FLOOR;
        this.vy = 0;
      }

      this.x += this.vx * dt;
      this.vx *= Math.pow(.0008, dt);
      if (Math.abs(this.vx) < 2) this.vx = 0;
      this.x = clamp(this.x, 57, W - 57);

      if (Math.abs(this.vx) > 280 || this.unleash > 0) {
        this.trail.push({x: this.x, y: this.y, life: .16});
      }
      this.trail.forEach(t => t.life -= dt);
      this.trail = this.trail.filter(t => t.life > 0);
    }

    updatePlayer(opponent) {
      if (matchState !== 'fight') {
        this.blocking = false;
        return;
      }

      const grounded = !this.airborne;
      this.crouching = grounded && keys.has('KeyS') && this.hitstun <= 0 && !this.attack;
      this.blocking = keys.has('KeyV') && grounded && this.hitstun <= 0 && !this.attack;

      if (this.canAct() && !this.blocking && !this.crouching) {
        let dir = 0;
        if (keys.has('KeyA')) dir -= 1;
        if (keys.has('KeyD')) dir += 1;
        if (dir) this.vx = dir * 510 * this.speedMultiplier;
      }

      if (pressed.has('KeyW') && grounded && this.canAct() && !this.crouching && !this.blocking) {
        this.vy = -1260 * (this.unleash > 0 ? 1.1 : 1);
      }

      if (pressed.has('KeyS')) this.recordMotionInput('down');
      if (pressed.has('KeyA')) this.recordMotionInput(this.facing === 1 ? 'back' : 'forward');
      if (pressed.has('KeyD')) this.recordMotionInput(this.facing === 1 ? 'forward' : 'back');

      if (pressed.has('KeyF')) {
        let usedMotion = false;
        if (this.type === 'hunter' && this.consumeMotion(['back', 'forward'])) {
          usedMotion = hunterRegularSpear(this);
        } else if (this.type === 'hunter' && this.consumeMotion(['back', 'back'])) {
          usedMotion = hunterRegularBoomerang(this);
        } else if (this.type === 'bruiser' && this.consumeMotion(['forward', 'forward'])) {
          usedMotion = bruiserRegularDash(this, opponent);
        }
        if (!usedMotion) {
          this.startAttack(this.airborne ? 'airPunch' : this.crouching ? 'crouchPunch' : 'punch');
        }
      }
      if (pressed.has('KeyG')) {
        let usedMotion = false;
        if (this.type === 'bruiser' && this.consumeMotion(['down', 'down'])) {
          usedMotion = bruiserRegularRage(this);
        }
        if (!usedMotion) {
          this.startAttack(this.airborne ? 'airKick' : this.crouching ? 'sweep' : 'kick');
        }
      }
      if (pressed.has('KeyQ')) {
        if (this.type === 'hunter') hunterSpear(this);
        else bruiserRage(this);
      }
      if (pressed.has('KeyE')) {
        if (this.type === 'hunter') hunterBoomerang(this);
        else bruiserDash(this, opponent);
      }
      if (pressed.has('KeyR')) spiritUnleash(this);
    }

    updateAI(dt, opponent) {
      if (matchState !== 'fight') {
        this.blocking = false;
        this.aiMove = 0;
        return;
      }

      this.aiThink -= dt;
      this.aiBlock -= dt;
      this.crouching = false;
      this.blocking = this.aiBlock > 0 && !this.airborne && this.hitstun <= 0 && !this.attack;

      if (this.aiThink <= 0) {
        const dist = Math.abs(opponent.x - this.x);
        const toward = Math.sign(opponent.x - this.x) || this.facing;
        const away = -toward;
        const playerCornered = (opponent.x < 170 || opponent.x > W - 170) && dist < 320;
        const playerAttacking = Boolean(opponent.attack);

        this.aiThink = rand(.34, .72);
        this.aiMove = 0;
        this.aiMoveSpeed = rand(.62, .86);

        // React to real danger, but do not read every button perfectly.
        if (incomingThreat(this, opponent) && Math.random() < .58) {
          if (Math.random() < .76) {
            this.aiBlock = rand(.34, .78);
          } else if (!this.airborne) {
            this.vy = -1180;
          }
          this.aiThink = rand(.28, .52);
        } else if (this.canAct()) {
          // Give the player breathing room instead of endlessly pinning them to a wall.
          if (playerCornered && Math.random() < .58) {
            this.aiMove = away;
            this.aiMoveSpeed = rand(.54, .72);
            if (Math.random() < .28) this.aiBlock = rand(.25, .52);
            this.aiThink = rand(.42, .82);
          } else {
            const specialRoll = Math.random();

            // Powered moves are deliberate choices rather than constant meter dumping.
            if (this.spirit >= 300 && this.health < 62 && specialRoll < .055) {
              spiritUnleash(this);
              this.aiThink = rand(.65, 1.0);
            } else if (this.type === 'bruiser' && this.spirit >= 100 && dist > 300 && dist < 760 && specialRoll < .075) {
              bruiserDash(this, opponent);
              this.aiThink = rand(.72, 1.05);
            } else if (this.type === 'bruiser' && this.spirit >= 100 && dist < 430 && specialRoll < .055) {
              bruiserRage(this);
              this.aiThink = rand(.75, 1.1);
            } else if (this.type === 'hunter' && this.spirit >= 100 && dist > 390 && specialRoll < .095) {
              hunterSpear(this);
              this.aiThink = rand(.7, 1.0);
            } else if (this.type === 'hunter' && this.spirit >= 100 && dist > 260 && specialRoll < .045) {
              hunterBoomerang(this);
              this.aiThink = rand(.75, 1.1);
            } else if (this.type === 'hunter') {
              // Hunter prefers measured spacing instead of charging into fist range.
              if (dist < 235) {
                const roll = Math.random();
                if (roll < .46) {
                  this.aiMove = away;
                  this.aiMoveSpeed = rand(.7, .92);
                } else if (roll < .68) {
                  this.aiBlock = rand(.35, .72);
                } else if (roll < .83 && this.basicMoveCooldown <= 0) {
                  hunterRegularBoomerang(this);
                  this.aiThink = rand(.72, 1.05);
                } else if (roll < .92) {
                  this.startAttack(Math.random() < .55 ? 'punch' : 'kick');
                }
              } else if (dist > 610) {
                const roll = Math.random();
                if (roll < .38) {
                  this.aiMove = toward;
                  this.aiMoveSpeed = rand(.52, .72);
                } else if (roll < .63 && this.basicMoveCooldown <= 0) {
                  hunterRegularSpear(this);
                  this.aiThink = rand(.65, .95);
                } else if (roll < .78 && !this.airborne) {
                  this.vy = -1180;
                } else if (roll < .9) {
                  this.aiBlock = rand(.28, .58);
                }
              } else {
                const roll = Math.random();
                if (roll < .25) {
                  this.aiMove = away;
                  this.aiMoveSpeed = rand(.42, .62);
                } else if (roll < .47) {
                  this.aiBlock = rand(.3, .64);
                } else if (roll < .63 && this.basicMoveCooldown <= 0) {
                  hunterRegularSpear(this);
                  this.aiThink = rand(.62, .92);
                } else if (roll < .73 && this.basicMoveCooldown <= 0) {
                  hunterRegularBoomerang(this);
                  this.aiThink = rand(.7, 1.0);
                }
                // Remaining outcomes are intentional pauses.
              }
            } else {
              // Bruiser wants close range, but advances in bursts and sometimes reassesses.
              if (dist > 430) {
                const roll = Math.random();
                if (roll < .42) {
                  this.aiMove = toward;
                  this.aiMoveSpeed = rand(.58, .78);
                } else if (roll < .56 && this.basicMoveCooldown <= 0) {
                  bruiserRegularDash(this, opponent);
                  this.aiThink = rand(.75, 1.08);
                } else if (roll < .68 && !this.airborne) {
                  this.vy = -1180;
                } else if (roll < .82) {
                  this.aiBlock = rand(.3, .65);
                }
                // Remaining outcomes are a short planning pause.
              } else if (dist > 185) {
                const roll = Math.random();
                if (roll < .32) {
                  this.aiMove = toward;
                  this.aiMoveSpeed = rand(.45, .68);
                } else if (roll < .52) {
                  this.aiBlock = rand(.32, .7);
                } else if (roll < .64 && this.basicMoveCooldown <= 0) {
                  bruiserRegularRage(this);
                  this.aiThink = rand(.75, 1.1);
                } else if (roll < .74) {
                  this.aiMove = away;
                  this.aiMoveSpeed = rand(.38, .56);
                }
              } else {
                const roll = Math.random();
                if (playerAttacking && roll < .42) {
                  this.aiBlock = rand(.34, .72);
                } else if (roll < .27) {
                  this.startAttack('punch');
                } else if (roll < .49) {
                  this.startAttack('kick');
                } else if (roll < .6) {
                  this.crouching = true;
                  this.startAttack('sweep');
                } else if (roll < .78) {
                  this.aiBlock = rand(.32, .75);
                } else if (roll < .91) {
                  this.aiMove = away;
                  this.aiMoveSpeed = rand(.44, .65);
                }
                // A small chance to simply hold position keeps the rhythm readable.
              }
            }
          }
        }
      }

      if (this.canAct() && !this.blocking && this.aiMove) {
        this.vx = this.aiMove * 360 * this.aiMoveSpeed * this.speedMultiplier;
      }
    }

    bodyBox() {
      return { x: this.x - this.bodyWidth / 2, y: this.bodyTop, w: this.bodyWidth, h: this.bodyHeight };
    }

    attackBox(data) {
      const scale = this.rageScale;
      const range = data.range * scale;
      const x = this.facing === 1
        ? this.x + this.bodyWidth / 2 - 5
        : this.x - this.bodyWidth / 2 - range + 5;
      return {
        x,
        y: this.bodyTop + data.yOffset * scale,
        w: range,
        h: data.height * scale
      };
    }

    draw() {
      ctx.save();

      const scale = this.rageScale;
      const bodyW = this.bodyWidth;
      const bodyH = this.bodyHeight;

      for (const t of this.trail) {
        ctx.globalAlpha = clamp(t.life / .16, 0, .28);
        ctx.fillStyle = this.rage > 0 ? '#ff3b30' : this.accent;
        ctx.fillRect(t.x - bodyW / 2, t.y - bodyH, bodyW, bodyH);
      }
      ctx.globalAlpha = 1;

      if (this.unleash > 0) {
        const pulse = 12 + Math.sin(performance.now() / 65) * 5;
        ctx.shadowBlur = 28 + pulse;
        ctx.shadowColor = '#f7f28b';
      } else if (this.rage > 0) {
        const pulse = 34 + Math.sin(performance.now() / 48) * 12;
        ctx.shadowBlur = pulse;
        ctx.shadowColor = '#ff1f2d';
      } else if (this.basicRage > 0) {
        ctx.shadowBlur = 18 + Math.sin(performance.now() / 75) * 5;
        ctx.shadowColor = '#ff9b54';
      }

      const top = this.bodyTop;
      ctx.fillStyle = this.flash > 0 ? '#ffffff' : this.color;
      ctx.fillRect(this.x - bodyW / 2, top, bodyW, bodyH);

      ctx.fillStyle = this.rage > 0 ? '#ff5964' : this.basicRage > 0 ? '#ffb16f' : this.accent;
      ctx.fillRect(this.x - 21 * scale, top + 21 * scale, 42 * scale, 16 * scale);
      ctx.fillRect(
        this.x + this.facing * 16 * scale - 8 * scale,
        top + 58 * scale,
        16 * scale,
        45 * scale
      );

      if (this.blocking) {
        ctx.strokeStyle = '#d9f5ff';
        ctx.lineWidth = 6 * scale;
        ctx.beginPath();
        ctx.arc(
          this.x + this.facing * 38 * scale,
          top + 58 * scale,
          28 * scale,
          -1.4,
          1.4
        );
        ctx.stroke();
      }

      if (this.attack) {
        const data = ATTACKS[this.attack.type];
        const active = this.attack.t >= data.activeStart && this.attack.t <= data.activeEnd;
        ctx.fillStyle = active ? '#ffffff' : (this.rage > 0 ? '#ff5964' : this.basicRage > 0 ? '#ffb16f' : this.accent);
        const reach = data.range * scale * (active ? .88 : .45);
        const limbX = this.facing === 1
          ? this.x + 24 * scale
          : this.x - 24 * scale - reach;
        ctx.fillRect(
          limbX,
          top + data.yOffset * scale + 8 * scale,
          reach,
          14 * scale
        );
      }

      if (this.dot) {
        ctx.fillStyle = 'rgba(255,60,60,.75)';
        ctx.fillRect(this.x - bodyW / 2 - 6, top - 9, bodyW + 12, 5);
      }

      ctx.restore();
    }
  }

  let p1, p2;
  let projectiles = [];
  let particles = [];
  let shockwaves = [];
  let texts = [];
  let matchState = 'intro';
  let round = 1;
  let roundTime = 99;
  let last = performance.now();
  let freeze = 0;
  let shake = 0;
  let roundDelay = 0;
  let boomerangId = 0;

  function fighterConfig(type, x, isAI) {
    if (type === 'hunter') return { name: 'Hunter', type, x, color: '#2fc5a9', accent: '#b6fff2', weight: 4, isAI };
    return { name: 'Bruiser', type, x, color: '#cf4858', accent: '#ffd0d6', weight: 8, isAI };
  }

  function showCharacterSelect() {
    matchState = 'select';
    keys.clear();
    pressed.clear();
    ui.characterSelect.classList.remove('hidden');
  }

  function setupMatch(playerType = 'hunter') {
    const aiType = playerType === 'hunter' ? 'bruiser' : 'hunter';
    p1 = new Fighter(fighterConfig(playerType, 450, false));
    p2 = new Fighter(fighterConfig(aiType, 1470, true));
    round = 1;
    p1.rounds = 0;
    p2.rounds = 0;
    ui.characterSelect.classList.add('hidden');
    configureHUD();
    beginRound();
  }

  function configureHUD() {
    ui.p1Name.textContent = p1.name.toUpperCase();
    ui.p2Name.textContent = p2.name.toUpperCase();
    ui.playerCardName.textContent = p1.name.toUpperCase();
    ui.aiCardName.textContent = `${p2.name.toUpperCase()} AI`;
    if (p1.type === 'hunter') {
      ui.playerCardMoves.innerHTML = '<p>Back, Forward + <kbd>F</kbd> Spear</p><p>Back, Back + <kbd>F</kbd> Boomerang</p><p><kbd>Q</kbd> Red Spear • 1 Spirit</p><p><kbd>E</kbd> Red Boomerang • 1 Spirit</p><p><kbd>R</kbd> Spirit Unleash • 3 Spirit</p>';
      ui.aiCardMoves.innerHTML = '<p>Down, Down + Kick • Battle Rage</p><p>Forward, Forward + Punch • Dash Punch</p><p>Q/E Red upgrades • 1 Spirit</p><p>Spirit Unleash • 3 Spirit</p>';
      ui.specialOneLabel.textContent = 'Red Spear';
      ui.specialTwoLabel.textContent = 'Red Boomerang';
    } else {
      ui.playerCardMoves.innerHTML = '<p>Down, Down + <kbd>G</kbd> Battle Rage</p><p>Forward, Forward + <kbd>F</kbd> Dash Punch</p><p><kbd>Q</kbd> Ultra Battle Rage • 1 Spirit</p><p><kbd>E</kbd> Super Dash Punch • 1 Spirit</p><p><kbd>R</kbd> Spirit Unleash • 3 Spirit</p>';
      ui.aiCardMoves.innerHTML = '<p>Back, Forward + Punch • Spear</p><p>Back, Back + Punch • Boomerang</p><p>Q/E Red upgrades • 1 Spirit</p><p>Spirit Unleash • 3 Spirit</p>';
      ui.specialOneLabel.textContent = 'Ultra Battle Rage';
      ui.specialTwoLabel.textContent = 'Super Dash Punch';
    }
  }

  function beginRound() {
    p1.reset(450, true);
    p2.reset(1470, true);
    projectiles = [];
    particles = [];
    shockwaves = [];
    texts = [];
    roundTime = 99;
    matchState = 'intro';
    showAnnouncement(`ROUND ${round}`, 900, () => {
      showAnnouncement('FIGHT!', 650, () => {
        matchState = 'fight';
      });
    });
    updateUI();
  }

  function showAnnouncement(text, ms, callback) {
    ui.announcement.textContent = text;
    ui.announcement.classList.add('show');
    setTimeout(() => {
      ui.announcement.classList.remove('show');
      if (callback) setTimeout(callback, 180);
    }, ms);
  }

  function endRound(winner, reason = 'K.O.') {
    if (matchState !== 'fight') return;
    matchState = 'roundover';
    winner.rounds++;
    showAnnouncement(reason, 650, () => {
      if (winner.rounds >= 2) {
        matchState = 'matchover';
        showAnnouncement(`${winner.name.toUpperCase()} WINS`, 2400);
      } else {
        round++;
        setTimeout(beginRound, 650);
      }
    });
  }

  function spiritUnleash(fighter) {
    if (!fighter.canAct() || !fighter.spendSpirit(3)) return;
    fighter.unleash = 8;
    fighter.specialLock = .3;
    fighter.vx = 0;
    spawnBurst(fighter.x, fighter.bodyTop + 70, '#fff08a', 28);
    spawnText(fighter.x, fighter.bodyTop - 25, 'UNLEASH!', '#fff08a');
    shake = Math.max(shake, 9);
  }

  function hunterRegularSpear(fighter) {
    if (!fighter.canUseBasicMove()) return false;
    fighter.basicMoveCooldown = 1.15;
    fighter.specialLock = .34;
    fighter.vx = 0;
    projectiles.push({
      kind: 'spear',
      owner: fighter,
      x: fighter.x + fighter.facing * 55,
      y: fighter.bodyTop + 58,
      vx: fighter.facing * 1030,
      w: 108,
      h: 16,
      damage: 9,
      life: 2.2,
      powered: false,
      hit: false
    });
    spawnText(fighter.x, fighter.bodyTop - 18, 'SPEAR', '#d9edf2');
    return true;
  }

  function hunterRegularBoomerang(fighter) {
    if (!fighter.canUseBasicMove()) return false;
    fighter.basicMoveCooldown = 2.2;
    fighter.specialLock = .32;
    const id = ++boomerangId;
    projectiles.push({
      id,
      kind: 'boomerangOut',
      owner: fighter,
      x: fighter.x,
      y: fighter.bodyTop + 48,
      throwDirection: -fighter.facing,
      vx: -fighter.facing * 1120,
      w: 52,
      h: 34,
      damage: 10,
      life: .9,
      timer: 2.5,
      powered: false,
      unblockable: false,
      returnSpeed: 1245,
      hit: false
    });
    spawnText(fighter.x, fighter.bodyTop - 18, 'BOOMERANG', '#d9edf2');
    return true;
  }

  function bruiserRegularRage(fighter) {
    if (!fighter.canUseBasicMove()) return false;
    fighter.basicMoveCooldown = 4.5;
    fighter.basicRage = 3;
    fighter.specialLock = .36;
    fighter.vx = 0;
    spawnBurst(fighter.x, fighter.bodyTop + 75, '#ff9b54', 18);
    spawnText(fighter.x, fighter.bodyTop - 25, 'BATTLE RAGE', '#ffbd85');
    return true;
  }

  function bruiserRegularDash(fighter, opponent) {
    if (!fighter.canUseBasicMove()) return false;
    fighter.basicMoveCooldown = 1.8;
    fighter.specialLock = .40;
    fighter.blocking = false;
    const direction = Math.sign(opponent.x - fighter.x) || fighter.facing;
    fighter.vx = direction * 1260;
    projectiles.push({
      kind: 'dashHit',
      owner: fighter,
      x: fighter.x,
      y: fighter.bodyTop + 35,
      vx: direction * 1260,
      w: 155,
      h: 116,
      damage: 11,
      life: .32,
      powered: false,
      explosive: false,
      hit: false
    });
    return true;
  }

  function hunterSpear(fighter) {
    if (!fighter.canAct() || !fighter.spendSpirit(1)) return;
    fighter.specialLock = .45;
    fighter.vx = 0;
    projectiles.push({
      kind: 'spear',
      owner: fighter,
      x: fighter.x + fighter.facing * 55,
      y: fighter.bodyTop + 58,
      vx: fighter.facing * 1170,
      w: 123,
      h: 18,
      damage: 13,
      life: 2.2,
      powered: true,
      glow: '#ff2038',
      hit: false
    });
  }

  function hunterBoomerang(fighter) {
    if (!fighter.canAct() || !fighter.spendSpirit(1)) return;
    fighter.specialLock = .35;
    const id = ++boomerangId;
    projectiles.push({
      id,
      kind: 'boomerangOut',
      owner: fighter,
      x: fighter.x,
      y: fighter.bodyTop + 48,
      throwDirection: -fighter.facing,
      vx: -fighter.facing * 1350,
      w: 57,
      h: 36,
      damage: 14,
      life: .75,
      timer: 1.0,
      powered: true,
      glow: '#ff2038',
      unblockable: true,
      returnSpeed: 1500,
      hit: false
    });
  }

  function bruiserRage(fighter) {
    if (!fighter.canAct() || !fighter.spendSpirit(1)) return;
    fighter.rage = 4;
    fighter.specialLock = .42;
    fighter.vx = 0;
    spawnBurst(fighter.x, fighter.bodyTop + 75, '#ff2438', 42);
    spawnShockwave(fighter.x, fighter.bodyTop + fighter.bodyHeight / 2, '#ff2438', 150, .42);
    spawnText(fighter.x, fighter.bodyTop - 25, 'ULTRA BATTLE RAGE', '#ff6b78');
  }

  function bruiserDash(fighter, opponent) {
    if (!fighter.canAct() || !fighter.spendSpirit(1)) return;
    fighter.specialLock = .48;
    fighter.blocking = false;
    const direction = Math.sign(opponent.x - fighter.x) || fighter.facing;
    fighter.vx = direction * 1560;
    projectiles.push({
      kind: 'dashHit',
      owner: fighter,
      x: fighter.x,
      y: fighter.bodyTop + 35,
      vx: direction * 1560,
      w: 173,
      h: 128,
      damage: 16,
      life: .35,
      powered: true,
      explosive: true,
      hit: false
    });
  }

  function incomingThreat(defender, attacker) {
    if (attacker.attack) {
      const d = Math.abs(attacker.x - defender.x);
      if (d < 135) return true;
    }
    return projectiles.some(p => !p.hidden && p.owner !== defender && Math.abs(p.x - defender.x) < 390);
  }

  function updateProjectiles(dt) {
    for (const p of projectiles) {
      p.life -= dt;

      if (p.kind === 'boomerangOut') {
        p.x += p.vx * dt;
        p.timer -= dt;
        if (p.life <= 0) {
          p.hidden = true;
          p.life = 999;
        }
        if (p.timer <= 0 && !p.returned) {
          p.returned = true;
          p.hidden = false;
          const target = p.owner === p1 ? p2 : p1;
          p.kind = 'boomerangReturn';
          // It returns from the opposite edge while continuing the original throw direction.
          // Throw left: re-enter beyond the right edge and travel left. Throw right: vice versa.
          p.x = p.throwDirection < 0 ? W + 105 : -105;
          p.y = FLOOR - 120;
          p.vx = p.throwDirection * (p.returnSpeed || 1245);
          p.life = 1.8;
          p.hit = false;
          spawnText(target.x, target.bodyTop - 30, 'BEHIND YOU!', '#8feaff');
        }
      } else {
        p.x += p.vx * dt;
        if (p.kind === 'dashHit') {
          p.owner.x = clamp(p.x, 38, W - 38);
          p.y = p.owner.bodyTop + 35;
        }
      }

      if (p.hidden || p.hit) continue;
      const target = p.owner === p1 ? p2 : p1;
      const box = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
      if (rectsOverlap(box, target.bodyBox())) {
        p.hit = true;
        if (p.kind === 'dashHit') {
          const impactX = target.x;
          const impactY = target.bodyTop + target.bodyHeight * .52;
          const powered = p.powered !== false;
          const dealt = applyHit(
            p.owner,
            target,
            p.damage,
            powered ? 680 : 390,
            powered ? .52 : .36,
            powered ? 18 : 11,
            powered ? 13 : 7,
            'dash',
            { blockKnockbackFactor: powered ? .8 : .42 }
          );
          if (powered) spawnExplosion(impactX, impactY);
          else spawnBurst(impactX, impactY, '#ffd1ad', 10);
          if (dealt > 0) {
            const dotTotal = dealt * .20;
            target.dot = { left: 4, tick: .25, perTick: dotTotal / 16 };
          }
        } else if (p.kind === 'spear') {
          const powered = p.powered !== false;
          applyHit(
            p.owner,
            target,
            p.damage,
            powered ? 560 : 320,
            powered ? .38 : .28,
            powered ? 16 : 10,
            powered ? 9 : 5,
            'spear',
            { blockKnockbackFactor: powered ? 1.0 : .35 }
          );
          spawnBurst(target.x, target.bodyTop + 70, powered ? '#ff2038' : '#d9edf2', powered ? 20 : 10);
        } else {
          const powered = p.powered !== false;
          applyHit(
            p.owner,
            target,
            p.damage,
            powered ? 300 : 230,
            powered ? .34 : .27,
            powered ? 16 : 9,
            powered ? 8 : 5,
            'boomerang',
            { unblockable: powered }
          );
          spawnBurst(target.x, target.bodyTop + 70, powered ? '#ff2038' : '#d9edf2', powered ? 18 : 9);
        }
      }
    }
    projectiles = projectiles.filter(p => p.life > 0 && (p.hidden || (p.x > -220 && p.x < W + 220)));
  }

  function applyHit(attacker, defender, baseDamage, knockback, stun, spiritGain, shakeAmount, type, options = {}) {
    if (defender.invuln > 0 || matchState !== 'fight') return 0;

    const attackFrom = Math.sign(attacker.x - defender.x) || -defender.facing;
    const defenderFacingAttacker = defender.facing === attackFrom;
    const blocked = !options.unblockable &&
      defender.blocking &&
      defenderFacingAttacker &&
      !defender.airborne;

    let damage = baseDamage * attacker.damageMultiplier;
    if (blocked) {
      damage *= .22;
      defender.hitstun = Math.max(defender.hitstun, .09);
      const blockKnockbackFactor = options.blockKnockbackFactor ?? .35;
      defender.vx = -attackFrom * (knockback * blockKnockbackFactor / Math.max(.75, defender.weight / 5));
      defender.gainSpirit(7);
      attacker.gainSpirit(spiritGain * .42);
      spawnText(defender.x, defender.bodyTop - 10, 'BLOCK', '#b8eeff');
      spawnBurst(defender.x, defender.bodyTop + 55, '#d6f8ff', 8);
      freeze = Math.max(freeze, .025);
      shake = Math.max(shake, shakeAmount * .4);
    } else {
      defender.health = clamp(defender.health - damage, 0, 100);
      defender.hitstun = stun;
      defender.invuln = .055;
      defender.flash = .08;
      defender.vx = -attackFrom * (knockback / Math.max(.7, defender.weight / 5));
      if (!defender.airborne && type !== 'normal') defender.vy = -120;
      defender.gainSpirit(5);
      attacker.gainSpirit(spiritGain);
      spawnText(defender.x, defender.bodyTop - 12, `-${damage.toFixed(0)}`, '#ffffff');
      spawnBurst(defender.x, defender.bodyTop + 60, attacker.accent, 12);
      freeze = Math.max(freeze, type === 'dash' ? .085 : .045);
      shake = Math.max(shake, shakeAmount);
    }
    return damage;
  }

  function resolveBodyCollision() {
    const a = p1.bodyBox();
    const b = p2.bodyBox();
    if (!rectsOverlap(a, b)) return;
    const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    if (overlap <= 0) return;
    const push = overlap / 2 + 1;
    if (p1.x < p2.x) {
      p1.x -= push;
      p2.x += push;
    } else {
      p1.x += push;
      p2.x -= push;
    }
    p1.x = clamp(p1.x, 57, W - 57);
    p2.x = clamp(p2.x, 57, W - 57);
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function spawnBurst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: rand(-280, 280),
        vy: rand(-260, 90),
        life: rand(.18, .45),
        max: .45,
        size: rand(3, 8),
        color
      });
    }
  }

  function spawnShockwave(x, y, color, maxRadius = 130, life = .35) {
    shockwaves.push({
      x,
      y,
      color,
      radius: 12,
      maxRadius,
      life,
      maxLife: life
    });
  }

  function spawnExplosion(x, y) {
    spawnBurst(x, y, '#ff263f', 30);
    spawnBurst(x, y, '#ff8b36', 22);
    spawnBurst(x, y, '#fff1a8', 12);
    spawnShockwave(x, y, '#ff3b30', 180, .38);
    spawnShockwave(x, y, '#ffd166', 120, .28);
    freeze = Math.max(freeze, .095);
    shake = Math.max(shake, 18);
  }

  function spawnText(x, y, text, color) {
    texts.push({ x, y, text, color, life: .72 });
  }

  function updateEffects(dt) {
    particles.forEach(p => {
      p.life -= dt;
      p.vy += 720 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    });
    particles = particles.filter(p => p.life > 0);

    shockwaves.forEach(s => {
      s.life -= dt;
      const progress = 1 - clamp(s.life / s.maxLife, 0, 1);
      s.radius = 12 + (s.maxRadius - 12) * progress;
    });
    shockwaves = shockwaves.filter(s => s.life > 0);

    texts.forEach(t => {
      t.life -= dt;
      t.y -= 42 * dt;
    });
    texts = texts.filter(t => t.life > 0);
  }

  function update(dt) {
    if (freeze > 0) {
      freeze -= dt;
      updateEffects(dt * .15);
      return;
    }

    if (matchState === 'fight') {
      roundTime -= dt;
      if (roundTime <= 0) {
        roundTime = 0;
        if (p1.health === p2.health) endRound(p1, 'DRAW? HUNTER ADVANCES');
        else endRound(p1.health > p2.health ? p1 : p2, 'TIME');
      }
    }

    if (!p1 || !p2) {
      updateEffects(dt);
      pressed.clear();
      return;
    }

    p1.update(dt, p2);
    p2.update(dt, p1);
    resolveBodyCollision();
    updateProjectiles(dt);
    updateEffects(dt);

    if (matchState === 'fight') {
      if (p1.health <= 0 && p2.health <= 0) endRound(p1, 'DOUBLE K.O.');
      else if (p1.health <= 0) endRound(p2);
      else if (p2.health <= 0) endRound(p1);
    }

    updateUI();
    pressed.clear();
  }

  function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#171c29');
    grad.addColorStop(.66, '#3b3144');
    grad.addColorStop(1, '#17181d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,.025)';
    for (let x = 0; x < W; x += 80) ctx.fillRect(x, 0, 2, FLOOR);

    ctx.fillStyle = '#222631';
    ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.fillStyle = '#464d5b';
    ctx.fillRect(0, FLOOR, W, 7);

    ctx.fillStyle = 'rgba(255,255,255,.055)';
    for (let x = 0; x < W; x += 96) {
      ctx.beginPath();
      ctx.moveTo(x, FLOOR + 8);
      ctx.lineTo(x + 48, H);
      ctx.lineTo(x + 96, FLOOR + 8);
      ctx.fill();
    }
  }

  function drawProjectiles() {
    for (const p of projectiles) {
      if (p.hidden) continue;
      ctx.save();
      if (p.kind === 'spear') {
        const powered = p.powered !== false;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.vx > 0 ? 0 : Math.PI);
        ctx.shadowBlur = powered ? 34 : 8;
        ctx.shadowColor = powered ? '#ff2038' : '#b7d8df';
        ctx.fillStyle = powered ? '#ff3048' : '#b8c4c7';
        ctx.fillRect(-63, -5, 105, 10);
        ctx.fillStyle = powered ? '#fff1f3' : '#edf4f5';
        ctx.beginPath();
        ctx.moveTo(42, -14);
        ctx.lineTo(72, 0);
        ctx.lineTo(42, 14);
        ctx.fill();
      } else if (p.kind.startsWith('boomerang')) {
        const powered = p.powered !== false;
        ctx.translate(p.x, p.y);
        ctx.rotate(performance.now() / (powered ? 65 : 82));
        ctx.shadowBlur = powered ? 38 : 8;
        ctx.shadowColor = powered ? '#ff2038' : '#b7d8df';
        ctx.strokeStyle = powered ? '#ff3048' : '#b8c4c7';
        ctx.lineWidth = powered ? 15 : 12;
        ctx.beginPath();
        ctx.arc(0, 0, 27, -.8, 2.1);
        ctx.stroke();
      } else if (p.kind === 'dashHit') {
        const powered = p.powered !== false;
        ctx.shadowBlur = powered ? 42 : 12;
        ctx.shadowColor = powered ? '#ff3048' : '#ffb16f';
        ctx.fillStyle = powered ? 'rgba(255,48,72,.28)' : 'rgba(255,177,111,.16)';
        ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
  }

  function drawEffects() {
    for (const s of shockwaves) {
      ctx.globalAlpha = clamp(s.life / s.maxLife, 0, 1);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.font = '900 24px system-ui';
    ctx.textAlign = 'center';
    for (const t of texts) {
      ctx.globalAlpha = clamp(t.life / .72, 0, 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.save();
    const sx = shake > 0 ? rand(-shake, shake) : 0;
    const sy = shake > 0 ? rand(-shake, shake) : 0;
    shake *= .82;
    if (shake < .12) shake = 0;
    ctx.translate(sx, sy);

    drawBackground();
    drawProjectiles();
    if (p1 && p2) {
      p1.draw();
      p2.draw();
    }
    drawEffects();

    ctx.restore();
  }

  function renderSpirit(container, value) {
    container.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const outer = document.createElement('span');
      outer.className = 'spirit-segment';
      const fill = document.createElement('i');
      const percent = clamp(value - i * 100, 0, 100);
      fill.style.width = `${percent}%`;
      outer.appendChild(fill);
      container.appendChild(outer);
    }
  }

  function roundDots(count) {
    return `${count >= 1 ? '●' : '○'} ${count >= 2 ? '●' : '○'}`;
  }

  function updateUI() {
    if (!p1 || !p2) return;
    ui.p1Health.style.width = `${p1.health}%`;
    ui.p2Health.style.width = `${p2.health}%`;
    renderSpirit(ui.p1Spirit, p1.spirit);
    renderSpirit(ui.p2Spirit, p2.spirit);
    ui.p1Rounds.textContent = roundDots(p1.rounds);
    ui.p2Rounds.textContent = roundDots(p2.rounds);
    ui.timer.textContent = Math.ceil(roundTime).toString().padStart(2, '0');
    ui.roundText.textContent = `ROUND ${round}`;
  }

  function loop(now) {
    const dt = Math.min((now - last) / 1000, .033);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  addEventListener('keydown', e => {
    if (['KeyA','KeyD','KeyW','KeyS','KeyF','KeyG','KeyV','KeyQ','KeyE','KeyR'].includes(e.code)) {
      e.preventDefault();
      if (!keys.has(e.code)) pressed.add(e.code);
      keys.add(e.code);
    }
  });

  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
  });

  ui.restartBtn.addEventListener('click', showCharacterSelect);
  document.querySelectorAll('.fighter-choice').forEach(button => {
    button.addEventListener('click', () => setupMatch(button.dataset.fighter));
  });

  showCharacterSelect();
  requestAnimationFrame(loop);
})();
