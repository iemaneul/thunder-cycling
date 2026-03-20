(function () {
  const createWorkoutForm = document.getElementById("createWorkoutForm");
  const createWorkoutButton = document.getElementById("createWorkoutButton");
  const createMessage = document.getElementById("createMessage");
  const previewChart = window.BCCharts.createPowerChart(document.getElementById("previewChart"));

  window.BCCharts.updatePowerChart(previewChart, []);

  createWorkoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const formData = new FormData(createWorkoutForm);
      createWorkoutButton.disabled = true;
      createMessage.textContent = "Criando workout...";

      const workout = await window.BCApi.createWorkout({
        name: formData.get("name"),
        spotify_playlist_url: formData.get("spotify_playlist_url") || null
      });

      window.location.href = `workout.html?id=${workout.id}`;
    } catch (error) {
      console.error(error);
      createMessage.textContent = `Nao foi possivel criar o workout: ${error.message}`;
      createWorkoutButton.disabled = false;
    }
  });
})();
