import { createCinemas, createMovies } from './services.js';

/**
 * Sample data from the brief ("not an official watch guide"), plus the four
 * cinemas used in the booking examples. Only inserted into an empty store.
 */
export function seedDemoData(store) {
  const { movies, cinemas } = store.read();
  if (movies.length > 0 || cinemas.length > 0) return false;

  // Prerequisites are ids, and ids are assigned in creation order (1, 2, 3...).
  createMovies(store, [
    { title: 'Iron Man', releaseYear: 2008, runtime: 126 }, // 1
    { title: 'Captain America: The First Avenger', releaseYear: 2011, runtime: 124 }, // 2
    { title: 'The Avengers', releaseYear: 2012, runtime: 143, prerequisites: [1, 2] }, // 3
    { title: 'Captain America: Civil War', releaseYear: 2016, runtime: 147, prerequisites: [3] }, // 4
    { title: 'Thor: Ragnarok', releaseYear: 2017, runtime: 130 }, // 5
    { title: 'Avengers: Infinity War', releaseYear: 2018, runtime: 149, prerequisites: [4, 5] }, // 6
    { title: 'Avengers: Endgame', releaseYear: 2019, runtime: 181, prerequisites: [6] }, // 7
    { title: 'Avengers: Doomsday', releaseYear: 2026, runtime: 150, prerequisites: [7] }, // 8
  ]);

  createCinemas(store, [
    { name: 'Starlight Multiplex', bundleSizes: [1, 3, 4] },
    { name: 'Grand Premiere', bundleSizes: [2, 5] },
    { name: 'Metro Cineplex', bundleSizes: [6, 9, 20] },
    { name: 'Corner Screen', bundleSizes: [4, 6] },
  ]);

  return true;
}
