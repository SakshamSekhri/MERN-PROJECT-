import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { config } from '../backend/config.js';
import { Artwork, User, defaultUsername } from '../backend/models/index.js';
import { encodeGrid } from '../frontend/js/core/codec.js';
import { frozenProject, projectThumbnail } from '../backend/projectSnapshot.js';

const SIZE = 32;
const SAMPLE_EMAIL = 'examples@pixelverse.local';
const S = {
  ink: '#19172c', white: '#e8e4f5', gold: '#fbbf24', orange: '#fb923c',
  pink: '#ff2e88', coral: '#f43f5e', purple: '#a855f7', cyan: '#22d3ee',
  blue: '#3b82f6', green: '#22c55e', lime: '#a3e635', teal: '#14b8a6',
};

function sheet(background) {
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(background));
  const dot = (x, y, color) => {
    if (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < SIZE && y < SIZE) grid[y][x] = color;
  };
  const box = (x1, y1, x2, y2, color) => {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) dot(x, y, color);
  };
  const line = (x1, y1, x2, y2, color) => {
    let dx = Math.abs(x2 - x1), sx = x1 < x2 ? 1 : -1;
    let dy = -Math.abs(y2 - y1), sy = y1 < y2 ? 1 : -1;
    let error = dx + dy;
    while (true) {
      dot(x1, y1, color);
      if (x1 === x2 && y1 === y2) break;
      const e = 2 * error;
      if (e >= dy) { error += dy; x1 += sx; }
      if (e <= dx) { error += dx; y1 += sy; }
    }
  };
  const disc = (cx, cy, radius, color) => {
    for (let y = cy - radius; y <= cy + radius; y++) for (let x = cx - radius; x <= cx + radius; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) dot(x, y, color);
    }
  };
  const stars = (points, color = S.white) => points.forEach(([x, y]) => dot(x, y, color));
  return { grid, dot, box, line, disc, stars };
}

function moonlitCamp(frame = 0) {
  const a = sheet('#21203e'); const { box, line, disc, stars } = a;
  box(0, 18, 31, 31, '#273b49'); box(0, 25, 31, 31, '#325d46');
  for (let x = 0; x < 32; x++) {
    const ridge = 17 + Math.abs(x - 10) / 3 | 0;
    box(x, ridge, x, 24, '#394b58');
  }
  disc(24, 7, 4, '#f7b45e'); disc(25, 6, 3, '#21203e');
  stars([[3, 4], [8, 8], [15, 3], [19, 12], [29, 13], [5, 13]]);
  for (let x = 0; x < 32; x += 2) a.dot(x, 29 + x % 3, '#4a7950');
  line(7, 25, 14, 16, '#241e2b'); line(14, 16, 21, 25, '#241e2b');
  for (let y = 18; y <= 25; y++) box(14 - Math.floor((y - 16) * .75), y, 14 + Math.floor((y - 16) * .75), y, '#e88d30');
  line(14, 18, 14, 25, '#fbbf24'); box(12, 22, 14, 25, '#423245');
  box(23, 27, 28, 27, '#674638'); box(24, 26, 27, 26, '#674638');
  box(25, 23 - frame, 26, 26, '#fb923c'); box(25, 22 - frame, 25, 23 - frame, '#fbbf24');
  return a.grid;
}

function bakery() {
  const a = sheet('#5c607e'); const { box, line, disc } = a;
  box(0, 23, 31, 31, '#927068'); box(0, 27, 31, 31, '#534c5a');
  disc(24, 6, 4, '#f7b45e'); box(2, 9, 29, 24, '#3c303e');
  box(4, 11, 27, 23, '#c37861'); box(5, 13, 26, 22, '#d3916b');
  box(3, 9, 28, 11, '#513745'); box(2, 8, 29, 9, '#302b3e');
  for (let x = 5; x <= 26; x += 4) {
    box(x, 12, x + 1, 15, '#f2c58f'); box(x + 2, 12, x + 3, 15, '#e8e4f5');
  }
  box(6, 16, 13, 22, '#393a4a'); box(7, 17, 12, 21, '#f7b45e');
  box(18, 16, 25, 22, '#393a4a'); box(19, 17, 24, 21, '#f7b45e');
  box(15, 17, 17, 24, '#563943'); box(15, 19, 15, 19, '#fbbf24');
  line(0, 25, 31, 25, '#f0ba8a'); box(7, 19, 12, 19, '#a45d3a');
  box(20, 19, 23, 19, '#a45d3a');
  return a.grid;
}

function coralSubmarine(frame = 0) {
  const a = sheet('#143852'); const { box, line, disc, stars } = a;
  box(0, 24, 31, 31, '#235a63'); box(0, 27, 31, 31, '#1c484e');
  for (let y = 2; y < 25; y += 5) line(0, y, 31, y + 2, '#1c4961');
  box(2, 20, 3, 26, '#d96d69'); box(4, 17, 5, 27, '#ed8578');
  line(2, 21, 0, 18, '#ed8578'); line(5, 20, 8, 17, '#d96d69');
  box(25, 21, 26, 27, '#8d6bb2'); line(26, 22, 29, 18, '#c487bd');
  disc(13, 16, 7, '#f7b45e'); box(7, 14, 21, 19, '#e88d30');
  box(11, 8, 15, 10, '#f7b45e'); box(12, 10, 14, 12, '#f7b45e');
  box(20, 15, 26, 18, '#fb923c'); box(26, 14 + frame, 28, 19 + frame, '#d68139');
  for (let x of [9, 14, 19]) { disc(x, 16, 2, '#273b5d'); a.dot(x - 1, 15, '#79d9e9'); }
  stars([[27, 5], [28, 8], [25, 11], [4, 7], [5, 4]], '#63c0d0');
  line(4, 30, 22, 30, '#347269');
  return a.grid;
}

function greenhouse() {
  const a = sheet('#9ec4b7'); const { box, line, disc } = a;
  disc(25, 6, 4, '#f7b45e'); box(0, 25, 31, 31, '#416b4d');
  for (let x = 0; x < 32; x += 5) box(x, 27, x + 2, 31, '#5b8b55');
  box(4, 13, 27, 25, '#426e68'); box(6, 14, 25, 24, '#b6d8bb');
  line(4, 13, 16, 4, '#2a4e52'); line(16, 4, 27, 13, '#2a4e52');
  line(6, 13, 16, 6, '#f0edd9'); line(16, 6, 25, 13, '#f0edd9');
  for (let x of [9, 16, 23]) line(x, 12, x, 24, '#386669');
  box(7, 21, 11, 24, '#a96147'); box(14, 21, 18, 24, '#a96147'); box(21, 21, 25, 24, '#a96147');
  for (let x of [9, 16, 23]) {
    line(x, 21, x, 15, '#2d7a48'); disc(x - 2, 16, 2, '#4fa65a'); disc(x + 2, 17, 2, '#5fb467');
  }
  box(3, 25, 28, 26, '#dfc99f');
  return a.grid;
}

function neonRain(frame = 0) {
  const a = sheet('#10152e'); const { box, line, stars } = a;
  box(0, 27, 31, 31, '#20233d'); box(0, 28, 31, 28, '#32405a');
  box(1, 8, 9, 27, '#20263f'); box(11, 4, 23, 27, '#262442'); box(25, 11, 31, 27, '#1d2b45');
  for (let x of [3, 6, 14, 18, 21, 27, 30]) for (let y = 8; y < 25; y += 4) {
    if ((x + y) % 3) box(x, y, x + 1, y + 1, '#d5af69');
  }
  box(12, 11, 22, 18, '#10152e'); line(12, 11, 22, 11, '#ff2e88');
  line(12, 18, 22, 18, '#ff2e88'); line(12, 11, 12, 18, '#ff2e88'); line(22, 11, 22, 18, '#ff2e88');
  box(15, 13, 19, 16, '#22d3ee'); box(16, 14, 18, 15, '#10152e');
  for (let x of [4, 7, 12, 15, 18, 22, 26, 30]) for (let y = 2 + (x % 3); y < 26; y += 7) {
    line(x, y + frame, x - 1, y + 2 + frame, '#607296');
  }
  for (let x = 13; x <= 22; x += 3) line(x, 29, x - 1, 31, x % 2 ? '#a33183' : '#1a8a9c');
  return a.grid;
}

function rocket(frame = 0) {
  const a = sheet('#1a1840'); const { box, line, disc, stars } = a;
  stars([[2, 3], [7, 8], [26, 3], [29, 12], [4, 18], [27, 24], [10, 4], [22, 17]]);
  disc(5, 26, 7, '#674c88'); disc(26, 7, 4, '#ee896e');
  box(12, 8 - frame, 20, 23 - frame, '#eef1f5');
  for (let y = 5 - frame; y < 10 - frame; y++) box(16 - (y - (5 - frame)), y, 16 + (y - (5 - frame)), y, '#f43f5e');
  box(13, 17 - frame, 19, 21 - frame, '#b7c8d9'); disc(16, 14 - frame, 2, '#3b82f6');
  box(9, 19 - frame, 12, 25 - frame, '#f43f5e'); box(20, 19 - frame, 23, 25 - frame, '#f43f5e');
  box(14, 24 - frame, 18, 27 - frame, '#fb923c'); box(15, 26 - frame, 17, 30 - frame, '#fbbf24');
  line(11, 27, 7, 31, '#f43f5e'); line(21, 27, 25, 31, '#f43f5e');
  return a.grid;
}

function forestGuardian() {
  const a = sheet('#183c42'); const { box, line, disc } = a;
  box(0, 25, 31, 31, '#2e5741');
  for (let x of [1, 5, 27, 30]) {
    box(x, 3, x + 1, 27, '#263e35'); disc(x, 9, 4, '#28664b'); disc(x + 1, 14, 4, '#327650');
  }
  box(9, 18, 22, 30, '#584164'); box(10, 19, 21, 27, '#6a537a');
  box(11, 11, 20, 22, '#9ab972'); box(10, 14, 21, 20, '#9ab972');
  box(10, 8, 13, 13, '#597f4d'); box(18, 8, 21, 13, '#597f4d');
  line(9, 10, 6, 5, '#b7ca8a'); line(22, 10, 25, 5, '#b7ca8a');
  box(12, 16, 14, 17, '#202c37'); box(18, 16, 20, 17, '#202c37');
  box(12, 16, 12, 16, '#f7b45e'); box(18, 16, 18, 16, '#f7b45e');
  box(15, 20, 17, 20, '#597f4d'); box(8, 26, 10, 31, '#7f5d4b'); box(21, 26, 23, 31, '#7f5d4b');
  return a.grid;
}

function snowyCabin() {
  const a = sheet('#506985'); const { box, line, disc, stars } = a;
  disc(24, 6, 3, '#e8e4f5'); stars([[3, 4], [10, 6], [18, 3], [28, 13], [4, 17]], '#ffffff');
  box(0, 25, 31, 31, '#dae4ec');
  for (let x of [2, 27]) {
    box(x, 9, x + 2, 27, '#354b57');
    for (let y = 12; y < 24; y += 4) box(x - 3, y, x + 5, y + 2, '#32636a');
    box(x - 3, 12, x + 5, 12, '#d7e3ea');
  }
  box(7, 16, 24, 27, '#815c4b'); box(7, 24, 24, 25, '#a47d5e');
  line(5, 17, 16, 9, '#2d3c4c'); line(16, 9, 26, 17, '#2d3c4c');
  line(6, 16, 16, 8, '#e8e4f5'); line(16, 8, 25, 16, '#e8e4f5');
  box(18, 18, 22, 22, '#f7b45e'); box(9, 20, 13, 27, '#493b3e');
  box(11, 23, 11, 23, '#f7b45e'); box(21, 6, 22, 11, '#c7d6df');
  return a.grid;
}

function cosmicCat(frame = 0) {
  const a = sheet('#272044'); const { box, disc, stars } = a;
  stars([[2, 2], [7, 6], [25, 4], [30, 9], [4, 22], [26, 25], [8, 27], [23, 15]]);
  disc(25, 24, 5, '#674c88'); disc(6, 12, 3, '#414c86');
  box(8, 11, 23, 25, '#171725'); box(6, 14, 25, 24, '#171725');
  for (let y = 7; y <= 14; y++) { box(7 + Math.floor((y - 7) / 3), y, 12, y, '#171725'); box(19, y, 24 - Math.floor((y - 7) / 3), y, '#171725'); }
  if (frame === 0) { box(10, 17, 13, 18, '#f7b45e'); box(19, 17, 22, 18, '#f7b45e'); }
  else { box(10, 18, 13, 18, '#f7b45e'); box(19, 18, 22, 18, '#f7b45e'); }
  box(15, 21, 17, 22, '#ff2e88'); box(7, 23, 10, 24, '#292a3d');
  box(23, 23, 26, 24, '#292a3d');
  return a.grid;
}

function pocketArcade() {
  const a = sheet('#4f3972'); const { box, line, disc } = a;
  box(0, 26, 31, 31, '#302d4b');
  for (let x = 0; x < 32; x += 4) for (let y = 26; y < 32; y += 4) if ((x + y) % 8 === 0) box(x, y, x + 3, y + 3, '#4b4161');
  box(8, 4, 23, 28, '#181727'); box(9, 5, 22, 27, '#ed6b74');
  box(11, 8, 20, 18, '#151b3c'); box(12, 9, 19, 17, '#31a2bb');
  box(14, 10, 16, 13, '#fbbf24'); box(13, 13, 17, 14, '#fbbf24');
  box(10, 20, 21, 25, '#a93571'); box(12, 21, 14, 23, '#222036');
  a.dot(18, 22, '#fbbf24'); a.dot(20, 22, '#22d3ee');
  box(10, 3, 21, 5, '#fbbf24'); box(11, 4, 20, 4, '#ff2e88');
  box(9, 28, 12, 30, '#181727'); box(19, 28, 22, 30, '#181727');
  disc(3, 8, 2, '#e88d30'); disc(29, 15, 2, '#22d3ee');
  return a.grid;
}

function sunsetSail() {
  const a = sheet('#92516b'); const { box, line, disc } = a;
  for (let y = 0; y < 18; y++) box(0, y, 31, y, y < 9 ? '#6c4b73' : '#c26a6b');
  disc(22, 12, 6, '#f7b45e'); box(0, 18, 31, 31, '#345b79');
  for (let y = 19; y < 32; y += 3) line(0, y, 31, y + 1, '#4b7990');
  box(5, 24, 26, 26, '#493843'); box(8, 27, 23, 28, '#2b3345');
  line(16, 8, 16, 24, '#3a3343');
  for (let y = 9; y <= 22; y++) box(17, y, 27 - Math.floor((y - 9) * .7), y, '#e8e4f5');
  for (let y = 13; y <= 22; y++) box(8 + Math.floor((y - 13) * .5), y, 15, y, '#f3cfab');
  box(20, 27, 27, 27, '#f7b45e'); box(15, 30, 21, 30, '#b88575');
  return a.grid;
}

function mushroomMeadow() {
  const a = sheet('#68a5aa'); const { box, line, disc } = a;
  box(0, 23, 31, 31, '#497852'); box(0, 27, 31, 31, '#3e6b4b');
  disc(25, 6, 3, '#f7b45e');
  box(12, 16, 20, 28, '#e7cca7'); box(13, 19, 19, 26, '#f4d9b0');
  for (let y = 10; y <= 18; y++) {
    const half = Math.floor((y - 9) * 1.25);
    box(Math.max(3, 16 - half), y, Math.min(28, 16 + half), y, '#e6576c');
  }
  box(5, 18, 27, 19, '#ab415b');
  for (const [x, y] of [[12,13],[19,14],[8,17],[24,17]]) disc(x, y, 1, '#ffe9c9');
  box(14, 22, 14, 23, '#644d54'); box(18, 22, 18, 23, '#644d54');
  for (let x of [3, 7, 25, 29]) { line(x, 27, x, 21, '#2e6f4e'); disc(x, 21, 1, '#fbbf24'); }
  return a.grid;
}

const EXAMPLES = [
  { title: 'Moonlit Ridge Camp', description: 'PixelVerse example artwork: a warm campsite beneath a crescent moon. Two frames make the fire flicker.', frames: [moonlitCamp(0), moonlitCamp(1)] },
  { title: 'Little Pixel Bakery', description: 'PixelVerse example artwork: a tiny bakery opening at sunrise.', frames: [bakery()] },
  { title: 'Coral Submarine', description: 'PixelVerse example artwork: a yellow submarine exploring an underwater garden. Two frames move its propeller.', frames: [coralSubmarine(0), coralSubmarine(1)] },
  { title: 'Greenhouse Morning', description: 'PixelVerse example artwork: houseplants growing inside a glass greenhouse.', frames: [greenhouse()] },
  { title: 'Neon Rain', description: 'PixelVerse example artwork: city windows and a glowing sign reflected in wet streets. Two frames shift the rain.', frames: [neonRain(0), neonRain(1)] },
  { title: 'Rocket to the Stars', description: 'PixelVerse example artwork: a small rocket lifts off past two distant planets.', frames: [rocket(0), rocket(1)] },
  { title: 'Forest Guardian', description: 'PixelVerse example artwork: a friendly guardian in a deep green forest.', frames: [forestGuardian()] },
  { title: 'Snowy Cabin', description: 'PixelVerse example artwork: a glowing window on a quiet winter evening.', frames: [snowyCabin()] },
  { title: 'Cosmic Cat', description: 'PixelVerse example artwork: a black cat among the stars. The second frame makes it blink.', frames: [cosmicCat(0), cosmicCat(1)] },
  { title: 'Pocket Arcade', description: 'PixelVerse example artwork: a tiny arcade cabinet with a bright game screen.', frames: [pocketArcade()] },
  { title: 'Sunset Sail', description: 'PixelVerse example artwork: a little sailboat crossing the sea at sunset.', frames: [sunsetSail()] },
  { title: 'Mushroom Meadow', description: 'PixelVerse example artwork: a cheerful mushroom in a flower-filled meadow.', frames: [mushroomMeadow()] },
];

function asProject(grids) {
  return frozenProject({ v: 2, gridSize: SIZE, activeFrame: 0,
    frames: grids.map((grid, index) => ({ id: index + 1, g: encodeGrid(grid) })) });
}

if (process.argv.includes('--preview')) {
  EXAMPLES.forEach(example => asProject(example.frames));
  process.stdout.write(JSON.stringify(EXAMPLES.map(example => ({ title: example.title, grid: example.frames[0] }))));
} else {
  if (process.env.NODE_ENV === 'production' || !/^mongodb:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(config.mongoUri)) {
    throw new Error('Gallery example seeding only runs against local development MongoDB');
  }
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000, autoIndex: false });
  try {
    const userId = new mongoose.Types.ObjectId(crypto.createHash('sha256').update('pixelverse-example-author-v1').digest('hex').slice(0, 24));
    const author = await User.findOneAndUpdate({ _id: userId }, { $setOnInsert: {
      displayName: 'PixelVerse Examples', username: defaultUsername('PixelVerse Examples', userId),
      email: SAMPLE_EMAIL, emailVerifiedAt: new Date(),
    } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    let created = 0;
    for (const example of EXAMPLES) {
      const id = new mongoose.Types.ObjectId(crypto.createHash('sha256').update(`pixelverse-example-art-v1:${example.title}`).digest('hex').slice(0, 24));
      const project = asProject(example.frames);
      const result = await Artwork.updateOne({ _id: id }, { $setOnInsert: {
        authorId: author._id, title: example.title, description: example.description,
        visibility: 'public', source: { kind: 'local' }, example: true,
        contributors: [{ userId: author._id, displayName: author.displayName, changes: 0 }],
        project, coverFrameId: 1, thumbnail: projectThumbnail(project, 1),
        likes: 0, dislikes: 0, commentCount: 0,
      } }, { upsert: true, setDefaultsOnInsert: true });
      if (result.upsertedCount) created++;
      process.stdout.write(`${result.upsertedCount ? 'Added' : 'Kept'} example: ${example.title}\n`);
    }
    process.stdout.write(`Gallery examples ready: ${EXAMPLES.length} total, ${created} newly added.\n`);
  } finally {
    await mongoose.disconnect();
  }
}
