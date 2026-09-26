'use strict';
// 256 short, friendly words for pond links: four of them make an id like
// amber-heron-moss-lantern (256^4, about 4.3 billion links).
// Append-only in spirit: removing a word would orphan the links that use it.

module.exports = `
acorn alder amber anchor apple aqua arrow ash aspen autumn azure badger bamboo bark basil
basin bay beach bead beam bee beetle berry birch bison bloom blue bluff bough bramble
brass breeze briar brook bubble bud cairn calm canal canoe canyon cedar chalk cherry cinder clay
clear cliff cloud clover coast cobble comet copper coral cove crane creek crest crow crystal
cyan cypress daisy dale dawn delta dew dove drift dune dusk echo eddy egret elm ember
falcon feather fennel fern field finch fjord flint flora foam fog fox frond frost gale garden
garnet gecko geyser ginger glade glen glow gold grass grove gull harbor harvest hazel heath heron
hill hollow holly honey hush indigo iris isle ivy jade jasper jay juniper kelp kestrel kite
lagoon lake lantern lark leaf lemon lichen lily lime linen loch lotus lunar lynx
maple marble marsh meadow meteor minnow mint mist moon moor moss nectar newt north oak
oasis ocean olive onyx opal orbit orchid osprey otter owl oyster paddle palm pearl pebble
perch petal pine plover plum pollen pond poppy prairie puffin quartz quill raft rain rapids raven
reed reef ridge ripple river robin rock rose ruby saffron sage salt sand sapling sedge
shade shell shoal shore silver sky slate snow sorrel south spark sparrow spring sprout spruce
squall star stone storm stream summer sun surf swallow swan tadpole teal tern thistle thorn thyme
tide timber toad topaz trail trout tulip tundra twig vale valley velvet violet walnut wave whisper
willow wind winter wisp wood wren yarrow yew zephyr
`.trim().split(/\s+/);
