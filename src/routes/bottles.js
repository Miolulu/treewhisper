const express = require("express");
const dayjs = require("dayjs");
const { requireAuth } = require("../middleware/auth");
const { containsBannedWords } = require("../middleware/safety");
const { renderContent } = require("../utils/content");
const { calcLevel } = require("../utils/spirit");   // ← 引入 calcLevel

module.exports = function (prisma, io) {
  const router = express.Router();

  // 捡纸团首页
  router.get("/", requireAuth, (req, res) => {
    res.render("bottle", { note: null, error: null });
  });

  // 摇树核心接口
  router.get("/shake", requireAuth, async (req, res) => {
    const today = dayjs().format("YYYY-MM-DD");
    const start = dayjs(today).startOf("day").toDate();
    const end = dayjs(today).add(1, "day").startOf("day").toDate();

    // 检查今日摇树次数
    const pickupCount = await prisma.bottlePickup.count({
      where: {
        receiverUserId: req.user.id,
        createdAt: { gte: start, lt: end }
      }
    });

    if (pickupCount >= 5) {
      const errorMsg = "你今天摇树次数已用完啦，明天再试试吧～";
      if (req.query.format === 'json') {
        return res.json({ error: errorMsg });
      }
      return res.render("bottle", { note: null, error: errorMsg });
    }

    // 获取已捡过的纸团 ID
    const picked = await prisma.bottlePickup.findMany({
      where: { receiverUserId: req.user.id },
      select: { noteId: true }
    });
    const pickedIds = picked.map(p => p.noteId);

    // 候选纸团
    const candidates = await prisma.note.findMany({
      where: {
        status: "thrown",
        userId: { not: req.user.id },
        id: { notIn: pickedIds },
        isSensitive: false
      },
      orderBy: { thrownAt: "asc" },
      take: 30
    });

    if (!candidates.length) {
      const errorMsg = "暂时没有新的纸团掉下来，过一会儿再摇摇看吧～";
      if (req.query.format === 'json') {
        return res.json({ error: errorMsg });
      }
      return res.render("bottle", { note: null, error: errorMsg });
    }

    const note = candidates[Math.floor(Math.random() * candidates.length)];

    // 记录此次捡纸团
    await prisma.bottlePickup.create({
      data: {
        noteId: note.id,
        receiverUserId: req.user.id
      }
    });

    // ========== 捡纸团增加精灵经验 +2，更新等级 ==========
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const newExp = (user.spiritExp || 0) + 2;          // 摇树经验 +2
    const newLevel = calcLevel(newExp);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { spiritExp: newExp, spiritLevel: newLevel }
    });
    // ====================================================

    const rendered = renderContent(note.content, note.contentType);

    if (req.query.format === 'json') {
      return res.json({
        note: {
          id: note.id,
          category: note.category,
          content: note.content,
          rendered: rendered,
          createdAt: note.createdAt
        }
      });
    }

    res.render("bottle", { note: { ...note, rendered }, error: null });
  });

// 回复纸团
router.post("/:id/reply", requireAuth, async (req, res) => {
    const noteId = Number(req.params.id);
    const { content } = req.body;

    if (!content) return res.json({ error: "回复不能为空～" });
    if (containsBannedWords(content)) return res.json({ error: "回复中含有不适宜内容" });

    const note = await prisma.note.findUnique({ where: { id: noteId } });
    if (!note || !note.allowReply) return res.json({ error: "该纸团不允许回复哦！" });

    await prisma.reply.create({
        data: {
            noteId: noteId,
            content: content,
            fromUserId: req.user.id
        }
    });

    // 推送通知给纸条主人（如果回复者不是主人）
    if (note.userId !== req.user.id) {
        try {
            io.to("user:" + String(note.userId)).emit("notification", {
                type: "NEW_REPLY",
                title: "你的纸团收到了一条新回复～",
                message: content.substring(0, 30) + (content.length > 30 ? "..." : ""),
                noteId: note.id,
                timestamp: new Date(),
                read: false
            });
        } catch (e) {
            console.error("推送通知失败:", e);
        }
    }

    res.json({ success: true });
});
  return router;
};