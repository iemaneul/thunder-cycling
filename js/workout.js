(function () {
  const workoutTitle = document.getElementById("workoutTitle");
  const workoutMeta = document.getElementById("workoutMeta");
  const playlistLink = document.getElementById("playlistLink");
  const editWorkoutForm = document.getElementById("editWorkoutForm");
  const workoutNameInput = document.getElementById("workoutNameInput");
  const workoutPlaylistInput = document.getElementById("workoutPlaylistInput");
  const saveWorkoutButton = document.getElementById("saveWorkoutButton");
  const saveWorkoutMessage = document.getElementById("saveWorkoutMessage");
  const spotifyEmbedWrap = document.getElementById("spotifyEmbedWrap");
  const spotifyEmbed = document.getElementById("spotifyEmbed");
  const musicMessage = document.getElementById("musicMessage");
  const musicCards = document.getElementById("musicCards");
  const addMusicButton = document.getElementById("addMusicButton");
  const currentZone = document.getElementById("currentZone");
  const currentIntensity = document.getElementById("currentIntensity");
  const currentPosition = document.getElementById("currentPosition");
  const currentLoad = document.getElementById("currentLoad");
  const currentElapsed = document.getElementById("currentElapsed");
  const playerMessage = document.getElementById("playerMessage");
  const playButton = document.getElementById("playButton");
  const pauseButton = document.getElementById("pauseButton");
  const resetButton = document.getElementById("resetButton");
  const chart = window.BCCharts.createPowerChart(document.getElementById("powerChart"));

  const params = new URLSearchParams(window.location.search);
  const workoutId = Number(params.get("id"));

  let currentSamples = [];
  let rawWorkoutSamples = [];
  let timelineBlocks = [];
  let playbackSeconds = 0;
  let playbackTimer = null;
  let lastFrameAt = 0;
  let spotifyController = null;
  let spotifyUri = "";
  let spotifyApiReady = false;

  function formatDate(value) {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(value));
  }

  function formatClock(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds || 0));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function getSpotifyEmbedUrl(url) {
    if (!url) {
      return "";
    }

    if (url.includes("open.spotify.com/embed/")) {
      return url;
    }

    if (url.includes("open.spotify.com/")) {
      return url.replace("open.spotify.com/", "open.spotify.com/embed/");
    }

    return "";
  }

  function getSpotifyUri(url) {
    if (!url) {
      return "";
    }

    if (url.startsWith("spotify:")) {
      return url;
    }

    const match = url.match(/open\.spotify\.com\/(playlist|album|track|episode|show)\/([A-Za-z0-9]+)/);
    if (!match) {
      return "";
    }

    return `spotify:${match[1]}:${match[2]}`;
  }

  function setupSpotifyEmbed() {
    if (!spotifyApiReady || !spotifyUri || spotifyController || !spotifyEmbed) {
      return;
    }

    window.SpotifyIframeAPI.createController(
      spotifyEmbed,
      {
        width: "100%",
        height: 152,
        uri: spotifyUri
      },
      (controller) => {
        spotifyController = controller;
      }
    );
  }

  function parseMinuteSecond(minuteValue, secondValue) {
    const minutes = Math.max(0, Number(minuteValue || 0));
    const seconds = Math.max(0, Math.min(59, Number(secondValue || 0)));
    return minutes * 60 + seconds;
  }

  function parseClockValue(value) {
    const cleaned = String(value || "").trim();
    if (!cleaned) {
      return 0;
    }

    const parts = cleaned.split(":");
    if (parts.length === 1) {
      const digits = cleaned.replace(/\D/g, "");
      return digits === "" ? 0 : Number(digits) * 60;
    }

    const minutes = Math.max(0, Number((parts[0] || "").replace(/\D/g, "") || 0));
    const seconds = Math.max(0, Math.min(59, Number((parts[1] || "").replace(/\D/g, "") || 0)));
    return parseMinuteSecond(minutes, seconds);
  }

  function secondsToParts(value) {
    const total = Number(value || 0);
    return {
      minutes: Math.floor(total / 60),
      seconds: total % 60
    };
  }

  function attachTimeFieldFormatting(scope) {
    scope.querySelectorAll(".clock-field").forEach((input) => {
      input.addEventListener("input", () => {
        const digits = String(input.value || "").replace(/\D/g, "").slice(0, 4);

        if (digits === "") {
          input.value = "";
          return;
        }

        if (digits.length <= 2) {
          input.value = digits;
          return;
        }

        input.value = `${digits.slice(0, -2)}:${digits.slice(-2)}`;
      });

      input.addEventListener("blur", () => {
        const totalSeconds = parseClockValue(input.value);
        input.value = formatClock(totalSeconds);
      });
    });
  }

  function getIntensityLevel(value) {
    const normalized = normalizeIntensityLabel(value);

    if (/zona_?1/.test(normalized)) return 1;
    if (/zona_?2/.test(normalized)) return 2;
    if (/zona_?3/.test(normalized)) return 3;
    if (/zona_?4/.test(normalized)) return 4;
    if (/zona_?5/.test(normalized)) return 5;

    const map = {
      recuperacao: 1,
      leve: 2,
      moderada: 3,
      media: 3,
      forte: 4,
      muito_forte: 5,
      sprint: 5
    };

    return map[normalized] ?? 3;
  }

  function getMaxPower() {
    return Math.max(100, ...currentSamples.map((sample) => sample.power ?? 0));
  }

  function getZoneFromPower(power) {
    const ratio = (power || 0) / getMaxPower();

    if (ratio >= 0.9) return 5;
    if (ratio >= 0.75) return 4;
    if (ratio >= 0.6) return 3;
    if (ratio >= 0.4) return 2;
    return 1;
  }

  function normalizeIntensityLabel(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replaceAll("-", "_")
      .replaceAll(" ", "_");
  }

  function getPowerFromBlock(block) {
    const numericIntensity = Number(String(block.intensity || "").replace(",", "."));
    if (Number.isFinite(numericIntensity) && numericIntensity > 0) {
      return numericIntensity;
    }

    const level = getIntensityLevel(block.intensity);
    return 70 + level * 35;
  }

  function buildSyntheticSamplesFromTimeline() {
    if (!timelineBlocks.length) {
      return [];
    }

    const synthetic = [];
    let previousPower = 0;
    let previousEnd = 0;

    timelineBlocks.forEach((block) => {
      const targetPower = getPowerFromBlock(block);
      const start = Math.max(0, Math.floor(block.timeline_start));
      const end = Math.max(start, Math.floor(block.timeline_end));
      const startPower = synthetic.length ? previousPower : 0;

      if (!synthetic.length && start > 0) {
        for (let second = 0; second < start; second += 1) {
          synthetic.push({
            time: second,
            power: 0,
            cadence: null,
            heart_rate: null,
            speed: null
          });
        }
      }

      if (synthetic.length && start > previousEnd) {
        for (let second = previousEnd + 1; second <= start; second += 1) {
          synthetic.push({
            time: second,
            power: previousPower,
            cadence: null,
            heart_rate: null,
            speed: null
          });
        }
      }

      for (let second = start; second <= end; second += 1) {
        const span = Math.max(1, end - start);
        const progress = span === 0 ? 1 : (second - start) / span;
        synthetic.push({
          time: second,
          power: startPower + (targetPower - startPower) * progress,
          cadence: null,
          heart_rate: null,
          speed: null
        });
      }

      previousPower = targetPower;
      previousEnd = end;
    });

    synthetic.sort((a, b) => a.time - b.time);

    return synthetic.filter((sample, index, list) => {
      if (index === 0) {
        return true;
      }

      const previous = list[index - 1];
      return previous.time !== sample.time;
    });
  }

  function getInterpolatedSample(seconds) {
    if (!currentSamples.length) {
      return null;
    }

    if (currentSamples.length === 1) {
      return {
        x: currentSamples[0].time ?? 0,
        y: currentSamples[0].power ?? 0
      };
    }

    const firstTime = currentSamples[0].time ?? 0;
    const lastSample = currentSamples[currentSamples.length - 1];
    const lastTime = lastSample.time ?? 0;

    if (seconds <= firstTime) {
      return { x: seconds, y: currentSamples[0].power ?? 0 };
    }

    if (seconds >= lastTime) {
      return { x: seconds, y: lastSample.power ?? 0 };
    }

    for (let index = 0; index < currentSamples.length - 1; index += 1) {
      const current = currentSamples[index];
      const next = currentSamples[index + 1];
      const currentTime = current.time ?? 0;
      const nextTime = next.time ?? 0;

      if (seconds >= currentTime && seconds <= nextTime) {
        const span = nextTime - currentTime;
        const progress = span === 0 ? 0 : (seconds - currentTime) / span;
        const currentPower = current.power ?? 0;
        const nextPower = next.power ?? 0;

        return {
          x: seconds,
          y: currentPower + (nextPower - currentPower) * progress
        };
      }
    }

    return { x: seconds, y: lastSample.power ?? 0 };
  }

  function createBlockRow(block) {
    const blockRow = document.createElement("div");
    blockRow.className = "block-row";
    blockRow.innerHTML = `
      <button type="button" class="remove-block-button">x</button>
      <div class="block-grid">
        <div class="time-pair">
          <label>Inicio</label>
          <input type="text" class="block-start-time clock-field" inputmode="numeric" placeholder="mm:ss" value="${formatClock(block?.start_seconds || 0)}">
        </div>
        <div class="time-pair">
          <label>Fim</label>
          <input type="text" class="block-end-time clock-field" inputmode="numeric" placeholder="mm:ss" value="${formatClock(block?.end_seconds || 0)}">
        </div>
        <input type="text" class="block-intensity" placeholder="Intensidade" value="${block?.intensity || ""}">
        <select class="block-load-level">
          <option value="">Carga</option>
          <option value="baixa">Baixa</option>
          <option value="baixa-media">Baixa-media</option>
          <option value="media">Media</option>
          <option value="media_alta">Media-alta</option>
          <option value="alta">Alta</option>
        </select>
        <select class="block-position">
          <option value="">Posicao</option>
          <option value="sentado">Sentado</option>
          <option value="em_pe">Em pe</option>
        </select>
      </div>
    `;

    blockRow.querySelector(".block-load-level").value = block?.load_level || "";
    blockRow.querySelector(".block-position").value = block?.position || "";
    blockRow.querySelector(".remove-block-button").addEventListener("click", () => {
      blockRow.remove();
    });
    attachTimeFieldFormatting(blockRow);

    return blockRow;
  }

  function createMusicCard(music, blocks) {
    const card = document.createElement("section");
    card.className = "music-card";
    card.dataset.musicId = music?.id || "";

    card.innerHTML = `
      <div class="music-card-header">
        <h3>Musica</h3>
        <span class="music-order-label"></span>
      </div>
      <div class="simple-form">
        <input type="text" class="music-title" placeholder="Nome da musica" value="${music?.title || ""}">
        <input type="text" class="music-artist" placeholder="Artista" value="${music?.artist || ""}">
        <div class="time-pair">
          <label>Duracao</label>
          <input type="text" class="music-duration-time clock-field" inputmode="numeric" placeholder="mm:ss" value="${formatClock(music?.duration_seconds || 0)}">
        </div>
      </div>
      <div class="music-card-actions">
        <button type="button" class="add-block-button">Adicionar bloco</button>
        <button type="button" class="save-music-button">Salvar musica</button>
        <button type="button" class="remove-music-button">Remover musica</button>
      </div>
      <div class="blocks-container"></div>
    `;

    const blocksContainer = card.querySelector(".blocks-container");
    const orderedBlocks = blocks && blocks.length ? blocks : [{}];
    orderedBlocks.forEach((block) => {
      blocksContainer.appendChild(createBlockRow(block));
    });

    card.querySelector(".add-block-button").addEventListener("click", () => {
      blocksContainer.appendChild(createBlockRow());
    });
    attachTimeFieldFormatting(card);

    card.querySelector(".remove-music-button").addEventListener("click", async () => {
      try {
        if (!card.dataset.musicId) {
          card.remove();
          return;
        }

        musicMessage.textContent = "Removendo musica do treino...";
        await window.BCApi.deactivateWorkoutMusic(Number(card.dataset.musicId));
        await loadMusicCards();
        musicMessage.textContent = "Musica removida do treino e preservada no banco.";
      } catch (error) {
        console.error(error);
        musicMessage.textContent = `Nao foi possivel remover a musica: ${error.message}`;
      }
    });

    card.querySelector(".save-music-button").addEventListener("click", async () => {
      try {
        const title = card.querySelector(".music-title").value.trim();
        const artist = card.querySelector(".music-artist").value.trim();
        const durationSeconds = parseClockValue(
          card.querySelector(".music-duration-time").value
        );

        if (!title) {
          throw new Error("Informe o nome da musica.");
        }

        const allCards = [...musicCards.querySelectorAll(".music-card")];
        const musicOrder = allCards.indexOf(card) + 1;

        const blockPayload = [...blocksContainer.querySelectorAll(".block-row")].map((row) => {
          const startSeconds = parseClockValue(
            row.querySelector(".block-start-time").value
          );
          const endSeconds = parseClockValue(
            row.querySelector(".block-end-time").value
          );
          const intensity = row.querySelector(".block-intensity").value.trim();
          const loadLevel = row.querySelector(".block-load-level").value;
          const position = row.querySelector(".block-position").value;

          if (!intensity || !loadLevel || !position) {
            throw new Error("Preencha intensidade, carga e posicao em todos os blocos.");
          }

          if (endSeconds < startSeconds) {
            throw new Error("O fim do bloco precisa ser maior ou igual ao inicio.");
          }

          return {
            start_seconds: startSeconds,
            end_seconds: endSeconds,
            intensity,
            load_level: loadLevel,
            position
          };
        });

        musicMessage.textContent = "Salvando musica e blocos...";

        const savedMusic = await window.BCApi.saveWorkoutMusicWithBlocks({
          id: card.dataset.musicId ? Number(card.dataset.musicId) : null,
          workout_id: workoutId,
          title,
          artist: artist || null,
          duration_seconds: durationSeconds,
          music_order: musicOrder,
          blocks: blockPayload
        });

        card.dataset.musicId = savedMusic.id;
        await loadMusicCards();
        musicMessage.textContent = "Musica salva com sucesso.";
      } catch (error) {
        console.error(error);
        musicMessage.textContent = error.message;
      }
    });

    return card;
  }

  async function loadMusicCards() {
    const musicList = await window.BCApi.getWorkoutMusic(workoutId);
    musicCards.innerHTML = "";

    if (!musicList.length) {
      return;
    }

    const blockResults = await Promise.all(
      musicList.map((music) => window.BCApi.getMusicBlocksByMusicId(music.id))
    );

    musicList.forEach((music, index) => {
      const card = createMusicCard(music, blockResults[index]);
      card.querySelector(".music-order-label").textContent = `Faixa ${index + 1}`;
      musicCards.appendChild(card);
    });

    rebuildTimeline(musicList, blockResults);
  }

  function rebuildTimeline(musicList, blocksPerMusic) {
    timelineBlocks = [];
    let offset = 0;

    musicList.forEach((music, index) => {
      const blocks = blocksPerMusic[index] || [];
      blocks
        .sort((a, b) => a.start_seconds - b.start_seconds)
        .forEach((block) => {
          timelineBlocks.push({
            music_title: music.title,
            intensity: block.intensity,
            position: block.position,
            load_level: block.load_level,
            timeline_start: offset + block.start_seconds,
            timeline_end: offset + block.end_seconds
          });
        });

      offset += music.duration_seconds || 0;
    });

    if (!rawWorkoutSamples.length) {
      renderSamples(buildSyntheticSamplesFromTimeline(), true);
    } else {
      syncPlaybackUI();
    }
  }

  function renderSamples(samples, syntheticMode = false) {
    currentSamples = samples;

    if (!samples.length) {
      window.BCCharts.updatePowerChart(chart, []);
      syncPlaybackUI();
      return;
    }

    window.BCCharts.updatePowerChart(chart, samples);
    syncPlaybackUI();
  }

  function getTimelineDuration() {
    const sampleEnd = currentSamples.length
      ? Math.max(...currentSamples.map((sample) => sample.time ?? 0))
      : 0;
    const blockEnd = timelineBlocks.length
      ? Math.max(...timelineBlocks.map((block) => block.timeline_end))
      : 0;

    return Math.max(sampleEnd, blockEnd, 1);
  }

  function getActiveBlock(seconds) {
    return timelineBlocks.find(
      (block) => seconds >= block.timeline_start && seconds <= block.timeline_end
    ) || null;
  }

  function syncPlaybackUI() {
    const sample = getInterpolatedSample(playbackSeconds);
    const block = getActiveBlock(playbackSeconds);
    const zone = getZoneFromPower(sample ? sample.y : 0);

    currentZone.textContent = zone;
    currentIntensity.textContent = block ? block.intensity : "Livre";
    currentPosition.textContent = block
      ? block.position === "em_pe" ? "Em pe" : "Sentado"
      : "-";
    currentLoad.textContent = block
      ? block.load_level.replaceAll("_", "-")
      : "-";
    currentElapsed.textContent = formatClock(playbackSeconds);
    playerMessage.textContent = block
      ? `${block.music_title} | ${formatClock(block.timeline_start)} - ${formatClock(block.timeline_end)}`
      : "Sem bloco ativo neste momento.";

    if (sample) {
      window.BCCharts.setPlaybackPosition(chart, sample);
    } else {
      window.BCCharts.setPlaybackPosition(chart, null);
    }
  }

  function stopPlayback() {
    if (playbackTimer) {
      window.cancelAnimationFrame(playbackTimer);
      playbackTimer = null;
    }

    if (spotifyController && typeof spotifyController.pause === "function") {
      spotifyController.pause();
    }
  }

  function framePlayback(timestamp) {
    if (!lastFrameAt) {
      lastFrameAt = timestamp;
    }

    const delta = (timestamp - lastFrameAt) / 1000;
    lastFrameAt = timestamp;
    playbackSeconds += delta;

    if (playbackSeconds >= getTimelineDuration()) {
      playbackSeconds = getTimelineDuration();
      syncPlaybackUI();
      stopPlayback();
      return;
    }

    syncPlaybackUI();
    playbackTimer = window.requestAnimationFrame(framePlayback);
  }

  function startPlayback() {
    if (!currentSamples.length) {
      playerMessage.textContent = "Cadastre amostras para reproduzir o grafico.";
      return;
    }

    stopPlayback();
    lastFrameAt = 0;
    playbackTimer = window.requestAnimationFrame(framePlayback);

    if (spotifyController) {
      if (typeof spotifyController.resume === "function") {
        spotifyController.resume();
      } else if (typeof spotifyController.play === "function") {
        spotifyController.play();
      }
    }
  }

  function resetPlayback() {
    stopPlayback();
    playbackSeconds = 0;
    lastFrameAt = 0;
    syncPlaybackUI();

    if (spotifyController && typeof spotifyController.restart === "function") {
      spotifyController.restart();
    }
  }

  async function loadWorkout() {
    if (!window.BCSupabase.supabase) {
      throw new Error(
        "Atualize js/supabase-config.js com sua URL e anon key do Supabase."
      );
    }

    if (!Number.isInteger(workoutId) || workoutId <= 0) {
      throw new Error("Informe um id de treino valido na URL.");
    }

    const workout = await window.BCApi.getWorkoutById(workoutId);
    const viewWorkoutLink = document.getElementById("viewWorkoutLink");
    if (viewWorkoutLink) {
      viewWorkoutLink.href = `workout.html?id=${workout.id}`;
    }
    workoutTitle.textContent = workout.name || `Treino #${workout.id}`;
    workoutMeta.textContent = `Iniciado em ${formatDate(workout.start_time)}`;
    if (workoutNameInput) {
      workoutNameInput.value = workout.name || "";
    }
    if (workoutPlaylistInput) {
      workoutPlaylistInput.value = workout.spotify_playlist_url || "";
    }

    if (workout.spotify_playlist_url) {
      playlistLink.href = workout.spotify_playlist_url;
      playlistLink.classList.remove("hidden");
      spotifyUri = getSpotifyUri(workout.spotify_playlist_url);

      const embedUrl = getSpotifyEmbedUrl(workout.spotify_playlist_url);
      if (embedUrl || spotifyUri) {
        spotifyEmbedWrap.classList.remove("hidden");
        setupSpotifyEmbed();
      }
    }

    const samples = await window.BCApi.getWorkoutSamples(workoutId);
    rawWorkoutSamples = samples;
    renderSamples(samples);
    await loadMusicCards();

    if (!rawWorkoutSamples.length && timelineBlocks.length) {
      renderSamples(buildSyntheticSamplesFromTimeline(), true);
    }

    syncPlaybackUI();
  }

  if (editWorkoutForm) {
    editWorkoutForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      try {
        saveWorkoutButton.disabled = true;
        saveWorkoutMessage.textContent = "Salvando treino...";

        const workout = await window.BCApi.updateWorkout(workoutId, {
          name: workoutNameInput.value.trim(),
          spotify_playlist_url: workoutPlaylistInput.value.trim() || null
        });

        workoutTitle.textContent = workout.name || `Treino #${workout.id}`;
        playlistLink.classList.add("hidden");
        spotifyEmbedWrap.classList.add("hidden");
        spotifyUri = "";
        spotifyController = null;

        if (workout.spotify_playlist_url) {
          playlistLink.href = workout.spotify_playlist_url;
          playlistLink.classList.remove("hidden");
          spotifyUri = getSpotifyUri(workout.spotify_playlist_url);
          if (spotifyUri) {
            spotifyEmbedWrap.classList.remove("hidden");
            spotifyEmbed.innerHTML = "";
            setupSpotifyEmbed();
          }
        }

        saveWorkoutMessage.textContent = "Treino salvo com sucesso.";
      } catch (error) {
        console.error(error);
        saveWorkoutMessage.textContent = `Nao foi possivel salvar o treino: ${error.message}`;
      } finally {
        saveWorkoutButton.disabled = false;
      }
    });
  }

  addMusicButton.addEventListener("click", () => {
    const card = createMusicCard();
    card.querySelector(".music-order-label").textContent = `Faixa ${musicCards.children.length + 1}`;
    musicCards.appendChild(card);
  });

  playButton.addEventListener("click", startPlayback);
  pauseButton.addEventListener("click", stopPlayback);
  resetButton.addEventListener("click", resetPlayback);

  window.onSpotifyIframeApiReady = (IFrameAPI) => {
    window.SpotifyIframeAPI = IFrameAPI;
    spotifyApiReady = true;
    setupSpotifyEmbed();
  };

  loadWorkout().catch((error) => {
    console.error(error);
    workoutMeta.textContent = error.message;
  });
})();
