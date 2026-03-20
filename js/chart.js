(function () {
  const zoneBackgroundPlugin = {
    id: "zoneBackgroundPlugin",
    beforeDraw(chart) {
      const config = chart?.options?.plugins?.zoneBackgroundPlugin;
      const colors = config?.colors || [];
      if (!colors.length || !chart.chartArea) {
        return;
      }

      const { ctx, chartArea } = chart;
      const bandHeight = chartArea.height / colors.length;

      ctx.save();
      colors.forEach((color, index) => {
        ctx.fillStyle = color;
        ctx.fillRect(
          chartArea.left,
          chartArea.top + bandHeight * index,
          chartArea.width,
          bandHeight
        );
      });
      ctx.restore();
    }
  };

  const playbackCursorPlugin = {
    id: "playbackCursorPlugin",
    afterDatasetsDraw(chart) {
      const xValue = chart?.options?.plugins?.playbackCursorPlugin?.xValue;
      if (xValue === null || xValue === undefined || !chart.chartArea) {
        return;
      }

      const { ctx, chartArea, scales } = chart;
      const x = scales.x.getPixelForValue(xValue);
      if (!Number.isFinite(x)) {
        return;
      }

      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 8]);
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    }
  };

  if (window.Chart) {
    window.Chart.register(zoneBackgroundPlugin, playbackCursorPlugin);
  }

  function createPowerChart(canvas) {
    return new Chart(canvas, {
      type: "line",
      data: {
        datasets: [
          {
            data: [],
            borderColor: "#ffffff",
            borderWidth: 5,
            fill: false,
            tension: 0.2,
            pointRadius: 0
          },
          {
            type: "scatter",
            data: [],
            pointRadius: 10,
            pointHoverRadius: 10,
            pointBackgroundColor: "#000000",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            display: false
          },
          zoneBackgroundPlugin: {
            colors: ["#8f1a20", "#98550d", "#d2b22a", "#6aa128", "#2f8db8"]
          },
          playbackCursorPlugin: {
            xValue: null
          }
        },
        scales: {
          x: {
            type: "linear",
            min: 0,
            ticks: {
              color: "#ffffff",
              callback(value) {
                const minutes = Math.floor(value / 60);
                const seconds = String(Math.floor(value % 60)).padStart(2, "0");
                return `${minutes}:${seconds}`;
              }
            },
            grid: {
              color: "rgba(255,255,255,0.15)"
            }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: "#ffffff"
            },
            grid: {
              color: "rgba(255,255,255,0.1)"
            }
          }
        }
      }
    });
  }

  function updatePowerChart(chart, samples) {
    const points = samples.map((sample) => ({
      x: sample.time ?? 0,
      y: sample.power ?? 0
    }));

    const maxX = points.length ? points[points.length - 1].x : 60;
    const maxY = Math.max(100, ...points.map((point) => point.y));

    chart.data.datasets[0].data = points;
    chart.data.datasets[1].data = [];
    chart.options.scales.x.max = Math.max(maxX, 60);
    chart.options.scales.y.max = Math.ceil(maxY * 1.1);
    chart.update();
  }

  function setPlaybackPosition(chart, point) {
    chart.options.plugins.playbackCursorPlugin.xValue = point ? point.x : null;
    chart.data.datasets[1].data = point ? [point] : [];
    chart.update("none");
  }

  window.BCCharts = {
    createPowerChart,
    updatePowerChart,
    setPlaybackPosition
  };
})();
