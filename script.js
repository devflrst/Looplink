const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const peerIdEl = document.getElementById('peer-id');
const peerInput = document.getElementById('peer-input');
const connectionStatusEl = document.getElementById('connection-status');
const scoreLocalEl = document.getElementById('score-local');
const scoreRemoteEl = document.getElementById('score-remote');
const nameLocalEl = document.getElementById('name-local');
const nameRemoteEl = document.getElementById('name-remote');
const arenaStatusEl = document.getElementById('arena-status');
const newRoomBtn = document.getElementById('new-room-btn');
const soloBtn = document.getElementById('solo-btn');
const copyBtn = document.getElementById('copy-btn');
const connectBtn = document.getElementById('connect-btn');
const resetBtn = document.getElementById('reset-btn');
const glowToggle = document.getElementById('toggle-glow');
const particlesToggle = document.getElementById('toggle-particles');
const autoRespawnToggle = document.getElementById('toggle-auto-respawn');
const speedSelect = document.getElementById('speed-select');
const botSelect = document.getElementById('bot-select');
const boardWrap = document.querySelector('.board-wrap');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNumber = document.getElementById('countdown-number');

const settings = {
  glow: true,
  particles: true,
  autoRespawn: true,
  speed: 1,
  botLevel: 'normal',
};

const config = {
  count: 18,
  cell: canvas.width / 18,
  tickMs: 135,
};

const localState = {
  name: 'Вы',
  color: '#7ef0a5',
  score: 0,
  direction: { x: 1, y: 0 },
  nextDirection: { x: 1, y: 0 },
  snake: [],
  alive: true,
  deathParticles: [],
};

const remoteState = {
  name: 'Ожидание',
  color: '#6fe7ff',
  score: 0,
  direction: { x: -1, y: 0 },
  snake: [],
  alive: false,
  deathParticles: [],
};

const world = {
  food: { x: 0, y: 0 },
  connected: false,
  peer: null,
  connection: null,
  soloMode: false,
  respawnTimer: 0,
  countdownActive: false,
  countdownStartedAt: 0,
  countdownValue: 3,
};

let lastTick = 0;

function clampCell(value) {
  return Math.max(0, Math.min(config.count - 1, value));
}

function randomFood(snakeBodies) {
  const occupied = new Set(snakeBodies.flat().map((segment) => `${segment.x}:${segment.y}`));
  const freeCells = [];

  for (let y = 0; y < config.count; y += 1) {
    for (let x = 0; x < config.count; x += 1) {
      if (!occupied.has(`${x}:${y}`)) {
        freeCells.push({ x, y });
      }
    }
  }

  if (!freeCells.length) {
    return { x: 0, y: 0 };
  }

  return freeCells[Math.floor(Math.random() * freeCells.length)];
}

function createDeathParticles(snake, color) {
  const particles = [];

  snake.forEach((segment, index) => {
    const count = Math.max(3, 4 + index % 3);
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * Math.random()) + index * 0.2;
      const speed = 0.5 + Math.random() * 1.1;
      particles.push({
        x: segment.x + 0.5,
        y: segment.y + 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 18 + Math.random() * 18,
        maxLife: 18 + Math.random() * 18,
        color,
      });
    }
  });

  return particles;
}

function updateDeathParticles(state) {
  state.deathParticles = state.deathParticles.filter((particle) => particle.life > 0);
  state.deathParticles.forEach((particle) => {
    particle.x += particle.vx * 0.16;
    particle.y += particle.vy * 0.16;
    particle.vy += 0.02;
    particle.life -= 1;
  });
}

function drawDeathParticles(state) {
  if (!settings.particles || !state.deathParticles.length) {
    return;
  }

  ctx.save();
  state.deathParticles.forEach((particle) => {
    const alpha = Math.max(0, particle.life / particle.maxLife);
    const px = particle.x * config.cell + config.cell / 2;
    const py = particle.y * config.cell + config.cell / 2;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.fillRect(px, py, 4, 4);
  });
  ctx.restore();
}

function triggerDeath(player) {
  const state = player === 'local' ? localState : remoteState;
  state.deathParticles = createDeathParticles(state.snake, state.color);
  state.snake = [];
  state.alive = false;

  if (world.soloMode || world.connected) {
    world.respawnTimer = 8;
  }
}

function resetGame() {
  localState.snake = [
    { x: 6, y: 9 },
    { x: 5, y: 9 },
    { x: 4, y: 9 },
    { x: 3, y: 9 },
  ];
  localState.direction = { x: 1, y: 0 };
  localState.nextDirection = { x: 1, y: 0 };
  localState.score = 0;
  localState.alive = true;
  localState.deathParticles = [];

  if (world.soloMode || world.connected) {
    remoteState.snake = [
      { x: 12, y: 9 },
      { x: 13, y: 9 },
      { x: 14, y: 9 },
      { x: 15, y: 9 },
    ];
    remoteState.direction = { x: -1, y: 0 };
    remoteState.score = 0;
    remoteState.alive = true;
    remoteState.deathParticles = [];
  } else {
    remoteState.snake = [];
    remoteState.direction = { x: -1, y: 0 };
    remoteState.score = 0;
    remoteState.alive = false;
    remoteState.deathParticles = [];
  }

  world.food = randomFood([...localState.snake, ...remoteState.snake]);
  scoreLocalEl.textContent = String(localState.score);
  scoreRemoteEl.textContent = String(remoteState.score);
  startCountdown();
}

function applySettings() {
  settings.glow = glowToggle.checked;
  settings.particles = particlesToggle.checked;
  settings.autoRespawn = autoRespawnToggle.checked;
  settings.speed = Number(speedSelect.value);
  settings.botLevel = botSelect.value;
  config.tickMs = Math.round(135 / settings.speed);
}

function updateCountdownUI() {
  if (!countdownOverlay || !countdownNumber) {
    return;
  }

  if (world.countdownActive) {
    countdownOverlay.classList.add('visible');
    countdownNumber.textContent = String(world.countdownValue);
    countdownNumber.style.opacity = '1';
    countdownNumber.style.transform = 'scale(1)';
    countdownNumber.style.animation = 'none';
    void countdownNumber.offsetWidth;
    countdownNumber.style.animation = 'countdown-pop 0.28s ease-out';
    return;
  }

  countdownOverlay.classList.remove('visible');
  countdownNumber.textContent = '3';
  countdownNumber.style.opacity = '0';
  countdownNumber.style.transform = 'scale(0.45)';
  countdownNumber.style.animation = 'none';
}

function startCountdown() {
  world.countdownActive = true;
  world.countdownStartedAt = performance.now();
  world.countdownValue = 3;
  updateCountdownUI();
}

function beginLocalRound() {
  resetGame();
  if (world.connection && world.connection.open) {
    world.connection.send(JSON.stringify({
      type: 'round-start',
      startedAt: performance.now() + 160,
    }));
  }
  startCountdown();
}

function updateUI() {
  peerIdEl.textContent = world.peer ? world.peer.id : 'offline';
  nameLocalEl.textContent = localState.name;
  nameRemoteEl.textContent = remoteState.name;
  scoreLocalEl.textContent = String(localState.score);
  scoreRemoteEl.textContent = String(remoteState.score);
  if (world.soloMode) {
    connectionStatusEl.textContent = 'Играть с ботом';
    arenaStatusEl.textContent = world.countdownActive ? 'подготовка' : 'бот';
    return;
  }
  connectionStatusEl.textContent = world.connected ? 'подключено' : 'ожидание';
  arenaStatusEl.textContent = world.countdownActive ? 'подготовка' : (world.connected ? 'синхрон' : 'готовность');
}

function setDirection(next) {
  const isOpposite = localState.direction.x + next.x === 0 && localState.direction.y + next.y === 0;

  if (!isOpposite) {
    localState.nextDirection = next;
  }
}

function moveLocalSnake() {
  if (!localState.alive) {
    return;
  }

  localState.direction = localState.nextDirection;
  const head = { ...localState.snake[0] };
  const nextHead = {
    x: clampCell(head.x + localState.direction.x),
    y: clampCell(head.y + localState.direction.y),
  };

  localState.snake.unshift(nextHead);

  const ateFood = nextHead.x === world.food.x && nextHead.y === world.food.y;
  if (!ateFood) {
    localState.snake.pop();
  } else {
    localState.score += 1;
    world.food = randomFood(localState.snake.concat(remoteState.snake));
    scoreLocalEl.textContent = String(localState.score);
  }

  const hitSelf = localState.snake.slice(1).some((segment) => segment.x === nextHead.x && segment.y === nextHead.y);
  const hitRemote = remoteState.snake.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y);

  if (hitSelf || hitRemote) {
    triggerDeath('local');
    arenaStatusEl.textContent = 'съеден';
  }
}

function renderBackground() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#090d13';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < config.count; y += 1) {
    for (let x = 0; x < config.count; x += 1) {
      const px = x * config.cell;
      const py = y * config.cell;
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.strokeRect(px, py, config.cell, config.cell);
    }
  }
}

function drawFood() {
  const x = world.food.x * config.cell + config.cell / 2;
  const y = world.food.y * config.cell + config.cell / 2;
  const radius = config.cell * 0.3;

  ctx.beginPath();
  ctx.fillStyle = '#ffb86c';
  ctx.shadowColor = 'rgba(255, 184, 108, 0.7)';
  ctx.shadowBlur = settings.glow ? 16 : 0;
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawSnake(snake, color, isLocal = false) {
  for (let index = 0; index < snake.length; index += 1) {
    const segment = snake[index];
    const x = segment.x * config.cell + 2;
    const y = segment.y * config.cell + 2;
    const size = config.cell - 4;

    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = settings.glow ? (isLocal ? 12 : 10) : 0;
    ctx.fillRect(x, y, size, size);

    if (index === 0) {
      const headX = segment.x * config.cell + config.cell / 2;
      const headY = segment.y * config.cell + config.cell / 2;
      ctx.fillStyle = '#edf3ff';
      ctx.fillRect(headX - 3, headY - 3, 6, 6);
    }
  }

  ctx.shadowBlur = 0;
}

function render() {
  renderBackground();
  drawFood();
  drawSnake(localState.snake, localState.color, true);
  drawSnake(remoteState.snake, remoteState.color, false);
  drawDeathParticles(localState);
  drawDeathParticles(remoteState);
}

function moveRemoteBot() {
  if (!world.soloMode || !remoteState.alive) {
    return;
  }

  const head = remoteState.snake[0];
  const candidates = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ].filter((dir) => !(remoteState.direction.x + dir.x === 0 && remoteState.direction.y + dir.y === 0));

  if (!candidates.length) {
    return;
  }

  let bestDir = candidates[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  if (settings.botLevel === 'easy' && Math.random() > 0.6) {
    bestDir = candidates[Math.floor(Math.random() * candidates.length)];
  } else {
    candidates.forEach((dir) => {
      const nextHead = {
        x: clampCell(head.x + dir.x),
        y: clampCell(head.y + dir.y),
      };
      const distance = Math.abs(nextHead.x - world.food.x) + Math.abs(nextHead.y - world.food.y);
      const aggressionBoost = settings.botLevel === 'hard' ? 0.4 : settings.botLevel === 'easy' ? -0.3 : 0;
      const score = distance + aggressionBoost;
      if (score < bestDistance) {
        bestDistance = score;
        bestDir = dir;
      }
    });
  }

  remoteState.direction = bestDir;
  const nextHead = {
    x: clampCell(head.x + remoteState.direction.x),
    y: clampCell(head.y + remoteState.direction.y),
  };

  remoteState.snake.unshift(nextHead);

  const ateFood = nextHead.x === world.food.x && nextHead.y === world.food.y;
  if (!ateFood) {
    remoteState.snake.pop();
  } else {
    remoteState.score += 1;
    world.food = randomFood(localState.snake.concat(remoteState.snake));
    scoreRemoteEl.textContent = String(remoteState.score);
  }

  const hitSelf = remoteState.snake.slice(1).some((segment) => segment.x === nextHead.x && segment.y === nextHead.y);
  const hitLocal = localState.snake.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y);

  if (hitSelf || hitLocal) {
    triggerDeath('remote');
  }
}

function step() {
  if (world.countdownActive) {
    const elapsedSeconds = (performance.now() - world.countdownStartedAt) / 1000;
    const nextValue = Math.max(1, 3 - Math.floor(elapsedSeconds));
    const shouldFinish = elapsedSeconds >= 3;

    if (nextValue !== world.countdownValue) {
      world.countdownValue = nextValue;
      updateCountdownUI();
    }

    if (shouldFinish) {
      world.countdownActive = false;
      world.countdownValue = 3;
      updateCountdownUI();
      updateUI();
    }

    render();
    return;
  }

  if (world.soloMode) {
    const alivePlayers = [localState.alive, remoteState.alive].filter(Boolean).length;

    if (alivePlayers === 0) {
      if (settings.autoRespawn) {
        if (world.respawnTimer <= 0) {
          world.respawnTimer = 8;
        }
        world.respawnTimer -= 1;
        updateDeathParticles(localState);
        updateDeathParticles(remoteState);
        if (world.respawnTimer <= 0) {
          resetGame();
        }
      }
    } else {
      if (localState.alive) {
        moveLocalSnake();
      }
      if (remoteState.alive) {
        moveRemoteBot();
      }
      updateDeathParticles(localState);
      updateDeathParticles(remoteState);
    }
  } else {
    if (localState.alive) {
      moveLocalSnake();
      if (world.connection && world.connection.open) {
        const payload = {
          type: 'snake-state',
          snake: localState.snake,
          score: localState.score,
          direction: localState.direction,
        };
        world.connection.send(JSON.stringify(payload));
      }
    }

    if (!localState.alive && !remoteState.alive && settings.autoRespawn) {
      if (world.respawnTimer <= 0) {
        world.respawnTimer = 8;
      }
      world.respawnTimer -= 1;
      if (world.respawnTimer <= 0) {
        resetGame();
      }
    }

    updateDeathParticles(localState);
    updateDeathParticles(remoteState);
  }

  render();
  updateUI();
}

function startLoop() {
  function tickFrame(timestamp) {
    if (timestamp - lastTick >= config.tickMs) {
      lastTick = timestamp;
      step();
    }
    window.requestAnimationFrame(tickFrame);
  }

  window.requestAnimationFrame(tickFrame);
}

function initPeer() {
  if (world.peer) {
    world.peer.destroy();
  }

  world.peer = new Peer(undefined, {
    host: '0.peerjs.com',
    port: 443,
    secure: true,
    path: '/',
  });

  world.peer.on('open', (id) => {
    peerIdEl.textContent = id;
    if (!peerInput.value.trim()) {
      peerInput.value = id;
    }
    updateUI();
  });

  world.peer.on('connection', (conn) => {
    attachConnection(conn);
    remoteState.name = 'Guest';
    connectionStatusEl.textContent = 'соединение';
    updateUI();
  });

  world.peer.on('error', () => {
    connectionStatusEl.textContent = 'ошибка сети';
  });
}

function attachConnection(conn) {
  world.connection = conn;
  world.connected = true;

  conn.on('open', () => {
    world.connected = true;
    remoteState.snake = [
      { x: 12, y: 9 },
      { x: 13, y: 9 },
      { x: 14, y: 9 },
      { x: 15, y: 9 },
    ];
    remoteState.direction = { x: -1, y: 0 };
    remoteState.alive = true;
    remoteState.deathParticles = [];
    remoteState.name = 'Remote';
    connectionStatusEl.textContent = 'подключено';
    arenaStatusEl.textContent = 'синхрон';
    if (!world.countdownActive) {
      beginLocalRound();
    }
    updateUI();
  });

  conn.on('data', (payload) => {
    try {
      const data = JSON.parse(payload);
      if (!data) {
        return;
      }

      if (data.type === 'round-start') {
        const startedAt = Number(data.startedAt) || performance.now() + 160;
        world.countdownActive = true;
        world.countdownStartedAt = startedAt;
        world.countdownValue = 3;
        updateCountdownUI();
        updateUI();
        return;
      }

      if (data.type !== 'snake-state') {
        return;
      }
      remoteState.snake = data.snake;
      remoteState.score = data.score;
      remoteState.direction = data.direction;
      remoteState.alive = true;
      remoteState.name = 'Remote';
      nameRemoteEl.textContent = remoteState.name;
      scoreRemoteEl.textContent = String(remoteState.score);
    } catch (error) {
      console.warn('Peer message parse error', error);
    }
  });

  conn.on('close', () => {
    world.connected = false;
    world.connection = null;
    remoteState.name = 'Ожидание';
    remoteState.snake = [];
    remoteState.alive = false;
    remoteState.deathParticles = [];
    connectionStatusEl.textContent = 'ожидание';
    arenaStatusEl.textContent = 'готовность';
    updateUI();
  });
}

function connectToPeer() {
  const remoteId = peerInput.value.trim();
  if (!remoteId || !world.peer) {
    return;
  }

  if (world.connection && world.connection.open) {
    world.connection.close();
  }

  const conn = world.peer.connect(remoteId, { reliable: true });
  attachConnection(conn);
}

async function copyPeerId() {
  if (!world.peer || !world.peer.id) {
    return;
  }

  try {
    await navigator.clipboard.writeText(world.peer.id);
  } catch (error) {
    peerInput.value = world.peer.id;
  }
}

function enterSoloMode() {
  world.soloMode = true;
  world.connected = false;
  if (world.connection && world.connection.open) {
    world.connection.close();
  }
  remoteState.name = 'Бот';
  remoteState.alive = true;
  world.respawnTimer = 0;
  resetGame();
  updateUI();
}

function leaveSoloMode() {
  world.soloMode = false;
  world.respawnTimer = 0;
  remoteState.name = 'Ожидание';
  remoteState.alive = false;
  remoteState.snake = [];
  remoteState.deathParticles = [];
  if (world.connection && world.connection.open) {
    world.connection.close();
  }
  initPeer();
  resetGame();
  updateUI();
}

function bindControls() {
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  const updateFromDrag = (clientX, clientY) => {
    const deltaX = clientX - dragStartX;
    const deltaY = clientY - dragStartY;
    const threshold = 12;

    if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) {
      return;
    }

    const next = Math.abs(deltaX) > Math.abs(deltaY)
      ? { x: deltaX > 0 ? 1 : -1, y: 0 }
      : { x: 0, y: deltaY > 0 ? 1 : -1 };

    setDirection(next);
    dragStartX = clientX;
    dragStartY = clientY;
  };

  boardWrap.addEventListener('pointerdown', (event) => {
    isDragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    boardWrap.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, { passive: false });

  boardWrap.addEventListener('pointermove', (event) => {
    if (!isDragging) {
      return;
    }

    updateFromDrag(event.clientX, event.clientY);
    event.preventDefault();
  }, { passive: false });

  boardWrap.addEventListener('pointerup', () => {
    isDragging = false;
  });

  boardWrap.addEventListener('pointercancel', () => {
    isDragging = false;
  });

  boardWrap.addEventListener('pointerleave', () => {
    isDragging = false;
  });

  window.addEventListener('keydown', (event) => {
    const keyMap = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      w: { x: 0, y: -1 },
      s: { x: 0, y: 1 },
      a: { x: -1, y: 0 },
      d: { x: 1, y: 0 },
    };

    const next = keyMap[event.key] || keyMap[event.key.toLowerCase()];
    if (next) {
      event.preventDefault();
      setDirection(next);
    }
  });

  newRoomBtn.addEventListener('click', () => {
    leaveSoloMode();
  });

  soloBtn.addEventListener('click', () => {
    if (world.soloMode) {
      leaveSoloMode();
      soloBtn.textContent = 'Играть с ботом';
      return;
    }
    enterSoloMode();
    soloBtn.textContent = 'Выйти из игры с ботом';
  });

  glowToggle.addEventListener('change', () => {
    applySettings();
  });

  particlesToggle.addEventListener('change', () => {
    applySettings();
  });

  autoRespawnToggle.addEventListener('change', () => {
    applySettings();
  });

  speedSelect.addEventListener('change', () => {
    applySettings();
  });

  botSelect.addEventListener('change', () => {
    applySettings();
  });

  resetBtn.addEventListener('click', () => {
    if (world.connection && world.connection.open) {
      beginLocalRound();
      return;
    }
    resetGame();
    startCountdown();
  });

  copyBtn.addEventListener('click', () => copyPeerId());
  connectBtn.addEventListener('click', () => connectToPeer());
}

applySettings();
resetGame();
updateUI();
bindControls();
initPeer();
startLoop();
render();
