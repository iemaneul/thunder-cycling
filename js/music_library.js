// Global Spotify API ready handler (must be in global scope for Spotify to find it)
window.onSpotifyIframeApiReady = (IFrameAPI) => {
  window.SpotifyIframeAPI = IFrameAPI;
  console.log("✅ Spotify IFrame API ready - global handler");
};

(function () {
  const musicModal = document.getElementById("musicModal");
  const musicDetailModal = document.getElementById("musicDetailModal");
  const musicForm = document.getElementById("musicForm");
  const musicList = document.getElementById("musicList");
  const statusMessage = document.getElementById("statusMessage");
  const openAddMusicModalBtn = document.getElementById("openAddMusicModal");
  const addBlockBtn = document.getElementById("addBlockBtn");
  const blocksContainer = document.getElementById("blocksContainer");

  let currentDetailChart = null;
  let currentEditingMusicId = null;
  let allMusics = [];
  let spotifyController = null;
  let spotifyUri = "";
  let spotifyApiReady = false;
  let playbackSeconds = 0;
  let playbackTimer = null;
  let currentMusicSamples = [];

  // Check Spotify API ready
  if (window.SpotifyIframeAPI) {
    spotifyApiReady = true;
    console.log("✅ Spotify API já estava pronto");
  }

  // Also listen for the global event to update our flag
  const originalHandler = window.onSpotifyIframeApiReady;
  window.onSpotifyIframeApiReady = (IFrameAPI) => {
    originalHandler(IFrameAPI);
    spotifyApiReady = true;
    console.log("✅ Spotify API ready - updated local flag");
  };

  // Event Listeners
  openAddMusicModalBtn.addEventListener("click", openAddMusicModal);
  addBlockBtn.addEventListener("click", addBlockRow);
  musicForm.addEventListener("submit", handleSaveMusicForm);
  document.getElementById("editMusicBtn").addEventListener("click", handleEditMusic);
  document.getElementById("deleteMusicBtn").addEventListener("click", handleDeleteMusic);
  document.getElementById("playMusicBtn").addEventListener("click", handlePlayMusic);

  // ============ SPOTIFY UTILITIES ============

  function getSpotifyUri(url) {
    if (!url) {
      console.log("❌ URL Spotify vazia");
      return "";
    }
    
    console.log("🔍 Parseando URL Spotify:", url);
    
    // Extrai tipo e ID, ignora locale e query params
    const typeMatch = String(url).match(/(playlist|album|track|episode|show)\/([A-Za-z0-9]+)/);
    
    if (!typeMatch) {
      console.log("❌ URL NÃO ENCONTRA PADRÃO SPOTIFY");
      console.log("Padrões aceitos:");
      console.log("  - https://open.spotify.com/track/ID");
      console.log("  - https://open.spotify.com/intl-pt/track/ID");
      console.log("  - https://open.spotify.com/playlist/ID?si=...");
      return "";
    }
    
    const type = typeMatch[1]; // Ex: "track"
    const id = typeMatch[2];   // Ex: "6ob8d5WCrcxYGwBy6wLeQ1"
    
    const uri = `spotify:${type}:${id}`;
    console.log("✅ URI extraído:", uri, "| Tipo:", type, "| ID:", id);
    return uri;
  }

  // Generate power samples from music blocks (like workout samples)
  function generateSamplesFromBlocks(music) {
    const intensityToPower = {
      low: 80,
      moderate: 200,
      high: 300
    };

    const blocks = music.blocks || [];
    const samples = [];

    blocks.forEach((block) => {
      const power = intensityToPower[block.intensity] || intensityToPower.moderate;

      // Start of block
      samples.push({
        time: block.start_seconds,
        power: power
      });

      // End of block
      samples.push({
        time: block.end_seconds,
        power: power
      });
    });

    // Sort by time and ensure we have start/end
    samples.sort((a, b) => a.time - b.time);

    if (samples.length === 0 || samples[0].time > 0) {
      samples.unshift({ time: 0, power: 0 });
    }

    const maxTime = music.duration_seconds || 300;
    if (samples[samples.length - 1].time < maxTime) {
      samples.push({ time: maxTime, power: 0 });
    }

    return samples;
  }

  function setupSpotifyEmbed() {
    const spotifyEmbed = document.getElementById("spotifyEmbed");
    const spotifyEmbedWrap = document.getElementById("spotifyEmbedWrap");

    console.log("=== setupSpotifyEmbed ===");
    console.log("spotifyUri:", spotifyUri);
    console.log("spotifyApiReady:", spotifyApiReady);
    console.log("window.SpotifyIframeAPI:", !!window.SpotifyIframeAPI);
    console.log("spotifyEmbed element:", !!spotifyEmbed);
    console.log("spotifyEmbedWrap element:", !!spotifyEmbedWrap);

    // Validações
    if (!spotifyUri) {
      console.log("❌ SEM URI SPOTIFY");
      if (spotifyEmbedWrap) spotifyEmbedWrap.classList.add("hidden");
      return;
    }

    if (!window.SpotifyIframeAPI) {
      console.log("⏳ SPOTIFY API NÃO CARREGOU");
      if (spotifyEmbedWrap) spotifyEmbedWrap.classList.add("hidden");
      return;
    }

    if (!spotifyEmbed) {
      console.log("❌ ELEMENTO SPOTIFYEMBED NÃO ENCONTRADO");
      return;
    }

    // Mostrar wrap
    if (spotifyEmbedWrap) {
      spotifyEmbedWrap.classList.remove("hidden");
      console.log("✅ Wrap removido de hidden");
    }

    // Limpar conteúdo anterior
    spotifyEmbed.innerHTML = "";
    console.log("✅ Conteúdo anterior limpo");

    // Criar controller
    console.log("🎵 Criando controller com URI:", spotifyUri);
    try {
      window.SpotifyIframeAPI.createController(
        spotifyEmbed,
        { width: "100%", height: 152, uri: spotifyUri },
        (controller) => {
          spotifyController = controller;
          console.log("✅ CONTROLLER CRIADO COM SUCESSO!");
        }
      );
    } catch (error) {
      console.error("❌ ERRO ao criar controller:", error);
    }
  }

  function stopPlayback() {
    if (playbackTimer) {
      clearInterval(playbackTimer);
      playbackTimer = null;
    }
  }

  function updatePlaybackUI() {
    if (!currentDetailChart) return;

    if (currentMusicSamples.length > 0) {
      // Find current sample
      const currentSample = getInterpolatedSample(playbackSeconds);
      window.BCCharts.setPlaybackPosition(currentDetailChart, currentSample);
      currentDetailChart.update();
    }
  }

  function getInterpolatedSample(seconds) {
    if (!currentMusicSamples.length) return null;

    if (currentMusicSamples.length === 1) {
      return { x: currentMusicSamples[0].time ?? 0, y: currentMusicSamples[0].power ?? 0 };
    }

    const firstTime = currentMusicSamples[0].time ?? 0;
    const last = currentMusicSamples[currentMusicSamples.length - 1];
    if (seconds <= firstTime) return { x: seconds, y: currentMusicSamples[0].power ?? 0 };
    if (seconds >= (last.time ?? 0)) return { x: seconds, y: last.power ?? 0 };

    for (let i = 0; i < currentMusicSamples.length - 1; i += 1) {
      const current = currentMusicSamples[i];
      const next = currentMusicSamples[i + 1];
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

  // ============ MODAL CONTROLS ============

  window.closeMusicModal = function () {
    musicModal.classList.add("hidden");
    musicForm.reset();
    currentEditingMusicId = null;
    blocksContainer.innerHTML = "";
    document.getElementById("musicId").value = "";
  };

  // ============ TIME FORMAT UTILITIES ============

  function secondsToMMSS(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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
    return minutes * 60 + seconds;
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
        input.value = secondsToMMSS(totalSeconds);
      });
    });
  }

  window.closeMusicDetailModal = function () {
    stopPlayback();
    playbackSeconds = 0;
    const playBtn = document.getElementById("playMusicBtn");
    if (playBtn) {
      playBtn.innerHTML = '<i class="fi fi-rr-play"></i> Play';
    }

    musicDetailModal.classList.add("hidden");
    if (currentDetailChart) {
      currentDetailChart.destroy();
      currentDetailChart = null;
    }
    spotifyController = null;
    spotifyUri = "";
  };

  function openAddMusicModal() {
    document.getElementById("modalTitle").textContent = "Adicionar Nova Música";
    currentEditingMusicId = null;
    musicForm.reset();
    blocksContainer.innerHTML = "";
    document.getElementById("musicId").value = "";
    addBlockRow(); // Add one empty block
    musicModal.classList.remove("hidden");
    
    // Attach time field formatting after modal is visible
    setTimeout(() => {
      attachTimeFieldFormatting(musicModal);
    }, 0);
  }

  // ============ BLOCK MANAGEMENT ============

  function addBlockRow(blockData = null) {
    const blockId = `block-${Date.now()}-${Math.random()}`;
    const blockDiv = document.createElement("div");
    blockDiv.className = "block-row";
    blockDiv.dataset.blockId = blockId;

    const start = blockData?.start_seconds || 0;
    const end = blockData?.end_seconds || 30;
    const intensity = blockData?.intensity || "";
    const position = blockData?.position || "sentado";
    const loadLevel = blockData?.load_level || "medium";

    blockDiv.innerHTML = `
      <div class="block-inputs">
        <input type="text" class="block-start clock-field" inputmode="numeric" placeholder="mm:ss" value="${secondsToMMSS(start)}" required>
        <input type="text" class="block-end clock-field" inputmode="numeric" placeholder="mm:ss" value="${secondsToMMSS(end)}" required>
        <input type="text" class="block-intensity" placeholder="Intensidade" value="${intensity}" required>
        <select class="block-position" required>
          <option value="">Posição</option>
          <option value="sentado" ${position === "sentado" ? "selected" : ""}>Sentado</option>
          <option value="em_pe" ${position === "em_pe" ? "selected" : ""}>Em Pé</option>
        </select>
        <select class="block-load" required>
          <option value="">Carga</option>
          <option value="light" ${loadLevel === "light" ? "selected" : ""}>Leve</option>
          <option value="medium" ${loadLevel === "medium" ? "selected" : ""}>Média</option>
          <option value="heavy" ${loadLevel === "heavy" ? "selected" : ""}>Pesada</option>
        </select>
        <button type="button" class="block-remove-btn" onclick="removeBlockRow('${blockId}')">
          <i class="fi fi-rr-trash"></i>
        </button>
      </div>
    `;

    blocksContainer.appendChild(blockDiv);
    
    // Attach time field formatting to new block inputs
    attachTimeFieldFormatting(blockDiv);
  }

  window.removeBlockRow = function (blockId) {
    const blockDiv = document.querySelector(`[data-block-id="${blockId}"]`);
    if (blockDiv) {
      blockDiv.remove();
    }
  };

  // ============ FORM HANDLING ============

  async function handleSaveMusicForm(e) {
    e.preventDefault();

    try {
      const formData = new FormData(musicForm);
      const blocks = Array.from(blocksContainer.querySelectorAll(".block-row")).map((blockRow) => ({
        start_seconds: parseClockValue(blockRow.querySelector(".block-start").value),
        end_seconds: parseClockValue(blockRow.querySelector(".block-end").value),
        intensity: blockRow.querySelector(".block-intensity").value,
        position: blockRow.querySelector(".block-position").value,
        load_level: blockRow.querySelector(".block-load").value
      }));

      const durationMMSS = formData.get("duration_mmss").trim();
      const durationSeconds = parseClockValue(durationMMSS);

      if (durationSeconds === 0) {
        alert("Duração inválida. Use o formato mm:ss (ex: 04:30)");
        return;
      }

      const payload = {
        id: formData.get("id") || currentEditingMusicId || null,
        title: formData.get("title").trim(),
        artist: formData.get("artist").trim() || null,
        spotify_url: formData.get("spotify_url").trim() || null,
        duration_seconds: durationSeconds,
        blocks: blocks
      };

      if (!payload.title) {
        alert("Adicione um nome para a música");
        return;
      }

      if (!blocks.length) {
        alert("Adicione pelo menos um bloco de intensidade");
        return;
      }

      statusMessage.textContent = "Salvando música...";

      const music = await window.BCApi.addMusicToLibrary(payload);

      statusMessage.textContent = "Música salva com sucesso!";
      closeMusicModal();
      await loadMusicLibrary();
    } catch (error) {
      console.error("Erro ao salvar música:", error);
      statusMessage.textContent = `Erro ao salvar: ${error.message}`;
    }
  }

  // ============ MUSIC LIST ============

  async function loadMusicLibrary() {
    try {
      statusMessage.textContent = "Carregando músicas...";
      allMusics = await window.BCApi.getMusicLibrary();

      if (!allMusics.length) {
        musicList.innerHTML = `
          <div class="empty-state">
            <p>Nenhuma música na biblioteca.</p>
            <p>Crie uma nova música para começar!</p>
          </div>
        `;
        statusMessage.textContent = "";
        return;
      }

      musicList.innerHTML = "";

      allMusics.forEach((music) => {
        const musicCard = document.createElement("div");
        musicCard.className = "music-card";

        const duration = formatTime(music.duration_seconds);
        const artist = music.artist || "Artista desconhecido";

        musicCard.innerHTML = `
          <div class="music-card-header">
            <h3>${music.title}</h3>
            <p class="music-artist">${artist}</p>
          </div>
          <div class="music-card-info">
            <span class="music-duration"><i class="fi fi-rr-clock"></i> ${duration}</span>
            <span class="music-blocks-count"><i class="fi fi-rr-layers"></i> ${music.blocks?.length || 0} blocos</span>
          </div>
          <div class="music-card-actions">
            <button class="button-primary" onclick="openMusicDetail(${music.id})">
              <i class="fi fi-rr-eye"></i> Visualizar
            </button>
          </div>
        `;

        musicList.appendChild(musicCard);
      });

      statusMessage.textContent = `${allMusics.length} música(s) na biblioteca`;
    } catch (error) {
      console.error("Erro ao carregar biblioteca:", error);
      statusMessage.textContent = `Erro ao carregar: ${error.message}`;
    }
  }

  // ============ MUSIC DETAIL ============

  window.openMusicDetail = async function (musicId) {
    try {
      console.log("\n=== INITANDO OPENMUSIC DETAIL ===");
      stopPlayback();
      playbackSeconds = 0;

      const music = allMusics.find((m) => m.id === musicId);
      if (!music) {
        alert("Música não encontrada");
        return;
      }

      console.log("📂 Música encontrada:", {
        id: music.id,
        title: music.title,
        spotify_url: music.spotify_url,
        blocks: music.blocks?.length || 0
      });

      currentEditingMusicId = musicId;

      document.getElementById("detailMusicTitle").textContent = music.title;
      document.getElementById("detailMusicArtist").textContent = music.artist || "Desconhecido";
      document.getElementById("detailMusicDuration").textContent = formatTime(music.duration_seconds);

      // Create chart using same createPowerChart as workout
      if (currentDetailChart) {
        currentDetailChart.destroy();
        currentDetailChart = null;
      }

      const chartCanvas = document.getElementById("musicDetailChart");
      currentDetailChart = window.BCCharts.createPowerChart(chartCanvas);

      // Generate samples from blocks
      currentMusicSamples = generateSamplesFromBlocks(music);

      // Update chart with samples
      window.BCCharts.updatePowerChart(currentDetailChart, currentMusicSamples);

      // Setup Spotify
      spotifyController = null;
      spotifyUri = getSpotifyUri(music.spotify_url);
      console.log("🎵 SPOTIFY URL RAW:", music.spotify_url);
      console.log("🎵 SPOTIFY URI PARSED:", spotifyUri);
      
      // Delay para garantir que o modal esteja visível antes de setup do Spotify
      musicDetailModal.classList.remove("hidden");
      
      setTimeout(() => {
        console.log("⏱️ Chamando setupSpotifyEmbed após delay...");
        console.log("Estado atual:", {
          spotifyUri: spotifyUri,
          spotifyApiReady: spotifyApiReady,
          hasSpotifyAPI: !!window.SpotifyIframeAPI
        });
        setupSpotifyEmbed();
      }, 200);

      updatePlaybackUI();
    } catch (error) {
      console.error("Erro ao abrir detalhe:", error);
      alert("Erro ao carregar música: " + error.message);
    }
  };

  function handleEditMusic() {
    if (!currentEditingMusicId) return;

    const music = allMusics.find((m) => m.id === currentEditingMusicId);
    if (!music) {
      alert("Música não encontrada");
      return;
    }

    closeMusicDetailModal();

    document.getElementById("modalTitle").textContent = "Editar Música";
    document.getElementById("musicId").value = music.id;
    document.getElementById("musicTitle").value = music.title;
    document.getElementById("musicArtist").value = music.artist || "";
    document.getElementById("musicSpotifyUrl").value = music.spotify_url || "";
    document.getElementById("musicDuration").value = secondsToMMSS(music.duration_seconds);

    blocksContainer.innerHTML = "";

    if (music.blocks && music.blocks.length) {
      music.blocks.forEach((block) => {
        addBlockRow(block);
      });
    } else {
      addBlockRow();
    }

    musicModal.classList.remove("hidden");
    
    // Attach time field formatting after modal is visible
    setTimeout(() => {
      attachTimeFieldFormatting(musicModal);
    }, 0);
  }

  async function handleDeleteMusic() {
    if (!currentEditingMusicId) return;

    const music = allMusics.find((m) => m.id === currentEditingMusicId);
    if (!music) return;

    if (!confirm(`Tem certeza que deseja deletar a música "${music.title}"?`)) {
      return;
    }

    try {
      statusMessage.textContent = "Deletando...";
      await window.BCApi.deleteMusicFromLibrary(currentEditingMusicId);
      statusMessage.textContent = "Música deletada com sucesso!";
      closeMusicDetailModal();
      await loadMusicLibrary();
    } catch (error) {
      console.error("Erro ao deletar:", error);
      statusMessage.textContent = `Erro ao deletar: ${error.message}`;
    }
  }

  function handlePlayMusic() {
    const playBtn = document.getElementById("playMusicBtn");
    
    if (!currentMusicSamples.length) {
      alert("Nenhuma amostra para reproduzir");
      return;
    }

    const maxTime = currentMusicSamples[currentMusicSamples.length - 1].time ?? 0;

    // Toggle play/pause
    if (playbackTimer) {
      console.log("⏸️ Pausando música");
      stopPlayback();
      
      // Pausar Spotify
      if (spotifyController) {
        try {
          spotifyController.togglePlay().catch(err => console.warn("Erro ao pausar Spotify:", err));
        } catch (error) {
          console.warn("Erro ao pausar Spotify:", error);
        }
      }
      
      playBtn.innerHTML = '<i class="fi fi-rr-play"></i> Play';
      return;
    }

    console.log("▶️ Iniciando reprodução");
    playBtn.innerHTML = '<i class="fi fi-rr-pause"></i> Pause';

    // Tentar fazer play no Spotify
    if (spotifyController) {
      console.log("🎵 Tocando no Spotify...");
      try {
        spotifyController.togglePlay().catch(err => console.warn("Erro ao dar play Spotify:", err));
      } catch (error) {
        console.warn("Erro ao dar play Spotify:", error);
      }
    }

    // Animar cursor no gráfico
    const frameMS = 50;
    const fps = 1000 / frameMS;
    const secondsPerFrame = 1 / fps;

    playbackTimer = setInterval(() => {
      playbackSeconds += secondsPerFrame;

      if (playbackSeconds >= maxTime) {
        playbackSeconds = maxTime;
        stopPlayback();
        playBtn.innerHTML = '<i class="fi fi-rr-play"></i> Play';
        
        // Pausar Spotify ao finalizar
        if (spotifyController) {
          try {
            spotifyController.togglePlay().catch(err => console.warn("Erro ao pausar Spotify:", err));
          } catch (error) {
            console.warn("Erro ao pausar Spotify:", error);
          }
        }
        
        updatePlaybackUI();
        return;
      }

      updatePlaybackUI();
    }, frameMS);
  }

  function closeMusicDetailModalReset() {
    stopPlayback();
    playbackSeconds = 0;
    const playBtn = document.getElementById("playMusicBtn");
    if (playBtn) {
      playBtn.innerHTML = '<i class="fi fi-rr-play"></i> Play';
    }
  }

  // ============ UTILITIES ============

  function formatTime(seconds) {
    if (!seconds) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  // ============ INIT ============

  console.log("🎵 Music Library iniciando...");
  console.log("✅ window.SpotifyIframeAPI disponível?", !!window.SpotifyIframeAPI);
  console.log("✅ spotifyApiReady?", spotifyApiReady);
  console.log("✅ Elementos HTML encontrados?", {
    musicModal: !!musicModal,
    musicDetailModal: !!musicDetailModal,
    spotifyEmbed: !!document.getElementById("spotifyEmbed"),
    spotifyEmbedWrap: !!document.getElementById("spotifyEmbedWrap"),
    playMusicBtn: !!document.getElementById("playMusicBtn")
  });
  
  loadMusicLibrary();
})();
