function getSpiritMeta(type, level) {
  const map = {
    snail: {
      name: "蜗牛守护灵",
      desc: "慢慢来也没关系，我会陪你一点点往前。",
      color: "#B7A58A"
    },
    squirrel: {
      name: "松鼠守护灵",
      desc: "把今天的小收获好好收藏起来吧。",
      color: "#D08B5B"
    },
    bird: {
      name: "小鸟守护灵",
      desc: "愿你的心事落在风里，也飞向更高处。",
      color: "#7FAEEA"
    },
    butterfly: {
      name: "蝴蝶守护灵",
      desc: "每一次情绪波动，都是正在长出新翅膀。",
      color: "#D899C6"
    }
  };

  const spirit = map[type] || map.snail;
  let stage = "幼生期";
  if (level >= 5) stage = "星光期";
  else if (level >= 4) stage = "守护期";
  else if (level >= 3) stage = "活力期";
  else if (level >= 2) stage = "成长初期";

  return { ...spirit, stage };
}

function calcLevel(exp) {
  return Math.floor(exp / 10) + 1;
}

function generateWelcomeByNotes(notes, spiritType) {
  if (!notes || !notes.length) return "欢迎回家，今天也把心事轻轻放进树洞吧。";
  const latest = notes[0];

  if (latest.category === "todo") return "今天挑一件最小的事开始吧，我会陪你完成。";
  if (latest.category === "trouble") return "那些烦恼先交给树洞和我，你不用一个人扛着。";
  if (latest.category === "dream") return "你写下的梦想，正在树梢悄悄发亮。";
  if (latest.category === "wish") return "愿望会慢慢长叶子，我们一起等它开花。";
  if (latest.category === "mood") return "你的心情我有认真收藏，今天也要温柔一点对自己。";

  const fallback = {
    snail: "不着急，我们慢慢来。",
    squirrel: "今天也收集一点点小成就吧。",
    bird: "抬头看看高处，也许有新的风景。",
    butterfly: "你的情绪会变成翅膀，带你飞过今天。"
  };

  return fallback[spiritType] || fallback.snail;
}

module.exports = {
  getSpiritMeta,
  calcLevel,
  generateWelcomeByNotes
};