(function () {
  const statusMessage = document.getElementById("statusMessage");
  const openLatestEditLink = document.getElementById("openLatestEditLink");
  const openLatestViewLink = document.getElementById("openLatestViewLink");
  const chart = window.BCCharts.createPowerChart(document.getElementById("powerChart"));

  async function loadDashboard() {
    const workouts = await window.BCApi.getRecentWorkouts();

    if (workouts.length) {
      const latestWorkout = workouts[0];
      openLatestEditLink.href = `edit_workout.html?id=${latestWorkout.id}`;
      openLatestViewLink.href = `workout.html?id=${latestWorkout.id}`;
      openLatestEditLink.classList.remove("hidden");
      openLatestViewLink.classList.remove("hidden");

      const latestSamples = await window.BCApi.getWorkoutSamples(latestWorkout.id);
      window.BCCharts.updatePowerChart(chart, latestSamples);
      statusMessage.textContent = `Ultimo treino: ${latestWorkout.name || `#${latestWorkout.id}`}`;
    } else {
      statusMessage.textContent = "Nenhum treino encontrado ainda.";
    }
  }

  loadDashboard().catch((error) => {
    console.error(error);
    statusMessage.textContent = `Falha ao carregar dashboard: ${error.message}`;
  });
})();
