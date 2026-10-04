// Generates the pond's sound effects with ElevenLabs' sound-effects model into audio/sfx/, and writes
// audio/sfx.json. Reads the key from ELEVENLABS_API_KEY only (never printed or stored). Files already made are
// kept (delete one to remake it), so a rerun spends nothing on what exists. Stops at the first quota error.
//   ELEVENLABS_API_KEY=... node tools/sfx_generate.mjs [only-these-ids...]
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('Set ELEVENLABS_API_KEY'); process.exit(1); }
const OUT = path.resolve('audio/sfx'), MANIFEST = path.resolve('audio/sfx.json');
fs.mkdirSync(OUT, { recursive: true });

// id: [prompt, seconds, prompt influence, loop]
const SFX = {
  // ---- menus and buttons: soft, watery, short ----
  ui_click: ['a soft, small water droplet click, gentle UI tap, clean, no reverb', 0.5, 0.6],
  ui_click2: ['a tiny muted wooden tap with a faint water drip, gentle user interface click', 0.5, 0.6],
  ui_open: ['a soft rising underwater whoosh with a few small bubbles, menu opening, gentle', 0.8, 0.5],
  ui_close: ['a soft falling underwater whoosh, short bubble release, menu closing, gentle', 0.7, 0.5],
  ui_tab: ['a short soft pebble tick on wet stone, quiet UI tab switch', 0.5, 0.6],
  ui_toggle_on: ['a short bright two-note rising bubble blip, switch turned on, soft', 0.6, 0.6],
  ui_toggle_off: ['a short soft two-note falling bubble blip, switch turned off', 0.6, 0.6],
  ui_error: ['a dull low muffled underwater blub, gentle error sound, not harsh', 0.6, 0.6],
  ui_buy: ['small glass pearls clinking into a shell, a soft rewarding purchase chime', 1, 0.5],
  ui_essence: ['a soft shimmering magical sparkle with a gentle airy tone, mystical essence gained', 1.2, 0.5],
  ui_build: ['a heavy stone set down on a sandy sea floor with a muffled underwater thud and a puff of bubbles', 1.4, 0.5],
  ui_plant: ['a soft plop of a seedling pushed into wet sand underwater, gentle', 0.7, 0.5],
  ui_recycle: ['a quick net swish through water followed by a soft sparkle', 1, 0.5],
  ui_spawn: ['a small fish released into a pond with a light splash and bubbles', 1, 0.5],
  ui_enter: ['diving into calm water, a soft splash then muffled bubbles rising as you go under', 2, 0.5],
  // ---- things that happen in the pond ----
  ev_feed: ['fish food flakes sprinkled onto a calm water surface, light pattering', 1.2, 0.5],
  ev_eat: ['a small fish gulping food underwater, a quick soft gulp', 0.5, 0.6],
  ev_hit: ['a muffled underwater bump, two fish colliding, soft thud with bubbles', 0.6, 0.5],
  ev_hatch: ['tiny eggs cracking underwater with small bubbles, delicate', 1, 0.5],
  ev_birth_rare: ['a magical underwater chime swell with shimmering bells, something rare is born', 2.2, 0.5],
  ev_award: ['a single small clear pearl chime, gentle reward', 0.7, 0.6],
  ev_discover: ['a soft curious marimba motif with a bubble, a new creature arrives', 1.6, 0.5],
  ev_fossil: ['an old stone brushed free of sand followed by a faint glittering sparkle', 1.4, 0.5],
  ev_artifact: ['a deep mystical resonant swell, ancient artifact discovered, low choir and shimmer', 2.6, 0.5],
  ev_depth: ['a distant whale song and a deep resonant boom far below in the ocean, the depths opening up', 4, 0.5],
  ev_thunder: ['distant thunder heard from underwater, low muffled rumble', 3, 0.5],
  ev_awaken: ['a soft electric neural spark and a rising synth pulse, a mind awakening, gentle', 1.6, 0.5],
  ev_death: ['a soft low exhale of bubbles fading away underwater, gentle and sad', 1.5, 0.5],
  ev_splash_small: ['a small splash on a calm pond surface', 0.7, 0.6],
  ev_splash_big: ['a large creature breaching and splashing back into the water', 1.6, 0.5],
  ev_storm: ['wind picking up over open water, rain beginning to hit the surface, a storm arriving', 4, 0.4],
  // ---- ambience beds for the zoom: they loop ----
  amb_surface: ['calm ocean surface ambience from just above the water: gentle wind, soft lapping waves, distant seabirds, peaceful', 20, 0.4, true],
  amb_shallow: ['underwater ambience in a shallow reef: soft bubbles, gentle water movement, faint snapping shrimp crackle, peaceful', 20, 0.4, true],
  amb_fresh: ['close field recording at the edge of a small still freshwater pond at dusk: tiny irregular water lapping against reeds and mud, a faint trickle, reeds brushing, very quiet and intimate, no ocean, no waves crashing', 22, 0.55, true],
  amb_salt: ['close field recording of a sheltered rocky cove: small gentle waves washing over shingle and pebbles and draining back with a soft rattle, irregular and natural, quiet, no big surf', 22, 0.55, true],
  amb_deep: ['deep ocean underwater ambience: low dark drone, muffled pressure, very distant whale calls, slow and calm', 20, 0.4, true],
};

const only = process.argv.slice(2);
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { v: 1, sounds: {} };
let made = 0, kept = 0;
for (const [id, [text, seconds, influence, loop]] of Object.entries(SFX)) {
  if (only.length && !only.includes(id)) continue;
  const file = path.join(OUT, `${id}.mp3`);
  if (fs.existsSync(file)) { kept++; manifest.sounds[id] = { f: `${id}.mp3`, dur: seconds, loop: !!loop }; continue; }
  const body = { text, duration_seconds: seconds, prompt_influence: influence, model_id: 'eleven_text_to_sound_v2', ...(loop ? { loop: true } : {}) };
  let r = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok && loop) { // (if looping isn't accepted, make it plain; the player crossfades its ends)
    const t = await r.text();
    if (!/quota|credit/i.test(t)) { delete body.loop; r = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
      method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    else r = { ok: false, status: 402, text: async () => t };
  }
  if (!r.ok) {
    const t = (await r.text()).slice(0, 300);
    console.error(`${id}: HTTP ${r.status} ${t.replace(/sk_[A-Za-z0-9]+/g, '[key]')}`);
    if (r.status === 401 || /quota|credit/i.test(t)) { console.error('Stopping: out of credits or not allowed.'); break; }
    continue;
  }
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  manifest.sounds[id] = { f: `${id}.mp3`, dur: seconds, loop: !!loop };
  made++;
  console.log(`made ${id} (${seconds}s)`);
}
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
console.log(`made ${made}, kept ${kept}, manifest ${Object.keys(manifest.sounds).length} sounds`);
