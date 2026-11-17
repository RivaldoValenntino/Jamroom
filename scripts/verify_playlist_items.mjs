// ============================================================================
// JAMROOM: Playlist & Playlist Items Verification Test Suite
// ============================================================================

import assert from 'node:assert/strict';

console.log('--- TEST 1: CREATING PLAYLIST FOLDER ---');
const playlists = [];
const playlistItemsMap = new Map();

function createPlaylist(name, description = null) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Playlist name cannot be empty');

  const newPl = {
    id: 'pl-' + Math.random().toString(36).slice(2, 9),
    user_id: 'guest-123',
    name: trimmed,
    description,
    is_public: false,
    created_at: new Date().toISOString(),
    item_count: 0
  };
  playlists.unshift(newPl);
  playlistItemsMap.set(newPl.id, []);
  return newPl;
}

const myPlaylist = createPlaylist('Synthwave Retrowave 80s', 'Top driving tracks');
assert.equal(myPlaylist.name, 'Synthwave Retrowave 80s');
assert.equal(playlists.length, 1);
console.log('✓ Created playlist folder:', myPlaylist.name);

console.log('\n--- TEST 2: ADDING PLAYLIST ITEMS ---');
function addTrackToPlaylist(input) {
  const pl = playlists.find((p) => p.id === input.playlistId);
  if (!pl) throw new Error('Playlist not found');

  const items = playlistItemsMap.get(input.playlistId) || [];
  const newItem = {
    id: 'item-' + Math.random().toString(36).slice(2, 9),
    playlist_id: input.playlistId,
    song_id: 'song-' + input.youtubeId,
    position: items.length + 1,
    song: {
      id: 'song-' + input.youtubeId,
      youtube_id: input.youtubeId,
      title: input.title,
      artist_channel: input.artistChannel,
      duration_seconds: input.durationSeconds,
      thumbnail_url: input.thumbnailUrl
    }
  };

  items.push(newItem);
  playlistItemsMap.set(input.playlistId, items);
  pl.item_count = items.length;
  return newItem;
}

const item1 = addTrackToPlaylist({
  playlistId: myPlaylist.id,
  youtubeId: '4xDzrJKXOOY',
  title: 'SYNTHWAVE RADIO - chill synth / retro beats',
  artistChannel: 'Lofi Girl',
  durationSeconds: 3600,
  thumbnailUrl: 'https://img.youtube.com/vi/4xDzrJKXOOY/hqdefault.jpg'
});

const item2 = addTrackToPlaylist({
  playlistId: myPlaylist.id,
  youtubeId: 'er416SiMxR0',
  title: 'Carpenter Brut - Turbo Killer',
  artistChannel: 'NoQuarterProd',
  durationSeconds: 255,
  thumbnailUrl: 'https://img.youtube.com/vi/er416SiMxR0/hqdefault.jpg'
});

assert.equal(myPlaylist.item_count, 2);
assert.equal(item1.position, 1);
assert.equal(item2.position, 2);
console.log('✓ Successfully added 2 items to playlist folder.');

console.log('\n--- TEST 3: FETCHING PLAYLIST ITEMS ---');
function fetchPlaylistItems(playlistId) {
  return playlistItemsMap.get(playlistId) || [];
}

const fetchedItems = fetchPlaylistItems(myPlaylist.id);
assert.equal(fetchedItems.length, 2);
assert.equal(fetchedItems[0].song.youtube_id, '4xDzrJKXOOY');
assert.equal(fetchedItems[1].song.title, 'Carpenter Brut - Turbo Killer');
console.log('✓ Fetched playlist items with full song metadata and order.');

console.log('\n--- TEST 4: REMOVING PLAYLIST ITEM ---');
function removePlaylistItem(playlistId, itemId) {
  const pl = playlists.find((p) => p.id === playlistId);
  if (!pl) throw new Error('Playlist not found');

  let items = playlistItemsMap.get(playlistId) || [];
  items = items.filter((i) => i.id !== itemId);
  playlistItemsMap.set(playlistId, items);
  pl.item_count = items.length;
}

removePlaylistItem(myPlaylist.id, item1.id);
const itemsAfterDelete = fetchPlaylistItems(myPlaylist.id);
assert.equal(itemsAfterDelete.length, 1);
assert.equal(myPlaylist.item_count, 1);
assert.equal(itemsAfterDelete[0].song.youtube_id, 'er416SiMxR0');
console.log('✓ Removed track item from playlist; count decremented to 1.');

console.log('\n--- TEST 5: IMPORTING PLAYLIST TO ROOM QUEUE ---');
const roomQueue = [];
function importPlaylistToRoom(roomId, playlistId) {
  const items = fetchPlaylistItems(playlistId);
  for (const item of items) {
    roomQueue.push({
      id: 'qi-' + Math.random().toString(36).slice(2, 9),
      room_id: roomId,
      song_id: item.song_id,
      song: item.song,
      position: (roomQueue.length + 1) * 1000,
      status: 'queued'
    });
  }
  return items.length;
}

const importedCount = importPlaylistToRoom('room-alpha', myPlaylist.id);
assert.equal(importedCount, 1);
assert.equal(roomQueue.length, 1);
assert.equal(roomQueue[0].song.title, 'Carpenter Brut - Turbo Killer');
console.log('✓ Imported playlist items directly into collaborative lounge queue.');

console.log('\n--- TEST 6: DELETING PLAYLIST FOLDER ---');
function deletePlaylist(playlistId) {
  const index = playlists.findIndex((p) => p.id === playlistId);
  if (index !== -1) playlists.splice(index, 1);
  playlistItemsMap.delete(playlistId);
}

deletePlaylist(myPlaylist.id);
assert.equal(playlists.length, 0);
assert.equal(fetchPlaylistItems(myPlaylist.id).length, 0);
console.log('✓ Deleted playlist folder and cascaded item clean-up.');

console.log('\n============================================================');
console.log('ALL 6 PLAYLIST ITEMS ACCEPTANCE TESTS PASSED!');
console.log('============================================================');
