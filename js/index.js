(function () {
  const statusMessage = document.getElementById("statusMessage");
  const openLatestEditLink = document.getElementById("openLatestEditLink");
  const openLatestViewLink = document.getElementById("openLatestViewLink");
  const totalWorkoutsValue = document.getElementById("totalWorkoutsValue");
  const averageIntensityValue = document.getElementById("averageIntensityValue");
  const averageDurationValue = document.getElementById("averageDurationValue");
  const totalPedaledValue = document.getElementById("totalPedaledValue");

  function formatDuration(totalSeconds) {
    const safe = Math.max(0, Math.round(Number(totalSeconds) || 0));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${String(minutes).padStart(2, "0")}min`;
    }

    return `${minutes}min`;
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
    const numeric = Number(String(value || "").replace(",", "."));

    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.max(1, Math.min(5, numeric));
    }

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

    return map[normalized] ?? 0;
  }

  function getIntensityLabel(level) {
    if (level >= 4.5) return "Zona 5";
    if (level >= 3.5) return "Zona 4";
    if (level >= 2.5) return "Zona 3";
    if (level >= 1.5) return "Zona 2";
    if (level > 0) return "Zona 1";
    return "Sem dados";
  }

  function buildWorkoutDurationMap(workouts, musics, blocks) {
    const durationByWorkoutId = new Map(workouts.map((workout) => [workout.id, 0]));

    musics.forEach((music) => {
      const current = durationByWorkoutId.get(music.workout_id) || 0;
      durationByWorkoutId.set(music.workout_id, current + Math.max(0, Number(music.duration_seconds) || 0));
    });

    const blockDurationByWorkoutId = new Map();
    blocks.forEach((block) => {
      const blockDuration = Math.max(0, (Number(block.end_seconds) || 0) - (Number(block.start_seconds) || 0));
      const current = blockDurationByWorkoutId.get(block.workout_id) || 0;
      blockDurationByWorkoutId.set(block.workout_id, current + blockDuration);
    });

    workouts.forEach((workout) => {
      const musicDuration = durationByWorkoutId.get(workout.id) || 0;
      const blockDuration = blockDurationByWorkoutId.get(workout.id) || 0;

      if (musicDuration <= 0 && blockDuration > 0) {
        durationByWorkoutId.set(workout.id, blockDuration);
      }
    });

    return durationByWorkoutId;
  }

  function calculateWeightedAverageIntensity(blocks) {
    let weightedTotal = 0;
    let durationTotal = 0;

    blocks.forEach((block) => {
      const duration = Math.max(0, (Number(block.end_seconds) || 0) - (Number(block.start_seconds) || 0));
      const intensityLevel = getIntensityLevel(block.intensity);

      if (duration > 0 && intensityLevel > 0) {
        weightedTotal += intensityLevel * duration;
        durationTotal += duration;
      }
    });

    if (durationTotal === 0) {
      return 0;
    }

    return weightedTotal / durationTotal;
  }

  async function loadDashboard() {
    const [workouts, musics, blocks] = await Promise.all([
      window.BCApi.getAllWorkouts(),
      window.BCApi.getAllWorkoutMusic(),
      window.BCApi.getAllWorkoutBlocks()
    ]);

    if (workouts.length) {
      const latestWorkout = workouts[0];
      openLatestEditLink.href = `edit_workout.html?id=${latestWorkout.id}`;
      openLatestViewLink.href = `workout.html?id=${latestWorkout.id}`;
      openLatestEditLink.classList.remove("hidden");
      openLatestViewLink.classList.remove("hidden");
      statusMessage.textContent = `Ultimo treino: ${latestWorkout.name || `#${latestWorkout.id}`}`;
    } else {
      statusMessage.textContent = "Nenhum treino encontrado ainda.";
    }

    const durationByWorkoutId = buildWorkoutDurationMap(workouts, musics, blocks);
    const totalWorkouts = workouts.length;
    const totalPedaledSeconds = Array.from(durationByWorkoutId.values()).reduce((sum, seconds) => sum + seconds, 0);
    const averageDurationSeconds = totalWorkouts > 0 ? totalPedaledSeconds / totalWorkouts : 0;
    const averageIntensity = calculateWeightedAverageIntensity(blocks);

    totalWorkoutsValue.textContent = String(totalWorkouts);
    averageIntensityValue.textContent = getIntensityLabel(averageIntensity);
    averageDurationValue.textContent = formatDuration(averageDurationSeconds);
    totalPedaledValue.textContent = formatDuration(totalPedaledSeconds);
  }

  loadDashboard().catch((error) => {
    console.error(error);
    statusMessage.textContent = `Falha ao carregar dashboard: ${error.message}`;
    totalWorkoutsValue.textContent = "--";
    averageIntensityValue.textContent = "--";
    averageDurationValue.textContent = "--";
    totalPedaledValue.textContent = "--";
  });
})();
