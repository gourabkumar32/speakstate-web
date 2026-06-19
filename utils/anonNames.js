const adjectives = [
  'curious','brave','bright','quiet','merry','wild','bold','gentle','clever','lucky','witty','sly','calm','fierce','mystic','steady'
];

const nouns = [
  'fox','otter','panda','sparrow','raven','wolf','badger','beetle','rabbit','tiger','whale','dolphin','hawk','falcon','lynx','dingo'
];

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function generateAnonName() {
  const adj = adjectives[randomInt(adjectives.length)];
  const noun = nouns[randomInt(nouns.length)];
  const num = Math.floor(1000 + Math.random() * 9000); // 4-digit number
  return `${adj}_${noun}_${num}`;
}

module.exports = { generateAnonName };
