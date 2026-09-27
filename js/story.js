'use strict';
// The story, and the dark.
//  - A narrator keeps notes on what comes: new kinds of life, things rising from
//    the deep, the pond deepening, fossils and relics, what can be built now,
//    the marked, the finest of each line. Their voice slides, slowly, from a
//    calm naturalist's field notes into something else, as the pond deepens,
//    corruption gathers, the marked spread and the pond is kept in the dark.
//    Light brings some of it back. Lines go to the journal (Story) and to a
//    strip under the pond bar.
//  - The dark feeds madness, and daylight resists it: the change in the marked,
//    fits of madness, the madness itself and the dreams all run faster in the
//    dark (now, and on average over the last day and a half) and slower in the
//    light. A pond kept always in daylight resists corruption; one kept always
//    at night gives in to it (and yields more corruption for it).

// ---- light and dark --------------------------------------------------------------------------------
// How much the dark is feeding madness here: 0.4 (steady daylight) to 1.7 (endless night).
function lightMadness(world) {
  const now = world.darkness || 0, avg = world.darkAvg ?? now, sky = typeof heavensMadness === 'function' ? heavensMadness(world) : 1;
  return clamp((0.4 + 1.3 * (0.45 * now + 0.55 * avg)) * sky, 0.4, 3);
}
function updateDark(world, dt) {
  const k = Math.min(1, dt / (world.opts.dayLength * 1.5));
  world.darkAvg = (world.darkAvg ?? (world.darkness || 0)) + ((world.darkness || 0) - (world.darkAvg ?? 0)) * k;
}
const lightWord = (m) => (m < 0.7 ? 'the light holds madness back' : m < 1.1 ? 'light and dark are balanced' : m < 1.4 ? 'the dark feeds madness' : 'the endless dark feeds madness');

// ---- the narrator ----------------------------------------------------------------------------------
// How far gone: the depth reached, the corruption gathered, how many are marked, how dark it's kept.
function madnessNow(world) {
  const E = world.erosion || {}, G = world.game || {};
  const tier = Math.min(1, (E.tier || 0) / 8);
  const cor = 1 - 1 / (1 + (G.corruptionEarned || 0) / 400);
  const share = Math.min(1, ((world.eldMarks && world.eldMarks.length) || 0) / 10);
  return clamp(0.32 * tier + 0.3 * cor + 0.23 * share + 0.15 * (world.darkAvg ?? 0.4), 0, 1);
}
const STORY_STAGES = ['field notes', 'sleepless', 'uneasy', 'obsessed', 'lost'];
function storyState(world) { return world.story || (world.story = { m: 0, stage: 0, last: -99, said: {} }); }
// It rises as fast as the pond gives it cause, and ebbs only slowly in the light.
function updateStory(world, dt) {
  const S = storyState(world), now = madnessNow(world);
  S.m = now > S.m ? S.m + (now - S.m) * Math.min(1, dt / 60) : Math.max(now, S.m - dt * 0.00002 * (2 - lightMadness(world)));
  const stage = Math.min(4, Math.floor(S.m * 5.2));
  if (stage !== S.stage) {
    const up = stage > S.stage;
    S.stage = stage;
    narrate(world, up ? 'worse' : 'better', {}, true);
  }
}

const STORY = {
  arrive: [
    ['Field note: {what}, new to these waters. I have marked where it was first seen.', 'A first {what}. I sketched it before it slipped under the weed.', '{what} has found its way here. The pond is filling in nicely.'],
    ['{what} arrived while I was not looking. I am always not looking, it seems.', 'A {what}, or the idea of one. I keep two notebooks now.', '{what}. I heard it arrive before I saw it. That seems wrong.'],
    ['{what}. It came because it was called. Not by me. Not only by me.', 'A {what} in the shallows. It knew the way. Who told it the way?', '{what}. The water parted for it like it was expected.'],
    ['{what}. {what}. {what}. I write it three times so it stays.', 'They keep coming. {what} now. The pond is a door and the door is open.', '{what}. I did not ask. I think I asked.'],
    ['{what} {what} {what}. it swims in circles. so do i', 'welcome {what}. welcome. the water remembers you', '{what}. another one for the choir'],
  ],
  deep: [
    ['Something rose from the drop-off: {what}. Remarkable, at this depth.', '{what}, up from the deep. I did not expect to see one so near.'],
    ['{what} came up to look at me. I looked back. We both took notes.', '{what} rose and hung there, just under the light, as if listening.'],
    ['{what} rose, and the water above it went quiet, like a held breath.', '{what}. It came up slowly, the way a thought does.'],
    ['{what} from below. It knew my name, or the shape of it.', '{what}. The deep sends its questions up one at a time.'],
    ['IT CAME UP. {what}. it came up and nothing is the same size anymore', '{what}. up. up. it is closer to me than the surface is'],
  ],
  mythic: [
    ['{what}. I have read about these. I did not believe what I read.'],
    ['{what}. My hand shook. The ink is fine. My hand is fine.'],
    ['{what}. Everything in the pond turned to face it, and so did I.'],
    ['{what}. It is not in the pond. The pond is in it.'],
    ['{what} {what} {what} OPEN YOUR EYES'],
  ],
  tier: [
    ['The floor falls away into {place}. I will need longer lines to sound it.', '{place}. The soundings are extraordinary.'],
    ['{place}. The line ran out before the bottom did.', '{place}. I lowered a lamp. It is still going down.'],
    ['{place}. There are steps down there. Nobody cut them.', '{place}. Something down there has been waiting for the water to reach it.'],
    ['{place}. The notebooks are wet. I do not go in the water. The notebooks are wet.', '{place}. Deeper is only a direction, and I know which one.'],
    ['{place}. deeper. deeper. the bottom is a ceiling from the other side', '{place}. i can hear it from here'],
  ],
  fossil: [
    ['The tide gave up {what}. Older than the pond, I think.', '{what} on the beach this morning. Catalogued.'],
    ['{what}. The tide keeps bringing me gifts. I have not asked for them.', '{what}. It fits my hand too well.'],
    ['{what}. It was facing up. They are always facing up.', '{what}. It is cold, and then it is not.'],
    ['{what}. Still warm. It is not a fossil. It is waiting.', '{what}. I put my ear to it. I wish I had not.'],
    ['{what}. the bones are counting. i am counting with them.'],
  ],
  relic: [
    ['Inside the stone: {what}. It is warm to the touch, which it should not be.'],
    ['{what}. I have put it on the windowsill, facing the water. It prefers that.'],
    ['{what}. When I hold it I can hear the tide going out, forever.'],
    ['{what}. I understand the instructions now. They were never instructions.'],
    ['{what}. yes. yes. yes.'],
  ],
  unlock: [
    ['New things can be made down here now: {what}.', 'The deep opens up {what}. There is a great deal to build.'],
    ['Down there, now: {what}. I do not remember deciding to look.', '{what}. The plans drew themselves, more or less.'],
    ['{what}. The pond wants these built. I am only the hands.', '{what}. It has been asking for these.'],
    ['{what}. Build it. Build it. The pond is patient but I am not.'],
    ['{what}. i did not choose. i was chosen by the choosing.'],
  ],
  mark: [
    ['{name} looks unwell. Probably nothing.', '{name} is off its food. I will watch it.'],
    ['{name} has a new way of holding still. I have seen it before, I think. In the other notebook.'],
    ['{name} watched me cross the room. Fish do not have necks.', 'The others give {name} a wide berth. They know something.'],
    ['{name} is learning. We are all learning. The water is the lesson.'],
    ['{name} sees. {name} sees me seeing.'],
  ],
  super: [
    ['{what}: the finest of its line. Worth keeping an eye on.', '{what}. Generations of careful breeding, and here it is.'],
    ['{what}: perfect, or near it. I counted its scales. Then I counted them again.'],
    ['{what}, flawless. Flawless things are a kind of warning.'],
    ['{what}. The best of them. The best of them always go down first.'],
    ['{what}. PERFECT. perfect things belong to the deep.'],
  ],
  island: [
    ['The island rises another step. The gulls approve.', 'Another terrace on the island. It is becoming quite a hill.'],
    ['Another terrace on the island. I dreamed it before it was built.'],
    ['The island climbs. From the top you could see the bottom, if you wanted to.'],
    ['The island is a staircase. I know where it goes.'],
    ['the steps go up so that we can go down'],
  ],
  glass: [
    ['A glass day. I could see the bottom of the deep end. There is a bottom. Good.'],
    ['A glass day. I could see a long way down. Things were looking back up.'],
    ['The water is clear today. Too clear. It shows you things.'],
    ['Glass. I can see all the way down to where they are waiting.'],
    ['clear clear clear. they can see me too'],
  ],
  meteors: [
    ['Falling stars tonight. I made a wish, which is unscientific.'],
    ['Stars falling into the pond. I counted nine. The pond kept them.'],
    ['Stars fell tonight. They fell toward the pond, not the sea.'],
    ['The stars are coming down to see.'],
    ['the stars are falling in. we are filling up with stars'],
  ],
  aurora: [
    ['Lights in the sky, green and violet, doubled in the water. Beautiful.'],
    ['The aurora came out. The fish swam in its reflection, all facing the same way.'],
    ['Lights in the sky. The water tried to copy them and got them slightly wrong.'],
    ['The sky has opened a little. I can see the colours of the other side.'],
    ['the sky is bleeding colours into the water'],
  ],
  comet: [
    ['A comet. A good omen, the old sailors said.'],
    ['A comet, with a tail like a torn page.'],
    ['A comet. The young born under it are strange and bright.'],
    ['The comet is getting closer. I am sure of it.'],
    ['it is looking at us. the comet. it is an eye.'],
  ],
  bloodmoon: [
    ['A red moon tonight: an eclipse of the moon. Nothing more.'],
    ['The moon came up red. The water looked like wine, and then like something else.'],
    ['Blood moon. The marked are restless. So am I.'],
    ['The moon is bleeding into the pond. Of course it is.'],
    ['red red red the moon is open'],
  ],
  eclipse: [
    ['An eclipse at noon. The fish thought it was night. So did I, for a moment.'],
    ['The sun went out. When it came back, it was not quite the same sun.'],
    ['The sun went dark and the marked turned to face the pond, all together.'],
    ['The sun blinked. Something on the other side of it saw us.'],
    ['the sun closed its eye so the other one could open'],
  ],
  stars: [
    ['An odd conjunction tonight. I have noted the positions.'],
    ['The stars are in an arrangement I don\'t like. I checked the charts twice.'],
    ['The stars are right. I don\'t know how I know that phrase.'],
    ['THE STARS ARE RIGHT.'],
    ['the stars are right the stars are right the stars are right'],
  ],
  wanderer: [
    ['A {label} came in from along the beach, from {from}. It was not born here, and it knows it.'],
    ['{name} came over from {from}. Everything moved away from it at once.'],
    ['A stranger in the water: {name}, from {from}. It has killed before.'],
    ['{name} has come from {from} to feed. The pond made room for it. The pond always makes room.'],
    ['it came from {from} it came for us it came for us'],
  ],
  bloodrain: [
    ['Red rain. Dust from somewhere far away, I expect.'],
    ['It rained red. The pond drank it all.'],
    ['It is raining blood. The marked lift their heads to it.'],
    ['Blood from the sky. The pond is being fed.'],
    ['it rains and rains and the pond is so thirsty'],
  ],
  fallen: [
    ['Something fell on the beach in the night, still warm.'],
    ['A star came down on the beach. It left something behind.'],
    ['A star fell and the thing it carried is waiting on the sand.'],
    ['A star fell. It was sent.'],
    ['a gift from above. from below. same thing'],
  ],
  tar: [
    ['The oil has pooled into something like a creature. I have not seen that before. Nobody has.'],
    ['The tar moved. Against the current. I watched it for an hour.'],
    ['The tar is awake. It is hungry for the green things.'],
    ['The tar knows my name. It says it in bubbles.'],
    ['the tar is the pond dreaming of money'],
  ],
  tarGone: [
    ['The tar broke up. Good riddance.'],
    ['The tar is gone. The water tastes of it still.'],
    ['The tar starved. It will be back when we feed it.'],
    ['The tar has gone under. It is only resting.'],
    ['the tar sleeps in the rigs'],
  ],
  river: [
    ['The river has moved. It does that, apparently. I have redrawn the map.'],
    ['The river has moved again. The old bed is still wet. Something walks in it at night.'],
    ['The river went somewhere else in the night. I think it was looking for something.'],
    ['The river has moved. The map is wrong. The map was always wrong.'],
    ['the river walks. everything walks now.'],
  ],
  build: [
    ['{what} settles into the floor. The fish are curious.'],
    ['{what}. Lower and lower we go.'],
    ['{what}. The floor accepted it like a mouth.'],
    ['{what}. Another tooth in the jaw.'],
    ['{what}. it hums. everything hums now.'],
  ],
  dusk: [
    ['Dusk. The water goes the colour of slate.', 'Evening. Everything is where it should be.'],
    ['The light goes, and the water keeps some of it.', 'Dusk, and the bubbles rise in threes.'],
    ['Dark again. It gets darker faster now. I checked.', 'Night. The water is thinking.'],
    ['Night. Good. The light was lying.', 'The dark comes up from the deep end first.'],
    ['dark. dark. they are all looking up now.', 'night. i can hear the pond breathing under the floorboards.'],
  ],
  dawn: [
    ['Morning. Counted everything twice; the numbers agree.'],
    ['Morning. I did not sleep. The pond did not either.'],
    ['Daylight. It helps. I keep the lamps on anyway.'],
    ['The sun again. It hurts to look at the surface.'],
    ['the light is thin. something is behind it.'],
  ],
  worse: [
    [''], ['The handwriting in the notebook is not quite mine any more.'], ['I have stopped sleeping with the window open. The water is too loud.'],
    ['I have moved the desk to face the pond. It is easier this way.'], ['i am not writing this down. it is writing me down'],
  ],
  better: [
    ['The light helps. I slept, for once. The notes make sense again.'], ['A clear morning. I read back what I wrote last week and did not recognise it.'],
    ['Daylight. The pond looks like a pond again. Mostly.'], ['The lamps are on. The voices are quieter with the lamps on.'], [''],
  ],
};
const STORY_KEY_ALWAYS = new Set(['tier', 'relic', 'mythic', 'super', 'worse', 'better']);

// Say something about what just happened, in the narrator's current voice.
function narrate(world, kind, info = {}, force = false) {
  const S = storyState(world), T = STORY[kind];
  if (!T || world.observe || world.quietRestore) return null;
  if (!force && !STORY_KEY_ALWAYS.has(kind) && world.t - S.last < 25) return null; // don't talk over itself
  const pool = T[Math.min(S.stage, T.length - 1)].filter(Boolean);
  if (!pool.length) return null;
  const line = pick(pool).replace(/\{(\w+)\}/g, (m, k) => (info[k] != null ? String(info[k]) : ''));
  S.last = world.t;
  logEvent(world, `❝ ${line}`, info.subject || null, { cat: 'story', pri: STORY_KEY_ALWAYS.has(kind) ? 2 : 1 });
  if (typeof showNarration === 'function') showNarration(line, S.stage);
  return line;
}
// The first time the pond sees something, say so.
function narrateFirst(world, key, kind, info) {
  const S = storyState(world);
  if (S.said[key]) return null;
  S.said[key] = 1;
  return narrate(world, kind, info, true);
}

// A new tier: where the pond has gone, and what can be made or met there now.
function narrateTier(world, tier) {
  narrate(world, 'tier', { place: tierName(world, tier) });
  const b = branchOf(world), mixed = world.opts.habitat === 'mixed';
  const builds = Object.values(STRUCTURES).filter((d) => d.tier === tier && (!d.habitat || mixed || d.habitat === b)).map((d) => d.label.toLowerCase());
  const life = Object.entries(DEEP).filter(([, d]) => d.tier === tier && (d.branch === 'both' || mixed || d.branch === b)).map(([k]) => plural(SINGULAR[k], 2).toLowerCase());
  const what = [...builds, ...life].slice(0, 4);
  if (what.length) narrate(world, 'unlock', { what: what.join(', ') }, true);
}
