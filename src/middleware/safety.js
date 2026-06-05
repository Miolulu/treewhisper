const bannedWords = [
  "毒品", "枪支", "炸弹", "约炮", "嫖娼", "赌博", "代开", "办证", "自杀直播"
];

function containsBannedWords(text = "") {
  return bannedWords.some(word => text.includes(word));
}

function detectSensitiveMood(text = "") {
  const dangerWords = ["不想活了", "结束生命", "自杀", "活不下去", "轻生"];
  return dangerWords.some(word => text.includes(word));
}

module.exports = {
  containsBannedWords,
  detectSensitiveMood
};
