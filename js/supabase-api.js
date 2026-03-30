(function () {
  async function createWorkout(payload) {
    const client = window.BCSupabase.assertSupabase();

    const { data, error } = await client
      .from("workouts")
      .insert(payload)
      .select("id, name, spotify_playlist_url, start_time")
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async function getRecentWorkouts(limit = 8) {
    const client = window.BCSupabase.assertSupabase();

    const { data, error } = await client
      .from("workouts")
      .select("id, name, spotify_playlist_url, start_time")
      .order("start_time", { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async function getAllWorkouts() {
    const client = window.BCSupabase.assertSupabase();

    const { data, error } = await client
      .from("workouts")
      .select("id, name, spotify_playlist_url, start_time")
      .order("start_time", { ascending: false });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async function getWorkoutById(workoutId) {
    const client = window.BCSupabase.assertSupabase();

    const { data, error } = await client
      .from("workouts")
      .select("id, name, spotify_playlist_url, start_time")
      .eq("id", workoutId)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async function updateWorkout(workoutId, payload) {
    const client = window.BCSupabase.assertSupabase();

    const { data, error } = await client
      .from("workouts")
      .update(payload)
      .eq("id", workoutId)
      .select("id, name, spotify_playlist_url, start_time");

    if (error) {
      throw error;
    }

    let workout = Array.isArray(data) ? data[0] : data;

    if (!workout) {
      const { data: fallbackData, error: fallbackError } = await client
        .from("workouts")
        .select("id, name, spotify_playlist_url, start_time")
        .eq("id", workoutId)
        .maybeSingle();

      if (fallbackError) {
        throw fallbackError;
      }

      workout = fallbackData;
    }

    if (!workout) {
      throw new Error("Nao foi possivel localizar o treino apos salvar.");
    }

    return workout;
  }

  async function getWorkoutSamples(workoutId) {
    const client = window.BCSupabase.assertSupabase();

    const { data, error } = await client
      .from("workout_data")
      .select("id, workout_id, time, power, cadence, heart_rate, speed")
      .eq("workout_id", workoutId)
      .order("time", { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async function addWorkoutSample(sample) {
    const client = window.BCSupabase.assertSupabase();

    const { data, error } = await client
      .from("workout_data")
      .insert(sample)
      .select("id, workout_id, time, power, cadence, heart_rate, speed")
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async function getWorkoutMusic(workoutId) {
    const client = window.BCSupabase.assertSupabase();

    const { data, error } = await client
      .from("workout_music")
      .select("id, workout_id, title, artist, duration_seconds, music_order, is_active")
      .eq("workout_id", workoutId)
      .eq("is_active", true)
      .order("music_order", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async function getAllWorkoutMusic() {
    const client = window.BCSupabase.assertSupabase();

    const { data, error } = await client
      .from("workout_music")
      .select("id, workout_id, title, artist, duration_seconds, music_order, is_active")
      .eq("is_active", true)
      .order("workout_id", { ascending: true })
      .order("music_order", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async function getMusicBlocksByMusicId(musicId) {
    const client = window.BCSupabase.assertSupabase();

    const { data, error } = await client
      .from("workout_music_blocks")
      .select("id, music_id, start_seconds, end_seconds, intensity, position, load_level")
      .eq("music_id", musicId)
      .order("start_seconds", { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async function getAllWorkoutBlocks() {
    const client = window.BCSupabase.assertSupabase();

    const { data, error } = await client
      .from("workout_music_blocks")
      .select("id, workout_id, music_id, start_seconds, end_seconds, intensity, position, load_level")
      .order("workout_id", { ascending: true })
      .order("music_id", { ascending: true })
      .order("start_seconds", { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async function saveWorkoutMusicWithBlocks(payload) {
    const client = window.BCSupabase.assertSupabase();
    const musicPayload = {
      workout_id: payload.workout_id,
      title: payload.title,
      artist: payload.artist,
      duration_seconds: payload.duration_seconds,
      music_order: payload.music_order,
      is_active: true
    };

    let music;

    if (payload.id) {
      const { data, error } = await client
        .from("workout_music")
        .update(musicPayload)
        .eq("id", payload.id)
        .select("id, workout_id, title, artist, duration_seconds, music_order, is_active");

      if (error) {
        throw error;
      }

      music = Array.isArray(data) ? data[0] : data;

      if (!music) {
        const { data: fallbackData, error: fallbackError } = await client
          .from("workout_music")
          .select("id, workout_id, title, artist, duration_seconds, music_order, is_active")
          .eq("id", payload.id)
          .maybeSingle();

        if (fallbackError) {
          throw fallbackError;
        }

        music = fallbackData;
      }

      if (!music) {
        throw new Error("Nao foi possivel localizar a musica apos salvar.");
      }

      const { error: deleteError } = await client
        .from("workout_music_blocks")
        .delete()
        .eq("music_id", music.id);

      if (deleteError) {
        throw deleteError;
      }
    } else {
      const { data, error } = await client
        .from("workout_music")
        .insert(musicPayload)
        .select("id, workout_id, title, artist, duration_seconds, music_order, is_active");

      if (error) {
        throw error;
      }

      music = Array.isArray(data) ? data[0] : data;

      if (!music) {
        const { data: fallbackList, error: fallbackError } = await client
          .from("workout_music")
          .select("id, workout_id, title, artist, duration_seconds, music_order, is_active")
          .eq("workout_id", payload.workout_id)
          .eq("title", payload.title)
          .order("id", { ascending: false })
          .limit(1);

        if (fallbackError) {
          throw fallbackError;
        }

        music = Array.isArray(fallbackList) ? fallbackList[0] : fallbackList;
      }

      if (!music) {
        throw new Error("Nao foi possivel criar a musica.");
      }
    }

    if (payload.blocks && payload.blocks.length) {
      const blockRows = payload.blocks.map((block) => ({
        music_id: music.id,
        workout_id: payload.workout_id,
        start_time: block.start_seconds,
        end_time: block.end_seconds,
        start_seconds: block.start_seconds,
        end_seconds: block.end_seconds,
        intensity: block.intensity,
        position: block.position,
        load_label: block.load_level,
        load_level: block.load_level
      }));

      const { error: blockError } = await client
        .from("workout_music_blocks")
        .insert(blockRows);

      if (blockError) {
        throw blockError;
      }
    }

    return music;
  }

  async function deactivateWorkoutMusic(musicId) {
    const client = window.BCSupabase.assertSupabase();

    const { error } = await client
      .from("workout_music")
      .update({ is_active: false })
      .eq("id", musicId);

    if (error) {
      throw error;
    }
  }

  // ===== MUSIC LIBRARY FUNCTIONS =====

  async function getMusicLibrary() {
    const client = window.BCSupabase.assertSupabase();

    const { data: musics, error: musicError } = await client
      .from("music_library")
      .select("id, title, artist, duration_seconds, spotify_url, is_active")
      .eq("is_active", true)
      .order("id", { ascending: true });

    if (musicError) {
      throw musicError;
    }

    if (!musics || !musics.length) {
      return [];
    }

    // Fetch blocks for each music
    const musicsWithBlocks = await Promise.all(
      musics.map(async (music) => {
        const { data: blocks, error: blocksError } = await client
          .from("music_library_blocks")
          .select("id, start_seconds, end_seconds, intensity, position, load_level")
          .eq("music_id", music.id)
          .order("start_seconds", { ascending: true });

        if (blocksError) {
          console.error("Erro ao buscar blocos:", blocksError);
          return { ...music, blocks: [] };
        }

        return { ...music, blocks: blocks ?? [] };
      })
    );

    return musicsWithBlocks;
  }

  async function addMusicToLibrary(payload) {
    const client = window.BCSupabase.assertSupabase();

    const musicPayload = {
      title: payload.title,
      artist: payload.artist || null,
      spotify_url: payload.spotify_url || null,
      duration_seconds: payload.duration_seconds,
      is_active: true
    };

    let music;

    if (payload.id) {
      // Update existing music
      const { data, error } = await client
        .from("music_library")
        .update(musicPayload)
        .eq("id", payload.id)
        .select("id, title, artist, duration_seconds, spotify_url, is_active");

      if (error) {
        throw error;
      }

      music = Array.isArray(data) ? data[0] : data;

      if (!music) {
        const { data: fallbackData, error: fallbackError } = await client
          .from("music_library")
          .select("id, title, artist, duration_seconds, spotify_url, is_active")
          .eq("id", payload.id)
          .maybeSingle();

        if (fallbackError) {
          throw fallbackError;
        }

        music = fallbackData;
      }

      if (!music) {
        throw new Error("Não foi possível localizar a música após atualizar.");
      }

      // Delete old blocks
      const { error: deleteError } = await client
        .from("music_library_blocks")
        .delete()
        .eq("music_id", music.id);

      if (deleteError) {
        throw deleteError;
      }
    } else {
      // Create new music
      const { data, error } = await client
        .from("music_library")
        .insert(musicPayload)
        .select("id, title, artist, duration_seconds, spotify_url, is_active");

      if (error) {
        throw error;
      }

      music = Array.isArray(data) ? data[0] : data;

      if (!music) {
        const { data: fallbackList, error: fallbackError } = await client
          .from("music_library")
          .select("id, title, artist, duration_seconds, spotify_url, is_active")
          .eq("title", payload.title)
          .order("id", { ascending: false })
          .limit(1);

        if (fallbackError) {
          throw fallbackError;
        }

        music = Array.isArray(fallbackList) ? fallbackList[0] : fallbackList;
      }

      if (!music) {
        throw new Error("Não foi possível criar a música.");
      }
    }

    // Insert blocks
    if (payload.blocks && payload.blocks.length) {
      const blockRows = payload.blocks.map((block) => ({
        music_id: music.id,
        start_seconds: block.start_seconds,
        end_seconds: block.end_seconds,
        intensity: block.intensity,
        position: block.position,
        load_level: block.load_level
      }));

      const { error: blockError } = await client
        .from("music_library_blocks")
        .insert(blockRows);

      if (blockError) {
        throw blockError;
      }
    }

    return music;
  }

  async function deleteMusicFromLibrary(musicId) {
    const client = window.BCSupabase.assertSupabase();

    // Delete blocks first
    const { error: blockError } = await client
      .from("music_library_blocks")
      .delete()
      .eq("music_id", musicId);

    if (blockError) {
      throw blockError;
    }

    // Then delete the music
    const { error: musicError } = await client
      .from("music_library")
      .delete()
      .eq("id", musicId);

    if (musicError) {
      throw musicError;
    }
  }

  window.BCApi = {
    createWorkout,
    getAllWorkouts,
    getRecentWorkouts,
    getWorkoutById,
    updateWorkout,
    getWorkoutSamples,
    addWorkoutSample,
    getAllWorkoutMusic,
    getWorkoutMusic,
    getAllWorkoutBlocks,
    getMusicBlocksByMusicId,
    saveWorkoutMusicWithBlocks,
    deactivateWorkoutMusic,
    getMusicLibrary,
    addMusicToLibrary,
    deleteMusicFromLibrary
  };
})();
