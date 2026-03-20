(function () {
  const workoutTitle = document.getElementById("workoutTitle");
  const workoutMeta = document.getElementById("workoutMeta");
  const playlistLink = document.getElementById("playlistLink");
  const spotifyEmbedWrap = document.getElementById("spotifyEmbedWrap");
  const spotifyEmbed = document.getElementById("spotifyEmbed");
  const currentZone = document.getElementById("currentZone");
  const currentIntensity = document.getElementById("currentIntensity");
  const currentPosition = document.getElementById("currentPosition");
  const currentLoad = document.getElementById("currentLoad");
  const currentElapsed = document.getElementById("currentElapsed");
  const playerMessage = document.getElementById("playerMessage");
  const playButton = document.getElementById("playButton");
  const pauseButton = document.getElementById("pauseButton");
  const resetButton = document.getElementById("resetButton");
  const editWorkoutLink = document.getElementById("editWorkoutLink");
  const chart = window.BCCharts.createPowerChart(document.getElementById("powerChart"));

  const params = new URLSearchParams(window.location.search);
  const workoutId = Number(params.get("id"));

  let currentSamples = [];
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

  function getSpotifyUri(url) {
    const match = String(url || "").match(/open\.spotify\.com\/(playlist|album|track|episode|show)\/([A-Za-z0-9]+)/);
    return match ? `spotify:${match[1]}:${match[2]}` : "";
  }

  function setupSpotifyEmbed() {
    if (!spotifyApiReady || !spotifyUri || spotifyController || !spotifyEmbed) {
      return;
    }

    window.SpotifyIframeAPI.createController(
      spotifyEmbed,
      { width: "100%", height: 152, uri: spotifyUri },
      (controller) => {
        spotifyController = controller;
      }
    );
  }

  function getInterpolatedSample(seconds) {
    if (!currentSamples.length) {
      return null;
    }

    if (currentSamples.length === 1) {
      return { x: currentSamples[0].time ?? 0, y: currentSamples[0].power ?? 0 };
    }

    const firstTime = currentSamples[0].time ?? 0;
    const last = currentSamples[currentSamples.length - 1];
    if (seconds <= firstTime) return { x: seconds, y: currentSamples[0].power ?? 0 };
    if (seconds >= (last.time ?? 0)) return { x: seconds, y: last.power ?? 0 };

    for (let i = 0; i < currentSamples.length - 1; i += 1) {
      const current = currentSamples[i];
      const next = currentSamples[i + 1];
      if (seconds >= current.time && seconds <= next.time) {
        const progress = (seconds - current.time) / Math.max(1, next.time - current.time);
        return {
          x: seconds,
          y: (current.power ?? 0) + ((next.power ?? 0) - (current.power ?? 0)) * progress
        };
      }
    }

    return null;
  }

  function normalizeIntensityLabel(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replaceAll("-", "_")
      .replaceAll(" ", "_");
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
          synthetic.push({ time: second, power: 0 });
        }
      }

      if (synthetic.length && start > previousEnd) {
        for (let second = previousEnd + 1; second <= start; second += 1) {
          synthetic.push({ time: second, power: previousPower });
        }
      }

      for (let second = start; second <= end; second += 1) {
        const span = Math.max(1, end - start);
        const progress = span === 0 ? 1 : (second - start) / span;
        synthetic.push({
          time: second,
          power: startPower + (targetPower - startPower) * progress
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

      return list[index - 1].time !== sample.time;
    });
  }

  function buildTimelineBlocks(musicList, blocksPerMusic) {
    timelineBlocks = [];
    let offset = 0;

    musicList.forEach((music, index) => {
      (blocksPerMusic[index] || []).forEach((block) => {
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
  }

  function getActiveBlock(seconds) {
    return timelineBlocks.find(
      (block) => seconds >= block.timeline_start && seconds <= block.timeline_end
    ) || null;
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

  function syncPlaybackUI() {
    const sample = getInterpolatedSample(playbackSeconds);
    const block = getActiveBlock(playbackSeconds);
    currentZone.textContent = getZoneFromPower(sample ? sample.y : 0);
    currentIntensity.textContent = block ? block.intensity : "Livre";
    currentPosition.textContent = block ? (block.position === "em_pe" ? "Em pe" : "Sentado") : "-";
    currentLoad.textContent = block ? block.load_level.replaceAll("_", "-") : "-";
    currentElapsed.textContent = formatClock(playbackSeconds);
    playerMessage.textContent = block ? block.music_title : "Sem bloco ativo neste momento.";

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
    playbackSeconds += (timestamp - lastFrameAt) / 1000;
    lastFrameAt = timestamp;
    syncPlaybackUI();
    playbackTimer = window.requestAnimationFrame(framePlayback);
  }

  function startPlayback() {
    stopPlayback();
    lastFrameAt = 0;
    playbackTimer = window.requestAnimationFrame(framePlayback);
    if (spotifyController && typeof spotifyController.resume === "function") {
      spotifyController.resume();
    }
  }

  function resetPlayback() {
    stopPlayback();
    playbackSeconds = 0;
    syncPlaybackUI();
  }

  async function loadWorkout() {
    const workout = await window.BCApi.getWorkoutById(workoutId);
    editWorkoutLink.href = `edit_workout.html?id=${workout.id}`;
    workoutTitle.textContent = workout.name || `Workout #${workout.id}`;
    workoutMeta.textContent = `Iniciado em ${formatDate(workout.start_time)}`;

    if (workout.spotify_playlist_url) {
      playlistLink.href = workout.spotify_playlist_url;
      playlistLink.classList.remove("hidden");
      spotifyUri = getSpotifyUri(workout.spotify_playlist_url);
      spotifyEmbedWrap.classList.remove("hidden");
      setupSpotifyEmbed();
    }

    const musics = await window.BCApi.getWorkoutMusic(workoutId);
    const blocks = await Promise.all(musics.map((music) => window.BCApi.getMusicBlocksByMusicId(music.id)));
    buildTimelineBlocks(musics, blocks);

    currentSamples = await window.BCApi.getWorkoutSamples(workoutId);
    if (!currentSamples.length) {
      currentSamples = buildSyntheticSamplesFromTimeline();
    }

    window.BCCharts.updatePowerChart(chart, currentSamples);
    syncPlaybackUI();
  }

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
