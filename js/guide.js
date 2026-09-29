'use strict';
// The guide: everything in the game, in one window (the rail's ?, the menu's Guide, or G).
// Almost all of it is written from the game's own tables (species, builds, plants, food, traits,
// the depths, the sky, the eldritch, the alien, hunters, the hatchery, the ledger), so it keeps up
// as the game grows; what the tables can't say (a line about each species, the looks, the basics)
// is written here. Chapters are built when opened; the search looks through all of them.

// ---- a line about each species (the tables give the rest: where, how deep, how long, what it likes) ----
const SPECIES_NOTES = {
  koi: 'The pond’s own: big, bright and long-lived, in endless patterns; they love lily pads.',
  tetra: 'Tiny fish that school and turn together as one; almost everything bigger eats them.',
  eel: 'A long hunter that hides by rocks and in the eelgrass, and comes out at night.',
  axolotl: 'A salamander that never grows up: frilly gills, a smile, and a soft spot for moss balls.',
  turtle: 'Slow and very long-lived; it basks and nests on islands.',
  crab: 'A scuttling scavenger of the floor and the beach, busiest at night; it picks remains clean.',
  ray: 'A stingray gliding low over the sand, most active at dusk.',
  frog: 'Sits on lily pads and snaps at gnats and fireflies; its eggs hatch into tadpoles.',
  snake: 'A water snake that hunts by day, swimming with its head up.',
  snail: 'A slow grazer of algae that lays its eggs on rocks and cleans up remains.',
  jelly: 'Drifts where the current takes it, and glows faintly at night.',
  clown: 'A clownfish pair adopts an anemone and guards it from intruders.',
  puffer: 'Balloons up into a spiny ball when something big comes close.',
  octopus: 'Clever and short-lived: arms that plant and step, and a puff of ink when it jets away.',
  duck: 'Paddles about the surface with a line of ducklings behind it.',
  shrimp: 'Small scavengers of the floor, and food for nearly everything.',
  dragonfly: 'Darts over the water on glassy wings; gulls and frogs snatch the unlucky.',
  starfish: 'Creeps over coral and rock, very slowly, for a very long time.',
  wild: 'Species invented as you watch, each with its own shape, colours, pattern and name. Every pond grows its own.',
  // the deep
  sandshark: 'A small shark that lies on the sand of the tide pools and hunts at dusk.',
  shark: 'The reef’s great hunter, patrolling day and night.',
  catfish: 'A huge whiskered bottom-feeder of the deep lake: it hunts at night and clears up carrion.',
  angler: 'Dangles a glowing lure in the dark and swallows whatever comes to it.',
  gulper: 'Mostly mouth: a pink-lit eel that takes its prey whole.',
  vampire: 'A deep-red squid with great blue eyes, drifting through the midnight zone.',
  isopod: 'An armoured giant of the deep floor, a scavenger that lives for decades.',
  cavefish: 'Pale, blind fish that school in the sunless cave.',
  olm: 'A pale, blind salamander of the caves that can live a century.',
  kraken: 'Mythic. Something vast uncoils in the abyss.',
  leviathan: 'Mythic. The deep water heaves as it passes through.',
  watcher: 'Mythic. In the drowned dark, an eye opens.',
  snailfish: 'Small, pink and see-through, schooling in the trench.',
  frilled: 'A long, eel-like shark with frilled gills, from the hadal trench.',
  boneeel: 'The frilled shark’s cousin in the crypts: long, pale and frill-gilled.',
  siphon: 'Not one animal but a colony, strung out like a lit necklace, drifting.',
  squid: 'A smaller, red cousin of the kraken, with two long feeding arms.',
  deepone: 'They walk the drowned streets on webbed feet, with fins down their backs and eyes that catch no light.',
  sleeper: 'Mythic. Vaster than the Leviathan, with an eye every few joints that opens, slowly.',
  // the deep past
  trilobite: 'Three lobes under a wide head shield, scuttling over the floor of the Cambrian sea.',
  anomalocaris: 'The first great hunter: flaps rippling down both sides, and two spiny arms to grasp with.',
  ammonite: 'A coiled shell that jets slowly backwards, its arms trailing ahead.',
  eurypterid: 'A sea scorpion: segmented, with a spiked tail, swimming paddles and grasping claws.',
  lungfish: 'Eel-like and olive, with long thread-like fins; it can breathe air.',
  dunkleosteus: 'An armoured fish the size of a boat, with bony blades for jaws.',
  coelacanth: 'A living fossil: blue, white-flecked, with fleshy lobed fins.',
  placoderm: 'A small armoured fish of the Devonian lakes, plated at the front.',
  temnospondyl: 'A giant amphibian of the old swamps, wide-headed and patient.',
  plesiosaur: 'A long neck, four great flippers, and a mouthful of needle teeth.',
  mosasaur: 'A sea-going lizard as long as a bus, the terror of the Permian deep.',
  hyneria: 'A great lobe-finned hunter of the old rivers, dark and heavy-jawed.',
  // the reef and the pond, and their pools
  mandarin: 'A tiny reef fish in a netted pattern of blue and orange.',
  tang: 'A royal-blue reef fish with a yellow tail, never far from the coral.',
  lionfish: 'Banded, fanned and armed with venomous spines: a hunter of the reef.',
  seahorse: 'Drifts upright among the eelgrass, snout first, crest up.',
  moray: 'A spotted eel that waits in the rocks and strikes at night.',
  hermit: 'A crab in a borrowed shell, out and about after dark.',
  cleaner: 'A little striped fish that schools around the reef, keeping it clean.',
  nudibranch: 'A sea slug in outrageous colours, with a plume of gills on its back.',
  goldfish: 'Round, orange and fan-tailed: the easiest fish to keep.',
  guppy: 'Tiny, bright-tailed and quick to breed; they school in the shallows.',
  betta: 'A fighting fish with a flowing tail and a sail of a fin.',
  loach: 'Orange and black-barred, with whiskers; it busies itself on the floor at night.',
  crayfish: 'A freshwater lobster with big claws, out at night among the rocks.',
  newt: 'A spotted newt with a crest down its back and an orange belly.',
  pleco: 'An armoured, whiskered catfish that clings to rocks and comes out at night.',
  pike: 'A long, lean ambush hunter of the pond.',
  // the twilight zone and the deep lake
  lanternfish: 'Small schooling fish with rows of blue lights along their sides.',
  hatchetfish: 'Thin and silvery as a blade, with lights along the belly.',
  combjelly: 'A lobed jelly with rows of combs that shimmer in rainbow light.',
  sturgeon: 'An ancient, armoured giant with a long snout and whiskers; it can live a century.',
  burbot: 'The only freshwater cod: whiskered, mottled and hungry at night.',
  paddlefish: 'A long paddle of a snout, and a mouth that sieves the water.',
  // the midnight zone and the sunless cave
  viperfish: 'Fangs too big for its mouth, and lights down its sides.',
  dragonfish: 'Black as the water, with a red light it can see by and nothing else can.',
  oarfish: 'The longest bony fish in the sea: a silver ribbon with a red crest.',
  cavecrab: 'A pale, long-feelered crab of the sunless cave, awake at any hour.',
  glassfish: 'So clear you can see through them; they school with a faint glow.',
  cavesalamander: 'A pale pink salamander of the caves, gilled and very long-lived.',
  // the abyss and the drowned cathedral
  barreleye: 'A fish with a see-through head and eyes that look up through it.',
  tripodfish: 'Stands on the abyss floor on three long fin-stilts, facing the current.',
  seaspider: 'All legs: a spindly red crawler of the abyss floor.',
  wraithcarp: 'A pale, half-see-through carp of the drowned cathedral.',
  belljelly: 'A golden bell-shaped jelly that lights the flooded aisles.',
  choirfish: 'A spined, violet fish of the cathedral; they say it sings.',
  // the hadal trench and the flooded crypts
  amphipod: 'A pale, many-legged scavenger of the trench floor.',
  cuskeel: 'A pale eel-like fish that lives deeper than any other.',
  cryptcrab: 'A bone-white crab of the crypts, spotted with dark.',
  shroudfish: 'A dark, trailing fish with pale bands, like a shroud in the water.',
  // the black below and the roots of the world
  firesquid: 'Tiny squid that glitter blue in the black water.',
  swallower: 'A black fish that can swallow prey twice its own size.',
  rootcrawler: 'A long, many-legged crawler of the roots of the world.',
  lampeel: 'A dark eel lit with golden spots, winding through the roots.',
  // the drowned city and the sunken city
  gargoyle: 'Horned, spined and stone-grey: it watches from the ruins and hunts from them.',
  lanternjelly: 'A green-glowing jelly that drifts through the drowned streets.',
  bellwarden: 'A shelled crawler with horns and a green glow, keeping the sunken bells.',
  runefish: 'Small schooling fish netted with glowing green marks like writing.',
  // the dreaming dark
  dreamer: 'A vast violet drifter of the dreaming dark. Whatever it dreams, the pond dreams too.',
  thoughtfish: 'A fish covered in eyes, glowing gold, thinking.',
  // the deep past (the bestiary's own)
  opabinia: 'Five eyes and a single long grasping trunk: one of the Cambrian sea’s strangest.',
  helicoprion: 'A shark-like hunter with a spiral whorl of teeth in its lower jaw.',
  arandaspis: 'One of the first fish: jawless, flat and plated.',
  tiktaalik: 'A fish with legs, halfway out of the water: a hunter of the Devonian shallows.',
  // where it stops being of this world
  glasseel: 'A see-through eel lit magenta from inside, from the Starfall trench.',
  voidmanta: 'A manta as dark as the space between the stars, flecked with light.',
  lattice: 'A drifting geometry that glows white. It may not be alive in any way we mean.',
  starfin: 'Small schooling fish speckled gold like a night sky.',
  hollowwalker: 'Something dark that walks on long legs, with a violet light where it should be empty.',
  mirrorfish: 'A fish like polished silver: what it reflects is not quite this pond.',
};
// The young and the visitors (no dock button, but in the pond).
const GUIDE_OTHERS = [
  ['Tadpole', 'A frog’s young: it swims, grows legs, and climbs out a frog. Prey for most fish.'],
  ['Firefly', 'Out over the water at night. How many come shows your score; blue ones only come to the highest-scoring ponds.'],
  ['Gnat', 'Clouds of them over the water by day: food for frogs and fish at the surface.'],
  ['Gull', 'Visits any pond with a beach by day: it circles, walks the sand, and dives for frogs, crabs and dragonflies (a third of the time it catches one). It would rather scavenge remains, and leaves at dusk or in heavy rain.'],
  ['Wanderers', 'Fierce animals that leave one pond sometimes turn up in another, on rare occasions, to terrorize the natives.'],
  ['Paragons', 'The finest of a line: breed a rare line again and again (3, 8, 20 and 50 times), or score well with a species, and it earns a Paragon: free, Pristine, carrying its line’s traits and a gift, with a crown of light. The rail’s ♛ lists the ones waiting and how close the next are.'],
];

// ---- the looks: rare colours and forms ------------------------------------------------------------------
const LOOK_NOTES = {
  pale: 'washed-out colours',
  piebald: 'patches of white (recessive: both parents must carry it)',
  giant: 'much bigger than its kind',
  dwarf: 'much smaller than its kind',
  melanistic: 'nearly black (recessive)',
  xanthic: 'all yellows and golds (recessive)',
  marbled: 'swirled and mottled',
  axanthic: 'no yellow at all: blues and greys (recessive)',
  albino: 'white, with pink eyes (recessive)',
  leucistic: 'white, with dark eyes',
  shiny: 'a colour its kind is never born in',
  ghost: 'half see-through',
  glow: 'it glows in the dark',
  chimera: 'two animals in one: each half a different colour',
  touched: 'the eldritch mark: the first stage',
  changed: 'the eldritch mark: new eyes open, the water nearby feels wrong',
  eldritch: 'transcended: a crown of tentacles and a sigil that glows at night',
  ascended: 'beyond transcendent',
};
// What each working gene does.
const GENE_NOTES = {
  fertility: 'more eggs, sooner, and shorter rests between broods',
  longevity: 'a longer life',
  vitality: 'harder to kill: it shrugs off fights, sickness and hunger',
  intellect: 'quicker to find food and to get out of trouble',
  light: 'it glows, and lights the dark around it',
  aggression: 'it picks fights (and a pond of aggressive animals is harder water)',
  tolerance: 'it copes with the wrong water, the dark and poison',
  territory: 'it holds its ground and drives others off',
  resilience: 'it gets sick less, and gets better',
  stealth: 'hunters overlook it',
  speed: 'it swims faster',
  luck: 'rarer young',
};

// ---- the window ------------------------------------------------------------------------------------------
const guideUi = { open: false, chapter: 'start', q: '', here: false, cache: {} };
const GUIDE_CHAPTERS = [
  ['start', 'Start here'], ['animals', 'Animals'], ['plants', 'Plants & rocks'], ['food', 'Food & tools'], ['builds', 'Builds'],
  ['breeding', 'Breeding'], ['genes', 'Genes & traits'], ['depths', 'The depths'], ['land', 'The land & the cycle'], ['sky', 'Sky & sea'], ['dark', 'Blood & the dark'],
  ['together', 'Animals together'], ['eldritch', 'The eldritch'], ['alien', 'The alien'], ['hunters', 'Hunters'], ['score', 'Score & ledger'], ['ponds', 'Ponds & friends'], ['keys', 'Controls'],
];
WINDOWS.push(['guide', () => setGuide(false)]);

function setGuide(open, chapter) {
  guideUi.open = open;
  byId('guide').hidden = !open;
  byId('rail-guide').setAttribute('aria-expanded', open);
  if (!open) return;
  closeWindows('guide');
  if (chapter) { guideUi.chapter = chapter; guideUi.q = ''; byId('guide-q').value = ''; }
  renderGuide();
}

// ---- small helpers ----------------------------------------------------------------------------------------
const gCap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const gList = (a, n = 6) => (a.length <= n ? a.join(', ') : `${a.slice(0, n).join(', ')} and ${a.length - n} more`);
const HAB_WORD = { fresh: 'Fresh', salt: 'Salt', both: 'Both', mixed: 'Both' };
const WATER_NAME = { fresh: 'Fresh water', salt: 'Salt water', mixed: 'Fresh and salt' };
const RARITY_TAG = ['common', 'uncommon', 'scarce', 'exotic', 'legendary', 'legendary'];
const habTag = (h) => [HAB_WORD[h] || 'Both', h === 'fresh' || h === 'salt' ? CLASS_COLOR[h] : '#bfe0e0'];
const tierLabel = (i) => { const t = DEPTH_TIERS[i]; return !t ? '' : t.salt === t.fresh ? t.salt : `${t.salt} / ${t.fresh}`; };
const tierIn = (i) => tierLabel(i).replace(/\bThe\b/g, 'the'); // (mid-sentence: "opens with the Devonian dark")
const yrs = (y) => (y === 1 ? '1 year' : yearsLabel(y));
const pondTier = () => (world.erosion && world.erosion.tier) || 0;
const priceText = (t) => [t.price ? `${fmt(t.price)} pearls` : t.price === 0 ? 'free' : '', t.essence ? `${fmt(t.essence)} essence` : '', t.corruption ? `${fmt(t.corruption)} corruption` : ''].filter(Boolean).join(' + ');
const likeWord = (k) => LIKE_LABEL[k] || (STRUCTURES[k] ? STRUCTURES[k].label.toLowerCase() : TOOLS[k] ? TOOLS[k].label.toLowerCase() : k);
const minutesLabel = (s) => (s < 90 * 60 ? `about ${Math.max(1, Math.round(s / 60))} minutes` : `about ${Math.round(s / 3600)} hours`);
const kindPredator = (k) => ['eel', 'snake', 'octopus'].includes(k) || DEEP_PREDATORS.has(k);
const kindPrey = (k) => ['tetra', 'shrimp', 'cavefish'].includes(k) || !!(DESIGNS[k] && DESIGNS[k].small);
const livingOf = (k) => world.creatures.filter((c) => c.species === k && c.life && !c.leaving && !c.dying);

// Who likes a plant, rock or structure (every species, not just this pond's).
function likedBy(key) {
  const who = Object.entries(LIKES).filter(([k, l]) => l.includes(key) && SINGULAR[k] && k !== 'tadpole').map(([k]) => SINGULAR[k].toLowerCase());
  for (const k of STRUCT_LIKES[key] || []) if (SINGULAR[k] && !who.includes(SINGULAR[k].toLowerCase())) who.push(k === 'wild' ? 'wild fish' : SINGULAR[k].toLowerCase());
  return who;
}
// Where a species breeds, in words.
function breedText(k) {
  const B = BREED[k];
  if (!B) return 'doesn’t breed in the pond: it comes, and goes, on its own';
  const at = Object.values(STRUCTURES).filter((d) => d.habitatFor && d.habitatFor.includes(k)).map((d) => d.label.toLowerCase());
  const eggs = { plant: 'on plants', floor: 'on the floor', rock: 'on rocks', surface: 'at the surface' }[B.eggs] || '';
  return B.needs ? `breeds only at ${gList(at.map((a) => `the ${a}`), 2).replace(/, (?=[^,]*$)/, ' or ')}${eggs ? `, laying ${eggs}` : ''}` : `lays ${B.clutch[0]}–${B.clutch[1]} eggs ${eggs}${at.length ? ` (more at the ${at[0]})` : ''}`;
}

// ---- the chapters: each a list of sections, each a list of entries ---------------------------------------
// An entry: { name, text, icon?, color?, tags?: [[word, colour]], facts?: [..], state?: () => text, here?: () => bool, act?: [label, fn] }
function speciesEntry(k) {
  const S = SPECIES_STATS[k] || SPECIES_STATS.wild, d = DEEP[k], hab = SPECIES_HABITAT[k] || 'both', tags = [habTag(hab)];
  if (d && d.mythic) tags.push(['Mythic', TIER_COLOR[5]]);
  else tags.push([RARITY_TAG[Math.min(5, S.rarity)], TIER_COLOR[Math.min(4, S.rarity)]]);
  if (kindPredator(k)) tags.push(['hunter', '#ef6f6c']);
  if (kindPrey(k)) tags.push(['prey', '#bfe0e0']);
  if (LIGHT_SPECIES[k]) tags.push(['glows', '#ffe45c']);
  const rh = RHYTHM[k] || (d ? 'always' : 'day');
  if (rh === 'night' || rh === 'dusk') tags.push([rh === 'night' ? 'night' : 'dusk', '#8a9ae0']);
  const facts = [];
  if (k !== 'wild') facts.push(`lives ${yrs(S.years)} (${minutesLabel(lifeSeconds(S.years))} here)`);
  if (S.group) facts.push(`in groups of about ${S.group}`);
  facts.push(breedText(k));
  const likes = (LIKES[k] || []).filter((x) => x !== 'river');
  const builds = Object.entries(STRUCT_LIKES).filter(([, l]) => l.includes(k)).map(([s]) => s);
  if (likes.length || builds.length) facts.push(`likes ${gList([...new Set([...likes, ...builds])].map(likeWord), 5)}`);
  if (d && d.deepMin) facts.push(`keeps to deep water (${Math.round(d.deepMin * 100)}% down or more)`);
  if (d) facts.push(`${d.tier ? `opens with ${tierIn(d.tier)}; ` : ''}unlock for ${fmt(d.unlock)} essence in the depths`);
  return {
    key: `sp:${k}`, name: k === 'wild' ? 'Wild species' : SINGULAR[k], icon: () => speciesIcon(k), color: d && d.mythic ? TIER_COLOR[5] : null,
    tags, text: SPECIES_NOTES[k] || '', facts,
    here: () => fitsHabitat(world, hab) && deepAvailable(world, k),
    state: () => {
      const n = livingOf(k).length, bits = [];
      if (n) bits.push(`${n} in this pond`);
      if (!fitsHabitat(world, hab)) bits.push(`not in ${WATER_NAME[world.opts.habitat].toLowerCase()} ponds`);
      else if (!deepAvailable(world, k)) bits.push(`this pond isn’t that deep yet`);
      else if (typeof knows === 'function' && !knows(world, k) && !DEEP[k]) bits.push(`hasn’t found its way in yet (${oddsWord(kindOdds(world, k))})`);
      else if (typeof spawnable === 'function' ? !spawnable(world, k) : !deepUnlocked(world, k)) bits.push('ready to unlock in the depths');
      else bits.push(`in the dock (${spawnCost(k)} essence)`);
      return bits.join(' · ');
    },
    act: () => (livingOf(k).length ? ['Find one', () => { const c = livingOf(k)[0]; setGuide(false); follow(c); }] : null),
  };
}

function chapterAnimals() {
  const base = Object.keys(SPECIES).filter((k) => !DEEP[k]), top = Math.max(...Object.values(DEEP).map((d) => d.tier));
  const secs = [];
  for (let i = 0; i <= top; i++) {
    const kinds = Object.keys(DEEP).filter((k) => DEEP[k].tier === i && SPECIES[k]);
    if (!i) kinds.unshift(...base);
    if (!kinds.length) continue;
    secs.push({
      title: i ? tierLabel(i) : 'Every pond: the reef and the pond',
      note: !i ? 'What every pond can have from the start (the first few find their way in as the plants mature), and what the dock can add once unlocked in the depths.'
        : `From erosion ${fmt(DEPTH_TIERS[i].erosion)}.${i >= 12 ? ' Where it stops being of this world.' : i >= 9 ? ' The deep past: life that should be long gone.' : ''}`,
      entries: kinds.map(speciesEntry),
    });
  }
  secs.push({ title: 'Also in the pond', note: 'The young, the visitors, and the special.', entries: GUIDE_OTHERS.map(([name, text]) => ({ key: `o:${name}`, name, text })) });
  return secs;
}

function chapterStart() {
  const cur = (name, color, text) => ({ key: `c:${name}`, name, color, text });
  return [
    { title: 'A living pond', entries: [
      { key: 's:life', name: 'It lives on its own', text: 'Animals hatch, feed, grow up, breed, grow old and move on; new fish species are invented as you watch; plants grow, seed and die back; the surf slowly wears the pond deeper. You look after it, and it pays you back.' },
      { key: 's:pointer', name: 'The pointer', text: 'The arrow, first on the bar along the bottom, is for looking: click an animal, a plant or a structure for its card; clicking the water does nothing. Pick a food, a plant, a build or the Net to use it instead, and Esc brings the pointer back.' },
      { key: 's:feed', name: 'Feed', text: 'Pick Pellets (free) and click the water to drop them. Well-fed animals grow, breed and stay; hungry ones wander off. Better food is in the actions.' },
      { key: 's:touch', name: 'Look closer', text: 'Click an animal for its card (genes, traits, family, what it’s doing, and boosts to buy); drag one to move it. Click a plant or a structure to read about it and grow its traits. Point at almost anything for a tip.' },
      { key: 's:rail', name: 'The item bar and the actions', text: 'Along the bottom: your pinned actions, then ▴ for all of them (food, tools, plants, builds and creatures). Hover one and press + to pin it. NEW marks what just opened up.' },
      { key: 's:dock', name: 'The animals', text: 'Down the left, under ☰ the menu: the census on top (how many live here; click it for the details), then one button per kind (click one to spawn it for essence; its card lets you add boosts and a grade), then ? for the wildlife still to come, and the hatchery. Deep species join once you unlock them in the depths.' },
      { key: 's:hard', name: 'Hard mode', tags: [['points ×1.5', '#ef6f6c']], text: 'A pond’s own choice, under Fresh, Both and Salt in the menu: animals can’t be bought or summoned, only drawn in by the habitat you build and plant (and lures). Fewer come, fewer breed, it starts with fewer, and time runs slower. Its points count half again. New ponds start the way you last left it; the pond’s bar says HARD.' },
      { key: 's:kinds', name: 'New kinds come slowly', text: 'A new pond knows only its pioneers. The rest find their way in one kind at a time, with a pause after each that grows as the pond gets to know more; each pond has its own odds for each kind (from its seed), and they drift with the seasons. You can spawn a kind from the dock once it has come. The dock’s ? lists what could still come and how likely each is here: lure one (pearls) to make it far likelier to come next, or summon it (essence) to bring it at dawn.' },
      { key: 's:music', name: 'Sound and music', text: 'Sound (M) is a soundscape made live from what you’re looking at. Music (N) is off until you turn it on: quiet phrases of two pieces, cut up and cued by what happens in the pond (a birth, a hunt, dawn, something from the deep), faded in and out with long rests between, and muffled the deeper you look. Set its level in the menu’s Scene.' },
      { key: 's:depths', name: 'The depths', text: 'The little side view above the map: the beach, the floor and the deep. Click it for the depths: how far the pond has worn, what lives at each stage, and what’s ready to unlock.' },
    ] },
    { title: 'The water', note: 'Chosen from the menu; a pond regrows from day one if you change it.', entries: Object.entries(DIFFICULTY).map(([k, D]) => ({
      key: `w:${k}`, name: WATER_NAME[k] || k, tags: [habTag(k), [D.label, '#ffd166']], text: `${gCap(D.note)}. Points ×${D.points}.`,
    })) },
    { title: 'What you earn', entries: [
      cur('Depth', CLASS_COLOR.points, 'Your score: the pond’s deepest point, in fathoms. It deepens with time and the tides, with what you build and grow, with evolution, and a little with your points.'),
      cur('Points', CLASS_COLOR.points, 'For every birth (more for rare ones), rare arrivals, new species, records and the ledger’s dividends. Harder water pays more of them.'),
      cur('Pearls', CLASS_COLOR.pearls, 'Every point pays a pearl, and so does each dawn. Pearls buy plants, food, structures and a hunter’s body.'),
      cur('Essence', CLASS_COLOR.essence, 'Buys animals from the dock, gene boosts, unlocks in the depths and deepening. It comes back when you recycle an animal with the Net, when one lives out its life, from the deep structures, and a little each dawn.'),
      cur('Corruption', '#3aff9a', 'Yielded by the marked as they change. It buys the eldritch paths, corrupted plants, the dark island and eldritch traits.'),
    ] },
  ];
}

function plantEntry(k) {
  const t = TOOLS[k], salt = ['anemone', 'coral', 'urchin'].includes(k), fresh = ['marimo', 'duckweed', 'lily'].includes(k);
  const hab = t.habitat || (salt ? 'salt' : fresh ? 'fresh' : 'both'), who = likedBy(t.likedBy || k), facts = [];
  if (t.deepMin) facts.push('grows only in deep water');
  if (t.tier) facts.push(`opens with ${tierIn(t.tier)}`);
  if (who.length) facts.push(`liked by ${gList(who, 8)}`);
  return {
    key: `t:${k}`, name: t.label, icon: () => toolIcon(k), tags: [habTag(hab), [priceText(t) || 'free', CLASS_COLOR.pearls]],
    text: gCap(PLANT_TIPS[k] || ''), facts,
    here: () => fitsHabitat(world, hab) && (t.tier || 0) <= pondTier(),
  };
}
function chapterPlants() {
  const kinds = Object.keys(TOOLS).filter((k) => !TOOLS[k].build && !TOOLS[k].food && k !== 'net');
  return [
    { title: 'To plant and place', note: 'Pick one from the actions, then click the pond. Plants grow, shed plankton, calm the water, seed and in time die back; the Net takes one out.', entries: kinds.map(plantEntry) },
    { title: 'Growing a plant', note: 'Right-click or long-press a plant in the pond for its traits.', entries: Object.entries(PLANT_TRAITS).map(([k, P]) => ({
      key: `pt:${k}`, name: P.label, tags: [[`up to ${P.max}`, '#bfe0e0'], [P.cur || 'pearls', CLASS_COLOR[P.cur || 'pearls'] || '#bfe0e0']], text: gCap(P.note),
    })) },
  ];
}

function chapterFood() {
  const foods = Object.keys(TOOLS).filter((k) => TOOLS[k].food);
  return [
    { title: 'Food', note: 'Pick one, then click the water to drop it.', entries: foods.map((k) => {
      const t = TOOLS[k], facts = [];
      if (FOOD_FED[t.food]) facts.push(`keeps an animal full for about ${FOOD_FED[t.food]} seconds`);
      if (t.tier) facts.push(`opens with ${tierIn(t.tier)}`);
      const text = k === 'feed' ? 'Free food: a few pellets where you click. Every animal eats them' : gCap(t.hint.replace(/^[^:]+: /, ''));
      return { key: `f:${k}`, name: t.label, icon: () => toolIcon(k), tags: [habTag(t.habitat || 'both'), [priceText(t) || 'free', CLASS_COLOR.pearls]], text, facts,
        here: () => (!t.habitat || fitsHabitat(world, t.habitat)) && (t.tier || 0) <= pondTier() };
    }) },
    { title: 'Tools, and things to click', entries: [
      { key: 't:net', name: 'Net', icon: () => toolIcon('net'), text: 'Click an animal to recycle it for essence (more for rarer ones), a plant or rock to take it out, a structure to take it down (half its pearls back), or an alien artifact to break it up.' },
      { key: 't:remains', name: 'Remains', text: 'An animal that dies of age or hunger sinks and leaves remains: click them (with anything but the Net) for extra essence and a few points. Left alone, scavengers pick them clean.' },
      { key: 't:fossil', name: 'Fossils', text: `Now and then the tide uncovers one on the beach. Click it for essence and an ancient gene to give a new spawn or a brood. The grades: ${Object.values(FOSSIL_GRADES).map((f) => f.label.replace(/^an? /, '')).join(', ')}; deeper ponds turn up rarer ones, and a relic holds an artifact.` },
      { key: 't:litter', name: 'Litter', text: `Popular ponds draw it along the tide line (${Object.values(LITTER).map((l) => l.label.replace(/^an? /, '')).join(', ')}). Click to clear it for a pearl or more; left alone it fouls the water.` },
      { key: 't:slick', name: 'Oil slicks', text: 'Oil rigs leak. Click a slick to skim it off before it spreads, sickens animals and wakes the tar.' },
      { key: 't:deepen', name: 'Deepening by hand', text: 'In the depths, spend essence to wear the pond deeper now (dearer each time).' },
    ] },
  ];
}

function chapterBuilds() {
  const entries = Object.entries(STRUCTURES).map(([k, d]) => {
    const facts = [], who = likedBy(k);
    if (d.unique) facts.push('one of a kind');
    if (d.tier) facts.push(`opens with ${tierIn(d.tier)}`);
    if (d.deepMin) facts.push('only in deep water');
    if (d.dawnEssence) facts.push(`${d.dawnEssence} essence each dawn`);
    if (d.dawnPearls) facts.push(`${d.dawnPearls} pearls each dawn`);
    if (d.habitatFor && d.habitatFor.length) facts.push(`lets ${gList(d.habitatFor.filter((s) => SINGULAR[s] || s === 'wild').map((s) => (s === 'wild' ? 'wild fish' : SINGULAR[s].toLowerCase())), 8)} breed`);
    if (who.length) facts.push(`liked by ${gList(who, 8)}`);
    return {
      key: `b:${k}`, name: d.label, icon: () => toolIcon(`build-${k}`), tags: [habTag(d.habitat || 'both'), [priceText(TOOLS[`build-${k}`]), CLASS_COLOR.pearls]],
      text: gCap(d.desc), facts,
      here: () => (!d.habitat || fitsHabitat(world, d.habitat)) && (d.tier || 0) <= pondTier(),
      state: () => { const n = (world.structures || []).filter((s) => s.kind === k).length; return n ? `${n} in this pond` : ''; },
    };
  });
  return [
    { title: 'Structures', note: 'Pick one from the actions, then click the pond. Each has an area of effect; anything left standing on the floor slowly scours it deeper. The Net takes one down for half its pearls.', entries },
    { title: 'Growing a structure', note: 'Click a structure in the pond for its traits.', entries: [
      ...Object.entries(STRUCT_TRAITS).map(([k, P]) => ({ key: `st:${k}`, name: P.label, tags: [[`up to ${P.max}`, '#bfe0e0']], text: gCap(P.note) })),
      { key: 'st:terrace', name: 'Terraces', text: 'Build an island on an island to raise it a terrace higher, up to ten. From the third, it takes a branch that grows as it rises:' },
      ...Object.entries(ISLAND_BRANCH).map(([k, B]) => ({ key: `ib:${k}`, name: B.label, tags: [[B.cur, CLASS_COLOR[B.cur] || '#3aff9a']], text: gCap(B.note) })),
    ] },
  ];
}

function chapterBreeding() {
  return [
    { title: 'How animals breed', entries: [
      { key: 'br:pairs', name: 'Pairs', text: 'Two grown, well-fed animals of a kind in breeding condition lay eggs (on plants, the floor, rocks or the surface, by kind). Brine shrimp, krill and bloodworms bring them straight into condition. The young inherit their parents’ genes, and the rare ones pass on.' },
      { key: 'br:caps', name: 'Crowding', text: 'Each kind breeds up to a cap for the pond’s size. Crowded species fight and sicken; the last few of a kind are always spared.' },
      { key: 'br:hab', name: 'Breeding habitats', text: 'Some kinds breed only at a habitat (the spawning gravel, the amphibian pool, the reef nursery, the brood chamber), and every kind lays more at its own. What stands around one shapes the young: glowing plants, springs and corals for better; litter, carrion and the idol for worse.' },
      { key: 'br:lines', name: 'Lines and Paragons', text: 'Breed the same rare again and each one is worth 25% more, up to 3×. Breed a line 3, 8, 20 and 50 times, or score well with a species, and it earns a Paragon, free: the finest of its line. The rail’s ♛ has them, and how close the next are.' },
      { key: 'br:keep', name: 'Keep safe', text: 'Mark an animal Keep safe on its card and nothing recycles it until you unmark it.' },
    ] },
    { title: 'The hatchery', note: 'A build (one of a kind): up to five breeding pens, fed by clicking, taking turns; its broods lean toward the trait you pick.', entries: [
      { key: 'hf:focus', name: 'Breed for', tags: [['focus', '#ffd166']], text: `Pick what its broods lean toward: ${gList(Object.values(HATCH_FOCUS).map((F) => F.label.toLowerCase()), 20).replace(/, (?=[^,]*$)/, ' or ')}.` },
      ...Object.entries(HATCH_UPGRADES).map(([k, U]) => ({ key: `hu:${k}`, name: U.label, tags: [['upgrade', '#7ed07a'], [U.cur, CLASS_COLOR[U.cur] || '#bfe0e0']], text: gCap(U.note || '') })),
    ] },
    { title: 'Spawn grades', note: 'On a spawn card you can pay for a guaranteed grade: how good its working genes are.', entries: GRADES.map((g, i) => ({ key: `gr:${g}`, name: g, color: GRADE_COLOR[i], text: i < 2 ? 'no extra cost' : `costs ${GRADE_PRICE[i]}× the spawn’s price` })) },
  ];
}

function chapterGenes() {
  const trait = (k, text, extra = []) => ({ key: `tr:${k}`, name: gCap(k), color: RARE_OUTLINE[k] !== undefined ? hex6(RARE_OUTLINE[k]) : null, tags: [[TIERS[Math.min(5, TRAIT_RARITY[k] || 0)], TIER_COLOR[Math.min(5, TRAIT_RARITY[k] || 0)]], ...extra], text: gCap(text) });
  return [
    { title: 'Rarity', note: 'Each animal’s traits add up to a tier. Births score by it, and so does the leaderboard.', entries: TIERS.map((t, i) => ({ key: `ti:${t}`, name: t, color: TIER_COLOR[i], text: `${TIER_VALUE[i]} point${TIER_VALUE[i] === 1 ? '' : 's'} a birth${i ? `; ${TIER_ESSENCE[i]} extra essence when recycled` : ''}.` })) },
    { title: 'Looks', note: 'Colours and forms, inherited like real genes: recessive, dominant or incompletely dominant.', entries: Object.entries(LOOK_NOTES).filter(([k]) => TRAIT_RARITY[k] !== undefined).map(([k, n]) => trait(k, n)) },
    { title: 'Working genes', note: 'Every animal carries these; boost them on its card, or breed for them.', entries: Object.entries(GENE_NOTES).map(([k, n]) => ({ key: `gn:${k}`, name: GENE_INFO[k] ? GENE_INFO[k].label : gCap(k), color: GENE_INFO[k] && GENE_INFO[k].color, text: gCap(n) })) },
    { title: 'Boosts', note: 'Bought for a new spawn (its card) or an animal in the pond, with essence.', entries: Object.entries(ENHANCE).map(([k, E]) => ({ key: `en:${k}`, name: E.label, text: gCap(E.note || '') })) },
    { title: 'Built all the way', note: 'An animal whose working gene is raised to its last level (ten, on its card) shows it, subtly and on the move.', entries: typeof MASTERY_LOOKS === 'undefined' ? [] : ANIMAL_TRAITS.filter((k) => MASTERY_LOOKS[k]).map((k) => ({ key: `ms:${k}`, name: (ENHANCE[k] && ENHANCE[k].label) || gCap(k), tags: [['level 10', '#ffd166']], text: `${gCap(MASTERY_LOOKS[k])}.` })) },
    { title: 'Gifts', note: 'Rarer than anything before them, and they pass on.', entries: Object.keys(GIFTS).map((k) => trait(k, TRAIT_NOTES[k])) },
    { title: 'Curses', note: 'They pass on too, far oftener if you run the pond fast or shorten its days.', entries: Object.keys(CURSES).map((k) => trait(k, TRAIT_NOTES[k], [['curse', '#ef6f6c']])) },
    { title: 'Ancient genes', note: 'From fossils: a rare trait to give a new spawn or a brood.', entries: [{ key: 'tr:ancient-genes', name: 'In the fossils', text: `${gCap(gList(ANCIENT_GENES.map((g) => (Array.isArray(g) ? g[0] : g)), 12))}. The rarer the fossil, the rarer the gene.` }] },
  ];
}

function chapterDepths() {
  const top = Math.max(15, pondTier() + 1), entries = [];
  for (let i = 0; i <= top && DEPTH_TIERS[i]; i++) {
    const kinds = Object.keys(DEEP).filter((k) => DEEP[k].tier === i && SPECIES[k]).map((k) => SINGULAR[k]);
    const builds = Object.values(STRUCTURES).filter((d) => (d.tier || 0) === i && i).map((d) => d.label);
    const tools = Object.values(TOOLS).filter((t) => !t.build && (t.tier || 0) === i && i).map((t) => t.label);
    const opens = [kinds.length ? `life: ${gList(kinds, 10)}` : '', builds.length ? `builds: ${builds.join(', ')}` : '', tools.length ? `food and plants: ${tools.join(', ')}` : ''].filter(Boolean);
    entries.push({
      key: `d:${i}`, name: tierLabel(i), color: i <= pondTier() ? '#ffd166' : null, tags: [[i ? `erosion ${fmt(DEPTH_TIERS[i].erosion)}` : 'the start', '#bfe0e0']],
      text: opens.length ? `${gCap(opens.join('; '))}.` : i > 14 ? 'Only more room, further out and darker.' : 'Where every pond starts.',
      state: () => (i <= pondTier() ? (i === pondTier() ? 'this pond is here' : 'reached') : ''),
    });
  }
  return [
    { title: 'Wearing deeper', entries: [
      { key: 'd:how', name: 'Erosion', text: 'Surf and big tides wear the pond (salt water fastest, fresh slowest); structures and plants left standing on the floor scour it deeper; a faster speed or shorter days speed it up, and essence does it by hand. Each stage opens further out and darker, with its own life, builds, food and plants.' },
      { key: 'd:salt', name: 'Two branches', text: 'Salt water goes down into the abyss and on into the deep past; fresh water down into the drowned cathedral and the old swamps. A mixed pond gets both.' },
      { key: 'd:arrive', name: 'Deep arrivals', text: 'Once a stage is open, its life can come up on its own (rarely; the mythic almost never, unless something draws them), and you can unlock it in the depths to spawn from the dock.' },
    ] },
    { title: 'The stages', entries },
  ];
}

function chapterLand() {
  const col = (k) => (typeof LAND_COL !== 'undefined' ? hex6(LAND_COL[k]) : null);
  return [
    { title: 'The land remembers', note: 'Over the days the floor takes on the character of what lives, dies, grows and stands on it. The map’s Land layer shows it.', entries: [
      { key: 'ln:how', name: 'What marks it', text: 'Animals leave their nature where they spend their time (the thriving, the marked, the mad, the parasite-ridden, the mythic, the prehistoric, the glowing). Skeletons sink into the sand and enrich it by what they were. Plants add to it as they grow and as they die. Structures, artifacts, blood, oil and fossils mark it too. Each dawn it fades a little and spreads a little.' },
      { key: 'ln:slow', name: 'Slowly', text: 'The floor is repainted a patch at a time; formations, island plants and sinking bones grow and fade through the day, not all at once.' },
      ...Object.entries(LAND).map(([k, D]) => ({ key: `ln:${k}`, name: gCap(D.name), color: col(k), text: `${gCap(D.note)}.` })),
    ] },
    { title: 'Formations', note: 'Where the land holds strongly, it grows its own features over the days, and loses them if it fades.', entries: Object.entries(FORMS).map(([k, F]) => ({ key: `fm:${k}`, name: F.name, color: col(k), tags: [[LAND[k].name, col(k) || '#bfe0e0']], text: `${gCap(F.note)}.` })) },
    { title: 'Islands', note: 'Each island has its own character from its seed, and its own plants that sprout, grow, die and come back, leaning toward what the land around it has become.', entries: [
      ...Object.entries(ISLE_KINDS).map(([k, K]) => ({ key: `is:${k}`, name: gCap(K.name), tags: [[K.water === 'deep' ? 'over the deep' : K.water === 'any' ? 'any water' : `${K.water} water`, '#bfe0e0']], text: `Grows ${gList(Object.keys(K.flora).map((f) => ({ palm: 'palms', bush: 'bushes', flower: 'flowers', grass: 'grass', shrub: 'shrubs', moss: 'moss', pine: 'pines', reed: 'reeds', willow: 'willows', fern: 'ferns' }[f] || f)), 6).replace(/, (?=[^,]*$)/, ' and ')}.` })),
      { key: 'is:evo', name: 'As the land turns', text: `An island takes on the land around it: ${Object.entries(ISLE_EVO).map(([k, v]) => `${LAND[k].name}: ${v}`).join('; ')}.` },
    ] },
    ...(typeof ISLE_FEATS === 'undefined' ? [] : [
      { title: 'Islands that grow', note: 'An island keeps changing for as long as it stands.', entries: [
        { key: 'ig:stages', name: 'Growing up', text: `Bare sand, greening, wooded, forested, and at last old growth: each wants time (a grove brings it on sooner), growth on it, and the later ones height (level 3, then 5) and life in the land around. Each stage carries more growth, and bigger trees.` },
        { key: 'ig:size', name: 'Its size drifts', text: 'Toward what its water allows: sheltered water, a living shore, reed beds, mangroves and a reef build it out; surf wears it (salt water most, and hardest out over the deep). Storms take bites out of it, and it builds back slowly; an eruption adds new rock. Nourishing its beach grows it at once and holds it. What grew where the sea has taken the ground dies back.' },
        { key: 'ig:coast', name: 'Its coastline', text: 'Over its first forty days or so it wanders from a round cay into headlands and coves.' },
        { key: 'ig:own', name: 'Of its own accord', text: 'Things arise on an island where they suit it, now and then at a dawn: a reef round a coral cay (and slowly round other salt islands once they’re wooded), reeds round a fresh one, mangroves in salt shallows, birds nesting on a wooded island, tide pools in rock, a spring on a high forested one, fire under a black islet out over the deep, and a great tree on old growth. Each can be grown further from its card.' },
        { key: 'ig:life', name: 'Its life', text: 'Iguanas bask on its rocks once it greens (skinks in fresh water); seals haul out on the bigger salt islands once they’re wooded (more with tide pools); terns nest in a rookery (herons in a heronry over fresh water), dive for fish and pay for what they leave; frogs, dragonflies and fireflies gather at a spring. None of them is the pond’s: click one to hear what it is.' },
      ] },
      { title: 'Growing an island', note: 'From the island’s card (click it), besides raising it and its branch.', entries: ISLE_FEAT_ORDER.map((k) => ({ key: `if:${k}`, name: k === 'rookery' ? 'Rookery or heronry' : ISLE_FEATS[k].label, color: ISLE_FEATS[k].color, tags: [[ISLE_FEATS[k].cur, CLASS_COLOR[ISLE_FEATS[k].cur] || '#bfe0e0'], [`${ISLE_FEATS[k].max} level${ISLE_FEATS[k].max === 1 ? '' : 's'}`, '#bfe0e0']], text: `${gCap(ISLE_FEATS[k].note)}.${{ reef: ' Salt water.', reeds: ' Fresh water.', mangrove: ' Salt water, not over the deep.', pools: ' A rocky island, or one grown wooded.', spring: ' Level 3 and up.', fire: ' An island out over the deep, or a black islet.', giant: ' A forest island.' }[k] || ''}` })) },
    ]),
    { title: 'Islands that join', note: 'Islands close to each other grow a sandbar between them over about ten days, under water at first, then dry. What they become together depends on what each has become.', entries: Object.entries(ISLE_JOINS).map(([k, J]) => ({ key: `ij:${k}`, name: gCap(J.name), text: `${gCap(J.note)}.` })) },
    { title: 'The cycle', entries: [
      { key: 'cy:det', name: 'Detritus', text: 'Bits of dead plant, picked-over carcass and old food left on the floor.' },
      { key: 'cy:scav', name: 'Scavengers', text: `${gCap(gList([...SCAVENGE].filter((k) => SINGULAR[k]).map((k) => plural(SINGULAR[k], 2).toLowerCase()), 20).replace(/, (?=[^,]*$)/, ' and '))} seek it out and eat it: it feeds them, and the rest goes back into the floor as richness, so plants grow better where they work. What nobody eats rots into the floor, slower.` },
      { key: 'cy:dens', name: 'Dens', text: 'Hermit crabs, octopuses and crayfish move into bottles and cans (morays and eels into tyres): a home, and one less piece of litter.' },
      { key: 'cy:nets', name: 'Nets and tyres', text: 'Small scavengers pick ghost nets apart; an old tyre left long enough grows over into a little reef.' },
      { key: 'cy:grow', name: 'The pond keeps growing', text: 'It creeps further out a pixel at a time: each dawn adds a little to what it’s owed (more the deeper it has gone and the more it has scored), and each new depth a long way, and it pays that out through the day whenever you’re not dragging or pinching. What’s already on its deep floor stays where it is.' },
    ] },
    { title: 'Up the beach', note: 'Past the top of your beach the land carries on. Pan up past the sand to see it: a little shows at first, and the haze lifts slowly, a pixel or so a pond day and a little more as the pond deepens (the dunes after a month or so, the jungle after half a year). The more cursed the pond, the faster: the land shows what’s coming. What has shown stays shown. It isn’t part of the pond (nothing is kept there); click it to hear what it is.', entries: [
      { key: 'up:sand', name: 'The upper beach', text: 'Dry sand above the tides, with the weed, shells and driftwood the storms threw up.' },
      { key: 'up:dunes', name: 'Dunes', text: 'Ridges the wind heaps up, held by marram grass, with ghost crabs’ holes; the river cuts down between them.' },
      { key: 'up:scrub', name: 'Scrub', text: 'Shrubs and palms (willows and reeds by fresh water) where the river comes down, and wildflowers in the grass. By the pond’s climate: cactus and agave where it’s dry, ferns, bamboo and flowering bushes where it’s warm and wet, pines and birches where it’s cold, mangroves where the river meets warm salt water. A heron fishes its edge by day; fireflies come out over it at night.' },
      { key: 'up:river', name: 'The river', text: 'It runs on up the land from wherever its course meets your beach, winding back into the valley it has always come down, and on into the trees.' },
      { key: 'up:jungle', name: 'The jungle', tags: [['a long way up', '#8a9ae0']], text: 'At last, a jungle: dark under its canopy and black further in. Eyes look out of it, a few by day and many at night; they blink, and slip away when you come near.' },
      { key: 'up:imps', name: 'What comes out of it', tags: [['cursed ponds', '#3aff9a'], ['rare', '#ef6f6c']], text: 'A fortnight of pond days after the jungle shows, in a pond far enough gone in its curse, small red things with horns come out from under the trees now and then, mostly at night: a few pixels high, one to three of them. They walk a little way into the scrub, stand looking at the pond, and go back in. They run from the pointer. Each time they come, they’re a little more used to the pond.' },
      { key: 'up:tribute', name: 'The tribute', tags: [['found, not bought', '#ffd166']], text: `A grinning figure of black glass: found very rarely inside an alien artifact broken up with the Net, or washed up on the beach of a pond where they lie. Once found, raise it on the dry beach (from Build, ${STRUCTURES.tribute ? STRUCTURES.tribute.pearls : 40} pearls). Each time the things come out of the jungle there’s a chance (better the more often they’ve come) that they come all the way down to it, dance round it in a ring, and leave something at its feet: essence, pearls or an old bone, and corruption.` },
    ] },
    { title: 'Each pond its own', note: 'From its seed every pond has a character of its own (the score panel says what yours is), and what’s done with it moves it on.', entries: [
      { key: 'ch:sand', name: 'Its sand', text: 'Dark volcanic, white coral, red iron, grey glacial, gold, slate, pink, or somewhere between: the floor, the beach and the land up it all share it. A cursed pond’s sand goes to ash, a step at a time at dawn.' },
      { key: 'ch:rock', name: 'Its rock', text: 'Granite, sandstone, slate, basalt, limestone or red rock, lying as that rock does: rounded boulders, flat slabs or tall stacks (in new ponds, and the rocks you place).' },
      { key: 'ch:warm', name: 'The warmth of its water', text: 'Cold to tropical (the sky tracker gives it in degrees). Vents, springs and smokers warm it; the deep and the curse chill it. Warm water draws reef fish, puffers, octopus, rays, turtles, frogs and koi; cool water crabs, starfish, eels, snails, shrimp, ducks and axolotls. It tints the water too, and it decides which plants come up by themselves.' },
      { key: 'ch:plants', name: 'What grows by itself', text: 'Warm water grows lotus, water hyacinth, seagrass, sponges and sea fans; cold water kelp, hornwort and moss. Every pond favours two or three plants of its own besides, so no two floors fill in alike. Its islands and the land up its beach grow to its climate too.' },
      { key: 'ch:weather', name: 'Its weather', text: 'A wet pond rains often, a dry one seldom. A cursed pond draws storms, oftener and harder, and now and then ash falls on it instead of rain; the light over it turns sickly. An alien pond’s sky turns violet, and sometimes it rains glass.' },
      { key: 'ch:dead', name: 'Dead calm', tags: [['cursed and empty', '#8a8c90']], text: 'A cursed pond with nothing left alive in it for half a day goes completely still: no wind, no rain, no surf, the water like glass under a grey sky, until something lives there again.' },
    ] },
    { title: 'On the beach', note: 'Animals of the beach itself: not the pond’s (no genes, not in the census, not yours to net or carry off), but they live off it. Click one to hear what it is.', entries: [
      { key: 'bc:turtle', name: 'Sea turtles', tags: [['salt and both waters', '#bfe0e0'], ['night', '#8a9ae0']], text: 'On some dark nights a turtle comes in from the sea and hauls herself up the beach, leaving a track like a tyre’s. Above the high-water mark she digs, lays her eggs, covers them and goes back to the sea. The tide washes the track away.' },
      { key: 'bc:nest', name: 'Nests and hatchlings', text: 'A nest hatches two or three pond days after it was laid, at the next dusk or dawn: the hatchlings come up out of the sand and run for the sea. Gulls and ghost crabs take some; each that makes it is worth an essence. Click a nest to see when it’s due.' },
      { key: 'bc:ghost', name: 'Ghost crabs', tags: [['salt and both waters', '#bfe0e0']], text: 'Pale crabs with burrows high up the beach. Out at dusk and through the night they dash and freeze and dash, chase hatchlings, and run for their holes when anything comes near; peering out, they hold still and watch you.' },
      { key: 'bc:pipers', name: 'Sandpipers', tags: [['day', '#ffd166']], text: 'A little flock that runs the water’s edge after the waves, probing the wet sand. Come close (or let a gull come down) and they all take off low along the beach. They leave at dusk.' },
      { key: 'bc:gulls', name: 'Gulls', tags: [['day', '#ffd166']], text: 'They wheel over the water, walk the sand, scavenge what washes up and dive for frogs, crabs, dragonflies and hatchlings.' },
    ] },
  ];
}

function chapterSky() {
  const moon = typeof MOON_PHASES !== 'undefined' ? MOON_PHASES : [];
  return [
    { title: 'Day, night, moon and tide', entries: [
      { key: 'k:day', name: 'Day and night', text: 'Days pass as you watch (set the day length in the sky tracker, top right). Night brings the fireflies and the night creatures; the dark feeds madness.' },
      { key: 'k:moon', name: 'The moon', text: `It goes round every 8 days (${moon.join(', ').toLowerCase()}). Its phase sets the tides and how bright the nights are; on a full moon the corals spawn and the fish feast.` },
      { key: 'k:tide', name: 'Tides and surf', text: 'Spring tides at new and full moon. The surf on the beach wears the pond deeper; salt water has the biggest.' },
      { key: 'k:weather', name: 'Weather', text: 'Rain showers and wind gusts come and go, oftener in a wet pond and seldom in a dry one; a cursed pond draws storms and ash, an alien one glass rain (turn weather off in the menu’s Scene).' },
      { key: 'k:daycount', name: 'The day', text: 'The pond’s day is counted under the sun or moon at the top right.' },
    ] },
    { title: 'The heavens', note: 'What the sky does besides day, night and rain.', entries: [
      ...Object.entries(HEAVENS).map(([k, H]) => ({ key: `h:${k}`, name: H.label, tags: [[H.night ? 'night' : 'day', H.night ? '#8a9ae0' : '#ffd166']], text: gCap(H.note) })),
      { key: 'h:bloodrain', name: 'Blood rain', tags: [['rare', '#ef6f6c']], text: 'Rain that falls red: when the stars are right, under a blood moon, or when the pond is steeped in corruption. The water reddens, and the marked drink it in.' },
    ] },
    { title: 'Artifacts', note: 'Held in relics (the rarest fossils). Once found, they appear in the sky tracker.', entries: Object.entries(ARTIFACTS).map(([k, A]) => ({ key: `a:${k}`, name: A.label, tags: [['artifact', '#ffd166']], text: gCap(A.note) })) },
  ];
}

function chapterDark() {
  const rolls = (W) => (W.roll.length > 1 ? `${W.roll[0]}–${W.roll[W.roll.length - 1]}` : `${W.roll[0]}`);
  return [
    { title: 'Red in tooth and claw', entries: [
      { key: 'x:rage', name: 'Rage', text: 'Darkness and corruption make animals aggressive. At night, under a blood moon and in blood rain, hunters hunt sooner, and the marked, the feral and the abominations turn on anything smaller and pick fights with their equals (only so many a night).' },
      { key: 'x:blood', name: 'Blood in the water', text: 'A red cloud where an animal is caught or hurt. Hunters smell it from far off and come to it.' },
      { key: 'x:chase', name: 'The chase', text: 'A hunter closing in leaves a wake of bubbles; its quarry bolts and jinks.' },
    ] },
    { title: 'The dice', note: 'As one of the marked changes, when it takes in its own, and sometimes on a red night, it rolls two dice and its nature warps.', entries: Object.entries(WARPS).map(([k, W]) => ({
      key: `wp:${k}`, name: gCap(k === 'darkloving' ? 'dark-loving' : k === 'manyeyed' ? 'many-eyed' : k), color: W.color, tags: [[`rolls ${rolls(W)}`, '#ffd166']], text: gCap(W.note),
    })) },
    { title: 'Sickness', entries: [
      ...Object.entries(ILLS).map(([k, I]) => ({ key: `il:${k}`, name: gCap(I.name || k), color: I.color, tags: [['ill', '#ef6f6c']], text: gCap(I.note.replace(/^[^:]+: /, '')) })),
      { key: 'il:blight', name: 'Blights', tags: [['dawn', '#ffd166']], text: 'A dirty, busy pond risks one at dawn: an algal bloom, or a sickness in a crowded species. Aerators make them rarer.' },
    ] },
    { title: 'Greed and its price', entries: [
      { key: 'g:wreck', name: 'Wrecks', text: 'The further out a ship goes down, the bigger the ship (a sloop, a galleon, a ship-of-the-line, a great liner), the dearer, and the richer its salvage each dawn.' },
      { key: 'g:rig', name: 'Oil rigs', text: 'A fortune in pearls each dawn, pumped from the deep. But they leak: slicks drift on the current; animals under them sicken, plants wither and the water fouls. Click a slick to skim it.' },
      { key: 'g:tar', name: 'The tar', text: 'Where slicks gather, the tar wakes: a living sludge that crawls toward whatever grows, swallows slicks to grow, kills plants and poisons what swims near. It starves without oil: take the rigs down and clean the water.' },
    ] },
  ];
}

function chapterEldritch() {
  const E_NOTES = [
    'A mark that comes from nowhere (1 in 3,000 births), from fossils, or from being born near the drowned idol or in the abyss. It passes to young: 15% from one marked parent, 35% from two.',
    'The change comes on over a lifetime: faster at night, in deep water, near the idol or the whale fall, and near the mythic. New eyes open; the water nearby feels wrong.',
    'Transcended: a crown of tentacles and a sigil that glows at night. It draws small animals into circling it, drives the closest mad, dreams its mark into its neighbours, and wears the pond deeper.',
  ];
  return [
    { title: 'The mark', note: 'A rare branch of its own, shown in the depths. Darkness feeds it and daylight resists it.', entries: ELD_STAGES.map((s, i) => ({ key: `el:${s}`, name: s, color: CLASS_COLOR[['touched', 'changed', 'eldritch'][i]], text: E_NOTES[i] })) },
    { title: 'The eldritch paths', note: 'Bought for the whole pond with corruption, in the depths; some need others first.', entries: Object.entries(ELD_PATHS).map(([k, P]) => ({
      key: `ep:${k}`, name: P.label, tags: [[`${P.cost} corruption`, '#3aff9a']], text: `${gCap(P.note)}.${P.needs.length ? ` Needs ${P.needs.map((n) => ELD_PATHS[n].label).join(' and ')}.` : ''}`,
      state: () => (eldPath(world, k) ? 'open in this pond' : ''),
    })) },
    { title: 'On a marked animal’s card', entries: [
      ...Object.entries(ELD_TRAITS).map(([k, T]) => ({ key: `et:${k}`, name: T.label, tags: [['corruption', '#3aff9a']], text: `${gCap(T.note)}.` })),
      { key: 'et:dream', name: 'Feed the dream, or bind it', text: 'Essence pushes the change on, or sets it back and stops it.' },
    ] },
    { title: 'Quirks', note: 'Strange ways the marked pick up.', entries: Object.keys(QUIRKS).map((k) => ({ key: `q:${k}`, name: gCap(k), color: hex6(RARE_OUTLINE[k]), text: gCap(TRAIT_NOTES[k]) })) },
    { title: 'The narrator', entries: [{ key: 'n:story', name: 'Field notes', text: `Someone keeps notes on your pond in the journal. As the pond gives itself to the dark, their voice goes: ${STORY_STAGES.join(', ')}.` }] },
  ];
}

function chapterAlien() {
  return [
    { title: 'Not of this world', entries: [
      { key: 'al:art', name: 'Alien artifacts', text: 'From the deep past on (seldom, a little oftener the deeper the pond goes, and now and then with a meteor shower), something comes to rest on the deep floor at dawn. Each carries a strain of parasite and adapts: most dawns its strain grows a generation older, and the older it is the more it releases (more at night). The Net breaks one up for points and essence, but a shard sometimes lingers and grows back; very rarely, inside one, there’s a tribute (see Up the beach).' },
      { key: 'al:host', name: 'Riding a host', text: 'A larva drifts to the nearest animal it can ride and latches on (at most about a quarter of the pond at once). It feeds on its host and changes it, breeds more larvae and spreads its contagion. When its host dies or leaves it jumps off; when its host is eaten, it goes into whatever ate it.' },
      { key: 'al:lamp', name: 'The quarantine lamp', text: STRUCTURES.quarantine ? `${gCap(STRUCTURES.quarantine.desc)}.` : 'In its light parasites let go and larvae die.' },
    ] },
    { title: 'The parasites', entries: Object.entries(PARASITES).map(([k, P]) => ({
      key: `pa:${k}`, name: gCap(P.label), color: P.color, tags: [[`from the ${P.thing}`, P.color], [ILLS[P.ill] ? ILLS[P.ill].name : P.ill, ILLS[P.ill] ? ILLS[P.ill].color : '#bfe0e0']], text: `${gCap(P.note)}.`,
    })) },
    { title: 'The evolved', note: 'Very rarely, an animal that has carried an old strain for a day gives rise to something new: a young of its kind with one of its parasite’s traits in its blood for good. It’s Mythic, immune to its own parasite, and passes the trait on.', entries: Object.entries(XENO).map(([k, X]) => ({
      key: `xe:${k}`, name: gCap(k === 'longcoiled' ? 'long-coiled' : k === 'sporebearing' ? 'spore-bearing' : k), color: X.color, tags: [['Mythic', TIER_COLOR[5]]], text: gCap(X.note.replace(/^evolved: /, '')),
    })) },
  ];
}

function chapterTogether() {
  return [
    { title: 'When different kinds meet', note: 'Each has its own little dance; look for the signs over them.', entries: [
      { key: 'tg:clean', name: 'Cleaning stations', text: 'A cleaner wrasse or a shrimp swims up to a bigger fish (hunters too), which stops and holds still while the cleaner circles its head, picking it over. The fish comes away calmer; now and then the cleaner takes off a parasite that was riding it, or a sickness.' },
      { key: 'tg:display', name: 'Displays', text: 'Territorial kinds (bettas, clownfish, crabs, hermit crabs, crayfish, lionfish, morays, pike) that meet something about their size flare up and circle each other until one backs down.' },
      { key: 'tg:ride', name: 'Riders', text: 'Small fish ride alongside a big calm animal (a turtle, a ray, a shark, a sturgeon, a koi) for a while; the hunters leave them be while they’re there.' },
      { key: 'tg:ball', name: 'Bait balls', text: 'A school a hunter comes close to swirls tight around its middle.' },
      { key: 'tg:warn', name: 'Warnings', text: 'Lionfish, pufferfish and sea spiders flare at a hunter that comes for them, and it thinks better of it.' },
      { key: 'tg:scraps', name: 'Scraps', text: 'Scavengers trail a hunter at a distance, and when it catches something they pick up the scraps (which go back into the floor).' },
    ] },
    { title: 'The balance, by hand', note: 'Open the census (the number at the top of the animals down the left) and a kind’s row.', entries: [
      { key: 'tg:protect', name: '🛡 Protect a kind', text: 'The hunters leave it alone. It costs a pearl a dawn for every two of them; if you can’t pay, the protection lapses.' },
      { key: 'tg:cull', name: '🎯 Cull a kind', text: 'The hunters go for it first, and every catch pays a bounty. The census marks a kind that has outgrown the pond (well past what it breeds up to, or a big share of everything).' },
      { key: 'tg:refuge', name: 'The refuge', icon: () => toolIcon('build-refuge'), text: `${gCap(STRUCTURES.refuge.desc)}. A build (${priceText(TOOLS['build-refuge'])}).` },
    ] },
  ];
}

function chapterHunters() {
  return [
    { title: 'Building a hunter', note: `Any predator (and any swimmer you wake to the hunt, for ${AWAKEN.essence} essence and ${AWAKEN.corruption} corruption) can be built up on its card: ten levels in each of eight ways, each dearer than the last. Built up far enough, a hunter takes anything smaller than itself.`, entries: Object.entries(HUNT).map(([k, H]) => ({
      key: `hn:${k}`, name: H.label, tags: [[H.cur, CLASS_COLOR[H.cur] || '#3aff9a']], text: `${gCap(H.note)}.${typeof MASTERY_LOOKS !== 'undefined' && MASTERY_LOOKS[k] ? ` Built all the way (level ${HUNT_MAX}): ${MASTERY_LOOKS[k]}.` : ''}`,
    })) },
  ];
}

function chapterScore() {
  return [
    { title: 'Scoring', entries: [
      { key: 'sc:births', name: 'Births', text: `Every birth scores by its rarity (${TIERS.map((t, i) => `${t} ${TIER_VALUE[i]}`).join(', ')}). The first of a kind in your pond adds 20.` },
      { key: 'sc:more', name: 'And the rest', text: 'Rare animals arriving on their own: half their tier. A new wild species: 10. A generation record: 5 a generation. Coral spawning: 20. An animal that lives out its life: 1.' },
      { key: 'sc:mult', name: 'Harder water pays more', text: `Fresh ×${DIFFICULTY.fresh.points}, salt ×${DIFFICULTY.salt.points}, both ×${DIFFICULTY.mixed.points}; points are also scaled to the pond’s size, so small and big ponds compete fairly.` },
      { key: 'sc:dawn', name: 'Each dawn', text: 'A pearl for each species in the pond, more for how comfortable they are, salvage from wrecks, essence from the deep and the ledger’s dividends.' },
      { key: 'sc:board', name: 'The leaderboard', text: 'Every pond’s depth, shared, with the rare finds in every pond. Open it from the score bar (P).' },
    ] },
    { title: 'The ledger', note: 'Everything bought except food goes on the pond’s ledger (essence counts 5 pearls, corruption 8). A tenth comes back at once, and each dawn every line pays its rate in points (and as many pearls), and a twenty-fifth of that in essence.', entries: Object.entries(INVEST).map(([k, I]) => ({
      key: `iv:${k}`, name: gCap(I.label), tags: [[`${(I.rate * 100).toFixed(1).replace(/\.0$/, '')}% a dawn`, '#ffd166']], text: I.keep < 1 ? `What’s in it wears down as time goes on (${Math.round((1 - I.keep) * 100)}% a dawn).` : k === 'build' ? 'It stays on the ledger until it’s taken down.' : 'It stays on the ledger for good.',
    })) },
  ];
}

function chapterPonds() {
  return [
    { title: 'Your ponds', entries: [
      { key: 'p:save', name: 'It saves itself', text: 'Your pond saves itself in this browser and is waiting when you come back. The address bar always holds its short four-word link: bookmark it or share it.' },
      { key: 'p:discord', name: 'Sign in with Discord', text: 'Keep your ponds in your account and carry on from any browser; show your name on a pond if you like (the menu’s Your ponds).' },
      { key: 'p:copies', name: 'Links and copies', text: 'Friends who open your link get their own copy to grow. Tick “Visitors can only look” and they can watch it, but not take a copy.' },
      { key: 'p:new', name: 'More than one', text: 'Start a New pond from Your ponds; the old one stays saved, and you can switch back.' },
    ] },
    { title: 'Neighbours', entries: [
      { key: 'p:beach', name: 'One long beach', text: 'All ponds share one beach: the next player’s pond lies right past the end of yours. The little arrows either side of the pond’s name say who’s there (the score panel lists them too); click one, or drag on past the end of the beach, to walk over: you can look around but not touch, walk on, or come home the same way.' },
      { key: 'p:hide', name: 'Just your pond', text: 'Scene → Neighbours hides the ponds either side: the view keeps to yours and a drag stops at its ends. The arrows by its name still walk you over.' },
      { key: 'p:name', name: 'Naming your pond', text: 'Open the score (the pond’s name at the top) and choose Name it: up to 24 letters, shown on the bar, the leaderboard and the beach. Hateful or obscene names aren’t allowed.' },
      { key: 'p:wander', name: 'Wanderers', text: 'Fierce animals that leave one pond sometimes turn up in another to terrorize the natives.' },
    ] },
  ];
}

function chapterKeys() {
  const K = [['Click', 'look (with the pointer), or use the picked action'], ['Esc', 'back to the pointer'], ['Drag', 'move an animal, or pan the water'], ['Scroll, + / −', 'zoom'], ['Arrows / WASD', 'pan'], ['0', 'reset the view'], ['F', 'follow the animal under the pointer'],
    ['T', 'tour: the camera wanders between animals'], ['C', 'the census'], ['J', 'the journal'], ['P', 'the score and leaderboard'], ['L', 'change the light'], ['B', 'bones: the spines and legs'],
    ['Space', 'pause'], ['M', 'sound'], ['N', 'music'], ['H', 'the menu'], ['G', 'this guide'], ['Right-click / long-press', 'a plant’s traits']];
  const T = [['Tap', 'look, or use the picked action (like a click)'], ['Drag', 'pan the water, or move an animal'], ['Pinch', 'zoom'], ['Follow', 'from the animal’s card (the view keeps it clear of the card)'],
    ['Press and hold', 'a button: what it does (letting go then doesn’t press it); the pond: the card of what’s there, or what it is'], ['▦', 'show or hide the map (beside the zoom)'], ['The news line', 'tap it for the journal']];
  return [{ title: 'Controls', entries: K.map(([k, v]) => ({ key: `k:${k}`, name: k, text: gCap(v) })) },
    { title: 'On a phone or tablet', note: 'Windows come up from the bottom (or down the side, held sideways); × or a tap on the water closes them.', entries: T.map(([k, v]) => ({ key: `kt:${k}`, name: k, text: gCap(v) })) }];
}

const GUIDE_BUILD = {
  start: chapterStart, animals: chapterAnimals, plants: chapterPlants, food: chapterFood, builds: chapterBuilds, breeding: chapterBreeding, genes: chapterGenes,
  depths: chapterDepths, land: chapterLand, sky: chapterSky, dark: chapterDark, together: chapterTogether, eldritch: chapterEldritch, alien: chapterAlien, hunters: chapterHunters, score: chapterScore, ponds: chapterPonds, keys: chapterKeys,
};
// A chapter's sections (built once; they read the tables, not the pond, so they keep).
function guideChapter(id) {
  if (!guideUi.cache[id]) {
    try { guideUi.cache[id] = GUIDE_BUILD[id](); } catch (e) { console.warn('guide', id, e); guideUi.cache[id] = []; }
  }
  return guideUi.cache[id];
}

// ---- drawing it -------------------------------------------------------------------------------------------
function guideEntry(e) {
  const row = el('div', 'g-entry'), ic = el('span', 'g-ic'), body = el('div', 'g-body'), head = el('div', 'g-head');
  if (e.icon) { const icon = e.icon(); if (icon) ic.append(iconImg(icon, 30)); }
  const nm = el('b', null, e.name);
  if (e.color) nm.style.color = e.color;
  head.append(nm);
  for (const [w, c] of e.tags || []) if (w) head.append(chip(w, c));
  body.append(head);
  if (e.text) body.append(colored('p', 'g-text', /[.!?…:)]$/.test(e.text) ? e.text : `${e.text}.`));
  if (e.facts && e.facts.length) body.append(colored('p', 'g-facts', `${gCap(e.facts.join(' · '))}.`));
  const st = e.state && e.state();
  if (st) body.append(el('p', 'g-state', st));
  const act = e.act && e.act();
  if (act && !world.observe) { const b = el('button', 'g-act', act[0]); b.type = 'button'; b.addEventListener('click', act[1]); body.append(b); }
  row.append(ic, body);
  return row;
}
const guideHit = (e, q) => `${e.name} ${e.text} ${(e.facts || []).join(' ')} ${(e.tags || []).map((t) => t[0]).join(' ')}`.toLowerCase().includes(q);

function renderGuide() {
  if (!guideUi.open) return;
  const q = guideUi.q.trim().toLowerCase(), out = [];
  for (const b of byId('guide-nav').children) b.setAttribute('aria-pressed', !q && b.dataset.ch === guideUi.chapter);
  byId('guide-here').setAttribute('aria-pressed', guideUi.here);
  const keep = (e) => !guideUi.here || !e.here || e.here();
  let found = 0;
  const chapters = q ? GUIDE_CHAPTERS : GUIDE_CHAPTERS.filter(([id]) => id === guideUi.chapter);
  for (const [id, label] of chapters) {
    const secs = guideChapter(id);
    let shownCh = false;
    for (const s of secs) {
      const list = s.entries.filter((e) => keep(e) && (!q || guideHit(e, q)));
      if (!list.length || found > 120) continue;
      if (q && !shownCh) { out.push(el('h3', 'g-ch', label)); shownCh = true; }
      out.push(el('h4', 'g-sec', s.title));
      if (s.note && !q) out.push(colored('p', 'note g-note', s.note));
      for (const e of list) out.push(guideEntry(e));
      found += list.length;
    }
  }
  if (!out.length) out.push(el('p', 'note', q ? `Nothing in the guide matches “${guideUi.q.trim()}”.` : 'Nothing here for this pond yet.'));
  const body = byId('guide-body');
  body.replaceChildren(...out);
  if (!q) byId('guide').scrollTop = 0;
}

function initGuide() {
  const nav = byId('guide-nav');
  for (const [id, label] of GUIDE_CHAPTERS) {
    const b = el('button', 'chip', label);
    b.type = 'button'; b.dataset.ch = id;
    b.addEventListener('click', () => { guideUi.chapter = id; guideUi.q = ''; byId('guide-q').value = ''; renderGuide(); });
    nav.append(b);
  }
  byId('guide-q').addEventListener('input', (e) => { guideUi.q = e.target.value; renderGuide(); });
  byId('guide-here').addEventListener('click', () => { guideUi.here = !guideUi.here; renderGuide(); });
  byId('guide-close').addEventListener('click', () => setGuide(false));
  byId('rail-guide').addEventListener('click', () => setGuide(!guideUi.open));
  byId('open-guide').addEventListener('click', () => setGuide(true));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && guideUi.open) { setGuide(false); return; }
    if (e.target.closest && e.target.closest('select, input, textarea')) return;
    if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey && !e.altKey) setGuide(!guideUi.open);
  });
}
initGuide();
