const express = require("express");
const multer = require("multer");
const path = require("path");
const dayjs = require("dayjs");
const { requireAuth } = require("../middleware/auth");
const { calcLevel, generateWelcomeByNotes } = require("../utils/spirit");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "../../public/uploads"));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_"));
  }
});

const upload = multer({ storage });

module.exports = function (prisma) {
  const router = express.Router();

  // 精灵主页
  router.get("/", requireAuth, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const latestNotes = await prisma.note.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 5
    });
    const welcomeMessage = user.welcomeMessage ||
      generateWelcomeByNotes(latestNotes, user.spiritType);
    res.render("spirit", { user, welcomeMessage, error: null, currentPage: "spirit" });
  });

router.get("/album", requireAuth, async (req, res) => {
    const images = await prisma.albumImage.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" }
    });
    res.render("album", { currentPage: "album", images, error: null });
});

  // 选择/更换精灵（重置进度）
 router.post("/choose", requireAuth, async (req, res) => {
    const { type } = req.body;
    const validTypes = ["snail", "squirrel", "bird", "butterfly"];
    if (!validTypes.includes(type)) return res.redirect("/spirit");

    await prisma.user.update({
        where: { id: req.user.id },
        data: {
            spiritType: type,
            spiritExp: 0,        // ← 重置经验
            spiritLevel: 1       // ← 等级从1开始
        }
    });
    res.redirect("/spirit");
});

  // 喂食（每日限1次，使用 FeedLog）
  router.post("/feed", requireAuth, async (req, res) => {
    const today = dayjs().format("YYYY-MM-DD");
    const start = dayjs(today).startOf("day").toDate();
    const end = dayjs(today).add(1, "day").startOf("day").toDate();

    const fedToday = await prisma.feedLog.findFirst({
      where: { userId: req.user.id, createdAt: { gte: start, lt: end } }
    });
    if (fedToday) {
      return res.json({ error: "今天已经喂食过啦，明天再来吧～" });
    }

    const foodExpMap = { honey: 8, seed: 6, flower: 5, dew: 3 };
    const foodExp = foodExpMap[req.body.food] || 3;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const newExp = (user.spiritExp || 0) + foodExp;
    const newLevel = calcLevel(newExp);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { spiritExp: newExp, spiritLevel: newLevel }
    });
    await prisma.feedLog.create({ data: { userId: req.user.id } });

    res.json({ success: true, exp: foodExp, newExp, newLevel });
  });

  // 抚摸（每日限3次，使用 PetLog）
  router.post("/pet", requireAuth, async (req, res) => {
    const today = dayjs().format("YYYY-MM-DD");
    const start = dayjs(today).startOf("day").toDate();
    const end = dayjs(today).add(1, "day").startOf("day").toDate();

    const petCount = await prisma.petLog.count({
      where: { userId: req.user.id, createdAt: { gte: start, lt: end } }
    });
    if (petCount >= 3) {
      return res.json({ error: "今天已经抚摸三次啦，小精灵累了，明天再陪它玩吧～" });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const newExp = (user.spiritExp || 0) + 2;
    const newLevel = calcLevel(newExp);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { spiritExp: newExp, spiritLevel: newLevel }
    });
    await prisma.petLog.create({ data: { userId: req.user.id } });

    res.json({ success: true, newExp, newLevel });
  });

// 每日树叶插画
router.get("/album/daily-leaf", requireAuth, async (req, res) => {
  // 根据日期生成一个固定的随机索引，保证同一天看到同一张图
  const today = dayjs().format("YYYY-MM-DD");
  const leafCount = 11; // 你准备的树叶图片数量
  
  // 用日期哈希出一个稳定的索引
  let hash = 0;
  for (let i = 0; i < today.length; i++) {
    hash = ((hash << 5) - hash) + today.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % leafCount + 1;
  
  const leafImage = "/public/images/leaves/leaf-" + index + ".png";
  
  // 查询今天是否已生成
    let record = await prisma.albumImage.findFirst({
        where: {
            userId: req.user.id,
            caption: today        // 用日期作为唯一标识
        }
    });

    // 如果不存在，才创建
    if (!record) {
        record = await prisma.albumImage.create({
            data: {
                userId: req.user.id,
                imageUrl: leafImage,
                caption: today
            }
        });
    }

    res.json({ image: record.imageUrl, date: record.caption });
});

// 获取树影集照片列表（JSON）
router.get("/album/photos", requireAuth, async (req, res) => {
  const photos = await prisma.albumImage.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" }
  });
  res.json({ photos });
});

  return router;
};